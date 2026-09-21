import React from 'react';
import { getStatusBadgeClass, capitalizeStatus } from '../utils/statusUtils';

/** Consistent status badge used across all pages. */
export default function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(status)} ${className}`}>
      {capitalizeStatus(status)}
    </span>
  );
}
