from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.api.auth import get_current_user
from app.application.services.event_service import EventService
from app.infrastructure.db.session import get_db
from app.schemas.event import (
    EventCreateRequest,
    EventUpdateRequest,
    EventResponse,
    EventDeleteResponse
)
from app.domain.exceptions import CalendarException, EntityNotFoundException

router = APIRouter(prefix="/classrooms/{classroom_id}/events", tags=["events"])


@router.get("", response_model=List[EventResponse])
def list_events(classroom_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        service = EventService(db)
        return service.list_classroom_events(current_user.id, classroom_id)
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
def create_event(
    classroom_id: str,
    payload: EventCreateRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        service = EventService(db)
        return service.create_event(
            current_user.id,
            classroom_id,
            payload.title,
            payload.starts_at,
            payload.ends_at,
            payload.description
        )
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)


@router.get("/{event_id}", response_model=EventResponse)
def get_event(classroom_id: str, event_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        service = EventService(db)
        return service.get_event_details(current_user.id, classroom_id, event_id)
    except EntityNotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=e.message)


@router.patch("/{event_id}", response_model=EventResponse)
def update_event(
    classroom_id: str,
    event_id: str,
    payload: EventUpdateRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        service = EventService(db)
        return service.update_event(
            current_user.id,
            classroom_id,
            event_id,
            payload.title,
            payload.description,
            payload.starts_at,
            payload.ends_at
        )
    except EntityNotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)


@router.delete("/{event_id}", response_model=EventDeleteResponse)
def delete_event(classroom_id: str, event_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        service = EventService(db)
        service.delete_event(current_user.id, classroom_id, event_id)
        return {"success": True, "message": "Event deleted successfully."}
    except EntityNotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)
    except CalendarException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message)
