from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.api.auth import get_current_user
from app.application.services.classroom_service import ClassroomService
from app.infrastructure.db.session import get_db
from app.schemas.classroom import (
    ClassroomCreateRequest,
    ClassroomUpdateRequest,
    ClassroomJoinRequest,
    ClassroomResponse,
    ClassroomDeleteResponse
)
from app.domain.exceptions import CalendarException

router = APIRouter(prefix="/classrooms", tags=["classrooms"])


@router.get("", response_model=List[ClassroomResponse])
def list_classrooms(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        service = ClassroomService(db)
        return service.list_user_classrooms(current_user.id)
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)


@router.post("", response_model=ClassroomResponse, status_code=status.HTTP_201_CREATED)
def create_classroom(payload: ClassroomCreateRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        service = ClassroomService(db)
        classroom = service.create_classroom(current_user.id, payload.name, payload.description)

        # Retrieve direct structural layout with contextual display mappings
        return service.get_classroom_details(current_user.id, classroom.id)
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)


@router.post("/join", response_model=ClassroomResponse)
def join_classroom(payload: ClassroomJoinRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        service = ClassroomService(db)
        classroom = service.join_by_code(current_user.id, payload.invite_code)
        return service.get_classroom_details(current_user.id, classroom.id)
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)


@router.get("/{classroom_id}", response_model=ClassroomResponse)
def get_classroom(classroom_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        service = ClassroomService(db)
        return service.get_classroom_details(current_user.id, classroom_id)
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)


@router.patch("/{classroom_id}", response_model=ClassroomResponse)
def update_classroom(
    classroom_id: str,
    payload: ClassroomUpdateRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        service = ClassroomService(db)
        service.update_classroom(current_user.id, classroom_id, payload.name, payload.description)
        return service.get_classroom_details(current_user.id, classroom_id)
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=e.message)


@router.delete("/{classroom_id}", response_model=ClassroomDeleteResponse)
def delete_classroom(classroom_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        service = ClassroomService(db)
        service.delete_classroom(current_user.id, classroom_id)
        return {"success": True, "message": "Classroom deleted successfully."}
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=e.message)
