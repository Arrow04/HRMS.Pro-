import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  Clock,
  CornerDownLeft,
  Database,
  FileText,
  History,
  Laptop,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  MessageSquare,
  Palmtree,
  Receipt,
  Search,
  SearchX,
  Settings,
  ShieldAlert,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

type CommandGroup = 'Recent' | 'Pages' | 'Actions';

interface CommandItem {
  id: string;
  label: string;
  path: string;
  keywords: string;
  icon: LucideIcon;
  group: Exclude<CommandGroup, 'Recent'>;
}

interface CommandSection {
  title: CommandGroup;
  items: CommandItem[];
}

const RECENT_KEY = 'hrms.commandPalette.recent';
const MAX_RECENT = 5;

const PAGES: CommandItem[] = [
  { id: 'page-dashboard', label: 'Dashboard', path: '/dashboard', keywords: 'home overview analytics stats', icon: LayoutDashboard, group: 'Pages' },
  { id: 'page-company', label: 'Company', path: '/company', keywords: 'organization branch company profile', icon: Building2, group: 'Pages' },
  { id: 'page-employees', label: 'Employees', path: '/employees', keywords: 'staff directory people team members', icon: Users, group: 'Pages' },
  { id: 'page-letters', label: 'Letters', path: '/letters', keywords: 'offer relieving experience letter documents', icon: FileText, group: 'Pages' },
  { id: 'page-recruitment', label: 'Recruitment', path: '/recruitment', keywords: 'hiring candidates jobs pipeline interviews', icon: Briefcase, group: 'Pages' },
  { id: 'page-attendance', label: 'Attendance', path: '/attendance', keywords: 'checkin checkout present absent clock roster', icon: Clock, group: 'Pages' },
  { id: 'page-leaves', label: 'Leaves', path: '/leaves', keywords: 'leave vacation timeoff request approval', icon: CalendarDays, group: 'Pages' },
  { id: 'page-holidays', label: 'Holidays', path: '/holidays', keywords: 'holiday calendar events festival', icon: Palmtree, group: 'Pages' },
  { id: 'page-expenses', label: 'Expenses', path: '/expenses', keywords: 'expense claims reimbursements spend bills', icon: Receipt, group: 'Pages' },
  { id: 'page-assets', label: 'Assets', path: '/assets', keywords: 'assets inventory laptop devices equipment', icon: Laptop, group: 'Pages' },
  { id: 'page-performance', label: 'Performance', path: '/performance', keywords: 'reviews ratings appraisal kpi goals', icon: TrendingUp, group: 'Pages' },
  { id: 'page-payroll', label: 'Payroll', path: '/payroll', keywords: 'salary payslip wages payout compensation', icon: Wallet, group: 'Pages' },
  { id: 'page-exit-management', label: 'Exit Management', path: '/exit-management', keywords: 'exit offboarding resignation relieving separation', icon: LogOut, group: 'Pages' },
  { id: 'page-anomalies', label: 'Anomalies', path: '/anomalies', keywords: 'anomaly detection alerts fraud audit', icon: ShieldAlert, group: 'Pages' },
  { id: 'page-reports', label: 'Reports', path: '/reports', keywords: 'reports analytics export insights', icon: BarChart3, group: 'Pages' },
  { id: 'page-settings', label: 'Settings', path: '/settings', keywords: 'settings config preferences system', icon: Settings, group: 'Pages' },
  { id: 'page-master-data', label: 'Master Data', path: '/master-data', keywords: 'master data departments designations roles', icon: Database, group: 'Pages' },
  { id: 'page-announcements', label: 'Announcements', path: '/announcements', keywords: 'announcements news updates notice board', icon: Megaphone, group: 'Pages' },
  { id: 'page-grievances', label: 'Grievances', path: '/grievances', keywords: 'grievance complaints issues resolve', icon: MessageSquare, group: 'Pages' },
  { id: 'page-notifications', label: 'Notifications', path: '/notifications', keywords: 'notifications alerts messages bell', icon: Bell, group: 'Pages' },
  { id: 'page-helpdesk', label: 'Helpdesk', path: '/helpdesk', keywords: 'helpdesk support ticket it facility help', icon: LifeBuoy, group: 'Pages' },
];

const ACTIONS: CommandItem[] = [
  { id: 'action-new-employee', label: 'New Employee', path: '/employees', keywords: 'new employee add create hire onboard', icon: UserPlus, group: 'Actions' },
  { id: 'action-new-grievance', label: 'New Grievance', path: '/grievances', keywords: 'new grievance complaint raise issue report', icon: MessageSquare, group: 'Actions' },
  { id: 'action-raise-ticket', label: 'Raise Ticket', path: '/helpdesk', keywords: 'raise ticket support helpdesk it new', icon: LifeBuoy, group: 'Actions' },
  { id: 'action-new-announcement', label: 'New Announcement', path: '/announcements', keywords: 'new announcement publish notice post update', icon: Megaphone, group: 'Actions' },
  { id: 'action-mark-attendance', label: 'Mark Attendance', path: '/attendance', keywords: 'mark attendance checkin checkout present', icon: Clock, group: 'Actions' },
];

const ALL_COMMANDS: CommandItem[] = [...PAGES, ...ACTIONS];

function loadRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function resolveRecent(ids: string[]): CommandItem[] {
  const out: CommandItem[] = [];
  for (const id of ids) {
    const found = ALL_COMMANDS.find((c) => c.id === id);
    if (found) out.push(found);
  }
  return out;
}

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Case-insensitive substring match on label + keywords; exact/prefix matches rank first. */
function rankMatch(item: CommandItem, q: string): number {
  const label = item.label.toLowerCase();
  const keywords = item.keywords.toLowerCase();
  const path = item.path.toLowerCase();
  if (label === q) return 0;
  if (label.startsWith(q)) return 1;
  if (label.includes(q)) return 2;
  if (keywords.split(/\s+/).some((w) => w.startsWith(q))) return 3;
  if (keywords.includes(q)) return 4;
  if (path.includes(q)) return 5;
  return Number.POSITIVE_INFINITY;
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      className="inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none"
      style={{
        backgroundColor: 'var(--hover-bg)',
        borderColor: 'var(--border-color)',
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </kbd>
  );
}

export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecentIds());
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, []);

  const recordRecent = useCallback((id: string) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((r) => r !== id)].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — ignore */
      }
      return next;
    });
  }, []);

  const runCommand = useCallback(
    (item: CommandItem) => {
      recordRecent(item.id);
      close();
      navigate(item.path);
    },
    [close, navigate, recordRecent],
  );

  const openPalette = useCallback(() => {
    setRecentIds(loadRecentIds());
    setQuery('');
    setActiveIndex(0);
    setOpen(true);
  }, []);

  // Global Ctrl+K / Cmd+K toggle. Ignored while typing in form fields.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isToggle = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      if (!isToggle) return;
      if (isTypingTarget(document.activeElement)) return;
      e.preventDefault();
      if (open) {
        close();
      } else {
        openPalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close, openPalette]);

  // Focus input + lock scroll while open.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const sections: CommandSection[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      const recent = resolveRecent(recentIds);
      const out: CommandSection[] = [];
      if (recent.length > 0) out.push({ title: 'Recent', items: recent });
      out.push({ title: 'Pages', items: PAGES });
      out.push({ title: 'Actions', items: ACTIONS });
      return out;
    }
    const scored = ALL_COMMANDS.map((item) => ({ item, score: rankMatch(item, q) })).filter(
      (s) => s.score !== Number.POSITIVE_INFINITY,
    );
    scored.sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label));
    const pages = scored.filter((s) => s.item.group === 'Pages').map((s) => s.item);
    const actions = scored.filter((s) => s.item.group === 'Actions').map((s) => s.item);
    const out: CommandSection[] = [];
    if (pages.length > 0) out.push({ title: 'Pages', items: pages });
    if (actions.length > 0) out.push({ title: 'Actions', items: actions });
    return out;
  }, [query, recentIds]);

  const flatItems: CommandItem[] = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  // Derived clamped index — keeps selection in bounds as the result set changes
  // without syncing state inside an effect.
  const safeActiveIndex = flatItems.length === 0 ? 0 : Math.min(activeIndex, flatItems.length - 1);

  // Keep the active row visible.
  useEffect(() => {
    itemRefs.current[safeActiveIndex]?.scrollIntoView({ block: 'nearest' });
  }, [safeActiveIndex, flatItems.length]);

  if (!open) return null;

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatItems.length > 0) setActiveIndex(((safeActiveIndex + 1) % flatItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatItems.length > 0)
        setActiveIndex(((safeActiveIndex - 1 + flatItems.length) % flatItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatItems[safeActiveIndex];
      if (item) runCommand(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  let flatCursor = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm animate-fade-in"
      onClick={close}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl border shadow-2xl animate-pop"
        style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-color)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div
          className="flex items-center gap-3 border-b px-4 py-3.5"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <Search className="h-5 w-5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Search pages and actions..."
            aria-label="Search pages and actions"
            className="flex-1 border-0 bg-transparent p-0 text-sm outline-none focus:ring-0"
            style={{ color: 'var(--text-primary)', boxShadow: 'none' }}
          />
          <Kbd>ESC</Kbd>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto p-2">
          {flatItems.length === 0 ? (
            <div
              className="flex flex-col items-center gap-2 px-4 py-10 text-center"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <SearchX className="h-8 w-8" />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                No results found
              </p>
              <p className="text-xs">No matches for &ldquo;{query.trim()}&rdquo;. Try another search.</p>
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.title} className="mb-1 last:mb-0">
                <div
                  className="flex items-center gap-2 px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {section.title === 'Recent' && <History className="h-3 w-3" />}
                  {section.title}
                </div>
                {section.items.map((item) => {
                  flatCursor += 1;
                  const idx = flatCursor;
                  const isActive = idx === safeActiveIndex;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      ref={(el) => {
                        itemRefs.current[idx] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => runCommand(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors"
                      style={{
                        backgroundColor: isActive ? 'var(--active-blue-bg)' : 'transparent',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                        style={{
                          backgroundColor: 'var(--surface-secondary)',
                          borderColor: 'var(--border-color)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.label}</span>
                        <span
                          className="block truncate text-xs"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {item.group} &middot; {item.path}
                        </span>
                      </span>
                      {isActive && (
                        <CornerDownLeft className="h-4 w-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div
          className="flex items-center gap-4 border-t px-4 py-2.5 text-[11px]"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-tertiary)' }}
        >
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd> open
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
