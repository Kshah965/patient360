"""Shared test setup for every package under backend/.

Runs before any test module imports the app. safety.engine and safety.rx open their
SQLite files at import time, so the env vars below must be set first: the engine
then uses an empty temp DB (no DDInter, curated tables only) and an empty RxNorm
cache, matching what safety/tests expects, whatever order pytest collects modules in.
"""
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="patient360-tests-")
os.environ.setdefault("OFFLINE", "1")
os.environ.setdefault("DRUG_INFO_LLM", "0")  # never call Claude from tests
os.environ["MEDPROFILE_DB"] = os.path.join(_tmp, "engine.db")
os.environ["RX_CACHE_DB"] = os.path.join(_tmp, "rx_cache.db")

import pytest  # noqa: E402


@pytest.fixture(scope="module")
def client():
    """Fresh seeded patient DB per test module, restored afterwards."""
    from fastapi.testclient import TestClient

    from main import app

    old = os.environ["MEDPROFILE_DB"]
    os.environ["MEDPROFILE_DB"] = os.path.join(tempfile.mkdtemp(dir=_tmp), "patients.db")
    with TestClient(app) as c:  # runs lifespan -> init_db -> seed
        yield c
    os.environ["MEDPROFILE_DB"] = old
