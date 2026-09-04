from datetime import datetime
import secrets
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.domain.exceptions import (
    EntityNotFoundException,
    PermissionDeniedException,
    InvalidDomainStateException
)
from app.domain.policies.permission_policy import PermissionPolicy
from app.infrastructure.db.models import Event, ClassMember
from app.infrastructure.repositories.event_repository import EventRepository
from app.infrastructure.repositories.member_repository import MemberRepository
from app.infrastructure.repositories.user_repository import UserRepository


class EventService:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = EventRepository(db)
        self.member_repo = MemberRepository(db)
        self.user_repo = UserRepository(db)

    def list_classroom_events(self, user_id: str, classroom_id: str) -> List[Dict[str, Any]]:
        # User must belong to classroom to list events
        mem = self.member_repo.get_by_user_and_classroom(user_id, classroom_id)
        if not mem:
            raise PermissionDeniedException("You are not a member of this classroom")

        events = self.event_repo.list_by_classroom_id(classroom_id)
        result = []
        for ev in events:
            creator_u = self.user_repo.get_by_id(ev.creator_id)
            result.append({
                "id": ev.id,
                "classroom_id": ev.classroom_id,
                "creator_id": ev.creator_id,
                "creator_username": creator_u.username if creator_u else "unknown",
                "title": ev.title,
                "description": ev.description,
                "starts_at": ev.starts_at,
                "ends_at": ev.ends_at,
                "created_at": ev.created_at,
                "updated_at": ev.updated_at,
            })
        return result

    def get_event_details(self, user_id: str, classroom_id: str, event_id: str) -> Dict[str, Any]:
        mem = self.member_repo.get_by_user_and_classroom(user_id, classroom_id)
        if not mem:
            raise PermissionDeniedException("You are not a member of this classroom")

        ev = self.event_repo.get_by_id(event_id)
        if not ev or ev.classroom_id != classroom_id:
            raise EntityNotFoundException("Event not found or is outside classroom boundaries")

        creator_u = self.user_repo.get_by_id(ev.creator_id)
        return {
            "id": ev.id,
            "classroom_id": ev.classroom_id,
            "creator_id": ev.creator_id,
            "creator_username": creator_u.username if creator_u else "unknown",
            "title": ev.title,
            "description": ev.description,
            "starts_at": ev.starts_at,
            "ends_at": ev.ends_at,
            "created_at": ev.created_at,
            "updated_at": ev.updated_at,
        }

    def create_event(
        self,
        user_id: str,
        classroom_id: str,
        title: str,
        starts_at: datetime,
        ends_at: datetime,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        mem = self.member_repo.get_by_user_and_classroom(user_id, classroom_id)
        if not mem or not PermissionPolicy.can_manage_events(mem.role):
            raise PermissionDeniedException("Only classroom owners and admins can create events")

        if ends_at <= starts_at:
            raise InvalidDomainStateException("Event end time must be strictly after the start time")

        event_id = "ev_" + secrets.token_hex(8)
        new_event = Event(
            id=event_id,
            classroom_id=classroom_id,
            creator_id=user_id,
            title=title,
            description=description,
            starts_at=starts_at,
            ends_at=ends_at
        )
        saved = self.event_repo.save(new_event)

        creator_u = self.user_repo.get_by_id(user_id)
        return {
            "id": saved.id,
            "classroom_id": saved.classroom_id,
            "creator_id": saved.creator_id,
            "creator_username": creator_u.username if creator_u else "unknown",
            "title": saved.title,
            "description": saved.description,
            "starts_at": saved.starts_at,
            "ends_at": saved.ends_at,
            "created_at": saved.created_at,
            "updated_at": saved.updated_at,
        }

    def update_event(
        self,
        user_id: str,
        classroom_id: str,
        event_id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        starts_at: Optional[datetime] = None,
        ends_at: Optional[datetime] = None
    ) -> Dict[str, Any]:
        mem = self.member_repo.get_by_user_and_classroom(user_id, classroom_id)
        if not mem or not PermissionPolicy.can_manage_events(mem.role):
            raise PermissionDeniedException("Only classroom owners and admins can update events")

        ev = self.event_repo.get_by_id(event_id)
        if not ev or ev.classroom_id != classroom_id:
            raise EntityNotFoundException("Event not found")

        if title is not None:
            ev.title = title
        if description is not None:
            ev.description = description

        applied_starts = starts_at if starts_at is not None else ev.starts_at
        applied_ends = ends_at if ends_at is not None else ev.ends_at

        if applied_ends <= applied_starts:
            raise InvalidDomainStateException("Event end time must be strictly after the start time")

        if starts_at is not None:
            ev.starts_at = starts_at
        if ends_at is not None:
            ev.ends_at = ends_at

        saved = self.event_repo.save(ev)
        creator_u = self.user_repo.get_by_id(saved.creator_id)

        return {
            "id": saved.id,
            "classroom_id": saved.classroom_id,
            "creator_id": saved.creator_id,
            "creator_username": creator_u.username if creator_u else "unknown",
            "title": saved.title,
            "description": saved.description,
            "starts_at": saved.starts_at,
            "ends_at": saved.ends_at,
            "created_at": saved.created_at,
            "updated_at": saved.updated_at,
        }

    def delete_event(self, user_id: str, classroom_id: str, event_id: str) -> None:
        mem = self.member_repo.get_by_user_and_classroom(user_id, classroom_id)
        if not mem or not PermissionPolicy.can_manage_events(mem.role):
            raise PermissionDeniedException("Only classroom owners and admins can delete events")

        ev = self.event_repo.get_by_id(event_id)
        if not ev or ev.classroom_id != classroom_id:
            raise EntityNotFoundException("Event not found")

        self.event_repo.delete(event_id)
