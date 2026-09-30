import { useState, useEffect } from 'react';
import { Mail, Phone, Briefcase, CalendarDays } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMyEmployee } from '../../services/employeeSelfService';
import { formatAppDate } from '../../services/appSettingsService';

const EmployeeProfile = () => {
  const { user } = useAuth();
  const [emp, setEmp] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    getMyEmployee().then((e) => setEmp((e as unknown as Record<string, unknown>) || null));
  }, []);

  const row = (label: string, value: unknown) => (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-700">{String(value || '-')}</span>
    </div>
  );

  const initials = (user?.fullName || user?.email || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 text-center">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold mx-auto mb-3">
          {initials}
        </div>
        <p className="text-lg font-semibold text-slate-800">{user?.fullName || user?.email}</p>
        <p className="text-sm text-slate-400">{String(emp?.designationName || emp?.designation || user?.role || 'Employee')}</p>
      </div>

      {/* Info */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        {row('Email', emp?.email || user?.email)}
        {row('Phone', emp?.phone)}
        {row('Employee Code', emp?.employeeCode)}
        {row('Department', (emp?.department as { name?: unknown } | undefined)?.name || emp?.departmentName)}
        {row('Company', (emp?.company as { name?: unknown } | undefined)?.name)}
        {row('Join Date', emp?.joinDate ? formatAppDate(emp.joinDate as string) : null)}
        {row('Employment Type', emp?.employmentType)}
        {row('Status', emp?.status)}
      </div>

      {/* Icons strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: Mail, label: 'Email' },
          { icon: Phone, label: 'Phone' },
          { icon: Briefcase, label: 'Role' },
          { icon: CalendarDays, label: 'Joined' },
        ].map((x, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-100 p-3 flex flex-col items-center gap-1">
            <x.icon className="w-4 h-4 text-blue-600" />
            <span className="text-[10px] text-slate-400">{x.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmployeeProfile;
