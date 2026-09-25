import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2, Users, Shield,
  Save, RotateCcw, Plus, Trash2, Check,
  Download, Lock, Zap, Loader2, Edit2, Settings as SettingsIcon,
  Globe, Clock, CalendarDays, CalendarRange, X,
  Briefcase, TrendingUp, UserCog, ShieldCheck, Monitor, LogOut, Upload,
  CreditCard, CheckCircle2, Info,
  CalendarCheck, Palmtree, ShieldAlert, BarChart3, Building, Wallet, FileBarChart, Ban, Eye, EyeOff, Copy, UserPlus, Wand2, Phone, Power, ToggleRight, AlertTriangle,
  Megaphone, Headset, Bell, FileText,
} from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as settingsApi from '../services/settingsService';
import { DEFAULT_NOTIFICATION_SETTINGS, normalizeNotificationSettings } from '../services/settingsService';
import { useUnsavedChangesWarning } from '../hooks/useUnsavedChangesWarning';
import { syncAppSettings, formatAppDate } from '../services/appSettingsService';
import ToggleSwitch from '../components/ToggleSwitch';
import { getCurrentUser } from '../services/authService';
import { useMasterData } from '../hooks/useMasterData';
import api from '../services/api';
import DataTable from '../components/DataTable';
import ExportButton from '../components/ExportButton';
import SearchableSelect from '../components/SearchableSelect';
import CurrencySelect from '../components/CurrencySelect';
import MasterSelect from '../components/MasterSelect';
import PageHero from '../components/PageHero';
import BillingPanel from '../components/BillingPanel';
import ActivityLog from './ActivityLog';
import ConfirmActionModal from '../components/ConfirmActionModal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import Modal from '../components/Modal';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import { getCountryDefaults, COUNTRY_NAMES, CURRENCY_CODES, getTimezoneCodes, getCurrencySymbol } from '../utils/countryDefaults';
import { DATE_FORMAT_OPTIONS, TIME_FORMAT_OPTIONS, FINANCIAL_YEAR_MONTHS } from '../utils/dateFormats';
import type { LucideIcon } from 'lucide-react';
import type { User } from '../types';


// =============================================================================
// TYPES
// =============================================================================
type NavItem = {
  id: string;
  label: string;
  dotColor: string;
  count?: number;
  href?: string;
};

type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

type UserRow = User & {
  name?: string;
  passcode?: string;
  password?: string;
  dateJoined?: string;
  joinTime?: string;
  permissions?: Record<string, string>;
  _permMap?: Record<string, { level: string; menu_visible: boolean; locked?: boolean }>;
  _permLoaded?: boolean;
  _permLocked?: boolean;
};

const nowISODate = () => new Date().toISOString().slice(0, 10);
const nowISOTime = () => new Date().toTimeString().slice(0, 8);
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const fmtTime = (d: Date) => d.toTimeString().slice(0, 8);

const buildSecureCode = (len: number) => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '@#$%&*!?+=';
  const all = upper + lower + digits + special;
  const picks = [upper, lower, digits, special].map((s) => s[Math.floor(Math.random() * s.length)]);
  while (picks.length < len) {
    picks.push(all[Math.floor(Math.random() * all.length)]);
  }
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  return picks.join('');
};

// Modules available for permission control (mirrors backend MODULES_LIST)
const MODULES: { code: string; label: string; icon: LucideIcon }[] = [
  { code: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { code: 'company', label: 'Company', icon: Building },
  { code: 'employees', label: 'Employees', icon: Users },
  { code: 'letters', label: 'Letters', icon: FileText },
  { code: 'recruitment', label: 'Recruitment', icon: Briefcase },
  { code: 'holidays', label: 'Holidays', icon: Palmtree },
  { code: 'attendance', label: 'Attendance', icon: Clock },
  { code: 'leaves', label: 'Leaves', icon: CalendarCheck },
  { code: 'payroll', label: 'Payroll', icon: Wallet },
  { code: 'anomalies', label: 'Anomalies', icon: ShieldAlert },
  { code: 'expenses', label: 'Expenses', icon: CreditCard },
  { code: 'exit', label: 'Exits', icon: LogOut },
  { code: 'assets', label: 'Assets', icon: Monitor },
  { code: 'performance', label: 'Performance', icon: TrendingUp },
  { code: 'reports', label: 'Reports', icon: FileBarChart },
  { code: 'announcements', label: 'Announcements', icon: Megaphone },
  { code: 'grievances', label: 'Grievances', icon: AlertTriangle },
  { code: 'helpdesk', label: 'Helpdesk', icon: Headset },
  { code: 'notifications', label: 'Notifications', icon: Bell },
  { code: 'reports', label: 'Reports', icon: BarChart3 },
  { code: 'settings', label: 'Settings', icon: SettingsIcon },
];

type DeviceRow = {
  id: number;
  device_name: string;
  device_type: string;
  ip_address: string;
  last_used?: string;
  is_current?: boolean;
};

type NotificationRow = {
  event: string;
  inApp: boolean;
  email: boolean;
  sms: boolean;
};

// =============================================================================
// NAVIGATION DATA
// =============================================================================
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'org',
    label: 'Organisation',
    icon: Building2,
    items: [
      { id: 'general', label: 'General', dotColor: '#1C64F2' },
      { id: 'billing', label: 'Billing & Plan', dotColor: '#059669' },
    ]
  },
  {
    id: 'access',
    label: 'Access',
    icon: Shield,
    items: [
      { id: 'users', label: 'Users', dotColor: '#6366F1' },
      { id: 'devices', label: 'Devices', dotColor: '#10B981' },
      { id: 'notifications', label: 'Notifications', dotColor: '#F59E0B' },
      { id: 'hr-policies', label: 'HR Policies', dotColor: '#8B5CF6' },
    ]
  },
  {
    id: 'system',
    label: 'System',
    icon: Zap,
    items: [
      { id: 'integrations', label: 'Integrations', dotColor: '#6366F1' },
      { id: 'security', label: 'Security', dotColor: '#DC2626' },
      { id: 'audit', label: 'Audit log', dotColor: '#0891B2' },
    ]
  },
];

// =============================================================================
// COMPONENTS
// =============================================================================

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <button
    onClick={onChange}
    role="switch"
    aria-checked={checked}
    className={`relative w-12 h-7 rounded-full transition-all duration-300 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#1C64F2]/40 focus-visible:ring-offset-2 cursor-pointer group ${
      checked
        ? 'bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-[0_2px_8px_-1px_rgba(37,99,235,0.5)]'
        : 'bg-[#CBD5E1] hover:bg-[#B6C3D4] shadow-inner'
    }`}
  >
    <span
      className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ease-out ${
        checked ? 'translate-x-5 group-active:scale-95' : 'group-active:scale-90'
      }`}
    />
  </button>
);

const SaveButton = ({ onSave, saving }: { onSave: () => void; saving?: boolean }) => {
  const [saved, setSaved] = useState(false);
  return (
    <button
      onClick={() => {
        onSave();
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }}
      disabled={saving}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm disabled:opacity-50 ${
        saved ? 'bg-[var(--success-green)] text-white shadow-green-500/20' : 'bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] text-white hover:opacity-90 shadow-blue-500/25'
      }`}
    >
      {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> :
        saved ? <><Check className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save Changes</>}
    </button>
  );
};

const DiscardButton = ({ onDiscard }: { onDiscard: () => void }) => (
  <button
    onClick={onDiscard}
    className="flex items-center gap-2 px-5 py-2.5 border border-[#E2E8F0] text-[#64748B] rounded-xl text-sm font-semibold hover:bg-[#F8FAFC] hover:text-[#475569] transition-colors"
  >
    <RotateCcw className="w-4 h-4" />
    Discard
  </button>
);

const FormField = ({ label, children, description }: { label: string; children: React.ReactNode; description?: string }) => (
  <div className="space-y-1.5">
    <label className="text-sm font-semibold text-[#0F172A]">{label}</label>
    {children}
    {description && <p className="text-xs text-[#94A3B8]">{description}</p>}
  </div>
);

const ToggleRow = ({ label, subtitle, checked, onChange }: { label: string; subtitle: string; checked: boolean; onChange: () => void }) => (
  <div className="group flex items-center justify-between gap-4 px-4 py-3.5 rounded-xl border border-[#E8EDF3] bg-white hover:border-[#D7E0EA] hover:bg-[#FAFBFC] transition-all duration-200">
    <div className="min-w-0">
      <p className="font-medium text-[#0F172A] text-sm">{label}</p>
      <p className="text-xs text-[#94A3B8] mt-0.5">{subtitle}</p>
    </div>
    <div className="shrink-0">
      <Toggle checked={checked} onChange={onChange} />
    </div>
  </div>
);

// =============================================================================
// HR POLICIES PANEL
// =============================================================================

interface HRPolicy {
  id: number;
  key: string;
  title: string;
  icon: string;
  color: string;
  description: string;
  bullets: string[];
  sortOrder: number;
  status: string;
}

const POLICY_COLORS = ['#3B82F6', '#4F46E5', '#059669', '#8B5CF6', '#DC2626', '#0D9488', '#D97706', '#EC4899', '#6366F1', '#14B8A6'];

