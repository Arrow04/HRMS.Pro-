import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus, Edit2, Trash2, Loader2, SlidersHorizontal, Target, Star,
  MessageSquare, ChevronDown, ChevronUp, CheckCircle2,
  CalendarDays, Layers, FileText, Building2, BarChart3,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import ToggleSwitch from './ToggleSwitch';
import api from '../services/api';
import type { Company } from '../types';

interface ApiErrorLike { response?: { data?: { detail?: string } } }
function errMsg(err: unknown, fallback: string) {
  return (err as ApiErrorLike | null)?.response?.data?.detail || fallback;
}

const MONTHS = [
  { id: 'jan', name: 'January' }, { id: 'feb', name: 'February' },
  { id: 'mar', name: 'March' }, { id: 'apr', name: 'April' },
  { id: 'may', name: 'May' }, { id: 'jun', name: 'June' },
  { id: 'jul', name: 'July' }, { id: 'aug', name: 'August' },
  { id: 'sep', name: 'September' }, { id: 'oct', name: 'October' },
  { id: 'nov', name: 'November' }, { id: 'dec', name: 'December' },
];

const FREQUENCIES = [
  { id: 'quarterly', name: 'Quarterly' },
  { id: 'half-yearly', name: 'Half-Yearly' },
  { id: 'annual', name: 'Annual' },
  { id: 'custom', name: 'Custom' },
];

const FEEDBACK_CATEGORIES = [
  { id: 'peer', name: 'Peer' },
  { id: 'self', name: 'Self' },
  { id: 'manager', name: 'Manager' },
  { id: 'subordinate', name: 'Subordinate' },
];

interface SaveResponse {
  message?: string;
}

interface ConfigListItem extends Partial<PageState> {
  id: number;
  status?: string;
  company_id?: number | null;
  data?: Partial<PageState>;
}

// ── Types ──

interface ReviewCycle {
  id?: number;
  name: string;
  frequency: string;
  start_month: string;
  duration_days: number;
  description: string;
  auto_start_next: boolean;
  reminder_days: number;
  allow_peer_review: boolean;
  self_appraisal_mandatory: boolean;
  degree_360_feedback: boolean;
  status: string;
}

interface RatingScale {
  id?: number;
  name: string;
  description: string;
  min_rating: number;
  max_rating: number;
  ratings: { value: number; label: string; color: string }[];
}

interface CompetencyCategory {
  id?: number;
  name: string;
  description: string;
  weight: number;
  competencies: { name: string; description: string; weight: number; proficiency_levels: string[] }[];
}

interface GoalCategory {
  id?: number;
  name: string;
  description: string;
  kras: { title: string; description: string; weight: number; measurement_criteria: string; target_value: string }[];
}

interface FeedbackTemplate {
  id?: number;
  name: string;
  category: string;
  questions: string[];
}

interface FeedbackSettings {
  anonymous_feedback: boolean;
  min_feedback_count: number;
  feedback_weight: number;
  auto_remind: boolean;
  feedback_deadline_days: number;
  templates: FeedbackTemplate[];
}

interface PageState {
  name: string;
  description: string;
  status: string;
  effective_from: string;
  reviewCycles: ReviewCycle[];
  ratingScales: RatingScale[];
  competencyCategories: CompetencyCategory[];
  goalCategories: GoalCategory[];
  feedbackSettings: FeedbackSettings;
}

function defaultState(): PageState {
  return {
    name: '',
    description: '',
    status: 'active',
    effective_from: '',
    reviewCycles: [],
    ratingScales: [],
    competencyCategories: [],
    goalCategories: [],
    feedbackSettings: {
      anonymous_feedback: false,
      min_feedback_count: 3,
      feedback_weight: 20,
      auto_remind: true,
      feedback_deadline_days: 7,
      templates: [],
    },
  };
}

function defaultReviewCycle(): ReviewCycle {
  return {
    name: '', frequency: 'quarterly', start_month: 'jan', duration_days: 90,
    description: '', auto_start_next: true, reminder_days: 7,
    allow_peer_review: true, self_appraisal_mandatory: true, degree_360_feedback: false,
    status: 'active',
  };
}

function defaultRatingScale(): RatingScale {
  return { name: '', description: '', min_rating: 1, max_rating: 5, ratings: [] };
}

function defaultCompetencyCategory(): CompetencyCategory {
  return { name: '', description: '', weight: 0, competencies: [] };
}

function defaultGoalCategory(): GoalCategory {
  return { name: '', description: '', kras: [] };
}

function defaultFeedbackTemplate(): FeedbackTemplate {
  return { name: '', category: 'peer', questions: [''] };
}

// ── Small field components ──

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">{label}</label>
      {children}
      {help && <p className="mt-1 text-[11px] leading-snug text-[var(--text-tertiary)]">{help}</p>}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2] bg-white text-[var(--text-primary)]";

function TextInput({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return <input className={inputCls} disabled={disabled} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />;
}

function NumInput({ value, onChange, placeholder, disabled }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string; disabled?: boolean }) {
  return <input type="number" step="any" className={inputCls} disabled={disabled} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value === '' ? null : +e.target.value)} />;
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 bg-[var(--background)] hover:bg-[var(--hover-bg)]">
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[var(--primary-blue)]" />
          <span className="font-medium text-sm text-[var(--text-primary)]">{title}</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />}
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

// ── Wizard tabs ──

const WIZARD_TABS = [
  { id: 'overview', label: 'Overview', icon: Building2, color: 'text-blue-600' },
  { id: 'cycles', label: 'Review Cycles', icon: CalendarDays, color: 'text-emerald-600' },
  { id: 'ratings', label: 'Rating Scales', icon: Star, color: 'text-amber-600' },
  { id: 'competency', label: 'Competency Framework', icon: Layers, color: 'text-violet-600' },
  { id: 'goals', label: 'Goal & KRA Templates', icon: Target, color: 'text-indigo-600' },
  { id: 'feedback', label: 'Feedback Settings', icon: MessageSquare, color: 'text-rose-600' },
];

