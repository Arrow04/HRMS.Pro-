import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check, Loader2, ShieldCheck } from 'lucide-react';
import { apiPost } from '../lib/api';
import { PageHeader } from '../components/ui/states';
import UploadField from '../components/ui/UploadField';

const STEPS = ['Basics', 'Contact & location', 'Brand & presence', 'Compliance & hiring', 'Review'];

const INDUSTRIES = ['Technology', 'Manufacturing', 'Retail', 'Healthcare', 'Education', 'Hospitality', 'Logistics', 'Construction', 'Finance', 'Agriculture', 'Services', 'Other'];
const SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

const inputCls =
  'w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white';

function Label({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {children} {optional && <span className="text-gray-400 font-normal">(optional)</span>}
    </label>
  );
}

export default function RegisterCompany() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '', description: '', industry: '', email: '', phone: '',
    address: '', city: '', state: '', country: 'India', pincode: '',
    company_size: '', founded_year: '', website: '',
    linkedin: '', twitter: '', facebook: '', instagram: '',
    logo_url: '', cover_image_url: '', headquarters: '', gstin: '',
    hiring_name: '', hiring_role: '', hiring_phone: '',
    agree: false,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const validate = (s: number) => {
    setError('');
    if (s === 0 && (!form.name.trim() || !form.description.trim() || !form.industry)) {
      setError('Company name, description and industry are required.');
      return false;
    }
    if (s === 1 && (!form.email.includes('@') || !form.city.trim() || !form.state.trim())) {
      setError('Valid work email, city and state are required.');
      return false;
    }
    if (s === 3 && (!form.hiring_name.trim() || !form.agree)) {
      setError('Hiring contact name and the fair-hiring confirmation are required.');
      return false;
    }
    return true;
  };

  const next = () => {
    if (validate(step)) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
      window.scrollTo({ top: 0 });
    }
  };
  const back = () => {
    setError('');
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0 });
  };

  const submit = async () => {
    if (!validate(3)) {
      setStep(3);
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/public/companies/register', {
        name: form.name.trim(),
        description: form.description.trim(),
        industry: form.industry,
        website: form.website.trim() || undefined,
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim(),
        state: form.state.trim(),
        country: form.country.trim() || 'India',
        pincode: form.pincode.trim() || undefined,
        company_size: form.company_size || undefined,
        founded_year: form.founded_year ? Number(form.founded_year) : undefined,
        logo_url: form.logo_url || undefined,
        cover_image_url: form.cover_image_url || undefined,
        headquarters: form.headquarters.trim() || undefined,
        gstin: form.gstin.trim() || undefined,
        social_links: {
          linkedin: form.linkedin.trim() || undefined,
          twitter: form.twitter.trim() || undefined,
          facebook: form.facebook.trim() || undefined,
          instagram: form.instagram.trim() || undefined,
        },
      });
      navigate('/companies');
    } catch (err: any) {
      setError(err?.message || 'Failed to register company');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Register your company" subtitle="Free — verification starts the moment you submit" />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-1 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1.5 rounded-full ${i <= step ? 'bg-indigo-600' : 'bg-gray-200'}`} />
              <p className={`text-[11px] mt-1 font-medium ${i <= step ? 'text-indigo-700' : 'text-gray-400'}`}>{s}</p>
            </div>
          ))}
        </div>

        {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 mb-4">{error}</div>}

        {step === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div><Label>Company name *</Label><input className={inputCls} placeholder="e.g. Sharma Textiles" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
            <div><Label>What does the company do? *</Label><textarea rows={4} className={inputCls} placeholder="Products, services, customers…" value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><Label>Industry *</Label>
                <select className={inputCls} value={form.industry} onChange={(e) => set('industry', e.target.value)}>
                  <option value="">Select…</option>
                  {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div><Label optional>Company size</Label>
                <select className={inputCls} value={form.company_size} onChange={(e) => set('company_size', e.target.value)}>
                  <option value="">Select…</option>
                  {SIZES.map((s) => <option key={s} value={s}>{s} people</option>)}
                </select>
              </div>
              <div><Label optional>Founded year</Label><input type="number" min={1900} max={new Date().getFullYear()} className={inputCls} value={form.founded_year} onChange={(e) => set('founded_year', e.target.value)} /></div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Work email *</Label><input type="email" className={inputCls} placeholder="hr@company.com" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
              <div><Label optional>Phone</Label><input className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
            </div>
            <div><Label optional>Street address</Label><input className={inputCls} value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><Label>City *</Label><input className={inputCls} value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
              <div><Label>State *</Label><input className={inputCls} value={form.state} onChange={(e) => set('state', e.target.value)} /></div>
              <div><Label>Pincode</Label><input className={inputCls} value={form.pincode} onChange={(e) => set('pincode', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Country</Label><input className={inputCls} value={form.country} onChange={(e) => set('country', e.target.value)} /></div>
              <div><Label optional>Headquarters</Label><input className={inputCls} placeholder="e.g. Tiruppur, Tamil Nadu" value={form.headquarters} onChange={(e) => set('headquarters', e.target.value)} /></div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <UploadField label="Company logo" kind="logo" accept="image/png,image/jpeg,image/webp" maxMB={2} value={form.logo_url} onChange={(u) => set('logo_url', u)} previewAsImage hint="Square PNG/JPG · max 2 MB — shown on every job" />
              <UploadField label="Cover banner" kind="cover" accept="image/png,image/jpeg,image/webp" maxMB={3} value={form.cover_image_url} onChange={(u) => set('cover_image_url', u)} previewAsImage hint="Wide banner · max 3 MB" />
            </div>
            <div><Label optional>Website</Label><input type="url" className={inputCls} placeholder="https://…" value={form.website} onChange={(e) => set('website', e.target.value)} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label optional>LinkedIn</Label><input className={inputCls} placeholder="https://linkedin.com/company/…" value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} /></div>
              <div><Label optional>X (Twitter)</Label><input className={inputCls} value={form.twitter} onChange={(e) => set('twitter', e.target.value)} /></div>
              <div><Label optional>Facebook</Label><input className={inputCls} value={form.facebook} onChange={(e) => set('facebook', e.target.value)} /></div>
              <div><Label optional>Instagram</Label><input className={inputCls} value={form.instagram} onChange={(e) => set('instagram', e.target.value)} /></div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-green-600" /> Verification boost <span className="text-xs font-medium text-gray-400">(optional, speeds approval)</span></h3>
              <div><Label optional>GSTIN</Label><input className={inputCls} placeholder="e.g. 33ABCDE1234F1Z5" value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} /></div>
              <p className="text-xs text-gray-500">Companies with GSTIN + domain email get the verified badge fastest.</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h3 className="font-bold text-gray-900">Hiring contact</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><Label>Contact person *</Label><input className={inputCls} value={form.hiring_name} onChange={(e) => set('hiring_name', e.target.value)} /></div>
                <div><Label optional>Role</Label><input className={inputCls} placeholder="e.g. HR Manager" value={form.hiring_role} onChange={(e) => set('hiring_role', e.target.value)} /></div>
                <div><Label optional>Phone</Label><input className={inputCls} value={form.hiring_phone} onChange={(e) => set('hiring_phone', e.target.value)} /></div>
              </div>
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.agree} onChange={(e) => set('agree', e.target.checked)} className="mt-1 w-4 h-4" />
                We will never charge candidates, never ask for OTP/bank details, and will respond to verification callbacks. *
              </label>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="bg-indigo-950 text-white rounded-2xl p-6">
            <h3 className="font-bold">Review & submit</h3>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex gap-2"><dt className="text-indigo-300 w-28 shrink-0">Company</dt><dd className="font-semibold">{form.name} · {form.industry}</dd></div>
              <div className="flex gap-2"><dt className="text-indigo-300 w-28 shrink-0">Email</dt><dd>{form.email}</dd></div>
              <div className="flex gap-2"><dt className="text-indigo-300 w-28 shrink-0">Location</dt><dd>{form.city}, {form.state}</dd></div>
              <div className="flex gap-2"><dt className="text-indigo-300 w-28 shrink-0">Brand</dt><dd>Logo {form.logo_url ? '✓' : '—'} · Cover {form.cover_image_url ? '✓' : '—'} · {form.website || 'no site'}</dd></div>
              <div className="flex gap-2"><dt className="text-indigo-300 w-28 shrink-0">GSTIN</dt><dd>{form.gstin || 'Not provided'}</dd></div>
              <div className="flex gap-2"><dt className="text-indigo-300 w-28 shrink-0">Contact</dt><dd>{form.hiring_name}{form.hiring_role ? ` (${form.hiring_role})` : ''}</dd></div>
            </dl>
            <p className="text-xs text-indigo-300 mt-4">Submitting starts verification — most companies clear within 24 hours.</p>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          {step > 0 && (
            <button type="button" onClick={back} className="inline-flex items-center gap-1 px-5 py-3 rounded-xl border border-gray-300 text-sm font-semibold hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="flex-1 inline-flex items-center justify-center gap-1 bg-indigo-600 text-white py-3 rounded-xl hover:bg-indigo-700 font-semibold">
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={submitting} className="flex-1 inline-flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-xl hover:bg-green-700 font-semibold disabled:opacity-50">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {submitting ? 'Registering…' : 'Register company'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
