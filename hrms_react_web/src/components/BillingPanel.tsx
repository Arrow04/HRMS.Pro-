import { useState, useEffect } from 'react';
import {
  Crown, CreditCard, CalendarClock, Check, Loader2, CheckCircle2,
  Banknote, ShieldCheck, Zap, Users, FileText
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { formatAppDate } from '../services/appSettingsService';

interface PlanOption {
  id: number;
  name: string;
  display_name: string;
  price_monthly: number;
  price_yearly: number;
  max_employees: number;
  features: string[];
}

interface SubscriptionData {
  status: string;
  billing_cycle: string;
  next_billing_date: string | null;
  trial_ends_at: string | null;
  days_left: number | null;
  expiry_date: string | null;
  plan: {
    id: number | null;
    name: string;
    display_name: string;
    price_monthly: number;
    price_yearly: number;
    max_employees: number;
    features: string[];
  };
}

interface PaymentRecord {
  id: number;
  amount: number;
  currency: string;
  billing_cycle: string;
  method: string;
  status: string;
  transaction_id: string;
  payment_date: string;
  plan_name: string | null;
}

interface InvoiceRecord {
  id: number;
  invoice_number: string;
  plan_name: string | null;
  billing_cycle: string;
  subtotal: number;
  tax_percent: number;
  tax_amount: number;
  tax_label: string;
  total: number;
  currency: string;
  status: string;
  issued_date: string | null;
  due_date: string | null;
  paid_date: string | null;
}

const PAY_METHODS = [
  { id: 'card', label: 'Card', icon: CreditCard },
  { id: 'upi', label: 'UPI', icon: Banknote },
  { id: 'netbanking', label: 'Net Banking', icon: Banknote },
  { id: 'bank_transfer', label: 'Bank Transfer', icon: Banknote },
];

interface PayMethods {
  qr_code_url: string;
  upi_id: string;
  currency: string;
  bank_details: {
    id: number;
    bank_name: string | null;
    account_name: string | null;
    account_number: string | null;
    ifsc: string | null;
    branch: string | null;
    upi_id: string | null;
    is_default: boolean;
  }[];
}

const BillingPanel = () => {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [payMethods, setPayMethods] = useState<PayMethods | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PlanOption | null>(null);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [method, setMethod] = useState('upi');
  const [txnId, setTxnId] = useState('');
  const [paying, setPaying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [subRes, plansRes, payRes, invRes, pmRes] = await Promise.all([
        api.get('/billing/subscription'),
        api.get('/billing/plans'),
        api.get('/billing/payments'),
        api.get('/billing/invoices'),
        api.get('/billing/payment-methods'),
      ]);
      setSubscription(subRes.data);
      setPlans(plansRes.data || []);
      setPayments(payRes.data || []);
      setInvoices(invRes.data || []);
      setPayMethods(pmRes.data || null);
    } catch (e) {
      toast.error('Failed to load billing information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const downloadInvoice = async (invoiceId: number, invoiceNumber: string) => {
    try {
      const res = await api.get(`/billing/invoices/${invoiceId}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${invoiceNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to download invoice');
    }
  };

  const handlePay = async () => {
    if (!selectedPlan) { toast.error('Select a plan first'); return; }
    setPaying(true);
    try {
      const amount = cycle === 'yearly' ? selectedPlan.price_yearly : selectedPlan.price_monthly;
      const res = await api.post('/billing/payments', {
        plan_id: selectedPlan.id,
        amount,
        currency: 'INR',
        billing_cycle: cycle,
        method,
        transaction_id: txnId || `TXN-${Date.now()}`,
        notes: txnId ? `Paid via ${method}` : undefined,
      });
      toast.success(res.data?.message || 'Payment successful');
      await load();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return null;
  }

  const price = selectedPlan
    ? (cycle === 'yearly' ? selectedPlan.price_yearly : selectedPlan.price_monthly)
    : 0;

  return (
    <div className="space-y-6">
      {/* Current Plan Card */}
      <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1C64F2] via-[#1C64F2] to-[#4F46E5] text-white p-6 md:p-8 shadow-lg shadow-blue-500/20">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Crown className="w-5 h-5 text-amber-300" />
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-100">Current Plan</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold">{subscription?.plan?.display_name || 'Free Trial'}</h2>
            <p className="text-blue-100 text-sm mt-1">
              {subscription?.plan?.max_employees ? `Up to ${subscription.plan.max_employees} employees` : ''}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {subscription?.plan?.features?.slice(0, 4).map((f, i) => (
                <span key={i} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 text-xs font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" /> {f}
                </span>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${
              subscription?.status === 'active' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-amber-400/20 text-amber-200'
            }`}>
              {(subscription?.status || 'trial').toUpperCase()}
            </div>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white/10 rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 text-blue-100 text-xs mb-1">
              <CalendarClock className="w-3.5 h-3.5" /> Expires in
            </div>
            <p className="text-2xl font-bold">{subscription?.days_left ?? '—'} days</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 text-blue-100 text-xs mb-1">
              <CreditCard className="w-3.5 h-3.5" /> Billing cycle
            </div>
            <p className="text-lg font-semibold capitalize">{subscription?.billing_cycle || 'monthly'}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3.5 col-span-2 md:col-span-1">
            <div className="flex items-center gap-1.5 text-blue-100 text-xs mb-1">
              <CalendarClock className="w-3.5 h-3.5" /> Renewal
            </div>
            <p className="text-sm font-medium">
              {subscription?.expiry_date ? formatAppDate(subscription.expiry_date) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Pay Directly (UPI QR) */}
      {payMethods?.qr_code_url && (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 md:p-8 shadow-sm">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="shrink-0">
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-3 text-center md:text-left">Scan to pay</p>
              <img src={payMethods.qr_code_url} alt="UPI Payment QR" className="w-44 h-44 md:w-52 md:h-52 rounded-xl object-cover border-2 border-[#E2E8F0] bg-white shadow-inner" />
            </div>
            <div className="flex-1 w-full">
              <h3 className="text-lg font-bold text-[#0F172A]">Pay directly via UPI</h3>
              <p className="text-sm text-[#64748B] mt-1">Scan the QR code with any UPI app (GPay, PhonePe, Paytm) to make your payment instantly.</p>
              <div className="mt-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs text-[#94A3B8] uppercase tracking-wider">UPI ID</p>
                  <p className="text-base font-mono font-semibold text-[#0F172A]">{payMethods.upi_id}</p>
                </div>
                <button
                  onClick={() => { navigator.clipboard?.writeText(payMethods.upi_id || ''); toast.success('UPI ID copied'); }}
                  className="px-4 py-2 rounded-xl bg-[#1C64F2]/10 text-[#1C64F2] text-sm font-semibold hover:bg-[#1C64F2]/20 transition-colors"
                >
                  Copy UPI ID
                </button>
              </div>
              <p className="text-xs text-[#94A3B8] mt-3">
                After payment, select a plan below and enter your transaction ID to confirm.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plans grid */}
      <div>
        <h3 className="text-lg font-semibold text-[#0F172A] mb-1">Choose a plan</h3>
        <p className="text-sm text-[#94A3B8] mb-4">Select a plan and pay to upgrade or renew your subscription</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPlan(p)}
              className={`text-left rounded-2xl border p-5 transition-all ${
                selectedPlan?.id === p.id
                  ? 'border-[#1C64F2] ring-2 ring-[#1C64F2]/30 bg-blue-50/50 shadow-md shadow-blue-500/10'
                  : 'border-[#E2E8F0] bg-white hover:border-[#93C5FD] hover:shadow-md'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-[#0F172A]">{p.display_name}</h4>
                {selectedPlan?.id === p.id && <Check className="w-5 h-5 text-[#1C64F2]" />}
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-2xl font-bold text-[#0F172A]">Rs.{p.price_monthly.toLocaleString()}</span>
                <span className="text-xs text-[#94A3B8]">/mo</span>
              </div>
              <p className="text-xs text-[#64748B] mb-3">Rs.{p.price_yearly.toLocaleString()}/year</p>
              <div className="flex items-center gap-1 text-xs text-[#64748B] mb-3">
                <Users className="w-3.5 h-3.5" /> Up to {p.max_employees.toLocaleString()} employees
              </div>
              <ul className="space-y-1.5">
                {p.features.slice(0, 4).map((f, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-xs text-[#475569]">
                    <Check className="w-3.5 h-3.5 text-emerald-500" /> {f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </div>

      {/* Payment section */}
      {selectedPlan && (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-4">Make payment</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5 uppercase tracking-wider">Billing cycle</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setCycle('monthly')} className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${cycle === 'monthly' ? 'border-[#1C64F2] bg-blue-50 text-[#1C64F2]' : 'border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]'}`}>
                    Monthly · Rs.{selectedPlan.price_monthly.toLocaleString()}
                  </button>
                  <button onClick={() => setCycle('yearly')} className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${cycle === 'yearly' ? 'border-[#1C64F2] bg-blue-50 text-[#1C64F2]' : 'border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]'}`}>
                    Yearly · Rs.{selectedPlan.price_yearly.toLocaleString()}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5 uppercase tracking-wider">Payment method</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAY_METHODS.map((m) => (
                    <button key={m.id} onClick={() => setMethod(m.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${method === m.id ? 'border-[#1C64F2] bg-blue-50 text-[#1C64F2]' : 'border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]'}`}>
                      <m.icon className="w-4 h-4" /> {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-5 flex flex-col justify-between">
              <div>
                <p className="text-xs text-[#94A3B8] uppercase tracking-wider mb-2">Amount due</p>
                <p className="text-3xl font-bold text-[#0F172A]">Rs.{price.toLocaleString()}</p>
                <p className="text-xs text-[#64748B] mt-1">{selectedPlan.display_name} · {cycle} · {method}</p>
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-[#64748B] mb-1.5 uppercase tracking-wider">Transaction ID (optional)</label>
                  <input
                    value={txnId}
                    onChange={e => setTxnId(e.target.value)}
                    placeholder="Enter UPI / NEFT transaction ID"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-white text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1C64F2]/40 focus:border-[#1C64F2]"
                  />
                </div>
              </div>
              <button
                onClick={handlePay}
                disabled={paying}
                className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-blue-500/25"
              >
                {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {paying ? 'Processing payment...' : `Confirm payment · Rs.${price.toLocaleString()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct Payment (QR / Bank Transfer) */}
      {payMethods && (payMethods.qr_code_url || payMethods.bank_details?.length > 0) && (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-1">Direct payment</h3>
          <p className="text-sm text-[#94A3B8] mb-5">Scan the QR or transfer directly to our bank account, then notify us of the transaction ID.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {payMethods.qr_code_url && (
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-5">
                <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-3">Scan & pay (UPI)</p>
                <img src={payMethods.qr_code_url} alt="Payment QR" className="w-44 h-44 rounded-lg object-cover border border-[#E2E8F0] bg-white mx-auto" />
                {payMethods.upi_id && (
                  <p className="text-center text-sm text-[#475569] mt-3">
                    UPI ID: <span className="font-mono font-semibold text-[#0F172A]">{payMethods.upi_id}</span>
                  </p>
                )}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-3">Bank transfer</p>
              <div className="space-y-3">
                {payMethods.bank_details?.map((b) => (
                  <div key={b.id} className="rounded-xl border border-[#E2E8F0] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-sm text-[#0F172A]">{b.bank_name || 'Bank'}</span>
                      {b.is_default && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700">DEFAULT</span>}
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div className="col-span-2"><dt className="text-[#94A3B8]">Account Name</dt><dd className="text-[#0F172A] font-medium">{b.account_name || '-'}</dd></div>
                      <div><dt className="text-[#94A3B8]">Account No</dt><dd className="text-[#0F172A] font-mono font-medium">{b.account_number || '-'}</dd></div>
                      <div><dt className="text-[#94A3B8]">IFSC</dt><dd className="text-[#0F172A] font-mono font-medium">{b.ifsc || '-'}</dd></div>
                      {b.branch && <div><dt className="text-[#94A3B8]">Branch</dt><dd className="text-[#0F172A] font-medium">{b.branch}</dd></div>}
                      {b.upi_id && <div><dt className="text-[#94A3B8]">UPI</dt><dd className="text-[#0F172A] font-mono font-medium">{b.upi_id}</dd></div>}
                    </dl>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#94A3B8] mt-3">
                After paying, record the transaction ID below so we can confirm your payment.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Payment history */}
      <div>
        <h3 className="text-lg font-semibold text-[#0F172A] mb-3">Payment history</h3>
        <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
          {payments.length === 0 ? (
            <p className="text-center py-10 text-sm text-[#94A3B8]">No payments yet</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase">Plan</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase">Amount</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase">Method</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase">Txn ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-sm text-[#475569]">{p.payment_date ? formatAppDate(p.payment_date) : '-'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">{p.plan_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-[#475569]">Rs.{p.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-[#475569] capitalize">{p.method}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : p.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#94A3B8] font-mono">{p.transaction_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Invoices */}
      <div>
        <h3 className="text-lg font-semibold text-[#0F172A] mb-3">Invoices</h3>
        <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
          {invoices.length === 0 ? (
            <p className="text-center py-10 text-sm text-[#94A3B8]">No invoices yet. Make a payment to generate an invoice.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase">Invoice No</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase">Plan</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase">Subtotal</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase">Tax</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase">Total</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase">Status</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 text-sm font-mono font-medium text-[#0F172A]">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-sm text-[#475569]">{inv.issued_date ? formatAppDate(inv.issued_date) : '-'}</td>
                    <td className="px-4 py-3 text-sm text-[#475569]">{inv.plan_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-[#475569]">Rs.{inv.subtotal.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-[#475569]">{inv.tax_label} {inv.tax_percent}% · Rs.{inv.tax_amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">Rs.{inv.total.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : inv.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-500'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => downloadInvoice(inv.id, inv.invoice_number)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1C64F2]/10 text-[#1C64F2] text-xs font-semibold hover:bg-[#1C64F2]/20 transition-colors">
                        <FileText className="w-3.5 h-3.5" /> PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default BillingPanel;
