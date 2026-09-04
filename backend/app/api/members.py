from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.api.auth import get_current_user
from app.application.services.member_service import MemberService
from app.infrastructure.db.session import get_db
from app.schemas.member import (
    MemberAddRequest,
    MemberUpdateRequest,
    MemberResponse,
    MemberDeleteResponse
)
from app.domain.exceptions import CalendarException, EntityNotFoundException

router = APIRouter(prefix="/classrooms/{classroom_id}/members", tags=["members"])


@router.get("", response_model=List[MemberResponse])
def list_members(classroom_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        service = MemberService(db)
        return service.list_classroom_members(current_user.id, classroom_id)
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)


@router.post("", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
def add_member(
    classroom_id: str,
    payload: MemberAddRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        service = MemberService(db)
        return service.add_member_by_username(current_user.id, classroom_id, payload.username, payload.role)
    except EntityNotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)


@router.patch("/{member_id}", response_model=MemberResponse)
def update_member_role(
    classroom_id: str,
    member_id: str,
    payload: MemberUpdateRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        service = MemberService(db)
        return service.update_member_role(current_user.id, classroom_id, member_id, payload.role)
    except EntityNotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)


@router.delete("/{member_id}", response_model=MemberDeleteResponse)
def remove_member(
    classroom_id: str,
    member_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        service = MemberService(db)
        service.remove_member(current_user.id, classroom_id, member_id)
        return {"success": True, "message": "Member removed/left successfully."}
    except EntityNotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)
