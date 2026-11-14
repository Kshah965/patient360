import asyncio
import copy
import json
import sqlite3

import httpx
from fastapi import FastAPI

from explanations.routes import router, synthetic_allowed
from patients import repo
from patients.db import SCHEMA, get_conn, load_seed


def test_routes_use_owned_check_logs_and_unchanged_synthetic_gate(monkeypatch):
    monkeypatch.setenv('LLM_ENABLED', '1')
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    conn = sqlite3.connect(':memory:', check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA.read_text())
    load_seed(conn)
    pid = 'SYN-1002'
    patient = repo.get_patient(conn, pid)
    assert synthetic_allowed(conn, pid, patient)
    changed = copy.deepcopy(patient); changed['history'] = ['Unapproved data']
    assert not synthetic_allowed(conn, pid, changed)
    alerts = [{'verified': True, 'explanation': 'Stored deterministic fact', 'source': 'Stored source'}, {'verified': False, 'explanation': 'Unverified', 'source': 'TODO'}]
    check_id = repo.log_check(conn, pid, {'drug': 'ibuprofen', 'total_found': 2, 'shown': 1, 'alerts': alerts})
    original = conn.execute('SELECT alerts_json FROM interaction_results WHERE id=?', (check_id,)).fetchone()[0]
    app = FastAPI(); app.include_router(router)
    def db(): yield conn
    app.dependency_overrides[get_conn] = db
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            response = await client.post(f'/patients/{pid}/explanations/safety', json={'check_id': check_id})
            assert response.status_code == 200
            data = response.json()
            assert data['mode'] == 'template' and data['reason'] == 'missing-key'
            assert data['items'][0]['text'] == 'Stored deterministic fact'
            assert data['omitted_unverified'] == 1
            assert (await client.post('/patients/SYN-1001/explanations/safety', json={'check_id': check_id})).status_code == 404
            assert (await client.post(f'/patients/{pid}/explanations/safety', json={'check_id': check_id, 'alerts': alerts})).status_code == 422
            summary = (await client.post(f'/patients/{pid}/explanations/summary')).json()
            assert summary['mode'] == 'template'
            assert any('Warfarin' in i['text'] for i in summary['items'])
            assert not any('Sertraline' in i['text'] for i in summary['items'])
            assert (await client.post('/patients/missing/explanations/summary')).status_code == 404
    asyncio.run(run())
    assert conn.execute('SELECT alerts_json FROM interaction_results WHERE id=?', (check_id,)).fetchone()[0] == original
    conn.close()
