import { useState } from 'react';
import {
  X, Edit2, Trash2, UserCheck, UserX, LogOut, Mail, Briefcase, MapPin, CreditCard, Users, Shield,
  Clock, Calendar, FileText, Receipt, Download, Loader2
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import type { Employee } from '../types';
import { formatAppDate } from '../services/appSettingsService';
import { getCurrencySymbol, getAppCurrency } from '../services/currencyService';
import api from '../services/api';
import { personDisplayName, personFileSlug } from '../utils/employeeNameUtils';

interface DrawerEmployee extends Employee {
  designationName?: string;
}

interface EmployeeDetailDrawerProps {
  employee: DrawerEmployee;
  onClose: () => void;
  onEdit: (item: DrawerEmployee) => void;
  onDelete: (id: number) => void;
  onToggleStatus: (item: DrawerEmployee) => void;
  onInitiateExit?: (item: DrawerEmployee) => void;
}

const EmployeeDetailDrawer: React.FC<EmployeeDetailDrawerProps> = ({ employee, onClose, onEdit, onDelete, onToggleStatus, onInitiateExit }) => {
  const [view, setView] = useState<'overview' | 'history'>('overview');
  const [currency] = useState(getAppCurrency());
  const currencySymbol = getCurrencySymbol(currency);
  const [downloadingHistory, setDownloadingHistory] = useState(false);
  const [downloadingResume, setDownloadingResume] = useState(false);

  if (!employee) return null;

  const formatDate = (d: string | undefined) => d ? formatAppDate(d) : 'N/A';
  const money = (v: number | undefined | null) => v != null ? `${currencySymbol}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '-';

  // Download the employee's CV if uploaded; otherwise generate a resume PDF from their profile data
  const downloadResume = async () => {
    setDownloadingResume(true);
    try {
      const res = await api.get(`/employees/${employee.id}/resume`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${personFileSlug(employee)}_resume.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download resume');
    } finally {
      setDownloadingResume(false);
    }
  };

  // Download the employee's full history as a CSV (server-side aggregation, fast for any dataset size)
  const downloadHistory = async () => {
    setDownloadingHistory(true);
    try {
      const res = await api.get(`/employees/${employee.id}/history/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${personFileSlug(employee)}_history.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download history');
    } finally {
      setDownloadingHistory(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-[#0F172A]">Employee Details</h2>
          <button onClick={onClose} className="p-2 hover:bg-[#F1F5F9] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#475569]" />
          </button>
        </div>

        {/* View switcher */}
        <div className="flex gap-2 px-6 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <button onClick={() => setView('overview')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === 'overview' ? 'bg-white shadow-sm border border-[#E2E8F0] text-[#1C64F2]' : 'text-[#64748B] hover:bg-white'}`}>
            Overview
          </button>
          <button onClick={() => setView('history')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === 'history' ? 'bg-white shadow-sm border border-[#E2E8F0] text-[#1C64F2]' : 'text-[#64748B] hover:bg-white'}`}>
            History
          </button>
        </div>

        {view === 'overview' ? (
          <div className="p-6 space-y-6">
            {/* Avatar + Name + Top Actions */}
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl bg-[#EFF6FF] flex items-center justify-center shrink-0">
                <Users className="w-8 h-8 text-[#1C64F2]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-[#0F172A]">{personDisplayName(employee)}</h3>
                <p className="text-sm text-[#475569]">{employee.designationName || employee.designation || 'N/A'}</p>
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
                  employee.status === 'active' ? 'bg-[#D1FAE5] text-[#065F46]' :
                  employee.status === 'inactive' ? 'bg-[#FEE2E2] text-[#991B1B]' :
                  'bg-[#FEF3C7] text-[#92400E]'
                }`}>
                  {employee.status || 'N/A'}
                </span>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => { onEdit(employee); onClose(); }} className="p-2 bg-[#EFF6FF] text-[#1C64F2] rounded-lg hover:bg-[#DBEAFE] transition-colors" title="Edit"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => { onToggleStatus(employee); onClose(); }}
                  className={`p-2 rounded-lg transition-colors ${employee.status === 'active' ? 'bg-[#FEF3C7] text-[#92400E] hover:bg-[#FDE68A]' : 'bg-[#D1FAE5] text-[#065F46] hover:bg-[#A7F3D0]'}`}
                  title={employee.status === 'active' ? 'Deactivate' : 'Activate'}>
                  {employee.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                </button>
                <button onClick={() => { onDelete(employee.id); onClose(); }} className="p-2 bg-[#FEE2E2] text-[#991B1B] rounded-lg hover:bg-[#FECACA] transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Contact Info */}
            <div className="bg-[#F8FAFC] rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-[#0F172A] text-sm flex items-center gap-2"><Mail className="w-4 h-4 text-[#1C64F2]" /> Contact</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-[#94A3B8]">Email</span><p className="text-[#0F172A]">{employee.email || 'N/A'}</p></div>
                <div><span className="text-[#94A3B8]">Phone</span><p className="text-[#0F172A]">{employee.phone || 'N/A'}</p></div>
              </div>
            </div>

            {/* Employment Info */}
            <div className="bg-[#F8FAFC] rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-[#0F172A] text-sm flex items-center gap-2"><Briefcase className="w-4 h-4 text-[#1C64F2]" /> Employment</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-[#94A3B8]">Employee Code</span><p className="text-[#0F172A]">{employee.employeeCode || 'N/A'}</p></div>
                <div><span className="text-[#94A3B8]">Company</span><p className="text-[#0F172A]">{employee.company?.name || 'N/A'}</p></div>
                <div><span className="text-[#94A3B8]">Branch</span><p className="text-[#0F172A]">{employee.branch?.name || 'N/A'}</p></div>
                <div><span className="text-[#94A3B8]">Department</span><p className="text-[#0F172A]">{employee.department?.name || 'N/A'}</p></div>
                <div><span className="text-[#94A3B8]">Designation</span><p className="text-[#0F172A]">{employee.designationName || employee.designation || 'N/A'}</p></div>
                <div><span className="text-[#94A3B8]">Employment Type</span><p className="text-[#0F172A]">{employee.employmentType || 'N/A'}</p></div>
                <div><span className="text-[#94A3B8]">Join Date</span><p className="text-[#0F172A]">{formatDate(employee.joinDate)}</p></div>
              </div>
            </div>

            {/* Personal Info */}
            <div className="bg-[#F8FAFC] rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-[#0F172A] text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-[#1C64F2]" /> Personal</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-[#94A3B8]">Gender</span><p className="text-[#0F172A]">{employee.gender || 'N/A'}</p></div>
                <div><span className="text-[#94A3B8]">Blood Group</span><p className="text-[#0F172A]">{employee.bloodGroup || 'N/A'}</p></div>
                <div><span className="text-[#94A3B8]">Date of Birth</span><p className="text-[#0F172A]">{formatDate(employee.dateOfBirth)}</p></div>
                <div><span className="text-[#94A3B8]">Marital Status</span><p className="text-[#0F172A]">{employee.maritalStatus || 'N/A'}</p></div>
              </div>
            </div>

            {/* Bank Info */}
            {employee.bankAccountNumber && (
              <div className="bg-[#F8FAFC] rounded-xl p-4 space-y-3">
                <h4 className="font-semibold text-[#0F172A] text-sm flex items-center gap-2"><CreditCard className="w-4 h-4 text-[#1C64F2]" /> Bank Details</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-[#94A3B8]">Bank Name</span><p className="text-[#0F172A]">{employee.bankName || 'N/A'}</p></div>
                  <div><span className="text-[#94A3B8]">Account No.</span><p className="text-[#0F172A]">{employee.bankAccountNumber || 'N/A'}</p></div>
                  <div><span className="text-[#94A3B8]">IFSC</span><p className="text-[#0F172A]">{employee.ifscCode || 'N/A'}</p></div>
                </div>
              </div>
            )}

            {/* Address */}
            {employee.address && (
              <div className="bg-[#F8FAFC] rounded-xl p-4 space-y-3">
                <h4 className="font-semibold text-[#0F172A] text-sm flex items-center gap-2"><MapPin className="w-4 h-4 text-[#1C64F2]" /> Address</h4>
                <p className="text-sm text-[#0F172A]">{employee.address}</p>
              </div>
            )}

            {/* CV / Biodata */}
            <div className="bg-[#F8FAFC] rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-[#0F172A] text-sm flex items-center gap-2"><Briefcase className="w-4 h-4 text-[#1C64F2]" /> CV / Biodata</h4>
              {employee.status === 'active' ? (
                <CvUploadButton entityType="employee" entityId={employee.id} resumeUrl={employee.resumeUrl} size="md" />
              ) : (
                <button onClick={downloadResume} disabled={downloadingResume}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1C64F2] text-white rounded-xl text-sm font-medium hover:bg-[#1E40AF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {downloadingResume ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</> : <><FileText className="w-4 h-4" /> Download Resume PDF</>}
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button onClick={() => { onEdit(employee); onClose(); }} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1C64F2] text-white rounded-xl text-sm font-medium hover:bg-[#1E40AF] transition-colors"><Edit2 className="w-4 h-4" /> Edit</button>
              {employee.status === 'active' ? (
                <button onClick={() => { onInitiateExit?.(employee); onClose(); }} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FEF3C7] text-[#92400E] rounded-xl text-sm font-medium hover:bg-[#FDE68A] transition-colors"><LogOut className="w-4 h-4" /> Exit</button>
              ) : (
                <button onClick={() => { onToggleStatus(employee); onClose(); }} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#D1FAE5] text-[#065F46] rounded-xl text-sm font-medium hover:bg-[#A7F3D0] transition-colors"><UserCheck className="w-4 h-4" /> Activate</button>
              )}
              <button onClick={() => { onDelete(employee.id); onClose(); }} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FEE2E2] text-[#991B1B] rounded-xl text-sm font-medium hover:bg-[#FECACA] transition-colors"><Trash2 className="w-4 h-4" /> Delete</button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#EFF6FF] flex items-center justify-center shrink-0"><Users className="w-6 h-6 text-[#1C64F2]" /></div>
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">{personDisplayName(employee)}</h3>
                <p className="text-xs text-[#64748B]">Complete employment history — including records before deactivation</p>
              </div>
            </div>

            {/* Download full history */}
            <div className="bg-gradient-to-br from-[#EFF6FF] to-[#F0FDF4] border border-[#BFDBFE] rounded-xl p-5 text-center">
              <div className="w-14 h-14 rounded-full bg-white shadow-sm border border-[#E2E8F0] flex items-center justify-center mx-auto mb-3">
                <Download className="w-6 h-6 text-[#1C64F2]" />
              </div>
              <h4 className="text-sm font-bold text-[#0F172A]">Download Full History</h4>
              <p className="text-xs text-[#64748B] mt-1 mb-4">Gets attendance, leaves, payroll, expenses, performance, goals and exit records in one CSV file.</p>
              <button onClick={downloadHistory} disabled={downloadingHistory}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1C64F2] text-white rounded-xl text-sm font-medium hover:bg-[#1E40AF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {downloadingHistory ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</> : <><Download className="w-4 h-4" /> Download CSV</>}
              </button>
            </div>

            {/* Download resume PDF */}
            <div className="bg-gradient-to-br from-[#EFF6FF] to-[#FFFBEB] border border-[#BFDBFE] rounded-xl p-5 text-center">
              <div className="w-14 h-14 rounded-full bg-white shadow-sm border border-[#E2E8F0] flex items-center justify-center mx-auto mb-3">
                <FileText className="w-6 h-6 text-[#1C64F2]" />
              </div>
              <h4 className="text-sm font-bold text-[#0F172A]">Download Resume PDF</h4>
              <p className="text-xs text-[#64748B] mt-1 mb-4">Downloads the employee's uploaded CV if present, otherwise generates a professional resume from their profile data.</p>
              <button onClick={downloadResume} disabled={downloadingResume}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1C64F2] text-white rounded-xl text-sm font-medium hover:bg-[#1E40AF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {downloadingResume ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</> : <><FileText className="w-4 h-4" /> Download PDF</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default EmployeeDetailDrawer;
