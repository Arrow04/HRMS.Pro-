"""
HRMS AI Knowledge Base
Tenant-isolated RAG (Retrieval Augmented Generation) for HR documents and data
"""
import os
import json
import hashlib
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from enum import Enum
from dataclasses import dataclass

from hrms_ai.exceptions import AIKnowledgeBaseError


class KnowledgeType(str, Enum):
    DOCUMENT = "document"
    POLICY = "policy"
    SCHEMA = "schema"
    FAQ = "faq"
    PROCEDURE = "procedure"
    COMPLIANCE = "compliance"
    INDUSTRY_GUIDE = "industry_guide"


class KnowledgeSource(str, Enum):
    INTERNAL_DOC = "internal_doc"
    POLICY_MANUAL = "policy_manual"
    DB_SCHEMA = "db_schema"
    HR_HANDBOOK = "hr_handbook"
    GOVERNMENT_PORTAL = "government_portal"
    INDUSTRY_TEMPLATE = "industry_template"


@dataclass
class KnowledgeDocument:
    doc_id: str
    tenant_id: str
    doc_type: KnowledgeType
    source: KnowledgeSource
    title: str
    content: str
    metadata: Dict[str, Any]
    embedding: Optional[List[float]] = None
    created_at: str = ""
    updated_at: str = ""
    expires_at: Optional[str] = None


