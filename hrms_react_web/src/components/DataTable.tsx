import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, Inbox, History, ChevronLeft, ChevronRight, Filter, CheckSquare, Square, Download, FileDown, Columns3, Rows3, Pencil, Trash2 } from 'lucide-react';
import HistoryModal from './HistoryModal';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | undefined;
}

export interface DataTableFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

export interface ServerPaginationConfig {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export interface BulkAction<T> {
  label: string;
  icon?: React.ElementType;
  variant?: 'primary' | 'danger' | 'success' | 'ghost' | 'amber' | 'default' | 'cyan' | 'orange' | 'slate' | 'indigo';
  onAction: (selected: T[]) => void;
  /** when provided, the button is disabled if this returns true */
  disabled?: (selected: T[]) => boolean;
  /** optional title tooltip shown when disabled */
  disabledTitle?: string;
  /** override the variant styling with a custom className */
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T, index?: number) => string | number | undefined;
  searchable?: boolean;
  searchKeys?: (row: T) => string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  actions?: (row: T) => React.ReactNode;
  maxHeight?: string;
  onRowClick?: (row: T) => void;
  /** entityType used for the per-record history "Log" button */
  logEntityType?: string;
  /** returns the entity id + display label for the history log of a row */
  logFor?: (row: T) => { id: string | number; label?: string } | null;
  /** external filter dropdowns shown in the toolbar */
  filters?: DataTableFilter[];
  /** enable row checkboxes + bulk actions */
  bulkActions?: BulkAction<T>[];
  /** rows that can be selected (default: all) */
  selectable?: boolean;
  /** when provided, a built-in "Edit" bulk action appears (enabled when exactly one row is selected) */
  onEdit?: (row: T) => void;
  /** when provided, a built-in "Delete" bulk action appears */
  onDelete?: (rows: T[]) => void;
  /** show built-in "Export" bulk action (default: true) */
  exportable?: boolean;
  /** filename for built-in CSV export (default: table_export.csv) */
  exportFilename?: string;
  /** localStorage key to persist page size / density / hidden columns per table */
  persistKey?: string;
  /** initial density when no saved preference exists (default: comfortable) */
  defaultDensity?: 'compact' | 'comfortable';
  /** Server-driven pagination — skips client slice; parent fetches each page */
  serverPagination?: ServerPaginationConfig;
}

