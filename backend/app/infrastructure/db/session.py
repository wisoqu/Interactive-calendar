import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.infrastructure.db.models import Base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./calendar.db")

# For SQLite, enable multi-threading check bypass in local dev
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initializes schema immediately in SQLite development mode."""
    if DATABASE_URL.startswith("sqlite"):
        Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
