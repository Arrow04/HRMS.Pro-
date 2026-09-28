import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { uploadUrl } from '../utils/uploadUrl';
import { getCurrencySymbol, getAppCurrency } from '../services/currencyService';
import * as payrollApi from '../services/payrollConfigApi';
import * as payrollTemplateApi from '../services/payrollTemplateApi';
import {
  User, Heart, MapPin, IdCard, GraduationCap, Award, Briefcase, HeartHandshake,
  Building2, Smartphone, Trophy, Sparkles, FileText, Settings, CheckCircle,
  X, Info, Banknote, TrendingUp, TrendingDown, Lock, Search, ChevronLeft, ChevronRight, ChevronDown, Building, Save, UserCircle, FileDown, Trash2, AlertCircle, Landmark, Eye, EyeOff, Camera, Mail, Phone
} from 'lucide-react';
import DatePicker from './DatePicker';
import DocumentUpload from './DocumentUpload';
import IfscInput from './IfscInput';
import PhoneInput from './PhoneInput';
import SearchableSelect from './SearchableSelect';
import StateSelect from './StateSelect';
import PincodeInput from './PincodeInput';
import { formInputClass, formTextareaClass } from './FormField';
import { formGridClass } from './FormGrid';
import ToggleSwitch from './ToggleSwitch';
import { generateResumePdf } from '../services/resumePdf';
import type { Employee, Branch, Department, Designation, Company } from '../types';
import { useMasterData } from '../hooks/useMasterData';
import { useAppConfig } from '../context/AppConfigContext';
import { joinEmployeeName, personDisplayName, splitEmployeeName } from '../utils/employeeNameUtils';
import { computeProfileCompletion, computeTabStats } from '../utils/profileCompletion';

export type SalaryMode = 'daily' | 'weekly' | 'monthly' | 'annual' | 'manual';

export type EmployeeFormData = Record<string, unknown> & {
  firstName?: string;
  lastName?: string;
  employeeCode?: string;
  joinDate?: string;
  email?: string;
  phone?: string;
  companyId?: string | number;
  departmentId?: string | number;
  designationId?: string | number;
  gender?: string;
  dateOfBirth?: string;
  bloodGroup?: string;
  maritalStatus?: string;
  isPersonWithDisability?: boolean;
  employmentType?: string;
  shiftId?: string | number;
  geofenceEnabled?: boolean;
  status?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  currentAddress?: string;
  permanentAddress?: string;
  landmark?: string;
  permanentLandmark?: string;
  currentState?: string;
  currentPincode?: string;
  permanentState?: string;
  permanentPincode?: string;
  aadharNumber?: string;
  panNumber?: string;
  voterId?: string;
  drivingLicense?: string;
  passportNumber?: string;
  educationLevel?: string;
  institution?: string;
  degree?: string;
  fieldOfStudy?: string;
  graduationYear?: string;
  grade?: string;
  certification?: string;
  certificationOrg?: string;
  certificationDate?: string;
  certificationExpiry?: string;
  skills?: string;
  language1?: string;
  language2?: string;
  language3?: string;
  pfNumber?: string;
  pfUan?: string;
  esicNumber?: string;
  gratuityApplicable?: boolean;
  mediclaimNumber?: string;
  mediclaimProvider?: string;
  fatherName?: string;
  motherName?: string;
  spouseName?: string;
  spousePhone?: string;
  numberOfChildren?: string | number;
  childrenNames?: string;
  nomineeName?: string;
  nomineeRelationship?: string;
  bankName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  accountHolderName?: string;
  bankAccounts?: { bankName?: string; bankAccountNumber?: string; ifscCode?: string; accountHolderName?: string; isPrimary?: boolean }[];
  baseSalary?: string | number;
  salaryComponents?: Record<string, unknown>;
  hobbies?: string;
  userId?: string | number;
  deviceType?: string;
  deviceIpAddress?: string;
  deviceMacAddress?: string;
  deviceSerialNumber?: string;
  branchIds?: number[];
  reportingManagerId?: number;
  aadharFile?: File | null;
  panFile?: File | null;
  voterFile?: File | null;
  drivingLicenseFile?: File | null;
  passportFile?: File | null;
  birthCertificateFile?: File | null;
  birthCertificateNumber?: string;
  certificationFiles?: FileList | null;
  deviceAssignedDate?: string;
  achievement1_title?: string;
  achievement1_org?: string;
  achievement1_date?: string;
  achievement1_description?: string;
  activity1_type?: string;
  activity1_name?: string;
  activity1_role?: string;
  activity1_description?: string;
  exp1_company?: string;
  exp1_designation?: string;
  exp1_from?: string;
  exp1_to?: string;
  exp1_reason?: string;
  educationDetails?: Record<string, unknown>[];
  experienceDetails?: Record<string, unknown>[];
  achievementsDetails?: Record<string, unknown>[];
  activitiesDetails?: Record<string, unknown>[];
  skillsList?: Record<string, unknown>[];
  photoFile?: File | null;
  photoUrl?: string;
  resumeFile?: File | null;
  resumeUrl?: string;
  idDocuments?: Record<string, string>;
  educationFile?: File | null;
  experienceFile?: File | null;
  [key: string]: unknown;
};

interface Option {
  value: string | number;
  label: string;
  code?: string;
  name?: string;
}

interface EmployeeFormModalProps {
  open: boolean;
  title: string;
  isClosing?: boolean;
  accent?: string;          // primary hex used in focus rings/buttons
  employeeId?: number;      // the employee's id for immediate document/photo upload
  formData: EmployeeFormData;
  setFormData: (data: EmployeeFormData) => void;
  companiesList: Company[];
  branchesList: Branch[];
  departmentsList: Department[];
  designations: Designation[];
  genderOptions: Option[];
  bloodGroupOptions: Option[];
  maritalStatusOptions: Option[];
  employmentTypeOptions: Option[];
  statusOptions: Option[];
  educationLevelOptions: Option[];
  deviceTypeOptions: Option[];
  activityTypeOptions?: Option[];
  currentUserName?: string;
  onClose: () => void;
  onSubmit: () => void;
  submitting?: boolean;
  submitLabel?: string;
  showStatus?: boolean;     // add/edit default true; onboarding can also show
  onSaveProgress?: () => void;
  savingProgress?: boolean;
}

const TABS: { id: string; label: string; icon: React.ElementType; color: string; activeColor: string }[] = [
  { id: 'personal', label: 'Personal & Family', icon: UserCircle, color: 'text-pink-500', activeColor: 'border-pink-500' },
  { id: 'address', label: 'Address & Identity', icon: MapPin, color: 'text-emerald-500', activeColor: 'border-emerald-500' },
  { id: 'education', label: 'Education & Skills', icon: GraduationCap, color: 'text-indigo-500', activeColor: 'border-indigo-500' },
  { id: 'experience', label: 'Experience & More', icon: Briefcase, color: 'text-sky-500', activeColor: 'border-sky-500' },
  { id: 'employment', label: 'Employment', icon: Building, color: 'text-cyan-600', activeColor: 'border-cyan-600' },
  { id: 'benefits', label: 'Benefits & Tax', icon: Briefcase, color: 'text-lime-600', activeColor: 'border-lime-600' },
  { id: 'bank', label: 'Bank', icon: Building2, color: 'text-teal-500', activeColor: 'border-teal-500' },
  { id: 'salary', label: 'Salary', icon: Banknote, color: 'text-amber-500', activeColor: 'border-amber-500' },
  { id: 'login', label: 'Login & Device', icon: Lock, color: 'text-slate-500', activeColor: 'border-slate-500' },
  { id: 'it_setup', label: 'IT Setup', icon: Settings, color: 'text-green-600', activeColor: 'border-green-600' },
  { id: 'review', label: 'Review', icon: CheckCircle, color: 'text-purple-600', activeColor: 'border-purple-600' },
];

const EARNINGS: [string, string][] = [
  ['basic', 'Basic'],
  ['hra', 'HRA'],
  ['specialAllowance', 'Special Allowance'],
  ['otherAllowance', 'Other Allowance'],
  ['conveyance', 'Conveyance'],
  ['medical', 'Medical'],
  ['travel', 'Travel'],
  ['performanceBonus', 'Performance Bonus'],
];

const DEDUCTIONS: [string, string][] = [
  ['pf', 'Provident Fund (PF)'],
  ['esi', 'ESI'],
  ['professionalTax', 'Professional Tax'],
  ['incomeTax', 'Income Tax'],
  ['gratuity', 'Gratuity'],
  ['loanRecovery', 'Loan Recovery'],
  ['otherDeductions', 'Other Deductions'],
];

const EMPLOYER_CONTRIBUTIONS: [string, string][] = [
  ['employerPf', 'Employer PF'],
  ['employerEsi', 'Employer ESI'],
  ['employerGratuity', 'Gratuity (Employer)'],
];

// Auto-calc percentage breakdown shown as help text on each field.
const EARNING_PCT: Record<string, string> = {
  basic: '40% of monthly salary',
  hra: '50% of Basic',
  specialAllowance: 'Remainder after all fixed earnings',
  otherAllowance: 'Manual (not auto-calculated)',
  conveyance: 'Fixed \u20B91,600 / month',
  medical: 'Fixed \u20B91,250 / month',
  travel: 'Manual (not auto-calculated)',
  performanceBonus: 'Manual (not auto-calculated)',
};

const DEDUCTION_PCT: Record<string, string> = {
  pf: '12% of Basic (capped \u20B91,800/month on \u20B915,000 wage ceiling)',
  esi: '0.75% of gross (only if monthly \u2264 \u20B921,000)',
  professionalTax: 'Fixed \u20B9200 / month',
  incomeTax: 'Manual (not auto-calculated)',
  gratuity: 'Manual (not auto-calculated)',
  loanRecovery: 'Manual (not auto-calculated)',
  otherDeductions: 'Manual (not auto-calculated)',
};

const INPUT_CLS = '{formInputClass}';

function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}


const TAB_HELP: Record<string, string> = {
  employment: 'Select the company, department, designation, branches, and join date for this employee.',
  login: 'Sign-in credentials (email, phone, password, passcode) plus work device and access setup.',
  personal: 'Enter the employee\u2019s name, code, personal details, and family information (parents, spouse, children).',
  address: 'Record current and permanent addresses, plus identity documents (Aadhaar, PAN, Voter ID, DL, Passport) with upload options.',
  education: 'Add educational qualifications, certifications, skills, and languages. Multiple entries allowed.',
  benefits: 'Statutory benefits (PF, UAN, ESIC, mediclaim, insurance nominee) plus tax declarations (80C, 80D, HRA, NPS).',
  bank: 'Add up to 3 bank accounts for salary disbursement. The first account is the primary salary account.',
  salary: 'Enter the salary structure. These values feed payroll calculations.',
  experience: 'Add previous job experience, achievements, awards, and activities. Multiple entries allowed.',
  it_setup: 'Configure email, system access, and security credentials for the employee.',
  review: 'Final review of all employee details before saving.',
};

/** 4-column grid with uniform 42px controls inside each field cell */
const empGridClass = `${formGridClass} [&>div]:flex [&>div]:flex-col [&_input:not([type=checkbox])]:h-[42px] [&_textarea]:h-[42px] [&_textarea]:resize-none [&_textarea]:overflow-y-auto [&>div>div>button]:h-[42px] [&>div>div>button]:min-h-[42px] [&>div>div>button]:py-0`;

const PreviewSection: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <section>
    <h6 className="text-sm font-semibold text-[var(--primary-blue)] flex items-center gap-2 mb-2">
      <Icon className="w-4 h-4" /> {title}
    </h6>
    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 pl-1">
      {children}
    </div>
  </section>
);

const humanizeToken = (s: string): string =>
  /^[a-z][a-z_ ]*$/.test(s)
    ? s.replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase())
    : s;

const IT_CHECKLIST_KEYS: { key: string; label: string }[] = [
  { key: 'itEmailCreated', label: 'Email Created' },
  { key: 'itSystemAccess', label: 'System Access' },
  { key: 'itErpAccess', label: 'ERP Access' },
  { key: 'itCloudApps', label: 'Cloud Apps' },
  { key: 'itSharedDrives', label: 'Shared Drives' },
  { key: 'itHrmsAccount', label: 'HRMS Account' },
  { key: 'itGroupMemberships', label: 'Group Memberships' },
  { key: 'itCredentialsIssued', label: 'Credentials Issued' },
  { key: 'itVpnAccess', label: 'VPN Access' },
  { key: 'itMfaEnabled', label: 'MFA Enabled' },
  { key: 'itPasswordManager', label: 'Password Manager' },
  { key: 'itRoleAssigned', label: 'Role Assigned' },
  { key: 'itEndpointProtection', label: 'Endpoint Protection' },
  { key: 'itHardwareAssigned', label: 'Hardware Assigned' },
  { key: 'itPolicySigned', label: 'Policy Signed' },
  { key: 'itTrainingDone', label: 'Training Done' },
  { key: 'itAssetTag', label: 'Asset Tag' },
  { key: 'itLaptopEncryption', label: 'Laptop Encryption' },
  { key: 'itWorkPhone', label: 'Work Phone' },
];

const IT_CHECKLIST_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Access Provisioning', keys: ['itEmailCreated', 'itSystemAccess', 'itErpAccess', 'itCloudApps', 'itSharedDrives', 'itHrmsAccount', 'itGroupMemberships'] },
  { title: 'Security & Remote', keys: ['itCredentialsIssued', 'itVpnAccess', 'itMfaEnabled', 'itPasswordManager', 'itRoleAssigned', 'itEndpointProtection'] },
  { title: 'Hardware & Compliance', keys: ['itHardwareAssigned', 'itPolicySigned', 'itTrainingDone', 'itAssetTag', 'itLaptopEncryption', 'itWorkPhone'] },
];

const PreviewItem: React.FC<{ label: string; value: unknown }> = ({ label, value }) => {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '0') return null;
  const str = humanizeToken(raw);
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs text-[#94A3B8] shrink-0">{label}</dt>
      <dd className="text-sm text-[#334155] text-right break-words max-w-[60%]">{str}</dd>
    </div>
  );
};

