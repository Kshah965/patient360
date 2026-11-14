"""All reads and writes of the patient tables.

Every way of adding a patient (seed file, POST /patients, Synthea import)
goes through create_patient, so the rules live in one place.
"""
import json
from datetime import date

from .critical import critical_alerts
from .models import ConditionIn, HistoryIn, PatientIn

SECTIONS = ("medications", "conditions", "history", "encounters")

# vitals object key -> (observation name, unit)
VITAL_FIELDS = {
    "bloodPressure": ("blood_pressure", "mmHg"),
    "heartRate": ("heart_rate", "bpm"),
    "temperatureC": ("temperature_c", "°C"),
    "oxygenSaturation": ("oxygen_saturation", "%"),
}
NOT_RECORDED = "Not recorded"


class DuplicatePatientError(Exception):
    pass


def _fmt_number(n):
    return str(int(n)) if float(n).is_integer() else str(n)


def _age(dob, today=None):
    today = today or date.today()
    y, m, d = map(int, dob.split("-"))
    return today.year - y - ((today.month, today.day) < (m, d))


# ---------- writes ----------

def next_patient_id(conn):
    nums = [int(r[0][4:]) for r in conn.execute("SELECT id FROM patients WHERE id LIKE 'SYN-%'")
            if r[0][4:].isdigit()]
    return f"SYN-{max(nums, default=1000) + 1:04d}"


def create_patient(conn, record, source="api"):
    """Insert a patient and all child rows. Caller owns the transaction. Returns the id."""
    p = record if isinstance(record, PatientIn) else PatientIn.model_validate(record)
    pid = p.id or next_patient_id(conn)
    if conn.execute("SELECT 1 FROM patients WHERE id = ?", (pid,)).fetchone():
        raise DuplicatePatientError(pid)

    unavailable = [s for s in SECTIONS if getattr(p, s) is None]
    conn.execute(
        "INSERT INTO patients (id, name, date_of_birth, sex, allergy_status, unavailable, source, fhir_id)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (pid, p.name, p.dateOfBirth, p.sex, p.allergies.status, json.dumps(unavailable), source, p.fhirId),
    )
    conn.executemany(
        "INSERT INTO allergies (patient_id, allergen, reaction, severity) VALUES (?, ?, ?, ?)",
        [(pid, a.substance, a.reaction, a.severity) for a in p.allergies.items],
    )
    conn.executemany(
        "INSERT INTO medications (patient_id, name, rxcui, dose, frequency, status, started_on)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        [(pid, m.name, m.rxcui, m.dose, m.frequency, m.status, m.startedOn) for m in p.medications or []],
    )
    conditions = [c if isinstance(c, ConditionIn) else ConditionIn(name=c) for c in p.conditions or []]
    conn.executemany(
        "INSERT INTO conditions (patient_id, name, status, onset_date, code) VALUES (?, ?, ?, ?, ?)",
        [(pid, c.name, c.status, c.onsetDate, c.code) for c in conditions],
    )
    history = [h if isinstance(h, HistoryIn) else HistoryIn(description=h) for h in p.history or []]
    conn.executemany(
        "INSERT INTO history (patient_id, description, occurred_on) VALUES (?, ?, ?)",
        [(pid, h.description, h.occurredOn) for h in history],
    )
    conn.executemany(
        "INSERT INTO encounters (patient_id, date, reason, outcome) VALUES (?, ?, ?, ?)",
        [(pid, e.date, e.reason, e.outcome) for e in p.encounters or []],
    )

    observations = [(o.recordedAt, o.category, o.name, o.value, o.unit) for o in p.observations]
    if p.vitals:
        for key, (name, unit) in VITAL_FIELDS.items():
            value = getattr(p.vitals, key)
            if value is None:
                continue
            if key == "bloodPressure":
                value = value.replace("mmHg", "").strip()
            else:
                value = _fmt_number(value)
            observations.append((p.vitals.recordedAt, "vital", name, value, unit))
    conn.executemany(
        "INSERT INTO observations (patient_id, recorded_at, category, name, value, unit)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        [(pid, *o) for o in observations],
    )
    return pid


def log_check(conn, patient_id, result):
    """Store one /check result. Silently skips patients not in the table (e.g. the 'demo' fixture)."""
    if not conn.execute("SELECT 1 FROM patients WHERE id = ?", (patient_id,)).fetchone():
        return
    conn.execute(
        "INSERT INTO interaction_results (patient_id, drug, total_found, shown, alerts_json)"
        " VALUES (?, ?, ?, ?, ?)",
        (patient_id, result["drug"], result["total_found"], result["shown"], json.dumps(result["alerts"])),
    )


# ---------- reads ----------

def _rows(conn, sql, pid):
    return conn.execute(sql, (pid,)).fetchall()


