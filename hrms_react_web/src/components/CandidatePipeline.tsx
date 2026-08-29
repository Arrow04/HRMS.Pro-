import { useMemo, useState } from 'react';
import {
  Phone, Mail, Briefcase, Building2, Layers, FileText, LogIn,
  XCircle, RotateCcw, CheckCircle2, Clock, Award, UserCheck, Users, Calendar,
  ChevronRight, Loader2, Search, TrendingUp, AlertCircle, ChevronDown,
  Sparkles, GripVertical
} from 'lucide-react';
import CvUploadButton from './CvUploadButton';
import { formatAppDate } from '../services/appSettingsService';
import { personDisplayName, personInitials } from '../utils/employeeNameUtils';

interface PipelineCandidate {
  id: number;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  status?: string;
  currentPosition?: string;
  currentCompany?: string;
  jobTitle?: string;
  companyName?: string;
  departmentName?: string;
  expectedSalary?: number;
  experienceYears?: number;
  rejectionReason?: string;
  rejectedAt?: string;
  appliedDate?: string;
  onboarded?: boolean;
  companyId?: number;
  branchId?: number;
  departmentId?: number;
  resumeUrl?: string;
}

interface CandidatePipelineProps {
  candidates: PipelineCandidate[];
  companies?: { id: number; name: string }[];
  departments?: { id: number; name: string }[];
  loading?: boolean;
  onAdvance?: (candidate: PipelineCandidate, toStatus: string) => void;
  onReject?: (candidate: PipelineCandidate) => void;
  onRestore?: (candidate: PipelineCandidate) => void;
  onOfferLetter?: (candidate: PipelineCandidate) => void;
  onOnboard?: (candidate: PipelineCandidate) => void;
  onEdit?: (candidate: PipelineCandidate) => void;
}

// ── Premium design system per stage ──
// A single source of truth: gradient, glow, ring, soft-tint, text colors
const STAGES: {
  id: string; label: string; icon: React.ElementType;
  grad: string; glow: string; tint: string; softBg: string; badge: string; bar: string;
}[] = [
  {
    id: 'applied', label: 'Applied', icon: Users,
    grad: 'from-sky-500 to-blue-600', glow: 'shadow-sky-500/30',
    tint: 'text-sky-600', softBg: 'bg-sky-50', badge: 'bg-sky-50 text-sky-700 ring-sky-100', bar: 'bg-sky-500',
  },
  {
    id: 'screened', label: 'Screened', icon: UserCheck,
    grad: 'from-cyan-500 to-teal-500', glow: 'shadow-cyan-500/30',
    tint: 'text-cyan-600', softBg: 'bg-cyan-50', badge: 'bg-cyan-50 text-cyan-700 ring-cyan-100', bar: 'bg-cyan-500',
  },
  {
    id: 'shortlisted', label: 'Shortlisted', icon: Award,
    grad: 'from-violet-500 to-purple-600', glow: 'shadow-violet-500/30',
    tint: 'text-violet-600', softBg: 'bg-violet-50', badge: 'bg-violet-50 text-violet-700 ring-violet-100', bar: 'bg-violet-500',
  },
  {
    id: 'interviewed', label: 'Interviewed', icon: Calendar,
    grad: 'from-indigo-500 to-blue-600', glow: 'shadow-indigo-500/30',
    tint: 'text-indigo-600', softBg: 'bg-indigo-50', badge: 'bg-indigo-50 text-indigo-700 ring-indigo-100', bar: 'bg-indigo-500',
  },
  {
    id: 'offered', label: 'Offered', icon: FileText,
    grad: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-500/30',
    tint: 'text-emerald-600', softBg: 'bg-emerald-50', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-100', bar: 'bg-emerald-500',
  },
  {
    id: 'selected', label: 'Selected', icon: CheckCircle2,
    grad: 'from-teal-500 to-emerald-600', glow: 'shadow-teal-500/30',
    tint: 'text-teal-600', softBg: 'bg-teal-50', badge: 'bg-teal-50 text-teal-700 ring-teal-100', bar: 'bg-teal-500',
  },
  {
    id: 'hired', label: 'Hired', icon: LogIn,
    grad: 'from-green-500 to-emerald-600', glow: 'shadow-green-500/30',
    tint: 'text-green-600', softBg: 'bg-green-50', badge: 'bg-green-50 text-green-700 ring-green-100', bar: 'bg-green-500',
  },
  {
    id: 'rejected', label: 'Rejected', icon: XCircle,
    grad: 'from-rose-500 to-red-500', glow: 'shadow-rose-500/30',
    tint: 'text-rose-600', softBg: 'bg-rose-50', badge: 'bg-rose-50 text-rose-700 ring-rose-100', bar: 'bg-rose-500',
  },
];

