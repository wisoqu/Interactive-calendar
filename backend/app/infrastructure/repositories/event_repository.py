from typing import List, Optional
from sqlalchemy.orm import Session
from app.infrastructure.db.models import Event


class EventRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, event_id: str) -> Optional[Event]:
        return self.db.query(Event).filter(Event.id == event_id).first()

    def list_by_classroom_id(self, classroom_id: str) -> List[Event]:
        return (
            self.db.query(Event)
            .filter(Event.classroom_id == classroom_id)
            .order_by(Event.starts_at.asc())
            .all()
        )

    def save(self, event: Event) -> Event:
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def delete(self, event_id: str) -> bool:
        event = self.get_by_id(event_id)
        if event:
            self.db.delete(event)
            self.db.commit()
            return True
        return False