def _vitals(vital_rows):
    """Latest reading of each vital. The frontend type needs all four, so partial sets give None."""
    latest = {}
    for r in vital_rows:  # newest first
        latest.setdefault(r["name"], r)
    if not all(name in latest for name, _ in VITAL_FIELDS.values()):
        return None
    bp = latest["blood_pressure"]
    return {
        "recordedAt": max(r["recorded_at"] for r in latest.values())[:10],
        "bloodPressure": f"{bp['value']} {bp['unit'] or 'mmHg'}",
        "heartRate": float(latest["heart_rate"]["value"]),
        "temperatureC": float(latest["temperature_c"]["value"]),
        "oxygenSaturation": float(latest["oxygen_saturation"]["value"]),
    }


def get_patient(conn, pid):
    """Full record in the frontend Patient shape, plus observations and criticalAlerts. None if unknown."""
    p = conn.execute("SELECT * FROM patients WHERE id = ?", (pid,)).fetchone()
    if not p:
        return None
    unavailable = set(json.loads(p["unavailable"]))

    allergies = _rows(conn, "SELECT * FROM allergies WHERE patient_id = ? ORDER BY id", pid)
    meds = _rows(conn, "SELECT * FROM medications WHERE patient_id = ? AND status = 'active' ORDER BY id", pid)
    conditions = _rows(conn, "SELECT name FROM conditions WHERE patient_id = ? AND status = 'active' ORDER BY id", pid)
    history = _rows(conn, "SELECT description FROM history WHERE patient_id = ? ORDER BY id", pid)
    encounters = _rows(conn, "SELECT * FROM encounters WHERE patient_id = ? ORDER BY date DESC, id", pid)
    observations = _rows(conn, "SELECT * FROM observations WHERE patient_id = ? ORDER BY recorded_at DESC, id DESC", pid)

    def section(name, items):
        return None if name in unavailable else items

    return {
        "id": p["id"],
        "name": p["name"],
        "dateOfBirth": p["date_of_birth"],
        "sex": p["sex"],
        "allergies": {
            "status": p["allergy_status"],
            "items": [{"substance": a["allergen"], "reaction": a["reaction"] or "Reaction not recorded"}
                      for a in allergies],
        },
        "medications": section("medications", [
            {"name": m["name"], "dose": m["dose"] or NOT_RECORDED, "frequency": m["frequency"] or NOT_RECORDED}
            for m in meds]),
        "conditions": section("conditions", [c["name"] for c in conditions]),
        "history": section("history", [h["description"] for h in history]),
        "encounters": section("encounters", [
            {"date": e["date"], "reason": e["reason"], "outcome": e["outcome"] or "Outcome not recorded"}
            for e in encounters]),
        "vitals": _vitals([o for o in observations if o["category"] == "vital"]),
        "observations": [
            {"recordedAt": o["recorded_at"], "category": o["category"], "name": o["name"],
             "value": o["value"], "unit": o["unit"]}
            for o in observations],
        "criticalAlerts": critical_alerts(p["allergy_status"], allergies, meds, unavailable),
    }


def _indicator(patient):
    if patient["criticalAlerts"]:
        return patient["criticalAlerts"][0]["message"]
    return {"documented": "Documented allergies", "unknown": "Allergy status unknown"}.get(
        patient["allergies"]["status"], "No known allergies")


def list_patients(conn, q=""):
    """Directory rows. Empty q returns everyone; otherwise partial, case-insensitive match on name or id."""
    term = f"%{q.strip().lower()}%"
    ids = [r[0] for r in conn.execute(
        "SELECT id FROM patients WHERE lower(name) LIKE ? OR lower(id) LIKE ? ORDER BY id", (term, term))]
    out = []
    for pid in ids:
        p = get_patient(conn, pid)
        out.append({"id": p["id"], "name": p["name"], "dateOfBirth": p["dateOfBirth"],
                    "sex": p["sex"], "indicator": _indicator(p)})
    return out


def get_patient_for_check(conn, pid):
    """Shape the safety engine expects (see safety/routes.py). None if unknown."""
    p = conn.execute("SELECT date_of_birth, allergy_status FROM patients WHERE id = ?", (pid,)).fetchone()
    if not p:
        return None
    meds = _rows(conn, "SELECT name, rxcui, status FROM medications WHERE patient_id = ? ORDER BY id", pid)
    allergies = _rows(conn, "SELECT allergen, severity FROM allergies WHERE patient_id = ? ORDER BY id", pid)
    return {
        "id": pid,
        "age": _age(p["date_of_birth"]),
        "allergy_status": p["allergy_status"],
        "medications": [dict(m) for m in meds],
        "allergies": [dict(a) for a in allergies],
    }
