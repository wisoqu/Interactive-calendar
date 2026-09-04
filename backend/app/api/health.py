from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.infrastructure.db.session import get_db
from app.schemas.health import HealthResponse, HealthDBResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=HealthResponse)
def health():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow()
    }


@router.get("/db", response_model=HealthDBResponse)
def health_db(db: Session = Depends(get_db)):
    try:
        # Resolve trivial query to verify active connectivity
        db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "postgresql_or_sqlite",
            "connection": "ok"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")
