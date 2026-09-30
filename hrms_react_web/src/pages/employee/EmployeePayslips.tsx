import { useState, useEffect } from 'react';
import { FileText, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMyEmployee, getMyPayroll, downloadPayslipPdf, getPayslipData } from '../../services/employeeSelfService';
import { getAppCurrency, getCurrencySymbol } from '../../services/currencyService';

const EmployeePayslips = () => {
  useAuth();
  const [, setEmployeeId] = useState<number | null>(null);
  const [payroll, setPayroll] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const symbol = getCurrencySymbol(getAppCurrency());

  useEffect(() => {
    getMyEmployee().then((e) => { if (e) { setEmployeeId(e.id); getMyPayroll(e.id).then(setPayroll); } });
  }, []);

  const openDetail = async (p: Record<string, unknown>) => {
    setSelected(p);
    setLoadingDetail(true);
    try {
      const d = await getPayslipData(Number(p.id));
      setDetail(d);
    } catch {
      setDetail(p);
    } finally { setLoadingDetail(false); }
  };

  const monthLabel = (m: unknown, y: unknown) => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[Number(m) - 1] || m} ${y}`;
  };

  return (
    <div className="space-y-5">
      {/* Payslip list */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-medium text-slate-400 uppercase mb-3">My Payslips</p>
        {payroll.length === 0 ? (
          <p className="text-sm text-slate-400">No payslips available yet</p>
        ) : (
          <div className="space-y-2">
            {payroll.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <button onClick={() => openDetail(p)} className="flex items-center gap-3 flex-1 text-left">
                  <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center"><FileText className="w-4 h-4 text-violet-600" /></div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{monthLabel(p.month, p.year)}</p>
                    <p className="text-xs text-slate-400 capitalize">{String(p.status || 'processed')}</p>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{symbol}{Number(p.net_salary || p.netSalary || 0).toLocaleString()}</span>
                  <button onClick={() => downloadPayslipPdf(Number(p.id))} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Download PDF">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payslip detail */}
      {selected && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-slate-800">Payslip · {monthLabel(selected.month, selected.year)}</p>
            <button onClick={() => setSelected(null)} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
          </div>
          {loadingDetail ? (
            null
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Gross</p><p className="font-semibold text-slate-800">{symbol}{Number((detail?.payroll as Record<string, unknown> | undefined)?.gross_salary ?? (detail as Record<string, unknown>)?.gross_salary ?? selected.gross_salary ?? 0).toLocaleString()}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Deductions</p><p className="font-semibold text-red-600">{symbol}{Number((detail?.payroll as Record<string, unknown> | undefined)?.total_deductions ?? (detail as Record<string, unknown>)?.total_deductions ?? selected.total_deductions ?? 0).toLocaleString()}</p></div>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-500">Net Pay</p><p className="text-xl font-bold text-emerald-700">{symbol}{Number((detail?.payroll as Record<string, unknown> | undefined)?.net_salary ?? (detail as Record<string, unknown>)?.net_salary ?? selected.net_salary ?? 0).toLocaleString()}</p></div>
              <button onClick={() => downloadPayslipPdf(Number(selected.id))} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
                <Download className="w-4 h-4" /> Download PDF
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EmployeePayslips;
