from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class EventCreateRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=1000)
    starts_at: datetime
    ends_at: datetime


class EventUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=1000)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class EventResponse(BaseModel):
    id: str
    classroom_id: str
    creator_id: str
    creator_username: str
    title: str
    description: Optional[str] = None
    starts_at: datetime
    ends_at: datetime
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EventDeleteResponse(BaseModel):
    success: bool
    message: str