const WIZARD_HELP: Record<string, string> = {
  overview: 'Name, company and effective date for this performance configuration.',
  cycles: 'Set up how often reviews happen (quarterly, half-yearly, or annually). Define the review window, who gets reviewed, and whether self-assessment is required.',
  ratings: 'Create the rating scale your managers will use to score employees. Define each level with a name, numeric value, and color — e.g. 1 = Poor (Red), 5 = Exceptional (Blue).',
  competency: 'Define what skills and qualities you evaluate. Assign a weight (%) to each category so the final score reflects what matters most to your organization.',
  goals: 'Create goal categories and Key Result Areas (KRAs) that employees work toward. Each goal has a target and weight that feeds into the overall performance score.',
  feedback: 'Configure how 360° feedback works — who gives it, whether it\'s anonymous, how many responses are needed, and when feedback is due.',
};

// ── Main component ──

export default function PerformanceConfig() {
  const queryClient = useQueryClient();
  const [wizTab, setWizTab] = useState('overview');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<number | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  const [pageState, setPageState] = useState<PageState>(defaultState);

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => { try { const r = await api.get<Company[]>('/companies'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
    enabled: true,
  });

  const { data: configsList = [], isLoading: listLoading } = useQuery({
    queryKey: ['performance-configs', companyFilter],
    queryFn: async () => {
      try {
        const params = companyFilter === 'all' ? {} : { companyId: Number(companyFilter) };
        const r = await api.get<ConfigListItem | ConfigListItem[]>('/settings/configs/performance', { params });
        return Array.isArray(r.data) ? r.data : (r.data ? [r.data] : []);
      } catch { return []; }
    },
  });

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.name] as const));
    return (id: number | null | undefined) => (id == null ? 'All Companies' : m.get(id) || '—');
  }, [companies]);

  const saveMutation = useMutation({
    mutationFn: async (state: PageState) => {
      if (editingConfigId) {
        return api.put<SaveResponse>(`/settings/configs/performance/${editingConfigId}`, state, { params: companyId ? { companyId } : {} });
      }
      return api.post<SaveResponse>('/settings/configs/performance', state, { params: companyId ? { companyId } : {} });
    },
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Performance configuration saved');
      queryClient.invalidateQueries({ queryKey: ['performance-config'] });
      queryClient.invalidateQueries({ queryKey: ['performance-configs'] });
      setShowWizard(false);
      setEditingConfigId(null);
      setReadOnly(false);
      setWizTab('overview');
    },
    onError: (err: unknown) => toast.error(errMsg(err, 'Failed to save configuration')),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, type }: { id: number; type: string }) =>
      api.delete<SaveResponse>(`/settings/configs/performance/${id}`, { data: { type } }),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['performance-config'] });
      queryClient.invalidateQueries({ queryKey: ['performance-configs'] });
    },
    onError: (err: unknown) => toast.error(errMsg(err, 'Failed to delete')),
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/settings/configs/performance/${id}`),
    onSuccess: () => {
      toast.success('Configuration deleted');
      queryClient.invalidateQueries({ queryKey: ['performance-configs'] });
    },
    onError: (err: unknown) => toast.error(errMsg(err, 'Failed to delete')),
  });

  const setS = (patch: Partial<PageState>) => setPageState(prev => ({ ...prev, ...patch }));

  // ── Review cycle helpers ──

  const setCycle = (i: number, patch: Partial<ReviewCycle>) => {
    const next = pageState.reviewCycles.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    setS({ reviewCycles: next });
  };
  const addCycle = () => setS({ reviewCycles: [...pageState.reviewCycles, defaultReviewCycle()] });
  const removeCycle = (i: number) => setS({ reviewCycles: pageState.reviewCycles.filter((_, idx) => idx !== i) });

  // ── Rating scale helpers ──

  const setScale = (i: number, patch: Partial<RatingScale>) => {
    const next = pageState.ratingScales.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    setS({ ratingScales: next });
  };
  const addScale = () => setS({ ratingScales: [...pageState.ratingScales, defaultRatingScale()] });
  const removeScale = (i: number) => setS({ ratingScales: pageState.ratingScales.filter((_, idx) => idx !== i) });

  const setRatingRow = (scaleIdx: number, ratingIdx: number, patch: Partial<{ value: number; label: string; color: string }>) => {
    const next = pageState.ratingScales[scaleIdx].ratings.map((r, idx) => (idx === ratingIdx ? { ...r, ...patch } : r));
    setScale(scaleIdx, { ratings: next });
  };
  const addRatingRow = (scaleIdx: number) => {
    const scale = pageState.ratingScales[scaleIdx];
    const newIdx = scale.ratings.length;
    setScale(scaleIdx, { ratings: [...scale.ratings, { value: newIdx + 1, label: '', color: '#6B7280' }] });
  };
  const removeRatingRow = (scaleIdx: number, ratingIdx: number) => {
    const scale = pageState.ratingScales[scaleIdx];
    setScale(scaleIdx, { ratings: scale.ratings.filter((_, idx) => idx !== ratingIdx) });
  };

  // ── Competency helpers ──

  const setCategory = (i: number, patch: Partial<CompetencyCategory>) => {
    const next = pageState.competencyCategories.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    setS({ competencyCategories: next });
  };
  const addCategory = () => setS({ competencyCategories: [...pageState.competencyCategories, defaultCompetencyCategory()] });
  const removeCategory = (i: number) => setS({ competencyCategories: pageState.competencyCategories.filter((_, idx) => idx !== i) });

  const setCompetencyItem = (catIdx: number, itemIdx: number, patch: Partial<{ name: string; description: string; weight: number; proficiency_levels: string[] }>) => {
    const next = pageState.competencyCategories[catIdx].competencies.map((c, idx) => (idx === itemIdx ? { ...c, ...patch } : c));
    setCategory(catIdx, { competencies: next });
  };
  const addCompetencyItem = (catIdx: number) => {
    const cat = pageState.competencyCategories[catIdx];
    setCategory(catIdx, { competencies: [...cat.competencies, { name: '', description: '', weight: 0, proficiency_levels: ['Beginner', 'Intermediate', 'Advanced', 'Expert'] }] });
  };
  const removeCompetencyItem = (catIdx: number, itemIdx: number) => {
    const cat = pageState.competencyCategories[catIdx];
    setCategory(catIdx, { competencies: cat.competencies.filter((_, idx) => idx !== itemIdx) });
  };

  const totalCompetencyWeight = useMemo(
    () => (pageState.competencyCategories || []).reduce((s, c) => s + (c.weight || 0), 0),
    [pageState.competencyCategories]
  );

  // ── Goal helpers ──

  const setGoalCategory = (i: number, patch: Partial<GoalCategory>) => {
    const next = pageState.goalCategories.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    setS({ goalCategories: next });
  };
  const addGoalCategory = () => setS({ goalCategories: [...pageState.goalCategories, defaultGoalCategory()] });
  const removeGoalCategory = (i: number) => setS({ goalCategories: pageState.goalCategories.filter((_, idx) => idx !== i) });

  const setKra = (catIdx: number, kraIdx: number, patch: Partial<{ title: string; description: string; weight: number; measurement_criteria: string; target_value: string }>) => {
    const next = pageState.goalCategories[catIdx].kras.map((k, idx) => (idx === kraIdx ? { ...k, ...patch } : k));
    setGoalCategory(catIdx, { kras: next });
  };
  const addKra = (catIdx: number) => {
    const cat = pageState.goalCategories[catIdx];
    setGoalCategory(catIdx, { kras: [...cat.kras, { title: '', description: '', weight: 0, measurement_criteria: '', target_value: '' }] });
  };
  const removeKra = (catIdx: number, kraIdx: number) => {
    const cat = pageState.goalCategories[catIdx];
    setGoalCategory(catIdx, { kras: cat.kras.filter((_, idx) => idx !== kraIdx) });
  };

  const totalGoalWeight = useMemo(
    () => (pageState.goalCategories || []).reduce((s, c) => s + (c.kras || []).reduce((ks, k) => ks + (k.weight || 0), 0), 0),
    [pageState.goalCategories]
  );

  // ── Feedback helpers ──

  const setFeedback = (patch: Partial<FeedbackSettings>) => {
    setS({ feedbackSettings: { ...pageState.feedbackSettings, ...patch } });
  };
  const setTemplate = (i: number, patch: Partial<FeedbackTemplate>) => {
    const next = pageState.feedbackSettings.templates.map((t, idx) => (idx === i ? { ...t, ...patch } : t));
    setFeedback({ templates: next });
  };
  const addTemplate = () => setFeedback({ templates: [...pageState.feedbackSettings.templates, defaultFeedbackTemplate()] });
  const removeTemplate = (i: number) => setFeedback({ templates: pageState.feedbackSettings.templates.filter((_, idx) => idx !== i) });
  const setQuestion = (tmplIdx: number, qIdx: number, value: string) => {
    const next = pageState.feedbackSettings.templates[tmplIdx].questions.map((q, idx) => (idx === qIdx ? value : q));
    setTemplate(tmplIdx, { questions: next });
  };
  const addQuestion = (tmplIdx: number) => {
    const tmpl = pageState.feedbackSettings.templates[tmplIdx];
    setTemplate(tmplIdx, { questions: [...tmpl.questions, ''] });
  };
  const removeQuestion = (tmplIdx: number, qIdx: number) => {
    const tmpl = pageState.feedbackSettings.templates[tmplIdx];
    setTemplate(tmplIdx, { questions: tmpl.questions.filter((_, idx) => idx !== qIdx) });
  };

  const handleSaveAll = () => {
    if (!pageState.name.trim()) { toast.error('Configuration name is required'); return; }
    if (companyId == null) { toast.error('Pick the company this configuration belongs to'); return; }
    saveMutation.mutate(pageState);
  };

  const handleDelete = (id: number, type: string) => {
    if (id) {
      deleteMutation.mutate({ id, type });
    }
  };

  const closeWizard = () => {
    setShowWizard(false);
    setEditingConfigId(null);
    setReadOnly(false);
    setWizTab('overview');
  };

  const openCreate = () => {
    setEditingConfigId(null);
    setPageState(defaultState());
    setCompanyId(companyFilter === 'all' ? null : Number(companyFilter));
    setShowWizard(true);
    setWizTab('overview');
    setReadOnly(false);
  };

  const openFromConfig = (cfg: ConfigListItem, viewOnly: boolean) => {
    const d = cfg.data || cfg;
    setEditingConfigId(cfg.id);
    setPageState({
      ...defaultState(),
      ...d,
      status: cfg.status || d.status || 'active',
      effective_from: d.effective_from || '',
    });
    setCompanyId(cfg.company_id ?? null);
    setShowWizard(true);
    setWizTab('overview');
    setReadOnly(viewOnly);
  };

  // ── List View (default) ──
  if (!showWizard) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <SlidersHorizontal className="w-6 h-6 text-[var(--primary-blue)]" />
              Performance Configurations
            </h1>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              Review cycles, rating scales, competencies, goals and feedback settings.
            </p>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Create Configuration
          </button>
        </div>

        <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Configurations', value: configsList.length, icon: FileText },
            { label: 'Active', value: configsList.filter((c) => (c.status || 'active') === 'active').length, icon: CheckCircle2 },
            { label: 'Review cycles', value: configsList.reduce((s, c) => s + (((c.data || c) as Partial<PageState>).reviewCycles || []).length, 0), icon: CalendarDays },
            { label: 'Rating scales', value: configsList.reduce((s, c) => s + (((c.data || c) as Partial<PageState>).ratingScales || []).length, 0), icon: Star },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-[var(--border-color)] p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <s.icon className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <div className="text-lg font-bold text-[var(--text-primary)]">{s.value}</div>
                <div className="text-xs text-[var(--text-tertiary)]">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="w-64">
            <SearchableSelect value={companyFilter} onChange={(v) => setCompanyFilter(String(v))}
              options={[{ id: 'all', name: 'All Companies' }, ...companies.map((c) => ({ id: c.id, name: c.name }))]}
              placeholder="Filter by company" />
          </div>
        </div>

        {listLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--primary-blue)]" /></div>
        ) : configsList.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-tertiary)]">
            <SlidersHorizontal className="w-10 h-10 mx-auto mb-2 opacity-40" />
            No performance configurations yet — create the first one.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {configsList.map((cfg) => {
              const d: Partial<PageState> = cfg.data || cfg;
              return (
                <div key={cfg.id} className="bg-white rounded-2xl border border-[var(--border-color)] p-5 hover:shadow-md transition-shadow flex flex-col">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                        <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-[var(--text-primary)]">{d.name || cfg.name || 'Unnamed Config'}</h3>
                        <p className="text-xs text-[var(--text-tertiary)]">{companyName(cfg.company_id)}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${(cfg.status || 'active') === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                      {cfg.status || 'active'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mb-3">{d.description || cfg.description || 'No description'}</p>
                  <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)] mb-4">
                    <span>{(d.reviewCycles || []).length} cycles</span>
                    <span>{(d.ratingScales || []).length} scales</span>
                    <span>{(d.competencyCategories || []).length} competencies</span>
                    <span>{(d.goalCategories || []).length} goals</span>
                  </div>
                  <div className="mt-auto flex items-center gap-2">
                    <button onClick={() => openFromConfig(cfg, true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-color)] hover:bg-gray-50">
                      <FileText className="w-3.5 h-3.5" /> View
                    </button>
                    <button onClick={() => openFromConfig(cfg, false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-color)] hover:bg-gray-50">
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => { if (confirm('Delete this configuration?')) { deleteConfigMutation.mutate(cfg.id); } }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const accent = '#1C64F2';
  const done = [
    !!(pageState.name.trim() && companyId != null),
    pageState.reviewCycles.length > 0,
    pageState.ratingScales.length > 0,
    pageState.competencyCategories.length > 0,
    pageState.goalCategories.length > 0,
    true,
  ].filter(Boolean).length;
  const progress = Math.min(100, Math.round((done / WIZARD_TABS.length) * 100));

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/50" onClick={closeWizard} />
      <div className="fixed inset-0 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}>
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A] leading-tight">
                {readOnly ? 'Performance Configuration' : editingConfigId ? 'Edit Performance Configuration' : 'Create Performance Configuration'}
              </h2>
              <p className="text-xs text-[#64748B]">Review cycles, ratings, competencies, goals and feedback.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={closeWizard} className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Close</button>
            {!readOnly && (
              <button onClick={handleSaveAll} disabled={saveMutation.isPending || !pageState.name.trim()}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700 disabled:opacity-50">
                {saveMutation.isPending ? 'Saving...' : editingConfigId ? 'Save Changes' : 'Create Configuration'}
              </button>
            )}
          </div>
        </header>

        {/* Progress bar */}
        <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${accent}88, ${accent})` }} />
            </div>
            <span className="text-xs font-semibold whitespace-nowrap" style={{ color: accent }}>{progress}% complete</span>
          </div>
          <p className="text-[11px] text-[#B45309] mt-1.5">
            Navigate through sections to fill in configuration details. Fields marked with <span className="font-semibold text-[#DC2626]">*</span>
            are mandatory. Click {editingConfigId ? 'Save Changes' : 'Create Configuration'} in the header to save.
          </p>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex-1 flex min-h-0">
          {/* Sidebar */}
          <aside className="w-64 shrink-0 border-r border-[var(--border-color)] bg-[#F8FAFC] overflow-y-auto">
            <div className="py-2 px-3">
              <p className="pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">Sections</p>
              <nav className="space-y-0.5">
                {WIZARD_TABS.map((t) => {
                  const active = t.id === wizTab;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setWizTab(t.id)}
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
            <div key={wizTab} className="section-fade-in">
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${accent}14` }}>
                  {(() => { const t = WIZARD_TABS.find(x => x.id === wizTab); const Icon = t?.icon || Building2; return <Icon className={`w-5 h-5 ${t?.color || ''}`} />; })()}
                </span>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-[#0F172A] leading-tight">{WIZARD_TABS.find(x => x.id === wizTab)?.label || ''}</h3>
                  <p className="text-xs text-[#64748B]">{WIZARD_HELP[wizTab] || ''}</p>
                </div>
              </div>
              <div className="space-y-4">

                {/* ═══════════════════ OVERVIEW ═══════════════════ */}
                {wizTab === 'overview' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <Field label="Configuration Name *" help="A friendly name so you can identify this configuration.">
                      <input className={inputCls} disabled={readOnly} value={pageState.name} placeholder="e.g. Standard Review Policy" onChange={e => setS({ name: e.target.value })} />
                    </Field>
                    <Field label="Company *" help="Only employees of this company use this configuration.">
                      <SearchableSelect value={companyId ?? ''} onChange={v => setCompanyId(v === '' ? null : Number(v))}
                        options={companies.map((c) => ({ id: c.id, name: c.name }))} placeholder="Select company" disabled={readOnly} />
                    </Field>
                    <Field label="Effective From" help="Rules apply from this date. Earlier review periods keep the old rules.">
                      <input type="date" className={inputCls} disabled={readOnly} value={pageState.effective_from} onChange={e => setS({ effective_from: e.target.value })} />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Description" help="Who this configuration is for and what it covers.">
                        <input className={inputCls} disabled={readOnly} value={pageState.description} placeholder="Optional description" onChange={e => setS({ description: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="Status" help="Inactive configurations stay visible for history but won't be picked for new reviews.">
                      <ToggleSwitch checked={pageState.status === 'active'} onChange={v => setS({ status: v ? 'active' : 'inactive' })} disabled={readOnly} align="left" />
                    </Field>
                  </div>
                )}

                {/* ═══════════════════ Review Cycles ═══════════════════ */}
                {wizTab === 'cycles' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[var(--text-tertiary)]">Configure review cycles that drive your performance management process.</p>
                      {!readOnly && (
                        <button onClick={addCycle} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-[#1C64F2] hover:bg-blue-100">
                          <Plus className="w-4 h-4" /> Add Review Cycle
                        </button>
                      )}
                    </div>
                    {pageState.reviewCycles.length === 0 ? (
                      <p className="text-sm text-[var(--text-disabled)] text-center py-10 bg-gray-50 rounded-xl border border-[var(--border-color)]">No review cycles configured. Click "Add Review Cycle" above.</p>
                    ) : (
                      pageState.reviewCycles.map((cycle, i) => (
                        <div key={i} className="border border-[var(--border-color)] rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 bg-[var(--background)]">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="w-4 h-4 text-[var(--primary-blue)]" />
                              <span className="font-medium text-sm text-[var(--text-primary)]">{cycle.name || `Review Cycle ${i + 1}`}</span>
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cycle.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{cycle.status}</span>
                            </div>
                            {!readOnly && (
                              <button onClick={() => { removeCycle(i); handleDelete(cycle.id!, 'reviewCycle'); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                            )}
                          </div>
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <Field label="Cycle name" help="Give this cycle a clear name so managers know which review period it covers.">
                                <TextInput disabled={readOnly} value={cycle.name} onChange={v => setCycle(i, { name: v })} placeholder="e.g. Q1 2026 Review" />
                              </Field>
                              <Field label="Frequency" help="How often reviews happen — quarterly means every 3 months, half-yearly every 6 months.">
                                <SearchableSelect disabled={readOnly} value={cycle.frequency} onChange={v => setCycle(i, { frequency: String(v) })} placeholder="Select frequency" options={FREQUENCIES} showAllOption={false} />
                              </Field>
                              <Field label="Start month" help="The month when this review cycle begins each year.">
                                <SearchableSelect disabled={readOnly} value={cycle.start_month} onChange={v => setCycle(i, { start_month: String(v) })} placeholder="Select month" options={MONTHS} showAllOption={false} />
                              </Field>
                              <Field label="Duration (days)" help="How long the review window stays open for employees and managers to complete their assessments.">
                                <NumInput disabled={readOnly} value={cycle.duration_days} onChange={v => setCycle(i, { duration_days: v ?? 90 })} />
                              </Field>
                              <div className="md:col-span-2">
                                <Field label="Description" help="Optional note about what this cycle covers — helps managers understand the scope.">
                                  <TextInput disabled={readOnly} value={cycle.description} onChange={v => setCycle(i, { description: v })} placeholder="Brief description" />
                                </Field>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[var(--border-color)] pt-3">
                              <Field label="Auto-start next cycle" help="When this cycle ends, automatically open the next one — no manual setup needed.">
                                <ToggleSwitch checked={cycle.auto_start_next} onChange={v => setCycle(i, { auto_start_next: v })} disabled={readOnly} align="left" />
                              </Field>
                              <Field label="Allow peer review" help="Let employees request feedback from colleagues they work with closely.">
                                <ToggleSwitch checked={cycle.allow_peer_review} onChange={v => setCycle(i, { allow_peer_review: v })} disabled={readOnly} align="left" />
                              </Field>
                              <Field label="Self-appraisal mandatory" help="Employees must complete their self-assessment before the manager can submit their review.">
                                <ToggleSwitch checked={cycle.self_appraisal_mandatory} onChange={v => setCycle(i, { self_appraisal_mandatory: v })} disabled={readOnly} align="left" />
                              </Field>
                              <Field label="360-degree feedback" help="Collect feedback from peers, direct reports, and stakeholders — not just the manager.">
                                <ToggleSwitch checked={cycle.degree_360_feedback} onChange={v => setCycle(i, { degree_360_feedback: v })} disabled={readOnly} align="left" />
                              </Field>
                            </div>
                            <Field label="Reminder days before" help="How many days before the deadline to send email reminders to pending reviewers.">
                              <div className="w-48"><NumInput disabled={readOnly} value={cycle.reminder_days} onChange={v => setCycle(i, { reminder_days: v ?? 7 })} placeholder="7" /></div>
                            </Field>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ═══════════════════ Rating Scales ═══════════════════ */}
                {wizTab === 'ratings' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[var(--text-tertiary)]">Define rating scales used across performance reviews.</p>
                      {!readOnly && (
                        <button onClick={addScale} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-[#1C64F2] hover:bg-blue-100">
                          <Plus className="w-4 h-4" /> Add Rating Scale
                        </button>
                      )}
                    </div>
                    {pageState.ratingScales.length === 0 ? (
                      <p className="text-sm text-[var(--text-disabled)] text-center py-10 bg-gray-50 rounded-xl border border-[var(--border-color)]">No rating scales configured. Click "Add Rating Scale" above.</p>
                    ) : (
                      pageState.ratingScales.map((scale, i) => (
                        <div key={i} className="border border-[var(--border-color)] rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 bg-[var(--background)]">
                            <div className="flex items-center gap-2">
                              <Star className="w-4 h-4 text-amber-500" />
                              <span className="font-medium text-sm text-[var(--text-primary)]">{scale.name || `Rating Scale ${i + 1}`}</span>
                            </div>
                            {!readOnly && (
                              <button onClick={() => { removeScale(i); handleDelete(scale.id!, 'ratingScale'); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                            )}
                          </div>
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <Field label="Scale name" help="Give this rating scale a name so you can reuse it across review cycles.">
                                <TextInput disabled={readOnly} value={scale.name} onChange={v => setScale(i, { name: v })} placeholder="e.g. Standard 1-5" />
                              </Field>
                              <Field label="Description" help="Explain when this scale should be used — helps managers pick the right one.">
                                <TextInput disabled={readOnly} value={scale.description} onChange={v => setScale(i, { description: v })} placeholder="Description" />
                              </Field>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-[var(--text-tertiary)]">Rating values</span>
                                {!readOnly && (
                                  <button onClick={() => addRatingRow(i)} className="flex items-center gap-1 text-xs font-medium text-[#1C64F2] hover:text-blue-700">
                                    <Plus className="w-3 h-3" /> Add row
                                  </button>
                                )}
                              </div>
                              {scale.ratings.map((rating, ri) => (
                                <div key={ri} className="flex items-center gap-3">
                                  <div className="w-16">
                                    <input type="number" disabled={readOnly} className="w-full px-2 py-1.5 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" value={rating.value} onChange={e => setRatingRow(i, ri, { value: +e.target.value })} />
                                  </div>
                                  <input disabled={readOnly} className="flex-1 px-2 py-1.5 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" value={rating.label} placeholder="Label" onChange={e => setRatingRow(i, ri, { label: e.target.value })} />
                                  <input type="color" disabled={readOnly} className="w-8 h-8 rounded-lg border border-[var(--border-color)] cursor-pointer" value={rating.color} onChange={e => setRatingRow(i, ri, { color: e.target.value })} />
                                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: rating.color }} />
                                  {!readOnly && (
                                    <button onClick={() => removeRatingRow(i, ri)} className="p-1 rounded hover:bg-red-50"><Trash2 className="w-3 h-3 text-red-400" /></button>
                                  )}
                                </div>
                              ))}
                            </div>
                            {/* Color-coded preview */}
                            <div className="flex items-center gap-1 pt-2 border-t border-[var(--border-color)]">
                              {scale.ratings.map((r, ri) => (
                                <div key={ri} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium" style={{ background: `${r.color}18`, color: r.color }}>
                                  {r.value} = {r.label}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ═══════════════════ Competency Framework ═══════════════════ */}
                {wizTab === 'competency' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[var(--text-tertiary)]">Build competency categories and items for performance evaluation.</p>
                      {!readOnly && (
                        <button onClick={addCategory} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-[#1C64F2] hover:bg-blue-100">
                          <Plus className="w-4 h-4" /> Add Category
                        </button>
                      )}
                    </div>

                    {/* Weight distribution bar */}
                    <SectionCard title="Weight Distribution" icon={BarChart3}>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden flex">
                            {pageState.competencyCategories.map((cat, i) => (
                              <div key={i} className="h-full transition-all" style={{ width: `${totalCompetencyWeight > 0 ? (cat.weight / totalCompetencyWeight) * 100 : 0}%`, background: ['#1C64F2', '#3B82F6', '#22C55E', '#F97316', '#EF4444', '#EC4899'][i % 6] }} />
                            ))}
                          </div>
                          <span className={`text-sm font-semibold shrink-0 ${totalCompetencyWeight === 100 ? 'text-emerald-600' : totalCompetencyWeight > 100 ? 'text-red-600' : 'text-amber-600'}`}>
                            {totalCompetencyWeight}%
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {pageState.competencyCategories.map((cat, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ background: ['#1C64F2', '#3B82F6', '#22C55E', '#F97316', '#EF4444', '#EC4899'][i % 6] }} />
                              {cat.name || `Category ${i + 1}`}: {cat.weight}%
                            </div>
                          ))}
                        </div>
                        {totalCompetencyWeight !== 100 && (
                          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            Total weight should be 100%. Currently {totalCompetencyWeight}%.
                          </p>
                        )}
                      </div>
                    </SectionCard>

                    {pageState.competencyCategories.length === 0 ? (
                      <p className="text-sm text-[var(--text-disabled)] text-center py-10 bg-gray-50 rounded-xl border border-[var(--border-color)]">No competency categories configured.</p>
                    ) : (
                      pageState.competencyCategories.map((cat, i) => (
                        <div key={i} className="border border-[var(--border-color)] rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 bg-[var(--background)]">
                            <div className="flex items-center gap-2">
                              <Layers className="w-4 h-4 text-violet-500" />
                              <span className="font-medium text-sm text-[var(--text-primary)]">{cat.name || `Category ${i + 1}`}</span>
                              <span className="text-xs text-[var(--text-tertiary)]">({cat.weight}%)</span>
                            </div>
                            {!readOnly && (
                              <button onClick={() => { removeCategory(i); handleDelete(cat.id!, 'competencyCategory'); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                            )}
                          </div>
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <Field label="Category name" help="Name the skill area — e.g. Technical, Leadership, Communication.">
                                <TextInput disabled={readOnly} value={cat.name} onChange={v => setCategory(i, { name: v })} placeholder="e.g. Technical" />
                              </Field>
                              <Field label="Description" help="What this category evaluates — helps managers understand what to rate.">
                                <TextInput disabled={readOnly} value={cat.description} onChange={v => setCategory(i, { description: v })} placeholder="Description" />
                              </Field>
                              <Field label="Weight (%)" help="How much this category affects the final score. All categories should add up to 100%.">
                                <NumInput disabled={readOnly} value={cat.weight} onChange={v => setCategory(i, { weight: v ?? 0 })} />
                              </Field>
                            </div>
                            {/* Competency items */}
                            <div className="border-t border-[var(--border-color)] pt-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-[var(--text-tertiary)]">Competency items ({cat.competencies.length})</span>
                                {!readOnly && (
                                  <button onClick={() => addCompetencyItem(i)} className="flex items-center gap-1 text-xs font-medium text-[#1C64F2] hover:text-blue-700">
                                    <Plus className="w-3 h-3" /> Add item
                                  </button>
                                )}
                              </div>
                              {cat.competencies.length === 0 ? (
                                <p className="text-xs text-[var(--text-disabled)] text-center py-4">No competency items. Add one above.</p>
                              ) : (
                                <div className="space-y-2">
                                  {cat.competencies.map((comp, ci) => (
                                    <div key={ci} className="border border-[var(--border-color)] rounded-lg p-3 space-y-2">
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <Field label="Name">
                                          <TextInput disabled={readOnly} value={comp.name} onChange={v => setCompetencyItem(i, ci, { name: v })} placeholder="Competency name" />
                                        </Field>
                                        <Field label="Description">
                                          <TextInput disabled={readOnly} value={comp.description} onChange={v => setCompetencyItem(i, ci, { description: v })} placeholder="Description" />
                                        </Field>
                                        <Field label="Weight">
                                          <NumInput disabled={readOnly} value={comp.weight} onChange={v => setCompetencyItem(i, ci, { weight: v ?? 0 })} />
                                        </Field>
                                      </div>
                                      <Field label="Proficiency levels (comma-separated)">
                                        <TextInput disabled={readOnly} value={comp.proficiency_levels.join(', ')} onChange={v => setCompetencyItem(i, ci, { proficiency_levels: v.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="Beginner, Intermediate, Advanced, Expert" />
                                      </Field>
                                      {!readOnly && (
                                        <div className="flex justify-end">
                                          <button onClick={() => removeCompetencyItem(i, ci)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ═══════════════════ Goal & KRA Templates ═══════════════════ */}
                {wizTab === 'goals' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[var(--text-tertiary)]">Define goal categories and KRA templates with weight allocation.</p>
                      {!readOnly && (
                        <button onClick={addGoalCategory} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-[#1C64F2] hover:bg-blue-100">
                          <Plus className="w-4 h-4" /> Add Goal Category
                        </button>
                      )}
                    </div>

                    {/* Weight allocation tracker */}
                    <SectionCard title="Weight Allocation Tracker" icon={Target}>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden flex">
                            {pageState.goalCategories.map((cat, ci) => (
                              cat.kras.map((kra, ki) => (
                                <div key={`${ci}-${ki}`} className="h-full transition-all" style={{ width: `${totalGoalWeight > 0 ? (kra.weight / totalGoalWeight) * 100 : 0}%`, background: ['#1C64F2', '#3B82F6', '#22C55E', '#F97316', '#EF4444', '#EC4899'][(ci + ki) % 6] }} />
                              ))
                            ))}
                          </div>
                          <span className={`text-sm font-semibold shrink-0 ${totalGoalWeight === 100 ? 'text-emerald-600' : totalGoalWeight > 100 ? 'text-red-600' : 'text-amber-600'}`}>
                            {totalGoalWeight}%
                          </span>
                        </div>
                        {totalGoalWeight !== 100 && (
                          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            Total KRA weight should be 100%. Currently {totalGoalWeight}%.
                          </p>
                        )}
                      </div>
                    </SectionCard>

                    {pageState.goalCategories.length === 0 ? (
                      <p className="text-sm text-[var(--text-disabled)] text-center py-10 bg-gray-50 rounded-xl border border-[var(--border-color)]">No goal categories configured.</p>
                    ) : (
                      pageState.goalCategories.map((cat, i) => (
                        <div key={i} className="border border-[var(--border-color)] rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 bg-[var(--background)]">
                            <div className="flex items-center gap-2">
                              <Target className="w-4 h-4 text-indigo-500" />
                              <span className="font-medium text-sm text-[var(--text-primary)]">{cat.name || `Goal Category ${i + 1}`}</span>
                              <span className="text-xs text-[var(--text-tertiary)]">({cat.kras.length} KRAs)</span>
                            </div>
                            {!readOnly && (
                              <button onClick={() => { removeGoalCategory(i); handleDelete(cat.id!, 'goalCategory'); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                            )}
                          </div>
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <Field label="Category name" help="Name the goal area — e.g. Revenue Growth, Customer Satisfaction, Innovation.">
                                <TextInput disabled={readOnly} value={cat.name} onChange={v => setGoalCategory(i, { name: v })} placeholder="e.g. Revenue Growth" />
                              </Field>
                              <Field label="Description" help="What this goal category covers — helps employees understand the focus area.">
                                <TextInput disabled={readOnly} value={cat.description} onChange={v => setGoalCategory(i, { description: v })} placeholder="Description" />
                              </Field>
                            </div>
                            {/* KRA templates */}
                            <div className="border-t border-[var(--border-color)] pt-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-[var(--text-tertiary)]">KRA Templates ({cat.kras.length})</span>
                                {!readOnly && (
                                  <button onClick={() => addKra(i)} className="flex items-center gap-1 text-xs font-medium text-[#1C64F2] hover:text-blue-700">
                                    <Plus className="w-3 h-3" /> Add KRA
                                  </button>
                                )}
                              </div>
                              {cat.kras.length === 0 ? (
                                <p className="text-xs text-[var(--text-disabled)] text-center py-4">No KRAs. Add one above.</p>
                              ) : (
                                <div className="space-y-2">
                                  {cat.kras.map((kra, ki) => (
                                    <div key={ki} className="border border-[var(--border-color)] rounded-lg p-3 space-y-2">
                                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                        <Field label="Title">
                                          <TextInput disabled={readOnly} value={kra.title} onChange={v => setKra(i, ki, { title: v })} placeholder="KRA title" />
                                        </Field>
                                        <Field label="Weight (%)">
                                          <NumInput disabled={readOnly} value={kra.weight} onChange={v => setKra(i, ki, { weight: v ?? 0 })} />
                                        </Field>
                                        <Field label="Target value">
                                          <TextInput disabled={readOnly} value={kra.target_value} onChange={v => setKra(i, ki, { target_value: v })} placeholder="e.g. 95%" />
                                        </Field>
                                        <Field label="Measurement criteria">
                                          <TextInput disabled={readOnly} value={kra.measurement_criteria} onChange={v => setKra(i, ki, { measurement_criteria: v })} placeholder="How to measure" />
                                        </Field>
                                      </div>
                                      <Field label="Description">
                                        <TextInput disabled={readOnly} value={kra.description} onChange={v => setKra(i, ki, { description: v })} placeholder="Detailed description" />
                                      </Field>
                                      {!readOnly && (
                                        <div className="flex justify-end">
                                          <button onClick={() => removeKra(i, ki)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ═══════════════════ Feedback Settings ═══════════════════ */}
                {wizTab === 'feedback' && (
                  <div className="space-y-4">
                    <SectionCard title="Feedback Preferences" icon={MessageSquare}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Minimum feedback count" help="How many feedback responses must be collected before a review can be marked complete.">
                          <div className="w-48"><NumInput disabled={readOnly} value={pageState.feedbackSettings.min_feedback_count} onChange={v => setFeedback({ min_feedback_count: v ?? 3 })} /></div>
                        </Field>
                        <Field label="Feedback weight in final rating (%)" help="What percentage of the overall performance score comes from peer/360° feedback vs manager assessment.">
                          <div className="w-48"><NumInput disabled={readOnly} value={pageState.feedbackSettings.feedback_weight} onChange={v => setFeedback({ feedback_weight: v ?? 20 })} /></div>
                        </Field>
                        <Field label="Feedback deadline (days)" help="How many days after the review starts to collect feedback before the window closes.">
                          <div className="w-48"><NumInput disabled={readOnly} value={pageState.feedbackSettings.feedback_deadline_days} onChange={v => setFeedback({ feedback_deadline_days: v ?? 7 })} /></div>
                        </Field>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[var(--border-color)] pt-3">
                        <Field label="Anonymous feedback" help="Hide the reviewer's name so feedback is honest and unbiased.">
                          <ToggleSwitch checked={pageState.feedbackSettings.anonymous_feedback} onChange={v => setFeedback({ anonymous_feedback: v })} disabled={readOnly} align="left" />
                        </Field>
                        <Field label="Auto-remind non-respondents" help="Send email reminders to people who haven't submitted their feedback yet.">
                          <ToggleSwitch checked={pageState.feedbackSettings.auto_remind} onChange={v => setFeedback({ auto_remind: v })} disabled={readOnly} align="left" />
                        </Field>
                      </div>
                    </SectionCard>

                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[var(--text-tertiary)]">Create feedback templates with category-specific questions.</p>
                      {!readOnly && (
                        <button onClick={addTemplate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-[#1C64F2] hover:bg-blue-100">
                          <Plus className="w-4 h-4" /> Add Feedback Template
                        </button>
                      )}
                    </div>

                    {pageState.feedbackSettings.templates.length === 0 ? (
                      <p className="text-sm text-[var(--text-disabled)] text-center py-10 bg-gray-50 rounded-xl border border-[var(--border-color)]">No feedback templates configured.</p>
                    ) : (
                      pageState.feedbackSettings.templates.map((tmpl, i) => (
                        <div key={i} className="border border-[var(--border-color)] rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 bg-[var(--background)]">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-rose-500" />
                              <span className="font-medium text-sm text-[var(--text-primary)]">{tmpl.name || `Template ${i + 1}`}</span>
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-[#1C64F2]">{tmpl.category}</span>
                            </div>
                            {!readOnly && (
                              <button onClick={() => { removeTemplate(i); handleDelete(tmpl.id!, 'feedbackTemplate'); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                            )}
                          </div>
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <Field label="Template name" help="Give this feedback template a name — e.g. 'Peer Feedback Q1' or 'Manager Self-Assessment'.">
                                <TextInput disabled={readOnly} value={tmpl.name} onChange={v => setTemplate(i, { name: v })} placeholder="e.g. Peer Feedback Q1" />
                              </Field>
                              <Field label="Category" help="Who gives this feedback — peer (colleague), self, manager, or subordinate.">
                                <SearchableSelect disabled={readOnly} value={tmpl.category} onChange={v => setTemplate(i, { category: String(v) })} placeholder="Select category" options={FEEDBACK_CATEGORIES} showAllOption={false} />
                              </Field>
                            </div>
                            <div className="border-t border-[var(--border-color)] pt-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-[var(--text-tertiary)]">Questions ({tmpl.questions.length})</span>
                                {!readOnly && (
                                  <button onClick={() => addQuestion(i)} className="flex items-center gap-1 text-xs font-medium text-[#1C64F2] hover:text-blue-700">
                                    <Plus className="w-3 h-3" /> Add question
                                  </button>
                                )}
                              </div>
                              {tmpl.questions.map((q, qi) => (
                                <div key={qi} className="flex items-center gap-2 mb-2">
                                  <span className="text-xs text-[var(--text-tertiary)] w-6 shrink-0">{qi + 1}.</span>
                                  <input disabled={readOnly} className="flex-1 px-2 py-1.5 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" value={q} placeholder="Enter question text" onChange={e => setQuestion(i, qi, e.target.value)} />
                                  {!readOnly && (
                                    <button onClick={() => removeQuestion(i, qi)} className="p-1 rounded hover:bg-red-50"><Trash2 className="w-3 h-3 text-red-400" /></button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
