import { useState, useEffect } from 'react';
import { FileText, Plus, Save, Send, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listDeclarations,
  createDeclaration,
  updateDeclaration,
  submitDeclaration,
} from '../../services/investmentDeclarationService';
import type { InvestmentDeclaration } from '../../services/investmentDeclarationService';

const currentFY = () => {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
};

const FY = currentFY();

const EmployeeTaxDeclarations = () => {
  const [decl, setDecl] = useState<InvestmentDeclaration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const items = await listDeclarations({ financialYear: FY });
      const mine = items.find((d) => d.status !== 'rejected') || items[0] || null;
      setDecl(mine);
    } catch { setDecl(null); } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const set = (k: keyof InvestmentDeclaration, v: unknown) => {
    if (decl) setDecl({ ...decl, [k]: v });
  };

  const num = (v: string) => parseFloat(v) || 0;

  const handleSave = async () => {
    if (!decl) return;
    setSaving(true);
    try {
      const payload = {
        financialYear: FY,
        taxRegimeId: decl.taxRegimeId,
        deduction80c: decl.deduction80c,
        deduction80d: decl.deduction80d,
        hraExemption: decl.hraExemption,
        ltaExemption: decl.ltaExemption,
        npsDeduction: decl.npsDeduction,
        homeLoanInterest: decl.homeLoanInterest,
        otherIncome: decl.otherIncome,
        previousEmployerIncome: decl.previousEmployerIncome,
        previousEmployerTds: decl.previousEmployerTds,
        optOutStandardDeduction: decl.optOutStandardDeduction,
      };
      if (decl.id > 0) {
        await updateDeclaration(decl.id, payload);
      } else {
        await createDeclaration(payload);
      }
      toast.success('Declaration saved');
      await refresh();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'Failed to save declaration');
    } finally { setSaving(false); }
  };

  const handleSubmit = async () => {
    if (!decl) return;
    setSubmitting(true);
    try {
      await submitDeclaration(decl.id);
      toast.success('Declaration submitted for approval');
      await refresh();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'Failed to submit');
    } finally { setSubmitting(false); }
  };

  const field = (label: string, key: keyof InvestmentDeclaration, hint?: string) => (
    <div>
      <label className="text-xs font-medium text-slate-500 mb-1 block">{label}</label>
      <input
        type="number"
        value={Number(decl?.[key] ?? 0)}
        onChange={(e) => set(key, num(e.target.value))}
        disabled={decl?.status === 'approved' || decl?.status === 'submitted'}
        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50 disabled:text-slate-400"
      />
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#B45309] to-[#92400E] flex items-center justify-center text-white">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Tax Declarations</h2>
              <p className="text-xs text-slate-500">Financial Year {FY} &middot; used for cumulative TDS</p>
            </div>
          </div>
          {decl?.status && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              decl.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
              decl.status === 'rejected' ? 'bg-red-50 text-red-600' :
              decl.status === 'submitted' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
            }`}>{decl.status.toUpperCase()}</span>
          )}
        </div>

        {loading ? (
          null
        ) : !decl ? (
          <div className="text-center py-12">
            <p className="text-sm text-slate-500 mb-4">No declaration yet for FY {FY}.</p>
            <button
              onClick={() => setDecl({
                id: 0, employeeId: 0, financialYear: FY, status: 'draft',
                deduction80c: 0, deduction80d: 0, hraExemption: 0, ltaExemption: 0,
                npsDeduction: 0, homeLoanInterest: 0, otherIncome: 0,
                previousEmployerIncome: 0, previousEmployerTds: 0,
                optOutStandardDeduction: false,
              } as InvestmentDeclaration)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#B45309] text-white rounded-xl text-sm font-medium hover:bg-[#92400E] transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Declaration
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <p className="text-xs font-medium text-slate-400 uppercase mb-3">Investments (Old Regime deductions)</p>
            </div>
            {field('Section 80C (PF, ELSS, PPF, life insurance)', 'deduction80c', 'Capped at ₹1,50,000')}
            {field('Section 80D (Health insurance)', 'deduction80d', 'Capped at ₹50,000')}
            {field('HRA Exemption', 'hraExemption')}
            {field('LTA Exemption', 'ltaExemption')}
            {field('NPS (80CCD 1B)', 'npsDeduction', 'Capped at ₹50,000')}
            {field('Home Loan Interest (24b)', 'homeLoanInterest', 'Capped at ₹2,00,000')}
            <div className="md:col-span-2">
              <p className="text-xs font-medium text-slate-400 uppercase mb-3 mt-4">Other Income &amp; Previous Employer</p>
            </div>
            {field('Other Income (interest, rent, etc.)', 'otherIncome')}
            {field('Previous Employer Income', 'previousEmployerIncome')}
            {field('Previous Employer TDS already deducted', 'previousEmployerTds')}
            <div className="md:col-span-2 flex items-center justify-between mt-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!!decl.optOutStandardDeduction}
                  onChange={(e) => set('optOutStandardDeduction', e.target.checked)}
                  disabled={decl.status === 'approved' || decl.status === 'submitted'}
                  className="w-4 h-4 rounded border-slate-300"
                />
                Opt out of standard deduction (₹50,000)
              </label>
            </div>

            {decl.status === 'draft' && (
              <div className="md:col-span-2 flex gap-3 pt-4 border-t border-slate-100 mt-4">
                <button onClick={handleSave} disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#B45309] text-white rounded-xl text-sm font-medium hover:bg-[#92400E] transition-colors disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Draft
                </button>
                <button onClick={handleSubmit} disabled={saving || !decl.id || submitting}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit for Approval
                </button>
              </div>
            )}
            {decl.status === 'approved' && (
              <div className="md:col-span-2 flex items-center gap-2 pt-4 border-t border-slate-100 mt-4 text-emerald-600 text-sm">
                <CheckCircle2 className="w-4 h-4" /> Approved — locked for this financial year.
              </div>
            )}
            {decl.status === 'rejected' && (
              <div className="md:col-span-2 flex items-center gap-2 pt-4 border-t border-slate-100 mt-4 text-red-600 text-sm">
                <XCircle className="w-4 h-4" /> Rejected — edit and resubmit.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeTaxDeclarations;