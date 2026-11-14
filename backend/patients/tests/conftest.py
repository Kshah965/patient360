import os
import tempfile

os.environ.setdefault("OFFLINE", "1")  # read by safety.rx at import

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    """Fresh seeded DB per test module. Env is restored afterwards so other modules are unaffected."""
    old = os.environ.get("MEDPROFILE_DB")
    os.environ["MEDPROFILE_DB"] = os.path.join(tempfile.mkdtemp(), "patients_test.db")
    with TestClient(app) as c:  # runs lifespan -> init_db -> seed
        yield c
    if old is None:
        del os.environ["MEDPROFILE_DB"]
    else:
        os.environ["MEDPROFILE_DB"] = old
