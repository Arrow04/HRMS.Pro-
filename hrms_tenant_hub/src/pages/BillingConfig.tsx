import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Save, Loader2, CreditCard, Globe, Percent, CalendarClock, FileText,
  Mail, ShieldCheck, Banknote, RotateCcw, Check, Wallet, QrCode, Plus,
  Trash2, Landmark, Star, ImageUp
} from 'lucide-react';
import api from '../services/api';

const PAYMENT_METHODS = [
  { id: 'card', label: 'Card' },
  { id: 'upi', label: 'UPI' },
  { id: 'netbanking', label: 'Net Banking' },
  { id: 'bank_transfer', label: 'Bank Transfer' },
];

interface BankDetail {
  id: number;
  bank_name: string;
  account_name: string;
  account_number: string;
  ifsc: string;
  branch: string;
  upi_id?: string;
  is_default: boolean;
}

const DEFAULT_CONFIG = {
  gateway: 'manual',
  gateway_key: '',
  gateway_secret: '',
  currency: 'INR',
  tax_percent: 0,
  tax_label: 'GST',
  trial_days: 30,
  invoice_prefix: 'INV',
  invoice_footer: 'Thank you for your business!',
  billing_email: '',
  payment_methods: ['upi', 'bank_transfer'],
  auto_renew: true,
  qr_code_url: '',
  upi_id: '',
  bank_details: [] as BankDetail[],
};

const Section = ({ title, icon: Icon, children }: any) => (
  <div className="bg-white rounded-xl border border-gray-200 p-6">
    <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
      <Icon className="w-4 h-4 text-blue-500" /> {title}
    </h2>
    {children}
  </div>
);

