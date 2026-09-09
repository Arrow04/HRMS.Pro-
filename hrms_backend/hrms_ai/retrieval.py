"""
Local Retrieval Engine for HRMS AI
Keyword + template based retrieval without external APIs
"""
import re
import json
from typing import List, Dict, Any, Optional
from collections import Counter

from hrms_ai.knowledge import get_knowledge_base, KnowledgeType, KnowledgeSource


class LocalRetrievalEngine:
    """Local retrieval engine for HR knowledge"""
    
    def __init__(self):
        self.knowledge_base = get_knowledge_base()
        self.stop_words = {
            'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'in', 'is', 'it',
            'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were', 'will', 'with', 'the', 'this', 'but',
            'they', 'their', 'her', 'she', 'him', 'his', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
            'do', 'does', 'did', 'can', 'could', 'should', 'would', 'may', 'might', 'must',
            'please', 'tell', 'show', 'give', 'want', 'need', 'know', 'look', 'see', 'help', 'assist',
        }
    
    def retrieve(
        self,
        tenant_id: str,
        query: str,
        max_results: int = 5,
    ) -> List[Dict[str, Any]]:
        """Retrieve relevant knowledge for query"""
        results = []
        
        # Try vector store first
        try:
            vector_results = self.knowledge_base.search(
                tenant_id=tenant_id,
                query=query,
                n_results=max_results,
                min_score=0.3,
            )
            if vector_results:
                return vector_results[:max_results]
        except Exception:
            pass
        
        # Fallback to keyword search
        query_words = self._tokenize(query)
        if not query_words:
            return []
        
        # Search tenant documents
        docs = self.knowledge_base.list_documents(tenant_id, limit=200)
        scored_docs = []
        
        for doc in docs:
            content = doc.get('title', '') + ' ' + doc.get('content', '')
            content_words = self._tokenize(content.lower())
            
            # Calculate TF score
            content_counter = Counter(content_words)
            score = 0.0
            for word in query_words:
                score += content_counter.get(word, 0) * 0.1
                if word in content.lower():
                    score += 0.2
            
            # Normalize
            if score > 0:
                score = min(score / len(query_words), 1.0)
                scored_docs.append((score, doc))
        
        # Sort by score
        scored_docs.sort(key=lambda x: x[0], reverse=True)
        
        for score, doc in scored_docs[:max_results]:
            results.append({
                'doc_id': doc.get('doc_id'),
                'title': doc.get('title', ''),
                'content': doc.get('content', ''),
                'score': score,
                'doc_type': doc.get('doc_type', ''),
                'source': doc.get('source', ''),
                'metadata': doc.get('metadata', {}),
            })
        
        return results
    
    def get_policy_response(self, policy_type: str, tenant_id: str) -> Optional[str]:
        """Get policy response from knowledge base"""
        results = self.knowledge_base.search(
            tenant_id=tenant_id,
            query=policy_type,
            n_results=1,
            min_score=0.2,
        )
        
        if results:
            return results[0].get('content', '')
        
        return None
    
    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenizer"""
        words = re.findall(r'\b[a-z0-9]+\b', text.lower())
        return [w for w in words if w not in self.stop_words and len(w) > 1]
    
    def build_context_string(
        self,
        tenant_id: str,
        query: str,
        max_docs: int = 3,
    ) -> str:
        """Build context string from retrieved documents"""
        docs = self.retrieve(tenant_id, query, max_results=max_docs)
        
        if not docs:
            return ""
        
        context_parts = ["Relevant HR Knowledge:\n"]
        for i, doc in enumerate(docs, 1):
            context_parts.append(f"\n{i}. {doc.get('title', 'Document')}:")
            content = doc.get('content', '')
            context_parts.append(content[:500])
        
        return "\n".join(context_parts)


# Singleton
_retrieval_engine: Optional[LocalRetrievalEngine] = None


def get_retrieval_engine() -> LocalRetrievalEngine:
    global _retrieval_engine
    if _retrieval_engine is None:
        _retrieval_engine = LocalRetrievalEngine()
    return _retrieval_engine
