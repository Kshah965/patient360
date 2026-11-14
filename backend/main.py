"""patient360 API: patient record + medication safety check on one SQLite file.

From backend/:  uvicorn main:app --reload    then open http://127.0.0.1:8000/docs
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from patients.db import init_db
from patients.routes import router as patients_router
from safety.routes import router as safety_router


@asynccontextmanager
async def lifespan(app):
    init_db()  # create tables; seed if there are no patients yet
    yield


app = FastAPI(title="patient360", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(patients_router)
app.include_router(safety_router)