export default function BillingConfig() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<any>({ ...DEFAULT_CONFIG });
  const [loaded, setLoaded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['billing-config'],
    queryFn: () => api.get('/superadmin/legacy/billing-config').then(r => r.data),
  });

  useEffect(() => {
    if (data && !loaded) {
      setForm({ ...DEFAULT_CONFIG, ...data });
      setLoaded(true);
    }
  }, [data, loaded]);

  const saveMut = useMutation({
    mutationFn: (payload: any) => api.put('/superadmin/legacy/billing-config', payload),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['billing-config'] });
      toast.success('Billing configuration saved');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to save'),
  });

  const update = (k: string, v: any) => setForm({ ...form, [k]: v });

  const toggleMethod = (id: string) => {
    const has = (form.payment_methods || []).includes(id);
    update('payment_methods', has ? form.payment_methods.filter((m: string) => m !== id) : [...(form.payment_methods || []), id]);
  };

  const reset = () => { setForm({ ...DEFAULT_CONFIG }); toast.success('Form reset'); };

  const uploadQr = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/superadmin/legacy/billing-config/qr-code', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res: any) => {
      const url = res.data?.qr_code_url;
      const upi = res.data?.upi_id;
      const next: any = { ...form };
      if (url) next.qr_code_url = url;
      if (upi) { next.upi_id = upi; toast.success(`QR uploaded — UPI ID detected: ${upi}`); }
      else toast.success('QR code uploaded');
      setForm(next);
      queryClient.invalidateQueries({ queryKey: ['billing-config'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Upload failed'),
  });

  const onQrFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadQr.mutate(f);
    e.target.value = '';
  };

  const addBank = () => {
    const banks = [...(form.bank_details || [])];
    const nextId = banks.length ? Math.max(...banks.map((b: BankDetail) => b.id)) + 1 : 1;
    banks.push({ id: nextId, bank_name: '', account_name: '', account_number: '', ifsc: '', branch: '', upi_id: '', is_default: banks.length === 0 });
    update('bank_details', banks);
  };

  const [ifscStatus, setIfscStatus] = useState<Record<number, { checking?: boolean; ok?: boolean; bank?: string; branch?: string; error?: string }>>({});

  const validateIfsc = async (id: number, code: string) => {
    const trimmed = (code || '').trim().toUpperCase();
    if (trimmed.length < 4) { setIfscStatus(s => ({ ...s, [id]: {} })); return; }
    setIfscStatus(s => ({ ...s, [id]: { checking: true } }));
    try {
      const res = await api.get(`/superadmin/legacy/ifsc/${encodeURIComponent(trimmed)}`);
      const d = res.data;
      if (d.valid) {
        setIfscStatus(s => ({ ...s, [id]: { checking: false, ok: true, bank: d.bank || '', branch: d.branch || '' } }));
        // Auto-fill bank name + branch if fields are empty
        update('bank_details', (form.bank_details || []).map((b: BankDetail) =>
          b.id === id ? { ...b, bank_name: b.bank_name || d.bank || '', branch: b.branch || d.branch || '' } : b
        ));
      } else {
        setIfscStatus(s => ({ ...s, [id]: { checking: false, ok: false, error: d.error || 'IFSC not found' } }));
      }
    } catch {
      setIfscStatus(s => ({ ...s, [id]: { checking: false, error: 'Validation failed' } }));
    }
  };

  const updateBank = (id: number, key: string, val: string) => {
    update('bank_details', (form.bank_details || []).map((b: BankDetail) => b.id === id ? { ...b, [key]: val } : b));
    if (key === 'ifsc') validateIfsc(id, val);
  };

  const removeBank = (id: number) => {
    update('bank_details', (form.bank_details || []).filter((b: BankDetail) => b.id !== id));
  };

  const setDefaultBank = (id: number) => {
    update('bank_details', (form.bank_details || []).map((b: BankDetail) => ({ ...b, is_default: b.id === id })));
  };

  const inputCls = "w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all";
  const labelCls = "block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider";

  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : (
        <></>
      )}
      {!isLoading && (
        <>
          {/* Payment Gateway */}
          <Section title="Payment Gateway" icon={CreditCard}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Gateway Provider</label>
                <select value={form.gateway} onChange={e => update('gateway', e.target.value)} className={inputCls}>
                  <option value="razorpay">Razorpay</option>
                  <option value="stripe">Stripe</option>
                  <option value="paypal">PayPal</option>
                  <option value="instamojo">Instamojo</option>
                  <option value="manual">Manual / Offline</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Gateway Key / ID</label>
                <input value={form.gateway_key || ''} onChange={e => update('gateway_key', e.target.value)} placeholder="rzp_live_..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Gateway Secret</label>
                <input type="password" value={form.gateway_secret || ''} onChange={e => update('gateway_secret', e.target.value)} placeholder="sk_live_..." className={inputCls} />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
              <ShieldCheck className="w-4 h-4" /> Secrets are stored server-side and never exposed to tenants.
            </div>
          </Section>

          {/* Currency & Tax */}
          <Section title="Currency & Tax" icon={Globe}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Default Currency</label>
                <select value={form.currency} onChange={e => update('currency', e.target.value)} className={inputCls}>
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="AED">AED (د.إ)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Tax Percent</label>
                <input type="number" value={form.tax_percent ?? 0} onChange={e => update('tax_percent', +e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tax Label</label>
                <input value={form.tax_label || 'GST'} onChange={e => update('tax_label', e.target.value)} placeholder="GST / VAT" className={inputCls} />
              </div>
            </div>
          </Section>

          {/* Trial & Subscription */}
          <Section title="Trial & Subscription" icon={CalendarClock}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Trial Days</label>
                <input type="number" value={form.trial_days ?? 30} onChange={e => update('trial_days', +e.target.value)} className={inputCls} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 pb-2.5 cursor-pointer">
                  <input type="checkbox" checked={!!form.auto_renew} onChange={e => update('auto_renew', e.target.checked)} className="w-4 h-4 accent-blue-600" />
                  <span className="text-sm text-gray-700">Auto-renew subscriptions</span>
                </label>
              </div>
            </div>
          </Section>

          {/* Invoice Settings */}
          <Section title="Invoice Settings" icon={FileText}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Invoice Prefix</label>
                <input value={form.invoice_prefix || 'INV'} onChange={e => update('invoice_prefix', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Billing Email</label>
                <input type="email" value={form.billing_email || ''} onChange={e => update('billing_email', e.target.value)} placeholder="billing@hrms.com" className={inputCls} />
              </div>
              <div className="md:col-span-1">
                <label className={labelCls}>Invoice Footer</label>
                <input value={form.invoice_footer || ''} onChange={e => update('invoice_footer', e.target.value)} className={inputCls} />
              </div>
            </div>
          </Section>

          {/* Payment Methods */}
          <Section title="Payment Methods" icon={Wallet}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {PAYMENT_METHODS.map((m) => {
                const active = (form.payment_methods || []).includes(m.id);
                return (
                  <button key={m.id} onClick={() => toggleMethod(m.id)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                      active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}>
                    <Banknote className="w-4 h-4" />
                    {m.label}
                    {active && <Check className="w-3.5 h-3.5 ml-auto text-blue-500" />}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Bank Details & QR Code */}
          <Section title="Bank Details & Payment QR" icon={Landmark}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* QR Code */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-blue-500" /> Payment QR Code
                </h3>
                <div className="flex items-start gap-4">
                  <div className="w-40 h-40 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden">
                    {form.qr_code_url ? (
                      <img src={form.qr_code_url} alt="Payment QR" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-gray-400 text-center px-2">No QR uploaded</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                      <ImageUp className="w-4 h-4" /> Upload QR
                      <input type="file" accept="image/*" onChange={onQrFile} className="hidden" />
                    </label>
                    <p className="text-xs text-gray-400 mt-2">Upload a UPI payment QR code. Tenants will scan this to pay.</p>
                    <div className="mt-4">
                      <label className={labelCls}>UPI ID</label>
                      <input value={form.upi_id || ''} onChange={e => update('upi_id', e.target.value)} placeholder="hrms@bank" className={inputCls} />
                    </div>
                  </div>
                </div>
                {uploadQr.isPending && <p className="text-xs text-blue-600 mt-2"><Loader2 className="w-3 h-3 inline animate-spin" /> Uploading...</p>}
              </div>

              {/* Bank accounts */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-blue-500" /> Bank Accounts ({form.bank_details?.length || 0})
                  </h3>
                  <button onClick={addBank} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
                    <Plus className="w-3.5 h-3.5" /> Add Account
                  </button>
                </div>
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {(form.bank_details || []).map((b: BankDetail) => (
                    <div key={b.id} className="rounded-xl border border-gray-200 p-4 bg-gray-50/50">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          {b.is_default ? <Star className="w-3.5 h-3.5 inline text-amber-500 mr-1" /> : null}
                          Bank {b.id}
                          {b.is_default && <span className="ml-1 text-amber-600">(Default)</span>}
                        </span>
                        <div className="flex items-center gap-1">
                          {!b.is_default && (
                            <button onClick={() => setDefaultBank(b.id)} className="p-1 text-gray-400 hover:text-amber-500" title="Set default">
                              <Star className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => removeBank(b.id)} className="p-1 text-red-400 hover:text-red-600" title="Remove">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={labelCls}>Bank Name</label>
                          <input value={b.bank_name} onChange={e => updateBank(b.id, 'bank_name', e.target.value)} placeholder="e.g. HDFC Bank" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Account Name</label>
                          <input value={b.account_name} onChange={e => updateBank(b.id, 'account_name', e.target.value)} placeholder="Company name" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Account Number</label>
                          <input value={b.account_number} onChange={e => updateBank(b.id, 'account_number', e.target.value)} placeholder="Account no" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>IFSC Code</label>
                          <div className="relative">
                            <input
                              value={b.ifsc}
                              onChange={e => updateBank(b.id, 'ifsc', e.target.value)}
                              placeholder="HDFC0001234"
                              className={`${inputCls} pr-9 ${ifscStatus[b.id]?.ok ? '!border-green-500' : ifscStatus[b.id]?.error ? '!border-red-400' : ''}`}
                            />
                            {ifscStatus[b.id]?.checking && <Loader2 className="absolute right-3 top-3 w-4 h-4 animate-spin text-gray-400" />}
                            {ifscStatus[b.id]?.ok && <Check className="absolute right-3 top-3 w-4 h-4 text-green-500" />}
                            {ifscStatus[b.id]?.error && <span className="absolute right-3 top-3 text-red-400 text-xs">âœ•</span>}
                          </div>
                          {ifscStatus[b.id]?.ok && (
                            <p className="mt-1 text-xs text-green-600">
                              {ifscStatus[b.id].bank}{ifscStatus[b.id].branch ? ` · ${ifscStatus[b.id].branch}` : ''}
                            </p>
                          )}
                          {ifscStatus[b.id]?.error && (
                            <p className="mt-1 text-xs text-red-500">{ifscStatus[b.id].error}</p>
                          )}
                        </div>
                        <div>
                          <label className={labelCls}>Branch</label>
                          <input value={b.branch} onChange={e => updateBank(b.id, 'branch', e.target.value)} placeholder="Mumbai" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>UPI ID (optional)</label>
                          <input value={b.upi_id || ''} onChange={e => updateBank(b.id, 'upi_id', e.target.value)} placeholder="bank@upi" className={inputCls} />
                        </div>
                      </div>
                    </div>
                  ))}
                  {(form.bank_details || []).length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-xl">
                      No bank accounts added. Click "Add Account" to configure one.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Section>
        </>
      )}

      <div className="flex items-center gap-2">
        <button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Configuration
        </button>
        <button onClick={reset} className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <RotateCcw className="w-4 h-4" /> Reset
        </button>
      </div>
    </div>
  );
}
