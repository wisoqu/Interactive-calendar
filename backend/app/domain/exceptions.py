class CalendarException(Exception):
    """Base exception for the Interactive Calendar domain."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


class EntityNotFoundException(CalendarException):
    """Raised when a requested domain entity cannot be retrieved."""
    pass


class InvalidCredentialsException(CalendarException):
    """Raised when user credentials fail to match."""
    pass


class PermissionDeniedException(CalendarException):
    """Raised when an operation is executed by a non-authorized role."""
    pass


class DuplicateEntityException(CalendarException):
    """Raised when an active constraint prevents creation of duplicate objects."""
    pass


class InvalidDomainStateException(CalendarException):
    """Raised when database or operational parameters fail domain validations (e.g., date starts_at > ends_at)."""
    pass