const NEXT_STAGE: Record<string, string> = {
  applied: 'screened',
  screened: 'shortlisted',
  shortlisted: 'interviewed',
  interviewed: 'offered',
  offered: 'selected',
  selected: 'hired',
};

const CandidatePipeline: React.FC<CandidatePipelineProps> = ({
  candidates = [],
  companies = [],
  departments = [],
  loading = false,
  onAdvance,
  onReject,
  onRestore,
  onOfferLetter,
  onOnboard,
  onEdit,
}) => {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [companyFilter, setCompanyFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const stageMeta = (id: string) => STAGES.find(s => s.id === id) || STAGES[0];

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      const matchCompany = companyFilter === 'all' || String(c.companyName || '') === companyFilter || companies.find(x => x.name === companyFilter)?.id === (c as { companyId?: number }).companyId;
      const matchSearch = !search.trim() ||
        `${personDisplayName(c)} ${c.email || ''} ${c.currentPosition || ''} ${c.jobTitle || ''} ${c.currentCompany || ''}`.toLowerCase().includes(search.trim().toLowerCase());
      return matchCompany && matchSearch;
    });
  }, [candidates, companyFilter, search, companies]);

  const grouped = useMemo(() => {
    const g: Record<string, PipelineCandidate[]> = {};
    STAGES.forEach((s) => { g[s.id] = []; });
    filtered.forEach((c) => {
      const st = c.status || 'applied';
      if (g[st]) g[st].push(c); else g.applied.push(c);
    });
    return g;
  }, [filtered]);

  const total = filtered.length;

  const initials = (c: PipelineCandidate) => personInitials(c, 'C');

  const currency = (v?: number) => v ? `₹${(v / 100000).toFixed(1)}L` : '';

  const canAdvance = (c: PipelineCandidate) => {
    if (c.onboarded) return false;
    const st = c.status || 'applied';
    if (st === 'rejected' || st === 'hired') return false;
    return !!NEXT_STAGE[st];
  };

  const handleDrop = (stageId: string) => {
    if (dragId == null) return;
    const cand = candidates.find(c => c.id === dragId);
    if (!cand) return;
    setDragId(null);
    setOverStage(null);
    if (stageId === 'rejected') {
      if (onReject) onReject(cand);
      return;
    }
    if (stageId === cand.status) return;
    if (onAdvance) onAdvance(cand, stageId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1C64F2] to-[#7C3AED] flex items-center justify-center shadow-lg shadow-[#1C64F2]/30">
              <Users className="w-6 h-6 text-white animate-pulse" />
            </div>
            null
          </div>
          <p className="text-sm font-medium text-[#64748B]">Loading pipeline...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Premium toolbar ── */}
      <div className="relative overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-[#1C64F2]/[0.04] via-transparent to-[#7C3AED]/[0.04] pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center gap-3 p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search candidates, roles, companies..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-[#1C64F2]/20 focus:border-[#1C64F2] focus:border-transparent outline-none text-[#0F172A] placeholder-[#94A3B8] transition-all" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider hidden sm:block">Company</span>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94A3B8] pointer-events-none" />
                <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}
                  className="pl-8 pr-8 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm text-[#0F172A] focus:ring-2 focus:ring-[#1C64F2]/20 focus:border-[#1C64F2] outline-none appearance-none transition-all cursor-pointer">
                  <option value="all">All Companies</option>
                  {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94A3B8] pointer-events-none" />
              </div>
            </div>
            <div className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
              <Sparkles className="w-3.5 h-3.5 text-[#7C3AED]" />
              <span className="text-sm font-semibold text-[#0F172A]">{total}</span>
              <span className="text-xs text-[#94A3B8]">candidates</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Pipeline board ── */}
      <div className="overflow-x-auto pb-4 -mx-1 px-1">
        <div className="flex gap-4 min-w-max">
          {STAGES.map((stage) => {
            const list = grouped[stage.id] || [];
            const isOver = overStage === stage.id;
            return (
              <div
                key={stage.id}
                onDragOver={(e) => { e.preventDefault(); setOverStage(stage.id); }}
                onDragLeave={() => setOverStage(null)}
                onDrop={() => handleDrop(stage.id)}
                className={`w-[292px] shrink-0 rounded-2xl border flex flex-col transition-all duration-300 ${
                  isOver
                    ? `border-transparent ring-2 ${stage.glow.replace('shadow', 'ring')}/30 bg-white`
                    : 'border-[#E9EDF3] bg-[#F6F8FB]'
                } ${isOver ? 'scale-[1.01] shadow-xl' : 'shadow-sm'}`}
              >
                {/* Stage header */}
                <div className={`px-4 pt-4 pb-3 ${isOver ? 'rounded-t-2xl' : 'rounded-t-2xl'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`relative w-9 h-9 rounded-xl bg-gradient-to-br ${stage.grad} ${stage.glow} shadow-lg flex items-center justify-center text-white`}>
                        <stage.icon className="w-4 h-4" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-[#0F172A] leading-tight tracking-tight">{stage.label}</p>
                        <p className="text-[11px] font-medium text-[#94A3B8]">{list.length} candidate{list.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full text-xs font-bold ${stage.badge} ring-1`}>
                      {list.length}
                    </span>
                  </div>
                  {/* progress line */}
                  <div className="mt-3 h-1 rounded-full bg-[#E9EDF3] overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${stage.grad} transition-all duration-500`}
                      style={{ width: total > 0 ? `${Math.max(4, (list.length / total) * 100)}%` : '0%' }} />
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 p-2.5 pt-1 space-y-2.5 min-h-[70px] max-h-[540px] overflow-y-auto">
                  {list.length === 0 && (
                    <div className={`flex flex-col items-center justify-center py-10 rounded-xl border-2 border-dashed transition-colors ${isOver ? 'border-[#1C64F2]/40 bg-white' : 'border-[#E2E8F0]'}`}>
                      <span className={`w-11 h-11 rounded-full ${stage.softBg} flex items-center justify-center mb-2`}>
                        <span className={`w-2.5 h-2.5 rounded-full ${stage.bar}`} />
                      </span>
                      <p className="text-xs font-medium text-[#94A3B8]">No candidates</p>
                      {isOver && <p className="text-[10px] text-[#1C64F2] mt-0.5">Drop here</p>}
                    </div>
                  )}
                  {list.map((c) => {
                    const meta = stageMeta(c.status || 'applied');
                    const isExpanded = expandedId === c.id;
                    return (
                      <div
                        key={c.id}
                        draggable={!c.onboarded}
                        onDragStart={() => setDragId(c.id)}
                        onDragEnd={() => { setDragId(null); setOverStage(null); }}
                        onClick={() => setExpandedId(isExpanded ? null : c.id)}
                        className={`group relative bg-white rounded-xl border border-[#E9EDF3] shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-transparent transition-all duration-200 cursor-pointer overflow-hidden ${
                          dragId === c.id ? 'opacity-40 rotate-1 scale-95' : ''
                        } ${isExpanded ? 'ring-2 ring-[#1C64F2]/10 border-[#1C64F2]/20' : ''}`}
                      >
                        {/* left accent bar */}
                        <span className={`absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b ${meta.grad} opacity-80`} />

                        <div className="p-3.5 pl-4">
                          <div className="flex items-start gap-3">
                            <div className={`relative shrink-0 w-10 h-10 rounded-full bg-gradient-to-br ${c.onboarded ? 'from-teal-500 to-emerald-600' : meta.grad} ${meta.glow} shadow-md flex items-center justify-center text-white text-xs font-bold`}>
                              {initials(c)}
                              {c.onboarded && (
                                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center">
                                  <CheckCircle2 className="w-3 h-3 text-teal-500" />
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-bold text-[#0F172A] truncate">{personDisplayName(c)}</p>
                                {c.onboarded && <span className="shrink-0 px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded-full text-[9px] font-bold tracking-wide">ONBOARDED</span>}
                              </div>
                              <p className="text-xs font-medium text-[#64748B] truncate mt-0.5">{c.currentPosition || c.jobTitle || 'Candidate'}</p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                {c.companyName && (
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${meta.tint} ${meta.softBg} px-1.5 py-0.5 rounded-md`}>
                                    <Building2 className="w-2.5 h-2.5" />{c.companyName}
                                  </span>
                                )}
                                {c.departmentName && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#64748B] bg-[#F1F5F9] px-1.5 py-0.5 rounded-md">
                                    <Layers className="w-2.5 h-2.5" />{c.departmentName}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-[#CBD5E1] transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>

                          {/* Expanded details */}
                          <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-[300px] opacity-100 mt-3' : 'max-h-0 opacity-0'}`}>
                            <div className="pt-3 border-t border-[#F1F5F9] space-y-1.5">
                              {c.email && <p className="text-xs text-[#64748B] flex items-center gap-2 truncate"><Mail className="w-3 h-3 text-[#94A3B8] shrink-0" />{c.email}</p>}
                              {c.phone && <p className="text-xs text-[#64748B] flex items-center gap-2"><Phone className="w-3 h-3 text-[#94A3B8] shrink-0" />{c.phone}</p>}
                              {c.jobTitle && <p className="text-xs text-[#64748B] flex items-center gap-2"><Briefcase className="w-3 h-3 text-[#94A3B8] shrink-0" />{c.jobTitle}</p>}
                              {c.currentCompany && <p className="text-xs text-[#64748B] flex items-center gap-2"><Building2 className="w-3 h-3 text-[#94A3B8] shrink-0" />{c.currentCompany}</p>}
                              {(c.expectedSalary || c.experienceYears != null) && (
                                <p className="text-xs text-[#64748B] flex items-center gap-2">
                                  <TrendingUp className="w-3 h-3 text-[#94A3B8] shrink-0" />
                                  {currency(c.expectedSalary)}{c.expectedSalary ? ' · ' : ''}{c.experienceYears != null ? `${c.experienceYears} yrs exp` : ''}
                                </p>
                              )}
                              {c.appliedDate && (
                                <p className="text-xs text-[#64748B] flex items-center gap-2">
                                  <Clock className="w-3 h-3 text-[#94A3B8] shrink-0" />Applied {formatAppDate(c.appliedDate)}
                                </p>
                              )}
                              {c.rejectionReason && stage.id === 'rejected' && (
                                <p className="text-xs text-[#DC2626] flex items-start gap-2 bg-[#FEF2F2] p-2 rounded-lg">
                                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />{c.rejectionReason}
                                </p>
                              )}
                              {c.resumeUrl && (
                                <p className="text-[11px] text-[#94A3B8] flex items-center gap-2">
                                  <FileText className="w-3 h-3 shrink-0" />CV attached
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center justify-between gap-1.5 mt-3 pt-2.5 border-t border-[#F1F5F9]">
                            <div className="flex items-center gap-1">
                              {onEdit && (
                                <button onClick={(e) => { e.stopPropagation(); onEdit(c); }} title="Edit"
                                  className="w-7 h-7 rounded-lg bg-[#F1F5F9] hover:bg-[#EFF6FF] hover:text-[#1C64F2] text-[#94A3B8] flex items-center justify-center transition-colors">
                                  <Briefcase className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <div onClick={(e) => e.stopPropagation()}>
                                <CvUploadButton entityType="candidate" entityId={c.id} resumeUrl={c.resumeUrl} />
                              </div>
                              {c.status === 'rejected' && onRestore && (
                                <button onClick={(e) => { e.stopPropagation(); onRestore(c); }} title="Restore to pipeline"
                                  className="w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition-colors">
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {c.status !== 'rejected' && onReject && (
                                <button onClick={(e) => { e.stopPropagation(); onReject(c); }} title="Reject"
                                  className="w-7 h-7 rounded-lg bg-[#F1F5F9] hover:bg-red-50 hover:text-red-500 text-[#94A3B8] flex items-center justify-center transition-colors">
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {c.status === 'offered' && onOfferLetter && !c.onboarded && (
                                <button onClick={(e) => { e.stopPropagation(); onOfferLetter(c); }} title="Download Offer Letter"
                                  className="w-7 h-7 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-600 flex items-center justify-center transition-colors">
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {(c.status === 'offered' || c.status === 'selected' || c.status === 'hired') && onOnboard && !c.onboarded && (
                                <button onClick={(e) => { e.stopPropagation(); onOnboard(c); }} title="Start Onboarding"
                                  className="w-7 h-7 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-600 flex items-center justify-center transition-colors">
                                  <LogIn className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canAdvance(c) && onAdvance && (
                                <button onClick={(e) => { e.stopPropagation(); onAdvance(c, NEXT_STAGE[c.status || 'applied']); }}
                                  title={`Move to ${NEXT_STAGE[c.status || 'applied']}`}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gradient-to-r ${stage.grad} ${stage.glow} shadow text-white text-[10px] font-bold uppercase tracking-wide transition-transform hover:scale-105 active:scale-95`}>
                                  Next <ChevronRight className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 text-xs text-[#94A3B8]">
        <span className="inline-flex items-center gap-1.5"><GripVertical className="w-3.5 h-3.5" /> Drag cards to move between stages</span>
        <span className="w-1 h-1 rounded-full bg-[#CBD5E1]" />
        <span className="inline-flex items-center gap-1.5"><ChevronDown className="w-3.5 h-3.5" /> Click a card to view full profile</span>
        <span className="w-1 h-1 rounded-full bg-[#CBD5E1]" />
        <span className="inline-flex items-center gap-1.5 font-medium text-[#0F172A]">{total} candidates total</span>
      </div>
    </div>
  );
};

export default CandidatePipeline;
