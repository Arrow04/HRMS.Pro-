import React, { useState } from 'react';
import {
  X, User, FileText, MapPin, CreditCard, Users,
  Building2, Clock, Calendar, Coins, TrendingUp, Umbrella, Receipt, Package,
  Save, BarChart3
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import {
  getEmployee, updateEmployee, getEmployeePerformance,
  getEmployeeAttendance, getEmployeeLeaves, getEmployeePayroll,
  getEmployeePerformanceReviews, getEmployeeExpenses, getHolidays
} from '../services/employeeService';
import { useMasterData } from '../hooks/useMasterData';
import { capitalizeStatus } from '../utils/statusUtils';
import { formatTime } from '../utils/formatUtils';
import toast from 'react-hot-toast';
import DatePicker from '../components/DatePicker';
import IfscInput from '../components/IfscInput';
import StateSelect from '../components/StateSelect';
import PincodeInput from '../components/PincodeInput';
import PhoneInput from '../components/PhoneInput';
import { useAppConfig } from '../context/AppConfigContext';
import type { Attendance, Employee, Expense, Holiday, LeaveApplication, Payroll } from '../types';
import { getCurrencySymbol, getAppCurrency } from '../services/currencyService';
import type { LookupValue } from '../services/masterDataService';
import { joinEmployeeName, personDisplayName, personInitials, splitEmployeeName } from '../utils/employeeNameUtils';

interface FamilyMember {
  relation: string;
  name: string;
  phone?: string;
}

interface EducationDetail {
  degree: string;
  year: string;
  institution: string;
}

interface EmployeeFormData extends Partial<Employee> {
  familyInfo?: FamilyMember[];
  educationDetails?: EducationDetail[];
  companyName?: string;
  branchName?: string;
  departmentName?: string;
}

interface ProfileModalProps {
  employeeId: number;
  isOpen: boolean;
  onClose: () => void;
}

const TABS = [
  { id: 'basic', label: 'Personal Info', icon: User },
  { id: 'identity', label: 'Identity Docs', icon: FileText },
  { id: 'address', label: 'Address', icon: MapPin },
  { id: 'bank', label: 'Bank Details', icon: CreditCard },
  { id: 'family', label: 'Family & Education', icon: Users },
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'attendance', label: 'Attendance', icon: Clock },
  { id: 'holidays', label: 'Holidays', icon: Calendar },
  { id: 'payroll', label: 'Payroll', icon: Coins },
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'leave', label: 'Leave', icon: Umbrella },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'assets', label: 'Assets', icon: Package },
];