class HRMSKnowledgeBase:
    """
    Enterprise knowledge base with multi-tenant isolation
    Uses ChromaDB for vector storage when available, falls back to in-memory search
    """
    
    def __init__(
        self,
        redis_client=None,
        embedding_model=None,
        chroma_client=None,
    ):
        self.redis_client = redis_client
        self.embedding_model = embedding_model
        self.chroma_client = chroma_client
        
        # In-memory fallback stores
        self._documents: Dict[str, KnowledgeDocument] = {}
        self._tenant_docs: Dict[str, List[str]] = {}  # tenant_id -> [doc_ids]
        
        # Collection names per tenant
        self._collections: Dict[str, Any] = {}
    
    def _get_tenant_collection(self, tenant_id: str):
        """Get or create ChromaDB collection for tenant"""
        if not self.chroma_client:
            return None
        
        collection_name = f"hrms_ai_{tenant_id}"
        if collection_name not in self._collections:
            try:
                self._collections[collection_name] = self.chroma_client.get_or_create_collection(
                    name=collection_name,
                    metadata={"tenant_id": tenant_id}
                )
            except Exception:
                return None
        return self._collections[collection_name]
    
    def add_document(
        self,
        tenant_id: str,
        doc_type: KnowledgeType,
        source: KnowledgeSource,
        title: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        doc_id: Optional[str] = None,
        expires_at: Optional[str] = None,
    ) -> str:
        """Add a document to the tenant's knowledge base"""
        if doc_id is None:
            doc_id = hashlib.sha256(
                f"{tenant_id}:{doc_type.value}:{title}:{content[:100]}".encode()
            ).hexdigest()[:16]
        
        doc = KnowledgeDocument(
            doc_id=doc_id,
            tenant_id=tenant_id,
            doc_type=doc_type,
            source=source,
            title=title,
            content=content,
            metadata=metadata or {},
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat(),
            expires_at=expires_at,
        )
        
        # Store in memory
        self._documents[doc_id] = doc
        if tenant_id not in self._tenant_docs:
            self._tenant_docs[tenant_id] = []
        if doc_id not in self._tenant_docs[tenant_id]:
            self._tenant_docs[tenant_id].append(doc_id)
        
        # Store in ChromaDB if available
        collection = self._get_tenant_collection(tenant_id)
        if collection and self.embedding_model:
            try:
                embedding = self.embedding_model.encode(content).tolist()
                doc.embedding = embedding
                collection.add(
                    ids=[doc_id],
                    embeddings=[embedding],
                    documents=[content],
                    metadatas=[{
                        "doc_id": doc_id,
                        "doc_type": doc_type.value,
                        "source": source.value,
                        "title": title,
                        "tenant_id": tenant_id,
                        "created_at": doc.created_at,
                        **(metadata or {})
                    }]
                )
            except Exception:
                pass  # Fallback to in-memory only
        
        # Cache in Redis for fast access
        if self.redis_client:
            try:
                key = f"hrms_ai:kb:{tenant_id}:{doc_id}"
                self.redis_client.setex(
                    key,
                    86400 * 30,  # 30 days
                    json.dumps({
                        "doc_id": doc_id,
                        "doc_type": doc_type.value,
                        "source": source.value,
                        "title": title,
                        "content": content,
                        "metadata": metadata or {},
                        "created_at": doc.created_at,
                    })
                )
            except Exception:
                pass
        
        return doc_id
    
    def search(
        self,
        tenant_id: str,
        query: str,
        doc_types: Optional[List[KnowledgeType]] = None,
        sources: Optional[List[KnowledgeSource]] = None,
        n_results: int = 5,
        min_score: float = 0.5,
    ) -> List[Dict[str, Any]]:
        """
        Search the tenant's knowledge base
        Returns documents ranked by relevance
        """
        results = []
        
        # Try ChromaDB first
        collection = self._get_tenant_collection(tenant_id)
        if collection and self.embedding_model:
            try:
                query_embedding = self.embedding_model.encode(query).tolist()
                chroma_results = collection.query(
                    query_embeddings=[query_embedding],
                    n_results=n_results * 2,  # Get extra for filtering
                    include=["documents", "metadatas", "distances"]
                )
                
                if chroma_results and chroma_results.get('documents'):
                    for i, doc_text in enumerate(chroma_results['documents'][0]):
                        distance = chroma_results['distances'][0][i] if chroma_results.get('distances') else 1.0
                        metadata = chroma_results['metadatas'][0][i] if chroma_results.get('metadatas') else {}
                        
                        # Convert distance to similarity score (lower distance = higher similarity)
                        score = max(0.0, 1.0 - distance)
                        
                        if score >= min_score:
                            results.append({
                                "doc_id": metadata.get("doc_id"),
                                "title": metadata.get("title", ""),
                                "content": doc_text,
                                "score": score,
                                "doc_type": metadata.get("doc_type"),
                                "source": metadata.get("source"),
                                "metadata": {k: v for k, v in metadata.items() 
                                            if k not in ("doc_id", "doc_type", "source", "title", "tenant_id", "created_at", "content")},
                            })
            except Exception:
                pass
        
        # Fallback to in-memory search
        if not results:
            tenant_doc_ids = self._tenant_docs.get(tenant_id, [])
            query_lower = query.lower()
            query_words = set(query_lower.split())
            
            scored_docs = []
            for doc_id in tenant_doc_ids:
                doc = self._documents.get(doc_id)
                if not doc:
                    continue
                
                # Filter by type and source
                if doc_types and doc.doc_type not in doc_types:
                    continue
                if sources and doc.source not in sources:
                    continue
                
                # Simple scoring based on keyword overlap
                content_lower = doc.content.lower()
                title_lower = doc.title.lower()
                
                score = 0.0
                for word in query_words:
                    if word in title_lower:
                        score += 0.3
                    if word in content_lower:
                        score += 0.1
                
                # Normalize score
                score = min(score, 1.0)
                if score >= min_score:
                    scored_docs.append((score, doc))
            
            # Sort by score descending
            scored_docs.sort(key=lambda x: x[0], reverse=True)
            
            for score, doc in scored_docs[:n_results]:
                results.append({
                    "doc_id": doc.doc_id,
                    "title": doc.title,
                    "content": doc.content,
                    "score": score,
                    "doc_type": doc.doc_type.value,
                    "source": doc.source.value,
                    "metadata": doc.metadata,
                })
        
        return results[:n_results]
    
    def get_document(self, tenant_id: str, doc_id: str) -> Optional[KnowledgeDocument]:
        """Get a specific document"""
        # Verify tenant isolation
        tenant_docs = self._tenant_docs.get(tenant_id, [])
        if doc_id not in tenant_docs:
            return None
        
        return self._documents.get(doc_id)
    
    def delete_document(self, tenant_id: str, doc_id: str) -> bool:
        """Delete a document from tenant's knowledge base"""
        tenant_docs = self._tenant_docs.get(tenant_id, [])
        if doc_id not in tenant_docs:
            return False
        
        # Remove from memory
        self._documents.pop(doc_id, None)
        tenant_docs.remove(doc_id)
        
        # Remove from ChromaDB
        collection = self._get_tenant_collection(tenant_id)
        if collection:
            try:
                collection.delete(ids=[doc_id])
            except Exception:
                pass
        
        # Remove from Redis
        if self.redis_client:
            try:
                key = f"hrms_ai:kb:{tenant_id}:{doc_id}"
                self.redis_client.delete(key)
            except Exception:
                pass
        
        return True
    
    def list_documents(
        self,
        tenant_id: str,
        doc_type: Optional[KnowledgeType] = None,
        source: Optional[KnowledgeSource] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """List documents in tenant's knowledge base"""
        tenant_doc_ids = self._tenant_docs.get(tenant_id, [])
        docs = []
        
        for doc_id in tenant_doc_ids:
            doc = self._documents.get(doc_id)
            if not doc:
                continue
            
            if doc_type and doc.doc_type != doc_type:
                continue
            if source and doc.source != source:
                continue
            
            docs.append({
                "doc_id": doc.doc_id,
                "title": doc.title,
                "doc_type": doc.doc_type.value,
                "source": doc.source.value,
                "created_at": doc.created_at,
                "updated_at": doc.updated_at,
                "metadata": doc.metadata,
            })
        
        return docs[:limit]
    
    def index_db_schema(
        self,
        tenant_id: str,
        schema_info: Dict[str, Any],
    ) -> str:
        """
        Index database schema information for the tenant
        This helps the AI understand the data model and answer queries accurately
        """
        schema_content = json.dumps(schema_info, indent=2, default=str)
        return self.add_document(
            tenant_id=tenant_id,
            doc_type=KnowledgeType.SCHEMA,
            source=KnowledgeSource.DB_SCHEMA,
            title=f"Database Schema - {tenant_id}",
            content=schema_content,
            metadata={
                "schema_version": "1.0",
                "indexed_at": datetime.now().isoformat(),
                "table_count": len(schema_info.get("tables", [])),
            },
        )
    
    def index_hr_policies(
        self,
        tenant_id: str,
        policies: List[Dict[str, Any]],
    ) -> List[str]:
        """Index HR policies for a tenant"""
        doc_ids = []
        for policy in policies:
            doc_id = self.add_document(
                tenant_id=tenant_id,
                doc_type=KnowledgeType.POLICY,
                source=KnowledgeSource.POLICY_MANUAL,
                title=policy.get("title", "HR Policy"),
                content=policy.get("content", ""),
                metadata={
                    "policy_type": policy.get("type", "general"),
                    "effective_date": policy.get("effective_date", ""),
                    "version": policy.get("version", "1.0"),
                },
            )
            doc_ids.append(doc_id)
        return doc_ids
    
    def get_statistics(self, tenant_id: str) -> Dict[str, Any]:
        """Get knowledge base statistics for a tenant"""
        tenant_docs = self._tenant_docs.get(tenant_id, [])
        
        by_type = {}
        by_source = {}
        total_size = 0
        
        for doc_id in tenant_docs:
            doc = self._documents.get(doc_id)
            if not doc:
                continue
            
            by_type[doc.doc_type.value] = by_type.get(doc.doc_type.value, 0) + 1
            by_source[doc.source.value] = by_source.get(doc.source.value, 0) + 1
            total_size += len(doc.content)
        
        return {
            "tenant_id": tenant_id,
            "total_documents": len(tenant_docs),
            "by_type": by_type,
            "by_source": by_source,
            "total_size_bytes": total_size,
            "total_size_kb": round(total_size / 1024, 2),
        }
    
    def clear_tenant(self, tenant_id: str):
        """Clear all documents for a tenant"""
        tenant_docs = self._tenant_docs.get(tenant_id, [])
        for doc_id in tenant_docs:
            self._documents.pop(doc_id, None)
        
        self._tenant_docs[tenant_id] = []
        
        # Clear ChromaDB collection
        collection = self._get_tenant_collection(tenant_id)
        if collection:
            try:
                # ChromaDB doesn't have a direct clear, delete and recreate
                collection_name = f"hrms_ai_{tenant_id}"
                if collection_name in self._collections:
                    del self._collections[collection_name]
            except Exception:
                pass
        
        # Clear Redis keys
        if self.redis_client:
            try:
                pattern = f"hrms_ai:kb:{tenant_id}:*"
                keys = self.redis_client.keys(pattern)
                if keys:
                    self.redis_client.delete(*keys)
            except Exception:
                pass


# Global knowledge base instance
_knowledge_base: Optional[HRMSKnowledgeBase] = None


def refresh_org_ai_index(db, org_id) -> Dict[str, Any]:
    """Live index refresh — the AI learns org changes instantly.

    Called on employee onboarding (and safe to re-run any time): indexes
    the employee directory and leave types into the tenant knowledge base
    with deterministic doc ids, so re-indexing UPDATES rather than
    duplicates. The analyst still queries the live DB per question; this
    index feeds the retrieval-enhanced conversational path.
    """
    result = {"employees_indexed": 0, "leave_types_indexed": 0}
    if not org_id:
        return result
    kb = get_knowledge_base()
    tenant = str(org_id)
    try:
        from models import Employee, LeaveType
        employees = db.query(Employee).filter(
            Employee.organization_id == org_id,
            Employee.deleted_at.is_(None),
            Employee.status == "active",
        ).limit(1000).all()
        for emp in employees:
            name = f"{emp.first_name or ''} {emp.last_name or ''}".strip()
            kb.add_document(
                tenant_id=tenant,
                doc_type=KnowledgeType.DOCUMENT,
                source=KnowledgeSource.INTERNAL_DOC,
                title=f"Employee: {name}",
                content=(
                    f"{name} | code: {emp.employee_code or '—'} | "
                    f"designation: {emp.designation or '—'} | "
                    f"email: {emp.email or '—'} | status: {emp.status}"
                ),
                metadata={"employee_id": emp.id, "kind": "employee"},
                doc_id=f"emp_{emp.id}",
            )
            result["employees_indexed"] += 1
        leave_types = db.query(LeaveType).filter(
            LeaveType.organization_id == org_id,
            LeaveType.status == "active",
        ).all()
        for lt in leave_types:
            kb.add_document(
                tenant_id=tenant,
                doc_type=KnowledgeType.POLICY,
                source=KnowledgeSource.HR_HANDBOOK,
                title=f"Leave Policy — {lt.name}",
                content=(
                    f"Leave type: {lt.name} (code {lt.code}). "
                    f"Days per year: {lt.days_allowed}. "
                    f"Paid: {lt.is_paid}. Encashable: {lt.is_encashable}."
                ),
                metadata={"leave_type_id": lt.id, "kind": "leave_type"},
                doc_id=f"leave_type_{lt.id}",
            )
            result["leave_types_indexed"] += 1
    except Exception:
        pass
    return result


def get_knowledge_base() -> HRMSKnowledgeBase:
    """Get the global knowledge base instance"""
    global _knowledge_base
    if _knowledge_base is None:
        _knowledge_base = HRMSKnowledgeBase()
    return _knowledge_base


def init_knowledge_base(
    redis_client=None,
    embedding_model=None,
    chroma_client=None,
) -> HRMSKnowledgeBase:
    """Initialize the global knowledge base with dependencies"""
    global _knowledge_base
    _knowledge_base = HRMSKnowledgeBase(
        redis_client=redis_client,
        embedding_model=embedding_model,
        chroma_client=chroma_client,
    )
    return _knowledge_base
