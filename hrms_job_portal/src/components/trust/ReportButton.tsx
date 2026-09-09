import { useNavigate } from 'react-router-dom';
import { Flag } from 'lucide-react';

export default function ReportButton({ kind, id, label = 'Report' }: { kind: string; id: number; label?: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/report?type=${encodeURIComponent(kind)}&id=${id}`)}
      className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
    >
      <Flag className="w-3.5 h-3.5" /> {label}
    </button>
  );
}
