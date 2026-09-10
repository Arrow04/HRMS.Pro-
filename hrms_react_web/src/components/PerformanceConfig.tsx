import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus, Pencil, Trash2, Loader2, X, SlidersHorizontal, Target, Award, Star,
  BookOpen, MessageSquare, ChevronDown, ChevronUp, CheckCircle2, Save,
  CalendarDays, BarChart3, Layers, FileText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

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

const RATING_TEMPLATES: Record<string, { label: string; ratings: { value: number; label: string; color: string }[] }> = {
  '1-5': { label: '1-5 Numeric', ratings: [
    { value: 1, label: 'Poor', color: '#EF4444' },
    { value: 2, label: 'Needs Improvement', color: '#F97316' },
    { value: 3, label: 'Meets Expectations', color: '#EAB308' },
    { value: 4, label: 'Exceeds Expectations', color: '#22C55E' },
    { value: 5, label: 'Exceptional', color: '#3B82F6' },
  ]},
  'a-f': { label: 'A-F Grade', ratings: [
    { value: 1, label: 'F - Unsatisfactory', color: '#EF4444' },
    { value: 2, label: 'D - Below Expectations', color: '#F97316' },
    { value: 3, label: 'C - Meets Expectations', color: '#EAB308' },
    { value: 4, label: 'B - Exceeds Expectations', color: '#22C55E' },
    { value: 5, label: 'A - Exceptional', color: '#3B82F6' },
  ]},
  'cn': { label: '中文评级', ratings: [
    { value: 1, label: '不合格', color: '#EF4444' },
    { value: 2, label: '合格', color: '#F97316' },
    { value: 3, label: '良好', color: '#EAB308' },
    { value: 4, label: '优秀', color: '#22C55E' },
    { value: 5, label: '卓越', color: '#3B82F6' },
  ]},
};

const COMPETENCY_TEMPLATES = [
  { name: 'Technical', description: 'Domain-specific skills and knowledge', weight: 40 },
  { name: 'Leadership', description: 'Ability to guide and inspire teams', weight: 25 },
  { name: 'Communication', description: 'Verbal and written communication skills', weight: 20 },
  { name: 'Teamwork', description: 'Collaboration and team contribution', weight: 15 },
];

const GOAL_TEMPLATES = [
  { name: 'Revenue Growth', description: 'Financial performance and business growth targets' },
  { name: 'Customer Satisfaction', description: 'Customer experience and satisfaction metrics' },
  { name: 'Project Delivery', description: 'Project milestones and delivery timelines' },
  { name: 'Innovation', description: 'New ideas, process improvements, and creative solutions' },
];

interface PerformanceConfigProps {
  open: boolean;
  onClose: () => void;
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
  reviewCycles: ReviewCycle[];
  ratingScales: RatingScale[];
  competencyCategories: CompetencyCategory[];
  goalCategories: GoalCategory[];
  feedbackSettings: FeedbackSettings;
}

function defaultState(): PageState {
  return {
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
  return { name: '', description: '', min_rating: 1, max_rating: 5, ratings: RATING_TEMPLATES['1-5'].ratings.map(r => ({ ...r })) };
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

const inputCls = "w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#8B5CF6]";

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className={inputCls} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />;
}

function NumInput({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return <input type="number" step="any" className={inputCls} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value === '' ? null : +e.target.value)} />;
}

function Toggle({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        onClick={() => onChange(!checked)}
        title={help}
        className={`relative w-12 h-7 rounded-full transition-all duration-300 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6]/40 focus-visible:ring-offset-2 cursor-pointer group ${
          checked
            ? 'bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] shadow-[0_2px_8px_-1px_rgba(139,92,246,0.5)]'
            : 'bg-gradient-to-r from-[#EF4444] to-[#DC2626] shadow-[0_2px_8px_-1px_rgba(220,38,38,0.5)] hover:brightness-95'
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ease-out ${
            checked ? 'translate-x-5 group-active:scale-95' : 'group-active:scale-90'
          }`}
        />
      </button>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-[var(--text-secondary)] leading-tight">{label}</span>
        {help && <span className="text-[11px] leading-snug text-[var(--text-tertiary)]">{help}</span>}
      </div>
    </div>
  );
}

function WizardSectionCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 bg-[var(--background)] hover:bg-[var(--hover-bg)]">
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[#8B5CF6]" />
          <span className="font-medium text-sm text-[var(--text-primary)]">{title}</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />}
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

function StatBox({ label, value, icon: Icon }: { label: string; value: number | string; icon: LucideIcon }) {
  return (
    <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
        <Icon className="w-4 h-4 text-[#8B5CF6]" />
      </div>
      <div>
        <div className="text-xl font-bold text-[var(--text-primary)]">{value}</div>
        <div className="text-xs text-[var(--text-tertiary)]">{label}</div>
      </div>
    </div>
  );
}

// ── Wizard tabs ──

const WIZARD_TABS = [
  { id: 'cycles', label: 'Review Cycles', icon: CalendarDays, color: 'text-purple-600' },
  { id: 'ratings', label: 'Rating Scales', icon: Star, color: 'text-amber-600' },
  { id: 'competency', label: 'Competency Framework', icon: Layers, color: 'text-emerald-600' },
  { id: 'goals', label: 'Goal & KRA Templates', icon: Target, color: 'text-blue-600' },
  { id: 'feedback', label: 'Feedback Settings', icon: MessageSquare, color: 'text-rose-600' },
];

const WIZARD_HELP: Record<string, string> = {
  cycles: 'Define performance review cycles, frequency, and review options.',
  ratings: 'Configure rating scales with labels, colors, and value ranges.',
  competency: 'Build competency categories with weighted proficiency levels.',
  goals: 'Create goal categories and KRA templates with weight allocation.',
  feedback: 'Set up feedback collection, anonymity, templates, and deadlines.',
};

// ── Main component ──

