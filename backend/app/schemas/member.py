from datetime import datetime
from pydantic import BaseModel, Field


class MemberAddRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    role: str = Field("member", pattern="^(admin|member)$")


class MemberUpdateRequest(BaseModel):
    role: str = Field(..., pattern="^(admin|member)$")


class MemberResponse(BaseModel):
    id: str
    user_id: str
    username: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


class MemberDeleteResponse(BaseModel):
    success: bool
    message: str
