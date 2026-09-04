from datetime import datetime
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    timestamp: datetime


class HealthDBResponse(BaseModel):
    status: str
    database: str
    connection: str