export default function PerformanceConfig({ open, onClose }: PerformanceConfigProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('cycles');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingType, setEditingType] = useState<string | null>(null);

  const [pageState, setPageState] = useState<PageState>(defaultState);

  const { data: configData, isLoading } = useQuery({
    queryKey: ['performance-config'],
    queryFn: async () => {
      try {
        const r = await api.get('/settings/configs/performance');
        return r.data || defaultState();
      } catch { return defaultState(); }
    },
    enabled: open,
  });

  useState(() => {
    if (configData) setPageState(configData);
  });

  const saveMutation = useMutation({
    mutationFn: async (state: PageState) => {
      if (editingId && editingType) {
        return api.put(`/settings/configs/performance/${editingId}`, { type: editingType, data: state });
      }
      return api.post('/settings/configs/performance', state);
    },
    onSuccess: (res: any) => {
      toast.success(res?.data?.message || 'Performance configuration saved');
      queryClient.invalidateQueries({ queryKey: ['performance-config'] });
      setEditingId(null);
      setEditingType(null);
    },
    onError: (err: unknown) => toast.error(errMsg(err, 'Failed to save configuration')),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, type }: { id: number; type: string }) =>
      api.delete(`/settings/configs/performance/${id}`, { data: { type } }),
    onSuccess: (res: any) => {
      toast.success(res?.data?.message || 'Deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['performance-config'] });
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
  const editCycle = (i: number) => { setEditingId(pageState.reviewCycles[i].id ?? null); setEditingType('reviewCycle'); };
  const saveCycle = (i: number) => {
    const c = pageState.reviewCycles[i];
    if (!c.name.trim()) { toast.error('Cycle name is required'); return; }
    saveMutation.mutate(pageState);
  };

  // ── Rating scale helpers ──

  const setScale = (i: number, patch: Partial<RatingScale>) => {
    const next = pageState.ratingScales.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    setS({ ratingScales: next });
  };
  const addScale = () => setS({ ratingScales: [...pageState.ratingScales, defaultRatingScale()] });
  const removeScale = (i: number) => setS({ ratingScales: pageState.ratingScales.filter((_, idx) => idx !== i) });
  const editScale = (i: number) => { setEditingId(pageState.ratingScales[i].id ?? null); setEditingType('ratingScale'); };
  const applyTemplate = (i: number, templateKey: string) => {
    const t = RATING_TEMPLATES[templateKey];
    if (t) setScale(i, { ratings: t.ratings.map(r => ({ ...r })), min_rating: 1, max_rating: t.ratings.length });
  };

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
  const editCategory = (i: number) => { setEditingId(pageState.competencyCategories[i].id ?? null); setEditingType('competencyCategory'); };

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
  const applyCompetencyTemplate = (i: number, templateName: string) => {
    const t = COMPETENCY_TEMPLATES.find(tp => tp.name === templateName);
    if (t) setCategory(i, { name: t.name, description: t.description, weight: t.weight });
  };

  const totalCompetencyWeight = useMemo(
    () => pageState.competencyCategories.reduce((s, c) => s + (c.weight || 0), 0),
    [pageState.competencyCategories]
  );

  // ── Goal helpers ──

  const setGoalCategory = (i: number, patch: Partial<GoalCategory>) => {
    const next = pageState.goalCategories.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    setS({ goalCategories: next });
  };
  const addGoalCategory = () => setS({ goalCategories: [...pageState.goalCategories, defaultGoalCategory()] });
  const removeGoalCategory = (i: number) => setS({ goalCategories: pageState.goalCategories.filter((_, idx) => idx !== i) });
  const editGoalCategory = (i: number) => { setEditingId(pageState.goalCategories[i].id ?? null); setEditingType('goalCategory'); };

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
  const applyGoalTemplate = (i: number, templateName: string) => {
    const t = GOAL_TEMPLATES.find(tp => tp.name === templateName);
    if (t) setGoalCategory(i, { name: t.name, description: t.description });
  };

  const totalGoalWeight = useMemo(
    () => pageState.goalCategories.reduce((s, c) => s + c.kras.reduce((ks, k) => ks + (k.weight || 0), 0), 0),
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
  const editTemplate = (i: number) => { setEditingId(pageState.feedbackSettings.templates[i].id ?? null); setEditingType('feedbackTemplate'); };
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

  const handleSaveAll = () => saveMutation.mutate(pageState);

  const handleDelete = (id: number, type: string) => {
    if (id) {
      deleteMutation.mutate({ id, type });
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm bg-gradient-to-br from-[#8B5CF6] to-[#8B5CF6bb]">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A] leading-tight">Configure Performance</h2>
              <p className="text-xs text-[#64748B]">Review cycles, rating scales, competencies, goals and feedback.</p>
            </div>
          </div>
          <button onClick={onClose} title="Close" className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* Sidebar */}
          <aside className="w-64 shrink-0 border-r border-[var(--border-color)] bg-[#F8FAFC] overflow-y-auto">
            <div className="py-2 px-3">
              <p className="pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">Sections</p>
              <nav className="space-y-0.5">
                {WIZARD_TABS.map((t) => {
                  const active = t.id === activeTab;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTab(t.id)}
                      className={`w-full flex items-center gap-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ease-out group ${
                        active
                          ? 'bg-gradient-to-r from-[#F5F3FF] to-[#F8FAFC] text-[#8B5CF6] shadow-sm'
                          : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 ease-out ${
                        active ? `${t.color}` : 'bg-white border border-[var(--border-color)]'
                      }`}
                        style={active ? { background: '#8B5CF614', boxShadow: '0 2px 6px #8B5CF622' } : undefined}>
                        <t.icon className={`w-4 h-4 transition-all duration-300 ${active ? t.color : 'text-[#64748B]'}`} />
                      </span>
                      <span className={`flex-1 truncate transition-colors duration-300 ${active ? 'font-semibold text-[#8B5CF6]' : 'font-medium'}`}>{t.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div key={activeTab} className="section-fade-in">
              {/* Section header */}
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#8B5CF614' }}>
                  {(() => { const t = WIZARD_TABS.find(x => x.id === activeTab); const Icon = t?.icon || SlidersHorizontal; return <Icon className={`w-5 h-5 ${t?.color || ''}`} />; })()}
                </span>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-[#0F172A] leading-tight">{WIZARD_TABS.find(x => x.id === activeTab)?.label || ''}</h3>
                  <p className="text-xs text-[#64748B]">{WIZARD_HELP[activeTab] || ''}</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* ═══════════════════ TAB 1: Review Cycles ═══════════════════ */}
                {activeTab === 'cycles' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[var(--text-tertiary)]">Configure review cycles that drive your performance management process.</p>
                      <button onClick={addCycle} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-50 text-[#8B5CF6] hover:bg-purple-100">
                        <Plus className="w-4 h-4" /> Add Review Cycle
                      </button>
                    </div>
                    {pageState.reviewCycles.length === 0 ? (
                      <p className="text-sm text-[var(--text-disabled)] text-center py-10 bg-gray-50 rounded-xl border border-[var(--border-color)]">No review cycles configured. Click "Add Review Cycle" above.</p>
                    ) : (
                      pageState.reviewCycles.map((cycle, i) => (
                        <div key={i} className="border border-[var(--border-color)] rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 bg-[var(--background)]">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="w-4 h-4 text-[#8B5CF6]" />
                              <span className="font-medium text-sm text-[var(--text-primary)]">{cycle.name || `Review Cycle ${i + 1}`}</span>
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cycle.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{cycle.status}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => editCycle(i)} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil className="w-3.5 h-3.5 text-[var(--text-tertiary)]" /></button>
                              <button onClick={() => { removeCycle(i); handleDelete(cycle.id!, 'reviewCycle'); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                            </div>
                          </div>
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <Field label="Cycle name" help="Text — e.g. 'Q1 2026 Review'.">
                                <TextInput value={cycle.name} onChange={v => setCycle(i, { name: v })} placeholder="e.g. Q1 2026 Review" />
                              </Field>
                              <Field label="Frequency" help="How often reviews occur.">
                                <SearchableSelect value={cycle.frequency} onChange={v => setCycle(i, { frequency: String(v) })} placeholder="Select frequency" options={FREQUENCIES} showAllOption={false} />
                              </Field>
                              <Field label="Start month" help="Month the cycle begins.">
                                <SearchableSelect value={cycle.start_month} onChange={v => setCycle(i, { start_month: String(v) })} placeholder="Select month" options={MONTHS} showAllOption={false} />
                              </Field>
                              <Field label="Duration (days)" help="Number — total days in the review cycle.">
                                <NumInput value={cycle.duration_days} onChange={v => setCycle(i, { duration_days: v ?? 90 })} />
                              </Field>
                              <div className="md:col-span-2">
                                <Field label="Description" help="Text — what this cycle covers.">
                                  <TextInput value={cycle.description} onChange={v => setCycle(i, { description: v })} placeholder="Brief description" />
                                </Field>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-start gap-x-8 gap-y-3 border-t border-[var(--border-color)] pt-3">
                              <Toggle label="Auto-start next cycle" help="Automatically start the next cycle when current ends" checked={cycle.auto_start_next} onChange={v => setCycle(i, { auto_start_next: v })} />
                              <Toggle label="Allow peer review" help="Enable peer feedback during review cycle" checked={cycle.allow_peer_review} onChange={v => setCycle(i, { allow_peer_review: v })} />
                              <Toggle label="Self-appraisal mandatory" help="Require self-appraisal before manager review" checked={cycle.self_appraisal_mandatory} onChange={v => setCycle(i, { self_appraisal_mandatory: v })} />
                              <Toggle label="360-degree feedback" help="Enable multi-rater feedback from peers, reports, and stakeholders" checked={cycle.degree_360_feedback} onChange={v => setCycle(i, { degree_360_feedback: v })} />
                            </div>
                            <Field label="Reminder days before" help="Send reminders N days before cycle deadline">
                              <div className="w-48"><NumInput value={cycle.reminder_days} onChange={v => setCycle(i, { reminder_days: v ?? 7 })} placeholder="7" /></div>
                            </Field>
                            <div className="flex justify-end">
                              <button onClick={() => saveCycle(i)} disabled={saveMutation.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#8B5CF6] text-white hover:bg-[#7C3AED] disabled:opacity-50">
                                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Cycle
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ═══════════════════ TAB 2: Rating Scales ═══════════════════ */}
                {activeTab === 'ratings' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[var(--text-tertiary)]">Define rating scales used across performance reviews.</p>
                      <button onClick={addScale} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-600 hover:bg-amber-100">
                        <Plus className="w-4 h-4" /> Add Rating Scale
                      </button>
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
                            <div className="flex items-center gap-2">
                              <button onClick={() => editScale(i)} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil className="w-3.5 h-3.5 text-[var(--text-tertiary)]" /></button>
                              <button onClick={() => { removeScale(i); handleDelete(scale.id!, 'ratingScale'); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                            </div>
                          </div>
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <Field label="Scale name" help="Text — e.g. 'Standard 1-5 Scale'.">
                                <TextInput value={scale.name} onChange={v => setScale(i, { name: v })} placeholder="e.g. Standard 1-5" />
                              </Field>
                              <Field label="Description" help="Text — when this scale is used.">
                                <TextInput value={scale.description} onChange={v => setScale(i, { description: v })} placeholder="Description" />
                              </Field>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className="text-xs text-[var(--text-tertiary)]">Predefined templates:</span>
                              {Object.entries(RATING_TEMPLATES).map(([key, tmpl]) => (
                                <button key={key} onClick={() => applyTemplate(i, key)} className="text-xs px-2.5 py-1 rounded-full border border-[var(--border-color)] hover:bg-purple-50 hover:border-[#8B5CF6] hover:text-[#8B5CF6] transition-colors">
                                  {tmpl.label}
                                </button>
                              ))}
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-[var(--text-tertiary)]">Rating values</span>
                                <button onClick={() => addRatingRow(i)} className="flex items-center gap-1 text-xs font-medium text-[#8B5CF6] hover:text-[#7C3AED]">
                                  <Plus className="w-3 h-3" /> Add row
                                </button>
                              </div>
                              {scale.ratings.map((rating, ri) => (
                                <div key={ri} className="flex items-center gap-3">
                                  <div className="w-16">
                                    <input type="number" className="w-full px-2 py-1.5 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#8B5CF6]" value={rating.value} onChange={e => setRatingRow(i, ri, { value: +e.target.value })} />
                                  </div>
                                  <input className="flex-1 px-2 py-1.5 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#8B5CF6]" value={rating.label} placeholder="Label" onChange={e => setRatingRow(i, ri, { label: e.target.value })} />
                                  <input type="color" className="w-8 h-8 rounded-lg border border-[var(--border-color)] cursor-pointer" value={rating.color} onChange={e => setRatingRow(i, ri, { color: e.target.value })} />
                                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: rating.color }} />
                                  <button onClick={() => removeRatingRow(i, ri)} className="p-1 rounded hover:bg-red-50"><Trash2 className="w-3 h-3 text-red-400" /></button>
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
                            <div className="flex justify-end">
                              <button onClick={() => saveScale(i)} disabled={saveMutation.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#8B5CF6] text-white hover:bg-[#7C3AED] disabled:opacity-50">
                                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Scale
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ═══════════════════ TAB 3: Competency Framework ═══════════════════ */}
                {activeTab === 'competency' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[var(--text-tertiary)]">Build competency categories and items for performance evaluation.</p>
                      <button onClick={addCategory} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100">
                        <Plus className="w-4 h-4" /> Add Category
                      </button>
                    </div>

                    {/* Weight distribution bar */}
                    <WizardSectionCard title="Weight Distribution" icon={BarChart3}>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden flex">
                            {pageState.competencyCategories.map((cat, i) => (
                              <div key={i} className="h-full transition-all" style={{ width: `${totalCompetencyWeight > 0 ? (cat.weight / totalCompetencyWeight) * 100 : 0}%`, background: ['#8B5CF6', '#3B82F6', '#22C55E', '#F97316', '#EF4444', '#EC4899'][i % 6] }} />
                            ))}
                          </div>
                          <span className={`text-sm font-semibold shrink-0 ${totalCompetencyWeight === 100 ? 'text-emerald-600' : totalCompetencyWeight > 100 ? 'text-red-600' : 'text-amber-600'}`}>
                            {totalCompetencyWeight}%
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {pageState.competencyCategories.map((cat, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ background: ['#8B5CF6', '#3B82F6', '#22C55E', '#F97316', '#EF4444', '#EC4899'][i % 6] }} />
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
                    </WizardSectionCard>

                    {pageState.competencyCategories.length === 0 ? (
                      <p className="text-sm text-[var(--text-disabled)] text-center py-10 bg-gray-50 rounded-xl border border-[var(--border-color)]">No competency categories configured.</p>
                    ) : (
                      pageState.competencyCategories.map((cat, i) => (
                        <div key={i} className="border border-[var(--border-color)] rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 bg-[var(--background)]">
                            <div className="flex items-center gap-2">
                              <Layers className="w-4 h-4 text-emerald-500" />
                              <span className="font-medium text-sm text-[var(--text-primary)]">{cat.name || `Category ${i + 1}`}</span>
                              <span className="text-xs text-[var(--text-tertiary)]">({cat.weight}%)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => editCategory(i)} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil className="w-3.5 h-3.5 text-[var(--text-tertiary)]" /></button>
                              <button onClick={() => { removeCategory(i); handleDelete(cat.id!, 'competencyCategory'); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                            </div>
                          </div>
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <Field label="Category name" help="Text — e.g. 'Technical', 'Leadership'.">
                                <TextInput value={cat.name} onChange={v => setCategory(i, { name: v })} placeholder="e.g. Technical" />
                              </Field>
                              <Field label="Description" help="Text — what this category evaluates.">
                                <TextInput value={cat.description} onChange={v => setCategory(i, { description: v })} placeholder="Description" />
                              </Field>
                              <Field label="Weight (%)" help="Number — percentage weight of this category.">
                                <NumInput value={cat.weight} onChange={v => setCategory(i, { weight: v ?? 0 })} />
                              </Field>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className="text-xs text-[var(--text-tertiary)]">Predefined templates:</span>
                              {COMPETENCY_TEMPLATES.map(t => (
                                <button key={t.name} onClick={() => applyCompetencyTemplate(i, t.name)} className="text-xs px-2.5 py-1 rounded-full border border-[var(--border-color)] hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                                  {t.name}
                                </button>
                              ))}
                            </div>
                            {/* Competency items */}
                            <div className="border-t border-[var(--border-color)] pt-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-[var(--text-tertiary)]">Competency items ({cat.competencies.length})</span>
                                <button onClick={() => addCompetencyItem(i)} className="flex items-center gap-1 text-xs font-medium text-[#8B5CF6] hover:text-[#7C3AED]">
                                  <Plus className="w-3 h-3" /> Add item
                                </button>
                              </div>
                              {cat.competencies.length === 0 ? (
                                <p className="text-xs text-[var(--text-disabled)] text-center py-4">No competency items. Add one above.</p>
                              ) : (
                                <div className="space-y-2">
                                  {cat.competencies.map((comp, ci) => (
                                    <div key={ci} className="border border-[var(--border-color)] rounded-lg p-3 space-y-2">
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <Field label="Name">
                                          <TextInput value={comp.name} onChange={v => setCompetencyItem(i, ci, { name: v })} placeholder="Competency name" />
                                        </Field>
                                        <Field label="Description">
                                          <TextInput value={comp.description} onChange={v => setCompetencyItem(i, ci, { description: v })} placeholder="Description" />
                                        </Field>
                                        <Field label="Weight">
                                          <NumInput value={comp.weight} onChange={v => setCompetencyItem(i, ci, { weight: v ?? 0 })} />
                                        </Field>
                                      </div>
                                      <Field label="Proficiency levels (comma-separated)">
                                        <TextInput value={comp.proficiency_levels.join(', ')} onChange={v => setCompetencyItem(i, ci, { proficiency_levels: v.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="Beginner, Intermediate, Advanced, Expert" />
                                      </Field>
                                      <div className="flex justify-end">
                                        <button onClick={() => removeCompetencyItem(i, ci)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex justify-end">
                              <button onClick={() => { editCategory(i); saveMutation.mutate(pageState); }} disabled={saveMutation.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#8B5CF6] text-white hover:bg-[#7C3AED] disabled:opacity-50">
                                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Category
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ═══════════════════ TAB 4: Goal & KRA Templates ═══════════════════ */}
                {activeTab === 'goals' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[var(--text-tertiary)]">Define goal categories and KRA templates with weight allocation.</p>
                      <button onClick={addGoalCategory} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-blue-600 hover:bg-blue-100">
                        <Plus className="w-4 h-4" /> Add Goal Category
                      </button>
                    </div>

                    {/* Weight allocation tracker */}
                    <WizardSectionCard title="Weight Allocation Tracker" icon={Target}>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden flex">
                            {pageState.goalCategories.map((cat, ci) => (
                              cat.kras.map((kra, ki) => (
                                <div key={`${ci}-${ki}`} className="h-full transition-all" style={{ width: `${totalGoalWeight > 0 ? (kra.weight / totalGoalWeight) * 100 : 0}%`, background: ['#3B82F6', '#8B5CF6', '#22C55E', '#F97316', '#EF4444', '#EC4899'][(ci + ki) % 6] }} />
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
                    </WizardSectionCard>

                    {pageState.goalCategories.length === 0 ? (
                      <p className="text-sm text-[var(--text-disabled)] text-center py-10 bg-gray-50 rounded-xl border border-[var(--border-color)]">No goal categories configured.</p>
                    ) : (
                      pageState.goalCategories.map((cat, i) => (
                        <div key={i} className="border border-[var(--border-color)] rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 bg-[var(--background)]">
                            <div className="flex items-center gap-2">
                              <Target className="w-4 h-4 text-blue-500" />
                              <span className="font-medium text-sm text-[var(--text-primary)]">{cat.name || `Goal Category ${i + 1}`}</span>
                              <span className="text-xs text-[var(--text-tertiary)]">({cat.kras.length} KRAs)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => editGoalCategory(i)} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil className="w-3.5 h-3.5 text-[var(--text-tertiary)]" /></button>
                              <button onClick={() => { removeGoalCategory(i); handleDelete(cat.id!, 'goalCategory'); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                            </div>
                          </div>
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <Field label="Category name" help="Text — e.g. 'Revenue Growth', 'Customer Satisfaction'.">
                                <TextInput value={cat.name} onChange={v => setGoalCategory(i, { name: v })} placeholder="e.g. Revenue Growth" />
                              </Field>
                              <Field label="Description" help="Text — what this category covers.">
                                <TextInput value={cat.description} onChange={v => setGoalCategory(i, { description: v })} placeholder="Description" />
                              </Field>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className="text-xs text-[var(--text-tertiary)]">Predefined templates:</span>
                              {GOAL_TEMPLATES.map(t => (
                                <button key={t.name} onClick={() => applyGoalTemplate(i, t.name)} className="text-xs px-2.5 py-1 rounded-full border border-[var(--border-color)] hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600 transition-colors">
                                  {t.name}
                                </button>
                              ))}
                            </div>
                            {/* KRA templates */}
                            <div className="border-t border-[var(--border-color)] pt-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-[var(--text-tertiary)]">KRA Templates ({cat.kras.length})</span>
                                <button onClick={() => addKra(i)} className="flex items-center gap-1 text-xs font-medium text-[#8B5CF6] hover:text-[#7C3AED]">
                                  <Plus className="w-3 h-3" /> Add KRA
                                </button>
                              </div>
                              {cat.kras.length === 0 ? (
                                <p className="text-xs text-[var(--text-disabled)] text-center py-4">No KRAs. Add one above.</p>
                              ) : (
                                <div className="space-y-2">
                                  {cat.kras.map((kra, ki) => (
                                    <div key={ki} className="border border-[var(--border-color)] rounded-lg p-3 space-y-2">
                                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                        <Field label="Title">
                                          <TextInput value={kra.title} onChange={v => setKra(i, ki, { title: v })} placeholder="KRA title" />
                                        </Field>
                                        <Field label="Weight (%)">
                                          <NumInput value={kra.weight} onChange={v => setKra(i, ki, { weight: v ?? 0 })} />
                                        </Field>
                                        <Field label="Target value">
                                          <TextInput value={kra.target_value} onChange={v => setKra(i, ki, { target_value: v })} placeholder="e.g. 95%" />
                                        </Field>
                                        <Field label="Measurement criteria">
                                          <TextInput value={kra.measurement_criteria} onChange={v => setKra(i, ki, { measurement_criteria: v })} placeholder="How to measure" />
                                        </Field>
                                      </div>
                                      <Field label="Description">
                                        <TextInput value={kra.description} onChange={v => setKra(i, ki, { description: v })} placeholder="Detailed description" />
                                      </Field>
                                      <div className="flex justify-end">
                                        <button onClick={() => removeKra(i, ki)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex justify-end">
                              <button onClick={() => { editGoalCategory(i); saveMutation.mutate(pageState); }} disabled={saveMutation.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#8B5CF6] text-white hover:bg-[#7C3AED] disabled:opacity-50">
                                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Category
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ═══════════════════ TAB 5: Feedback Settings ═══════════════════ */}
                {activeTab === 'feedback' && (
                  <div className="space-y-4">
                    <WizardSectionCard title="Feedback Preferences" icon={MessageSquare}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Minimum feedback count" help="Minimum number of feedback responses required">
                          <div className="w-48"><NumInput value={pageState.feedbackSettings.min_feedback_count} onChange={v => setFeedback({ min_feedback_count: v ?? 3 })} /></div>
                        </Field>
                        <Field label="Feedback weight in final rating (%)" help="How much feedback contributes to overall score">
                          <div className="w-48"><NumInput value={pageState.feedbackSettings.feedback_weight} onChange={v => setFeedback({ feedback_weight: v ?? 20 })} /></div>
                        </Field>
                        <Field label="Feedback deadline (days)" help="Days after review start to collect feedback">
                          <div className="w-48"><NumInput value={pageState.feedbackSettings.feedback_deadline_days} onChange={v => setFeedback({ feedback_deadline_days: v ?? 7 })} /></div>
                        </Field>
                      </div>
                      <div className="flex flex-wrap items-start gap-x-8 gap-y-3 border-t border-[var(--border-color)] pt-3">
                        <Toggle label="Anonymous feedback" help="Hide reviewer identity in feedback" checked={pageState.feedbackSettings.anonymous_feedback} onChange={v => setFeedback({ anonymous_feedback: v })} />
                        <Toggle label="Auto-remind non-respondents" help="Send automatic reminders to pending feedback providers" checked={pageState.feedbackSettings.auto_remind} onChange={v => setFeedback({ auto_remind: v })} />
                      </div>
                    </WizardSectionCard>

                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[var(--text-tertiary)]">Create feedback templates with category-specific questions.</p>
                      <button onClick={addTemplate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-rose-50 text-rose-600 hover:bg-rose-100">
                        <Plus className="w-4 h-4" /> Add Feedback Template
                      </button>
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
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-[#8B5CF6]">{tmpl.category}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => editTemplate(i)} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil className="w-3.5 h-3.5 text-[var(--text-tertiary)]" /></button>
                              <button onClick={() => { removeTemplate(i); handleDelete(tmpl.id!, 'feedbackTemplate'); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                            </div>
                          </div>
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <Field label="Template name" help="Text — e.g. 'Peer Feedback Q1'.">
                                <TextInput value={tmpl.name} onChange={v => setTemplate(i, { name: v })} placeholder="e.g. Peer Feedback Q1" />
                              </Field>
                              <Field label="Category" help="Who provides this feedback.">
                                <SearchableSelect value={tmpl.category} onChange={v => setTemplate(i, { category: String(v) })} placeholder="Select category" options={FEEDBACK_CATEGORIES} showAllOption={false} />
                              </Field>
                            </div>
                            <div className="border-t border-[var(--border-color)] pt-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-[var(--text-tertiary)]">Questions ({tmpl.questions.length})</span>
                                <button onClick={() => addQuestion(i)} className="flex items-center gap-1 text-xs font-medium text-[#8B5CF6] hover:text-[#7C3AED]">
                                  <Plus className="w-3 h-3" /> Add question
                                </button>
                              </div>
                              {tmpl.questions.map((q, qi) => (
                                <div key={qi} className="flex items-center gap-2 mb-2">
                                  <span className="text-xs text-[var(--text-tertiary)] w-6 shrink-0">{qi + 1}.</span>
                                  <input className="flex-1 px-2 py-1.5 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#8B5CF6]" value={q} placeholder="Enter question text" onChange={e => setQuestion(i, qi, e.target.value)} />
                                  <button onClick={() => removeQuestion(i, qi)} className="p-1 rounded hover:bg-red-50"><Trash2 className="w-3 h-3 text-red-400" /></button>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end">
                              <button onClick={() => { editTemplate(i); saveMutation.mutate(pageState); }} disabled={saveMutation.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#8B5CF6] text-white hover:bg-[#7C3AED] disabled:opacity-50">
                                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Template
                              </button>
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

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-color)] bg-[var(--background)]">
          <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {pageState.reviewCycles.length} cycles</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {pageState.ratingScales.length} scales</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {pageState.competencyCategories.length} categories</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {pageState.goalCategories.length} goals</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {pageState.feedbackSettings.templates.length} templates</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Cancel</button>
            <button onClick={handleSaveAll} disabled={saveMutation.isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-[#8B5CF6] text-white hover:bg-[#7C3AED] disabled:opacity-50">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
