"""
Base Repository - implements Repository pattern for data access
Follows Single Responsibility Principle (SRP) - each repo handles one entity
"""

from typing import TypeVar, Generic, List, Optional, Type, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc
from database import Base

T = TypeVar('T', bound=Base)

class BaseRepository(Generic[T]):
    """
    Generic repository providing CRUD operations
    All entity repositories inherit from this
    """
    
    def __init__(self, model: Type[T], db: Session):
        self.model = model
        self.db = db
    
    def get_by_id(self, id: int) -> Optional[T]:
        """Get single entity by ID"""
        return self.db.query(self.model).filter(self.model.id == id).first()
    
    def get_all(self, skip: int = 0, limit: int = 100) -> List[T]:
        """Get all entities with pagination"""
        return self.db.query(self.model).offset(skip).limit(limit).all()
    
    def get_by_field(self, field: str, value: Any) -> List[T]:
        """Get entities by any field value"""
        return self.db.query(self.model).filter(getattr(self.model, field) == value).all()
    
    def get_first_by_field(self, field: str, value: Any) -> Optional[T]:
        """Get first entity matching field value"""
        return self.db.query(self.model).filter(getattr(self.model, field) == value).first()
    
    def create(self, entity: T) -> T:
        """Create new entity"""
        self.db.add(entity)
        self.db.commit()
        self.db.refresh(entity)
        return entity
    
    def update(self, entity: T, data: dict) -> T:
        """Update entity with provided data"""
        for key, value in data.items():
            if hasattr(entity, key) and value is not None:
                setattr(entity, key, value)
        self.db.commit()
        self.db.refresh(entity)
        return entity
    
    def delete(self, id: int) -> bool:
        """Delete entity by ID"""
        entity = self.get_by_id(id)
        if entity:
            self.db.delete(entity)
            self.db.commit()
            return True
        return False
    
    def exists(self, id: int) -> bool:
        """Check if entity exists"""
        return self.db.query(self.model).filter(self.model.id == id).first() is not None
    
    def count(self) -> int:
        """Get total count"""
        return self.db.query(self.model).count()


class RepositoryFactory:
    """
    Factory pattern for creating repositories
    Ensures single instance per request
    """
    
    def __init__(self, db: Session):
        self.db = db
        self._repositories = {}
    
    def get_repository(self, model_class: Type[T]) -> BaseRepository[T]:
        """Get or create repository for model"""
        if model_class not in self._repositories:
            self._repositories[model_class] = BaseRepository(model_class, self.db)
        return self._repositories[model_class]
