import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface QueryErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

const QueryErrorState: React.FC<QueryErrorStateProps> = ({ message = 'Failed to load data', onRetry, className = '' }) => (
  <div className={`flex flex-col items-center justify-center py-8 px-4 text-center ${className}`}>
    <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
    <p className="text-sm text-[var(--text-secondary)] mb-3">{message}</p>
    {onRetry && (
      <button onClick={onRetry} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors">
        <RefreshCw className="w-4 h-4" /> Retry
      </button>
    )}
  </div>
);
export default QueryErrorState;