const HRPoliciesPanel = () => {
  const [policies, setPolicies] = useState<HRPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<HRPolicy | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', icon: 'document-text-outline', color: '#3B82F6', sortOrder: 0, bullets: [''] as string[] });
  const [saving, setSaving] = useState(false);
  const [deletePolicyTarget, setDeletePolicyTarget] = useState<HRPolicy | null>(null);

  const load = async () => {
    try {
      const res = await api.get('/api/policies');
      setPolicies(res.data?.data || []);
    } catch { /* empty */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditItem(null); setForm({ title: '', description: '', icon: 'document-text-outline', color: '#3B82F6', sortOrder: policies.length, bullets: [''] }); setShowForm(true); };
  const openEdit = (p: HRPolicy) => { setEditItem(p); setForm({ title: p.title, description: p.description, icon: p.icon, color: p.color, sortOrder: p.sortOrder, bullets: p.bullets?.length ? [...p.bullets] : [''] }); setShowForm(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const key = form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const payload = { ...form, key, bullets: form.bullets.filter(b => b.trim()) };
      if (editItem) {
        await api.put(`/api/policies/${editItem.id}`, payload);
        toast.success('Policy updated');
      } else {
        await api.post('/api/policies', payload);
        toast.success('Policy created');
      }
      setShowForm(false);
      load();
    } catch { toast.error('Failed to save policy'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (p: HRPolicy) => {
    setDeletePolicyTarget(p);
  };

  const confirmDeletePolicy = async () => {
    if (!deletePolicyTarget) return;
    try {
      await api.delete(`/api/policies/${deletePolicyTarget.id}`);
      toast.success('Policy deleted');
      load();
    } catch { toast.error('Failed to delete'); }
    setDeletePolicyTarget(null);
  };

  const updateBullet = (i: number, val: string) => {
    const b = [...form.bullets]; b[i] = val; setForm(f => ({ ...f, bullets: b }));
  };
  const addBullet = () => setForm(f => ({ ...f, bullets: [...f.bullets, ''] }));
  const removeBullet = (i: number) => setForm(f => ({ ...f, bullets: f.bullets.filter((_, idx) => idx !== i) }));

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-[var(--text-primary)]">HR Policies</h3>
          <p className="text-sm text-[var(--text-secondary)]">Manage company policies visible to all employees</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] text-white text-sm font-semibold shadow-md hover:shadow-lg transition-shadow">
          <Plus size={16} /> Add Policy
        </button>
      </div>

      {policies.length === 0 ? (
        <EmptyState icon={FileBarChart} title="No policies" description="Create your first HR policy." />
      ) : (
        <div className="space-y-3">
          {policies.map(p => (
            <div key={p.id} className="bg-white border border-[#E2E8F0] rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: p.color + '18' }}>
                    <span className="text-lg" style={{ color: p.color }}>ðŸ“‹</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-[var(--text-primary)]">{p.title}</h4>
                      {p.status === 'inactive' && <span className="text-[10px] font-semibold bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Inactive</span>}
                    </div>
                    {p.description && <p className="text-sm text-[var(--text-secondary)] mt-1">{p.description}</p>}
                    {p.bullets?.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {p.bullets.map((b, i) => (
                          <li key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: p.color }} />
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button onClick={() => openEdit(p)} className="p-2 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--text-secondary)] hover:text-[#4F46E5] transition-colors">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => handleDelete(p)} className="p-2 rounded-lg hover:bg-red-50 text-[var(--text-secondary)] hover:text-red-500 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-[var(--text-primary)]">{editItem ? 'Edit Policy' : 'New Policy'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)]"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--background)]" placeholder="e.g. Leave Policy" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--background)] resize-none" placeholder="Brief description of this policy" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {POLICY_COLORS.map(c => (
                      <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">Sort Order</label>
                  <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--background)]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">Bullet Points</label>
                <div className="space-y-2">
                  {form.bullets.map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={b} onChange={e => updateBullet(i, e.target.value)} className="flex-1 px-4 py-2 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--background)]" placeholder={`Point ${i + 1}`} />
                      {form.bullets.length > 1 && (
                        <button onClick={() => removeBullet(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 size={14} /></button>
                      )}
                    </div>
                  ))}
                  <button onClick={addBullet} className="flex items-center gap-1.5 text-sm font-semibold text-[#4F46E5] hover:text-[#1C64F2]">
                    <Plus size={14} /> Add point
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border-color)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] text-white text-sm font-semibold shadow-md hover:shadow-lg disabled:opacity-50">
                {saving ? 'Savingâ€¦' : editItem ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDeleteModal
        isOpen={deletePolicyTarget !== null}
        onConfirm={confirmDeletePolicy}
        onClose={() => setDeletePolicyTarget(null)}
        itemName={deletePolicyTarget?.title}
      />
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const UserManagementPanel = () => {
  // superadmin is a platform (tenant-hub) role â€” never offered inside a tenant
  const { data: masterRoles = [] } = useMasterData('ROLES');
  const rolesOptions = masterRoles.filter((opt: { code: string }) => opt.code !== 'superadmin');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserRow | null>(null);
  const [bulkDeleteConfirmItems, setBulkDeleteConfirmItems] = useState<UserRow[] | null>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<UserRow | null>(null);

  const defaultPermissions: Record<string, string> = Object.fromEntries(
    MODULES.map((m) => [m.code, 'none'])
  );

  // Role-appropriate default permissions, applied when a role is selected in
  // the Add User modal so the permission grid isn't left all "none".
  const roleDefaultPermissions: Record<string, Record<string, string>> = {
    superadmin: Object.fromEntries(MODULES.map((m) => [m.code, 'full'])),
    admin: Object.fromEntries(MODULES.map((m) => [m.code, 'full'])),
    hr_admin: {
      dashboard: 'full', company: 'view', employees: 'full', attendance: 'full',
      holidays: 'full', recruitment: 'full', leaves: 'full', payroll: 'view',
      expenses: 'full', performance: 'full', reports: 'full',
      settings: 'edit', assets: 'full', exit: 'full', anomalies: 'view',
    },
    hr_manager: {
      dashboard: 'view', employees: 'edit', attendance: 'full', holidays: 'view',
      leaves: 'full', expenses: 'full', performance: 'edit', reports: 'view',
      assets: 'view', exit: 'view', anomalies: 'view',
    },
    hr_executive: {
      dashboard: 'view', employees: 'view', attendance: 'edit', leaves: 'edit',
      expenses: 'view', reports: 'view', exit: 'view',
    },
    employee: {
      dashboard: 'view', attendance: 'view', leaves: 'view', expenses: 'view',
      performance: 'view', payroll: 'view', holidays: 'view', reports: 'view',
    },
  };

  const applyRoleDefaults = (role: string) => {
    const defaults = roleDefaultPermissions[role] || {};
    setNewUser((prev) => ({
      ...prev,
      role,
      permissions: { ...defaultPermissions, ...defaults },
    }));
  };

  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({ fullName: '', email: '', phone: '', password: '', passcode: '', role: '', isActive: null as boolean | null, dateJoined: '', joinTime: '', permissions: { ...defaultPermissions } });
  const [editPerms, setEditPerms] = useState<Record<string, string>>({});
  const [clock, setClock] = useState(new Date());
  const [showEditPw, setShowEditPw] = useState(false);
  const [showAddPw, setShowAddPw] = useState(false);
  const [copiedPw, setCopiedPw] = useState<'add' | 'edit' | null>(null);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await api.get('/api/users');
      setUsers(response.data?.items || response.data || []);
    } catch {
      // Error logged
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPermissions = async (user: UserRow) => {
    setPermissionsUser({ ...user });
    setShowPermissionsModal(true);
    // Fetch structured permissions (level + menu_visible) for this user
    try {
      const res = await api.get(`/permissions/${user.id}`);
      const perms = res.data?.permissions || [];
      const map: Record<string, { level: string; menu_visible: boolean; locked?: boolean }> = {};
      perms.forEach((p: { module: string; level: string; menu_visible: boolean; locked?: boolean }) => {
        map[p.module] = { level: p.level || 'none', menu_visible: p.menu_visible !== false, locked: !!p.locked };
      });
      setPermissionsUser({ ...user, _permMap: map, _permLoaded: true, _permLocked: map['dashboard']?.locked || user.role === 'admin' || user.role === 'superadmin' });
    } catch {
      setPermissionsUser({ ...user, _permLoaded: false, _permLocked: user.role === 'admin' || user.role === 'superadmin' });
    }
  };

  const handleSavePermissions = async () => {
    if (!permissionsUser || !permissionsUser._permMap) return;
    const payload = Object.entries(permissionsUser._permMap).map(([module, p]) => ({
      module,
      level: p.level,
      menu_visible: p.menu_visible,
      can_read: ['view', 'edit', 'full'].includes(p.level),
      can_write: ['edit', 'full'].includes(p.level),
      can_delete: p.level === 'full',
    }));
    try {
      await api.post(`/permissions/${permissionsUser.id}`, { permissions: payload });
      toast.success('Permissions updated successfully');
      setShowPermissionsModal(false);
      setPermissionsUser(null);
    } catch {
      toast.error('Failed to update permissions');
    }
  };

  const setPermLevel = (module: string, level: string) => {
    if (!permissionsUser || permissionsUser._permLocked) return;
    setPermissionsUser({
      ...permissionsUser,
      _permMap: {
        ...permissionsUser._permMap,
        [module]: { ...(permissionsUser._permMap?.[module] || { level: 'none', menu_visible: false }), level, menu_visible: level !== 'none' },
      },
    });
  };

  const setPermMenuVisible = (module: string, visible: boolean) => {
    if (!permissionsUser || permissionsUser._permLocked) return;
    setPermissionsUser({
      ...permissionsUser,
      _permMap: {
        ...permissionsUser._permMap,
        [module]: { ...(permissionsUser._permMap?.[module] || { level: 'none', menu_visible: false }), menu_visible: visible },
      },
    });
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await api.delete(`/api/users/${userToDelete.id}`);
      toast.success('User deleted successfully');
      setShowDeleteModal(false);
      setUserToDelete(null);
      loadUsers();
    } catch {
      toast.error('Failed to delete user');
    }
  };

  const handleEditUser = async (user: UserRow) => {
    setSelectedUser({ ...user, fullName: user.fullName || user.name || '', passcode: user.passcode || '', password: '', dateJoined: user.dateJoined || nowISODate(), joinTime: user.joinTime || nowISOTime(), isActive: user.isActive !== false });
    setShowEditPw(false);
    setShowEditModal(true);
    try {
      const res = await api.get(`/permissions/${user.id}`);
      const perms: Record<string, string> = {};
      (res.data?.permissions || []).forEach((p: { module: string; level: string }) => {
        perms[p.module] = p.level || 'none';
      });
      setEditPerms(perms);
    } catch {
      setEditPerms({});
    }
  };

  const handleToggleUserStatus = async (user: UserRow) => {
    const next = user.isActive !== false ? false : true;
    try {
      await api.put(`/api/users/${user.id}/status`, { isActive: next });
      toast.success(next ? `${user.email} activated` : `${user.email} deactivated`);
      loadUsers();
    } catch {
      toast.error('Failed to update user status');
    }
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;
    try {
      await api.put(`/api/users/${selectedUser.id}`, {
        fullName: selectedUser.fullName,
        email: selectedUser.email,
        phone: selectedUser.phone,
        passcode: selectedUser.passcode,
        role: selectedUser.role,
        isActive: selectedUser.isActive !== false,
        dateJoined: selectedUser.dateJoined || nowISODate(),
        joinTime: selectedUser.joinTime || nowISOTime(),
        password: selectedUser.password || undefined,
        permissions: editPerms,
      });
      toast.success('User updated successfully');
      setShowEditModal(false);
      setSelectedUser(null);
      loadUsers();
    } catch {
      toast.error('Failed to update user');
    }
  };

  const generatePasscode = (kind: 'add' | 'edit') => {
    const code = buildSecureCode(7);
    if (kind === 'edit') setSelectedUser((prev) => prev ? { ...prev, passcode: code } : prev);
    else setNewUser({ ...newUser, passcode: code });
  };

  const resetPasscode = (kind: 'add' | 'edit') => {
    if (kind === 'edit') setSelectedUser((prev) => prev ? { ...prev, passcode: '' } : prev);
    else setNewUser({ ...newUser, passcode: '' });
  };

  const generateEditPassword = () => {
    setSelectedUser((prev) => prev ? { ...prev, password: buildSecureCode(10) } : prev);
    setShowEditPw(true);
  };

  const resetEditPassword = () => {
    setSelectedUser((prev) => prev ? { ...prev, password: '' } : prev);
    setShowEditPw(false);
  };

  const generateAddPassword = () => {
    setNewUser({ ...newUser, password: buildSecureCode(10) });
    setShowAddPw(true);
  };

  const resetAddPassword = () => {
    setNewUser({ ...newUser, password: '' });
    setShowAddPw(false);
  };

  const copyAddPassword = async () => {
    if (!newUser.password) return;
    try {
      await navigator.clipboard.writeText(newUser.password);
      toast.success('Password copied to clipboard');
      setCopiedPw('add');
      setTimeout(() => setCopiedPw((c) => (c === 'add' ? null : c)), 2000);
    } catch {
      toast.error('Failed to copy password');
    }
  };

  const copyEditPassword = async () => {
    if (!selectedUser?.password) return;
    try {
      await navigator.clipboard.writeText(selectedUser.password);
      toast.success('Password copied to clipboard');
      setCopiedPw('edit');
      setTimeout(() => setCopiedPw((c) => (c === 'edit' ? null : c)), 2000);
    } catch {
      toast.error('Failed to copy password');
    }
  };

  const [provisionPreview, setProvisionPreview] = useState<{ count: number; skipped: number; employees: { id: number; name: string; email: string }[] } | null>(null);
  const [provisionChecking, setProvisionChecking] = useState(false);
  const [provisioning, setProvisioning] = useState(false);

  const handleProvisionClick = async () => {
    setProvisionChecking(true);
    try {
      const res = await api.get('/api/users/provision-all/preview');
      setProvisionPreview(res.data);
    } catch {
      toast.error((error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to check orphan employees');
    } finally {
      setProvisionChecking(false);
    }
  };

  const handleProvisionConfirm = async () => {
    setProvisioning(true);
    try {
      const res = await api.post('/api/users/provision-all');
      const data = res.data;
      setProvisionPreview(null);
      toast.success(`${data.created} user account${data.created === 1 ? '' : 's'} created. Default password: ${data.defaultPassword}`);
      loadUsers();
    } catch {
      toast.error((error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to provision users');
    } finally {
      setProvisioning(false);
    }
  };

  const handleAddUser = async () => {
    try {
      const submittedAt = new Date();
      await api.post('/api/users', {
        ...newUser,
        isActive: newUser.isActive === true,
        dateJoined: fmtDate(submittedAt),
        joinTime: fmtTime(submittedAt),
        permissions: newUser.permissions,
      });
      toast.success('User created successfully');
      setShowAddModal(false);
      setNewUser({ fullName: '', email: '', phone: '', password: '', passcode: '', role: '', isActive: null, dateJoined: '', joinTime: '', permissions: { ...defaultPermissions } });
      loadUsers();
    } catch {
      toast.error('Failed to create user');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      'superadmin': 'bg-purple-100 text-purple-700 border-purple-200',
      'admin': 'bg-rose-100 text-rose-700 border-rose-200',
      'hr_admin': 'bg-blue-100 text-blue-700 border-blue-200',
      'hr_manager': 'bg-indigo-100 text-indigo-700 border-indigo-200',
      'hr_executive': 'bg-cyan-100 text-cyan-700 border-cyan-200',
      'employee': 'bg-gray-100 text-gray-700 border-gray-200',
    };
    return colors[role] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const getPermissionBadge = (level: string) => {
    const badges: Record<string, { label: string; color: string }> = {
      'none': { label: 'No Access', color: 'bg-gray-100 text-gray-600 border-gray-200' },
      'read': { label: 'Read Only', color: 'bg-blue-50 text-blue-600 border-blue-200' },
      'write': { label: 'Full Access', color: 'bg-green-50 text-green-600 border-green-200' },
    };
    return badges[level] || badges['none'];
  };

  const filteredUsers = users.filter(user => {
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? user.isActive !== false : user.isActive === false);
    return matchesRole && matchesStatus;
  });

  const roleCounts = users.reduce((acc, user) => {
    acc[user.role] = (acc[user.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-[var(--text-disabled)]">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 w-full">
        <div>
          <h3 className="text-xl font-semibold text-[var(--text-primary)]">User Management</h3>
          <p className="text-sm text-[var(--text-disabled)] mt-1">Manage user roles and comprehensive permissions (Read/Write)</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            rows={Array.isArray(filteredUsers) ? filteredUsers : []}
            filename="users_export"
            label="Export"
            variant="toolbar"
          />
          <button onClick={handleProvisionClick} disabled={provisionChecking} className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white text-sm font-medium rounded-xl hover:bg-amber-600 transition-colors shadow-sm disabled:opacity-60">
            <Users className="w-4 h-4" />
            {provisionChecking ? 'Checking...' : 'Provision Users'}
          </button>
          <button onClick={() => { setNewUser({ fullName: '', email: '', phone: '', password: '', passcode: '', role: '', isActive: null, dateJoined: nowISODate(), joinTime: nowISOTime(), permissions: { ...defaultPermissions } }); setShowAddModal(true); setShowAddPw(false); }} className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-medium rounded-xl hover:bg-[var(--primary-blue)]/90 transition-colors shadow-sm">
            <Plus className="w-4 h-4" />
            Add User
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-700">{roleCounts['admin'] || 0}</p>
              <p className="text-xs text-purple-600 font-medium">Admins</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-700">{(roleCounts['hr_admin'] || 0) + (roleCounts['hr_manager'] || 0) + (roleCounts['hr_executive'] || 0)}</p>
              <p className="text-xs text-blue-600 font-medium">HR Team</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700">{roleCounts['hr_executive'] || 0}</p>
              <p className="text-xs text-green-600 font-medium">Executives</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-500 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-700">{roleCounts['employee'] || 0}</p>
              <p className="text-xs text-gray-600 font-medium">Employees</p>
            </div>
          </div>
        </div>
      </div>

      {/* User Table */}
      <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-[var(--border-color)] bg-white flex flex-col sm:flex-row items-center gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <SearchableSelect
              value={roleFilter === 'all' ? 'all' : roleFilter}
              onChange={(val) => setRoleFilter(val.toString())}
              options={rolesOptions.map((opt: { code: string; name: string }) => ({ id: opt.code, name: opt.name }))}
              placeholder="All Roles"
              allOption="All Roles"
              className="w-44"
            />
            <SearchableSelect
              value={statusFilter === 'all' ? 'all' : statusFilter}
              onChange={(val) => setStatusFilter(val.toString())}
              options={[{ id: 'active', name: 'Active' }, { id: 'inactive', name: 'Inactive' }]}
              placeholder="All Status"
              allOption="All Status"
              className="w-44"
            />
            {(roleFilter !== 'all' || statusFilter !== 'all') && (
              <button
                onClick={() => { setRoleFilter('all'); setStatusFilter('all'); }}
                className="px-3 py-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors text-sm font-medium"
                title="Clear Filters"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
        {filteredUsers.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Users}
              title="No users found"
              description="Try adjusting your search or add a new user"
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
          <DataTable
            data={Array.isArray(filteredUsers) ? filteredUsers : []}
            rowKey={(user: UserRow) => user.id}
            logEntityType="user"
            logFor={(user: UserRow) => ({ id: user.id, label: user.name || user.email || `#${user.id}` })}
            searchable
            searchKeys={(user: UserRow) => `${user.email} ${user.name || ''} ${user.phone || ''} ${user.role || ''}`}
            searchPlaceholder="Search users..."
            emptyMessage="No users found"
            bulkActions={[
              {
                label: 'Permissions',
                icon: Shield,
                variant: 'success',
                className: 'border border-[var(--primary-blue)]/30 bg-[var(--primary-blue)]/5 text-[var(--primary-blue)] hover:bg-[var(--primary-blue)]/10',
                disabled: (selected) => selected.length !== 1,
                disabledTitle: 'Select a single user to manage permissions',
                onAction: (items) => { if (items.length === 1) handleOpenPermissions(items[0]); },
              },
              {
                label: 'Edit',
                icon: Edit2,
                variant: 'primary',
                disabled: (selected) => selected.length !== 1,
                disabledTitle: 'Select a single user to edit',
                onAction: (items) => { if (items.length === 1) handleEditUser(items[0]); },
              },
              {
                label: 'Delete',
                icon: Trash2,
                variant: 'danger',
                onAction: (items) => {
                  if (items.length === 1) {
                    setUserToDelete(items[0]);
                    setShowDeleteModal(true);
                  } else if (items.length > 1) {
                    setBulkDeleteConfirmItems(items);
                  }
                },
              },
            ]}
            columns={[
              { key: 'name', header: 'Name', sortable: true, render: (user: UserRow) => <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0"><Users className="w-4 h-4 text-white" /></div><span className="text-sm font-medium text-[#0F172A]">{user.email?.split('@')[0] || user.name || 'Unknown'}</span></div>, sortValue: (user: UserRow) => user.email?.split('@')[0] || user.name || '' },
              { key: 'email', header: 'Email', sortable: true, render: (user: UserRow) => <span className="text-sm text-[#64748B]">{user.email}</span>, sortValue: (user: UserRow) => user.email },
              { key: 'phone', header: 'Phone', render: (user: UserRow) => <span className="text-sm text-[#64748B]">{user.phone || '-'}</span> },
              {
                key: 'role', header: 'Role', sortable: true,
                render: (user: UserRow) => <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}>{user.role.replace('_', ' ').toUpperCase()}</span>,
                sortValue: (user: UserRow) => user.role,
              },
              {
                key: 'status', header: 'Status', sortable: true,
                render: (user: UserRow) => (
                  <div className="flex items-center gap-2">
                    <ToggleSwitch
                      checked={user.isActive !== false}
                      onChange={() => handleToggleUserStatus(user)}
                      onColor="bg-green-500"
                      offColor="bg-red-500"
                    />
                  </div>
                ),
                sortValue: (user: UserRow) => user.isActive !== false ? 1 : 0,
              },
            ]}
            actions={(user: UserRow) => (
              <div className="flex items-center justify-end gap-1.5">
                <button onClick={() => handleOpenPermissions(user)} className="p-2 text-[#475569] hover:bg-[#F1F5F9] rounded-lg transition-colors" title="Permissions"><Shield className="w-4 h-4" /></button>
                <button onClick={() => handleEditUser(user)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit User"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => { setUserToDelete(user); setShowDeleteModal(true); }} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete User"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          />
          </div>
        )}
      </div>

      {/* Permissions Modal */}
      {showPermissionsModal && permissionsUser && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50 transition-opacity duration-300"
            onClick={() => { setShowPermissionsModal(false); setPermissionsUser(null); }}
          />
          <div className="fixed inset-0 bg-white shadow-2xl transform transition-all duration-300 ease-in-out">
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1C64F2] to-[#4F46E5] flex items-center justify-center shadow-lg shadow-blue-500/25">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] leading-tight">Module Permissions</h2>
                    <p className="text-xs text-[var(--text-secondary)]">{permissionsUser.fullName || permissionsUser.email} ï¿½ {permissionsUser.role?.replace('_', ' ').toUpperCase()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {!permissionsUser._permLocked && (
                    <button
                      type="button"
                      onClick={handleSavePermissions}
                      className="px-6 py-2 bg-[var(--primary-blue)] text-white text-sm font-medium rounded-lg hover:bg-[#1E40AF] transition-colors flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" /> Save Permissions
                    </button>
                  )}
                  <button
                    onClick={() => { setShowPermissionsModal(false); setPermissionsUser(null); }}
                    className="p-2 bg-red-50 hover:bg-red-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-red-500" />
                  </button>
                </div>
              </div>

              <div className="px-6 py-3 border-b border-[var(--border-color)]">
                {permissionsUser._permLocked ? (
                  <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-purple-50 border border-purple-200">
                    <Lock className="w-4 h-4 text-purple-600 shrink-0" />
                    <p className="text-sm text-purple-700">
                      {permissionsUser.role === 'superadmin' ? 'Superadmin' : 'Admin'} has full access to every module. Permissions are locked and cannot be modified.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="grid grid-cols-[14px_1fr] gap-1.5 items-start text-xs leading-4 text-[var(--text-disabled)] mb-2"><Info className="w-3.5 h-3.5 mt-[1px] text-[var(--text-tertiary)]" /><span>Set default module access for this user. Can be changed later.</span></p>
                    <p className="grid grid-cols-[14px_1fr] gap-1.5 items-start text-xs leading-4 text-[var(--text-disabled)] mb-2"><Shield className="w-3.5 h-3.5 mt-[1px] text-[var(--text-tertiary)]" /><span>Access levels: No Access (red) hides the module, View (amber) is read-only, Edit (blue) allows changes, Full (green) grants complete control. Hover a level to see details.</span></p>
                    <p className="grid grid-cols-[14px_1fr] gap-1.5 items-start text-xs leading-4 text-[var(--text-disabled)] mb-2"><Power className="w-3.5 h-3.5 mt-[1px] text-[var(--text-tertiary)]" /><span>Toggle to enable or disable a module. Disabled modules are hidden and cannot be accessed. Use the level buttons to control how the user accesses an enabled module.</span></p>
                    <p className="grid grid-cols-[14px_1fr] gap-1.5 items-start text-xs leading-4 text-[var(--text-disabled)] mb-1"><ToggleRight className="w-3.5 h-3.5 mt-[1px] text-[var(--text-tertiary)]" /><span>Menu visibility controls whether the module appears in this user's sidebar.</span></p>
                  </div>
                )}
              </div>

              <div className="flex-1 px-6 py-6">
                {!permissionsUser._permLoaded && !permissionsUser._permLocked ? (
                  <div className="flex justify-center py-12">
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                        {MODULES.map((perm) => {
                          const p = permissionsUser._permMap?.[perm.code] || { level: 'none', menu_visible: false };
                          const currentLevel = permissionsUser._permLocked ? 'full' : p.level;
                          const disabled = permissionsUser._permLocked;
                          return (
                            <div key={perm.code} className={`bg-[var(--background)] rounded-xl border border-[var(--border-color)] p-3 ${disabled ? 'opacity-60' : ''}`}>
                              <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                  <perm.icon className="w-4 h-4 text-[var(--text-tertiary)]" />
                                  <span className="text-sm font-medium text-[var(--text-primary)]">{perm.label}</span>
                                </div>
                                <ToggleSwitch
                                  checked={disabled || p.menu_visible}
                                  onChange={() => setPermMenuVisible(perm.code, !p.menu_visible)}
                                  helpText={p.menu_visible ? 'Hidden from sidebar' : 'Visible in sidebar'}
                                  onColor="bg-cyan-500"
                                  offColor="bg-[#475569]"
                                />
                              </div>
                              <div className="inline-flex items-center rounded-full bg-white/70 border border-[var(--border-color)] p-1 gap-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
                                {(['none', 'view', 'edit', 'full'] as const).map((lvl) => {
                                  const active = currentLevel === lvl;
                                  const colors: Record<string, string> = {
                                    none: active ? 'bg-red-100 text-red-600' : 'text-[#64748B] hover:bg-gray-50',
                                    view: active ? 'bg-amber-100 text-amber-600' : 'text-[#64748B] hover:bg-gray-50',
                                    edit: active ? 'bg-blue-100 text-blue-600' : 'text-[#64748B] hover:bg-gray-50',
                                    full: active ? 'bg-emerald-100 text-emerald-600' : 'text-[#64748B] hover:bg-gray-50',
                                  };
                                  const labels: Record<string, string> = { none: 'No Access', view: 'View', edit: 'Edit', full: 'Full' };
                                  const icons: Record<string, LucideIcon> = { none: Ban, view: Eye, edit: Edit2, full: ShieldCheck };
                                  return (
                                    <button
                                      key={lvl}
                                      onClick={() => setPermLevel(perm.code, lvl)}
                                      disabled={disabled}
                                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${colors[lvl]} ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                                    >
                                      {(() => { const Icon = icons[lvl]; return <Icon className="w-3.5 h-3.5" />; })()}
                                      <span>{labels[lvl]}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                {/* Permission Summary */}
                {!permissionsUser._permLocked && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {MODULES.map((perm) => {
                      const p = permissionsUser._permMap?.[perm.code] || { level: 'none' };
                      if (p.level !== 'none') {
                        const badge = getPermissionBadge(p.level === 'full' ? 'write' : p.level === 'view' ? 'read' : 'none');
                        return (
                          <span key={perm.code} className={`px-2 py-1 rounded-lg text-xs font-medium border ${badge.color}`}>
                            {perm.label}: {badge.label}
                          </span>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50 transition-opacity duration-300"
            onClick={() => { setShowAddModal(false); setNewUser({ fullName: '', email: '', phone: '', password: '', passcode: '', role: '', isActive: null, dateJoined: '', joinTime: '', permissions: { ...defaultPermissions } }); }}
          />
          <div className="fixed inset-0 bg-white shadow-2xl transform transition-all duration-300 ease-in-out">
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1C64F2] to-[#4F46E5] flex items-center justify-center shadow-lg shadow-blue-500/25">
                    <UserPlus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] leading-tight">Add New User</h2>
                    <p className="text-xs text-[var(--text-secondary)]">Create a new system user account with role and access</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleAddUser}
                    className="px-6 py-2 bg-[var(--primary-blue)] text-white text-sm font-medium rounded-lg hover:bg-[#1E40AF] transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Create User
                  </button>
                  <button
                    onClick={() => { setShowAddModal(false); setNewUser({ fullName: '', email: '', phone: '', password: '', passcode: '', role: '', isActive: null, dateJoined: '', joinTime: '', permissions: { ...defaultPermissions } }); }}
                    className="p-2 bg-red-50 hover:bg-red-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-red-500" />
                  </button>
                </div>
              </div>

              <div className="px-6 py-3 bg-[#F0FDF4] border-b border-[var(--border-color)]">
                <p className="text-sm text-[#047857]">
                  <Info className="w-4 h-4 inline mr-1" />
                  Fill in the user details below and click Create User to save.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6">
                <div className="space-y-6">
                  <section>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
                      <span className="w-1.5 h-4 rounded-full bg-[#1C64F2]" /> Login Credentials
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-3">
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">User Name <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          autoComplete="off"
                          placeholder="e.g. Sayak Chattopadhyay"
                          value={newUser.fullName}
                          onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                          className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--background)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                        />
                        <p className="text-xs text-[var(--text-disabled)] mt-1">Display name of the user</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Date <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          readOnly
                          value={fmtDate(clock)}
                          className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--hover-bg)] text-[var(--text-primary)] cursor-not-allowed"
                        />
                        <p className="text-xs text-[var(--text-disabled)] mt-1">Live system date (read-only)</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Time <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          readOnly
                          value={fmtTime(clock)}
                          className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--hover-bg)] text-[var(--text-primary)] cursor-not-allowed"
                        />
                        <p className="text-xs text-[var(--text-disabled)] mt-1">Live system time (read-only)</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">User Email Address <span className="text-red-500">*</span></label>
                        <input
                          type="email"
                          autoComplete="off"
                          placeholder="e.g. sayak@hrms.com"
                          value={newUser.email}
                          onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                          className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--background)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                        />
                        <p className="text-xs text-[var(--text-disabled)] mt-1">Email address will be used as username for login (primary login)</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Password <span className="text-red-500">*</span></label>
                        <div className="flex items-stretch gap-2">
                          <div className="relative flex-1">
                            <input
                              type={showAddPw ? 'text' : 'password'}
                              autoComplete="new-password"
                              placeholder="Enter password"
                              value={newUser.password}
                              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                              className="w-full px-4 py-2.5 pr-10 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--background)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                            />
                            <button
                              type="button"
                              onClick={() => setShowAddPw(!showAddPw)}
                              title={showAddPw ? 'Hide password' : 'Show password'}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#64748B] hover:text-[#1C64F2] hover:bg-gray-100 transition-colors"
                            >
                              {showAddPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={newUser.password ? resetAddPassword : generateAddPassword}
                            title={newUser.password ? 'Reset password (clear and start over)' : 'Generate a random 10-character alphanumeric password'}
                            className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 shadow-md ${newUser.password ? 'bg-gradient-to-r from-[#F59E0B] to-[#EA580C] hover:from-[#D97706] hover:to-[#C2410C] text-white shadow-orange-500/25' : 'bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] text-white shadow-blue-500/25'}`}
                          >
                            {newUser.password ? <RotateCcw className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />} {newUser.password ? 'Reset' : 'Generate'}
                          </button>
                          {newUser.password && (
                            <button
                              type="button"
                              onClick={copyAddPassword}
                              title="Copy password"
                              className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all flex items-center gap-1.5 ${copiedPw === 'add' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-[var(--border-color)] text-[#0F172A] hover:bg-gray-50'}`}
                            >
                              {copiedPw === 'add' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copiedPw === 'add' ? 'Copied' : 'Copy'}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-disabled)] mt-1">Minimum 8 characters, include letters and numbers</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Status <span className="text-red-500">*</span></label>
                        <SearchableSelect
                          value={newUser.isActive === null ? '' : (newUser.isActive ? 'active' : 'inactive')}
                          onChange={(val) => setNewUser({ ...newUser, isActive: val.toString() === 'active' })}
                          options={[{ id: 'active', name: 'Active' }, { id: 'inactive', name: 'Inactive' }]}
                          placeholder="Select status"
                          showAllOption={false}
                          className="w-full"
                        />
                        <p className="text-xs text-[var(--text-disabled)] mt-1">Account status determines login access</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">User Role <span className="text-red-500">*</span> <span className="text-xs text-gray-500 font-normal ml-1">(System access level)</span></label>
                        <SearchableSelect
                          value={newUser.role}
                          onChange={(val) => applyRoleDefaults(val.toString())}
                          options={rolesOptions.map((opt: { code: string; name: string }) => ({ id: opt.code, name: opt.name }))}
                          placeholder="Select role"
                          className="w-full"
                        />
<div className="mt-2 rounded-lg border border-blue-200 bg-[#EFF6FF] p-3 relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#1C64F2] to-[#4F46E5]" />
                          <div className="flex items-start gap-2.5 pl-1.5">
                            <UserCog className="w-4 h-4 text-[#1C64F2] mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700/70">Access Level</p>
                              <p className="text-xs font-semibold text-[#1E3A8A] mt-0.5">Role governs system privileges</p>
                              <p className="text-[11px] text-[#1E40AF] mt-1 leading-relaxed">Each role carries a predefined set of permissions that apply consistently across all platforms. Module-level access can be adjusted individually in the Initial Permissions section below.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Phone Number <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          autoComplete="off"
                          placeholder="e.g. +91 98765 43210"
                          value={newUser.phone}
                          onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                          className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--background)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                        />
<div className="mt-2 rounded-lg border border-amber-200 bg-[#FFFBEB] p-3 relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-amber-400 to-orange-500" />
                          <div className="flex items-start gap-2.5 pl-1.5">
                            <Phone className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700/70">Secondary Login</p>
                              <p className="text-xs font-semibold text-[#92400E] mt-0.5">Phone enables alternate sign-in and verification</p>
                              <p className="text-[11px] text-[#B45309] mt-1 leading-relaxed">Phone enables alternate sign-in and verification. Users can sign in with their registered phone number. A one-time passcode is delivered via SMS for verification during login and account recovery don't share OTP.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Passcode <span className="text-red-500">*</span></label>
                        <div className="flex items-stretch gap-2">
                          <input
                            type="text"
                            autoComplete="new-password"
                            maxLength={7}
                            placeholder="Enter passcode"
                            value={newUser.passcode}
                            onChange={(e) => setNewUser({ ...newUser, passcode: e.target.value })}
                            className="flex-1 px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--background)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                          />
                          <button
                            type="button"
                            onClick={() => newUser.passcode ? resetPasscode('add') : generatePasscode('add')}
                            title={newUser.passcode ? 'Reset passcode (clear and start over)' : 'Generate a random 7-character alphanumeric passcode'}
                            className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 shadow-md ${newUser.passcode ? 'bg-gradient-to-r from-[#F59E0B] to-[#EA580C] hover:from-[#D97706] hover:to-[#C2410C] text-white shadow-orange-500/25' : 'bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] text-white shadow-blue-500/25'}`}
                          >
                            {newUser.passcode ? <RotateCcw className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />} {newUser.passcode ? 'Reset' : 'Generate'}
                          </button>
                        </div>
                        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-red-400 to-red-600" />
                          <div className="flex items-start gap-2.5 pl-1.5">
                            <ShieldAlert className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-red-700/70">Security Notice</p>
                              <p className="text-xs font-semibold text-[#B91C1C] mt-0.5">Safeguard the passcode</p>
                              <p className="text-[11px] text-[#DC2626] mt-1 leading-relaxed">This passcode grants login access across all platforms where the user holds permissions. Share it only with authorized personnel. Contact your administrator immediately if you suspect it has been compromised.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Permissions Section */}
                  <section>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
                      <span className="w-1.5 h-4 rounded-full bg-[#10B981]" /> Initial Permissions
                    </h3>
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-[#ECFDF5] p-3 relative overflow-hidden">
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#10B981] to-[#059669]" />
                      <div className="pl-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/70">Permissions Guide</p>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-start gap-2.5">
                            <Info className="w-4 h-4 text-[#059669] mt-0.5 shrink-0" />
                            <p className="text-[11px] text-[#047857] leading-relaxed">Set default module access for this user. Can be changed later.</p>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <Shield className="w-4 h-4 text-[#059669] mt-0.5 shrink-0" />
                            <p className="text-[11px] text-[#047857] leading-relaxed">Access levels: No Access (red) hides the module, View (amber) is read-only, Edit (blue) allows changes, Full (green) grants complete control. Hover a level to see details.</p>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <Power className="w-4 h-4 text-[#059669] mt-0.5 shrink-0" />
                            <p className="text-[11px] text-[#047857] leading-relaxed">Toggle to enable or disable a module. Disabled modules are hidden and cannot be accessed. Use the level buttons to control how the user accesses an enabled module.</p>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <ToggleRight className="w-4 h-4 text-[#059669] mt-0.5 shrink-0" />
                            <p className="text-[11px] text-[#047857] leading-relaxed">Menu visibility controls whether the module appears in this user's sidebar.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                      {MODULES.map((perm) => {
                        const currentLevel = newUser.permissions?.[perm.code] || 'none';
                        return (
                          <div key={perm.code} className="bg-[var(--background)] rounded-xl border border-[var(--border-color)] p-3">
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2">
                                <perm.icon className="w-4 h-4 text-[var(--text-tertiary)]" />
                                <span className="text-sm font-medium text-[var(--text-primary)]">{perm.label}</span>
                              </div>
                              <ToggleSwitch
                                checked={currentLevel !== 'none'}
                                onChange={(on) => setNewUser({
                                  ...newUser,
                                  permissions: { ...newUser.permissions, [perm.code]: on ? (currentLevel === 'none' ? 'view' : currentLevel) : 'none' }
                                })}
                                helpText={currentLevel !== 'none' ? 'Disable module access' : 'Enable module access'}
                                onColor="bg-cyan-500"
                                offColor="bg-[#475569]"
                              />
                            </div>
                            <div className="inline-flex items-center rounded-full bg-white/70 border border-[var(--border-color)] p-1 gap-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
                              {(['none', 'view', 'edit', 'full'] as const).map((lvl) => {
                                const active = currentLevel === lvl;
                                const colors: Record<string, string> = {
                                  none: active ? 'bg-red-100 text-red-600' : 'text-[#64748B] hover:bg-gray-50',
                                  view: active ? 'bg-amber-100 text-amber-600' : 'text-[#64748B] hover:bg-gray-50',
                                  edit: active ? 'bg-blue-100 text-blue-600' : 'text-[#64748B] hover:bg-gray-50',
                                  full: active ? 'bg-emerald-100 text-emerald-600' : 'text-[#64748B] hover:bg-gray-50',
                                };
                                const labels: Record<string, string> = { none: 'No Access', view: 'View', edit: 'Edit', full: 'Full' };
                                const icons: Record<string, LucideIcon> = { none: Ban, view: Eye, edit: Edit2, full: ShieldCheck };
                                return (
                                  <button
                                    type="button"
                                    key={lvl}
                                    onClick={() => setNewUser({
                                      ...newUser,
                                      permissions: { ...newUser.permissions, [perm.code]: lvl }
                                    })}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${colors[lvl]}`}
                                  >
                                    {(() => { const Icon = icons[lvl]; return <Icon className="w-3.5 h-3.5" />; })()}
                                    <span>{labels[lvl]}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50 transition-opacity duration-300"
            onClick={() => { setShowEditModal(false); setSelectedUser(null); }}
          />
          <div className="fixed inset-0 bg-white shadow-2xl transform transition-all duration-300 ease-in-out">
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1C64F2] to-[#4F46E5] flex items-center justify-center shadow-lg shadow-blue-500/25">
                    <UserPlus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] leading-tight">Edit User</h2>
                    <p className="text-xs text-[var(--text-secondary)]">Update the user account details with role and access</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveUser}
                    className="px-6 py-2 bg-[var(--primary-blue)] text-white text-sm font-medium rounded-lg hover:bg-[#1E40AF] transition-colors flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" /> Save Changes
                  </button>
                  <button
                    onClick={() => { setShowEditModal(false); setSelectedUser(null); }}
                    className="p-2 bg-red-50 hover:bg-red-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-red-500" />
                  </button>
                </div>
              </div>

              <div className="px-6 py-3 bg-[#F0FDF4] border-b border-[var(--border-color)]">
                <p className="text-sm text-[#047857]">
                  <Info className="w-4 h-4 inline mr-1" />
                  Update the user details below and click Save Changes to apply.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6">
                <div className="space-y-6">
                  <section>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
                      <span className="w-1.5 h-4 rounded-full bg-[#1C64F2]" /> Login Credentials
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-3">
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">User Name <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          autoComplete="off"
                          placeholder="e.g. Sayak Chattopadhyay"
                          value={selectedUser.fullName || ''}
                          onChange={(e) => setSelectedUser({ ...selectedUser, fullName: e.target.value })}
                          className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--background)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                        />
                        <p className="text-xs text-[var(--text-disabled)] mt-1">Display name of the user</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Date</label>
                        <input
                          type="text"
                          readOnly
                          value={selectedUser.dateJoined || nowISODate()}
                          className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--hover-bg)] text-[var(--text-primary)] cursor-not-allowed"
                        />
                        <p className="text-xs text-[var(--text-disabled)] mt-1">User creation date (read-only)</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Time</label>
                        <input
                          type="text"
                          readOnly
                          value={selectedUser.joinTime || nowISOTime()}
                          className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--hover-bg)] text-[var(--text-primary)] cursor-not-allowed"
                        />
                        <p className="text-xs text-[var(--text-disabled)] mt-1">User creation time (read-only)</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">User Email Address <span className="text-red-500">*</span></label>
                        <input
                          type="email"
                          autoComplete="off"
                          placeholder="e.g. sayak@hrms.com"
                          value={selectedUser.email || ''}
                          onChange={(e) => setSelectedUser({ ...selectedUser, email: e.target.value })}
                          className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--background)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                        />
                        <p className="text-xs text-[var(--text-disabled)] mt-1">Email address will be used as username for login (primary login)</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Password</label>
                        <div className="flex items-stretch gap-2">
                          <div className="relative flex-1">
                            <input
                              type={showEditPw ? 'text' : 'password'}
                              autoComplete="new-password"
                              readOnly
                              placeholder="Password cannot be changed"
                              value={selectedUser.password || ''}
                              className="w-full px-4 py-2.5 pr-10 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--background)] text-[var(--text-primary)] cursor-not-allowed"
                            />
                            <button
                              type="button"
                              onClick={() => setShowEditPw(!showEditPw)}
                              title={showEditPw ? 'Hide password' : 'Show password'}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#64748B] hover:text-[#1C64F2] hover:bg-gray-100 transition-colors"
                            >
                              {showEditPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={selectedUser.password ? resetEditPassword : generateEditPassword}
                            title={selectedUser.password ? 'Reset password (clear and start over)' : 'Generate a random 10-character alphanumeric password'}
                            className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 shadow-md ${selectedUser.password ? 'bg-gradient-to-r from-[#F59E0B] to-[#EA580C] hover:from-[#D97706] hover:to-[#C2410C] text-white shadow-orange-500/25' : 'bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] text-white shadow-blue-500/25'}`}
                          >
                            {selectedUser.password ? <RotateCcw className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />} {selectedUser.password ? 'Reset' : 'Generate'}
                          </button>
                          {selectedUser.password && (
                            <button
                              type="button"
                              onClick={copyEditPassword}
                              title="Copy password"
                              className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all flex items-center gap-1.5 ${copiedPw === 'edit' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-[var(--border-color)] text-[#0F172A] hover:bg-gray-50'}`}
                            >
                              {copiedPw === 'edit' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copiedPw === 'edit' ? 'Copied' : 'Copy'}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-disabled)] mt-1">{selectedUser.password ? 'Generated password will be applied on save. Copy it and share it with the user.' : 'Contact admin to reset the password'}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Status</label>
                        <SearchableSelect
                          value={selectedUser.isActive !== false ? 'active' : 'inactive'}
                          onChange={(val) => setSelectedUser({ ...selectedUser, isActive: val.toString() === 'active' })}
                          options={[{ id: 'active', name: 'Active' }, { id: 'inactive', name: 'Inactive' }]}
                          placeholder="Select status"
                          className="w-full"
                        />
                        <p className="text-xs text-[var(--text-disabled)] mt-1">Account status determines login access</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">User Role <span className="text-red-500">*</span> <span className="text-xs text-gray-500 font-normal ml-1">(System access level)</span></label>
                        <SearchableSelect
                          value={selectedUser.role || 'employee'}
                          onChange={(val) => setSelectedUser({ ...selectedUser, role: val.toString() })}
                          options={rolesOptions.map((opt: { code: string; name: string }) => ({ id: opt.code, name: opt.name }))}
                          placeholder="Select role"
                          className="w-full"
                        />
                        <div className="mt-2 rounded-lg border border-blue-200 bg-[#EFF6FF] p-3 relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#1C64F2] to-[#4F46E5]" />
                          <div className="flex items-start gap-2.5 pl-1.5">
                            <UserCog className="w-4 h-4 text-[#1C64F2] mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700/70">Access Level</p>
                              <p className="text-xs font-semibold text-[#1E3A8A] mt-0.5">Role governs system privileges</p>
                              <p className="text-[11px] text-[#1E40AF] mt-1 leading-relaxed">Each role carries a predefined set of permissions that apply consistently across all platforms. Module-level access can be adjusted individually in the Initial Permissions section below.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Phone Number <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          autoComplete="off"
                          placeholder="e.g. +91 98765 43210"
                          value={selectedUser.phone || ''}
                          onChange={(e) => setSelectedUser({ ...selectedUser, phone: e.target.value })}
                          className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--background)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                        />
                        <div className="mt-2 rounded-lg border border-amber-200 bg-[#FFFBEB] p-3 relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-amber-400 to-orange-500" />
                          <div className="flex items-start gap-2.5 pl-1.5">
                            <Phone className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700/70">Secondary Login</p>
                              <p className="text-xs font-semibold text-[#92400E] mt-0.5">Phone enables alternate sign-in and verification</p>
                              <p className="text-[11px] text-[#B45309] mt-1 leading-relaxed">Users can sign in with their registered phone number. A one-time passcode is delivered via SMS for verification during login and account recovery don't share OTP.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Passcode</label>
                        <div className="flex items-stretch gap-2">
                          <input
                            type="text"
                            autoComplete="new-password"
                            maxLength={7}
                            placeholder="Leave blank to keep current"
                            value={selectedUser.passcode || ''}
                            onChange={(e) => setSelectedUser({ ...selectedUser, passcode: e.target.value })}
                            className="flex-1 px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-[var(--background)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                          />
                          <button
                            type="button"
                            onClick={() => selectedUser.passcode ? resetPasscode('edit') : generatePasscode('edit')}
                            title={selectedUser.passcode ? 'Discard the edit (the stored passcode is kept)' : 'Generate a random 7-character alphanumeric passcode'}
                            className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 shadow-md ${selectedUser.passcode ? 'bg-gradient-to-r from-[#F59E0B] to-[#EA580C] hover:from-[#D97706] hover:to-[#C2410C] text-white shadow-orange-500/25' : 'bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] hover:from-[#1D4ED8] hover:to-[#4338CA] text-white shadow-blue-500/25'}`}
                          >
                            {selectedUser.passcode ? <RotateCcw className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />} {selectedUser.passcode ? 'Reset' : 'Generate'}
                          </button>
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">Stored passcodes are never shown again — leave blank to keep the current one.</p>
                        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-red-400 to-red-600" />
                          <div className="flex items-start gap-2.5 pl-1.5">
                            <ShieldAlert className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-red-700/70">Security Notice</p>
                              <p className="text-xs font-semibold text-[#B91C1C] mt-0.5">Safeguard the passcode</p>
                              <p className="text-[11px] text-[#DC2626] mt-1 leading-relaxed">This passcode grants login access across all platforms where the user holds permissions. Share it only with authorized personnel. Contact your administrator immediately if you suspect it has been compromised.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Permissions Section */}
                  <section>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
                      <span className="w-1.5 h-4 rounded-full bg-[#10B981]" /> Initial Permissions
                    </h3>
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-[#ECFDF5] p-3 relative overflow-hidden">
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#10B981] to-[#059669]" />
                      <div className="pl-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/70">Permissions Guide</p>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-start gap-2.5">
                            <Info className="w-4 h-4 text-[#059669] mt-0.5 shrink-0" />
                            <p className="text-[11px] text-[#047857] leading-relaxed">Set default module access for this user. Can be changed later.</p>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <Shield className="w-4 h-4 text-[#059669] mt-0.5 shrink-0" />
                            <p className="text-[11px] text-[#047857] leading-relaxed">Access levels: No Access (red) hides the module, View (amber) is read-only, Edit (blue) allows changes, Full (green) grants complete control. Hover a level to see details.</p>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <Power className="w-4 h-4 text-[#059669] mt-0.5 shrink-0" />
                            <p className="text-[11px] text-[#047857] leading-relaxed">Toggle to enable or disable a module. Disabled modules are hidden and cannot be accessed. Use the level buttons to control how the user accesses an enabled module.</p>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <ToggleRight className="w-4 h-4 text-[#059669] mt-0.5 shrink-0" />
                            <p className="text-[11px] text-[#047857] leading-relaxed">Menu visibility controls whether the module appears in this user's sidebar.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                      {MODULES.map((perm) => {
                        const currentLevel = editPerms[perm.code] || 'none';
                        return (
                          <div key={perm.code} className="bg-[var(--background)] rounded-xl border border-[var(--border-color)] p-3">
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2">
                                <perm.icon className="w-4 h-4 text-[var(--text-tertiary)]" />
                                <span className="text-sm font-medium text-[var(--text-primary)]">{perm.label}</span>
                              </div>
                              <ToggleSwitch
                                checked={currentLevel !== 'none'}
                                onChange={(on) => setEditPerms({
                                  ...editPerms,
                                  [perm.code]: on ? (currentLevel === 'none' ? 'view' : currentLevel) : 'none'
                                })}
                                helpText={currentLevel !== 'none' ? 'Disable module access' : 'Enable module access'}
                                onColor="bg-cyan-500"
                                offColor="bg-[#475569]"
                              />
                            </div>
                            <div className="inline-flex items-center rounded-full bg-white/70 border border-[var(--border-color)] p-1 gap-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
                              {(['none', 'view', 'edit', 'full'] as const).map((lvl) => {
                                const active = currentLevel === lvl;
                                const colors: Record<string, string> = {
                                  none: active ? 'bg-red-100 text-red-600' : 'text-[#64748B] hover:bg-gray-50',
                                  view: active ? 'bg-amber-100 text-amber-600' : 'text-[#64748B] hover:bg-gray-50',
                                  edit: active ? 'bg-blue-100 text-blue-600' : 'text-[#64748B] hover:bg-gray-50',
                                  full: active ? 'bg-emerald-100 text-emerald-600' : 'text-[#64748B] hover:bg-gray-50',
                                };
                                const labels: Record<string, string> = { none: 'No Access', view: 'View', edit: 'Edit', full: 'Full' };
                                const icons: Record<string, LucideIcon> = { none: Ban, view: Eye, edit: Edit2, full: ShieldCheck };
                                return (
                                  <button
                                    type="button"
                                    key={lvl}
                                    onClick={() => setEditPerms({ ...editPerms, [perm.code]: lvl })}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${colors[lvl]}`}
                                  >
                                    {(() => { const Icon = icons[lvl]; return <Icon className="w-3.5 h-3.5" />; })()}
                                    <span>{labels[lvl]}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card)] rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Delete User</h3>
                <p className="text-sm text-[var(--text-disabled)]">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-2">
              Are you sure you want to delete <span className="font-medium text-[var(--text-primary)]">{userToDelete.fullName || userToDelete.email}</span>?
            </p>
            <p className="text-xs text-[var(--text-disabled)] mb-6">This will permanently remove their account, data, and all associated records. This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteUser}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors"
              >
                Delete User
              </button>
              <button
                onClick={() => { setShowDeleteModal(false); setUserToDelete(null); }}
                className="flex-1 px-4 py-2.5 bg-[var(--background)] text-[var(--text-primary)] text-sm font-medium rounded-xl hover:bg-[var(--hover-bg)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmActionModal
        isOpen={!!bulkDeleteConfirmItems}
        title={`Delete ${bulkDeleteConfirmItems?.length || 0} user(s)?`}
        message={`You are about to permanently delete ${bulkDeleteConfirmItems?.length || 0} selected user(s).`}
        consequence="This action cannot be undone. All user accounts and associated data will be permanently removed."
        confirmLabel="Delete Users"
        variant="danger"
        isPending={false}
        onConfirm={() => {
          if (bulkDeleteConfirmItems) {
            Promise.all(bulkDeleteConfirmItems.map((u: UserRow) => api.delete(`/api/users/${u.id}`)))
              .then(() => { toast.success(`${bulkDeleteConfirmItems.length} user(s) deleted`); loadUsers(); })
              .catch(() => toast.error('Failed to delete users'));
            setBulkDeleteConfirmItems(null);
          }
        }}
        onCancel={() => setBulkDeleteConfirmItems(null)}
      />
      <Modal
        isOpen={provisionPreview !== null}
        onClose={() => { if (!provisioning) setProvisionPreview(null); }}
        title="Provision user accounts"
      >
        {provisionPreview && (
          <div className="space-y-4">
            {provisionPreview.count === 0 ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 mx-auto mb-3 bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                </div>
                <p className="text-sm font-medium text-[#0F172A]">All employees already have accounts</p>
                <p className="text-xs text-[#94A3B8] mt-1">There are no employees missing a login account right now.</p>
              </div>
            ) : (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-semibold">{provisionPreview.count} employee{provisionPreview.count === 1 ? '' : 's'} will get a new login account</p>
                    <p className="text-xs mt-1">
                      They'll sign in with the default password <span className="font-mono font-semibold">TempPass123!</span> and can change it after first login.
                      {provisionPreview.skipped > 0 && ` ${provisionPreview.skipped} employee${provisionPreview.skipped === 1 ? '' : 's'} will be skipped (missing or already used email).`}
                    </p>
                  </div>
                </div>
                <div className="border border-[#E2E8F0] rounded-xl divide-y divide-[#F1F5F9] max-h-64 overflow-y-auto">
                  {provisionPreview.employees.map((emp) => (
                    <div key={emp.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="text-sm font-medium text-[#0F172A] truncate">{emp.name}</span>
                      <span className="text-xs text-[#94A3B8] truncate">{emp.email}</span>
                    </div>
                  ))}
                  {provisionPreview.count > 50 && (
                    <div className="px-4 py-2.5 text-xs text-[#94A3B8] text-center">
                      + {provisionPreview.count - 50} more
                    </div>
                  )}
                </div>
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleProvisionConfirm}
                    disabled={provisioning}
                    className="flex-1 px-4 py-2.5 bg-amber-500 text-white text-sm font-medium rounded-xl hover:bg-amber-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {provisioning ? 'Creating accounts...' : `Create ${provisionPreview.count} Account${provisionPreview.count === 1 ? '' : 's'}`}
                  </button>
                  <button
                    onClick={() => setProvisionPreview(null)}
                    disabled={provisioning}
                    className="flex-1 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] text-sm font-medium rounded-xl hover:bg-[#F1F5F9] transition-colors disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

const DeviceSettings = () => {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [allowMultiDevice, setAllowMultiDevice] = useState(false);
  const [revokeDeviceTarget, setRevokeDeviceTarget] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      const response = await api.get('/api/auth/devices');
      setDevices(response.data.devices || []);
      setAllowMultiDevice(response.data.allow_multi_device || false);
    } catch {
      // Error logged
    } finally {
      setLoading(false);
    }
  };

  const handleRename = async (deviceId: number) => {
    try {
      await api.put(`/api/auth/devices/${deviceId}/name`, null, {
        params: { name: editName }
      });
      toast.success('Device renamed successfully');
      setEditingId(null);
      loadDevices();
    } catch {
      toast.error('Failed to rename device');
    }
  };

  const handleRevoke = async (deviceId: number) => {
    setRevokeDeviceTarget({ id: deviceId, name: 'this device' });
  };

  const confirmRevokeDevice = async () => {
    if (!revokeDeviceTarget) return;
    try {
      await api.delete(`/api/auth/devices/${revokeDeviceTarget.id}`);
      toast.success('Device revoked successfully');
      loadDevices();
    } catch {
      toast.error('Failed to revoke device');
    }
    setRevokeDeviceTarget(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[#1C64F2]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Device Management</h3>
          <p className="text-sm text-[var(--text-disabled)]">Manage devices that can access your account. If you notice unrecognized devices, revoke them immediately.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-secondary)]">Multi-device access:</span>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${allowMultiDevice ? 'bg-[var(--success-green)] text-white' : 'bg-[var(--text-disabled)] text-white'}`}>
            {allowMultiDevice ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      {!allowMultiDevice && devices.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">
            <strong>Single device mode:</strong> You can only login from one device. Contact your administrator to enable multi-device access.
          </p>
        </div>
      )}

      {devices.length === 0 ? (
        <div className="bg-[var(--background)] rounded-lg p-8 text-center">
          <Shield className="w-12 h-12 mx-auto mb-4 text-[var(--text-disabled)] opacity-50" />
          <p className="text-[var(--text-disabled)]">No devices registered yet. Devices will be automatically registered when you login.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
          <div className="overflow-x-auto">
          <DataTable
            data={devices}
            rowKey={(device) => device.id}
            logEntityType="device"
            logFor={(device) => ({ id: device.id, label: device.device_name })}
            searchable
            searchKeys={(device) => `${device.device_name} ${device.device_type} ${device.ip_address || ''}`}
            searchPlaceholder="Search devices..."
            emptyMessage="No devices registered"
            columns={[
              {
                key: 'device_name', header: 'Device', sortable: true,
                render: (device) => (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                      <Monitor className="w-4 h-4 text-white" />
                    </div>
                    {device.is_current && <span className="px-2 py-0.5 bg-[#059669] text-white text-xs rounded-full">Current</span>}
                    {editingId === device.id ? (
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="px-2 py-1 border border-[#E2E8F0] rounded text-sm w-40" autoFocus />
                    ) : (
                      <span className="text-sm font-medium text-[#0F172A]">{device.device_name}</span>
                    )}
                  </div>
                ),
                sortValue: (device) => device.device_name,
              },
              { key: 'device_type', header: 'Type', render: (device) => <span className="text-sm text-[#64748B] capitalize">{device.device_type}</span> },
              { key: 'ip_address', header: 'IP Address', render: (device) => <span className="text-sm text-[#64748B]">{device.ip_address}</span> },
              { key: 'last_used', header: 'Last Used', render: (device) => <span className="text-sm text-[#64748B]">{device.last_used ? formatAppDate(device.last_used) : 'Never'}</span> },
            ]}
            actions={(device) => (
              <div className="flex items-center justify-end gap-1.5">
                {editingId === device.id ? (
                  <>
                    <button onClick={() => handleRename(device.id)} className="p-2 text-[#059669] hover:bg-[#059669]/10 rounded-lg transition-colors"><Check className="w-4 h-4" /></button>
                    <button onClick={() => { setEditingId(null); setEditName(''); }} className="p-2 text-[#94A3B8] hover:bg-[#F1F5F9] rounded-lg transition-colors"><RotateCcw className="w-4 h-4" /></button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditingId(device.id); setEditName(device.device_name); }} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                    {!device.is_current && (
                      <button onClick={() => handleRevoke(device.id)} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </>
                )}
              </div>
            )}
          />
          </div>
        </div>
      )}
      <ConfirmDeleteModal
        isOpen={revokeDeviceTarget !== null}
        onConfirm={confirmRevokeDevice}
        onClose={() => setRevokeDeviceTarget(null)}
        itemName={revokeDeviceTarget?.name}
      />
    </div>
  );
};

const Settings = () => {
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState('general');
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  useUnsavedChangesWarning(isDirty);

  const markDirty = () => { if (!isDirty) setIsDirty(true); };

  // Country / timezone / currency come from the local catalog (all countries)
  const countryOptions = useMemo(() => COUNTRY_NAMES.map((name) => ({ code: name, name })), []);
  const timezoneOptions = useMemo(
    () => getTimezoneCodes().map((tz) => ({ code: tz, name: tz })),
    []
  );
  // "USD ($) - US Dollar" â€” CurrencySelect parses code, symbol, full name
  const currencyOptions = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames(['en'], { type: 'currency' });
    } catch { /* older browsers */ }
    return CURRENCY_CODES.map((code) => {
      const symbol = getCurrencySymbol(code);
      let label = code;
      try {
        label = names?.of(code) || code;
      } catch { /* unknown code */ }
      if (label === code) return { code, name: `${code} (${symbol})` };
      return { code, name: `${code} (${symbol}) - ${label}` };
    });
  }, []);
  // Date formats: pattern is the stored code, example shown as dropdown detail
  const dateFormatOptions = useMemo(
    () => DATE_FORMAT_OPTIONS.map((opt) => ({ code: opt.code, name: `${opt.code} (${opt.example})` })),
    []
  );
  const timeFormatOptions = useMemo(
    () => TIME_FORMAT_OPTIONS.map((opt) => ({ code: opt.code, name: `${opt.name} (${opt.example})` })),
    []
  );
  const financialYearOptions = useMemo(
    () => FINANCIAL_YEAR_MONTHS.map((month) => ({ code: month, name: month })),
    []
  );


  // Load settings from API on mount
  const loadSettings = async () => {
    try {
      const [general, notifications, security, integrations] = await Promise.all([
        settingsApi.fetchGeneralSettings().catch(() => null),
        settingsApi.fetchNotifications().catch(() => null),
        settingsApi.fetchSecuritySettings().catch(() => null),
        settingsApi.fetchIntegrations().catch(() => null),
      ]);
      if (general) {
        setGeneral(general);
        if (general.currency) localStorage.setItem('appCurrency', general.currency);
        syncAppSettings({
          dateFormat: general.dateFormat || 'DD/MM/YYYY',
          timeFormat: general.timeFormat || 'HH:mm',
          timezone: general.timezone || 'Asia/Kolkata',
          financialYear: general.financialYear || 'April',
          country: general.country || 'India',
        });
      }
      if (notifications) setNotifications(normalizeNotificationSettings(notifications));
      if (security) {
        setSecurity({
          deviceLock: security.deviceLock ?? false,
          twoFactor: security.twoFactor ?? false,
          sessionTimeout: security.sessionTimeout ?? true,
          ipAllowlist: security.ipAllowlist ?? false,
          allowedIPs: security.allowedIPs || '',
        });
      }
      const user = getCurrentUser();
      const orgId = user?.organizationId || 1;
      api.get<{ logoUrl?: string; logo_url?: string }>(`/organizations/${orgId}`).then(r => {
        const logo = r.data.logoUrl || (r.data as { logo_url?: string }).logo_url || '';
        if (logo) setOrgLogo(logo);
      }).catch(() => {});
      if (integrations) setIntegrations(integrations);
    } catch {
      // Error logged
    } finally {
      setMounted(true);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // =============================================================================
  // GENERAL STATE
  // =============================================================================
  const [general, setGeneral] = useState({
    orgName: 'TechCorp Solutions',
    language: 'en',
    timezone: 'Asia/Kolkata',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm',
    currency: 'INR',
    country: 'India',
    financialYear: 'April',
    geoFence: true,
    selfService: true,
    docUploads: true,
    multiCompany: false,
    autoEmails: false,
  });
  const [orgLogo, setOrgLogo] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [notifications, setNotifications] = useState<NotificationRow[]>(DEFAULT_NOTIFICATION_SETTINGS);

  const [security, setSecurity] = useState({
    deviceLock: false,
    twoFactor: true,
    sessionTimeout: true,
    ipAllowlist: false,
    allowedIPs: '192.168.1.0/24, 10.0.0.0/8',
  });

  const [integrations, setIntegrations] = useState({
    slack: true,
    google: false,
    payrollExport: true,
    biometric: false,
  });

  // =============================================================================
  // HANDLERS
  // =============================================================================

  const updateNotification = (index: number, channel: 'inApp' | 'email' | 'sms') => {
    const newNotifs = [...notifications];
    newNotifs[index][channel] = !newNotifs[index][channel];
    setNotifications(newNotifs);
  };

  const handleSave = async (apiCall: () => Promise<void>, label: string) => {
    setSaving(label);
    try {
      await apiCall();
      setIsDirty(false);
      toast.success(`${label} saved`);
      // Persist selected currency so all pages display amounts in it
      if (label === 'general') {
        localStorage.setItem('appCurrency', general.currency || 'INR');
        syncAppSettings({
          dateFormat: general.dateFormat || 'DD/MM/YYYY',
          timeFormat: general.timeFormat || 'HH:mm',
          timezone: general.timezone || 'Asia/Kolkata',
          financialYear: general.financialYear || 'April',
          country: general.country || 'India',
        });
      }
    } catch {
      toast.error(`Failed to save ${label}`);
    } finally {
      setSaving(null);
    }
  };

  const handleCountryChange = (country: string) => {
    markDirty();
    const defaults = getCountryDefaults(country);
    setGeneral((prev) => ({
      ...prev,
      country,
      ...(defaults
        ? {
            timezone: defaults.timezone,
            currency: defaults.currency,
            financialYear: defaults.financialYear,
            dateFormat: defaults.dateFormat,
          }
        : {}),
    }));
    if (defaults) {
      localStorage.setItem('appCurrency', defaults.currency);
      syncAppSettings({
        dateFormat: defaults.dateFormat,
        timezone: defaults.timezone,
        financialYear: defaults.financialYear,
        country,
      });
      toast.success(`Timezone, currency & date format updated for ${country}`);
    }
  };

  const handleLogoUpload = async (file: File) => {
    const user = getCurrentUser();
    const orgId = user?.organizationId || 1;
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<{ logo_url: string }>(`/organizations/${orgId}/logo`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setOrgLogo(res.data.logo_url || '');
      toast.success('Logo uploaded');
    } catch {
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleLogoUpload(file);
    e.target.value = '';
  };

  // =============================================================================
  // RENDER PANELS
  // =============================================================================

  const renderPanel = () => {
    switch (activePanel) {
      case 'general':
        return (
          <div className="space-y-6">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
              <h4 className="font-semibold text-[#0F172A] mb-1">Organisation logo</h4>
              <p className="text-xs text-[#94A3B8] mb-3">Shown on offer letters, payslips, and exit documents. PNG, JPG or WebP.</p>
              <div className="flex items-center gap-4">
                {orgLogo ? (
                  <img src={orgLogo} alt="Org logo" className="w-16 h-16 rounded-xl border border-[#E2E8F0] object-contain bg-white" />
                ) : (
                  <div className="w-16 h-16 rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-[#94A3B8]" />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium cursor-pointer transition-colors ${uploadingLogo ? 'bg-[#E2E8F0] text-[#64748B]' : 'bg-[#0D9488] text-white hover:bg-[#0F766E]'}`}>
                    {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploadingLogo ? 'Uploading...' : 'Upload logo'}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleLogoChange} />
                  </label>
                  {orgLogo && (
                    <button onClick={() => { setOrgLogo(''); }} className="px-3 py-2 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">Remove</button>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Organisation name" description="Managed at tenant registration and cannot be changed here">
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 border border-[#E2E8F0] rounded-xl bg-[#F8FAFC] text-[#64748B]">
                  <Lock className="w-4 h-4 text-[#94A3B8] shrink-0" />
                  <span className="text-sm font-medium truncate">{general.orgName}</span>
                </div>
              </FormField>
              <FormField label="Default language" description="Set to English for now. Full language support coming later.">
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 border border-[#E2E8F0] rounded-xl bg-[#F8FAFC] text-[#64748B]">
                  <Lock className="w-4 h-4 text-[#94A3B8] shrink-0" />
                  <span className="text-sm font-medium truncate">English</span>
                </div>
              </FormField>
              <FormField label="Country" description="Timezone, currency, financial year and date format update automatically when you change country">
                <MasterSelect
                  value={general.country || 'India'}
                  onChange={handleCountryChange}
                  options={countryOptions}
                  icon={Globe}
                  subtitle="Country"
                  placeholder="Select country"
                />
              </FormField>
              <FormField label="Timezone">
                <MasterSelect
                  value={general.timezone || 'all'}
                  onChange={(code) => { markDirty(); setGeneral({ ...general, timezone: code === 'all' ? 'UTC' : code }); }}
                  options={timezoneOptions}
                  icon={Clock}
                  subtitle="Timezone"
                  placeholder="Select timezone"
                />
                <p className="mt-1 text-xs text-gray-400">Company's primary timezone, e.g. Asia/Kolkata</p>
              </FormField>
              <FormField label="Date format">
                <MasterSelect
                  value={general.dateFormat || 'all'}
                  onChange={(code) => {
                    const dateFormat = code === 'all' ? 'DD/MM/YYYY' : code;
                    setGeneral({ ...general, dateFormat });
                    syncAppSettings({ dateFormat });
                  }}
                  options={dateFormatOptions}
                  icon={CalendarDays}
                  subtitle="Date format"
                  placeholder="Select date format"
                />
                <p className="mt-1 text-xs text-gray-400">How dates display, e.g. DD/MM/YYYY</p>
              </FormField>
              <FormField label="Time format">
                <MasterSelect
                  value={general.timeFormat || 'HH:mm'}
                  onChange={(code) => {
                    const timeFormat = code === 'all' ? 'HH:mm' : code;
                    setGeneral({ ...general, timeFormat });
                    syncAppSettings({ timeFormat });
                  }}
                  options={timeFormatOptions}
                  icon={Clock}
                  subtitle="Time format"
                  placeholder="Select time format"
                />
                <p className="mt-1 text-xs text-gray-400">How times display, e.g. 14:30 or 02:30 PM</p>
              </FormField>
              <FormField label="Currency">
                <CurrencySelect
                  value={general.currency || 'INR'}
                  onChange={(code) => setGeneral({ ...general, currency: code })}
                  options={currencyOptions}
                />
                <p className="mt-1 text-xs text-gray-400">Default currency for salaries, e.g. INR</p>
              </FormField>
              <FormField label="Financial year start">
                <MasterSelect
                  value={general.financialYear || 'all'}
                  onChange={(code) => setGeneral({ ...general, financialYear: code === 'all' ? 'April' : code })}
                  options={financialYearOptions}
                  icon={CalendarRange}
                  subtitle="Financial year"
                  placeholder="Select financial year"
                />
                <p className="mt-1 text-xs text-gray-400">Start month of your financial year</p>
              </FormField>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
              <h4 className="font-semibold text-[#0F172A] mb-1">Feature toggles</h4>
              <p className="text-xs text-[#94A3B8] mb-3">Enable or disable optional features for your organisation</p>
              <div className="space-y-2">
                <ToggleRow label="Geo-fence attendance" subtitle="Require employees to be within office radius" checked={general.geoFence} onChange={() => { markDirty(); setGeneral({...general, geoFence: !general.geoFence}); }} />
                <ToggleRow label="Self-service portal" subtitle="Allow employees to update their own information" checked={general.selfService} onChange={() => { markDirty(); setGeneral({...general, selfService: !general.selfService}); }} />
                <ToggleRow label="Document uploads" subtitle="Enable document upload for employees" checked={general.docUploads} onChange={() => { markDirty(); setGeneral({...general, docUploads: !general.docUploads}); }} />
                <ToggleRow label="Multi-company payroll" subtitle="Handle payroll separately for each company" checked={general.multiCompany} onChange={() => { markDirty(); setGeneral({...general, multiCompany: !general.multiCompany}); }} />
                <ToggleRow label="Auto-emails on onboarding" subtitle="Send welcome emails with credentials when employees are added (uses your email quota)" checked={general.autoEmails} onChange={() => { markDirty(); setGeneral({...general, autoEmails: !general.autoEmails}); }} />
              </div>
            </div>
            <div className="flex gap-3">
              <SaveButton onSave={() => handleSave(() => settingsApi.saveGeneralSettings(general), 'general')} saving={saving === 'general'} />
              <DiscardButton onDiscard={() => loadSettings()} />
            </div>
          </div>
        );

      case 'billing':
        return (
          <BillingPanel />
        );

      case 'notifications':
        return (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-disabled)]">Choose how you want to be notified for each event</p>
            <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="overflow-x-auto">
              <DataTable
                data={notifications}
                rowKey={(notif: NotificationRow) => notif.event}
                logEntityType="notification"
                logFor={(notif: NotificationRow) => ({ id: notif.event, label: notif.event })}
                emptyMessage="No notifications configured"
                columns={[
                  { key: 'event', header: 'Event', sortable: true, render: (notif: NotificationRow) => <span className="text-sm text-[#0F172A]">{notif.event}</span>, sortValue: (notif: NotificationRow) => notif.event },
                  {
                    key: 'inApp', header: 'In-app', align: 'center',
                    render: (notif: NotificationRow) => {
                      const idx = notifications.findIndex((n: NotificationRow) => n.event === notif.event);
                      return <input type="checkbox" checked={notif.inApp} onChange={() => updateNotification(idx, 'inApp')} className="w-4 h-4 rounded border-[#E2E8F0] text-[#1C64F2]" />;
                    },
                  },
                  {
                    key: 'email', header: 'Email', align: 'center',
                    render: (notif: NotificationRow) => {
                      const idx = notifications.findIndex((n: NotificationRow) => n.event === notif.event);
                      return <input type="checkbox" checked={notif.email} onChange={() => updateNotification(idx, 'email')} className="w-4 h-4 rounded border-[#E2E8F0] text-[#1C64F2]" />;
                    },
                  },
                  {
                    key: 'sms', header: 'SMS', align: 'center',
                    render: (notif: NotificationRow) => {
                      const idx = notifications.findIndex((n: NotificationRow) => n.event === notif.event);
                      return <input type="checkbox" checked={notif.sms} onChange={() => updateNotification(idx, 'sms')} className="w-4 h-4 rounded border-[#E2E8F0] text-[#1C64F2]" />;
                    },
                  },
                ]}
              />
              </div>
            </div>
            <SaveButton onSave={() => handleSave(() => settingsApi.saveNotifications(notifications), 'notifications')} saving={saving === 'notifications'} />
          </div>
        );

      case 'security':
        return (
          <div className="space-y-6">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2">
              <ToggleRow label="Two-factor authentication" subtitle="Require 2FA for all admin accounts" checked={security.twoFactor} onChange={() => setSecurity({...security, twoFactor: !security.twoFactor})} />
              <ToggleRow label="Session timeout" subtitle="Auto logout after 30 minutes of inactivity" checked={security.sessionTimeout} onChange={() => setSecurity({...security, sessionTimeout: !security.sessionTimeout})} />
              <ToggleRow label="IP allowlisting" subtitle="Restrict login to specific IP addresses" checked={security.ipAllowlist} onChange={() => setSecurity({...security, ipAllowlist: !security.ipAllowlist})} />
            </div>
            <FormField label="Allowed IP addresses (comma-separated)" description="Example: 192.168.1.0/24, 10.0.0.0/8">
              <textarea
                value={security.allowedIPs}
                onChange={(e) => setSecurity({...security, allowedIPs: e.target.value})}
                disabled={!security.ipAllowlist}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-[var(--card)] text-[var(--text-primary)] disabled:opacity-50"
                rows={3}
              />
            </FormField>
            <div className="flex items-center gap-4 pt-4 border-t border-[var(--border-color)]">
              <button onClick={() => api.post('/auth/devices/revoke-all').then(() => toast.success('All device sessions revoked')).catch(() => toast.error('Failed to revoke sessions'))} className="flex items-center gap-2 px-4 py-2 bg-[var(--danger-red)] text-white rounded-lg text-sm font-medium hover:opacity-90">
                <Lock className="w-4 h-4" />
                Revoke all sessions
              </button>
              <button onClick={() => settingsApi.downloadAuditLog().then(() => toast.success('Audit log downloaded')).catch(() => toast.error('Failed to download audit log'))} className="flex items-center gap-2 px-4 py-2 border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg text-sm font-medium hover:bg-[var(--hover-bg)]">
                <Download className="w-4 h-4" />
                Download audit log
              </button>
            </div>
            <div className="flex gap-3">
              <SaveButton onSave={() => handleSave(() => settingsApi.saveSecuritySettings(security), 'security')} saving={saving === 'security'} />
              <DiscardButton onDiscard={() => loadSettings()} />
            </div>
          </div>
        );

      case 'users':
        return <UserManagementPanel />;

      case 'devices':
        return <DeviceSettings />;

      case 'integrations':
        return (
          <div className="space-y-4">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2">
              <ToggleRow label="Slack notifications" subtitle="Send HR notifications to your Slack workspace" checked={integrations.slack} onChange={() => setIntegrations({...integrations, slack: !integrations.slack})} />
              <ToggleRow label="Google Workspace SSO" subtitle="Enable Google single sign-on for employees" checked={integrations.google} onChange={() => setIntegrations({...integrations, google: !integrations.google})} />
              <ToggleRow label="Payroll accounting export" subtitle="Export to Tally, QuickBooks, or other accounting software" checked={integrations.payrollExport} onChange={() => setIntegrations({...integrations, payrollExport: !integrations.payrollExport})} />
              <ToggleRow label="Biometric device sync" subtitle="Sync attendance data from biometric devices" checked={integrations.biometric} onChange={() => setIntegrations({...integrations, biometric: !integrations.biometric})} />
            </div>
            <div className="flex gap-3 pt-4">
              <SaveButton onSave={() => handleSave(() => settingsApi.saveIntegrations(integrations), 'integrations')} saving={saving === 'integrations'} />
            </div>
          </div>
        );

      case 'audit':
        return <ActivityLog />;

      case 'hr-policies':
        return <HRPoliciesPanel />;

      default:
        return <div className="text-[var(--text-disabled)]">Select a setting from the sidebar</div>;
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--background)] animate-page-enter">
        <div className="w-full mx-auto space-y-6 p-6">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  // =============================================================================
  // MAIN RENDER
  // =============================================================================

  return (
    <div className={`min-h-screen transition-all duration-300 animate-page-enter ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      <PageHero
        title="Settings"
        subtitle="Configure your HRMS application settings"
        icon={SettingsIcon}
        accent="slate"
        breadcrumbs={['HRMS.Pro!', 'Settings']}
        actions={
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-white/10 text-blue-100 border border-white/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            All systems operational
          </div>
        }
      />

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* SIDEBAR */}
        <div className="lg:w-72 shrink-0 w-full">
          <div className="bg-white rounded-2xl border border-[var(--border-color)] shadow-sm overflow-hidden sticky top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
            {NAV_GROUPS.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.id} className="px-4 py-4 border-b border-[#F1F5F9] last:border-0">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="w-6 h-6 rounded-lg bg-[#F1F5F9] flex items-center justify-center">
                      <GroupIcon className="w-3.5 h-3.5 text-[#64748B]" />
                    </div>
                    <h3 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">{group.label}</h3>
                  </div>
                  <nav className="space-y-1">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => item.href ? navigate(item.href) : setActivePanel(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-left ${
                          activePanel === item.id
                            ? 'bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] text-white shadow-md shadow-blue-500/20'
                            : 'text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: activePanel === item.id ? '#fff' : item.dotColor }} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.count && (
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            activePanel === item.id ? 'bg-white/20 text-white' : 'bg-[#F1F5F9] text-[#94A3B8]'
                          }`}>
                            {item.count}
                          </span>
                        )}
                      </button>
                    ))}
                  </nav>
                </div>
              );
            })}
          </div>
        </div>

        {/* MAIN PANEL */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl border border-[var(--border-color)] shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-[#F1F5F9] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">
                  {NAV_GROUPS.flatMap(g => g.items).find(i => i.id === activePanel)?.label}
                </h2>
                <p className="text-sm text-[#94A3B8] mt-0.5">
                  Manage your {NAV_GROUPS.flatMap(g => g.items).find(i => i.id === activePanel)?.label.toLowerCase()} preferences
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 border border-[#E2E8F0] flex items-center justify-center text-[#64748B]">
                {(() => {
                  const grp = NAV_GROUPS.find(g => g.items.some(i => i.id === activePanel));
                  const Icon = grp?.icon || SettingsIcon;
                  return <Icon className="w-5 h-5" />;
                })()}
              </div>
            </div>
            <div className="p-6">
              {renderPanel()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;


