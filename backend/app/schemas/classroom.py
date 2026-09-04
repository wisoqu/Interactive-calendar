from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ClassroomCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class ClassroomUpdateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class ClassroomJoinRequest(BaseModel):
    invite_code: str = Field(..., min_length=6, max_length=10)


class ClassroomResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    owner_id: str
    owner_username: str
    invite_code: str
    user_role: str
    created_at: datetime

    class Config:
        from_attributes = True


class ClassroomDeleteResponse(BaseModel):
    success: bool
    message: str
