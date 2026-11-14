"""Standalone app so Person B can run /check before Person A's main app exists.

From the backend/ folder:  uvicorn safety.dev_app:app --reload
Then open http://127.0.0.1:8000/docs
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router

app = FastAPI(title="patient360 safety engine (dev)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(router)
