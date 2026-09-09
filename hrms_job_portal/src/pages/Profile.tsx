import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, GraduationCap, Briefcase, Rocket, Plus, Trash2, Loader2 } from 'lucide-react';
import { apiPost } from '../lib/api';
import { loadLocalProfile, saveLocalProfile } from '../lib/profile';
import type { PortalProfile, ProfileType } from '../lib/types';
import { PageHeader } from '../components/ui/states';
import UploadField from '../components/ui/UploadField';

const TYPES: Array<{ k: ProfileType; title: string; desc: string; icon: any }> = [
  { k: 'fresher', title: 'Fresher', desc: 'Students & recent graduates looking for a first role', icon: GraduationCap },
  { k: 'experienced', title: 'Experienced', desc: 'Working professionals with 1+ years of experience', icon: Briefcase },
  { k: 'freelancer', title: 'Freelancer', desc: 'Independent talent offering services & gigs', icon: Rocket },
];

const STEPS = ['Profile type', 'Basics', 'Background', 'Skills & links', 'Review'];

const inputCls =
  'w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white';

function Label({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {children} {optional && <span className="text-gray-400 font-normal">(optional)</span>}
    </label>
  );
}

function EntryCard({ title, onRemove, children }: { title: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/60">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-gray-900">{title}</p>
        <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-600" aria-label={`Remove ${title}`}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

const blank = {
  education: () => ({ degree: '', institute: '', year: '', score: '' }),
  work: () => ({ title: '', company: '', from: '', to: '', current: false, description: '' }),
  project: () => ({ title: '', description: '', link: '' }),
  cert: () => ({ name: '', issuer: '', year: '' }),
  achievement: () => ({ title: '', description: '' }),
  service: () => ({ title: '', description: '', rate: '' }),
};

export default function Profile() {
  const existing = loadLocalProfile();
  const [step, setStep] = useState(0);
  const [ptype, setPtype] = useState<ProfileType | ''>(existing?.profile_type || '');
  const [form, setForm] = useState<PortalProfile>({
    full_name: existing?.full_name || '',
    email: existing?.email || '',
    phone: existing?.phone || '',
    headline: existing?.headline || '',
    summary: existing?.summary || '',
    current_designation: existing?.current_designation || '',
    current_company: existing?.current_company || '',
    location: existing?.location || '',
    city: existing?.city || '',
    state: existing?.state || '',
    country: existing?.country || 'India',
    pincode: existing?.pincode || '',
    profile_picture: existing?.profile_picture || '',
    skills: existing?.skills || [],
    languages: existing?.languages || [],
    experience_years: existing?.experience_years || 0,
    education: existing?.education || [],
    work_experience: existing?.work_experience || [],
    certifications: existing?.certifications || [],
    projects: existing?.projects || [],
    achievements: existing?.achievements || [],
    services: existing?.services || [],
    resume_url: existing?.resume_url || '',
    portfolio_url: existing?.portfolio_url || '',
    linkedin_url: existing?.linkedin_url || '',
    github_url: existing?.github_url || '',
    expected_salary_min: existing?.expected_salary_min,
    expected_salary_max: existing?.expected_salary_max,
    current_salary: existing?.current_salary,
    hourly_rate_min: existing?.hourly_rate_min,
    hourly_rate_max: existing?.hourly_rate_max,
    availability: existing?.availability || '',
    notice_period: existing?.notice_period || '',
    employment_type_preference: existing?.employment_type_preference || '',
    remote_preference: existing?.remote_preference || '',
    profile_visibility: existing?.profile_visibility || 'public',
    is_open_to_opportunities: existing?.is_open_to_opportunities ?? true,
    id: existing?.id,
  });
  const [skillsText, setSkillsText] = useState((existing?.skills || []).join(', '));
  const [langsText, setLangsText] = useState((existing?.languages || []).join(', '));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k: keyof PortalProfile, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const setList = (k: 'education' | 'work_experience' | 'certifications' | 'projects' | 'achievements' | 'services', v: any[]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const addEntry = (k: 'education' | 'work_experience' | 'certifications' | 'projects' | 'achievements' | 'services', b: any) =>
    setList(k, [...((form[k] as any[]) || []), b]);
  const editEntry = (k: 'education' | 'work_experience' | 'certifications' | 'projects' | 'achievements' | 'services', i: number, field: string, v: any) => {
    const arr = [...((form[k] as any[]) || [])];
    arr[i] = { ...arr[i], [field]: v };
    setList(k, arr);
  };
  const delEntry = (k: 'education' | 'work_experience' | 'certifications' | 'projects' | 'achievements' | 'services', i: number) =>
    setList(k, ((form[k] as any[]) || []).filter((_, j) => j !== i));

  const syncLists = () => {
    form.skills = skillsText.split(',').map((s) => s.trim()).filter(Boolean);
    form.languages = langsText.split(',').map((s) => s.trim()).filter(Boolean);
  };

  const validate = (s: number): boolean => {
    setError('');
    if (s === 0 && !ptype) {
      setError('Choose the profile that fits you best.');
      return false;
    }
    if (s === 1) {
      if (!form.full_name.trim() || !form.email.includes('@') || !form.city.trim() || !form.state.trim()) {
        setError('Name, valid email, city and state are required.');
        return false;
      }
    }
    if (s === 2) {
      if (ptype === 'fresher' && (form.education || []).length === 0) {
        setError('Add at least one education entry — it’s your strongest signal as a fresher.');
        return false;
      }
      if (ptype === 'experienced' && (form.work_experience || []).length === 0 && (form.education || []).length === 0) {
        setError('Add at least one work experience or education entry.');
        return false;
      }
      if (ptype === 'freelancer' && (form.services || []).length === 0) {
        setError('Add at least one service you offer — clients hire from this list.');
        return false;
      }
    }
    return true;
  };

  const next = () => {
    syncLists();
    if (validate(step)) {
      saveLocalProfile({ ...form, profile_type: (ptype || 'experienced') as ProfileType });
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
      window.scrollTo({ top: 0 });
    }
  };

  const back = () => {
    setError('');
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0 });
  };

  const save = async () => {
    syncLists();
    setError('');
    setMessage('');
    const num = (v: any) => (v === '' || v == null ? undefined : Number(v));
    const payload = {
      ...form,
      profile_type: ptype || 'experienced',
      experience_years: Number(form.experience_years) || 0,
      expected_salary_min: num(form.expected_salary_min),
      expected_salary_max: num(form.expected_salary_max),
      current_salary: num(form.current_salary),
      hourly_rate_min: num(form.hourly_rate_min),
      hourly_rate_max: num(form.hourly_rate_max),
    };
    setSaving(true);
    try {
      const res = await apiPost<{ id: number }>('/public/profile', payload);
      const saved = { ...payload, id: res.id ?? form.id } as PortalProfile;
      saveLocalProfile(saved);
      setForm(saved);
      setMessage('Profile published. It now powers Apply, verification and job alerts.');
    } catch (err: any) {
      saveLocalProfile(payload as PortalProfile);
      setError(err?.message ? `${err.message} — kept a local copy.` : 'Server save failed — kept a local copy.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Build my profile" subtitle="One profile for jobs, gigs and verification" />
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
        {message && <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700 mb-4">{message}</div>}

        {step === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {TYPES.map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => {
                  setPtype(t.k);
                  setError('');
                }}
                className={`rounded-2xl border-2 p-5 text-left transition-all ${
                  ptype === t.k ? 'border-indigo-600 bg-indigo-50/60 shadow-md' : 'border-gray-200 bg-white hover:border-indigo-300'
                }`}
              >
                <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${ptype === t.k ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  <t.icon className="w-5 h-5" />
                </span>
                <p className="font-bold text-gray-900 mt-3 flex items-center gap-1.5">
                  {t.title} {ptype === t.k && <Check className="w-4 h-4 text-indigo-600" />}
                </p>
                <p className="text-xs text-gray-500 mt-1">{t.desc}</p>
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <UploadField label="Profile photo" kind="avatar" accept="image/png,image/jpeg,image/webp" maxMB={2} value={form.profile_picture} onChange={(u) => set('profile_picture', u)} previewAsImage hint="PNG/JPG/WebP · max 2 MB — employers trust faces" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Full name *</Label><input className={inputCls} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} /></div>
              <div><Label>Email *</Label><input type="email" className={inputCls} value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Phone <span className="text-gray-400 font-normal">(for OTP verification)</span></Label><input className={inputCls} value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></div>
              <div><Label>Headline</Label><input className={inputCls} placeholder={ptype === 'freelancer' ? 'e.g. Logo & Brand Designer' : 'e.g. Frontend Developer'} value={form.headline || ''} onChange={(e) => set('headline', e.target.value)} /></div>
            </div>
            <div><Label>Summary</Label><textarea rows={3} className={inputCls} placeholder="Two lines that sell you…" value={form.summary || ''} onChange={(e) => set('summary', e.target.value)} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><Label>City *</Label><input className={inputCls} value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
              <div><Label>State *</Label><input className={inputCls} value={form.state} onChange={(e) => set('state', e.target.value)} /></div>
              <div><Label>Pincode</Label><input className={inputCls} value={form.pincode || ''} onChange={(e) => set('pincode', e.target.value)} /></div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {(ptype === 'fresher' || ptype === 'experienced') && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">Education</h3>
                  <button type="button" onClick={() => addEntry('education', blank.education())} className="inline-flex items-center gap-1 text-sm text-indigo-600 font-semibold hover:text-indigo-700">
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
                {((form.education as any[]) || []).map((ed, i) => (
                  <EntryCard key={i} title={ed.degree || `Education ${i + 1}`} onRemove={() => delEntry('education', i)}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input className={inputCls} placeholder="Degree / course" value={ed.degree || ''} onChange={(e) => editEntry('education', i, 'degree', e.target.value)} />
                      <input className={inputCls} placeholder="Institute" value={ed.institute || ''} onChange={(e) => editEntry('education', i, 'institute', e.target.value)} />
                      <input className={inputCls} placeholder="Year (e.g. 2024)" value={ed.year || ''} onChange={(e) => editEntry('education', i, 'year', e.target.value)} />
                      <input className={inputCls} placeholder="Score / %" value={ed.score || ''} onChange={(e) => editEntry('education', i, 'score', e.target.value)} />
                    </div>
                  </EntryCard>
                ))}
                {(form.education || []).length === 0 && <p className="text-sm text-gray-400">None yet — hit Add.</p>}
              </div>
            )}

            {ptype === 'experienced' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">Work experience</h3>
                  <button type="button" onClick={() => addEntry('work_experience', blank.work())} className="inline-flex items-center gap-1 text-sm text-indigo-600 font-semibold hover:text-indigo-700">
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label>Current designation</Label><input className={inputCls} value={form.current_designation || ''} onChange={(e) => set('current_designation', e.target.value)} /></div>
                  <div><Label>Current company</Label><input className={inputCls} value={form.current_company || ''} onChange={(e) => set('current_company', e.target.value)} /></div>
                </div>
                {((form.work_experience as any[]) || []).map((w, i) => (
                  <EntryCard key={i} title={w.title || `Role ${i + 1}`} onRemove={() => delEntry('work_experience', i)}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input className={inputCls} placeholder="Job title" value={w.title || ''} onChange={(e) => editEntry('work_experience', i, 'title', e.target.value)} />
                      <input className={inputCls} placeholder="Company" value={w.company || ''} onChange={(e) => editEntry('work_experience', i, 'company', e.target.value)} />
                      <input className={inputCls} placeholder="From (e.g. 2021)" value={w.from || ''} onChange={(e) => editEntry('work_experience', i, 'from', e.target.value)} />
                      <input className={inputCls} placeholder="To (or Present)" value={w.to || ''} onChange={(e) => editEntry('work_experience', i, 'to', e.target.value)} />
                    </div>
                    <textarea rows={2} className={inputCls} placeholder="What did you achieve there?" value={w.description || ''} onChange={(e) => editEntry('work_experience', i, 'description', e.target.value)} />
                  </EntryCard>
                ))}
              </div>
            )}

            {ptype === 'freelancer' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">Services I offer</h3>
                  <button type="button" onClick={() => addEntry('services', blank.service())} className="inline-flex items-center gap-1 text-sm text-indigo-600 font-semibold hover:text-indigo-700">
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
                {((form.services as any[]) || []).map((s, i) => (
                  <EntryCard key={i} title={s.title || `Service ${i + 1}`} onRemove={() => delEntry('services', i)}>
                    <input className={inputCls} placeholder="Service title (e.g. Wedding photography)" value={s.title || ''} onChange={(e) => editEntry('services', i, 'title', e.target.value)} />
                    <textarea rows={2} className={inputCls} placeholder="What’s included?" value={s.description || ''} onChange={(e) => editEntry('services', i, 'description', e.target.value)} />
                    <input className={inputCls} placeholder="Starting rate (e.g. ₹5,000/project)" value={s.rate || ''} onChange={(e) => editEntry('services', i, 'rate', e.target.value)} />
                  </EntryCard>
                ))}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><Label>Hourly min (₹)</Label><input type="number" min={0} className={inputCls} value={form.hourly_rate_min ?? ''} onChange={(e) => set('hourly_rate_min', e.target.value)} /></div>
                  <div><Label>Hourly max (₹)</Label><input type="number" min={0} className={inputCls} value={form.hourly_rate_max ?? ''} onChange={(e) => set('hourly_rate_max', e.target.value)} /></div>
                  <div><Label>Availability</Label>
                    <select className={inputCls} value={form.availability || ''} onChange={(e) => set('availability', e.target.value)}>
                      <option value="">Select…</option>
                      <option value="immediate">Immediate</option>
                      <option value="part_time">Part-time</option>
                      <option value="weekends">Weekends only</option>
                      <option value="booked">Booked — waitlist me</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900">Projects</h3>
                <button type="button" onClick={() => addEntry('projects', blank.project())} className="inline-flex items-center gap-1 text-sm text-indigo-600 font-semibold hover:text-indigo-700">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
              {((form.projects as any[]) || []).map((p, i) => (
                <EntryCard key={i} title={p.title || `Project ${i + 1}`} onRemove={() => delEntry('projects', i)}>
                  <input className={inputCls} placeholder="Project title" value={p.title || ''} onChange={(e) => editEntry('projects', i, 'title', e.target.value)} />
                  <textarea rows={2} className={inputCls} placeholder="What did you build/do?" value={p.description || ''} onChange={(e) => editEntry('projects', i, 'description', e.target.value)} />
                  <input className={inputCls} placeholder="Link (optional)" value={p.link || ''} onChange={(e) => editEntry('projects', i, 'link', e.target.value)} />
                </EntryCard>
              ))}
              <div className="flex items-center justify-between pt-2">
                <h3 className="font-bold text-gray-900">Certifications</h3>
                <button type="button" onClick={() => addEntry('certifications', blank.cert())} className="inline-flex items-center gap-1 text-sm text-indigo-600 font-semibold hover:text-indigo-700">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
              {((form.certifications as any[]) || []).map((c, i) => (
                <EntryCard key={i} title={c.name || `Certificate ${i + 1}`} onRemove={() => delEntry('certifications', i)}>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input className={inputCls} placeholder="Name" value={c.name || ''} onChange={(e) => editEntry('certifications', i, 'name', e.target.value)} />
                    <input className={inputCls} placeholder="Issuer" value={c.issuer || ''} onChange={(e) => editEntry('certifications', i, 'issuer', e.target.value)} />
                    <input className={inputCls} placeholder="Year" value={c.year || ''} onChange={(e) => editEntry('certifications', i, 'year', e.target.value)} />
                  </div>
                </EntryCard>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div><Label>Skills (comma separated) *</Label><input className={inputCls} placeholder="e.g. Tailoring, Communication, Tally" value={skillsText} onChange={(e) => setSkillsText(e.target.value)} /></div>
            <div><Label>Languages</Label><input className={inputCls} placeholder="e.g. Hindi, English, Tamil" value={langsText} onChange={(e) => setLangsText(e.target.value)} /></div>
            <UploadField label="Resume" kind="resume" accept=".pdf,.doc,.docx,.txt" maxMB={5} value={form.resume_url} onChange={(u) => set('resume_url', u)} hint="PDF/DOC/TXT · max 5 MB — parsed for employer search" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><Label optional>Portfolio URL</Label><input type="url" className={inputCls} value={form.portfolio_url || ''} onChange={(e) => set('portfolio_url', e.target.value)} /></div>
              <div><Label optional>LinkedIn</Label><input type="url" className={inputCls} value={form.linkedin_url || ''} onChange={(e) => set('linkedin_url', e.target.value)} /></div>
              <div><Label optional>GitHub</Label><input type="url" className={inputCls} value={form.github_url || ''} onChange={(e) => set('github_url', e.target.value)} /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-gray-900">Achievements</h3>
                <button type="button" onClick={() => addEntry('achievements', blank.achievement())} className="inline-flex items-center gap-1 text-sm text-indigo-600 font-semibold hover:text-indigo-700">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
              {((form.achievements as any[]) || []).map((a, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input className={inputCls} placeholder="e.g. State-level kabaddi winner" value={a.title || ''} onChange={(e) => editEntry('achievements', i, 'title', e.target.value)} />
                  <button type="button" onClick={() => delEntry('achievements', i)} className="text-gray-400 hover:text-red-600 shrink-0" aria-label="Remove achievement">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h3 className="font-bold text-gray-900">Preferences</h3>
              {ptype !== 'freelancer' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label>Expected salary min (₹/yr)</Label><input type="number" min={0} className={inputCls} value={form.expected_salary_min ?? ''} onChange={(e) => set('expected_salary_min', e.target.value)} /></div>
                  <div><Label>Expected salary max (₹/yr)</Label><input type="number" min={0} className={inputCls} value={form.expected_salary_max ?? ''} onChange={(e) => set('expected_salary_max', e.target.value)} /></div>
                  <div><Label>Current salary (₹/yr)</Label><input type="number" min={0} className={inputCls} value={form.current_salary ?? ''} onChange={(e) => set('current_salary', e.target.value)} /></div>
                  <div><Label>Notice period</Label><input className={inputCls} placeholder="e.g. 30 days" value={form.notice_period || ''} onChange={(e) => set('notice_period', e.target.value)} /></div>
                  <div><Label>Employment type</Label>
                    <select className={inputCls} value={form.employment_type_preference || ''} onChange={(e) => set('employment_type_preference', e.target.value)}>
                      <option value="">No preference</option>
                      <option value="full_time">Full time</option>
                      <option value="part_time">Part time</option>
                      <option value="contract">Contract</option>
                      <option value="internship">Internship</option>
                    </select>
                  </div>
                  <div><Label>Work mode</Label>
                    <select className={inputCls} value={form.remote_preference || ''} onChange={(e) => set('remote_preference', e.target.value)}>
                      <option value="">No preference</option>
                      <option value="on_site">On site</option>
                      <option value="remote">Remote</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Rates & availability were set in Background — edit there if needed.</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Profile visibility</Label>
                  <select className={inputCls} value={form.profile_visibility || 'public'} onChange={(e) => set('profile_visibility', e.target.value)}>
                    <option value="public">Public — everyone can find me</option>
                    <option value="private">Private — only when I apply</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 mt-6">
                  <input type="checkbox" checked={form.is_open_to_opportunities ?? true} onChange={(e) => set('is_open_to_opportunities', e.target.checked)} className="w-4 h-4" />
                  Open to opportunities
                </label>
              </div>
            </div>
            <div className="bg-indigo-950 text-white rounded-2xl p-6">
              <h3 className="font-bold">Review</h3>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex gap-2"><dt className="text-indigo-300 w-28 shrink-0">Type</dt><dd className="font-semibold capitalize">{ptype}</dd></div>
                <div className="flex gap-2"><dt className="text-indigo-300 w-28 shrink-0">Name</dt><dd>{form.full_name} · {form.city}, {form.state}</dd></div>
                <div className="flex gap-2"><dt className="text-indigo-300 w-28 shrink-0">Headline</dt><dd>{form.headline || '—'}</dd></div>
                <div className="flex gap-2"><dt className="text-indigo-300 w-28 shrink-0">Skills</dt><dd>{(form.skills || []).slice(0, 6).join(', ') || '—'}</dd></div>
                <div className="flex gap-2"><dt className="text-indigo-300 w-28 shrink-0">Entries</dt><dd>Edu {(form.education || []).length} · Exp {(form.work_experience || []).length} · Projects {(form.projects || []).length} · Services {(form.services || []).length}</dd></div>
                <div className="flex gap-2"><dt className="text-indigo-300 w-28 shrink-0">Resume</dt><dd>{form.resume_url ? 'Uploaded ✓' : 'Not attached'}</dd></div>
              </dl>
            </div>
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
            <button type="button" onClick={save} disabled={saving} className="flex-1 inline-flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-xl hover:bg-green-700 font-semibold disabled:opacity-50">
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {saving ? 'Publishing…' : 'Publish profile'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