const EmployeeProfileModal: React.FC<ProfileModalProps> = ({ employeeId, isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('basic');
  const [formData, setFormData] = useState<EmployeeFormData | null>(null);

  const { data: genderOptions = [] } = useMasterData('GENDER', { enabled: isOpen });

  const { data: employee, isLoading, error } = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: async () => {
      const data = await getEmployee(employeeId);
      const safeData = { firstName: '', lastName: '', fullName: '', email: '', employeeCode: '', designation: '', phone: '', gender: '', dateOfBirth: '' };
      Object.assign(safeData, data);
      setFormData(safeData);
      return safeData;
    },
    enabled: isOpen && !!employeeId,
    retry: 1
  });

  const { data: performance } = useQuery({
    queryKey: ['performance', employeeId],
    queryFn: () => getEmployeePerformance(employeeId),
    enabled: isOpen && activeTab === 'performance'
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ['attendance', employeeId],
    queryFn: () => getEmployeeAttendance(employeeId),
    enabled: isOpen && activeTab === 'attendance'
  });

  const { data: leaves = [] } = useQuery({
    queryKey: ['leaves', employeeId],
    queryFn: () => getEmployeeLeaves(employeeId),
    enabled: isOpen && activeTab === 'leave'
  });

  const { data: payroll = [] } = useQuery({
    queryKey: ['payroll', employeeId],
    queryFn: () => getEmployeePayroll(employeeId),
    enabled: isOpen && activeTab === 'payroll'
  });

  useQuery({
    queryKey: ['performanceReviews', employeeId],
    queryFn: () => getEmployeePerformanceReviews(employeeId),
    enabled: isOpen && activeTab === 'performance'
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', employeeId],
    queryFn: () => getEmployeeExpenses(employeeId),
    enabled: isOpen && activeTab === 'expenses'
  });

  const { data: assets = [] } = useQuery({
    queryKey: ['assets', employeeId],
    queryFn: async () => {
      const res = await api.get('/assets', { params: { employeeId } });
      return res.data || [];
    },
    enabled: isOpen && activeTab === 'assets'
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ['holidays'],
    queryFn: () => getHolidays(),
    enabled: isOpen && activeTab === 'holidays'
  });

  const updateMutation = useMutation({
    mutationFn: (data: EmployeeFormData) => updateEmployee(employeeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee', employeeId] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Profile updated successfully');
    },
    onError: () => toast.error('Failed to update profile'),
  });

  const { dialCode } = useAppConfig();

  if (!isOpen) return null;

  const handleSave = () => { if (formData) updateMutation.mutate(formData); };

  const inputClass = "w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition placeholder-gray-400";
  const labelClass = "block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1";
  const disabledInputClass = "w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 outline-none cursor-not-allowed";

  const renderTabContent = () => {
    if (isLoading) return null;

    if (error) return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-red-600 mb-2">Error Loading Profile</p>
        <p className="text-xs text-gray-500">{(error as Error).message || 'Failed to load employee data'}</p>
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['employee', employeeId] })} className="mt-4 px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition">Retry</button>
      </div>
    );

    if (!formData) return <div className="flex items-center justify-center h-64"><p className="text-sm text-gray-400">No data available</p></div>;

    const renderField = (label: string, value: string | undefined) => (
      <div className="space-y-1">
        <label className={labelClass}>{label}</label>
        <input type="text" value={value || ''} disabled className={disabledInputClass} />
      </div>
    );

    switch (activeTab) {
      case 'basic':
        return (
          <div className="p-6 space-y-5">
            <h3 className="text-sm font-bold text-gray-900">Personal Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={labelClass}>Full Name *</label>
                <input type="text" value={joinEmployeeName(formData.firstName, formData.lastName)}
                  onChange={e => {
                    const { firstName, lastName } = splitEmployeeName(e.target.value);
                    setFormData({ ...formData, firstName, lastName });
                  }}
                  className={inputClass} placeholder="Full legal name" />
                <p className="mt-1 text-xs text-gray-400">Full legal name as per ID documents</p>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Work Email</label>
                <input type="email" value={formData.email || ''} disabled className={disabledInputClass} />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Employee Code</label>
                <input type="text" value={formData.employeeCode || ''} disabled className={disabledInputClass} />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Phone Number</label>
                <PhoneInput
                  value={formData.phone || ''}
                  onChange={v => setFormData({ ...formData, phone: v })}
                  defaultDial={dialCode}
                  placeholder="98765 43210"
                  inputClassName="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-r-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition placeholder-gray-400"
                />
                <p className="mt-1 text-xs text-gray-400">10-digit mobile with country code</p>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Gender</label>
                <select value={formData.gender || ''} onChange={e => setFormData({ ...formData, gender: e.target.value })} className={inputClass}>
                  <option value="">Select Gender</option>
                  {genderOptions.map((opt: LookupValue & { status?: string }) => (
                    <option key={opt.code} value={opt.code} disabled={opt.status === 'inactive' || opt.is_active === false}>{opt.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-400">Select the employee's gender</p>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Designation</label>
                <input type="text" value={formData.designation || ''} onChange={e => setFormData({ ...formData, designation: e.target.value })} className={inputClass} placeholder="e.g. Software Engineer" />
                <p className="mt-1 text-xs text-gray-400">Current job title/role</p>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Birth Date</label>
                <DatePicker value={formData.dateOfBirth?.split('T')[0] || ''} onChange={(val) => setFormData({ ...formData, dateOfBirth: val })} />
                <p className="mt-1 text-xs text-gray-400">Date of birth, dd-mm-yyyy</p>
              </div>
            </div>
          </div>
        );
      case 'identity':
        return (
          <div className="p-6 space-y-5">
            <h3 className="text-sm font-bold text-gray-900">Identity Documents</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><label className={labelClass}>Aadhar Number</label><input type="text" value={formData.aadharNumber || ''} onChange={e => setFormData({ ...formData, aadharNumber: e.target.value })} className={inputClass} placeholder="0000 0000 0000" /><p className="mt-1 text-xs text-gray-400">12-digit Aadhaar number</p></div>
              <div className="space-y-1"><label className={labelClass}>PAN Number</label><input type="text" value={formData.panNumber || ''} onChange={e => setFormData({ ...formData, panNumber: e.target.value })} className={inputClass} placeholder="ABCDE1234F" /><p className="mt-1 text-xs text-gray-400">10-character PAN, e.g. ABCDE1234F</p></div>
              <div className="space-y-1"><label className={labelClass}>Voter ID</label><input type="text" value={formData.voterId || ''} onChange={e => setFormData({ ...formData, voterId: e.target.value })} className={inputClass} /><p className="mt-1 text-xs text-gray-400">Voter ID card number</p></div>
              <div className="space-y-1"><label className={labelClass}>Passport Number</label><input type="text" value={formData.passportNumber || ''} onChange={e => setFormData({ ...formData, passportNumber: e.target.value })} className={inputClass} /><p className="mt-1 text-xs text-gray-400">Passport number</p></div>
            </div>
          </div>
        );
      case 'address':
        return (
          <div className="p-6 space-y-5">
            <div className="space-y-1"><label className={labelClass}>Current Residence</label><textarea rows={3} value={formData.currentAddress || ''} onChange={e => setFormData({ ...formData, currentAddress: e.target.value })} className={inputClass} /><p className="mt-1 text-xs text-gray-400">Full current residential address</p></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><label className={labelClass}>Current State</label><StateSelect value={formData.currentState || ''} onChange={(v) => setFormData({ ...formData, currentState: v })} /></div>
              <div className="space-y-1"><label className={labelClass}>Current Pincode</label><PincodeInput value={formData.currentPincode || ''} onChange={(v) => setFormData({ ...formData, currentPincode: v })} className={inputClass} /></div>
            </div>
            <div className="space-y-1"><label className={labelClass}>Permanent Address</label><textarea rows={3} value={formData.permanentAddress || ''} onChange={e => setFormData({ ...formData, permanentAddress: e.target.value })} className={inputClass} /><p className="mt-1 text-xs text-gray-400">Full permanent residential address</p></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><label className={labelClass}>Permanent State</label><StateSelect value={formData.permanentState || ''} onChange={(v) => setFormData({ ...formData, permanentState: v })} /></div>
              <div className="space-y-1"><label className={labelClass}>Permanent Pincode</label><PincodeInput value={formData.permanentPincode || ''} onChange={(v) => setFormData({ ...formData, permanentPincode: v })} className={inputClass} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><label className={labelClass}>Emergency Contact</label><input type="text" value={formData.emergencyContact || ''} onChange={e => setFormData({ ...formData, emergencyContact: e.target.value })} className={inputClass} /><p className="mt-1 text-xs text-gray-400">Name of emergency contact</p></div>
              <div className="space-y-1"><label className={labelClass}>Emergency Phone</label><input type="text" value={formData.emergencyPhone || ''} onChange={e => setFormData({ ...formData, emergencyPhone: e.target.value })} className={inputClass} /><p className="mt-1 text-xs text-gray-400">10-digit mobile of emergency contact</p></div>
            </div>
          </div>
        );
      case 'bank':
        return (
          <div className="p-6 space-y-5">
            <h3 className="text-sm font-bold text-gray-900">Bank Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><label className={labelClass}>Account Holder Name</label><input type="text" value={formData.accountHolderName || ''} onChange={e => setFormData({ ...formData, accountHolderName: e.target.value })} className={inputClass} placeholder="Name as per bank" /><p className="mt-1 text-xs text-gray-400">Name as per bank records</p></div>
              <div className="space-y-1"><label className={labelClass}>Bank Name</label><input type="text" value={formData.bankName || ''} onChange={e => setFormData({ ...formData, bankName: e.target.value })} className={inputClass} placeholder="e.g. HDFC Bank" /><p className="mt-1 text-xs text-gray-400">Name of the bank</p></div>
              <div className="space-y-1"><label className={labelClass}>Account Number</label><input type="text" value={formData.bankAccountNumber || ''} onChange={e => setFormData({ ...formData, bankAccountNumber: e.target.value })} className={inputClass} placeholder="XXXX XXXX XXXX" /><p className="mt-1 text-xs text-gray-400">Salary bank account number</p></div>
              <div className="space-y-1"><label className={labelClass}>IFSC Code</label><IfscInput value={formData.ifscCode || ''} onChange={v => setFormData({ ...formData, ifscCode: v })} inputClassName={inputClass} placeholder="HDFC0001234" /><p className="mt-1 text-xs text-gray-400">11-character IFSC code</p></div>
            </div>
          </div>
        );
      case 'family':
        return (
          <div className="p-6 space-y-6">
            <div>
              <h4 className="text-sm font-bold text-gray-900 mb-3">Family</h4>
              <div className="space-y-2">
                {formData.familyInfo?.map((f: FamilyMember, i: number) => (
                  <div key={i} className="flex gap-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <span className="text-xs font-semibold text-blue-600">{f.relation}</span>
                    <span className="text-xs font-medium text-gray-900">{f.name}</span>
                    <span className="text-xs text-gray-400 ml-auto">{f.phone}</span>
                  </div>
                ))}
                <button className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-xs font-medium text-gray-400 hover:bg-gray-50 transition">+ Add Family Member</button>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900 mb-3">Education</h4>
              <div className="space-y-2">
                {formData.educationDetails?.map((ed: EducationDetail, i: number) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-900">{ed.degree}</span>
                      <span className="text-xs text-blue-600">{ed.year}</span>
                    </div>
                    <span className="text-xs text-gray-400">{ed.institution}</span>
                  </div>
                ))}
                <button className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-xs font-medium text-gray-400 hover:bg-gray-50 transition">+ Add Qualification</button>
              </div>
            </div>
          </div>
        );
      case 'organization':
        return (
          <div className="p-6 space-y-5">
            <h3 className="text-sm font-bold text-gray-900">Organization Details</h3>
            <div className="grid grid-cols-2 gap-4">
              {renderField('Company', formData.companyName)}
              {renderField('Branch', formData.branchName)}
              {renderField('Department', formData.departmentName)}
              {renderField('Designation', formData.designation)}
            </div>
          </div>
        );
      case 'attendance':
        return (
          <div className="p-6 space-y-5">
            <h3 className="text-sm font-bold text-gray-900">Attendance History (Month-wise)</h3>
            {(() => {
              if (attendance.length === 0) return <p className="text-center py-8 text-sm text-gray-400">No attendance records</p>;
              const groups = new Map<string, Attendance[]>();
              (attendance as Attendance[]).forEach((r) => {
                const d = r.date ? new Date(r.date) : null;
                const key = d && !isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'Unknown';
                const arr = groups.get(key) || [];
                arr.push(r);
                groups.set(key, arr);
              });
              const sorted = Array.from(groups.entries()).sort((a, b) => (b[0] < a[0] ? -1 : 1));
              return sorted.map(([month, records]) => {
                const present = records.filter((r) => r.status === 'present').length;
                const absent = records.filter((r) => r.status === 'absent').length;
                return (
                  <div key={month} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-900">{month}</span>
                      <span className="text-xs text-gray-500">{records.length} days · {present} present · {absent} absent</span>
                    </div>
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                        <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Check In</th><th className="px-4 py-2">Check Out</th><th className="px-4 py-2">Status</th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {records.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-xs font-medium">{r.date?.split('T')[0]}</td>
                            <td className="px-4 py-2 text-xs">{formatTime(r.checkIn)}</td>
                            <td className="px-4 py-2 text-xs">{formatTime(r.checkOut)}</td>
                            <td className="px-4 py-2"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${r.status === 'present' ? 'bg-green-50 text-green-700' : r.status === 'absent' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>{capitalizeStatus(r.status)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              });
            })()}
          </div>
        );
      case 'holidays':
        return (
          <div className="p-6 space-y-5">
            <h3 className="text-sm font-bold text-gray-900">Company Holidays</h3>
            <div className="space-y-2">
              {holidays.length > 0 ? holidays.map((h: Holiday, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div><p className="text-sm font-medium text-gray-900">{h.name}</p><p className="text-xs text-gray-400">{h.type}</p></div>
                  <span className="text-xs font-semibold text-blue-600">{h.date?.split('T')[0]}</span>
                </div>
              )) : <p className="text-center py-8 text-sm text-gray-400">No holidays found</p>}
            </div>
          </div>
        );
      case 'payroll':
        return (
          <div className="p-6 space-y-5">
            <h3 className="text-sm font-bold text-gray-900">Payroll History</h3>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                  <tr><th className="px-4 py-3">Month</th><th className="px-4 py-3">Gross</th><th className="px-4 py-3">Deductions</th><th className="px-4 py-3">Net</th><th className="px-4 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payroll.length > 0 ? payroll.slice(0, 6).map((r: Payroll, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs font-medium">{r.month}/{r.year}</td>
                      <td className="px-4 py-3 text-xs">{getCurrencySymbol(getAppCurrency())}{r.grossSalary?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-red-600">{getCurrencySymbol(getAppCurrency())}{r.totalDeductions?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-green-600">{getCurrencySymbol(getAppCurrency())}{r.netSalary?.toLocaleString()}</td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${r.status === 'paid' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>{capitalizeStatus(r.status)}</span></td>
                    </tr>
                  )) : <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No payroll records</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'performance':
        return (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-600 p-5 rounded-2xl text-white">
                <p className="text-xs font-semibold opacity-80 mb-1">Days Present</p>
                <p className="text-2xl font-bold">{performance?.metrics?.[0]?.daysWorked || 0}</p>
                <p className="text-xs mt-1 opacity-70">{performance?.metrics?.[0]?.period}</p>
              </div>
              <div className="bg-slate-800 p-5 rounded-2xl text-white">
                <p className="text-xs font-semibold opacity-80 mb-1">Hours Worked</p>
                <p className="text-2xl font-bold">{performance?.metrics?.[0]?.hoursWorked || 0}H</p>
                <p className="text-xs mt-1 opacity-70">Net Productivity</p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-gray-200">
                <p className="text-xs font-semibold text-gray-400 mb-1">Efficiency</p>
                <p className="text-2xl font-bold text-blue-600">{performance?.summary?.efficiency || '-'}</p>
                <p className="text-xs mt-1 text-gray-300">Rating</p>
              </div>
            </div>
            <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <h4 className="text-xs font-bold text-gray-900 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-600" /> Monthly Analytics</h4>
              <div className="space-y-4">
                <div><div className="flex justify-between text-xs font-medium mb-1"><span className="text-gray-400">Avg Daily Hours</span><span className="text-blue-600">{performance?.metrics?.[0]?.avgHoursPerDay || 0}h</span></div><div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(((performance?.metrics?.[0]?.avgHoursPerDay || 0) / 12) * 100, 100)}%` }}></div></div></div>
                <div><div className="flex justify-between text-xs font-medium mb-1"><span className="text-gray-400">Late Days</span><span className="text-red-600">{performance?.metrics?.[0]?.lateDays || 0}</span></div><div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-red-600 rounded-full" style={{ width: `${Math.min(((performance?.metrics?.[0]?.lateDays || 0) / 30) * 100, 100)}%` }}></div></div></div>
              </div>
            </div>
          </div>
        );
      case 'leave':
        return (
          <div className="p-6 space-y-5">
            <h3 className="text-sm font-bold text-gray-900">Leave Applications</h3>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                  <tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">From</th><th className="px-4 py-3">To</th><th className="px-4 py-3">Days</th><th className="px-4 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leaves.length > 0 ? leaves.slice(0, 8).map((l: LeaveApplication & { leaveType?: string }, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs font-medium">{l.leaveType}</td>
                      <td className="px-4 py-3 text-xs">{l.startDate?.split('T')[0]}</td>
                      <td className="px-4 py-3 text-xs">{l.endDate?.split('T')[0]}</td>
                      <td className="px-4 py-3 text-xs">{l.totalDays}</td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${l.status === 'approved' ? 'bg-green-50 text-green-700' : l.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>{capitalizeStatus(l.status)}</span></td>
                    </tr>
                  )) : <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No leave records</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'expenses':
        return (
          <div className="p-6 space-y-5">
            <h3 className="text-sm font-bold text-gray-900">Expense Claims</h3>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                  <tr><th className="px-4 py-3">Category</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {expenses.length > 0 ? expenses.slice(0, 8).map((e: Expense, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs font-medium">{e.category}</td>
                      <td className="px-4 py-3 text-xs">{getCurrencySymbol(getAppCurrency())}{e.amount?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs">{e.expenseDate?.split('T')[0]}</td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${e.status === 'approved' ? 'bg-green-50 text-green-700' : e.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>{capitalizeStatus(e.status)}</span></td>
                    </tr>
                  )) : <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">No expense records</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'assets':
        return (
          <div className="p-6 space-y-5">
            <h3 className="text-sm font-bold text-gray-900">Assets Associated</h3>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                  <tr><th className="px-4 py-3">Asset</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Serial No</th><th className="px-4 py-3">Issued On</th><th className="px-4 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {assets.length > 0 ? assets.slice(0, 12).map((a: { assetName?: string; assetType?: string; serialNumber?: string; issueDate?: string; status?: string }, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs font-medium">{a.assetName || '-'}</td>
                      <td className="px-4 py-3 text-xs capitalize">{a.assetType || '-'}</td>
                      <td className="px-4 py-3 text-xs">{a.serialNumber || '-'}</td>
                      <td className="px-4 py-3 text-xs">{a.issueDate ? String(a.issueDate).split('T')[0] : '-'}</td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${a.status === 'assigned' ? 'bg-green-50 text-green-700' : a.status === 'maintenance' ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{capitalizeStatus(a.status ?? '') || 'N/A'}</span></td>
                    </tr>
                  )) : <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No assets assigned</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/50 transition-opacity duration-300" onClick={onClose} />
      <div className="fixed inset-0 bg-white shadow-2xl transform transition-all duration-300 ease-in-out">
        <div className="h-full flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-lg font-bold shadow-md">
              {personInitials(employee)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{personDisplayName(employee, 'Employee Profile')}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{employee?.employeeCode || '---'}</span>
                <span className="text-xs text-gray-400">{employee?.designation || ''}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm">
              <Save className="w-3.5 h-3.5" /> {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-56 border-r border-gray-200 bg-gray-50/50/50 p-3 space-y-1 overflow-y-auto shrink-0">
            {TABS.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-white hover:text-gray-900'
                }`}>
                <tab.icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-white">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default EmployeeProfileModal;