const DataTable = <T,>({
  columns,
  data,
  rowKey,
  searchable = false,
  searchKeys,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No data found',
  actions,
  maxHeight,
  onRowClick,
  logEntityType,
  logFor,
  filters = [],
  bulkActions = [],
  selectable = false,
  onEdit,
  onDelete,
  exportable = true,
  exportFilename = 'table_export.csv',
  persistKey,
  defaultDensity,
  serverPagination,
}: DataTableProps<T>) => {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    if (persistKey) {
      try {
        const saved = localStorage.getItem(`${persistKey}:pageSize`);
        if (saved) return Number(saved);
      } catch { /* ignore */ }
    }
    return 20;
  });
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [historyTarget, setHistoryTarget] = useState<{ entityType: string; id: string | number; label?: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [density, setDensity] = useState<'compact' | 'comfortable'>(() => {
    if (persistKey) {
      try {
        const saved = localStorage.getItem(`${persistKey}:density`);
        if (saved === 'compact' || saved === 'comfortable') return saved;
      } catch { /* ignore */ }
    }
    return defaultDensity || 'comfortable';
  });
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    if (persistKey) {
      try {
        const saved = localStorage.getItem(`${persistKey}:hiddenCols`);
        if (saved) return new Set(JSON.parse(saved));
      } catch { /* ignore */ }
    }
    return new Set();
  });
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!persistKey) return;
    try {
      localStorage.setItem(`${persistKey}:pageSize`, String(pageSize));
      localStorage.setItem(`${persistKey}:density`, density);
      localStorage.setItem(`${persistKey}:hiddenCols`, JSON.stringify([...hiddenCols]));
    } catch { /* ignore */ }
  }, [persistKey, pageSize, density, hiddenCols]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) setColumnsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset page/selection when the underlying data or filters change
  const [prevFilterKey, setPrevFilterKey] = useState({ data, query, sortKey, sortDir });
  if (prevFilterKey.data !== data || prevFilterKey.query !== query || prevFilterKey.sortKey !== sortKey || prevFilterKey.sortDir !== sortDir) {
    setPrevFilterKey({ data, query, sortKey, sortDir });
    setPage(1);
    setSelected(new Set());
  }

  const isServerMode = !!serverPagination;

  const filtered = useMemo(() => {
    let rows = data;
    if (!isServerMode && searchable && query && searchKeys) {
      const q = query.toLowerCase();
      rows = rows.filter((r) => searchKeys(r).toLowerCase().includes(q));
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col) {
        const getter = col.sortValue || ((r: T) => (r as Record<string, unknown>)[sortKey] as string | number);
        rows = [...rows].sort((a, b) => {
          const av = getter(a);
          const bv = getter(b);
          const cmp = typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av ?? '').localeCompare(String(bv ?? ''));
          return sortDir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return rows;
  }, [data, columns, sortKey, sortDir, query, searchable, searchKeys, isServerMode]);

  const effectivePageSize = isServerMode ? serverPagination!.pageSize : pageSize;
  const totalRecords = isServerMode ? serverPagination!.total : filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / effectivePageSize));
  const safePage = isServerMode ? serverPagination!.page : Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    if (isServerMode) return data;
    const start = (safePage - 1) * effectivePageSize;
    return filtered.slice(start, start + effectivePageSize);
  }, [data, filtered, safePage, effectivePageSize, isServerMode]);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const window = 5;
    let start = Math.max(1, safePage - Math.floor(window / 2));
    const end = Math.min(totalPages, start + window - 1);
    start = Math.max(1, end - window + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [totalPages, safePage]);

  const hasLog = !!logEntityType && !!logFor;
  const selectableEnabled = selectable || bulkActions.length > 0 || exportable;
  const extraCols = (actions ? 1 : 0) + (hasLog ? 1 : 0) + (selectableEnabled ? 1 : 0);
  const visibleColumns = columns.filter((c) => !hiddenCols.has(c.key));
  const isCompact = density === 'compact';
  const tdClass = isCompact ? 'py-1.5 px-3' : 'py-3 px-5';
  const thClass = isCompact ? 'py-1.5 px-3' : 'py-2.5 px-5';
  const rowPad = isCompact ? '!py-2' : '';

  const toggleSelect = (key: string | number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map((r, i) => String(rowKey(r, i) ?? i))));
  };

  const selectedRows = filtered.filter((r, i) => selected.has(String(rowKey(r, i) ?? i)));

  const handleExport = (rows: T[], suffix = '') => {
    const csvRows = rows.map((row) => {
      return visibleColumns.map((col) => {
        const val: unknown = col.render
          ? (row as Record<string, unknown>)[col.key]
          : (row as Record<string, unknown>)[col.key];
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') {
          const name = (val as { name?: unknown }).name;
          if (name !== undefined) return String(name);
          return JSON.stringify(val);
        }
        return String(val);
      });
    });
    const headers = visibleColumns.map((c) => c.header);
    const csv = [headers, ...csvRows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const base = exportFilename.replace(/\.csv$/i, '');
    link.setAttribute('download', suffix ? `${base}_${suffix}.csv` : exportFilename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const allBulkActions: BulkAction<T>[] = [
    ...(onEdit ? [{
      label: 'Edit',
      icon: Pencil,
      variant: 'primary' as const,
      disabled: (selected: T[]) => selected.length !== 1,
      disabledTitle: 'Select a single row to edit',
      onAction: (selected: T[]) => { if (selected.length === 1) onEdit(selected[0]); },
    }] : []),
    ...(onDelete ? [{
      label: 'Delete',
      icon: Trash2,
      variant: 'danger' as const,
      onAction: onDelete,
    }] : []),
    ...bulkActions,
  ];

  const handleExportRows = (rows: T[], label: string) => {
    if (rows.length === 0) return;
    handleExport(rows, label);
    setExportOpen(false);
  };


  return (
    <div className="table-container">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-[#F1F5F9] bg-white flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-[220px]">
          {selectableEnabled && (
            <button
              onClick={toggleSelectAll}
              className="p-1.5 text-[#6B7280] hover:bg-[#F3F4F6] rounded-lg transition-colors"
              title={selected.size === filtered.length ? 'Deselect all' : 'Select all'}
            >
              {selected.size === filtered.length && filtered.length > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            </button>
          )}
          {searchable && (
            <>
              <Search className="w-4 h-4 text-[#94A3B8] shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="flex-1 bg-transparent border-none outline-none text-sm text-[#0F172A] placeholder-[#94A3B8] py-1"
              />
            </>
          )}
        </div>

        {/* Filters */}
        {filters.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-[#94A3B8]" />
            {filters.map((f) => (
              <select
                key={f.key}
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-xs font-medium text-[#475569] bg-white focus:outline-none focus:ring-2 focus:ring-[#1C64F2]/30 cursor-pointer"
              >
                <option value="all">All {f.label}</option>
                {f.options
                  .filter((o) => o.value !== 'all')
                  .map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
              </select>
            ))}
          </div>
        )}

        {/* Record count / bulk actions */}
        <div className="flex items-center gap-2">
          {columns.length > 1 && (
            <div className="relative" ref={columnsRef}>
              <button
                onClick={() => setColumnsOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
                title="Customize columns"
              >
                <Columns3 className="w-3.5 h-3.5" />
                Columns
                <ChevronDown className={`w-3 h-3 transition-transform ${columnsOpen ? 'rotate-180' : ''}`} />
              </button>
              {columnsOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-[#E2E8F0] py-1.5 z-50">
                  <p className="px-3.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">Show columns</p>
                  {columns.map((col) => (
                    <label key={col.key} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={!hiddenCols.has(col.key)}
                        onChange={() => {
                          setHiddenCols((prev) => {
                            const next = new Set(prev);
                            if (next.has(col.key)) next.delete(col.key);
                            else next.add(col.key);
                            return next;
                          });
                        }}
                        className="w-3.5 h-3.5 rounded border-[#CBD5E1] text-[#1C64F2] focus:ring-[#1C64F2]/30"
                      />
                      <span className="truncate">{col.header}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-1 rounded-lg bg-[#F1F5F9] p-1">
            <button
              onClick={() => setDensity('comfortable')}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-semibold transition-colors ${!isCompact ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#475569] hover:text-[#0F172A]'}`}
              title="Comfortable density"
            >
              <Rows3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDensity('compact')}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-semibold transition-colors ${isCompact ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#475569] hover:text-[#0F172A]'}`}
              title="Compact density"
            >
              <ChevronsUpDown className="w-3.5 h-3.5" />
            </button>
          </div>

            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setExportOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
                title="Export table data"
              >
                <Download className="w-3.5 h-3.5" />
                Export
                <ChevronDown className={`w-3 h-3 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-[#E2E8F0] py-1.5 z-50">
                  <button
                    onClick={() => handleExportRows(selectedRows, 'selected')}
                    disabled={selectedRows.length === 0}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-[#94A3B8]" />
                    Export selected ({selectedRows.length})
                  </button>
                  <button
                    onClick={() => handleExportRows(pageRows, 'page')}
                    disabled={pageRows.length === 0}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronsUpDown className="w-3.5 h-3.5 text-[#94A3B8]" />
                    Export current page ({pageRows.length})
                  </button>
                  <button
                    onClick={() => handleExportRows(filtered, 'all')}
                    disabled={filtered.length === 0}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <FileDown className="w-3.5 h-3.5 text-[#94A3B8]" />
                    Export all ({filtered.length})
                  </button>
                </div>
              )}
            </div>
          <span className="text-xs font-medium text-[#64748B] whitespace-nowrap px-3 py-1 rounded-full bg-[#F1F5F9]">
            {totalRecords} records
          </span>
        </div>
      </div>

      {selectedRows.length > 0 && allBulkActions.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[#EFF6FF] border-b border-[#BFDBFE]">
          <span className="text-xs font-semibold text-[#1D4ED8] mr-2">{selectedRows.length} selected</span>
          {allBulkActions.map((action) => {
            const Icon = action.icon;
            const isDisabled = action.disabled?.(selectedRows);
            const variantCls = action.variant === 'danger'
              ? 'bg-[#FEE2E2] text-[#991B1B] hover:bg-[#FECACA]'
              : action.variant === 'primary'
              ? 'bg-[#DBEAFE] text-[#1D4ED8] hover:bg-[#BFDBFE]'
              : action.variant === 'success'
              ? 'bg-[#D1FAE5] text-[#065F46] hover:bg-[#A7F3D0]'
              : action.variant === 'amber'
              ? 'bg-[#FEF3C7] text-[#92400E] hover:bg-[#FDE68A]'
              : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]';
            return (
              <button
                key={action.label}
                onClick={() => action.onAction(selectedRows)}
                disabled={isDisabled}
                title={isDisabled ? action.disabledTitle : action.label}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${action.className || variantCls}`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {action.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        <table>
          <thead>
            <tr>
              {selectableEnabled && (
                <th style={{ width: 40, textAlign: 'center', position: 'sticky', left: 0, backgroundColor: '#EFF6FF', borderRight: '1px solid var(--border-color)' }}>
                  {selected.size === filtered.length && filtered.length > 0
                    ? <CheckSquare className="w-4 h-4 text-[#1C64F2] mx-auto" />
                    : <Square className="w-4 h-4 text-[#94A3B8] mx-auto" />}
                </th>
              )}
              {visibleColumns.map((col, i) => (
                <th
                  key={col.key}
                  style={{ width: col.width, textAlign: col.align || 'left', position: i === 0 ? 'sticky' : 'static', left: i === 0 ? '40px' : 'auto', backgroundColor: i === 0 ? '#EFF6FF' : 'transparent', borderRight: '1px solid var(--border-color)' }}
                  className={`${col.sortable ? 'cursor-pointer select-none hover:text-[#1C64F2] transition-colors' : ''} ${thClass}`}
                  onClick={() => {
                    if (!col.sortable) return;
                    if (sortKey === col.key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                    else { setSortKey(col.key); setSortDir('asc'); }
                  }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {col.header}
                    {col.sortable && (
                      <span className="text-[#94A3B8]">
                        {sortKey === col.key ? (
                          sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronsUpDown className="w-3.5 h-3.5" />
                        )}
                      </span>
                    )}
                  </span>
                </th>
              ))}
              {hasLog && <th className={thClass} style={{ textAlign: 'center', borderRight: '1px solid var(--border-color)' }}>Log</th>}
              {actions && <th className={thClass} style={{ textAlign: 'right', borderRight: '1px solid var(--border-color)' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + extraCols} className="py-16">
                  <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                    <div className="mb-4">
                      <Inbox className="w-10 h-10 text-[#CBD5E1]" />
                    </div>
                    <p className="text-sm font-semibold text-[#0F172A]">{emptyMessage}</p>
                    {query && <p className="text-xs text-[#94A3B8] mt-1">Try adjusting your search or filters</p>}
                  </div>
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => {
                const rk = String(rowKey(row, idx) ?? idx);
                const isSel = selected.has(rk);
                return (
                  <tr
                    key={rk}
                    className={`${onRowClick ? 'cursor-pointer' : ''} ${rowPad} border-b border-[var(--border-color)] ${hoverRow === rk ? 'bg:#F3F4F6' : ''}`}
                    onMouseOver={() => { if (!isSel) setHoverRow(rk) }}
                    onMouseOut={() => { if (!isSel) setHoverRow(null) }}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectableEnabled && (
                      <td className={tdClass} style={{ textAlign: 'center', position: 'sticky', left: 0, backgroundColor: hoverRow === rk ? '#DBEAFE' : '#EFF6FF', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => toggleSelect(rk)} className="text-[#64748B] hover:text-[#1C64F2] transition-colors">
                          {isSel ? <CheckSquare className="w-4 h-4 text-[#1C64F2]" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                    )}
                    {visibleColumns.map((col, i) => (
                      <td key={col.key} className={tdClass} style={{ textAlign: col.align || 'left', position: i === 0 ? 'sticky' : 'static', left: i === 0 ? '40px' : 'auto', backgroundColor: i === 0 ? (hoverRow === rk ? '#DBEAFE' : '#EFF6FF') : 'transparent', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
                        {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                      </td>
                    ))}
                    {hasLog && (
                      <td className={tdClass} style={{ textAlign: 'center', borderRight: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const target = logFor(row);
                          return (
                            <button
                              onClick={() => target && setHistoryTarget({ entityType: logEntityType, id: target.id, label: target.label })}
                              className="p-2 text-[#7C3AED] hover:bg-[#7C3AED]/10 rounded-lg transition-colors"
                              title="View change history"
                            >
                              <History className="w-4 h-4" />
                            </button>
                          );
                        })()}
                      </td>
                    )}
                    {actions && <td className={tdClass} style={{ textAlign: 'right', borderRight: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>{actions(row)}</td>}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pageRows.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-[#D1D5DB] bg-[#F9FAFB]">
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#64748B]">
              Showing <span className="font-semibold text-[#0F172A]">{(safePage - 1) * effectivePageSize + 1}</span>–
              <span className="font-semibold text-[#0F172A]">{Math.min(safePage * effectivePageSize, totalRecords)}</span> of
              <span className="font-semibold text-[#0F172A]"> {totalRecords}</span>
            </span>
            <select
              value={effectivePageSize}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (isServerMode) serverPagination?.onPageSizeChange?.(next);
                else { setPageSize(next); setPage(1); }
              }}
              className="px-2 py-1.5 border border-[#E2E8F0] rounded-lg text-xs font-medium text-[#475569] bg-white focus:outline-none focus:ring-2 focus:ring-[#1C64F2]/30"
            >
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => isServerMode ? serverPagination!.onPageChange(Math.max(1, safePage - 1)) : setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="p-2 text-[#475569] hover:bg-[#F1F5F9] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {pageNumbers.map((n) => (
              <button
                key={n}
                onClick={() => isServerMode ? serverPagination!.onPageChange(n) : setPage(n)}
                className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors ${n === safePage ? 'bg-[#1C64F2] text-white shadow-sm' : 'text-[#475569] hover:bg-[#F1F5F9]'}`}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => isServerMode ? serverPagination!.onPageChange(Math.min(totalPages, safePage + 1)) : setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="p-2 text-[#475569] hover:bg-[#F1F5F9] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <HistoryModal
        isOpen={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        entityType={historyTarget?.entityType || ''}
        entityId={historyTarget?.id ?? ''}
        entityLabel={historyTarget?.label}
      />
    </div>
  );
};

export default DataTable;
