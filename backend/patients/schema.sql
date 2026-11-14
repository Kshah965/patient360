-- Patient record tables. Safe to run on every startup.
-- Dates are YYYY-MM-DD text. Age is derived from date_of_birth, never stored.
-- drug_interactions lives in the same file but is owned by safety/scripts/load_ddinter.py.

CREATE TABLE IF NOT EXISTS patients (
  id             TEXT PRIMARY KEY,             -- 'SYN-1001', stable, shown in the UI
  name           TEXT NOT NULL,
  date_of_birth  TEXT NOT NULL,
  sex            TEXT,                         -- NULL = not recorded
  allergy_status TEXT NOT NULL DEFAULT 'unknown'
                 CHECK (allergy_status IN ('documented', 'none-known', 'unknown')),
  unavailable    TEXT NOT NULL DEFAULT '[]',   -- JSON list of sections with no data on file:
                                               -- medications | conditions | history | encounters
  source         TEXT NOT NULL DEFAULT 'seed', -- 'seed' | 'api' | 'synthea'
  fhir_id        TEXT                          -- Synthea Patient.id when imported
);

CREATE TABLE IF NOT EXISTS medications (
  id         INTEGER PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,                    -- display name, 'Warfarin'
  rxcui      TEXT,                             -- RxNorm code (Synthea has it; seed may be NULL)
  dose       TEXT,
  frequency  TEXT,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stopped')),
  started_on TEXT
);

CREATE TABLE IF NOT EXISTS allergies (
  id         INTEGER PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  allergen   TEXT NOT NULL,
  reaction   TEXT,
  severity   TEXT CHECK (severity IN ('high', 'low'))  -- NULL = not assessed
);

CREATE TABLE IF NOT EXISTS conditions (
  id         INTEGER PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  onset_date TEXT,
  code       TEXT                              -- SNOMED code from Synthea, optional
);

CREATE TABLE IF NOT EXISTS history (
  id          INTEGER PRIMARY KEY,
  patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  occurred_on TEXT
);

CREATE TABLE IF NOT EXISTS encounters (
  id         INTEGER PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  reason     TEXT NOT NULL,
  outcome    TEXT
);

-- Vitals and labs, one row per reading, so new readings never overwrite old ones.
CREATE TABLE IF NOT EXISTS observations (
  id          INTEGER PRIMARY KEY,
  patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('vital', 'lab')),
  name        TEXT NOT NULL,                   -- blood_pressure | heart_rate | temperature_c |
                                               -- oxygen_saturation | inr | ...
  value       TEXT NOT NULL,                   -- '118/76', '88', '2.6'
  unit        TEXT
);

-- Log of each POST /patients/{id}/check call.
CREATE TABLE IF NOT EXISTS interaction_results (
  id          INTEGER PRIMARY KEY,
  patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  drug        TEXT NOT NULL,
  total_found INTEGER NOT NULL,
  shown       INTEGER NOT NULL,
  alerts_json TEXT NOT NULL,
  checked_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_medications_patient  ON medications(patient_id);
CREATE INDEX IF NOT EXISTS ix_allergies_patient    ON allergies(patient_id);
CREATE INDEX IF NOT EXISTS ix_conditions_patient   ON conditions(patient_id);
CREATE INDEX IF NOT EXISTS ix_history_patient      ON history(patient_id);
CREATE INDEX IF NOT EXISTS ix_encounters_patient   ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS ix_observations_patient ON observations(patient_id);
CREATE INDEX IF NOT EXISTS ix_results_patient      ON interaction_results(patient_id);