const EmployeeFormModal: React.FC<EmployeeFormModalProps> = ({
  open, title, isClosing = false, accent = '#1C64F2', employeeId,
  formData, setFormData,
  companiesList, branchesList, departmentsList, designations,
  genderOptions, bloodGroupOptions, maritalStatusOptions, employmentTypeOptions,
  statusOptions, educationLevelOptions, deviceTypeOptions,
  activityTypeOptions = [],
  currentUserName = '',
  onClose, onSubmit, submitting = false, submitLabel = 'Save', showStatus = true,
  onSaveProgress, savingProgress = false,
}) => {
  const { isIndia, dialCode, currency } = useAppConfig();
  const currencySymbol = getCurrencySymbol(currency);
  const [tab, setTab] = useState('personal');
  const [showPassword, setShowPassword] = useState(false);
  const [sameAsCurrent, setSameAsCurrent] = useState(false);
  const [branchSearch, setBranchSearch] = useState('');
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchPos, setBranchPos] = useState<{ top?: number; bottom?: number; left: number; width: number; menuH?: number } | null>(null);
  const branchRef = useRef<HTMLDivElement>(null);
  const branchMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (branchRef.current && !branchRef.current.contains(event.target as Node) && branchMenuRef.current && !branchMenuRef.current.contains(event.target as Node)) {
        setBranchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setBranchOpen(false);
  }, [formData.companyId]);

  const computeBranchPos = useCallback(() => {
    const el = branchRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    // Prefer below; open above only when there's clearly more room up top.
    const openBelow = spaceBelow >= 120 || spaceBelow >= spaceAbove;
    const menuH = openBelow
      ? Math.max(80, Math.min(320, spaceBelow))
      : Math.max(80, Math.min(320, spaceAbove));
    if (openBelow) {
      return { top: rect.bottom + 4, left: rect.left, width: rect.width, menuH };
    }
    return { bottom: viewportH - rect.top + 4, left: rect.left, width: rect.width, menuH };
  }, []);

  useEffect(() => {
    if (!branchOpen) return;
    // The menu is a fixed-position portal; keep it glued to the trigger every
    // frame so scrolling/resizing/layout shifts can never separate them.
    // State only updates when the position actually changes (no re-render spam).
    let raf = 0;
    const tick = () => {
      const p = computeBranchPos();
      setBranchPos((prev) =>
        prev && p && prev.top === p.top && prev.bottom === p.bottom && prev.left === p.left && prev.width === p.width
          ? prev
          : p,
      );
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [branchOpen, computeBranchPos]);

  // Anchor with a fresh rect immediately on open.
  useLayoutEffect(() => {
    if (branchOpen) setBranchPos(computeBranchPos());
  }, [branchOpen, computeBranchPos]);
  const [salaryMode, setSalaryMode] = useState<SalaryMode>('monthly');
  // Pay-frequency conversions to the monthly figure the payroll engine works on.
  // Daily — 30 (monthly/30 = daily rate is the standard payroll divisor).
  const DAILY_TO_MONTHLY = 30;
  const WEEKLY_TO_MONTHLY = 52 / 12;
  const toMonthly = (amount: number, mode: SalaryMode) =>
    mode === 'annual' ? amount / 12 : mode === 'daily' ? amount * DAILY_TO_MONTHLY : mode === 'weekly' ? amount * WEEKLY_TO_MONTHLY : amount;
  // Switching modes reinterprets the amount — clear rate + split so a monthly
  // figure can never be silently treated as daily (miscalc guard). Manual
  // keeps the components as a starting point.
  const switchSalaryMode = (mode: SalaryMode) => {
    setSalaryMode(mode);
    // Persist the entry mode inside salaryComponents so a reopen knows
    // whether the values are auto-split or hand-entered (manual is never
    // re-split on open).
    if (mode !== 'manual') {
      set({ baseSalary: '', payRate: '', salaryComponents: { _entry_mode: mode } });
    } else {
      set({ salaryComponents: { ...(formData.salaryComponents || {}), _entry_mode: 'manual' } });
    }
  };
  // When opening an existing employee, restore their saved pay frequency and
  // entry mode — manual mode keeps the components exactly as the user typed.
  useEffect(() => {
    if ((formData.salaryComponents || {})._entry_mode === 'manual') {
      setSalaryMode('manual');
      return;
    }
    const f = formData.payFrequency;
    if (typeof f === 'string' && ['daily', 'weekly', 'monthly', 'annual'].includes(f)) {
      setSalaryMode(f as SalaryMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);
  const { data: proficiencyOptions = [] } = useMasterData('SKILL_PROFICIENCY');
  const salaryCompanyId = String(formData.salaryCompanyId ?? '');
  const salaryCompany = (companiesList || []).find((c: Company) => String(c.id) === salaryCompanyId);
  const salaryOrgId = salaryCompany?.organizationId ?? formData.organizationId ?? undefined;
  const { data: salaryTemplates = [] } = useQuery({
    queryKey: ['salary-templates', salaryOrgId ?? ''],
    queryFn: async () => {
      try {
        const params = salaryOrgId ? `?organizationId=${salaryOrgId}` : '';
        const response = await api.get(`/salary-templates${params}`);
        return response.data || [];
      } catch (error) { throw error; }
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: payrollPolicies = [] } = useQuery({ queryKey: ['payroll-policies'], queryFn: payrollApi.getPayrollPolicies, staleTime: 5 * 60 * 1000 });
  const { data: attendancePolicies = [] } = useQuery({ queryKey: ['attendance-policies'], queryFn: payrollApi.getAttendancePolicies, staleTime: 5 * 60 * 1000 });
  const { data: taxRegimes = [] } = useQuery({ queryKey: ['tax-regimes'], queryFn: payrollApi.getTaxRegimes, staleTime: 5 * 60 * 1000 });
  const { data: shifts = [] } = useQuery({ queryKey: ['shifts'], queryFn: async () => { const res = await api.get('/shifts'); return res.data?.data || []; } });
  const { data: employeesList = [] } = useQuery({
    queryKey: ['employees-picker'],
    queryFn: async () => {
      const res = await api.get('/employees', { params: { limit: 200, view: 'summary' } });
      return res.data?.data || res.data?.items || [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const docEmployeeId = employeeId || (typeof formData.employeeId === 'number' ? formData.employeeId as number : undefined);
  const { data: currentRoster } = useQuery({
    queryKey: ['employee-roster', docEmployeeId],
    queryFn: async () => {
      if (!docEmployeeId) return [];
      const res = await api.get('/shifts/roster/weekly', { params: { employee_id: docEmployeeId, week_start_date: getMonday(new Date()) } });
      return res.data?.data || [];
    },
    enabled: !!docEmployeeId,
  });
  const salaryCompanyIdNum = salaryCompanyId ? Number(salaryCompanyId) : undefined;
  const { data: payrollTemplates = [], isFetched: payrollTplsFetched } = useQuery({
    queryKey: ['payroll-templates', salaryCompanyIdNum ?? 'all'],
    queryFn: () => payrollTemplateApi.getPayrollTemplates(salaryCompanyIdNum),
    staleTime: 30 * 1000,
  });
  const { data: leaveTemplates = [] } = useQuery({
    queryKey: ['leave-templates', salaryCompanyIdNum ?? 'all'],
    queryFn: async () => {
      const params = salaryCompanyIdNum ? { companyId: salaryCompanyIdNum } : {};
      const res = await api.get('/api/leave-templates', { params });
      return res.data || [];
    },
    staleTime: 30 * 1000,
  });
  const companyAttendancePolicies = (attendancePolicies as Record<string, unknown>[]).filter(
    (p) => !salaryCompanyIdNum || p.company_id == null || Number(p.company_id) === salaryCompanyIdNum
  );

  useEffect(() => {
    if (open && currentUserName && !formData.itAssignedBy) {
      setFormData((prev) => ({ ...prev, itAssignedBy: currentUserName }));
    }
  }, [open, currentUserName, formData.itAssignedBy, setFormData]);

  // Auto-fill policy / tax regime / attendance / leave from the payroll
  // template whenever a template id appears (edit-on-open or user pick).
  // Ref-guard per template id so clearing a field stays cleared.
  const tplAutoFilledRef = useRef('');
  // Latest salary split handler — template/legacy-template pickers defer the
  // re-split until after re-render so it sees the newly selected template.
  const splitRef = useRef<(v: string, m?: SalaryMode) => void>(() => {});
  useEffect(() => {
    const cid = String(formData.payrollTemplateId ?? '');
    if (!cid) return;
    const key = `${String(formData.employeeId ?? '')}:${cid}`;
    if (tplAutoFilledRef.current === key) return;
    const tpl = payrollTemplates.find((t) => String(t.id) === cid);
    if (!tpl) return; // wait until the list loads
    tplAutoFilledRef.current = key;
    const s = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v));
    setFormData((prev) => ({
      ...prev,
      payrollPolicyId: s(prev.payrollPolicyId) || s(tpl.payroll_policy_id),
      attendancePolicyId: s(prev.attendancePolicyId) || s(tpl.attendance_policy_id),
      taxRegimeId: s(prev.taxRegimeId) || s(tpl.tax_regime_id),
      leaveTemplateId: s(prev.leaveTemplateId) || s(tpl.leave_template_id),
    }));
  }, [formData.payrollTemplateId, formData.employeeId, payrollTemplates, setFormData]);

  // Re-split the stored salary components once per open (auto modes only) so
  // saved values always match the current payroll template + statutory rates
  // — splits saved by older builds refresh themselves on open instead of
  // showing stale amounts next to up-to-date help texts. Manual mode is never
  // re-split; the split waits for the template list when the employee has one,
  // and for the restored pay-frequency mode to settle first.
  const resplitKeyRef = useRef('');
  useEffect(() => {
    if (!open) { resplitKeyRef.current = ''; return; }
    const comps = formData.salaryComponents || {};
    const f = formData.payFrequency;
    const expected: SalaryMode = comps._entry_mode === 'manual'
      ? 'manual'
      : (typeof f === 'string' && ['daily', 'weekly', 'monthly', 'annual'].includes(f) ? (f as SalaryMode) : 'monthly');
    if (salaryMode !== expected) { setSalaryMode(expected); return; }
    const key = `${String(formData.employeeId ?? employeeId ?? '')}:${salaryMode}`;
    if (resplitKeyRef.current === key) return;
    if (salaryMode === 'manual') { resplitKeyRef.current = key; return; }
    const base = parseFloat(String(formData.baseSalary ?? ''));
    if (!(base > 0)) return;
    const tplId = String(formData.payrollTemplateId ?? '');
    if (tplId && !payrollTplsFetched) return;
    resplitKeyRef.current = key;
    const h = setTimeout(() => splitRef.current(String(formData.baseSalary), salaryMode), 0);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, salaryMode, employeeId, formData.employeeId, formData.baseSalary, formData.payrollTemplateId, formData.payFrequency, formData.salaryComponents, payrollTplsFetched]);

  // Engine preview: in auto modes the split shown below is computed by the
  // payroll engine itself (POST /payroll/preview) — parity with the payslip by
  // construction. Debounced + abortable; manual mode never fetches (its values
  // are the sanctioned hand-set override).
  const [enginePreview, setEnginePreview] = useState<Record<string, unknown> | null>(null);
  const previewSeqRef = useRef(0);
  useEffect(() => {
    if (!open || salaryMode === 'manual') { setEnginePreview(null); return; }
    const base = parseFloat(String(formData.baseSalary ?? ''));
    if (!base || base <= 0) { setEnginePreview(null); return; }
    const seq = ++previewSeqRef.current;
    const freq = salaryMode === 'annual' ? 'annual' : salaryMode === 'daily' ? 'daily' : salaryMode === 'weekly' ? 'weekly' : 'monthly';
    const t = setTimeout(async () => {
      try {
        const res = await api.post('/payroll/preview', {
          employeeId: docEmployeeId ?? undefined,
          baseSalary: base,
          payFrequency: freq,
          payrollTemplateId: formData.payrollTemplateId ? Number(formData.payrollTemplateId) : undefined,
          salaryMode,
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
        });
        if (seq === previewSeqRef.current) setEnginePreview((res.data || null) as Record<string, unknown> | null);
      } catch {
        if (seq === previewSeqRef.current) setEnginePreview(null);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, salaryMode, docEmployeeId, formData.baseSalary, formData.payrollTemplateId]);

  if (!open) return null;

  const set = (patch: Partial<EmployeeFormData>) => setFormData((prev) => ({ ...prev, ...patch }));
  const setComp = (key: string, val: unknown) =>
    setFormData((prev) => ({ ...prev, salaryComponents: { ...(prev.salaryComponents || {}), [key]: val } }));

  const comps = (formData.salaryComponents || {}) as Record<string, unknown>;
  const toNum = (v: unknown) => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? 0 : n; };
  // Engine-driven preview: the payroll engine's own numbers replace the local
  // sums whenever it computed the split (auto modes).
  const previewActive = salaryMode !== 'manual' && !!enginePreview;
  const previewFieldMap: Record<string, string> = {
    basic: 'basic_salary', hra: 'hra', specialAllowance: 'special_allowance',
    otherAllowance: 'other_allowance', conveyance: 'conveyance', medical: 'medical',
    travel: 'travel_allowance', performanceBonus: 'performance_bonus',
    pf: 'pf_deduction', esi: 'esi_deduction', professionalTax: 'professional_tax',
    incomeTax: 'income_tax', loanRecovery: 'loan_deduction', otherDeductions: 'other_deductions',
  };
  const previewField = (key: string): number => {
    if (!enginePreview) return 0;
    if (key === 'employerPf') {
      return toNum(enginePreview.pf_employer_contribution) + toNum(enginePreview.pf_edli_contribution) + toNum(enginePreview.pf_admin_contribution);
    }
    if (key === 'employerEsi') return toNum(enginePreview.esi_employer_contribution);
    if (key === 'employerGratuity') return toNum(enginePreview.gratuity);
    if (key === 'gratuity') return 0; // gratuity is an employer reserve, never an employee deduction
    return toNum(enginePreview[previewFieldMap[key] ?? key]);
  };
  // Every charged figure must be on screen: component_breakdown rows with no
  // dedicated field above (Employee NPS, LWF, LOP, DA, template Employer
  // NPS...) render as read-only extras so the totals always reconcile.
  const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const previewNameToField: Record<string, string> = {
    basic: 'basic', basic_salary: 'basic',
    hra: 'hra',
    special_allowance: 'specialAllowance',
    other_allowance: 'otherAllowance',
    conveyance: 'conveyance',
    medical: 'medical',
    travel_allowance: 'travel',
    performance_bonus: 'performanceBonus',
    pf: 'pf', pf_deduction: 'pf', provident_fund: 'pf',
    esi: 'esi', esi_deduction: 'esi',
    professional_tax: 'professionalTax', pt: 'professionalTax',
    income_tax: 'incomeTax',
    loan_recovery: 'loanRecovery',
    other_deduction: 'otherDeductions', other_deductions: 'otherDeductions',
    gratuity: 'gratuity',
  };
  type PreviewExtra = { name: string; value: number };
  const previewExtras: { earnings: PreviewExtra[]; deductions: PreviewExtra[]; employer: PreviewExtra[] } =
    !previewActive ? { earnings: [], deductions: [], employer: [] } : (() => {
      const rows = (enginePreview!.component_breakdown || []) as {
        component_id?: number | null; name?: string; display_name?: string;
        type?: string; value?: unknown;
      }[];
      const earnings: PreviewExtra[] = [];
      const deductions: PreviewExtra[] = [];
      const employer: PreviewExtra[] = [];
      for (const r of rows) {
        const v = toNum(r.value);
        if (!v) continue;
        const isTemplateRow = r.component_id !== null && r.component_id !== undefined;
        if (r.type === 'employer_contribution') {
          // Statutory synthesized rows (PF Employer EPS/EDLIS/Admin) already
          // roll into the Employer PF field — only template-authored rows
          // (Employer NPS etc.) need their own line.
          if (isTemplateRow) employer.push({ name: r.display_name || r.name || 'Employer contribution', value: v });
          continue;
        }
        if (r.type !== 'earning' && r.type !== 'deduction') continue;
        const mapped = previewNameToField[normName(r.name || '')];
        if (mapped && Math.abs(v - previewField(mapped)) < 0.011) continue;
        (r.type === 'earning' ? earnings : deductions).push({ name: r.display_name || r.name || '', value: v });
      }
      // Statutory engine fields with no dedicated row above.
      const lwf = toNum(enginePreview!.lwf_deduction);
      if (lwf > 0 && !deductions.some((d) => normName(d.name) === 'lwf' || normName(d.name) === 'labour_welfare_fund')) {
        deductions.push({ name: 'LWF', value: lwf });
      }
      const npsEmp = toNum(enginePreview!.nps_deduction);
      if (npsEmp > 0 && !deductions.some((d) => d.name.toLowerCase().includes('nps'))) {
        deductions.push({ name: 'NPS (employee)', value: npsEmp });
      }
      return { earnings, deductions, employer };
    })();
  const totalEarnings = previewActive ? toNum(enginePreview!.total_earnings) : EARNINGS.reduce((s, [k]) => s + toNum(comps[k]), 0);
  const totalDeductions = previewActive ? toNum(enginePreview!.total_deductions) : DEDUCTIONS.reduce((s, [k]) => s + toNum(comps[k]), 0);
  const totalEmployerContributions = previewActive
    ? previewField('employerPf') + previewField('employerEsi') + previewField('employerGratuity')
      + previewExtras.employer.reduce((s, x) => s + x.value, 0)
    : EMPLOYER_CONTRIBUTIONS.reduce((s, [k]) => s + toNum(comps[k]), 0);
  const grossSalary = previewActive ? toNum(enginePreview!.gross_salary) : (toNum(formData.baseSalary) || totalEarnings);
  const netSalary = previewActive ? toNum(enginePreview!.net_salary) : grossSalary - totalDeductions;
  const ctc = grossSalary + totalEmployerContributions;

  const activeTemplate = salaryTemplates.find((t: Record<string, unknown>) => String(t.id) === String(formData.salaryTemplateId)) as Record<string, unknown> | undefined;

  // Payroll template (company-wise) drives the salary preview when selected:
  // its Basic/HRA component percentages split the base salary for display.
  const selectedTpl = payrollTemplates.find((t) => String(t.id) === String(formData.payrollTemplateId));

  // SearchableSelect falls back to the placeholder when the value is missing
  // from options — always inject the template-linked record so the selected
  // policy / regime / attendance / leave renders its name.
  const tplOpts = (list: unknown[], id: unknown, label?: string | null): { id: string; name: string }[] => {
    const opts = (list as { id: unknown; name: unknown }[]).map((x) => ({ id: String(x.id), name: String(x.name || '') }));
    const sid = id === null || id === undefined ? '' : String(id);
    if (sid && !opts.some((o) => o.id === sid)) opts.push({ id: sid, name: label || `#${sid}` });
    return opts;
  };
  const payrollPolicyOpts = tplOpts(payrollPolicies, selectedTpl?.payroll_policy_id, selectedTpl?.policy_name);
  const taxRegimeOpts = tplOpts(taxRegimes, selectedTpl?.tax_regime_id, selectedTpl?.tax_regime_name);
  const leaveTplOpts = tplOpts(leaveTemplates, selectedTpl?.leave_template_id, selectedTpl?.leave_template_name);
  const attendanceOpts = tplOpts(companyAttendancePolicies, selectedTpl?.attendance_policy_id, selectedTpl?.attendance_name);
  const tplPct = (name: string): number => {
    const comp = (selectedTpl?.components || []).find(
      (c) => c.calculation_type === 'percentage' && (c.name || '').toLowerCase() === name.toLowerCase()
    );
    return comp && typeof comp.calculation_value === 'number' ? comp.calculation_value : 0;
  };
  const tplBasicPct = tplPct('Basic');
  const tplHraPct = tplPct('HRA');
  const previewUsesTpl = !!selectedTpl;
  const tplBasicPctEff = tplBasicPct > 0 ? tplBasicPct : 40;
  const tplHraPctEff = tplHraPct > 0 ? tplHraPct : (tplBasicPct > 0 ? 0 : 50);

  const tplStatutory = (selectedTpl?.statutory || {}) as Record<string, unknown>;
  // Fixed-amount earning from the template's components (Conveyance, Medical).
  const tplFixedVal = (name: string): number => {
    const comp = (selectedTpl?.components || []).find(
      (c) => c.calculation_type === 'fixed' && (c.name || '').toLowerCase() === name.toLowerCase()
    );
    const v = Number(comp?.calculation_value);
    return !isNaN(v) && v > 0 ? v : 0;
  };
  // Null/missing statutory keys fall back to India statutory defaults so the
  // split never shows 0 deductions; an explicit 0 is respected.
  const statNum = (key: string, fallback: number) => {
    const raw = tplStatutory[key];
    if (raw === null || raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    return isNaN(n) ? fallback : n;
  };
  const pfEmployeeRate = statNum('pf_employee_rate', 12);
  const pfEmployerRate = statNum('pf_employer_rate', 3.67);
  const pfMaxMonthly = statNum('pf_max_monthly', 1800);
  const esiEmployeeRate = statNum('esi_employee_rate', 0.75);
  const esiEmployerRate = statNum('esi_employer_rate', 1.75);
  const esiGrossCeiling = statNum('esi_gross_ceiling', 21000);
  const ptMonthlyAmount = statNum('pt_monthly_amount', 200);
  const gratuityRate = statNum('gratuity_rate', 4.81);
  const pfAdminRate = statNum('pf_admin_rate', 0.5);
  const pfEdliRate = statNum('pf_edli_rate', 0.5);
  const pfEdliMaxMonthly = statNum('pf_edli_max_monthly', 75);
  const pfAdminMinMonthly = statNum('pf_admin_min_monthly', 75);
  const gratuityApplicable = !!tplStatutory.gratuity_applicable;
  // PF wage ceiling implied by the 12% cap (1800 = 12% of 15000).
  const pfWageCeiling = pfMaxMonthly > 0 && pfEmployerRate > 0 ? pfMaxMonthly / (pfEmployerRate / 100) : 0;
  // Employer PF = 12% (8.33 EPS + 3.67 EPF) + 0.5% admin + 0.5% EDLI = 13%,
  // mirroring services/payroll_service.py so preview matches the payroll run.
  const employerPfCap = pfWageCeiling > 0
    ? Math.round(Math.min(pfWageCeiling * pfEmployerRate / 100, pfMaxMonthly))
      + Math.round(Math.max(pfWageCeiling * pfAdminRate / 100, pfAdminMinMonthly))
      + Math.round(Math.min(pfWageCeiling * pfEdliRate / 100, pfEdliMaxMonthly))
    : 0;
  // Deduction help texts — driven by the active template's statutory rates.
  const deductionHelp: Record<string, string> = {
    pf: `${pfEmployeeRate}% of Basic (capped ${currencySymbol}${pfMaxMonthly.toLocaleString('en-IN')}/month on ${currencySymbol}${(pfWageCeiling || 15000).toLocaleString('en-IN')} wage ceiling)`,
    esi: `${esiEmployeeRate}% of gross (only if monthly \u2264 ${currencySymbol}${esiGrossCeiling.toLocaleString('en-IN')})`,
    professionalTax: `State PT slab by gross salary (flat ${currencySymbol}${ptMonthlyAmount.toLocaleString('en-IN')}/mo only where the state has no slab)`,
    incomeTax: 'Manual (not auto-calculated)',
    gratuity: 'Manual (not auto-calculated)',
    loanRecovery: 'Manual (not auto-calculated)',
    otherDeductions: 'Manual (not auto-calculated)',
  };

  const earningHelp = previewUsesTpl
    ? {
        basic: `${tplBasicPctEff}% of monthly salary${tplBasicPct > 0 ? '' : ' (default)'}`,
        hra: `${tplHraPctEff}% of Basic${tplHraPct > 0 ? '' : ' (default)'}`,
        specialAllowance: 'Balance of monthly salary (auto-filled — the CTC balancing figure)',
        otherAllowance: 'Manual (not auto-calculated)',
        conveyance: tplFixedVal('Conveyance') ? `Fixed ${currencySymbol}${tplFixedVal('Conveyance').toLocaleString('en-IN')} / month (template)` : 'Included in template components',
        medical: tplFixedVal('Medical') ? `Fixed ${currencySymbol}${tplFixedVal('Medical').toLocaleString('en-IN')} / month (template)` : 'Included in template components',
        travel: 'Manual (not auto-calculated)',
        performanceBonus: 'Manual (not auto-calculated)',
      }
    : activeTemplate
    ? {
        basic: `${Number(activeTemplate.basic_percent ?? 40) || 40}% of monthly salary`,
        hra: `${Number(activeTemplate.hra_percent ?? 0) || 0}% of Basic`,
        specialAllowance: `${Number(activeTemplate.special_allowance_percent ?? 0) || 0}% of monthly salary`,
        otherAllowance: `${Number(activeTemplate.other_allowance_percent ?? 0) || 0}% of monthly salary`,
        conveyance: activeTemplate.basic_percent ? 'Included in template %' : 'Fixed \u20B91,600 / month',
        medical: activeTemplate.basic_percent ? 'Included in template %' : 'Fixed \u20B91,250 / month',
        travel: 'Manual (not auto-calculated)',
        performanceBonus: 'Manual (not auto-calculated)',
      }
    : EARNING_PCT;

  // Auto-split the base salary into monthly earnings and deductions when it
  // changes. The split uses the selected company's Salary Template percentages
  // when one is chosen; otherwise it falls back to the standard breakdown.
  // Mode determines the entered figure: daily (—30), weekly (—52/12), monthly
  // or annual CTC (—12) — always normalized to monthly for the payroll engine.
  // base_salary stores that monthly equivalent; payFrequency/payRate keep the
  // original terms (e.g. 500/day) for display and audit.
  const handleBaseSalaryChange = (rawValue: string, mode: SalaryMode = salaryMode) => {
    const amount = parseFloat(rawValue) || 0;
    // Mark this mode as already split so the open-time re-split effect never
    // duplicates a split the user (or a template pick) just triggered.
    resplitKeyRef.current = `${String(formData.employeeId ?? employeeId ?? '')}:${mode}`;
    set({ baseSalary: rawValue });
    if (mode === 'manual') return;
    const monthly = toMonthly(amount, mode);
    if (monthly <= 0) return;
    set({ payFrequency: mode, payRate: rawValue });

    const basicPct = previewUsesTpl ? tplBasicPct : Number(activeTemplate?.basic_percent ?? 0);
    const hraPct = previewUsesTpl ? tplHraPct : Number(activeTemplate?.hra_percent ?? 0);
    const specialPct = Number(activeTemplate?.special_allowance_percent ?? 0);
    const otherPct = Number(activeTemplate?.other_allowance_percent ?? 0);

    let basic = Math.round(monthly * (basicPct > 0 ? basicPct : 40) / 100);
    let hra = Math.round(basic * (hraPct > 0 ? hraPct : 50) / 100);
    let conveyance = 1600;
    let medical = 1250;
    let specialAllowance = Math.max(0, Math.round(monthly - basic - hra - conveyance - medical));
    let otherAllowance = 0;

    const tplAnyConfigured = basicPct > 0 || hraPct > 0 || specialPct > 0 || otherPct > 0
      || tplFixedVal('Conveyance') > 0 || tplFixedVal('Medical') > 0;
    if ((previewUsesTpl || activeTemplate) && tplAnyConfigured) {
      basic = Math.round(monthly * (basicPct > 0 ? basicPct : 40) / 100);
      // HRA: template value wins; if Basic is configured but HRA isn't, HRA is
      // intentionally 0 — only when nothing is configured do we use the 50% default.
      hra = Math.round(basic * (hraPct > 0 ? hraPct : (basicPct > 0 ? 0 : 50)) / 100);
      // Fixed template amounts (e.g. Conveyance ₹1,500, Medical ₹1,500) must
      // show in their own fields — not vanish into the remainder.
      conveyance = tplFixedVal('Conveyance');
      medical = tplFixedVal('Medical');
      specialAllowance = Math.max(0, Math.round(monthly * (specialPct > 0 ? specialPct : 0) / 100));
      otherAllowance = Math.max(0, Math.round(monthly * (otherPct > 0 ? otherPct : 0) / 100));
      const assigned = basic + hra + conveyance + medical + specialAllowance + otherAllowance;
      if (assigned > 0 && assigned < monthly) {
        // Special Allowance is the standard balancing figure of the CTC:
        // it absorbs whatever Basic/HRA/fixed allowances leave unallocated.
        specialAllowance += monthly - assigned;
      }
    }

    // Statutory deductions — rates from the selected payroll template.
    const pf = Math.round(Math.min(basic * pfEmployeeRate / 100, pfMaxMonthly));
    const esi = monthly <= esiGrossCeiling ? Math.round(monthly * esiEmployeeRate / 100) : 0;
    const professionalTax = Math.round(ptMonthlyAmount);

    // Employer contributions (cost-to-company) — from the template's statutory.
    // Employer PF = 12% core + 0.5% admin + 0.5% EDLI (13% total), matching payroll_service.
    const pfWages = pfWageCeiling > 0 ? Math.min(basic, pfWageCeiling) : basic;
    const employerPf = pfWages > 0
      ? Math.round(Math.min(pfWages * pfEmployerRate / 100, pfMaxMonthly))
        + Math.round(Math.max(pfWages * pfAdminRate / 100, pfAdminMinMonthly))
        + Math.round(Math.min(pfWages * pfEdliRate / 100, pfEdliMaxMonthly))
      : 0;
    const employerEsi = monthly <= esiGrossCeiling ? Math.round(monthly * esiEmployerRate / 100) : 0;
    const employerGratuity = gratuityApplicable ? Math.round(basic * gratuityRate / 100) : 0;

    set({
      salaryTemplateId: activeTemplate?.id ?? formData.salaryTemplateId,
      salaryComponents: {
        ...(formData.salaryComponents || {}),
        _entry_mode: mode,
        basic,
        hra,
        conveyance,
        medical,
        specialAllowance,
        otherAllowance,
        pf,
        esi,
        professionalTax,
        employerPf,
        employerEsi,
        employerGratuity,
      },
    });
  };

  splitRef.current = handleBaseSalaryChange;

  const handleDeleteDocument = async (docType: string) => {
    // Always clear the local form state so the doc disappears immediately,
    // even before the employee exists (Add mode).
    const docs = { ...(formData.idDocuments as Record<string, string> || {}) };
    delete docs[docType];
    set({ idDocuments: docs });
    if (docType === 'photo') set({ photoUrl: '', photoFile: null });
    if (docType === 'resume') set({ resumeUrl: '' });
    if (docType === 'aadhar') set({ aadharNumber: '' });
    if (docType === 'pan') set({ panNumber: '' });
    if (docType === 'voter') set({ voterId: '' });
    if (docType === 'drivingLicense') set({ drivingLicense: '' });
    if (docType === 'passport') set({ passportNumber: '' });
    // Persist the removal on the backend when the employee already exists.
    if (docEmployeeId) {
      try {
        await api.delete('/employees/document', { params: { docType, employeeId: docEmployeeId } });
      } catch {
        // ignore — already cleared locally
      }
    }
  };

  const reviewPhotoRef = useRef<HTMLInputElement>(null);
  const handleReviewPhoto = async (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    if (f.size > 8 * 1024 * 1024) { toast.error('Image too large (max 8 MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => set({ photoFile: f, photoUrl: reader.result as string });
    reader.readAsDataURL(f);
    if (docEmployeeId) {
      try {
        const form = new FormData();
        form.append('file', f);
        form.append('docType', 'photo');
        form.append('employeeId', String(docEmployeeId));
        const res = await api.post('/employees/document', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        });
        const url = res.data?.documentUrl || res.data?.url || '';
        if (url) set({ photoUrl: url });
      } catch {
        toast.error('Photo upload failed');
      }
    }
  };

  const updateBankAccount = (idx: number, patch: Partial<{ bankName: string; bankAccountNumber: string; ifscCode: string; accountHolderName: string; isPrimary: boolean }>) => {    const updated = (formData.bankAccounts || []).slice();
    updated[idx] = { ...(updated[idx] || {}), ...patch };
    set({ bankAccounts: updated });
  };

  const setPrimaryBank = (idx: number) => {
    const updated = (formData.bankAccounts || []).slice();
    updated.forEach((acc: any, i: number) => {
      acc.isPrimary = i === idx;
    });
    // Keep the standalone top-level fields in sync with the chosen primary account
    const primary = updated[idx] || {};
    set({
      bankAccounts: updated,
      bankName: primary.bankName ?? formData.bankName,
      bankAccountNumber: primary.bankAccountNumber ?? formData.bankAccountNumber,
      ifscCode: primary.ifscCode ?? formData.ifscCode,
      accountHolderName: primary.accountHolderName ?? formData.accountHolderName,
    });
  };

  const updateList = (key: string, idx: number, patch: Record<string, unknown>) => {
    const arr = (formData[key] as Record<string, unknown>[]) || [];
    const updated = arr.slice();
    updated[idx] = { ...(updated[idx] || {}), ...patch };
    set({ [key]: updated } as Partial<EmployeeFormData>);
  };

  const addRow = (key: string) => {
    const arr = (formData[key] as Record<string, unknown>[]) || [];
    set({ [key]: [...arr, {}] } as Partial<EmployeeFormData>);
  };

  const removeRow = (key: string, idx: number) => {
    const arr = (formData[key] as Record<string, unknown>[]) || [];
    set({ [key]: arr.filter((_, i) => i !== idx) } as Partial<EmployeeFormData>);
  };

  const handleDownloadResume = () => {
    generateResumePdf({
      firstName: input(formData.firstName),
      lastName: input(formData.lastName),
      email: input(formData.email),
      phone: input(formData.phone),
      employeeCode: input(formData.employeeCode),
      photoUrl: typeof formData.photoUrl === 'string' ? formData.photoUrl : undefined,
      gender: input(formData.gender),
      dateOfBirth: formData.dateOfBirth,
      bloodGroup: input(formData.bloodGroup),
      maritalStatus: input(formData.maritalStatus),
      emergencyContact: input(formData.emergencyContact),
      emergencyPhone: input(formData.emergencyPhone),
      currentAddress: input(formData.currentAddress),
      permanentAddress: input(formData.permanentAddress),
      landmark: input(formData.landmark),
      companyName: (companiesList || []).find((c: Company) => String(c.id) === String(formData.companyId))?.name,
      departmentName: (departmentsList || []).find((d: Department) => String(d.id) === String(formData.departmentId))?.name,
      designationName: (designations || []).find((d: Designation) => String(d.id) === String(formData.designationId))?.title,
      employmentType: input(formData.employmentType),
      geofenceEnabled: !!formData.geofenceEnabled,
      joinDate: formData.joinDate,
      status: input(formData.status),
      educationDetails: (formData.educationDetails || []) as Array<Record<string, unknown>>,
      certifications: (formData.certifications || []) as Array<Record<string, unknown>>,
      skillsList: (formData.skillsList || []) as Array<Record<string, unknown>>,
      languages: (formData.languages || []) as Array<Record<string, unknown>>,
      experienceDetails: (formData.experienceDetails || []) as Array<Record<string, unknown>>,
      bankAccounts: (formData.bankAccounts || []) as Array<Record<string, unknown>>,
      baseSalary: formData.baseSalary,
      aadharNumber: input(formData.aadharNumber),
      panNumber: input(formData.panNumber),
      voterId: input(formData.voterId),
      drivingLicense: input(formData.drivingLicense),
      passportNumber: input(formData.passportNumber),
      fatherName: input(formData.fatherName),
      motherName: input(formData.motherName),
      siblingName: input(formData.siblingName),
      spouseName: input(formData.spouseName),
      nomineeName: input(formData.nomineeName),
      currentState: input(formData.currentState),
      currentPincode: input(formData.currentPincode),
      permanentState: input(formData.permanentState),
      permanentPincode: input(formData.permanentPincode),
      permanentLandmark: input(formData.permanentLandmark),
      birthCertificateNumber: input(formData.birthCertificateNumber),
      spousePhone: input(formData.spousePhone),
      numberOfChildren: formData.numberOfChildren,
      childrenNames: input(formData.childrenNames),
      nomineeRelationship: input(formData.nomineeRelationship),
      personWithDisability: typeof formData.isPersonWithDisability === 'boolean' ? formData.isPersonWithDisability : undefined,
      branchNames: (formData.branchIds || []).length ? (branchesList || []).filter((b: { id: number }) => (formData.branchIds || []).includes(b.id)).map((b: { name: string }) => b.name).join(', ') : undefined,
      pfNumber: input(formData.pfNumber),
      pfUan: input(formData.pfUan),
      esicNumber: input(formData.esicNumber),
      gratuityApplicable: typeof formData.gratuityApplicable === 'boolean' ? formData.gratuityApplicable : undefined,
      mediclaimNumber: input(formData.mediclaimNumber),
      mediclaimProvider: input(formData.mediclaimProvider),
      lifeInsuranceNumber: input(formData.lifeInsuranceNumber),
      lifeInsuranceProvider: input(formData.lifeInsuranceProvider),
      accountHolderName: input(formData.accountHolderName),
      ifscCode: input(formData.ifscCode),
      salaryTemplateName: (payrollTemplates || []).find((t: { id: number | string }) => String(t.id) === String(formData.salaryTemplateId))?.name,
      payFrequency: input(formData.payFrequency),
      payRate: formData.payRate,
      deviceName: input(formData.deviceName),
      deviceType: input(formData.deviceType),
      deviceSerialNumber: input(formData.deviceSerialNumber),
      deviceIpAddress: input(formData.deviceIpAddress),
      deviceMacAddress: input(formData.deviceMacAddress),
      deviceAssignedDate: formData.deviceAssignedDate,
      itAssignedBy: input(formData.itAssignedBy),
      itAssignedDate: formData.itAssignedDate,
      itCompletionDate: formData.itCompletionDate,
      itNotes: input(formData.itNotes),
      itChecklist: IT_CHECKLIST_KEYS.filter(({ key }) => formData[key] === true).map(({ label }) => label),
      achievementsDetails: (formData.achievementsDetails || []) as Array<Record<string, unknown>>,
      activitiesDetails: (formData.activitiesDetails || []) as Array<Record<string, unknown>>,
    });
  };

  const input = (val: unknown) => String(val || '');
  const num = (val: unknown) => String(val ?? '');

  // Live progress — percentage of key form fields that have been filled in.
  // Shared with the onboarding table so both always show the same number.
  const formDataRecord = formData as unknown as Record<string, unknown>;
  const tabStats = (tid: string) => computeTabStats(formDataRecord, tid);

  const progress = useMemo(() => computeProfileCompletion(formDataRecord), [formData]);

  const tabFilledCount = (tid: string) => tabStats(tid).filled;
  const tabTotalCount = (tid: string) => tabStats(tid).total;

  // NOTE: all frontend guards are disabled — values pass straight through on
  // every keystroke and on save. The server is the single source of validation.

  const phoneDupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailDupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeDupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Generate a unique 7-char alphanumeric employee code (e.g. A3F9K2M) and
  // verify it's not already used before setting it.
  const generateEmployeeCode = async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    let unique = false;
    let attempts = 0;
    while (!unique && attempts < 10) {
      attempts++;
      code = Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      try {
        const res = await api.get('/employees/check-duplicate', { params: { field: 'employee_code', value: code, excludeId: employeeId } });
        unique = !res.data?.duplicate;
      } catch {
        unique = true; // if the check fails, use the code anyway
      }
    }
    updateField('employeeCode', code);
    return code;
  };

  const generatePassword = () => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#$%^&*';
    const all = upper + lower + digits + symbols;
    const picks = [upper, lower, digits, symbols].map((s) => s[Math.floor(Math.random() * s.length)]);
    const rest = Array.from({ length: 10 }, () => all[Math.floor(Math.random() * all.length)]);
    const pw = [...picks, ...rest].sort(() => Math.random() - 0.5).join('');
    set({ password: pw });
  };

  const generatePasscode = () => {
    set({ passcode: String(Math.floor(100000 + Math.random() * 900000)) });
  };

  // Guards disabled — values pass straight through, the server validates on save.
  const handleAutoDuplicate = (_field: 'email' | 'employee_code' | 'phone', key: string, value: string, timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    updateField(key, value);
  };

  const handleSubmit = async () => {
    // No frontend guards — save always goes through, the server validates.
    onSubmit();

  };

  const updateField = (key: string, value: unknown) => {
    set({ [key]: value });
  };

  const inputCls = (_key: string) => {
    return formInputClass;
  };

  const formatAadhaar = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 12);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  };

  const FieldError: React.FC<{ name: string }> = () => {
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`} onClick={() => onClose()} />
      <div className={`fixed inset-0 bg-white shadow-2xl transform transition-all duration-300 ease-in-out ${isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
        <div className="h-full flex flex-col">
          {/* Header */}
          <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-white">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm"
                style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}>
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#0F172A] leading-tight">{title}</h2>
                <p className="text-xs text-[#64748B]">Complete the employee profile across all sections below</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onClose()}
                className="px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                Cancel
              </button>
              {tab === 'review' ? (
                <button type="button" onClick={handleSubmit} disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10"
                  style={{ backgroundColor: accent }}>
                  <CheckCircle className="w-4 h-4" /> {submitting ? 'Saving...' : submitLabel}
                </button>
              ) : onSaveProgress ? (
                <button type="button" onClick={onSaveProgress} disabled={savingProgress || submitting}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 shrink-0">
                  <Save className="w-4 h-4" /> {savingProgress ? 'Saving...' : 'Save Progress'}
                </button>
              ) : null}
              <button onClick={() => onClose()} title="Close"
                className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Progress bar */}
          <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
            <div className="flex items-center gap-4">
              <div className="flex-1 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${accent}88, ${accent})` }} />
              </div>
              <span className="text-xs font-semibold whitespace-nowrap" style={{ color: accent }}>{progress}% complete</span>
            </div>
            <p className="text-[11px] text-[#B45309] mt-1.5 space-y-0.5">
              <span className="flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-[#D97706] mt-px" />
                <span>Navigate through sections to fill in details. Data is automatically saved as you move between sections.</span>
              </span>
              <span className="flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-[#D97706] mt-px" />
                <span>Fields marked with <span className="font-semibold text-[#DC2626]">*</span> are mandatory.</span>
              </span>
              <span className="flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-[#D97706] mt-px" />
                <span>Click {submitLabel} on the last section to save.</span>
              </span>
            </p>
          </div>

          {/* Body: sidebar + content */}
          <div className="flex-1 flex min-h-0">
            {/* Sidebar */}
            <aside className="w-64 shrink-0 border-r border-[var(--border-color)] bg-[#F8FAFC] overflow-y-auto">
              <div className="py-2 px-3">
                <p className="pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">Sections</p>
                <nav className="space-y-0.5">
                  {TABS.map((t) => {
                    const active = t.id === tab;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={`w-full flex items-center gap-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ease-out group ${
                          active
                            ? 'bg-gradient-to-r from-[#EFF6FF] to-[#F8FAFC] text-[#1C64F2] shadow-sm'
                            : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 ease-out ${
                          active ? `${t.color}` : 'bg-white border border-[var(--border-color)]'
                        }`}
                          style={active ? { background: `${accent}14`, boxShadow: `0 2px 6px ${accent}22` } : undefined}>
                          <t.icon className={`w-4 h-4 transition-all duration-300 ${active ? t.color : 'text-[#64748B]'}`} />
                        </span>
                        <span className={`flex-1 truncate transition-colors duration-300 ${active ? 'font-semibold text-[#1C64F2]' : 'font-medium'}`}>{t.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            </aside>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div key={tab} className="section-fade-in">
              {/* Section header */}
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${accent}14` }}>
                  {(() => { const t = TABS.find(x => x.id === tab); const Icon = t?.icon || User; return <Icon className={`w-5 h-5 ${t?.color || ''}`} />; })()}
                </span>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-[#0F172A] leading-tight">{TABS.find(x => x.id === tab)?.label || ''}</h3>
                  <p className="text-xs text-[#64748B]">{TAB_HELP[tab] || ''}</p>
                </div>
              </div>

            {/* EMPLOYMENT */}
            {tab === 'employment' && (
              <div className="space-y-4">
                <div className={empGridClass}>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Company <span className="text-xs text-gray-500 font-normal ml-1">(Select the legal entity)</span></label>
                    <SearchableSelect
                      value={input(formData.companyId)}
                      onChange={(v) => { const cid = String(v); set({ companyId: cid, branchIds: [], departmentId: '', designationId: '' }); }}
                      options={(companiesList || []).map((c: Company) => ({ id: c.id, name: c.name }))}
                      placeholder="Select Company"
                      showAllOption={false}
                      clearable
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Select the legal entity</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Department <span className="text-xs text-gray-500 font-normal ml-1">(Primary department)</span></label>
                    <SearchableSelect
                      value={input(formData.departmentId)}
                      onChange={(v) => set({ departmentId: String(v) })}
                      options={(departmentsList || []).map((d: Department) => ({ id: d.id, name: d.name }))}
                      placeholder="Select Department"
                      showAllOption={false}
                      clearable
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Select primary department</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Designation</label>
                    <SearchableSelect
                      value={input(formData.designationId)}
                      onChange={(v) => set({ designationId: String(v) })}
                      options={(designations || []).map((d: Designation) => ({ id: d.id, name: d.title }))}
                      placeholder="Select designation"
                      showAllOption={false}
                      clearable
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Select job title/role</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Employment Type</label>
                    <SearchableSelect
                      value={input(formData.employmentType) as string}
                      onChange={(v) => set({ employmentType: String(v) })}
                      options={(employmentTypeOptions as Option[]).map((opt: Option) => ({ id: String(opt.value ?? opt.code ?? ''), name: opt.label || opt.name || '' }))}
                      placeholder="Select Employment Type"
                      showAllOption={false}
                      clearable
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Select employment contract type</p>
                  </div>
                </div>
                <div className={empGridClass}>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Branches (Multiple Selection)</label>
                    {!input(formData.companyId) ? (
                      <p className="text-sm text-[var(--text-primary)] py-2">Select a company first to see its branches.</p>
                    ) : branchesList?.length === 0 ? (
                      <p className="text-sm text-[var(--text-primary)] py-2">No branches available for this company.</p>
                    ) : (
                      <div ref={branchRef} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setBranchSearch('');
                          setBranchOpen(o => !o);
                        }}
                        className={`${formInputClass} text-left flex items-center justify-between`}
                      >
                        <span className={`truncate ${formData.branchIds?.length ? 'text-[#0F172A]' : 'text-[#64748B]'}`}>
                          {formData.branchIds?.length
                            ? `${formData.branchIds.length} branch${formData.branchIds.length > 1 ? 'es' : ''} selected`
                            : 'Select Branches'}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {formData.branchIds?.length > 0 && (
                            <X className="w-4 h-4 text-[#64748B] hover:text-[#C81E1E]"
                              onClick={(e) => { e.stopPropagation(); set({ branchIds: [] }); }} />
                          )}
                          <ChevronDown className="w-4 h-4 text-[#64748B] transition-transform" />
                        </div>
                      </button>
                      {branchOpen && branchPos && createPortal(
                        <div ref={branchMenuRef} className="fixed z-[9999] bg-white border border-[#E2E8F0] rounded-xl shadow-lg overflow-auto"
                          style={{ top: branchPos.top, bottom: branchPos.bottom, left: branchPos.left, width: branchPos.width, maxHeight: branchPos.menuH ?? 320 }}>
                          <div className="p-2 border-b border-[#E2E8F0] sticky top-0 bg-white">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-[#94A3B8]" />
                              <input
                                type="text"
                                value={branchSearch}
                                onChange={(e) => setBranchSearch(e.target.value)}
                                placeholder={`Search ${branchesList?.length || 0} branches...`}
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2"
                                style={{ ['--tw-ring-color' as string]: accent }}
                              />
                            </div>
                            <div className="flex items-center justify-between mt-2 px-1">
                              <span className="text-xs font-medium text-[#64748B]">{formData.branchIds?.length || 0} selected</span>
                              <div className="flex gap-4">
                                <button type="button" onClick={() => set({ branchIds: branchesList.map((b: Branch) => b.id) })}
                                  className="text-xs font-medium text-[#1C64F2] hover:text-[#1D4ED8]">
                                  Select All
                                </button>
                                <button type="button" onClick={() => set({ branchIds: [] })}
                                  className="text-xs font-medium text-[#DC2626] hover:text-[#B91C1C]">
                                  Clear
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="py-1">
                            {branchesList.filter((b: Branch) => b.name.toLowerCase().includes(branchSearch.toLowerCase())).length === 0 ? (
                              <p className="px-4 py-2 text-sm text-[#64748B] text-center">No branches match "{branchSearch}".</p>
                            ) : (
                              branchesList.filter((b: Branch) => b.name.toLowerCase().includes(branchSearch.toLowerCase())).map((branch: Branch) => (
                                <label key={branch.id} className="flex items-center gap-2 px-4 py-1.5 cursor-pointer hover:bg-gray-50">
                                  <input type="checkbox" checked={formData.branchIds?.includes(branch.id) || false}
                                    onChange={(e) => {
                                      const currentIds = formData.branchIds || [];
                                      set(e.target.checked
                                        ? { branchIds: [...currentIds, branch.id] }
                                        : { branchIds: currentIds.filter((id: number) => id !== branch.id) });
                                    }}
                                    className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                                  <span className="text-sm text-[var(--text-primary)] truncate">{branch.name}</span>
                                </label>
                              ))
                            )}
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>
                  )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Join Date</label>
                    <DatePicker value={input(formData.joinDate)} maxDate={new Date()} onChange={(val) => set({ joinDate: val })} />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Date of joining, dd-mm-yyyy</p>
                  </div>
                   <div>
                     <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Reporting Manager</label>
                     <SearchableSelect
                       value={input(formData.reportingManagerId)}
                       onChange={(v) => set({ reportingManagerId: v ? Number(v) : undefined })}
                       options={(employeesList || [])
                          .filter((emp: Employee) => !employeeId || emp.id !== employeeId)
                         .map((emp: Employee) => ({ id: emp.id, name: emp.fullName || emp.name || `Employee #${emp.id}` }))}
                       placeholder="Select reporting manager"
                       showAllOption={false}
                       clearable
                       className="w-full"
                     />
                     <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Employee's direct supervisor for org hierarchy</p>
                   </div>
                  {showStatus && (
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Status</label>
                      <SearchableSelect
                        value={input(formData.status)}
                        onChange={(v) => set({ status: String(v) })}
                        options={(statusOptions as Option[]).map((opt: Option) => ({ id: String(opt.value ?? opt.code ?? ''), name: opt.label || opt.name || '' }))}
                        placeholder="Select Status"
                        showAllOption={false}
                        clearable
                        className="w-full"
                      />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Current employment status</p>
                    </div>
                  )}
                </div>
                <div className={empGridClass}>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Geofence</label>
                    <div className="flex items-center gap-4">
                      <ToggleSwitch
                        checked={!!formData.geofenceEnabled}
                        onChange={(v) => set({ geofenceEnabled: v })}
                      />
                      <span className="text-sm text-[var(--text-primary)]">{formData.geofenceEnabled ? 'Enabled' : 'Disabled'}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">When enabled, the employee can only check in/out from within the configured branch geofence. When disabled, check in/out is allowed from anywhere.</p>
                  </div>
                </div>
              </div>
            )}

            {/* LOGIN INFO */}
            {tab === 'login' && (
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
                  <div className={empGridClass}>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Email <span className="text-[#059669] font-normal">(Primary Login ID)</span></label>
                      <input type="email" value={input(formData.email)} onChange={(e) => handleAutoDuplicate('email', 'email', e.target.value, emailDupTimer)}
                        className={inputCls('email')} style={{ ['--tw-ring-color' as string]: accent }} placeholder="name@company.com" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Primary login ID — used to sign in.</p>
                      <FieldError name="email" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Phone Number <span className="text-[#059669] font-normal">(Secondary Login ID)</span></label>
                      <PhoneInput value={input(formData.phone)} onChange={(v) => handleAutoDuplicate('phone', 'phone', v, phoneDupTimer)}
                        defaultDial={dialCode}
                        placeholder="+91 98765 43210" inputClassName={formInputClass} />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Secondary login ID — can also be used to sign in.</p>
                      <FieldError name="phone" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Password</label>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input type={showPassword ? 'text' : 'password'} value={input(formData.password)} onChange={(e) => set({ password: e.target.value })}
                            className={`${formInputClass} pr-11`} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter a secure password" autoComplete="new-password" />
                          <button type="button" onClick={() => setShowPassword((v) => !v)}
                            title={showPassword ? 'Hide password' : 'Show password'}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] transition-colors">
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <button type="button" onClick={generatePassword}
                          title="Generate a strong random password"
                          className="shrink-0 h-[42px] w-[42px] px-0 inline-flex items-center justify-center bg-[#1C64F2] text-white text-xs font-semibold rounded-lg hover:bg-[#1E40AF] transition-colors">
                          <Sparkles className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Click the sparkle button to auto-generate a strong password, or leave blank to use the default.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Passcode</label>
                      <div className="flex items-center gap-2">
                        <input type="text" value={input(formData.passcode)} onChange={(e) => set({ passcode: e.target.value })}
                          className={`${formInputClass} flex-1`} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g. 4-6 digit PIN or OTP code" />
                        <button type="button" onClick={generatePasscode}
                          title="Generate a random 6-digit passcode"
                          className="shrink-0 h-[42px] w-[42px] px-0 inline-flex items-center justify-center bg-[#1C64F2] text-white text-xs font-semibold rounded-lg hover:bg-[#1E40AF] transition-colors">
                          <Sparkles className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Click the sparkle button for a random 6-digit code, or enter your own.</p>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-xs text-slate-500">
                      <Info className="w-3.5 h-3.5 inline mr-1" />
                      Both email and phone are required. They must match exactly to reset a forgotten password.
                    </p>
                  </div>
                </div>

                {/* Device subsection */}
                <div className="pt-4 mt-2 border-t border-[var(--border-color)]">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-3">
                    <Smartphone className="w-4 h-4 text-red-500" /> Work Device
                  </h4>
                  <div className="space-y-4">
                    <div className={empGridClass}>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Device Type</label>
                        <SearchableSelect
                          value={input(formData.deviceType) as string}
                          onChange={(v) => set({ deviceType: String(v) })}
                          options={(deviceTypeOptions as Option[]).map((opt: Option) => ({ id: String(opt.value ?? opt.code ?? ''), name: opt.label || opt.name || '' }))}
                          placeholder="Select Device Type"
                          showAllOption={false}
                          clearable
                          className="w-full"
                        />
                        <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Select assigned device type</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Device Name</label>
                        <input type="text" value={input(formData.deviceName)} onChange={(e) => set({ deviceName: e.target.value })}
                          className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., HP EliteBook, iPhone 14" />
                        <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Assigned device name / model</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Serial No./IMEI</label>
                        <input type="text" value={input(formData.deviceSerialNumber)} onChange={(e) => set({ deviceSerialNumber: e.target.value })}
                          className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Device serial number" />
                        <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Device serial number or IMEI</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">IP Address</label>
                        <input type="text" value={input(formData.deviceIpAddress)} onChange={(e) => set({ deviceIpAddress: e.target.value })}
                          className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="192.168.1.1" />
                        <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Device IP address, e.g., 192.168.1.1</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">MAC Address</label>
                        <input type="text" value={input(formData.deviceMacAddress)} onChange={(e) => set({ deviceMacAddress: e.target.value })}
                          className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="00:1B:44:11:3A:B7" />
                        <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Device MAC address, e.g., 00:1B:44:11:3A:B7</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PERSONAL */}
            {tab === 'personal' && (
              <div className="space-y-4">
                <div className={empGridClass}>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Full Name *</label>
                    <input type="text" value={joinEmployeeName(formData.firstName, formData.lastName)}
                      onChange={(e) => {
                        const { firstName, lastName } = splitEmployeeName(e.target.value);
                        set({ firstName, lastName });
                      }}
                      className={inputCls('firstName')} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter full legal name" />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Full legal name as per ID documents</p>
                    <FieldError name="firstName" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Employee Code</label>
                    <div className="flex items-center gap-2">
                      <input type="text" value={input(formData.employeeCode)} onChange={(e) => handleAutoDuplicate('employee_code', 'employeeCode', e.target.value, codeDupTimer)}
                        className={`${inputCls('employeeCode')} flex-1`} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter or generate code" />
                      <button type="button" onClick={generateEmployeeCode}
                        title="Auto-generate a unique 7-character code"
                        className="shrink-0 h-[42px] w-[42px] px-0 inline-flex items-center justify-center bg-[#1C64F2] text-white text-xs font-semibold rounded-lg hover:bg-[#1E40AF] transition-colors">
                        <Sparkles className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Unique employee code, if assigned</p>
                    <FieldError name="employeeCode" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Gender</label>
                    <SearchableSelect
                      value={input(formData.gender) as string}
                      onChange={(v) => set({ gender: String(v) })}
                      options={(genderOptions as Option[]).map((opt: Option) => ({ id: String(opt.value ?? opt.code ?? ''), name: opt.label || opt.name || '' }))}
                      placeholder="Select Gender"
                      showAllOption={false}
                      clearable
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Select the employee's gender</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Blood Group</label>
                    <SearchableSelect
                      value={input(formData.bloodGroup) as string}
                      onChange={(v) => set({ bloodGroup: String(v) })}
                      options={(bloodGroupOptions as Option[]).map((opt: Option) => ({ id: String(opt.value ?? opt.code ?? ''), name: opt.label || opt.name || '' }))}
                      placeholder="Select Blood Group"
                      showAllOption={false}
                      clearable
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Select blood group</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Marital Status</label>
                    <SearchableSelect
                      value={input(formData.maritalStatus) as string}
                      onChange={(v) => set({ maritalStatus: String(v) })}
                      options={(maritalStatusOptions as Option[]).map((opt: Option) => ({ id: String(opt.value ?? opt.code ?? ''), name: opt.label || opt.name || '' }))}
                      placeholder="Select Marital Status"
                      showAllOption={false}
                      clearable
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Select marital status</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Date of Birth</label>
                    <DatePicker value={input(formData.dateOfBirth)} maxDate={new Date()} onChange={(val) => set({ dateOfBirth: val })} />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Date of birth, dd-mm-yyyy</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Emergency Contact Name</label>
                    <input type="text" value={input(formData.emergencyContact)} onChange={(e) => set({ emergencyContact: e.target.value })}
                      className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Contact person name" />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Name of emergency contact</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Emergency Phone</label>
                    <PhoneInput value={input(formData.emergencyPhone)} onChange={(v) => set({ emergencyPhone: v })} defaultDial={dialCode} placeholder="Emergency contact number" inputClassName={formInputClass} />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">10-digit mobile of emergency contact</p>
                  </div>
                  <div className="pt-6 md:col-span-2">
                    <div className="flex items-center gap-3">
                      <ToggleSwitch
                        checked={!!formData.isPersonWithDisability}
                        onChange={(v) => set({ isPersonWithDisability: v })}
                      />
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)]">Person with Disabilities (PwD)</label>
                        <p className="text-xs text-gray-400">Enable if employee is a person with benchmark disability</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Family subsection */}
                <div className="pt-4 mt-2 border-t border-[var(--border-color)]">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-3">
                    <Heart className="w-4 h-4 text-rose-500" /> Family Details
                  </h4>
                  <div className={empGridClass}>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Mother's Name</label>
                      <input type="text" value={input(formData.motherName)} onChange={(e) => set({ motherName: e.target.value })}
                        className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter mother's name" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Mother's full name</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Father's Name</label>
                      <input type="text" value={input(formData.fatherName)} onChange={(e) => set({ fatherName: e.target.value })}
                        className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter father's name" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Father's full name</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Spouse Name</label>
                      <input type="text" value={input(formData.spouseName)} onChange={(e) => set({ spouseName: e.target.value })}
                        className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter spouse name (if married)" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Spouse's full name, if married</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Spouse Phone</label>
                      <PhoneInput value={input(formData.spousePhone)} onChange={(v) => set({ spousePhone: v })} defaultDial={dialCode} placeholder="Enter spouse phone number" inputClassName="w-full px-3 py-2 border border-[var(--border-color)] rounded-r-lg focus:outline-none focus:ring-2" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Spouse's phone with country code</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Number of Children</label>
                      <input type="number" value={num(formData.numberOfChildren)} onChange={(e) => set({ numberOfChildren: e.target.value })}
                        className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter number of children" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Total number of children</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Children Names</label>
                      <input type="text" value={input(formData.childrenNames)} onChange={(e) => set({ childrenNames: e.target.value })}
                        className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., Aarav, Diya" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Children's names, comma-separated</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Brother/Sister Name</label>
                      <input type="text" value={input(formData.siblingName)} onChange={(e) => set({ siblingName: e.target.value })}
                        className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter brother/sister name" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Sibling's full name</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ADDRESS */}
            {tab === 'address' && (
              <div className="space-y-4">
                <div className={empGridClass}>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Current Address</label>
                    <textarea value={input(formData.currentAddress)} onChange={(e) => {
                      const v = e.target.value;
                      set(sameAsCurrent ? { currentAddress: v, permanentAddress: v } : { currentAddress: v });
                    }}
                      className={formTextareaClass} placeholder="Enter current address" />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Full current residential address</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Current Address Landmark</label>
                    <input type="text" value={input(formData.landmark)} onChange={(e) => {
                      const v = e.target.value;
                      set(sameAsCurrent ? { landmark: v, permanentLandmark: v } : { landmark: v });
                    }}
                      className={formInputClass} placeholder="Nearby landmark for current address" />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Nearby landmark for current address</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Current State</label>
                    <StateSelect value={input(formData.currentState)} onChange={(v) => {
                      set(sameAsCurrent ? { currentState: v, permanentState: v } : { currentState: v });
                    }} />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">State for current address</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Current Pincode</label>
                    <PincodeInput value={input(formData.currentPincode)} onChange={(v) => {
                      set(sameAsCurrent ? { currentPincode: v, permanentPincode: v } : { currentPincode: v });
                    }} />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">6-digit pincode</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={sameAsCurrent} onChange={(e) => {
                    const on = e.target.checked;
                    setSameAsCurrent(on);
                    if (on) {
                      set({
                        permanentAddress: formData.currentAddress,
                        permanentLandmark: formData.landmark,
                        permanentState: formData.currentState,
                        permanentPincode: formData.currentPincode,
                      });
                    }
                  }}
                    className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                  <span className="text-sm text-[var(--text-primary)]">Same as Current Address <span className="text-xs text-gray-400">(copies & keeps permanent in sync)</span></span>
                </label>
                <div className={empGridClass}>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Permanent Address</label>
                    <textarea value={input(formData.permanentAddress)} onChange={(e) => set({ permanentAddress: e.target.value })}
                      className={formTextareaClass} placeholder="Enter permanent address" disabled={sameAsCurrent} />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Full permanent residential address</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Permanent Address Landmark</label>
                    <input type="text" value={input(formData.permanentLandmark)} onChange={(e) => set({ permanentLandmark: e.target.value })}
                      className={formInputClass} placeholder="Nearby landmark for permanent address" disabled={sameAsCurrent} />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Nearby landmark for permanent address</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Permanent State</label>
                    <StateSelect value={input(formData.permanentState)} onChange={(v) => set({ permanentState: v })} disabled={sameAsCurrent} />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">State for permanent address</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Permanent Pincode</label>
                    <PincodeInput value={input(formData.permanentPincode)} onChange={(v) => set({ permanentPincode: v })} disabled={sameAsCurrent} />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">6-digit pincode</p>
                  </div>
                </div>

              {/* Identity subsection */}
              <div className="pt-4 mt-2 border-t border-[var(--border-color)]">
                <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-3">
                  <IdCard className="w-4 h-4 text-violet-500" /> Identity Documents & Uploads
                </h4>
                <div className="space-y-4">
                  {/* Photo | CV */}
                  <div className={empGridClass}>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Profile Photo</label>
                      <DocumentUpload
                        label="Profile Photo"
                        docType="photo"
                        employeeId={docEmployeeId}
                        file={formData.photoFile || null}
                        existingUrl={typeof formData.photoUrl === 'string' && formData.photoUrl ? formData.photoUrl : undefined}
                        onFileChange={(f) => {
                          if (f && f.type.startsWith('image/')) {
                            const reader = new FileReader();
                            reader.onload = () => set({ photoFile: f, photoUrl: reader.result as string });
                            reader.readAsDataURL(f);
                          } else {
                            set({ photoFile: f });
                          }
                        }}
                        onUploaded={(url) => set({ photoUrl: url })}
                        onDelete={() => handleDeleteDocument('photo')}
                        accent={accent}
                        hideLabel
                        compact
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Resume / CV</label>
                      <DocumentUpload
                        label="Resume / CV"
                        docType="resume"
                        employeeId={docEmployeeId}
                        file={formData.resumeFile || null}
                        existingUrl={typeof formData.resumeUrl === 'string' ? formData.resumeUrl : undefined}
                        onFileChange={(f) => set({ resumeFile: f })}
                        onDelete={() => handleDeleteDocument('resume')}
                        accent={accent}
                        hideLabel
                        compact
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="border-t border-[var(--border-color)] pt-4" />
                  {/* Identity documents — number + upload side by side */}
                  <div className={`${empGridClass} [&_.doc-pair]:col-span-2 [&_.doc-pair]:grid [&_.doc-pair]:grid-cols-1 [&_.doc-pair]:sm:grid-cols-2 [&_.doc-pair]:gap-x-4 [&_.doc-pair]:items-start`}>
                    {isIndia && (
                      <div className="doc-pair">
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Aadhar Number</label>
                          <input type="text" value={input(formData.aadharNumber)} onChange={(e) => updateField('aadharNumber', formatAadhaar(e.target.value))}
                            className={inputCls('aadharNumber')} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter Aadhar number" maxLength={14} />
                          <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">12-digit Aadhaar number, e.g. 1234 5678 9012</p>
                          <FieldError name="aadharNumber" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Upload Aadhar</label>
                          <DocumentUpload
                            label="Aadhaar Card"
                            docType="aadhar"
                            employeeId={docEmployeeId}
                            file={formData.aadharFile || null}
                            existingUrl={(formData.idDocuments as Record<string, string> | undefined)?.['aadhar']}
                            onFileChange={(f) => set({ aadharFile: f })}
                            onUploaded={(url) => set({ idDocuments: { ...(formData.idDocuments as Record<string, string> || {}), aadhar: url } })}
                            onParsed={(num) => set({ aadharNumber: formatAadhaar(num) })}
                            onDelete={() => handleDeleteDocument('aadhar')}
                            accent={accent}
                            hideLabel
                            compact
                            className="w-full"
                          />
                          <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Upload to auto-fill Aadhaar number</p>
                        </div>
                      </div>
                    )}
                    {isIndia && (
                      <div className="doc-pair">
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">PAN Number</label>
                          <input type="text" value={input(formData.panNumber)} onChange={(e) => updateField('panNumber', e.target.value.toUpperCase())}
                            className={inputCls('panNumber')} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter PAN number" maxLength={10} />
                          <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">10-character PAN, e.g. ABCDE1234F</p>
                          <FieldError name="panNumber" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Upload PAN</label>
                          <DocumentUpload
                            label="PAN Card"
                            docType="pan"
                            employeeId={docEmployeeId}
                            file={formData.panFile || null}
                            existingUrl={(formData.idDocuments as Record<string, string> | undefined)?.['pan']}
                            onFileChange={(f) => set({ panFile: f })}
                            onUploaded={(url) => set({ idDocuments: { ...(formData.idDocuments as Record<string, string> || {}), pan: url } })}
                            onParsed={(num) => set({ panNumber: num.toUpperCase() })}
                            onDelete={() => handleDeleteDocument('pan')}
                            accent={accent}
                            hideLabel
                            compact
                            className="w-full"
                          />
                          <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Upload to auto-fill PAN number</p>
                        </div>
                      </div>
                    )}
                    <div className="doc-pair">
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Voter ID</label>
                          <input type="text" value={input(formData.voterId)} onChange={(e) => updateField('voterId', e.target.value.toUpperCase())}
                            className={inputCls('voterId')} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter Voter ID" maxLength={10} />
                        <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Voter ID card number, e.g. ABC1234567</p>
                        <FieldError name="voterId" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Upload Voter ID</label>
                        <DocumentUpload
                          label="Voter ID"
                          docType="voter"
                          employeeId={docEmployeeId}
                          file={formData.voterFile || null}
                          existingUrl={(formData.idDocuments as Record<string, string> | undefined)?.['voter']}
                          onFileChange={(f) => set({ voterFile: f })}
                          onUploaded={(url) => set({ idDocuments: { ...(formData.idDocuments as Record<string, string> || {}), voter: url } })}
                          onParsed={(num) => set({ voterId: num.toUpperCase() })}
                          onDelete={() => handleDeleteDocument('voter')}
                          accent={accent}
                          hideLabel
                          compact
                          className="w-full"
                        />
                        <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Upload to auto-fill Voter ID</p>
                      </div>
                    </div>
                    <div className="doc-pair">
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Driving License</label>
                        <input type="text" value={input(formData.drivingLicense)} onChange={(e) => set({ drivingLicense: e.target.value })}
                          className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter Driving License" />
                        <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Driving license number</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Upload Driving License</label>
                        <DocumentUpload
                          label="Driving License"
                          docType="drivingLicense"
                          employeeId={docEmployeeId}
                          file={formData.drivingLicenseFile || null}
                          existingUrl={(formData.idDocuments as Record<string, string> | undefined)?.['drivingLicense']}
                          onFileChange={(f) => set({ drivingLicenseFile: f })}
                          onUploaded={(url) => set({ idDocuments: { ...(formData.idDocuments as Record<string, string> || {}), drivingLicense: url } })}
                          onParsed={(num) => set({ drivingLicense: num })}
                          onDelete={() => handleDeleteDocument('drivingLicense')}
                          accent={accent}
                          hideLabel
                          compact
                          className="w-full"
                        />
                        <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Upload to auto-fill license number</p>
                      </div>
                    </div>
                    <div className="doc-pair">
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Passport Number</label>
                        <input type="text" value={input(formData.passportNumber)} onChange={(e) => set({ passportNumber: e.target.value.toUpperCase() })}
                          className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter Passport Number" />
                        <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Passport number</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Upload Passport</label>
                        <DocumentUpload
                          label="Passport"
                          docType="passport"
                          employeeId={docEmployeeId}
                          file={formData.passportFile || null}
                          existingUrl={(formData.idDocuments as Record<string, string> | undefined)?.['passport']}
                          onFileChange={(f) => set({ passportFile: f })}
                          onUploaded={(url) => set({ idDocuments: { ...(formData.idDocuments as Record<string, string> || {}), passport: url } })}
                          onParsed={(num) => set({ passportNumber: num.toUpperCase() })}
                          onDelete={() => handleDeleteDocument('passport')}
                          accent={accent}
                          hideLabel
                          compact
                          className="w-full"
                        />
                        <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Upload to auto-fill passport number</p>
                      </div>
                    </div>
                    <div className="doc-pair">
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Birth Certificate No. <span className="text-xs font-normal text-[#94A3B8]">(optional)</span></label>
                        <input type="text" value={input(formData.birthCertificateNumber)} onChange={(e) => set({ birthCertificateNumber: e.target.value })}
                          className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter Birth Certificate number" />
                        <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Birth certificate number</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Upload Birth Certificate</label>
                        <DocumentUpload
                          label="Birth Certificate"
                          docType="birthCertificate"
                          employeeId={docEmployeeId}
                          file={formData.birthCertificateFile || null}
                          existingUrl={(formData.idDocuments as Record<string, string> | undefined)?.['birthCertificate']}
                          onFileChange={(f) => set({ birthCertificateFile: f })}
                          onUploaded={(url) => set({ idDocuments: { ...(formData.idDocuments as Record<string, string> || {}), birthCertificate: url } })}
                          onParsed={(num) => set({ birthCertificateNumber: num })}
                          onDelete={() => handleDeleteDocument('birthCertificate')}
                          accent={accent}
                          hideLabel
                          compact
                          className="w-full"
                        />
                        <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Optional birth certificate upload</p>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            )}

            {/* EDUCATION */}
            {tab === 'education' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[var(--text-primary)]">Education Details</h4>
                  <button type="button" onClick={() => addRow('educationDetails')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-colors" style={{ backgroundColor: accent }}>
                    + Add Education
                  </button>
                </div>
                {(formData.educationDetails as Record<string, unknown>[] || []).length === 0 && (
                  <div className={empGridClass}>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Education Level</label>
                      <SearchableSelect
                        value={input(formData.educationLevel) as string}
                        onChange={(v) => set({ educationLevel: String(v) })}
                        options={(educationLevelOptions as Option[]).map((opt: Option) => ({ id: String(opt.value ?? opt.code ?? ''), name: opt.label || opt.name || '' }))}
                        placeholder="Select Education Level"
                        showAllOption={false}
                        clearable
                        className="w-full"
                      />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Select highest education level</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Institution</label>
                      <input type="text" value={input(formData.institution)} onChange={(e) => set({ institution: e.target.value })}
                        className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="University/College name" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">University or college name</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Degree</label>
                      <input type="text" value={input(formData.degree)} onChange={(e) => set({ degree: e.target.value })}
                        className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., B.Tech, MBA, MCA" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Degree or qualification title</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Field of Study</label>
                      <input type="text" value={input(formData.fieldOfStudy)} onChange={(e) => set({ fieldOfStudy: e.target.value })}
                        className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., Computer Science, Business" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Field or subject studied</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Graduation Year</label>
                      <input type="text" value={input(formData.graduationYear)} onChange={(e) => set({ graduationYear: e.target.value })}
                        className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., 2020" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Year of graduation, e.g., 2020</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Grade/Percentage</label>
                      <input type="text" value={input(formData.grade)} onChange={(e) => set({ grade: e.target.value })}
                        className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., First Class, 85%" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Grade or percentage achieved</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Upload Certificate</label>
                      <DocumentUpload
                        label="Education Certificate"
                        docType="certificate"
                        employeeId={docEmployeeId}
                        file={formData.educationFile || null}
                        existingUrl={(formData.idDocuments as Record<string, string> | undefined)?.['certificate']}
                        onFileChange={(f) => set({ educationFile: f })}
                        onUploaded={(url) => set({ idDocuments: { ...(formData.idDocuments as Record<string, string> || {}), certificate: url } })}
                        onDelete={() => { const docs = { ...(formData.idDocuments as Record<string, string> || {}) }; delete docs['certificate']; set({ idDocuments: docs }); }}
                        accent={accent}
                        hideLabel
                        compact
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
                {(formData.educationDetails as Record<string, unknown>[] || []).map((ed, idx) => (
                  <div key={idx} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-semibold text-[#0F172A]">Education {idx + 1}</h5>
                      {idx >= 2 && (
                        <button type="button" onClick={() => removeRow('educationDetails', idx)}
                          className="text-[#DC2626] hover:bg-red-50 p-1 rounded-lg transition-colors" title="Remove">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className={empGridClass}>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Education Level</label>
                          <SearchableSelect
                            value={String(ed.educationLevel ?? '')}
                            onChange={(v) => updateList('educationDetails', idx, { educationLevel: String(v) })}
                            options={(educationLevelOptions as Option[]).map((opt: Option) => ({ id: String(opt.value ?? opt.code ?? ''), name: opt.label || opt.name || '' }))}
                            placeholder="Select Education Level"
                            showAllOption={false}
                            clearable
                            className="w-full"
                          />
                          <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Select highest education level</p>
                        </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Institution</label>
                        <input type="text" value={input(ed.institution)} onChange={(e) => updateList('educationDetails', idx, { institution: e.target.value })}
                          className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="University/College name" />
                          <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">University or college name</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Degree</label>
                        <input type="text" value={input(ed.degree)} onChange={(e) => updateList('educationDetails', idx, { degree: e.target.value })}
                          className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., B.Tech, MBA, MCA" />
                          <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Degree or qualification title</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Field of Study</label>
                        <input type="text" value={input(ed.fieldOfStudy)} onChange={(e) => updateList('educationDetails', idx, { fieldOfStudy: e.target.value })}
                          className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., Computer Science" />
                          <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Field or subject studied</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Graduation Year</label>
                        <input type="text" value={input(ed.graduationYear)} onChange={(e) => updateList('educationDetails', idx, { graduationYear: e.target.value })}
                          className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., 2020" />
                          <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Year of graduation, e.g., 2020</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Grade/Percentage</label>
                        <input type="text" value={input(ed.grade)} onChange={(e) => updateList('educationDetails', idx, { grade: e.target.value })}
                          className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., First Class, 85%" />
                          <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Grade or percentage achieved</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Upload Certificate</label>
                        <DocumentUpload
                          label={`Education Certificate ${idx + 1}`}
                          docType="certificate"
                          employeeId={docEmployeeId}
                          file={(ed.file as File) || null}
                          existingUrl={typeof ed.url === 'string' && ed.url ? ed.url : undefined}
                          onFileChange={(f) => updateList('educationDetails', idx, { file: f })}
                          onUploaded={(url) => updateList('educationDetails', idx, { url })}
                          onDelete={() => updateList('educationDetails', idx, { url: undefined, file: undefined })}
                          accent={accent}
                          hideLabel
                          compact
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="pt-4 border-t border-[var(--border-color)] space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-[var(--text-primary)]">Certification Details</h4>
                    <button type="button" onClick={() => addRow('certifications')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-colors" style={{ backgroundColor: accent }}>
                      + Add Certification
                    </button>
                  </div>
                  {(formData.certifications as Record<string, unknown>[] || []).length === 0 && (
                    <p className="text-sm text-[#94A3B8]">No certifications added. Click "+ Add Certification" to add one.</p>
                  )}
                  {(formData.certifications as Record<string, unknown>[] || []).map((cert, idx) => (
                    <div key={idx} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3 relative">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-semibold text-[#0F172A]">Certification {idx + 1}</h5>
                        {idx >= 2 && (
                          <button type="button" onClick={() => removeRow('certifications', idx)}
                            className="text-[#DC2626] hover:bg-red-50 p-1 rounded-lg transition-colors" title="Remove">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className={empGridClass}>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Certification Name</label>
                          <input type="text" value={input(cert.name)} onChange={(e) => updateList('certifications', idx, { name: e.target.value })}
                            className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., AWS, PMP, Six Sigma" />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Certification name, e.g., AWS, PMP</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Issuing Organization</label>
                          <input type="text" value={input(cert.organization)} onChange={(e) => updateList('certifications', idx, { organization: e.target.value })}
                            className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Organization name" />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Organization that issued it</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Certification Date</label>
                          <DatePicker value={input(cert.issueDate)} onChange={(val) => updateList('certifications', idx, { issueDate: val })} />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Certification issue date, dd-mm-yyyy</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Expiry Date <span className="text-xs font-normal text-[#94A3B8]">(optional)</span></label>
                          <DatePicker value={input(cert.expiryDate)} onChange={(val) => updateList('certifications', idx, { expiryDate: val })} />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Certification expiry date, if any</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Upload Certificate</label>
                          <DocumentUpload
                            label={`Certificate ${idx + 1}`}
                            docType="certificate"
                            employeeId={docEmployeeId}
                            file={null}
                            existingUrl={typeof cert.url === 'string' && cert.url ? cert.url : undefined}
                            onFileChange={(f) => {
                              if (f && f.type.startsWith('image/')) {
                                const reader = new FileReader();
                                reader.onload = () => updateList('certifications', idx, { file: f, url: reader.result as string });
                              } else {
                                updateList('certifications', idx, { file: f });
                              }
                            }}
                            onDelete={() => updateList('certifications', idx, { url: undefined, file: undefined })}
                            accent={accent}
                            hideLabel
                            compact
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Skills subsection */}
                <div className="pt-4 mt-2 border-t border-[var(--border-color)]">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-3">
                    <Award className="w-4 h-4 text-yellow-500" /> Skills & Languages
                </h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">Languages</h4>
                      <button type="button" onClick={() => addRow('languages')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-colors" style={{ backgroundColor: accent }}>
                        + Add Language
                      </button>
                    </div>
                    {(formData.languages as Record<string, unknown>[] || []).map((lang, idx) => (
                      <div key={idx} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3 relative mb-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-semibold text-[#0F172A]">Language {idx + 1}</h5>
                          {idx >= 2 && (
                            <button type="button" onClick={() => removeRow('languages', idx)}
                              className="text-[#DC2626] hover:bg-red-50 p-1 rounded-lg transition-colors" title="Remove">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className={empGridClass}>
                          <div>
                            <label className="block text-xs font-medium text-[#64748B] mb-1">Language</label>
                            <input type="text" value={input(lang.name)} onChange={(e) => updateList('languages', idx, { name: e.target.value })}
                              className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., English, Hindi, Tamil" />
                              <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Language name</p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[#64748B] mb-1">Proficiency</label>
                            <SearchableSelect
                              value={String(lang.proficiency ?? '')}
                              onChange={(v) => updateList('languages', idx, { proficiency: String(v) })}
                              options={(proficiencyOptions || []).map((opt: any) => ({ id: String(opt.code ?? opt.value ?? ''), name: opt.name || opt.label || '' }))}
                              placeholder="Select level"
                              showAllOption={false}
                              clearable
                              className="w-full"
                            />
                              <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Read/Write/Speak level</p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[#64748B] mb-1">Is Native</label>
                            <div className="flex items-center gap-2 mt-1">
                              <input type="checkbox" checked={!!lang.isNative} onChange={(e) => updateList('languages', idx, { isNative: e.target.checked })}
                                className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                              <span className="text-sm text-[var(--text-primary)]">Native speaker</span>
                            </div>
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Mother tongue / native</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(formData.languages as Record<string, unknown>[] || []).length === 0 && (
                      <p className="text-sm text-[#94A3B8] py-1">No languages added. Click "+ Add Language" to add one.</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">Skills</h4>
                    <button type="button" onClick={() => addRow('skillsList')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-colors" style={{ backgroundColor: accent }}>
                      + Add Skill
                    </button>
                  </div>
                  {(formData.skillsList as Record<string, unknown>[] || []).length === 0 && (
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Skills</label>
                      <textarea value={input(formData.skills)} onChange={(e) => set({ skills: e.target.value })}
                        className={formTextareaClass} placeholder="e.g., Java, Python, Project Management, Communication" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Comma-separated list of skills</p>
                    </div>
                  )}
                  {(formData.skillsList as Record<string, unknown>[] || []).map((sk, idx) => (
                    <div key={idx} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3 relative">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-semibold text-[#0F172A]">Skill {idx + 1}</h5>
                        {idx >= 2 && (
                          <button type="button" onClick={() => removeRow('skillsList', idx)}
                            className="text-[#DC2626] hover:bg-red-50 p-1 rounded-lg transition-colors" title="Remove">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className={empGridClass}>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Skill Name</label>
                          <input type="text" value={input(sk.name)} onChange={(e) => updateList('skillsList', idx, { name: e.target.value })}
                            className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., Java, Python, Excel" />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Name of the skill</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Proficiency</label>
                          <SearchableSelect
                            value={String(sk.proficiency ?? '')}
                            onChange={(v) => updateList('skillsList', idx, { proficiency: String(v) })}
                            options={(proficiencyOptions || []).map((opt: any) => ({ id: String(opt.code ?? opt.value ?? ''), name: opt.name || opt.label || '' }))}
                            placeholder="Select level"
                            showAllOption={false}
                            clearable
                            className="w-full"
                          />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Select skill proficiency level</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Years of Experience</label>
                          <input type="number" min="0" value={num(sk.years)} onChange={(e) => updateList('skillsList', idx, { years: e.target.value })}
                            className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., 3" />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Years of experience with skill</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Last Used</label>
                          <DatePicker value={input(sk.lastUsed)} onChange={(val) => updateList('skillsList', idx, { lastUsed: val })} />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Last year the skill was used</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              </div>
            )}

            {/* BENEFITS */}
            {tab === 'benefits' && (
              <div className="space-y-4">
                {isIndia && (
                <div className={empGridClass}>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">PF Number</label>
                    <input type="text" value={input(formData.pfNumber)} onChange={(e) => set({ pfNumber: e.target.value })}
                      className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter PF Number" />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Provident Fund account number</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">PF UAN</label>
                    <input type="text" value={input(formData.pfUan)} onChange={(e) => set({ pfUan: e.target.value })}
                      className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter PF UAN" />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Universal Account Number (12-digit)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">ESIC Number</label>
                    <input type="text" value={input(formData.esicNumber)} onChange={(e) => set({ esicNumber: e.target.value })}
                      className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter ESIC Number" />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">ESIC insurance number</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Gratuity</label>
                    <div className="flex items-center gap-4">
                      <ToggleSwitch
                        checked={!!formData.gratuityApplicable}
                        onChange={(v) => set({ gratuityApplicable: v })}
                      />
                      <span className="text-sm text-[var(--text-primary)]">{formData.gratuityApplicable ? 'Applicable' : 'Not Applicable'}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Gratuity benefit applicability for this employee</p>
                  </div>
                </div>
                )}
                <div className={empGridClass}>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Life Insurance Provider</label>
                    <input type="text" value={input(formData.lifeInsuranceProvider)} onChange={(e) => set({ lifeInsuranceProvider: e.target.value })}
                      className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter Life Insurance Provider Name" />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Life insurance provider company name</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Life Insurance Number</label>
                    <input type="text" value={input(formData.lifeInsuranceNumber)} onChange={(e) => set({ lifeInsuranceNumber: e.target.value })}
                      className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter Life Insurance Policy Number" />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Life insurance policy number</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Mediclaim Provider</label>
                    <input type="text" value={input(formData.mediclaimProvider)} onChange={(e) => set({ mediclaimProvider: e.target.value })}
                      className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter Insurance Provider Name" />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Insurance provider company name</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Mediclaim Number</label>
                    <input type="text" value={input(formData.mediclaimNumber)} onChange={(e) => set({ mediclaimNumber: e.target.value })}
                      className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter Mediclaim Number" />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Mediclaim policy number</p>
                  </div>
                </div>
                <div className={empGridClass}>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Nominee Name</label>
                    <input type="text" value={input(formData.nomineeName)} onChange={(e) => set({ nomineeName: e.target.value })}
                      className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Enter nominee name" />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Insurance nominee's full name</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Nominee Relationship</label>
                    <input type="text" value={input(formData.nomineeRelationship)} onChange={(e) => set({ nomineeRelationship: e.target.value })}
                      className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., Father, Spouse, Son" />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Relationship of nominee, e.g., Father</p>
                  </div>
                </div>

                {/* Tax subsection */}
                <div className="pt-4 mt-2 border-t border-[var(--border-color)]">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-3">
                    <Landmark className="w-4 h-4 text-emerald-600" /> Tax Declarations
                  </h4>
                  <div className={empGridClass}>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Section 80C Deduction</label>
                      <input type="number" className={formInputClass} value={(formData as any).deduction80c || ''} onChange={e => setFormData({ ...formData, deduction80c: parseFloat(e.target.value) || 0 } as any)} placeholder="0" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Annual deduction claimed under Section 80C</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Section 80D (Medical)</label>
                      <input type="number" className={formInputClass} value={(formData as any).deduction80d || ''} onChange={e => setFormData({ ...formData, deduction80d: parseFloat(e.target.value) || 0 } as any)} placeholder="0" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Medical insurance premium claimed under Section 80D</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">HRA Exemption</label>
                      <input type="number" className={formInputClass} value={(formData as any).hraExemption || ''} onChange={e => setFormData({ ...formData, hraExemption: parseFloat(e.target.value) || 0 } as any)} placeholder="0" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">House Rent Allowance exemption amount</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">LTA Exemption</label>
                      <input type="number" className={formInputClass} value={(formData as any).ltaExemption || ''} onChange={e => setFormData({ ...formData, ltaExemption: parseFloat(e.target.value) || 0 } as any)} placeholder="0" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Leave Travel Allowance exemption amount</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">NPS Deduction</label>
                      <input type="number" className={formInputClass} value={(formData as any).npsDeduction || ''} onChange={e => setFormData({ ...formData, npsDeduction: parseFloat(e.target.value) || 0 } as any)} placeholder="0" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">NPS contribution claimed under Section 80CCD(1B)</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Home Loan Interest</label>
                      <input type="number" className={formInputClass} value={(formData as any).homeLoanInterest || ''} onChange={e => setFormData({ ...formData, homeLoanInterest: parseFloat(e.target.value) || 0 } as any)} placeholder="0" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Interest paid on home loan under Section 24(b)</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* BANK */}
            {tab === 'bank' && (
              <div className="space-y-5">
                {[0, 1, 2].map((idx) => {
                  const acc = (formData.bankAccounts || [])[idx] || {};
                  const banks = formData.bankAccounts || [];
                  // Account 0 is only the default primary when no account is explicitly marked primary.
                  const hasExplicitPrimary = banks.some((b: any) => b.isPrimary);
                  const isPrimary = hasExplicitPrimary ? !!acc.isPrimary : idx === 0;
                  return (
                    <div key={idx} className={`bg-[#F8FAFC] border rounded-xl p-4 space-y-3 ${isPrimary ? 'border-[#1C64F2]/40 ring-1 ring-[#1C64F2]/20' : 'border-[#E2E8F0]'}`}>
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-semibold text-[#0F172A] flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: isPrimary ? accent : '#64748B' }}>{idx + 1}</span>
                          Bank Account {idx + 1}
                          {isPrimary && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: accent }}>PRIMARY</span>
                          )}
                        </h5>
                        {!isPrimary && (
                          <button type="button" onClick={() => setPrimaryBank(idx)}
                            className="text-xs font-medium text-[#1C64F2] hover:text-[#1D4ED8] border border-[#1C64F2]/30 rounded-lg px-2.5 py-1 hover:bg-blue-50 transition-colors">
                            Set as Primary
                          </button>
                        )}
                      </div>
                      <div className={empGridClass}>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Account Holder Name</label>
                          <input type="text" value={input(acc.accountHolderName)}
                            onChange={(e) => updateBankAccount(idx, { accountHolderName: e.target.value })}
                            className={formInputClass} placeholder="Account holder name" />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Name as per bank records</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Bank Name</label>
                          <input type="text" value={input(acc.bankName)}
                            onChange={(e) => updateBankAccount(idx, { bankName: e.target.value })}
                            placeholder="Bank name" className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Name of the bank</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Account Number</label>
                          <input type="text" value={input(acc.bankAccountNumber)}
                            onChange={(e) => updateBankAccount(idx, { bankAccountNumber: e.target.value })}
                            placeholder="Account number" className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Bank account number</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">IFSC Code</label>
                          <IfscInput
                            value={input(acc.ifscCode)}
                            onChange={(v) => updateBankAccount(idx, { ifscCode: v })}
                            placeholder="IFSC code"
                            inputClassName={formInputClass}
                            className="relative w-full"
                          />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">11-character IFSC code</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* SALARY */}
            {tab === 'salary' && (
              <div className="space-y-5">
                <div className={empGridClass}>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Company</label>
                    <SearchableSelect
                      value={salaryCompanyId}
                      onChange={(v) => set({ salaryCompanyId: String(v), salaryTemplateId: '', payrollTemplateId: '', leaveTemplateId: '', attendancePolicyId: '', payrollPolicyId: '', taxRegimeId: '' })}
                      options={(companiesList || []).map((c: Company) => ({ id: c.id, name: c.name }))}
                      placeholder="Select Company"
                      showAllOption={false}
                      clearable
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Company whose salary policy applies. Payroll templates are scoped to it.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Payroll Template <span className="text-xs text-gray-500 font-normal">(company-wise)</span></label>
                    <SearchableSelect
                      value={String(formData.payrollTemplateId ?? '')}
                      onChange={(v) => {
                        const cid = v === '' ? '' : String(v);
                        const tpl = payrollTemplates.find((t) => String(t.id) === cid);
                        set({
                          payrollTemplateId: cid,
                          salaryTemplateId: '',
                          payrollPolicyId: tpl?.payroll_policy_id ? String(tpl.payroll_policy_id) : '',
                          attendancePolicyId: tpl?.attendance_policy_id ? String(tpl.attendance_policy_id) : '',
                          taxRegimeId: tpl?.tax_regime_id ? String(tpl.tax_regime_id) : '',
                          leaveTemplateId: tpl?.leave_template_id ? String(tpl.leave_template_id) : '',
                        });
                        if (cid && formData.baseSalary) setTimeout(() => splitRef.current(String(formData.baseSalary), salaryMode), 0);
                      }}
                      options={payrollTemplates.map((t) => ({ id: String(t.id), name: `${t.name}${t.company_name ? ` — ${t.company_name}` : ''}` }))}
                      placeholder={salaryCompanyId ? 'Select a payroll template (recommended)' : 'Select a company first'}
                      showAllOption={false}
                      clearable
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Applies the template's policy, components, statutory, tax regime & attendance.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Leave Template <span className="text-xs text-gray-500 font-normal">(company-wise)</span></label>
                    <SearchableSelect
                      value={String(formData.leaveTemplateId ?? '')}
                      onChange={(v) => set({ leaveTemplateId: v === '' ? '' : String(v) })}
                      options={leaveTplOpts.map((t) => ({ id: t.id, name: t.name }))}
                      placeholder={salaryCompanyId ? 'Select a leave template (recommended)' : 'Select a company first'}
                      showAllOption={false}
                      clearable
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Yearly quotas resolve from this template instantly — no bulk initialize needed.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Attendance Template <span className="text-xs text-gray-500 font-normal">(company-wise)</span></label>
                    <SearchableSelect
                      value={String(formData.attendancePolicyId ?? '')}
                      onChange={(v) => set({ attendancePolicyId: v === '' ? '' : String(v) })}
                      options={attendanceOpts.map((p) => ({ id: p.id, name: p.name }))}
                      placeholder={salaryCompanyId ? 'Select an attendance template' : 'Select a company first'}
                      showAllOption={false}
                      clearable
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Workweek, timing rules & geo-fence used for attendance and payroll.</p>
                  </div>
                  {!formData.payrollTemplateId && (
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Salary Template <span className="text-xs text-gray-500 font-normal">(legacy)</span></label>
                    <SearchableSelect
                      value={String(formData.salaryTemplateId ?? '')}
                      onChange={(v) => {
                        const cid = String(v);
                        set({ salaryTemplateId: cid });
                        if (cid && formData.baseSalary) setTimeout(() => splitRef.current(String(formData.baseSalary), salaryMode), 0);
                      }}
                      options={salaryTemplates.map((t: Record<string, unknown>) => ({ id: String(t.id), name: String(t.name || '') }))}
                      placeholder={salaryCompanyId ? 'Select Salary Template' : 'Select a company first'}
                      showAllOption={false}
                      clearable
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Legacy breakdown percentages — hidden when a Payroll Template is selected above.</p>
                  </div>
                )}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Payroll Policy <span className="text-xs text-gray-500 font-normal">(auto from template)</span></label>
                    <SearchableSelect
                      value={String(formData.payrollPolicyId ?? '')}
                      onChange={(v) => set({ payrollPolicyId: v === '' ? '' : String(v) })}
                      options={payrollPolicyOpts.map((p) => ({ id: p.id, name: p.name }))}
                      placeholder="Inherit org default"
                      showAllOption={false}
                      clearable
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Pro-ration, rounding & gratuity rules for this employee.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Tax Regime <span className="text-xs text-gray-500 font-normal">(auto from template)</span></label>
                    <SearchableSelect
                      value={String(formData.taxRegimeId ?? '')}
                      onChange={(v) => set({ taxRegimeId: v === '' ? '' : String(v) })}
                      options={taxRegimeOpts.map((r) => ({ id: r.id, name: r.name }))}
                      placeholder="Inherit org default"
                      showAllOption={false}
                      clearable
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Tax slabs, rebate & surcharge for TDS on this employee.</p>
                  </div>
                  {salaryMode !== 'manual' && (
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                        {salaryMode === 'annual' ? 'Annual Base Salary (CTC)' : salaryMode === 'daily' ? 'Daily Wage' : salaryMode === 'weekly' ? 'Weekly Wage' : 'Monthly Base Salary'}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] text-sm">{currencySymbol}</span>
                        <input type="number" min="0" value={num(formData.baseSalary)} onChange={(e) => handleBaseSalaryChange(e.target.value, salaryMode)}
                          className="w-full pl-8 pr-4 py-2.5 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2" style={{ ['--tw-ring-color' as string]: accent }} placeholder={salaryMode === 'annual' ? 'e.g. 1200000' : salaryMode === 'daily' ? 'e.g. 500' : salaryMode === 'weekly' ? 'e.g. 3500' : 'e.g. 120000'} />
                      </div>
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">{salaryMode === 'annual' ? 'Enter annual CTC — auto-splits into monthly earnings & deductions below.' : salaryMode === 'daily' ? 'Enter per-day wage — monthly equivalent (— 30 days) auto-splits below.' : salaryMode === 'weekly' ? 'Enter per-week wage — monthly equivalent (— 52/12) auto-splits below.' : 'Enter monthly salary — auto-splits into earnings & deductions below.'}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Salary Currency</label>
                      <input type="text" maxLength={3} value={String(formData.salaryCurrency ?? '')} onChange={(e) => set({ salaryCurrency: e.target.value.toUpperCase() })}
                        className="w-full px-3.5 py-2.5 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2" style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g. INR" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">ISO code of the currency this salary is quoted in. Blank = policy currency.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Exchange Rate</label>
                      <input type="number" min="0" step="any" value={num(formData.currencyExchangeRate) || ''} onChange={(e) => set({ currencyExchangeRate: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                        className="w-full px-3.5 py-2.5 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2" style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g. 83.50" />
                      <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Policy currency per 1 unit of employee currency (e.g. 83.50 means 1 USD = 83.50 INR). Blank = auto.</p>
                    </div>
                  </div>
                </div>
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-4">
                  {/* Mode selector: daily / weekly / monthly / annual auto-split or manual entry */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-[var(--text-primary)]">Salary Entry Mode</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {([
                        { id: 'daily', title: 'Daily (Auto-calculate)', desc: 'Enter the per-day wage once — monthly equivalent (— 30 days) splits into earnings & deductions below.' },
                        { id: 'weekly', title: 'Weekly (Auto-calculate)', desc: 'Enter the per-week wage once — monthly equivalent (— 52/12) splits into earnings & deductions below.' },
                        { id: 'monthly', title: 'Monthly (Auto-calculate)', desc: 'Enter the monthly salary once and the earnings & deductions below are filled in automatically. You can still adjust any field afterwards.' },
                        { id: 'annual', title: 'Annual (Auto-calculate)', desc: 'Enter the annual salary (CTC) once and the monthly earnings & deductions below are filled in automatically. You can still adjust any field afterwards.' },
                        { id: 'manual', title: 'Manual Entry', desc: 'Enter each earning and deduction amount yourself — no auto-calculation is applied.' },
                      ] as { id: SalaryMode; title: string; desc: string }[]).map((m) => (
                        <label key={m.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${salaryMode === m.id ? 'border-[#1C64F2] bg-blue-50' : 'border-[#E2E8F0] bg-white hover:border-slate-300'}`}>
                          <input
                            type="radio"
                            name="salaryMode"
                            checked={salaryMode === m.id}
                            onChange={() => switchSalaryMode(m.id)}
                            className="mt-1 w-4 h-4 text-[#1C64F2] focus:ring-[#1C64F2]"
                          />
                          <div>
                            <p className="text-sm font-semibold text-[#0F172A]">{m.title}</p>
                            <p className="text-xs text-[#64748B] mt-0.5">{m.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {salaryMode === 'manual' && (
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                      <p className="text-xs text-blue-700">Manual mode — enter each earning and deduction amount below yourself. No auto-calculation.</p>
                    </div>
                  )}
                  {previewActive && (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <p className="text-xs text-emerald-800">
                        <b>Live payroll preview</b> — every figure below is computed by the payroll engine from your selected template and statutory rules, exactly like the payslip will be. Edit the template to change these values, or switch to Manual mode for a sanctioned hand-set override.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4">
                    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
                      <h5 className="text-sm font-semibold text-[#0F172A] mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><TrendingUp className="w-3.5 h-3.5" /></span>
                        Monthly Earnings
                        {previewActive && <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">From template — read only</span>}
                      </h5>
                      <div className={empGridClass}>
                        {EARNINGS.map(([key, label]) => (
                          <div key={key}>
                            <label className="block text-xs font-medium text-[#64748B] mb-1">{label}</label>
                            <input type="number" min="0" readOnly={previewActive}
                              value={previewActive ? num(previewField(key)) : num((formData.salaryComponents || {})[key])}
                              onChange={(e) => setComp(key, e.target.value)}
                              placeholder={`e.g. ${key === 'basic' ? '50000' : key === 'hra' ? '20000' : '10000'}`}
                              className={`${formInputClass}${previewActive ? ' bg-slate-50 text-slate-600 cursor-default' : ''}`} style={{ ['--tw-ring-color' as string]: accent }} />
                              <p className="mt-1 text-xs text-[#94A3B8]">{earningHelp[key] || 'Monthly amount in INR'}</p>
                          </div>
                        ))}
                        {previewActive && previewExtras.earnings.map((x, i) => (
                          <div key={`x-earn-${i}`}>
                            <label className="block text-xs font-medium text-[#64748B] mb-1">{x.name}</label>
                            <input type="number" readOnly value={num(x.value)}
                              className={`${formInputClass} bg-slate-50 text-slate-600 cursor-default`} style={{ ['--tw-ring-color' as string]: accent }} />
                            <p className="mt-1 text-xs text-[#94A3B8]">Computed by payroll engine - read only</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
                      <h5 className="text-sm font-semibold text-[#0F172A] mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"><TrendingDown className="w-3.5 h-3.5" /></span>
                        Monthly Deductions
                        {previewActive && <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">From template — read only</span>}
                      </h5>
                      <div className={empGridClass}>
                        {DEDUCTIONS.map(([key, label]) => (
                          <div key={key}>
                            <label className="block text-xs font-medium text-[#64748B] mb-1">{label}</label>
                            <input type="number" min="0" readOnly={previewActive}
                              value={previewActive ? num(previewField(key)) : num((formData.salaryComponents || {})[key])}
                              onChange={(e) => setComp(key, e.target.value)}
                              placeholder="e.g. 1000"
                              className={`${formInputClass}${previewActive ? ' bg-slate-50 text-slate-600 cursor-default' : ''}`} style={{ ['--tw-ring-color' as string]: accent }} />
                            <p className="mt-1 text-xs text-[#94A3B8]">{deductionHelp[key] || 'Monthly amount in INR'}</p>
                          </div>
                        ))}
                        {previewActive && previewExtras.deductions.map((x, i) => (
                          <div key={`x-ded-${i}`}>
                            <label className="block text-xs font-medium text-[#64748B] mb-1">{x.name}</label>
                            <input type="number" readOnly value={num(x.value)}
                              className={`${formInputClass} bg-slate-50 text-slate-600 cursor-default`} style={{ ['--tw-ring-color' as string]: accent }} />
                            <p className="mt-1 text-xs text-[#94A3B8]">Computed by payroll engine - read only</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Employer Contributions (cost-to-company) */}
                    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
                      <h5 className="text-sm font-semibold text-[#0F172A] mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><Building2 className="w-3.5 h-3.5" /></span>
                        Employer Contributions (cost to company)
                        {previewActive && <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">From template — read only</span>}
                      </h5>
                      <div className={empGridClass}>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Employer PF</label>
                          <input type="number" min="0" readOnly={previewActive}
                            value={previewActive ? num(previewField('employerPf')) : num(comps.employerPf)}
                            onChange={(e) => setComp('employerPf', e.target.value)}
                            placeholder="e.g. 1800"
                            className={`${formInputClass}${previewActive ? ' bg-slate-50 text-slate-600 cursor-default' : ''}`} style={{ ['--tw-ring-color' as string]: accent }} />
                          <p className="mt-1 text-xs text-[#94A3B8]">{(pfEmployerRate + pfAdminRate + pfEdliRate)}% of Basic — EPS 8.33% + EPF {(pfEmployerRate - 8.33).toFixed(2)}% + Admin {pfAdminRate}% + EDLI {pfEdliRate}% (capped {getCurrencySymbol(getAppCurrency())}{employerPfCap.toLocaleString('en-IN')})</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Employer ESI</label>
                          <input type="number" min="0" readOnly={previewActive}
                            value={previewActive ? num(previewField('employerEsi')) : num(comps.employerEsi)}
                            onChange={(e) => setComp('employerEsi', e.target.value)}
                            placeholder="e.g. 400"
                            className={`${formInputClass}${previewActive ? ' bg-slate-50 text-slate-600 cursor-default' : ''}`} style={{ ['--tw-ring-color' as string]: accent }} />
                          <p className="mt-1 text-xs text-[#94A3B8]">{esiEmployerRate}% of gross (only if monthly ≤ {getCurrencySymbol(getAppCurrency())}{esiGrossCeiling.toLocaleString('en-IN')})</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Gratuity (Employer)</label>
                          <input type="number" min="0" readOnly={previewActive}
                            value={previewActive ? num(previewField('employerGratuity')) : num(comps.employerGratuity)}
                            onChange={(e) => setComp('employerGratuity', e.target.value)}
                            placeholder="e.g. 2400"
                            className={`${formInputClass}${previewActive ? ' bg-slate-50 text-slate-600 cursor-default' : ''}`} style={{ ['--tw-ring-color' as string]: accent }} />
                          <p className="mt-1 text-xs text-[#94A3B8]">{gratuityRate}% of Basic {gratuityApplicable ? '' : '(not applicable)'}</p>
                        </div>
                        {previewActive && previewExtras.employer.map((x, i) => (
                          <div key={`x-emp-${i}`}>
                            <label className="block text-xs font-medium text-[#64748B] mb-1">{x.name}</label>
                            <input type="number" readOnly value={num(x.value)}
                              className={`${formInputClass} bg-slate-50 text-slate-600 cursor-default`} style={{ ['--tw-ring-color' as string]: accent }} />
                            <p className="mt-1 text-xs text-[#94A3B8]">Employer contribution (cost to company) - read only</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Salary Summary */}
                  <div className="border-t border-[#E2E8F0] pt-4 grid grid-cols-1 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    <div className="p-3 rounded-lg bg-white border border-[#E2E8F0]">
                      <p className="text-xs font-medium text-[#64748B]">Total Earnings</p>
                      <p className="text-lg font-bold text-[#0F172A] mt-1">{currencySymbol}{totalEarnings.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-white border border-[#E2E8F0]">
                      <p className="text-xs font-medium text-[#64748B]">Total Deductions</p>
                      <p className="text-lg font-bold text-[#DC2626] mt-1">- {currencySymbol}{totalDeductions.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200">
                      <p className="text-xs font-medium text-[#4338CA]">Employer Cost</p>
                      <p className="text-lg font-bold text-[#4F46E5] mt-1">{currencySymbol}{totalEmployerContributions.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                      <p className="text-xs font-medium text-[#1E40AF]">Gross Salary</p>
                      <p className="text-lg font-bold text-[#1D4ED8] mt-1">{currencySymbol}{grossSalary.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <p className="text-xs font-medium text-[#047857]">Net Salary (Take-home)</p>
                      <p className="text-lg font-bold text-[#059669] mt-1">{currencySymbol}{netSalary.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-xs font-medium text-[#B45309]">CTC (Cost to Company)</p>
                      <p className="text-lg font-bold text-[#D97706] mt-1">{currencySymbol}{ctc.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* EXPERIENCE */}
            {tab === 'experience' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[var(--text-primary)]">Job Experience</h4>
                  <button type="button" onClick={() => addRow('experienceDetails')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-colors" style={{ backgroundColor: accent }}>
                    + Add Experience
                  </button>
                </div>
                {((formData.experienceDetails as Record<string, unknown>[] | undefined)?.length
                  ? (formData.experienceDetails as Record<string, unknown>[])
                  : [{}]).map((ex, idx) => (
                  <div key={idx} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-semibold text-[#0F172A]">Previous Organization {idx + 1}</h5>
                      {idx >= 2 && (
                        <button type="button" onClick={() => removeRow('experienceDetails', idx)}
                          className="text-[#DC2626] hover:bg-red-50 p-1 rounded-lg transition-colors" title="Remove">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className={empGridClass}>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Company Name</label>
                        <input type="text" value={input(ex.company)} onChange={(e) => updateList('experienceDetails', idx, { company: e.target.value })}
                          className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Previous company" />
                          <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Previous employer's company name</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Designation</label>
                        <input type="text" value={input(ex.designation)} onChange={(e) => updateList('experienceDetails', idx, { designation: e.target.value })}
                          className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Job title" />
                          <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Job title held previously</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">From Date</label>
                        <DatePicker value={input(ex.from)} onChange={(val) => updateList('experienceDetails', idx, { from: val })} />
                          <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Start date, dd-mm-yyyy</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">To Date</label>
                        <DatePicker value={input(ex.to)} onChange={(val) => updateList('experienceDetails', idx, { to: val })} />
                          <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">End date, dd-mm-yyyy</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Reason for Leaving</label>
                      <textarea value={input(ex.reason)} onChange={(e) => updateList('experienceDetails', idx, { reason: e.target.value })}
                        className={formTextareaClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Why did you leave?" />
                        <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Reason for leaving the job</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Upload Document</label>
                        <DocumentUpload
                          label={`Relieving Document ${idx + 1}`}
                          docType="relievingLetter"
                          employeeId={docEmployeeId}
                          file={(ex.file as File) || null}
                          existingUrl={typeof ex.url === 'string' && ex.url ? ex.url : undefined}
                          onFileChange={(f) => updateList('experienceDetails', idx, { file: f })}
                          onUploaded={(url) => updateList('experienceDetails', idx, { url })}
                          onDelete={() => updateList('experienceDetails', idx, { url: undefined, file: undefined })}
                          accent={accent}
                          hideLabel
                          compact
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {/* Achievements subsection */}
              <div className="pt-4 mt-2 border-t border-[var(--border-color)]">
                <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-3">
                  <Trophy className="w-4 h-4 text-orange-500" /> Achievements & Awards
                </h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">Achievements</h4>
                    <button type="button" onClick={() => addRow('achievementsDetails')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-colors" style={{ backgroundColor: accent }}>
                      + Add Achievement
                    </button>
                  </div>
                  {(formData.achievementsDetails?.length ? formData.achievementsDetails : [{}]).map((a, idx) => (
                    <div key={idx} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3 relative">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-semibold text-[#0F172A]">Achievement {idx + 1}</h5>
                        {idx >= 2 && (
                          <button type="button" onClick={() => removeRow('achievementsDetails', idx)}
                            className="text-[#DC2626] hover:bg-red-50 p-1 rounded-lg transition-colors" title="Remove">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className={empGridClass}>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Achievement Title</label>
                          <input type="text" value={input(a.title)} onChange={(e) => updateList('achievementsDetails', idx, { title: e.target.value })}
                            className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="e.g., Employee of the Year" />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Achievement title, e.g., Employee of Year</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Date</label>
                          <DatePicker value={input(a.date)} onChange={(val) => updateList('achievementsDetails', idx, { date: val })} />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Achievement date, dd-mm-yyyy</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Organization</label>
                          <input type="text" value={input(a.org)} onChange={(e) => updateList('achievementsDetails', idx, { org: e.target.value })}
                            className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Organization" />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Organization that awarded it</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Description</label>
                          <textarea value={input(a.description)} onChange={(e) => updateList('achievementsDetails', idx, { description: e.target.value })}
                            className={formTextareaClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Describe your achievement" />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Brief description of the achievement</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activities subsection */}
              <div className="pt-4 mt-2 border-t border-[var(--border-color)]">
                <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-fuchsia-500" /> Activities & Volunteering
                </h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">Activities</h4>
                    <button type="button" onClick={() => addRow('activitiesDetails')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-colors" style={{ backgroundColor: accent }}>
                      + Add Activity
                    </button>
                  </div>
                  {(formData.activitiesDetails?.length ? formData.activitiesDetails : [{}]).map((ac, idx) => (
                    <div key={idx} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3 relative">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-semibold text-[#0F172A]">Activity {idx + 1}</h5>
                        {idx >= 2 && (
                          <button type="button" onClick={() => removeRow('activitiesDetails', idx)}
                            className="text-[#DC2626] hover:bg-red-50 p-1 rounded-lg transition-colors" title="Remove">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className={empGridClass}>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Activity Type</label>
                          <SearchableSelect
                            value={String(ac.type ?? '')}
                            onChange={(v) => updateList('activitiesDetails', idx, { type: String(v) })}
                            options={(activityTypeOptions as Option[]).map((opt: Option) => ({ id: String(opt.value ?? opt.code ?? ''), name: opt.label || opt.name || '' }))}
                            placeholder="Select Activity Type"
                            showAllOption={false}
                            clearable
                            className="w-full"
                          />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Type, e.g., Sports, Volunteering</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Activity Name</label>
                          <input type="text" value={input(ac.name)} onChange={(e) => updateList('activitiesDetails', idx, { name: e.target.value })}
                            className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Activity name" />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Name of the activity</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Role</label>
                          <input type="text" value={input(ac.role)} onChange={(e) => updateList('activitiesDetails', idx, { role: e.target.value })}
                            className={formInputClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Your role" />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Your role in the activity</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Description</label>
                          <textarea value={input(ac.description)} onChange={(e) => updateList('activitiesDetails', idx, { description: e.target.value })}
                            className={formTextareaClass} style={{ ['--tw-ring-color' as string]: accent }} placeholder="Describe your involvement" />
                            <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Describe your involvement</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              </div>
            )}

            {/* IT SETUP */}
            {tab === 'it_setup' && (
              <div className="space-y-4">
                <div className={empGridClass}>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Assigned Date</label>
                    <DatePicker value={input(formData.itAssignedDate)} onChange={(val) => set({ itAssignedDate: val })} />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Date IT setup was assigned, dd-mm-yyyy.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Completion Date</label>
                    <DatePicker value={input(formData.itCompletionDate)} onChange={(val) => set({ itCompletionDate: val })} />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Date IT setup was completed, dd-mm-yyyy.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Assigned By</label>
                    <div
                      title="Read-only — automatically set to the current user"
                      className="w-full h-[42px] px-4 border border-[var(--border-color)] rounded-lg bg-[#F8FAFC] text-[var(--text-primary)] text-sm flex items-center justify-between cursor-not-allowed group"
                    >
                      <span>{currentUserName || 'Not assigned'}</span>
                      <Lock className="w-3.5 h-3.5 text-[#94A3B8] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Automatically set to the current user (read-only).</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">IT Setup Notes</label>
                    <textarea value={input(formData.itNotes)} onChange={(e) => set({ itNotes: e.target.value })}
                      className={formTextareaClass} placeholder="Additional notes for the IT team." />
                    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">Any notes about the IT setup / assets assigned</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white border border-[var(--border-color)] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-sm font-semibold text-[var(--text-primary)]">Access Provisioning</h5>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] cursor-pointer select-none">
                        <input type="checkbox" checked={IT_CHECKLIST_GROUPS[0].keys.every((k) => !!formData[k])}
                          onChange={(e) => set(Object.fromEntries(IT_CHECKLIST_GROUPS[0].keys.map((k) => [k, e.target.checked])) as Partial<EmployeeFormData>)}
                          className="w-3.5 h-3.5 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                        Select all
                      </label>
                    </div>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itEmailCreated} onChange={(e) => set({ itEmailCreated: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      Company email created
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itSystemAccess} onChange={(e) => set({ itSystemAccess: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      System / domain access granted
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itErpAccess} onChange={(e) => set({ itErpAccess: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      ERP system access configured
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itCloudApps} onChange={(e) => set({ itCloudApps: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      Cloud apps provisioned (Google/M365, Slack, etc.)
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itSharedDrives} onChange={(e) => set({ itSharedDrives: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      Shared drives / folders access granted
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itHrmsAccount} onChange={(e) => set({ itHrmsAccount: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      HRMS account created
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itGroupMemberships} onChange={(e) => set({ itGroupMemberships: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      Distribution lists / groups added
                    </label>
                    <p className="text-[11px] text-[#94A3B8]">Tick the access &amp; system accounts that have been created for this employee.</p>
                  </div>
                  <div className="bg-white border border-[var(--border-color)] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-sm font-semibold text-[var(--text-primary)]">Security & Remote</h5>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] cursor-pointer select-none">
                        <input type="checkbox" checked={IT_CHECKLIST_GROUPS[1].keys.every((k) => !!formData[k])}
                          onChange={(e) => set(Object.fromEntries(IT_CHECKLIST_GROUPS[1].keys.map((k) => [k, e.target.checked])) as Partial<EmployeeFormData>)}
                          className="w-3.5 h-3.5 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                        Select all
                      </label>
                    </div>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itCredentialsIssued} onChange={(e) => set({ itCredentialsIssued: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      Security credentials issued
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itVpnAccess} onChange={(e) => set({ itVpnAccess: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      VPN / remote access enabled
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itMfaEnabled} onChange={(e) => set({ itMfaEnabled: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      Multi-factor authentication (MFA) enabled
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itPasswordManager} onChange={(e) => set({ itPasswordManager: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      Password manager vault assigned
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itRoleAssigned} onChange={(e) => set({ itRoleAssigned: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      Role-based access roles configured
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itEndpointProtection} onChange={(e) => set({ itEndpointProtection: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      Endpoint protection / antivirus installed
                    </label>
                    <p className="text-[11px] text-[#94A3B8]">Confirm the security controls and remote-access tools are set up.</p>
                  </div>
                  <div className="bg-white border border-[var(--border-color)] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-sm font-semibold text-[var(--text-primary)]">Hardware & Compliance</h5>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] cursor-pointer select-none">
                        <input type="checkbox" checked={IT_CHECKLIST_GROUPS[2].keys.every((k) => !!formData[k])}
                          onChange={(e) => set(Object.fromEntries(IT_CHECKLIST_GROUPS[2].keys.map((k) => [k, e.target.checked])) as Partial<EmployeeFormData>)}
                          className="w-3.5 h-3.5 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                        Select all
                      </label>
                    </div>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itHardwareAssigned} onChange={(e) => set({ itHardwareAssigned: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      Hardware (laptop/phone) assigned
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itPolicySigned} onChange={(e) => set({ itPolicySigned: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      IT / security policy acknowledged
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itTrainingDone} onChange={(e) => set({ itTrainingDone: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      Security / induction training completed
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itAssetTag} onChange={(e) => set({ itAssetTag: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      Asset tag / inventory recorded
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itLaptopEncryption} onChange={(e) => set({ itLaptopEncryption: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      Disk encryption enabled on laptop
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!formData.itWorkPhone} onChange={(e) => set({ itWorkPhone: e.target.checked })} className="w-4 h-4 shrink-0 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-2" />
                      Work phone / SIM issued
                    </label>
                    <p className="text-[11px] text-[#94A3B8]">Tick off the physical assets and signed compliance items delivered.</p>
                  </div>
                </div>
              </div>
            )}

            {/* REVIEW */}
            {tab === 'review' && (
              <div className="space-y-4">
                <div className="relative border border-[var(--border-color)] rounded-xl overflow-hidden text-center">

                                    {/* Hand-built cover: Van Gogh "The Starry Night" (static, full-HD SVG) */}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1920 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                    <defs>
                      <linearGradient id="vgSky" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#0C1B45" />
                        <stop offset="0.55" stopColor="#17356F" />
                        <stop offset="1" stopColor="#244C8E" />
                      </linearGradient>
                      <radialGradient id="vgStar" cx="0.5" cy="0.5" r="0.5">
                        <stop offset="0" stopColor="#FFF9D8" stopOpacity="1" />
                        <stop offset="0.35" stopColor="#FFE07A" stopOpacity="0.95" />
                        <stop offset="0.7" stopColor="#F5B942" stopOpacity="0.4" />
                        <stop offset="1" stopColor="#F5B942" stopOpacity="0" />
                      </radialGradient>
                      <radialGradient id="vgMoonGlow" cx="0.5" cy="0.5" r="0.5">
                        <stop offset="0" stopColor="#FFEDB0" stopOpacity="0.95" />
                        <stop offset="0.5" stopColor="#F7C948" stopOpacity="0.5" />
                        <stop offset="1" stopColor="#F7C948" stopOpacity="0" />
                      </radialGradient>
                      <linearGradient id="vgHill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#1C3B78" />
                        <stop offset="1" stopColor="#0F2350" />
                      </linearGradient>
                      <linearGradient id="vgGround" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#0E1F45" />
                        <stop offset="1" stopColor="#070F28" />
                      </linearGradient>
                      <linearGradient id="vgCypress" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0" stopColor="#152B1D" />
                        <stop offset="1" stopColor="#0A1811" />
                      </linearGradient>
                      <filter id="vgWarp" x="-20%" y="-20%" width="140%" height="140%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.005 0.018" numOctaves="3" seed="7" result="n" />
                        <feDisplacementMap in="SourceGraphic" in2="n" scale="38" xChannelSelector="R" yChannelSelector="G" />
                      </filter>
                      <filter id="vgWarpSoft" x="-15%" y="-15%" width="130%" height="130%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.026" numOctaves="2" seed="13" result="n" />
                        <feDisplacementMap in="SourceGraphic" in2="n" scale="20" xChannelSelector="R" yChannelSelector="G" />
                      </filter>
                      <filter id="vgWarpTree" x="-20%" y="-10%" width="140%" height="120%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.016 0.04" numOctaves="3" seed="5" result="n" />
                        <feDisplacementMap in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="G" />
                      </filter>
                      <pattern id="vgRainA" width="95" height="155" patternUnits="userSpaceOnUse" patternTransform="rotate(13)">
                        <path d="M22,4 L22,64" stroke="#CFE0FF" strokeWidth="2.4" strokeLinecap="round" />
                        <path d="M66,78 L66,132" stroke="#CFE0FF" strokeWidth="2" strokeLinecap="round" />
                      </pattern>
                      <pattern id="vgRainB" width="150" height="225" patternUnits="userSpaceOnUse" patternTransform="rotate(17)">
                        <path d="M42,26 L42,116" stroke="#9FC0F0" strokeWidth="3" strokeLinecap="round" />
                        <path d="M118,136 L118,204" stroke="#9FC0F0" strokeWidth="2.4" strokeLinecap="round" />
                      </pattern>
                    </defs>

                    {/* sky */}
                    <rect width="1920" height="700" fill="url(#vgSky)" />

                    {/* swirling sky bands */}
                    <g fill="none" strokeLinecap="round" filter="url(#vgWarp)">
                      <path d="M-60,150 C260,60 540,230 900,155 C1260,80 1580,240 1980,145" stroke="#2F57A6" strokeWidth="46" opacity="0.75" />
                      <path d="M-60,205 C280,125 560,285 920,205 C1280,125 1600,285 1980,195" stroke="#6E97DE" strokeWidth="18" opacity="0.7" />
                      <path d="M-60,270 C300,195 580,345 960,260 C1320,180 1640,330 1980,250" stroke="#3A63B8" strokeWidth="38" opacity="0.65" />
                      <path d="M-60,330 C320,255 620,405 1000,315 C1360,230 1680,380 1980,305" stroke="#7FA5E4" strokeWidth="14" opacity="0.55" />
                      <path d="M-60,105 C300,45 600,175 980,105 C1340,40 1660,175 1980,95" stroke="#8FB6EC" strokeWidth="10" opacity="0.5" />

                      {/* great central whirl */}
                      <path d="M430,330 C500,235 680,225 745,320 C810,415 690,500 605,468 C535,442 550,352 625,368"
                        stroke="#9FC0F0" strokeWidth="20" opacity="0.9" />
                      <path d="M465,332 C525,262 665,258 715,330 C765,402 675,465 612,442 C560,423 572,358 628,372"
                        stroke="#1D3F86" strokeWidth="14" opacity="0.85" />
                      {/* second whirl */}
                      <path d="M1080,300 C1150,205 1330,195 1395,290 C1460,385 1340,470 1255,438 C1185,412 1200,322 1275,338"
                        stroke="#9FC0F0" strokeWidth="20" opacity="0.85" />
                      <path d="M1115,302 C1175,232 1315,228 1365,300 C1415,372 1325,435 1262,412 C1210,393 1222,328 1278,342"
                        stroke="#1D3F86" strokeWidth="14" opacity="0.8" />
                      {/* small swirl left */}
                      <path d="M170,240 C230,180 350,185 390,255 C430,325 340,380 285,355 C240,335 252,278 300,290"
                        stroke="#7FA5E4" strokeWidth="13" opacity="0.7" />

                      {/* dashed brush dabs layered over the bands */}
                      <path d="M-60,150 C260,60 540,230 900,155 C1260,80 1580,240 1980,145" stroke="#A9C6F2" strokeWidth="44" strokeDasharray="24 46" opacity="0.45" />
                      <path d="M-60,205 C280,125 560,285 920,205 C1280,125 1600,285 1980,195" stroke="#B9D2F8" strokeWidth="16" strokeDasharray="14 38" opacity="0.5" />
                      <path d="M-60,270 C300,195 580,345 960,260 C1320,180 1640,330 1980,250" stroke="#6D90DC" strokeWidth="36" strokeDasharray="22 54" opacity="0.55" />
                      <path d="M-60,330 C320,255 620,405 1000,315 C1360,230 1680,380 1980,305" stroke="#A9C6F2" strokeWidth="13" strokeDasharray="14 42" opacity="0.5" />
                      <path d="M430,330 C500,235 680,225 745,320 C810,415 690,500 605,468 C535,442 550,352 625,368" stroke="#DCE9FF" strokeWidth="18" strokeDasharray="12 34" opacity="0.55" />
                      <path d="M1080,300 C1150,205 1330,195 1395,290 C1460,385 1340,470 1255,438 C1185,412 1200,322 1275,338" stroke="#DCE9FF" strokeWidth="18" strokeDasharray="12 34" opacity="0.5" />
                      <path d="M170,240 C230,180 350,185 390,255 C430,325 340,380 285,355 C240,335 252,278 300,290" stroke="#C7DBFA" strokeWidth="12" strokeDasharray="10 28" opacity="0.5" />
                    </g>

                    {/* streaky painted clouds */}
                    <g filter="url(#vgWarpSoft)">
                      {/* upper wisp band */}
                      <path d="M640,95 C740,60 830,125 940,100 C1050,76 1130,135 1250,118 C1350,104 1430,145 1540,132 L1540,205 C1430,222 1330,195 1230,210 C1120,227 1010,200 910,216 C810,232 720,205 640,215 Z"
                        fill="#6E97DE" opacity="0.22" />
                      <path d="M640,95 C740,60 830,125 940,100 C1050,76 1130,135 1250,118 C1350,104 1430,145 1540,132"
                        fill="none" stroke="#A9C6F2" strokeWidth="7" strokeLinecap="round" opacity="0.55" />
                      <path d="M700,150 C800,128 880,175 990,158 C1100,141 1180,186 1300,170"
                        fill="none" stroke="#B9D2F8" strokeWidth="5" strokeLinecap="round" strokeDasharray="22 40" opacity="0.5" />
                      {/* cloud hugging the moon, warm rim */}
                      <path d="M1490,235 C1570,195 1650,255 1740,230 C1830,206 1890,250 1960,238 L1960,318 C1880,335 1790,308 1700,322 C1610,336 1540,308 1490,315 Z"
                        fill="#7FA5E4" opacity="0.2" />
                      <path d="M1490,235 C1570,195 1650,255 1740,230 C1830,206 1890,250 1960,238"
                        fill="none" stroke="#F7C948" strokeWidth="7" strokeLinecap="round" opacity="0.45" />
                      <path d="M1550,290 C1640,272 1720,315 1830,296"
                        fill="none" stroke="#FFE58A" strokeWidth="5" strokeLinecap="round" strokeDasharray="20 38" opacity="0.45" />
                      {/* lower-right cloud streak */}
                      <path d="M1180,345 C1270,312 1350,368 1450,348 C1550,328 1640,375 1750,356 C1840,341 1890,372 1960,362 L1960,432 C1880,448 1800,420 1710,435 C1610,452 1510,424 1420,440 C1330,456 1250,428 1180,438 Z"
                        fill="#4E76C4" opacity="0.25" />
                      <path d="M1180,345 C1270,312 1350,368 1450,348 C1550,328 1640,375 1750,356 C1840,341 1890,372 1960,362"
                        fill="none" stroke="#8FB6EC" strokeWidth="7" strokeLinecap="round" opacity="0.5" />
                      <path d="M1250,400 C1350,382 1430,424 1540,406 C1650,388 1730,430 1850,412"
                        fill="none" stroke="#A9C6F2" strokeWidth="5" strokeLinecap="round" strokeDasharray="24 42" opacity="0.45" />
                      {/* left-lower wisp behind the cypress */}
                      <path d="M-60,385 C60,352 170,410 290,392 C400,376 480,422 600,405 L600,470 C490,487 390,460 280,475 C170,490 60,462 -60,472 Z"
                        fill="#3A63B8" opacity="0.25" />
                      <path d="M-60,385 C60,352 170,410 290,392 C400,376 480,422 600,405"
                        fill="none" stroke="#7FA5E4" strokeWidth="7" strokeLinecap="round" opacity="0.5" />
                      <path d="M20,440 C140,424 230,464 350,448"
                        fill="none" stroke="#8FB6EC" strokeWidth="5" strokeLinecap="round" strokeDasharray="20 36" opacity="0.45" />
                    </g>

                    {/* stars */}
                    <g>
                      <circle cx="140" cy="95" r="46" fill="url(#vgStar)" />
                      <circle cx="140" cy="95" r="9" fill="#FFF6CE" />
                      <circle cx="395" cy="70" r="40" fill="url(#vgStar)" />
                      <circle cx="395" cy="70" r="8" fill="#FFF6CE" />
                      <circle cx="655" cy="120" r="52" fill="url(#vgStar)" />
                      <circle cx="655" cy="120" r="10" fill="#FFF6CE" />
                      <circle cx="880" cy="60" r="38" fill="url(#vgStar)" />
                      <circle cx="880" cy="60" r="7" fill="#FFF6CE" />
                      <circle cx="1105" cy="110" r="44" fill="url(#vgStar)" />
                      <circle cx="1105" cy="110" r="8" fill="#FFF6CE" />
                      <circle cx="1330" cy="65" r="36" fill="url(#vgStar)" />
                      <circle cx="1330" cy="65" r="7" fill="#FFF6CE" />
                      <circle cx="255" cy="330" r="34" fill="url(#vgStar)" />
                      <circle cx="255" cy="330" r="6" fill="#FFF6CE" />
                      <circle cx="985" cy="395" r="30" fill="url(#vgStar)" />
                      <circle cx="985" cy="395" r="6" fill="#FFF6CE" />
                      <circle cx="1585" cy="330" r="36" fill="url(#vgStar)" />
                      <circle cx="1585" cy="330" r="7" fill="#FFF6CE" />
                      <circle cx="770" cy="245" r="26" fill="url(#vgStar)" />
                      <circle cx="770" cy="245" r="5" fill="#FFF6CE" />
                      <circle cx="1465" cy="205" r="28" fill="url(#vgStar)" />
                      <circle cx="1465" cy="205" r="5" fill="#FFF6CE" />
                      <circle cx="505" cy="185" r="24" fill="url(#vgStar)" />
                      <circle cx="505" cy="185" r="5" fill="#FFF6CE" />
                    </g>
                    {/* radiating brush rings around the stars */}
                    <g fill="none" stroke="#F7C948" strokeWidth="3.5" strokeDasharray="7 13" opacity="0.8">
                      <circle cx="140" cy="95" r="26" />
                      <circle cx="140" cy="95" r="40" opacity="0.5" />
                      <circle cx="395" cy="70" r="22" />
                      <circle cx="395" cy="70" r="34" opacity="0.5" />
                      <circle cx="655" cy="120" r="28" />
                      <circle cx="655" cy="120" r="45" opacity="0.5" />
                      <circle cx="880" cy="60" r="21" />
                      <circle cx="880" cy="60" r="33" opacity="0.5" />
                      <circle cx="1105" cy="110" r="24" />
                      <circle cx="1105" cy="110" r="38" opacity="0.5" />
                      <circle cx="1330" cy="65" r="20" />
                      <circle cx="1330" cy="65" r="31" opacity="0.5" />
                      <circle cx="255" cy="330" r="19" />
                      <circle cx="985" cy="395" r="17" />
                      <circle cx="1585" cy="330" r="20" />
                      <circle cx="770" cy="245" r="15" />
                      <circle cx="1465" cy="205" r="16" />
                      <circle cx="505" cy="185" r="14" />
                    </g>

                    {/* glowing crescent moon */}
                    <circle cx="1755" cy="105" r="105" fill="url(#vgMoonGlow)" />
                    <circle cx="1755" cy="105" r="52" fill="#F7C948" />
                    <circle cx="1755" cy="105" r="42" fill="#FFE58A" />
                    <circle cx="1738" cy="120" r="8" fill="#E8B33B" opacity="0.7" />
                    <g fill="none" stroke="#F7C948" strokeDasharray="9 15" opacity="0.7">
                      <circle cx="1755" cy="105" r="70" strokeWidth="4" />
                      <circle cx="1755" cy="105" r="92" strokeWidth="3" opacity="0.5" />
                    </g>

                    {/* distant mountains */}
                    <g filter="url(#vgWarpSoft)">
                      <path d="M0,470 L110,400 L215,455 L345,370 L455,435 L555,395 L675,450 L815,378 L935,440 L1065,392 L1185,445 L1315,375 L1445,435 L1575,395 L1700,442 L1830,400 L1920,438 L1920,545 L0,545 Z" fill="#24478B" opacity="0.85" />
                      <path d="M0,470 L110,400 L215,455 L345,370 L455,435 L555,395 L675,450 L815,378 L935,440 L1065,392 L1185,445 L1315,375 L1445,435 L1575,395 L1700,442 L1830,400 L1920,438" fill="none" stroke="#4E76C4" strokeWidth="6" strokeLinejoin="round" opacity="0.75" />
                      <path d="M0,505 C220,465 400,515 580,478 C760,442 920,505 1100,472 C1280,440 1460,502 1640,470 C1770,448 1860,485 1920,470 L1920,575 L0,575 Z" fill="#1A3A78" opacity="0.95" />
                      <path d="M0,505 C220,465 400,515 580,478 C760,442 920,505 1100,472 C1280,440 1460,502 1640,470 C1770,448 1860,485 1920,470" fill="none" stroke="#3E63B4" strokeWidth="6" strokeLinecap="round" opacity="0.7" />
                      {/* ridge brush strokes */}
                      <g fill="none" stroke="#5E86D6" strokeWidth="4" strokeLinecap="round" opacity="0.55">
                        <path d="M60,462 L150,415" />
                        <path d="M300,448 L370,398" />
                        <path d="M740,438 L800,392" />
                        <path d="M1130,440 L1200,408" />
                        <path d="M1500,432 L1560,404" />
                        <path d="M1780,436 L1840,412" />
                      </g>
                    </g>

                    {/* rolling hills */}
                    <g filter="url(#vgWarpSoft)">
                      <path d="M0,470 C280,425 560,495 900,455 C1240,415 1560,485 1920,445 L1920,560 L0,560 Z" fill="url(#vgHill)" />
                      <path d="M0,510 C300,470 600,540 960,500 C1320,460 1620,530 1920,495 L1920,600 L0,600 Z" fill="#122A5C" opacity="0.9" />
                    </g>

                    {/* village */}
                    <g>
                      <path d="M470,560 L470,505 L545,505 L545,560 Z" fill="#0A142E" />
                      <path d="M462,505 L507,475 L553,505 Z" fill="#070F24" />
                      <path d="M600,565 L600,515 L670,515 L670,565 Z" fill="#0A142E" />
                      <path d="M593,515 L635,488 L678,515 Z" fill="#070F24" />
                      <path d="M720,570 L720,525 L785,525 L785,570 Z" fill="#0A142E" />
                      <path d="M713,525 L752,500 L792,525 Z" fill="#070F24" />
                      {/* church with tall steeple */}
                      <path d="M845,575 L845,515 L915,515 L915,575 Z" fill="#0A142E" />
                      <path d="M838,515 L880,487 L922,515 Z" fill="#070F24" />
                      <path d="M866,487 L866,420 L894,420 L894,487 Z" fill="#0A142E" />
                      <path d="M862,420 L880,372 L898,420 Z" fill="#070F24" />
                      <path d="M877,372 L877,352 L883,352 L883,372 Z" fill="#070F24" />
                      <path d="M1000,568 L1000,520 L1065,520 L1065,568 Z" fill="#0A142E" />
                      <path d="M993,520 L1032,495 L1072,520 Z" fill="#070F24" />
                      <path d="M1140,572 L1140,528 L1205,528 L1205,572 Z" fill="#0A142E" />
                      <path d="M1133,528 L1172,503 L1212,528 Z" fill="#070F24" />
                      {/* warm windows */}
                      <g fill="#F4C95D">
                        <rect x="490" y="522" width="12" height="14" />
                        <rect x="515" y="522" width="12" height="14" />
                        <rect x="622" y="532" width="11" height="13" />
                        <rect x="645" y="532" width="11" height="13" />
                        <rect x="740" y="538" width="11" height="13" />
                        <rect x="872" y="532" width="12" height="14" />
                        <rect x="893" y="532" width="12" height="14" />
                        <rect x="875" y="450" width="10" height="12" />
                        <rect x="1020" y="534" width="11" height="13" />
                        <rect x="1042" y="534" width="11" height="13" />
                        <rect x="1160" y="540" width="11" height="13" />
                        <rect x="1182" y="540" width="11" height="13" />
                      </g>
                    </g>

                    {/* dark ground */}
                    <path d="M0,575 C320,545 640,610 980,575 C1320,540 1640,605 1920,570 L1920,700 L0,700 Z" fill="url(#vgGround)" />
                    <g fill="none" stroke="#16305F" strokeWidth="6" strokeLinecap="round" opacity="0.7">
                      <path d="M120,640 C260,625 400,655 540,640" />
                      <path d="M700,660 C840,645 980,675 1120,660" />
                      <path d="M1260,640 C1400,625 1540,655 1680,640" />
                      <path d="M420,690 C560,675 700,700 840,688" />
                      <path d="M1050,695 C1190,682 1330,705 1470,692" />
                    </g>

                    {/* the cypress tree - dark flame, left foreground */}
                    <g filter="url(#vgWarpTree)">
                      <path d="M210,700
                        C150,610 120,540 140,470
                        C155,415 130,360 165,300
                        C195,245 170,195 205,140
                        C230,100 220,65 245,35
                        C265,70 285,110 275,155
                        C300,205 285,255 305,305
                        C330,365 315,420 335,475
                        C355,540 335,615 300,700 Z"
                        fill="url(#vgCypress)" />
                      <g fill="none" stroke="#1E3A28" strokeWidth="8" strokeLinecap="round" opacity="0.85">
                        <path d="M235,660 C210,580 205,510 225,450" />
                        <path d="M255,600 C275,540 265,480 250,430" />
                        <path d="M230,400 C215,350 235,300 225,255" />
                        <path d="M255,330 C270,285 255,240 262,205" />
                        <path d="M245,180 C235,145 252,110 244,85" />
                      </g>
                      <g fill="none" stroke="#0A1811" strokeWidth="6" strokeLinecap="round" opacity="0.8">
                        <path d="M265,655 C285,585 280,520 268,465" />
                        <path d="M215,545 C198,495 210,450 205,410" />
                        <path d="M262,420 C278,375 266,330 272,295" />
                      </g>
                    </g>

                    {/* gentle painted rain */}
                    <rect width="1920" height="700" fill="url(#vgRainB)" opacity="0.3" />
                    <rect width="1920" height="700" fill="url(#vgRainA)" opacity="0.4" />
                  </svg>
                  <div className="absolute inset-0 bg-gradient-to-b from-slate-900/20 via-transparent to-slate-900/35" />
<div className="relative px-6 pt-12 pb-6">
                    <div className="relative w-44 h-44 mx-auto mb-4">
                      <div className="w-44 h-44 rounded-full flex items-center justify-center overflow-hidden ring-4 ring-white shadow-[0_8px_30px_rgba(15,23,42,0.25)] bg-gradient-to-br from-blue-500 to-indigo-600">
                        {typeof formData.photoUrl === 'string' && formData.photoUrl ? (
                          <img src={uploadUrl(formData.photoUrl)} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-16 h-16 text-white" />
                        )}
                      </div>
                      <input
                        ref={reviewPhotoRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => { handleReviewPhoto(e.target.files?.[0] || null); e.target.value = ''; }}
                      />
                      <button
                        type="button"
                        title="Upload photo"
                        onClick={() => reviewPhotoRef.current?.click()}
                        className="absolute -bottom-1 right-1 w-9 h-9 rounded-full bg-white border border-[#E2E8F0] shadow-lg flex items-center justify-center text-[#1C64F2] hover:bg-blue-50 transition-colors"
                      >
                        <Camera className="w-4 h-4" />
                      </button>
                    </div>
                  <div className="bg-white/85 backdrop-blur-xl border border-white/70 rounded-xl px-4 py-3 shadow-[0_16px_50px_rgba(2,6,23,0.45)] max-w-md mx-auto text-center text-black">
                  <h4 className="text-base font-bold text-black">
                    {personDisplayName(formData, 'New Employee')}
                  </h4>
                  <p className={`text-xs mt-0.5 ${formData.employeeCode ? 'font-semibold' : 'font-normal'} text-black`}>
                    {formData.employeeCode || 'Employee code not generated'}
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-1 text-xs">
                    <span className="flex items-center gap-1 min-w-0">
                      <Mail className="w-3.5 h-3.5 shrink-0 text-black" />
                      <span className="truncate text-black">
                        {formData.email || 'No email'}
                      </span>
                    </span>
                    <span className="text-[#CBD5E1] shrink-0">&middot;</span>
                    <span className="flex items-center gap-1 min-w-0">
                      <Phone className="w-3.5 h-3.5 shrink-0 text-black" />
                      <span className="truncate text-black">
                        {formData.phone || 'No phone'}
                      </span>
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-center gap-2 text-xs mb-1">
                      <span className="text-black">Profile Completion</span>
                      <span className="font-semibold text-black">{progress}%</span>
                    </div>
                    <div className="h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${accent}, ${accent}99)` }} />
                    </div>
                  </div>
                  </div>
                  </div>
                </div>

                {/* Resume-style preview */}
                <div className="bg-white border border-[var(--border-color)] rounded-xl p-6">
                    <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1C64F2] to-[#7C3AED] flex items-center justify-center shadow-md shadow-blue-500/25">
                          <FileText className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h5 className="text-lg font-bold text-[#0F172A]">Employee Preview</h5>
                          <p className="text-xs text-[#94A3B8]">Resume-style summary of all employee details</p>
                        </div>
                      </div>
                      <button type="button" onClick={handleDownloadResume}
                        className="flex items-center gap-2 px-5 py-2.5 bg-[#1C64F2] text-white text-sm font-semibold rounded-lg hover:bg-[#1E40AF] transition-colors shadow-md shadow-blue-500/25">
                        <FileDown className="w-4 h-4" /> Download as Resume
                      </button>
                    </div>
                  <div className="space-y-5">
                    <PreviewSection title="Personal & Family" icon={Heart}>
                      <PreviewItem label="Gender" value={formData.gender} />
                      <PreviewItem label="Date of Birth" value={formData.dateOfBirth} />
                      <PreviewItem label="Blood Group" value={formData.bloodGroup} />
                      <PreviewItem label="Marital Status" value={formData.maritalStatus} />
                      <PreviewItem label="Person with Disabilities" value={typeof formData.isPersonWithDisability === 'boolean' ? (formData.isPersonWithDisability ? 'Yes' : 'No') : undefined} />
                      <PreviewItem label="Emergency Contact" value={formData.emergencyContact ? `${formData.emergencyContact}${formData.emergencyPhone ? ` · ${formData.emergencyPhone}` : ''}` : undefined} />
                      <PreviewItem label="Father" value={formData.fatherName} />
                      <PreviewItem label="Mother" value={formData.motherName} />
                      <PreviewItem label="Sibling" value={formData.siblingName} />
                      <PreviewItem label="Spouse" value={formData.spouseName} />
                      <PreviewItem label="Spouse Phone" value={formData.spousePhone} />
                      <PreviewItem label="Children" value={formData.childrenNames} />
                      <PreviewItem label="Children Count" value={formData.numberOfChildren} />
                      <PreviewItem label="Nominee" value={formData.nomineeName} />
                      <PreviewItem label="Nominee Relationship" value={formData.nomineeRelationship} />
                    </PreviewSection>
                    <PreviewSection title="Address & Identity" icon={IdCard}>
                      <PreviewItem label="Email" value={formData.email} />
                      <PreviewItem label="Phone" value={formData.phone} />
                      <PreviewItem label="Current Address" value={formData.currentAddress} />
                      <PreviewItem label="Current State" value={formData.currentState} />
                      <PreviewItem label="Current Pincode" value={formData.currentPincode} />
                      <PreviewItem label="Landmark" value={formData.landmark} />
                      <PreviewItem label="Permanent Address" value={formData.permanentAddress} />
                      <PreviewItem label="Permanent State" value={formData.permanentState} />
                      <PreviewItem label="Permanent Pincode" value={formData.permanentPincode} />
                      <PreviewItem label="Permanent Landmark" value={formData.permanentLandmark} />
                      <PreviewItem label="Aadhaar" value={formData.aadharNumber} />
                      <PreviewItem label="PAN" value={formData.panNumber} />
                      <PreviewItem label="Voter ID" value={formData.voterId} />
                      <PreviewItem label="Driving License" value={formData.drivingLicense} />
                      <PreviewItem label="Passport" value={formData.passportNumber} />
                      <PreviewItem label="Birth Certificate" value={formData.birthCertificateNumber} />
                    </PreviewSection>
                    <PreviewSection title="Education & Skills" icon={Award}>
                      {(formData.educationDetails as Record<string, unknown>[] || []).filter((e: Record<string, unknown>) => e.educationLevel || e.institution || e.degree).map((e: Record<string, unknown>, i: number) => (
                        <PreviewItem key={i} label={`Education ${i + 1}`} value={[
                          [e.educationLevel, e.degree].filter(Boolean).map((v) => humanizeToken(String(v))).join(' — '),
                          e.institution ? `Institution: ${humanizeToken(String(e.institution))}` : undefined,
                          e.fieldOfStudy ? `Field of Study: ${humanizeToken(String(e.fieldOfStudy))}` : undefined,
                          e.graduationYear ? `Year: ${e.graduationYear}` : undefined,
                          e.grade ? (String(e.grade).trim().match(/^\d+(\.\d+)?\s*%?$/) ? `Percentage: ${String(e.grade).trim().replace(/%?$/, '%')}` : `Grade: ${e.grade}`) : undefined,
                        ].filter(Boolean).join(' · ')} />
                      ))}
                      {(formData.certifications as Record<string, unknown>[] || []).filter((c: Record<string, unknown>) => c.name).map((c: Record<string, unknown>, i: number) => (
                        <PreviewItem key={`c${i}`} label={`Certification ${i + 1}`} value={[c.name, c.organization, c.issueDate ? `Issued: ${c.issueDate}` : undefined, c.expiryDate ? `Expires: ${c.expiryDate}` : undefined].filter(Boolean).map((v) => humanizeToken(String(v))).join(' — ')} />
                      ))}
                      <PreviewItem label="Skills" value={(formData.skillsList as Record<string, unknown>[] || []).filter((s: Record<string, unknown>) => s.name).map((s: Record<string, unknown>) => [s.name, s.proficiency ? `(${s.proficiency})` : undefined, s.years ? `${s.years} yrs` : undefined].filter(Boolean).join(' ')).join(', ')} />
                      <PreviewItem label="Languages" value={(formData.languages as Record<string, unknown>[] || []).filter((l: Record<string, unknown>) => l.name).map((l: Record<string, unknown>) => [l.name, l.proficiency ? `(${l.proficiency})` : undefined, l.isNative ? '(Native)' : undefined].filter(Boolean).join(' ')).join(', ')} />
                    </PreviewSection>
                    <PreviewSection title="Experience & More" icon={Trophy}>
                      {(formData.experienceDetails as Record<string, unknown>[] || []).filter((e: Record<string, unknown>) => e.company || e.designation || e.from || e.to).map((e: Record<string, unknown>, i: number) => (
                        <PreviewItem key={i} label={`Experience ${i + 1}`} value={[e.company, e.designation, e.from ? `${e.from}${e.to ? ` — ${e.to}` : ''}` : undefined, e.reason ? `Reason: ${e.reason}` : undefined].filter(Boolean).join(' — ')} />
                      ))}
                      {(formData.achievementsDetails as Record<string, unknown>[] || []).filter((a: Record<string, unknown>) => a.title).map((a: Record<string, unknown>, i: number) => (
                        <PreviewItem key={`a${i}`} label={`Achievement ${i + 1}`} value={[a.title, a.org, a.date, a.description].filter(Boolean).join(' — ')} />
                      ))}
                      {(formData.activitiesDetails as Record<string, unknown>[] || []).filter((ac: Record<string, unknown>) => ac.name).map((ac: Record<string, unknown>, i: number) => (
                        <PreviewItem key={`ac${i}`} label={`Activity ${i + 1}`} value={[ac.type, ac.name, ac.role, ac.description].filter(Boolean).join(' — ')} />
                      ))}
                    </PreviewSection>
                    <PreviewSection title="Employment" icon={Building}>
                      <PreviewItem label="Company" value={(companiesList || []).find((c: Company) => String(c.id) === String(formData.companyId))?.name} />
                      <PreviewItem label="Department" value={(departmentsList || []).find((d: Department) => String(d.id) === String(formData.departmentId))?.name} />
                      <PreviewItem label="Designation" value={(designations || []).find((d: Designation) => String(d.id) === String(formData.designationId))?.title} />
                      <PreviewItem label="Employment Type" value={formData.employmentType} />
                      <PreviewItem label="Join Date" value={formData.joinDate} />
                      <PreviewItem label="Status" value={formData.status} />
                      <PreviewItem label="Branch" value={(formData.branchIds || []).length ? (branchesList || []).filter((b: { id: number }) => (formData.branchIds || []).includes(b.id)).map((b: { name: string }) => b.name).join(', ') : undefined} />
                    </PreviewSection>
                    <PreviewSection title="Benefits & Tax" icon={Landmark}>
                      <PreviewItem label="PF Number" value={formData.pfNumber} />
                      <PreviewItem label="PF UAN" value={formData.pfUan} />
                      <PreviewItem label="ESIC Number" value={formData.esicNumber} />
                      <PreviewItem label="Gratuity Applicable" value={typeof formData.gratuityApplicable === 'boolean' ? (formData.gratuityApplicable ? 'Yes' : 'No') : undefined} />
                      <PreviewItem label="Mediclaim Number" value={formData.mediclaimNumber} />
                      <PreviewItem label="Mediclaim Provider" value={formData.mediclaimProvider} />
                      <PreviewItem label="Life Insurance Number" value={formData.lifeInsuranceNumber} />
                      <PreviewItem label="Life Insurance Provider" value={formData.lifeInsuranceProvider} />
                    </PreviewSection>
                    <PreviewSection title="Bank" icon={Building2}>
                      <PreviewItem label="Bank Accounts" value={(formData.bankAccounts as Record<string, unknown>[] || []).filter((a: Record<string, unknown>) => a.bankName || a.bankAccountNumber).map((a: Record<string, unknown>) => `${a.bankName || ''}${a.bankAccountNumber ? ` (${a.bankAccountNumber})` : ''}${a.ifscCode ? ` - IFSC: ${a.ifscCode}` : ''}`).join(', ')} />
                      <PreviewItem label="Account Holder" value={formData.accountHolderName} />
                      <PreviewItem label="IFSC Code" value={formData.ifscCode} />
                    </PreviewSection>
                    <PreviewSection title="Salary" icon={Banknote}>
                      <PreviewItem label="Base Salary" value={formData.baseSalary ? `${currencySymbol}${formData.baseSalary}` : undefined} />
                      <PreviewItem label="Salary Template" value={(payrollTemplates || []).find((t: { id: number | string }) => String(t.id) === String(formData.salaryTemplateId))?.name} />
                      <PreviewItem label="Pay Frequency" value={formData.payFrequency} />
                      <PreviewItem label="Pay Rate" value={formData.payRate ? `${currencySymbol}${formData.payRate}` : undefined} />
                    </PreviewSection>
                    <PreviewSection title="Login & Device" icon={Smartphone}>
                      <PreviewItem label="Device Name" value={formData.deviceName} />
                      <PreviewItem label="Device Type" value={formData.deviceType} />
                      <PreviewItem label="Device Serial Number" value={formData.deviceSerialNumber} />
                      <PreviewItem label="Device IP Address" value={formData.deviceIpAddress} />
                      <PreviewItem label="Device MAC Address" value={formData.deviceMacAddress} />
                      <PreviewItem label="Device Assigned Date" value={formData.deviceAssignedDate} />
                    </PreviewSection>
                    <PreviewSection title="IT Setup" icon={Settings}>
                      <PreviewItem label="IT Assigned By" value={formData.itAssignedBy} />
                      <PreviewItem label="IT Assigned Date" value={formData.itAssignedDate} />
                      <PreviewItem label="IT Completion Date" value={formData.itCompletionDate} />
                      <PreviewItem label="IT Notes" value={formData.itNotes} />
                      <PreviewItem label="IT Checklist" value={IT_CHECKLIST_KEYS.filter(({ key }) => formData[key] === true).length ? `${IT_CHECKLIST_KEYS.filter(({ key }) => formData[key] === true).length} of ${IT_CHECKLIST_KEYS.length} completed` : undefined} />
                    </PreviewSection>
                  </div>
                </div>
              </div>
            )}

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeFormModal;

