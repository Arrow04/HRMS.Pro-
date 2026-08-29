import React from 'react';
import { Download } from 'lucide-react';

interface ExportButtonProps<T> {
  rows: T[];
  filename?: string;
  variant?: 'hero' | 'toolbar';
  label?: string;
}

const VARIANTS = {
  hero: 'bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20',
  toolbar: 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]',
};

const ExportButton = <T,>({
  rows,
  filename = 'export.csv',
  variant = 'hero',
  label = 'Export',
}: ExportButtonProps<T>) => {
  const stringifyCell = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      const name = (val as { name?: unknown }).name;
      if (name !== undefined) return String(name);
      const label2 = (val as { label?: unknown }).label;
      if (label2 !== undefined) return String(label2);
      if (Array.isArray(val)) return (val as unknown[]).map((v) => stringifyCell(v)).join(', ');
      return JSON.stringify(val);
    }
    return String(val);
  };

  const handleExport = () => {
    if (rows.length === 0) return;
    const first = rows[0] as Record<string, unknown>;
    const keys = first ? Object.keys(first) : [];
    const headers = keys.map((k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()));
    const csvRows = rows.map((row) =>
      keys.map((k) => {
        let val = stringifyCell((row as Record<string, unknown>)[k]).replace(/"/g, '""');
        // Excel auto-converts things like "1-50" into dates. Force text with ="..." formula.
        if (/^\d+-\d+$/.test(val)) val = `="${val}"`;
        return `"${val}"`;
      })
    );
    const csv = [headers, ...csvRows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${VARIANTS[variant]}`}
    >
      <Download className="w-4 h-4" />
      {label}
    </button>
  );
};

export default ExportButton;
