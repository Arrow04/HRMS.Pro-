import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  Sparkles, Plus, TrendingUp, Target, Star, X, Pencil,
  CheckCircle2, Users, BarChart3, Info, RotateCcw, Loader2, Download, Upload, Settings, Trash2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie } from 'recharts';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import PerformanceConfig from '../components/PerformanceConfig';
import { useMasterData } from '../hooks/useMasterData';
import { useEmployeePicker } from '../hooks/useEmployeePicker';
import toast from 'react-hot-toast';
import DateRangePicker from '../components/DateRangePicker';
import DatePicker from '../components/DatePicker';
import SearchableSelect from '../components/SearchableSelect';
import EmployeeScopedCascade from '../components/EmployeeScopedCascade';
import { getAttendanceStatusBadge, capitalizeStatus } from '../utils/statusUtils';
import StatsCard from '../components/StatsCard';
import PageHero from '../components/PageHero';
import ExportButton from '../components/ExportButton';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import BulkDeleteModal from '../components/BulkDeleteModal';
import { runAutomation } from '../services/aiAutomation';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import { formTextareaClass } from '../components/FormField';
import type { PerformanceReview, Company, Department } from '../types';

interface MasterDataOption {
  value?: string;
  label?: string;
  code?: string;
  name?: string;
}

interface ReviewRow extends PerformanceReview {
  employeeName?: string;
  reviewerName?: string;
  employeeCode?: string;
  email?: string;
  company_id?: number;
  branch_id?: number;
  department_id?: number;
  date?: string;
  updatedAt?: string;
}

interface GoalRow {
  id: number;
  employeeId?: number;
  employeeName?: string;
  employeeCode?: string;
  email?: string;
  title?: string;
  description?: string;
  category?: string;
  goalType?: string;
  objective?: string;
  keyResults?: string;
  progress?: number;
  status?: string;
  priority?: string;
  weight?: number;
  alignedWith?: string;
  metricType?: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  company_id?: number;
  branch_id?: number;
  department_id?: number;
  dueDate?: string;
  createdAt?: string;
  date?: string;
  updatedAt?: string;
}

interface FeedbackRow {
  id: number;
  employeeId?: number;
  employeeName?: string;
  employeeCode?: string;
  email?: string;
  reviewerId?: number;
  reviewerName?: string;
  feedbackType?: string;
  feedbackCycle?: string;
  feedbackPeriod?: string;
  feedbackYear?: number;
  relationshipType?: string;
  collaborationDuration?: string;
  communicationRating?: number;
  teamworkRating?: number;
  leadershipRating?: number;
  problemSolvingRating?: number;
  reliabilityRating?: number;
  adaptabilityRating?: number;
  overallRating?: number;
  strengths?: string;
  areasForImprovement?: string;
  specificExamples?: string;
  recommendations?: string;
  whatEmployeeDoesWell?: string;
  whatEmployeeCouldImprove?: string;
  collaborationFeedback?: string;
  additionalComments?: string;
  isAnonymous?: boolean;
  status?: string;
  company_id?: number;
  branch_id?: number;
  department_id?: number;
  createdAt?: string;
  date?: string;
  updatedAt?: string;
}

const TABS = [
  { id: 'reviews', label: 'Performance Reviews', icon: Target },
  { id: 'goals', label: 'Goals & OKRs', icon: TrendingUp },
  { id: 'feedback', label: '360 Feedback', icon: Users },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'configuration', label: 'Configuration', icon: Settings },
];

const ReviewDetailSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="bg-[#F8FAFC] rounded-xl p-5 space-y-3">
    <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
      <span className="w-1.5 h-4 rounded-full bg-[#1C64F2]" /> {title}
    </h3>
    {children}
  </div>
);

const DetailField = ({ label, value, badge }: { label: string; value: string; badge?: boolean }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-xs text-[#64748B]">{label}</span>
    {badge ? <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getAttendanceStatusBadge(value || '')}`}>{value}</span> : <span className="text-sm font-medium text-[#0F172A]">{value || '-'}</span>}
  </div>
);

const DetailTextArea = ({ label, value, editing, onChange }: { label: string; value: string; editing: boolean; onChange: (v: string) => void }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs text-[#64748B]">{label}</span>
    {editing ? (
      <textarea className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#1C64F2] h-20" value={value} onChange={(e) => onChange(e.target.value)} />
    ) : (
      <p className="text-sm text-[#0F172A] whitespace-pre-wrap">{value || '-'}</p>
    )}
  </div>
);

const INPUT_CLS = "w-full h-[42px] px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]";
const TEXTAREA_CLS = `${formTextareaClass} min-h-[120px] h-[120px]`;

const FormField = ({ label, required, children, help, multiline }: { label: string; required?: boolean; children: ReactNode; help?: string; multiline?: boolean }) => (
  <div className={`flex flex-col ${multiline ? 'h-full' : ''}`}>
    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{label}{required && <span className="text-red-500"> *</span>}</label>
    <div className={multiline ? 'w-full flex-1' : 'min-h-[42px] flex items-stretch w-full'}>{children}</div>
    <p className="mt-1 text-xs text-gray-400 min-h-[16px]">{help || ''}</p>
  </div>
);

type ReviewFormState = {
  employeeId: string | number;
  reviewerId: string | number;
  reviewPeriod: string;
  reviewYear: string | number;
  organizationId: string | number;
  companyId: string | number;
  branchId: string | number;
  departmentId: string | number;
  productivityScore: number;
  qualityScore: number;
  communicationScore: number;
  teamworkScore: number;
  leadershipScore: number;
  initiativeScore: number;
  punctualityScore: number;
  problemSolvingScore: number;
  collaborationScore: number;
  adaptabilityScore: number;
  creativityScore: number;
  attendanceScore: number;
  goalsSet: string;
  goalsAchieved: string;
  strengths: string;
  areasForImprovement: string;
  developmentPlan: string;
  achievements: string;
  keyProjects: string;
  trainingNeeds: string;
  reviewerName: string;
  reviewerPosition: string;
  reviewCycle: string;
  promotionEligible: boolean;
  salaryRecommendation: string;
  salaryPercentage: number;
  nextReviewDate: string;
  reviewerComments: string;
  employeeComments: string;
  notes: string;
};

const SCORE_FIELDS = [
  'productivityScore', 'qualityScore', 'communicationScore', 'teamworkScore',
  'leadershipScore', 'initiativeScore', 'punctualityScore', 'problemSolvingScore',
  'collaborationScore', 'adaptabilityScore', 'creativityScore', 'attendanceScore',
] as const;

const SCORE_LABELS: Record<(typeof SCORE_FIELDS)[number], string> = {
  productivityScore: 'Productivity',
  qualityScore: 'Quality',
  communicationScore: 'Communication',
  teamworkScore: 'Teamwork',
  leadershipScore: 'Leadership',
  initiativeScore: 'Initiative',
  punctualityScore: 'Punctuality',
  problemSolvingScore: 'Problem Solving',
  collaborationScore: 'Collaboration',
  adaptabilityScore: 'Adaptability',
  creativityScore: 'Creativity',
  attendanceScore: 'Attendance',
};

const buildReviewPayload = (review: ReviewFormState) => {
  const toInt = (v: string | number | undefined) => {
    if (v === '' || v === null || v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const toScore = (v: number) => (Number.isFinite(v) && v > 0 ? v : undefined);

  const payload: Record<string, unknown> = {
    employeeId: toInt(review.employeeId),
    reviewPeriod: review.reviewPeriod,
    reviewYear: toInt(review.reviewYear) ?? new Date().getFullYear(),
    reviewCycle: review.reviewCycle || undefined,
    reviewerName: review.reviewerName || undefined,
    reviewerPosition: review.reviewerPosition || undefined,
    goalsSet: review.goalsSet || undefined,
    goalsAchieved: review.goalsAchieved || undefined,
    strengths: review.strengths || undefined,
    areasForImprovement: review.areasForImprovement || undefined,
    developmentPlan: review.developmentPlan || undefined,
    achievements: review.achievements || undefined,
    keyProjects: review.keyProjects || undefined,
    trainingNeeds: review.trainingNeeds || undefined,
    reviewerComments: review.reviewerComments || undefined,
    employeeComments: review.employeeComments || undefined,
    notes: review.notes || undefined,
    promotionEligible: review.promotionEligible,
    salaryRecommendation: review.salaryRecommendation || undefined,
    salaryPercentage: review.salaryPercentage ? Number(review.salaryPercentage) : undefined,
    nextReviewDate: review.nextReviewDate || undefined,
  };

  const reviewerId = toInt(review.reviewerId);
  if (reviewerId) payload.reviewerId = reviewerId;

  for (const field of SCORE_FIELDS) {
    const score = toScore(review[field]);
    if (score !== undefined) payload[field] = score;
  }

  return payload;
};

const toIntField = (v: string | number | undefined | null) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const toRatingField = (v: number) => (Number.isFinite(v) && v > 0 ? v : undefined);

type GoalFormState = {
  employeeId: string | number;
  companyId: string;
  branchId: string;
  departmentId: string;
  title: string;
  description: string;
  goalType: string;
  category: string;
  objective: string;
  keyResults: string;
  keyResultsParsed: string[];
  startDate: string;
  endDate: string;
  targetValue: number;
  currentValue: number;
  progress: number;
  status: string;
  priority: string;
  weight: number;
  alignedWith: string;
  metricType: string;
  unit: string;
  comments: string;
  notes: string;
};

type FeedbackFormState = {
  employeeId: string | number;
  reviewerId: string | number;
  companyId: string;
  branchId: string;
  departmentId: string;
  feedbackType: string;
  feedbackCycle: string;
  feedbackPeriod: string;
  feedbackYear: number;
  relationshipType: string;
  collaborationDuration: string;
  communicationRating: number;
  teamworkRating: number;
  leadershipRating: number;
  problemSolvingRating: number;
  reliabilityRating: number;
  adaptabilityRating: number;
  overallRating: number;
  strengths: string;
  areasForImprovement: string;
  specificExamples: string;
  recommendations: string;
  whatEmployeeDoesWell: string;
  whatEmployeeCouldImprove: string;
  collaborationFeedback: string;
  additionalComments: string;
  isAnonymous: boolean;
  notes: string;
  status: string;
};

const FEEDBACK_RATING_FIELDS = [
  'communicationRating',
  'teamworkRating',
  'leadershipRating',
  'problemSolvingRating',
  'reliabilityRating',
  'adaptabilityRating',
  'overallRating',
] as const;

const buildGoalPayload = (goal: GoalFormState) => {
  const keyResults = goal.keyResults
    || (Array.isArray(goal.keyResultsParsed) && goal.keyResultsParsed.some((kr) => kr.trim())
      ? JSON.stringify(goal.keyResultsParsed.filter((kr) => kr.trim()))
      : undefined);

  return {
    employeeId: toIntField(goal.employeeId),
    title: goal.title,
    description: goal.description || undefined,
    goalType: goal.goalType || 'OKR',
    category: goal.category || undefined,
    objective: goal.objective || undefined,
    keyResults,
    startDate: goal.startDate || undefined,
    endDate: goal.endDate || undefined,
    targetValue: goal.targetValue ? Number(goal.targetValue) : undefined,
    currentValue: goal.currentValue ? Number(goal.currentValue) : undefined,
    progress: goal.progress ?? 0,
    status: goal.status || 'active',
    priority: goal.priority || 'medium',
    weight: goal.weight ?? 1,
    alignedWith: goal.alignedWith || undefined,
    metricType: goal.metricType || undefined,
    unit: goal.unit || undefined,
    comments: goal.comments || undefined,
    notes: goal.notes || undefined,
  };
};

const buildFeedbackPayload = (feedback: FeedbackFormState) => {
  const payload: Record<string, unknown> = {
    employeeId: toIntField(feedback.employeeId),
    feedbackType: feedback.feedbackType,
    feedbackCycle: feedback.feedbackCycle || undefined,
    feedbackPeriod: feedback.feedbackPeriod || undefined,
    feedbackYear: feedback.feedbackYear || undefined,
    relationshipType: feedback.relationshipType || undefined,
    collaborationDuration: feedback.collaborationDuration || undefined,
    strengths: feedback.strengths || undefined,
    areasForImprovement: feedback.areasForImprovement || undefined,
    specificExamples: feedback.specificExamples || undefined,
    recommendations: feedback.recommendations || undefined,
    whatEmployeeDoesWell: feedback.whatEmployeeDoesWell || undefined,
    whatEmployeeCouldImprove: feedback.whatEmployeeCouldImprove || undefined,
    collaborationFeedback: feedback.collaborationFeedback || undefined,
    additionalComments: feedback.additionalComments || undefined,
    isAnonymous: feedback.isAnonymous,
    notes: feedback.notes || undefined,
    status: feedback.status || 'submitted',
  };

  const reviewerId = toIntField(feedback.reviewerId);
  if (reviewerId) payload.reviewerId = reviewerId;

  for (const field of FEEDBACK_RATING_FIELDS) {
    const score = toRatingField(feedback[field]);
    if (score !== undefined) payload[field] = score;
  }

  return payload;
};

const formatApiDetail = (detail: unknown): string | undefined => {
  if (!detail) return undefined;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) return String((item as { msg: string }).msg);
        return undefined;
      })
      .filter(Boolean)
      .join('; ');
  }
  return undefined;
};

const ReviewScoreField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) => (
  <FormField label={label} help={`Rate ${label.toLowerCase()} from 1 to 5`}>
    <select
      className={INPUT_CLS}
      value={value > 0 ? String(value) : ''}
      onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
    >
      <option value="">Select Rating</option>
      <option value="1">Poor</option>
      <option value="2">Satisfactory</option>
      <option value="3">Average</option>
      <option value="4">Excellent</option>
      <option value="5">Outstanding</option>
    </select>
  </FormField>
);

const ReviewTextAreaField = ({
  label,
  help,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  help: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <FormField label={label} help={help} multiline>
    <textarea
      className={TEXTAREA_CLS}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  </FormField>
);

const FormSectionTitle = ({ title }: { title: string }) => (
  <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
    <span className="w-1.5 h-4 rounded-full bg-[#1C64F2]" /> {title}
  </h3>
);

type FormDataValue = string | number | boolean | string[] | null | undefined;

const FeedbackRatingField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FormDataValue;
  onChange: (value: number) => void;
}) => (
  <FormField label={label} help={`Rate ${label.toLowerCase()} from 1 to 5`}>
    <select
      className={INPUT_CLS}
      value={value ? String(value) : ''}
      onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
    >
      <option value="">Select Rating</option>
      <option value="1">Poor</option>
      <option value="2">Satisfactory</option>
      <option value="3">Average</option>
      <option value="4">Excellent</option>
      <option value="5">Outstanding</option>
    </select>
  </FormField>
);

const GoalFeedbackForm = ({ type, data: _formData, setData, companies }: {
  type: 'goal' | 'feedback';
  data: Record<string, FormDataValue>;
  setData: Dispatch<SetStateAction<Record<string, FormDataValue>>>;
  companies: Company[];
}) => {
  const data = _formData as Record<string, string | number | string[] | null | undefined>;
  const patchData = (patch: Record<string, FormDataValue>) => {
    setData((prev) => ({ ...prev, ...patch }));
  };

  if (type === 'goal') {
    return (
      <>
        <section>
          <FormSectionTitle title="Employee & Scope" />
          <EmployeeScopedCascade
            companies={companies}
            companyId={data.companyId ? String(data.companyId) : ''}
            branchId={data.branchId ? String(data.branchId) : ''}
            departmentId={data.departmentId ? String(data.departmentId) : ''}
            employeeId={data.employeeId ? String(data.employeeId) : ''}
            onScopeChange={(patch) => setData((prev) => ({ ...prev, ...patch }))}
            onCompanyChange={(val) => setData((prev) => ({ ...prev, companyId: val }))}
            onBranchChange={(val) => setData((prev) => ({ ...prev, branchId: val }))}
            onDepartmentChange={(val) => setData((prev) => ({ ...prev, departmentId: val }))}
            onEmployeeChange={(val) => setData((prev) => ({ ...prev, employeeId: val }))}
          />
        </section>

        <section>
          <FormSectionTitle title="Goal Details" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <FormField label="Goal Title" required help="What this goal achieves">
              <input className={INPUT_CLS} value={data.title || ''} onChange={e => patchData({ title: e.target.value })} placeholder="e.g. Increase Q4 sales by 20%" />
            </FormField>
            <FormField label="Goal Type" help="Type of goal">
              <select className={INPUT_CLS} value={data.goalType || 'OKR'} onChange={e => patchData({ goalType: e.target.value })}>
                <option value="OKR">OKR</option><option value="KPI">KPI</option><option value="Milestone">Milestone</option><option value="Development">Development</option>
              </select>
            </FormField>
            <FormField label="Category" help="Goal category">
              <select className={INPUT_CLS} value={data.category || ''} onChange={e => patchData({ category: e.target.value })}>
                <option value="">Select</option><option value="performance">Performance</option><option value="learning">Learning</option><option value="project">Project</option><option value="personal">Personal</option>
              </select>
            </FormField>
          </div>
          <div className="mt-4">
            <FormField label="Description" help="Describe the goal" multiline>
              <textarea className={TEXTAREA_CLS} value={data.description || ''} onChange={e => patchData({ description: e.target.value })} placeholder="Describe the goal..." />
            </FormField>
          </div>
        </section>

        <section>
          <FormSectionTitle title="Timeline & Progress" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <FormField label="Start Date" help="When the goal begins">
              <DatePicker value={(data.startDate ?? '') as string} onChange={(val) => patchData({ startDate: val })} />
            </FormField>
            <FormField label="End Date" help="Target completion date">
              <DatePicker value={(data.endDate ?? '') as string} onChange={(val) => patchData({ endDate: val })} />
            </FormField>
            <FormField label="Progress (%)" help="Current completion percentage">
              <input type="number" min="0" max="100" className={INPUT_CLS} value={data.progress || 0} onChange={e => patchData({ progress: parseInt(e.target.value, 10) || 0 })} />
            </FormField>
          </div>
        </section>

        <section>
          <FormSectionTitle title="Priority & Metrics" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <FormField label="Priority" help="Goal priority level">
              <select className={INPUT_CLS} value={data.priority || 'medium'} onChange={e => patchData({ priority: e.target.value })}>
                <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select>
            </FormField>
            <FormField label="Status" help="Current goal status">
              <select className={INPUT_CLS} value={data.status || 'active'} onChange={e => patchData({ status: e.target.value })}>
                <option value="active">Active</option><option value="completed">Completed</option><option value="on_hold">On Hold</option><option value="cancelled">Cancelled</option>
              </select>
            </FormField>
            <FormField label="Aligned With" help="Parent team or company goal">
              <input className={INPUT_CLS} value={data.alignedWith || ''} onChange={e => patchData({ alignedWith: e.target.value })} placeholder="e.g. Company goal" />
            </FormField>
            <FormField label="Objective" help="Main objective statement" multiline>
              <textarea className={TEXTAREA_CLS} value={data.objective || ''} onChange={e => patchData({ objective: e.target.value })} placeholder="Main objective..." />
            </FormField>
            <div className="flex flex-col">
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Key Results</label>
              <p className="text-xs text-gray-400 mb-2">Add measurable results that indicate goal completion</p>
              <div className="space-y-2">
                {(Array.isArray(data.keyResultsParsed) ? data.keyResultsParsed : []).map((kr: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-[#94A3B8] w-5 text-center shrink-0">{idx + 1}.</span>
                    <input
                      className={INPUT_CLS}
                      value={kr}
                      onChange={e => {
                        const updated = [...(Array.isArray(data.keyResultsParsed) ? data.keyResultsParsed : [])];
                        updated[idx] = e.target.value;
                        patchData({ keyResultsParsed: updated, keyResults: JSON.stringify(updated) });
                      }}
                      placeholder={`Key result ${idx + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const updated = (Array.isArray(data.keyResultsParsed) ? data.keyResultsParsed : []).filter((_: string, i: number) => i !== idx);
                        patchData({ keyResultsParsed: updated, keyResults: JSON.stringify(updated) });
                      }}
                      className="p-1.5 text-[#C81E1E] hover:bg-[#C81E1E]/10 rounded-lg transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const updated = [...(Array.isArray(data.keyResultsParsed) ? data.keyResultsParsed : []), ''];
                    patchData({ keyResultsParsed: updated, keyResults: JSON.stringify(updated) });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Key Result
                </button>
              </div>
            </div>
            <FormField label="Comments" help="Additional notes">
              <textarea className={TEXTAREA_CLS} value={data.comments || ''} onChange={e => patchData({ comments: e.target.value })} placeholder="Notes..." />
            </FormField>
          </div>
        </section>
      </>
    );
  }

  // Feedback form
  return (
    <>
      <section>
        <FormSectionTitle title="Employee & Scope" />
        <EmployeeScopedCascade
          companies={companies}
          companyId={data.companyId ? String(data.companyId) : ''}
          branchId={data.branchId ? String(data.branchId) : ''}
          departmentId={data.departmentId ? String(data.departmentId) : ''}
          employeeId={data.employeeId ? String(data.employeeId) : ''}
          onScopeChange={(patch) => setData((prev) => ({ ...prev, ...patch }))}
          onCompanyChange={(val) => setData((prev) => ({ ...prev, companyId: val }))}
          onBranchChange={(val) => setData((prev) => ({ ...prev, branchId: val }))}
          onDepartmentChange={(val) => setData((prev) => ({ ...prev, departmentId: val }))}
          onEmployeeChange={(val) => setData((prev) => ({ ...prev, employeeId: val }))}
          extra={
            <>
              <FormField label="Feedback Type" required help="Who is providing this feedback">
                <select className={INPUT_CLS} value={data.feedbackType || 'peer'} onChange={e => patchData({ feedbackType: e.target.value })}>
                  <option value="peer">Peer</option><option value="manager">Manager</option><option value="self">Self</option><option value="subordinate">Subordinate</option><option value="client">Client</option>
                </select>
              </FormField>
              <FormField label="Feedback Cycle" help="Review cycle frequency">
                <select className={INPUT_CLS} value={data.feedbackCycle || ''} onChange={e => patchData({ feedbackCycle: e.target.value })}>
                  <option value="">Select</option><option value="quarterly">Quarterly</option><option value="semi-annual">Semi-Annual</option><option value="annual">Annual</option>
                </select>
              </FormField>
            </>
          }
        />
      </section>

      <section>
        <FormSectionTitle title="Relationship & Context" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
          <FormField label="Relationship Type" help="Working relationship with employee">
            <select className={INPUT_CLS} value={data.relationshipType || ''} onChange={e => patchData({ relationshipType: e.target.value })}>
              <option value="">Select</option><option value="peer">Peer</option><option value="direct_report">Direct Report</option><option value="manager">Manager</option><option value="cross_team">Cross-Team</option>
            </select>
          </FormField>
          <FormField label="Collaboration Duration" help="How long you've worked together">
            <input className={INPUT_CLS} value={data.collaborationDuration || ''} onChange={e => patchData({ collaborationDuration: e.target.value })} placeholder="e.g. 6 months, 2 years" />
          </FormField>
          <FormField label="Feedback Period" help="Period being evaluated">
            <input className={INPUT_CLS} value={data.feedbackPeriod || ''} onChange={e => patchData({ feedbackPeriod: e.target.value })} placeholder="e.g. Q1, H1 2026" />
          </FormField>
        </div>
      </section>

      <section>
        <FormSectionTitle title="Competency Ratings" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
          <FeedbackRatingField label="Communication" value={data.communicationRating} onChange={(value) => patchData({ communicationRating: value })} />
          <FeedbackRatingField label="Teamwork" value={data.teamworkRating} onChange={(value) => patchData({ teamworkRating: value })} />
          <FeedbackRatingField label="Leadership" value={data.leadershipRating} onChange={(value) => patchData({ leadershipRating: value })} />
          <FeedbackRatingField label="Problem Solving" value={data.problemSolvingRating} onChange={(value) => patchData({ problemSolvingRating: value })} />
          <FeedbackRatingField label="Reliability" value={data.reliabilityRating} onChange={(value) => patchData({ reliabilityRating: value })} />
          <FeedbackRatingField label="Adaptability" value={data.adaptabilityRating} onChange={(value) => patchData({ adaptabilityRating: value })} />
          <FeedbackRatingField label="Overall Rating" value={data.overallRating} onChange={(value) => patchData({ overallRating: value })} />
        </div>
      </section>

      <section>
        <FormSectionTitle title="Feedback Content" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
          <div className="flex flex-col"><label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Strengths</label><textarea className={TEXTAREA_CLS} value={data.strengths || ''} onChange={e => patchData({ strengths: e.target.value })} placeholder="Key strengths observed..." /></div>
          <div className="flex flex-col"><label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Areas for Improvement</label><textarea className={TEXTAREA_CLS} value={data.areasForImprovement || ''} onChange={e => patchData({ areasForImprovement: e.target.value })} placeholder="Areas needing improvement..." /></div>
          <div className="flex flex-col"><label className="block text-sm font-medium text-[var(--text-primary)] mb-1">What Employee Does Well</label><textarea className={TEXTAREA_CLS} value={data.whatEmployeeDoesWell || ''} onChange={e => patchData({ whatEmployeeDoesWell: e.target.value })} placeholder="Specific strengths..." /></div>
          <div className="flex flex-col"><label className="block text-sm font-medium text-[var(--text-primary)] mb-1">What Employee Could Improve</label><textarea className={TEXTAREA_CLS} value={data.whatEmployeeCouldImprove || ''} onChange={e => patchData({ whatEmployeeCouldImprove: e.target.value })} placeholder="Growth areas..." /></div>
          <div className="flex flex-col"><label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Collaboration Feedback</label><textarea className={TEXTAREA_CLS} value={data.collaborationFeedback || ''} onChange={e => patchData({ collaborationFeedback: e.target.value })} placeholder="How they collaborate..." /></div>
          <div className="flex flex-col"><label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Additional Comments</label><textarea className={TEXTAREA_CLS} value={data.additionalComments || ''} onChange={e => patchData({ additionalComments: e.target.value })} placeholder="Any other feedback..." /></div>
        </div>
      </section>

      <section>
        <FormSectionTitle title="Submission" />
        <div className="flex items-center gap-2 mt-3">
          <input type="checkbox" checked={!!data.isAnonymous} onChange={e => patchData({ isAnonymous: e.target.checked })} className="w-4 h-4 text-[#1C64F2] rounded" />
          <label className="text-sm text-[var(--text-primary)]">Submit anonymously</label>
        </div>
      </section>
    </>
  );
};

const Performance = () => {
const [activeTab, setActiveTab] = useState('reviews');

const [includeInactive, setIncludeInactive] = useState(false);

  const [companyFilter, setCompanyFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [newReview, setNewReview] = useState({
    employeeId: '',
    reviewerId: '',
    reviewPeriod: '',
    reviewYear: new Date().getFullYear().toString(),
    organizationId: '',
    companyId: '',
    branchId: '',
    departmentId: '',
    productivityScore: 0,
    qualityScore: 0,
    communicationScore: 0,
    teamworkScore: 0,
    leadershipScore: 0,
    initiativeScore: 0,
    punctualityScore: 0,
    problemSolvingScore: 0,
    collaborationScore: 0,
    adaptabilityScore: 0,
    creativityScore: 0,
    attendanceScore: 0,
    goalsSet: '',
    goalsAchieved: '',
    strengths: '',
    areasForImprovement: '',
    developmentPlan: '',
    achievements: '',
    keyProjects: '',
    trainingNeeds: '',
    reviewerName: '',
    reviewerPosition: '',
    reviewCycle: '',
    promotionEligible: false,
    salaryRecommendation: '',
    salaryPercentage: 0,
    nextReviewDate: '',
    reviewerComments: '',
    employeeComments: '',
    notes: '',
    rating: '',
    status: '',
    overallScore: 0,
  });


  
  useEmployeePicker({ status: 'active' });

  const { data: reviews = [], isLoading, isFetching } = useQuery({
    queryKey: ['performance-reviews', includeInactive],
    queryFn: async () => {
      const response = await api.get('/performance/reviews', { params: { includeInactive } });
      return response.data || [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: goals = [], isLoading: goalsLoading } = useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const response = await api.get('/goals');
      return response.data || [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: feedback = [], isLoading: feedbackLoading } = useQuery({
    queryKey: ['feedback'],
    queryFn: async () => {
      const response = await api.get('/feedback');
      return response.data || [];
    },
    staleTime: 2 * 60 * 1000,
  });

  // Master data for performance dropdowns
  const { data: salaryRecommendationOptions = [] } = useMasterData('SALARY_RECOMMENDATIONS');
  
  const { data: promotionEligibleOptions = [] } = useMasterData('PROMOTION_ELIGIBLE');
  const { data: reviewPeriodOptions = [] } = useMasterData('PERFORMANCE_REVIEW_PERIOD');
  const { data: reviewCycleOptions = [] } = useMasterData('PERFORMANCE_REVIEW_CYCLE');
  const { data: performanceStatusOptions = [] } = useMasterData('PERFORMANCE_STATUS');
  const queryClient = useQueryClient();
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Goal form state
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [isGoalClosing, setIsGoalClosing] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalRow | null>(null);
  const [newGoal, setNewGoal] = useState<GoalFormState>({
    employeeId: '', companyId: '', branchId: '', departmentId: '',
    title: '', description: '', goalType: 'OKR', category: '',
    objective: '', keyResults: '', keyResultsParsed: [] as string[],
    startDate: '', endDate: '', targetValue: 0,
    currentValue: 0, progress: 0, status: 'active', priority: 'medium',
    weight: 1.0, alignedWith: '', metricType: '', unit: '', comments: '', notes: '',
  });

  // Feedback form state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [isFeedbackClosing, setIsFeedbackClosing] = useState(false);
  const [editingFeedback, setEditingFeedback] = useState<FeedbackRow | null>(null);
  const [newFeedback, setNewFeedback] = useState<FeedbackFormState>({
    employeeId: '', reviewerId: '', companyId: '', branchId: '', departmentId: '',
    feedbackType: 'peer', feedbackCycle: '', feedbackPeriod: '',
    feedbackYear: new Date().getFullYear(), relationshipType: '',
    collaborationDuration: '', communicationRating: 0, teamworkRating: 0,
    leadershipRating: 0, problemSolvingRating: 0, reliabilityRating: 0,
    adaptabilityRating: 0, overallRating: 0, strengths: '', areasForImprovement: '',
    specificExamples: '', recommendations: '', whatEmployeeDoesWell: '',
    whatEmployeeCouldImprove: '', collaborationFeedback: '', additionalComments: '',
    isAnonymous: false, notes: '', status: 'submitted',
  });

  // Review detail/edit state
  const [showReviewDetail, setShowReviewDetail] = useState(false);
  const [isReviewDetailClosing, setIsReviewDetailClosing] = useState(false);
  const [selectedReview, setSelectedReview] = useState<ReviewRow | null>(null);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [editReviewData, setEditReviewData] = useState<Record<string, string | number>>({});
  const [editingReview, setEditingReview] = useState<ReviewRow | null>(null);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'review' | 'goal' | 'feedback'; id: number; name: string } | null>(null);
  const [bulkDeleteReviews, setBulkDeleteReviews] = useState<{ items: ReviewRow[] } | null>(null);
  const [bulkDeleteGoals, setBulkDeleteGoals] = useState<{ items: GoalRow[] } | null>(null);
  const [bulkDeleteFeedback, setBulkDeleteFeedback] = useState<{ items: FeedbackRow[] } | null>(null);

  const createReviewMutation = useMutation({
    mutationFn: async (data: ReviewFormState) => {
      const response = await api.post('/performance/reviews', buildReviewPayload(data));
      return response.data;
    },
    onSuccess: () => {
      toast.success('Performance review submitted');
      queryClient.invalidateQueries({ queryKey: ['performance-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['performance-stats'] });
      handleCloseDrawer();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: unknown; message?: string } }; message?: string };
      toast.error(formatApiDetail(err.response?.data?.detail) || err.response?.data?.message || err.message || 'Failed to submit review');
    },
  });

  const handleSubmitReview = () => {
    if (editingReview) {
      updateReviewMutation.mutate({ id: editingReview.id, data: newReview });
    } else {
      createReviewMutation.mutate(newReview);
    }
  };
  const bulkUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/performance/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Bulk upload completed: ${data?.created || 0} created, ${data?.updated || 0} updated`);
      setShowBulkUpload(false);
      setUploadFile(null);
      queryClient.invalidateQueries({ queryKey: ['performance-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['performance-stats'] });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(`Bulk upload failed: ${err.response?.data?.message || err.message}`);
    },
  });

  // Goal mutations
  const createGoalMutation = useMutation({
    mutationFn: async (data: GoalFormState) => {
      const response = await api.post('/goals', buildGoalPayload(data));
      return response.data;
    },
    onSuccess: () => {
      toast.success('Goal created');
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      handleCloseGoalModal();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: unknown } }; message?: string };
      toast.error(formatApiDetail(err.response?.data?.detail) || err.message || 'Failed to save goal');
    },
  });

  const updateGoalMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: GoalFormState }) => {
      const response = await api.put(`/goals/${id}`, buildGoalPayload(data));
      return response.data;
    },
    onSuccess: () => {
      toast.success('Goal updated');
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      handleCloseGoalModal();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: unknown } }; message?: string };
      toast.error(formatApiDetail(err.response?.data?.detail) || err.message || 'Failed to update goal');
    },
  });

  // Feedback mutations
  const createFeedbackMutation = useMutation({
    mutationFn: async (data: FeedbackFormState) => {
      const response = await api.post('/feedback', buildFeedbackPayload(data));
      return response.data;
    },
    onSuccess: () => {
      toast.success('Feedback submitted');
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      handleCloseFeedbackModal();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: unknown } }; message?: string };
      toast.error(formatApiDetail(err.response?.data?.detail) || err.message || 'Failed to save feedback');
    },
  });

  const updateFeedbackMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: FeedbackFormState }) => {
      const response = await api.put(`/feedback/${id}`, buildFeedbackPayload(data));
      return response.data;
    },
    onSuccess: () => {
      toast.success('Feedback updated');
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      handleCloseFeedbackModal();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: unknown } }; message?: string };
      toast.error(formatApiDetail(err.response?.data?.detail) || err.message || 'Failed to update feedback');
    },
  });

  // Delete mutations
  const deleteReviewMutation = useMutation({
    mutationFn: async (id: number) => { await api.delete(`/performance/reviews/${id}`); },
    onSuccess: () => {
      toast.success('Review deleted');
      queryClient.invalidateQueries({ queryKey: ['performance-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['performance-stats'] });
      setDeleteConfirm(null);
      setShowReviewDetail(false);
    },
    onError: () => { toast.error('Failed to delete review'); setDeleteConfirm(null); },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: async (id: number) => { await api.delete(`/goals/${id}`); },
    onSuccess: () => {
      toast.success('Goal deleted');
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setDeleteConfirm(null);
    },
    onError: () => { toast.error('Failed to delete goal'); setDeleteConfirm(null); },
  });

  const deleteFeedbackMutation = useMutation({
    mutationFn: async (id: number) => { await api.delete(`/feedback/${id}`); },
    onSuccess: () => {
      toast.success('Feedback deleted');
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      setDeleteConfirm(null);
    },
    onError: () => { toast.error('Failed to delete feedback'); setDeleteConfirm(null); },
  });

  // Companies / Branches / Departments for filters
    const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => { try { const r = await api.get('/companies'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });
  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => { try { const r = await api.get('/branches'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => { try { const r = await api.get('/departments'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });

  const { data: stats = { totalReviews: 0, completed: 0, pending: 0, avgRating: 0 } } = useQuery({
    queryKey: ['performance-stats'],
    queryFn: async () => {
      const response = await api.get('/performance/stats');
      return response.data || { totalReviews: 0, completed: 0, pending: 0, avgRating: 0 };
    },
  });

  const filteredReviews = reviews.filter((r: ReviewRow) => {
    const matchCompany = companyFilter === 'all' || r.company_id?.toString() === companyFilter;
    const matchBranch = branchFilter === 'all' || r.branch_id?.toString() === branchFilter;
    const matchDept = departmentFilter === 'all' || r.department_id?.toString() === departmentFilter;
    const matchStatus = statusFilter === 'all' || r.status?.toLowerCase() === statusFilter.toLowerCase();
    
    const rDate = r.createdAt || r.date || r.updatedAt;
    const matchStart = !startDate || (rDate && rDate.substring(0, 10) >= startDate);
    const matchEnd = !endDate || (rDate && rDate.substring(0, 10) <= endDate);

    return matchCompany && matchBranch && matchDept && matchStatus && matchStart && matchEnd;
  });

  const goalStats = {
    total: goals.length,
    active: goals.filter((g: GoalRow) => g.status === 'active').length,
    completed: goals.filter((g: GoalRow) => g.status === 'completed').length,
    avgProgress: goals.length > 0 ? Math.round(goals.reduce((sum: number, g: GoalRow) => sum + (g.progress || 0), 0) / goals.length) : 0,
  };

  const feedbackStats = {
    total: feedback.length,
    submitted: feedback.filter((f: FeedbackRow) => f.status === 'submitted').length,
    avgRating: feedback.length > 0 ? (feedback.reduce((sum: number, f: FeedbackRow) => sum + (f.overallRating || 0), 0) / feedback.length).toFixed(1) : '0',
  };

  const statCards = activeTab === 'reviews' ? [
    { label: 'Total Reviews', value: stats.totalReviews || 0, icon: Target, color: 'blue', tooltip: 'Total performance reviews', trend: stats.totalReviews > 0 ? 5 : 0, onClick: () => setActiveTab('reviews') },
    { label: 'Completed', value: stats.completed || 0, icon: CheckCircle2, color: 'green', tooltip: 'Reviews completed', trend: stats.completed > 0 ? 8 : 0, onClick: () => setActiveTab('reviews') },
    { label: 'Pending', value: stats.pending || 0, icon: TrendingUp, color: 'orange', tooltip: 'Reviews pending completion', trend: stats.pending > 0 ? -stats.pending : 0, onClick: () => setActiveTab('reviews') },
    { label: 'Avg Rating', value: stats.avgRating || 0, icon: Star, color: 'purple', tooltip: 'Average performance rating', trend: 3, onClick: () => setActiveTab('reviews') },
  ] : activeTab === 'goals' ? [
    { label: 'Total Goals', value: goalStats.total, icon: Target, color: 'blue', tooltip: 'Total organizational goals', trend: goalStats.total > 0 ? 5 : 0, onClick: () => setActiveTab('goals') },
    { label: 'Active', value: goalStats.active, icon: TrendingUp, color: 'orange', tooltip: 'Goals currently in progress', trend: goalStats.active > 0 ? 3 : 0, onClick: () => setActiveTab('goals') },
    { label: 'Completed', value: goalStats.completed, icon: CheckCircle2, color: 'green', tooltip: 'Goals completed', trend: goalStats.completed > 0 ? 12 : 0, onClick: () => setActiveTab('goals') },
    { label: 'Avg Progress', value: `${goalStats.avgProgress}%`, icon: BarChart3, color: 'purple', tooltip: 'Average completion percentage', trend: goalStats.avgProgress > 50 ? 7 : -2, onClick: () => setActiveTab('goals') },
  ] : activeTab === 'feedback' ? [
    { label: 'Total Feedback', value: feedbackStats.total, icon: Users, color: 'blue', tooltip: 'Total 360 feedback entries', trend: feedbackStats.total > 0 ? 5 : 0, onClick: () => setActiveTab('feedback') },
    { label: 'Submitted', value: feedbackStats.submitted, icon: CheckCircle2, color: 'green', tooltip: 'Feedback forms submitted', trend: feedbackStats.submitted > 0 ? 10 : 0, onClick: () => setActiveTab('feedback') },
    { label: 'Avg Rating', value: feedbackStats.avgRating, icon: Star, color: 'purple', tooltip: 'Average rating from peers', trend: 2, onClick: () => setActiveTab('feedback') },
    { label: 'Reviews', value: stats.totalReviews || 0, icon: Target, color: 'orange', tooltip: 'Associated performance reviews', trend: 0, onClick: () => setActiveTab('reviews') },
  ] : [
    { label: 'Total Reviews', value: stats.totalReviews || 0, icon: Target, color: 'blue', tooltip: 'Total performance reviews', trend: stats.totalReviews > 0 ? 5 : 0, onClick: () => setActiveTab('reviews') },
    { label: 'Completed', value: stats.completed || 0, icon: CheckCircle2, color: 'green', tooltip: 'Reviews completed', trend: stats.completed > 0 ? 8 : 0, onClick: () => setActiveTab('reviews') },
    { label: 'Pending', value: stats.pending || 0, icon: TrendingUp, color: 'orange', tooltip: 'Reviews pending completion', trend: stats.pending > 0 ? -stats.pending : 0, onClick: () => setActiveTab('reviews') },
    { label: 'Avg Rating', value: stats.avgRating || 0, icon: Star, color: 'purple', tooltip: 'Average performance rating', trend: 3, onClick: () => setActiveTab('reviews') },
  ];

  const getCompanyName = (id?: number) => companies.find((c: Company) => c.id === id)?.name || '-';
  const getBranchName = (id?: number) => branches.find((b: { id: number; name: string }) => b.id === id)?.name || '-';
  const getDeptName = (id?: number) => departments.find((d: Department) => d.id === id)?.name || '-';

  const handleCloseDrawer = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowModal(false);
      setEditingReview(null);
      setIsClosing(false);
      setNewReview({
        employeeId: '',
        reviewerId: '',
        reviewPeriod: '',
        reviewYear: new Date().getFullYear().toString(),
        organizationId: '',
        companyId: '',
        branchId: '',
        departmentId: '',
        productivityScore: 0,
        qualityScore: 0,
        communicationScore: 0,
        teamworkScore: 0,
        leadershipScore: 0,
        initiativeScore: 0,
        punctualityScore: 0,
        problemSolvingScore: 0,
        collaborationScore: 0,
        adaptabilityScore: 0,
        creativityScore: 0,
        attendanceScore: 0,
        goalsSet: '',
        goalsAchieved: '',
        strengths: '',
        areasForImprovement: '',
        developmentPlan: '',
        achievements: '',
        keyProjects: '',
        trainingNeeds: '',
        reviewerName: '',
        reviewerPosition: '',
        reviewCycle: '',
        promotionEligible: false,
        salaryRecommendation: '',
        salaryPercentage: 0,
        nextReviewDate: '',
        reviewerComments: '',
        employeeComments: '',
        notes: '',
        rating: '',
        status: '',
        overallScore: 0,
      });
    }, 300);
  };

  const handleCloseGoalModal = () => {
    setIsGoalClosing(true);
    setTimeout(() => {
      setShowGoalModal(false);
      setEditingGoal(null);
      setIsGoalClosing(false);
      setNewGoal({
        employeeId: '', companyId: '', branchId: '', departmentId: '',
        title: '', description: '', goalType: 'OKR', category: '',
        objective: '', keyResults: '', keyResultsParsed: [],
        startDate: '', endDate: '', targetValue: 0,
        currentValue: 0, progress: 0, status: 'active', priority: 'medium',
        weight: 1.0, alignedWith: '', metricType: '', unit: '', comments: '', notes: '',
      });
    }, 300);
  };

  const handleCloseFeedbackModal = () => {
    setIsFeedbackClosing(true);
    setTimeout(() => {
      setShowFeedbackModal(false);
      setEditingFeedback(null);
      setIsFeedbackClosing(false);
      setNewFeedback({
        employeeId: '', reviewerId: '', companyId: '', branchId: '', departmentId: '',
        feedbackType: 'peer', feedbackCycle: '', feedbackPeriod: '',
        feedbackYear: new Date().getFullYear(), relationshipType: '',
        collaborationDuration: '', communicationRating: 0, teamworkRating: 0,
        leadershipRating: 0, problemSolvingRating: 0, reliabilityRating: 0,
        adaptabilityRating: 0, overallRating: 0, strengths: '', areasForImprovement: '',
        specificExamples: '', recommendations: '', whatEmployeeDoesWell: '',
        whatEmployeeCouldImprove: '', collaborationFeedback: '', additionalComments: '',
        isAnonymous: false, notes: '', status: 'submitted',
      });
    }, 300);
  };

  const handleCloseReviewDetail = () => {
    setIsReviewDetailClosing(true);
    setTimeout(() => {
      setShowReviewDetail(false);
      setSelectedReview(null);
      setIsEditingReview(false);
    }, 300);
  };

  const handleOpenReviewDrawer = (review?: ReviewRow) => {
    setIsClosing(false);
    if (review) {
      setEditingReview(review);
      setNewReview({
        employeeId: review.employeeId?.toString() || '',
        reviewerId: review.reviewerId?.toString() || '',
        reviewPeriod: review.reviewPeriod || '',
        reviewYear: review.reviewYear?.toString() || new Date().getFullYear().toString(),
        organizationId: '',
        companyId: review.company_id?.toString() || '',
        branchId: review.branch_id?.toString() || '',
        departmentId: review.department_id?.toString() || '',
        productivityScore: review.productivityScore || 0,
        qualityScore: review.qualityScore || 0,
        communicationScore: review.communicationScore || 0,
        teamworkScore: review.teamworkScore || 0,
        leadershipScore: review.leadershipScore || 0,
        initiativeScore: review.initiativeScore || 0,
        punctualityScore: review.punctualityScore || 0,
        problemSolvingScore: review.problemSolvingScore || 0,
        collaborationScore: review.collaborationScore || 0,
        adaptabilityScore: review.adaptabilityScore || 0,
        creativityScore: review.creativityScore || 0,
        attendanceScore: review.attendanceScore || 0,
        goalsSet: review.goalsSet || '',
        goalsAchieved: review.goalsAchieved || '',
        strengths: review.strengths || '',
        areasForImprovement: review.areasForImprovement || '',
        developmentPlan: review.developmentPlan || '',
        achievements: review.achievements || '',
        keyProjects: review.keyProjects || '',
        trainingNeeds: review.trainingNeeds || '',
        reviewerName: review.reviewerName || '',
        reviewerPosition: review.reviewerPosition || '',
        reviewCycle: review.reviewCycle || '',
        promotionEligible: review.promotionEligible || false,
        salaryRecommendation: review.salaryRecommendation || '',
        salaryPercentage: review.salaryPercentage || 0,
        nextReviewDate: review.nextReviewDate || '',
        reviewerComments: review.reviewerComments || '',
        employeeComments: review.employeeComments || '',
        notes: review.notes || '',
        rating: review.rating || '',
        status: review.status || '',
        overallScore: review.overallScore || 0,
      });
    } else {
      setEditingReview(null);
      setNewReview({
        employeeId: '',
        reviewerId: '',
        reviewPeriod: '',
        reviewYear: new Date().getFullYear().toString(),
        organizationId: '',
        companyId: '',
        branchId: '',
        departmentId: '',
        productivityScore: 0,
        qualityScore: 0,
        communicationScore: 0,
        teamworkScore: 0,
        leadershipScore: 0,
        initiativeScore: 0,
        punctualityScore: 0,
        problemSolvingScore: 0,
        collaborationScore: 0,
        adaptabilityScore: 0,
        creativityScore: 0,
        attendanceScore: 0,
        goalsSet: '',
        goalsAchieved: '',
        strengths: '',
        areasForImprovement: '',
        developmentPlan: '',
        achievements: '',
        keyProjects: '',
        trainingNeeds: '',
        reviewerName: '',
        reviewerPosition: '',
        reviewCycle: '',
        promotionEligible: false,
        salaryRecommendation: '',
        salaryPercentage: 0,
        nextReviewDate: '',
        reviewerComments: '',
        employeeComments: '',
        notes: '',
        rating: '',
        status: '',
        overallScore: 0,
      });
    }
    setShowModal(true);
  };

  const handleOpenGoalModal = (goal?: GoalRow) => {
    setIsGoalClosing(false);
    if (goal) {
      setEditingGoal(goal);
      const parseKeyResults = (kr?: string) => {
        if (!kr) return [];
        try { const p = JSON.parse(kr); return Array.isArray(p) ? p : []; } catch { return []; }
      };
      setNewGoal({
        employeeId: goal.employeeId?.toString() || '',
        companyId: goal.company_id?.toString() || '', branchId: goal.branch_id?.toString() || '', departmentId: goal.department_id?.toString() || '',
        title: goal.title || '',
        description: goal.description || '',
        goalType: goal.goalType || 'OKR',
        category: goal.category || '',
        objective: goal.objective || '', keyResults: goal.keyResults || '',
        keyResultsParsed: parseKeyResults(goal.keyResults),
        startDate: '', endDate: goal.dueDate || '',
        targetValue: goal.targetValue || 0, currentValue: goal.currentValue || 0, progress: goal.progress || 0,
        status: goal.status || 'active', priority: goal.priority || 'medium',
        weight: goal.weight || 1.0, alignedWith: goal.alignedWith || '', metricType: goal.metricType || '', unit: goal.unit || '', comments: '', notes: '',
      });
    } else {
      setEditingGoal(null);
      setNewGoal({
        employeeId: '', companyId: '', branchId: '', departmentId: '',
        title: '', description: '', goalType: 'OKR', category: '',
        objective: '', keyResults: '', keyResultsParsed: [],
        startDate: '', endDate: '', targetValue: 0,
        currentValue: 0, progress: 0, status: 'active', priority: 'medium',
        weight: 1.0, alignedWith: '', metricType: '', unit: '', comments: '', notes: '',
      });
    }
    setShowGoalModal(true);
  };

  const handleOpenFeedbackModal = (fb?: FeedbackRow) => {
    setIsFeedbackClosing(false);
    if (fb) {
      setEditingFeedback(fb);
      setNewFeedback({
        employeeId: fb.employeeId?.toString() || '',
        reviewerId: fb.reviewerId?.toString() || '',
        companyId: fb.company_id?.toString() || '', branchId: fb.branch_id?.toString() || '', departmentId: fb.department_id?.toString() || '',
        feedbackType: fb.feedbackType || 'peer',
        feedbackCycle: fb.feedbackCycle || '',
        feedbackPeriod: fb.feedbackPeriod || '',
        feedbackYear: fb.feedbackYear || new Date().getFullYear(),
        relationshipType: fb.relationshipType || '', collaborationDuration: fb.collaborationDuration || '',
        communicationRating: fb.communicationRating || 0,
        teamworkRating: fb.teamworkRating || 0,
        leadershipRating: fb.leadershipRating || 0,
        problemSolvingRating: fb.problemSolvingRating || 0,
        reliabilityRating: fb.reliabilityRating || 0,
        adaptabilityRating: fb.adaptabilityRating || 0,
        overallRating: fb.overallRating || 0,
        strengths: fb.strengths || '', areasForImprovement: fb.areasForImprovement || '',
        specificExamples: fb.specificExamples || '', recommendations: fb.recommendations || '',
        whatEmployeeDoesWell: fb.whatEmployeeDoesWell || '', whatEmployeeCouldImprove: fb.whatEmployeeCouldImprove || '',
        collaborationFeedback: fb.collaborationFeedback || '', additionalComments: fb.additionalComments || '',
        isAnonymous: fb.isAnonymous || false, notes: '', status: fb.status || 'submitted',
      });
    } else {
      setEditingFeedback(null);
      setNewFeedback({
        employeeId: '', reviewerId: '', companyId: '', branchId: '', departmentId: '',
        feedbackType: 'peer', feedbackCycle: '',
        feedbackPeriod: '', feedbackYear: new Date().getFullYear(), relationshipType: '',
        collaborationDuration: '', communicationRating: 0, teamworkRating: 0,
        leadershipRating: 0, problemSolvingRating: 0, reliabilityRating: 0,
        adaptabilityRating: 0, overallRating: 0, strengths: '', areasForImprovement: '',
        specificExamples: '', recommendations: '', whatEmployeeDoesWell: '',
        whatEmployeeCouldImprove: '', collaborationFeedback: '', additionalComments: '',
        isAnonymous: false, notes: '', status: 'submitted',
      });
    }
    setShowFeedbackModal(true);
  };

  const handleSubmitGoal = () => {
    if (editingGoal) {
      updateGoalMutation.mutate({ id: editingGoal.id, data: newGoal });
    } else {
      createGoalMutation.mutate(newGoal);
    }
  };

  const handleSubmitFeedback = () => {
    if (editingFeedback) {
      updateFeedbackMutation.mutate({ id: editingFeedback.id, data: newFeedback });
    } else {
      createFeedbackMutation.mutate(newFeedback);
    }
  };

  const handleSaveReviewEdit = () => {
    if (!selectedReview) return;
    updateReviewMutation.mutate({ id: selectedReview.id, data: editReviewData });
  };

  const updateReviewMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ReviewFormState | Record<string, unknown> }) => {
      const payload = 'employeeId' in data && typeof data.reviewPeriod === 'string'
        ? buildReviewPayload(data as ReviewFormState)
        : data;
      const response = await api.put(`/performance/reviews/${id}`, payload);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Review updated');
      queryClient.invalidateQueries({ queryKey: ['performance-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['performance-stats'] });
      setIsEditingReview(false);
      if (showModal) handleCloseDrawer();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(err.response?.data?.detail || err.message || 'Failed to update review');
    },
  });

  const renderPerformanceForm = () => {
    const setReviewField = <K extends keyof ReviewFormState>(key: K, value: ReviewFormState[K]) => {
      setNewReview((prev) => ({ ...prev, [key]: value }));
    };

    return (
      <>
        <section>
          <FormSectionTitle title="Employee & Period" />
          <EmployeeScopedCascade
            companies={companies}
            companyId={newReview.companyId ? String(newReview.companyId) : ''}
            branchId={newReview.branchId ? String(newReview.branchId) : ''}
            departmentId={newReview.departmentId ? String(newReview.departmentId) : ''}
            employeeId={newReview.employeeId ? String(newReview.employeeId) : ''}
            onScopeChange={(patch) => setNewReview((prev) => ({ ...prev, ...patch }))}
            onCompanyChange={(val) => setNewReview((prev) => ({ ...prev, companyId: val }))}
            onBranchChange={(val) => setNewReview((prev) => ({ ...prev, branchId: val }))}
            onDepartmentChange={(val) => setNewReview((prev) => ({ ...prev, departmentId: val }))}
            onEmployeeChange={(val) => setNewReview((prev) => ({ ...prev, employeeId: val }))}
            extra={
              <>
                <FormField label="Review Period" required help="Period the review covers">
                  <select className={INPUT_CLS} value={newReview.reviewPeriod} onChange={e => setNewReview({ ...newReview, reviewPeriod: e.target.value })}>
                    <option value="">Select Period</option>
                    {reviewPeriodOptions.map((opt: MasterDataOption) => (
                      <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Review Year" required help="Year of the review">
                  <input type="number" className={INPUT_CLS} value={newReview.reviewYear} onChange={e => setNewReview({ ...newReview, reviewYear: e.target.value })} />
                </FormField>
              </>
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <FormField label="Review Cycle" help="Quarterly, half-yearly, etc.">
              <select className={INPUT_CLS} value={newReview.reviewCycle} onChange={e => setNewReview({ ...newReview, reviewCycle: e.target.value })}>
                <option value="">Select Cycle</option>
                {reviewCycleOptions.map((opt: MasterDataOption) => (
                  <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Reviewer Position" help="Reviewer's role, e.g. Manager">
              <input className={INPUT_CLS} value={newReview.reviewerPosition} onChange={e => setNewReview({ ...newReview, reviewerPosition: e.target.value })} placeholder="e.g. Manager, Team Lead" />
            </FormField>
            <FormField label="Reviewer Name" help="Name of the reviewer">
              <input className={INPUT_CLS} value={newReview.reviewerName} onChange={e => setNewReview({ ...newReview, reviewerName: e.target.value })} placeholder="Reviewer's full name" />
            </FormField>
          </div>
        </section>

        <section>
          <FormSectionTitle title="Performance Scores" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            {SCORE_FIELDS.map((keyName) => (
              <ReviewScoreField
                key={keyName}
                label={SCORE_LABELS[keyName]}
                value={newReview[keyName]}
                onChange={(value) => setReviewField(keyName, value)}
              />
            ))}
          </div>
        </section>

        <section>
          <FormSectionTitle title="Goals & Development" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3 items-stretch">
            <ReviewTextAreaField label="Goals Set" help="Goals agreed for this period" placeholder="Goals set for this review period..." value={newReview.goalsSet} onChange={(v) => setReviewField('goalsSet', v)} />
            <ReviewTextAreaField label="Goals Achieved" help="Goals completed" placeholder="Goals achieved during this period..." value={newReview.goalsAchieved} onChange={(v) => setReviewField('goalsAchieved', v)} />
            <ReviewTextAreaField label="Strengths" help="Key strengths observed" placeholder="Employee strengths..." value={newReview.strengths} onChange={(v) => setReviewField('strengths', v)} />
            <ReviewTextAreaField label="Areas for Improvement" help="Areas needing growth" placeholder="Areas needing improvement..." value={newReview.areasForImprovement} onChange={(v) => setReviewField('areasForImprovement', v)} />
            <ReviewTextAreaField label="Development Plan" help="Plan for skill development" placeholder="Development plan for next period..." value={newReview.developmentPlan} onChange={(v) => setReviewField('developmentPlan', v)} />
            <ReviewTextAreaField label="Achievements" help="Notable achievements this period" placeholder="Key achievements..." value={newReview.achievements} onChange={(v) => setReviewField('achievements', v)} />
            <ReviewTextAreaField label="Key Projects" help="Major projects delivered" placeholder="Projects worked on..." value={newReview.keyProjects} onChange={(v) => setReviewField('keyProjects', v)} />
            <ReviewTextAreaField label="Training Needs" help="Training the employee requires" placeholder="Training requirements..." value={newReview.trainingNeeds} onChange={(v) => setReviewField('trainingNeeds', v)} />
          </div>
        </section>

        <section>
          <FormSectionTitle title="Promotion & Next Steps" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <FormField label="Promotion Eligible" help="Whether employee is eligible for promotion">
              <select className={INPUT_CLS} value={newReview.promotionEligible ? 'yes' : 'no'} onChange={e => setNewReview({ ...newReview, promotionEligible: e.target.value === 'yes' })}>
                {promotionEligibleOptions.map((opt: MasterDataOption) => <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>)}
              </select>
            </FormField>
            <FormField label="Salary Recommendation" help="Recommended salary action">
              <select className={INPUT_CLS} value={newReview.salaryRecommendation} onChange={e => setNewReview({ ...newReview, salaryRecommendation: e.target.value })}>
                <option value="">Select</option>
                {salaryRecommendationOptions.map((opt: MasterDataOption) => (
                  <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Salary Percentage (%)" help="Recommended hike percentage">
              <input type="number" step="0.1" className={INPUT_CLS} value={newReview.salaryPercentage} onChange={e => setNewReview({ ...newReview, salaryPercentage: parseFloat(e.target.value) })} />
            </FormField>
            <ReviewTextAreaField label="Reviewer Comments" help="Reviewer's overall comments" placeholder="Reviewer's comments..." value={newReview.reviewerComments} onChange={(v) => setReviewField('reviewerComments', v)} />
            <ReviewTextAreaField label="Employee Comments" help="Employee's own comments" placeholder="Employee's comments..." value={newReview.employeeComments} onChange={(v) => setReviewField('employeeComments', v)} />
            <ReviewTextAreaField label="Notes" help="Any additional notes" placeholder="Additional notes..." value={newReview.notes} onChange={(v) => setReviewField('notes', v)} />
            <FormField label="Next Review Date" help="Date of the next review">
              <DatePicker value={newReview.nextReviewDate} onChange={(val) => setNewReview({ ...newReview, nextReviewDate: val })} />
            </FormField>
          </div>
        </section>
      </>
    );
  };

  const [hasLoaded, setHasLoaded] = useState(false);
  if (!hasLoaded && reviews.length > 0) setHasLoaded(true);

  const isInitialPerfLoading = !hasLoaded && isFetching;
  if (isInitialPerfLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] animate-page-enter">
        <div className="w-full mx-auto space-y-6 p-6">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] animate-page-enter">
      <div className="w-full mx-auto space-y-6">
        {/* Header Section */}
        <PageHero
          title="Performance Management"
          subtitle="Track reviews, goals, achievements"
          icon={TrendingUp}
          accent="emerald"
          breadcrumbs={['HRMS.Pro!', 'Performance']}
          actions={
            <>
              <button
                onClick={async () => {
                  toast.loading('AI summarizing performance...', { id: 'ai-perf' });
                  try { await runAutomation('review_summarize', {}); toast.success('AI summary done', { id: 'ai-perf' }); }
                  catch { toast.error('AI unavailable', { id: 'ai-perf' }); }
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors"
                title="AI Automation"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">AI</span>
              </button>
              <ExportButton
                rows={activeTab === 'reviews' ? filteredReviews : activeTab === 'goals' ? goals : feedback}
                filename="performance_export"
                label="Export"
              />
              {activeTab === 'reviews' && (
                <>
                  <button
                    onClick={() => setShowBulkUpload(true)} title="Upload .csv file"
                    className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span className="hidden sm:inline">Upload</span>
                  </button>
                  <button
                    onClick={() => handleOpenReviewDrawer()}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] text-sm font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Add Review</span>
                  </button>
                </>
              )}
              {activeTab === 'goals' && (
                <button
                  onClick={() => handleOpenGoalModal()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] text-sm font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Goal</span>
                </button>
              )}
              {activeTab === 'feedback' && (
                <button
                  onClick={() => handleOpenFeedbackModal()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] text-sm font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Feedback</span>
                </button>
              )}
            </>
          }
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat, index) => (
            <div key={index} className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 100}ms` }}>
              <StatsCard icon={stat.icon} label={stat.label} value={stat.value} color={stat.color} tooltip={stat.tooltip} trend={stat.trend} onClick={stat.onClick} />
            </div>
          ))}
        </div>

        {/* TABS - Pill Style like Company Page */}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof TABS[number]['id'])}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-[var(--primary-blue)] text-white shadow-md shadow-[#1C64F2]/20'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--background)]'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'reviews' && (
          <div className="animate-in fade-in duration-300 bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            {/* Filter Row */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[var(--border-color)] bg-white">
              <div className="flex flex-wrap items-center gap-3">
                <SearchableSelect
                  value={companyFilter === 'all' ? 'all' : Number(companyFilter)}
                  onChange={(val) => setCompanyFilter(val.toString())}
                  options={(companies || []).map((c: Company) => ({ id: c.id, name: c.name }))}
                  placeholder="All Companies"
                  allOption="All Companies"
                  className="w-40"
                />
                <SearchableSelect
                  value={branchFilter === 'all' ? 'all' : Number(branchFilter)}
                  onChange={(val) => setBranchFilter(val.toString())}
                  options={(branches || []).map((b: { id: number; name: string }) => ({ id: b.id, name: b.name }))}
                  placeholder="All Branches"
                  allOption="All Branches"
                  className="w-40"
                />
                <SearchableSelect
                  value={departmentFilter === 'all' ? 'all' : Number(departmentFilter)}
                  onChange={(val) => setDepartmentFilter(val.toString())}
                  options={(departments || []).map((d: Department) => ({ id: d.id, name: d.name }))}
                  placeholder="All Departments"
                  allOption="All Departments"
                  className="w-40"
                />
                <SearchableSelect
                  value={statusFilter === 'all' ? 'all' : statusFilter}
                  onChange={(val) => setStatusFilter(val.toString())}
                  options={(performanceStatusOptions || []).map((opt: MasterDataOption) => ({ id: opt.code || opt.value || '', name: opt.name || opt.label || '' }))}
                  placeholder="All Status"
                  allOption="All Status"
                  className="w-40"
                />
                <DateRangePicker 
                  startDate={startDate} 
                  endDate={endDate} 
                  onDateChange={(start, end) => { setStartDate(start); setEndDate(end); }} 
                  placeholder="Select Date"
                />
                {Boolean(companyFilter !== 'all' || branchFilter !== 'all' || departmentFilter !== 'all' || statusFilter !== 'all' || startDate || endDate) && (
                  <button
                    onClick={() => {
                      setCompanyFilter('all');
                      setBranchFilter('all');
                      setDepartmentFilter('all');
                      setStatusFilter('all');
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors" title="Clear Filters"
                  >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-white text-sm cursor-pointer hover:bg-[#F8FAFC] transition-colors" title="Show reviews for deactivated/terminated employees too">
                    <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)}
                      className="w-4 h-4 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-[#1C64F2]" />
                    <span className="text-xs text-[#64748B]">Include deactivated</span>
                  </label>
                </div>
              </div>
              <div className="bg-white overflow-hidden">
              {isLoading ? (
                <div className="animate-page-enter"><PageSkeleton /></div>
              ) : (
                <div className="overflow-x-auto">
                  <DataTable
                    data={filteredReviews}
                    rowKey={(r: ReviewRow) => r.id}
                    searchable
                    searchKeys={(r: ReviewRow) => `${r.employeeName} ${r.reviewerName} ${r.reviewPeriod} ${r.status || ''}`}
                    searchPlaceholder="Search reviews..."
                    emptyMessage="No performance reviews found"
                  logEntityType="performance_review"
                  logFor={(r: ReviewRow) => ({ id: r.id, label: `${r.employeeName} — ${r.reviewPeriod}` })}
                  onDelete={(rows) => setBulkDeleteReviews({ items: rows })}
                  onEdit={(r) => handleOpenReviewDrawer(r as ReviewRow)}
                  columns={[
                    {
                      key: 'employeeName', header: 'Employee', sortable: true,
                      render: (r: ReviewRow) => (
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                            <Users className="w-4 h-4 text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="font-semibold text-[#0F172A] text-sm">{r.employeeName}</span>
                              {r.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{r.employeeCode}</span>}
                            </div>
                            <div className="text-xs text-[#64748B] truncate max-w-[220px]">{r.email || ''}</div>
                          </div>
                        </div>
                      ),
                      sortValue: (r: ReviewRow) => r.employeeName,
                    },
                    { key: 'companyName', header: 'Company', sortable: true, render: (r: ReviewRow) => <span className="text-sm text-[#64748B]">{getCompanyName(r.company_id)}</span>, sortValue: (r: ReviewRow) => getCompanyName(r.company_id) },
                    { key: 'branchName', header: 'Branch', sortable: true, render: (r: ReviewRow) => <span className="text-sm text-[#64748B]">{getBranchName(r.branch_id)}</span>, sortValue: (r: ReviewRow) => getBranchName(r.branch_id) },
                    { key: 'departmentName', header: 'Department', sortable: true, render: (r: ReviewRow) => <span className="text-sm text-[#64748B]">{getDeptName(r.department_id)}</span>, sortValue: (r: ReviewRow) => getDeptName(r.department_id) },
                    { key: 'reviewerName', header: 'Reviewer', render: (r: ReviewRow) => <span className="text-sm text-[#64748B]">{r.reviewerName}</span> },
                    { key: 'reviewPeriod', header: 'Period', sortable: true, render: (r: ReviewRow) => <span className="text-sm text-[#64748B]">{r.reviewPeriod}</span>, sortValue: (r: ReviewRow) => r.reviewPeriod },
                    {
                      key: 'rating', header: 'Rating', align: 'center', sortable: true,
                      render: (r: ReviewRow) => (
                        <div className="flex items-center justify-center gap-1">
                          <Star className="w-3.5 h-3.5 text-[#F97316] fill-current" />
                          <span className="font-semibold text-[#0F172A] text-sm">{r.rating || '-'}</span>
                        </div>
                      ),
                      sortValue: (r: ReviewRow) => r.rating || 0,
                    },
                    {
                      key: 'status', header: 'Performance Status', align: 'center', sortable: true,
                      render: (r: ReviewRow) => <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getAttendanceStatusBadge(r.status || '')}`}>{capitalizeStatus(r.status)}</span>,
                      sortValue: (r: ReviewRow) => r.status,
                    },
                    { key: 'promotionEligible', header: 'Promotion Eligible', align: 'center', sortable: true, render: (r: ReviewRow) => <span className={`inline-flex items-center gap-1 text-sm ${r.promotionEligible ? 'text-[#059669] font-medium' : 'text-[#64748B]'}`}>{r.promotionEligible ? 'Yes' : 'No'}</span>, sortValue: (r: ReviewRow) => r.promotionEligible ? 'Yes' : 'No' },
                    { key: 'salaryRecommendation', header: 'Salary Recommendation', sortable: true, render: (r: ReviewRow) => <span className="text-sm text-[#64748B]">{r.salaryRecommendation || '-'}</span>, sortValue: (r: ReviewRow) => r.salaryRecommendation || '' },
                  ]}
                  actions={(r: ReviewRow) => (
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => handleOpenReviewDrawer(r)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteConfirm({ type: 'review', id: r.id, name: r.employeeName || 'this review' })} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                />
              </div>
            )}
          </div>
          </div>
        )}

        {/* GOALS TAB */}
        {activeTab === 'goals' && (
          <div className="animate-in fade-in duration-300 bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            {/* FILTERS */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[var(--border-color)] bg-white">
              <div className="flex flex-wrap items-center gap-3">
                <SearchableSelect
                  value={companyFilter === 'all' ? 'all' : Number(companyFilter)}
                  onChange={(val) => setCompanyFilter(val.toString())}
                  options={(companies || []).map((c: Company) => ({ id: c.id, name: c.name }))}
                  placeholder="All Companies"
                  allOption="All Companies"
                  className="w-40"
                />
                <SearchableSelect
                  value={branchFilter === 'all' ? 'all' : Number(branchFilter)}
                  onChange={(val) => setBranchFilter(val.toString())}
                  options={(branches || []).map((b: { id: number; name: string }) => ({ id: b.id, name: b.name }))}
                  placeholder="All Branches"
                  allOption="All Branches"
                  className="w-40"
                />
                <SearchableSelect
                  value={departmentFilter === 'all' ? 'all' : Number(departmentFilter)}
                  onChange={(val) => setDepartmentFilter(val.toString())}
                  options={(departments || []).map((d: Department) => ({ id: d.id, name: d.name }))}
                  placeholder="All Departments"
                  allOption="All Departments"
                  className="w-40"
                />
                <SearchableSelect
                  value={statusFilter === 'all' ? 'all' : statusFilter}
                  onChange={(val) => setStatusFilter(val.toString())}
                  options={(performanceStatusOptions || []).map((opt: MasterDataOption) => ({ id: opt.code || opt.value || '', name: opt.name || opt.label || '' }))}
                  placeholder="All Status"
                  allOption="All Status"
                  className="w-40"
                />
                <DateRangePicker 
                  startDate={startDate} 
                  endDate={endDate} 
                  onDateChange={(start, end) => { setStartDate(start); setEndDate(end); }} 
                  placeholder="Select Date"
                />
                {Boolean(companyFilter !== 'all' || branchFilter !== 'all' || departmentFilter !== 'all' || statusFilter !== 'all' || startDate || endDate) && (
                  <button
                    onClick={() => { setCompanyFilter('all'); setBranchFilter('all'); setDepartmentFilter('all'); setStatusFilter('all'); setStartDate(''); setEndDate(''); }}
                    className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors" title="Clear Filters"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="bg-white overflow-hidden">
            {goalsLoading ? (
              null
            ) : (
              <div className="overflow-x-auto">
                <DataTable
                  data={goals.filter((g: GoalRow) => {
                    const matchCompany = companyFilter === 'all' || g.company_id?.toString() === companyFilter;
                    const matchBranch = branchFilter === 'all' || g.branch_id?.toString() === branchFilter;
                    const matchDept = departmentFilter === 'all' || g.department_id?.toString() === departmentFilter;
                    const matchStatus = statusFilter === 'all' || g.status?.toLowerCase() === statusFilter.toLowerCase();
                    const gDate = g.dueDate || g.createdAt || g.date || g.updatedAt;
                    const matchStart = !startDate || (gDate && gDate.substring(0, 10) >= startDate);
                    const matchEnd = !endDate || (gDate && gDate.substring(0, 10) <= endDate);
                    return matchCompany && matchBranch && matchDept && matchStatus && matchStart && matchEnd;
                  })}
                  rowKey={(g: GoalRow) => g.id}
                  logEntityType="goal"
                  logFor={(g: GoalRow) => ({ id: g.id, label: g.title || g.employeeName })}
                  onDelete={(rows) => setBulkDeleteGoals({ items: rows })}
                  onEdit={(g) => handleOpenGoalModal(g as GoalRow)}
                  searchable
                  searchKeys={(g: GoalRow) => `${g.employeeName} ${g.title} ${g.category || ''} ${g.status || ''}`}
                  searchPlaceholder="Search goals..."
                  emptyMessage="No goals found"
                  columns={[
                    { key: 'employeeName', header: 'Employee', sortable: true, render: (g: GoalRow) => (
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="font-semibold text-[#0F172A] text-sm">{g.employeeName}</span>
                            {g.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{g.employeeCode}</span>}
                          </div>
                          <div className="text-xs text-[#64748B] truncate max-w-[220px]">{g.email || ''}</div>
                        </div>
                      </div>
                    ), sortValue: (g: GoalRow) => g.employeeName },
                    { key: 'companyName', header: 'Company', sortable: true, render: (g: GoalRow) => <span className="text-sm text-[#64748B]">{getCompanyName(g.company_id)}</span>, sortValue: (g: GoalRow) => getCompanyName(g.company_id) },
                    { key: 'branchName', header: 'Branch', sortable: true, render: (g: GoalRow) => <span className="text-sm text-[#64748B]">{getBranchName(g.branch_id)}</span>, sortValue: (g: GoalRow) => getBranchName(g.branch_id) },
                    { key: 'departmentName', header: 'Department', sortable: true, render: (g: GoalRow) => <span className="text-sm text-[#64748B]">{getDeptName(g.department_id)}</span>, sortValue: (g: GoalRow) => getDeptName(g.department_id) },
                    {
                      key: 'title', header: 'Goal Title', sortable: true,
                      render: (g: GoalRow) => (
                        <div>
                          <div className="font-medium text-[#0F172A]">{g.title}</div>
                          <div className="text-sm text-[#94A3B8]">{g.category || '-'}</div>
                        </div>
                      ),
                      sortValue: (g: GoalRow) => g.title,
                    },
                    { key: 'goalType', header: 'Goal Type', render: (g: GoalRow) => <span className="text-sm text-[#64748B]">{g.goalType || '-'}</span> },
                    {
                      key: 'progress', header: 'Progress', align: 'center', sortable: true,
                      render: (g: GoalRow) => (
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-24 h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                            <div className="h-full bg-[#1C64F2] rounded-full" style={{ width: `${g.progress || 0}%` }} />
                          </div>
                          <span className="text-sm font-medium text-[#0F172A]">{g.progress || 0}%</span>
                        </div>
                      ),
                      sortValue: (g: GoalRow) => g.progress || 0,
                    },
                    {
                      key: 'status', header: 'Status', align: 'center', sortable: true,
                      render: (g: GoalRow) => <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getAttendanceStatusBadge(g.status || '')}`}>{capitalizeStatus(g.status ?? '')}</span>,
                      sortValue: (g: GoalRow) => g.status,
                    },
                  ]}
                  actions={(g: GoalRow) => (
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => handleOpenGoalModal(g)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteConfirm({ type: 'goal', id: g.id, name: g.title || 'this goal' })} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                />
              </div>
            )}
          </div>
          </div>
        )}

        {/* FEEDBACK TAB */}
        {activeTab === 'feedback' && (
          <div className="animate-in fade-in duration-300 bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            {/* FILTERS */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[var(--border-color)] bg-white">
              <div className="flex flex-wrap items-center gap-3">
                <SearchableSelect
                  value={companyFilter === 'all' ? 'all' : Number(companyFilter)}
                  onChange={(val) => setCompanyFilter(val.toString())}
                  options={(companies || []).map((c: Company) => ({ id: c.id, name: c.name }))}
                  placeholder="All Companies"
                  allOption="All Companies"
                  className="w-40"
                />
                <SearchableSelect
                  value={branchFilter === 'all' ? 'all' : Number(branchFilter)}
                  onChange={(val) => setBranchFilter(val.toString())}
                  options={(branches || []).map((b: { id: number; name: string }) => ({ id: b.id, name: b.name }))}
                  placeholder="All Branches"
                  allOption="All Branches"
                  className="w-40"
                />
                <SearchableSelect
                  value={departmentFilter === 'all' ? 'all' : Number(departmentFilter)}
                  onChange={(val) => setDepartmentFilter(val.toString())}
                  options={(departments || []).map((d: Department) => ({ id: d.id, name: d.name }))}
                  placeholder="All Departments"
                  allOption="All Departments"
                  className="w-40"
                />
                <SearchableSelect
                  value={statusFilter === 'all' ? 'all' : statusFilter}
                  onChange={(val) => setStatusFilter(val.toString())}
                  options={(performanceStatusOptions || []).map((opt: MasterDataOption) => ({ id: opt.code || opt.value || '', name: opt.name || opt.label || '' }))}
                  placeholder="All Status"
                  allOption="All Status"
                  className="w-40"
                />
                <DateRangePicker 
                  startDate={startDate} 
                  endDate={endDate} 
                  onDateChange={(start, end) => { setStartDate(start); setEndDate(end); }} 
                  placeholder="Select Date"
                />
                {Boolean(companyFilter !== 'all' || branchFilter !== 'all' || departmentFilter !== 'all' || statusFilter !== 'all' || startDate || endDate) && (
                  <button
                    onClick={() => { setCompanyFilter('all'); setBranchFilter('all'); setDepartmentFilter('all'); setStatusFilter('all'); setStartDate(''); setEndDate(''); }}
                    className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors" title="Clear Filters"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="bg-white overflow-hidden">
            {feedbackLoading ? (
              null
            ) : (
              <div className="overflow-x-auto">
                <DataTable
                  data={feedback.filter((f: FeedbackRow) => {
                    const matchCompany = companyFilter === 'all' || f.company_id?.toString() === companyFilter;
                    const matchBranch = branchFilter === 'all' || f.branch_id?.toString() === branchFilter;
                    const matchDept = departmentFilter === 'all' || f.department_id?.toString() === departmentFilter;
                    const matchStatus = statusFilter === 'all' || f.status?.toLowerCase() === statusFilter.toLowerCase();
                    const fDate = f.createdAt || f.date || f.updatedAt;
                    const matchStart = !startDate || (fDate && fDate.substring(0, 10) >= startDate);
                    const matchEnd = !endDate || (fDate && fDate.substring(0, 10) <= endDate);
                    return matchCompany && matchBranch && matchDept && matchStatus && matchStart && matchEnd;
                  })}
                  rowKey={(f: FeedbackRow) => f.id}
                  logEntityType="feedback"
                  logFor={(f: FeedbackRow) => ({ id: f.id, label: f.employeeName })}
                  onDelete={(rows) => setBulkDeleteFeedback({ items: rows })}
                  onEdit={(f) => handleOpenFeedbackModal(f as FeedbackRow)}
                  searchable
                  searchKeys={(f: FeedbackRow) => `${f.employeeName} ${f.reviewerName} ${f.feedbackType || ''} ${f.status || ''}`}
                  searchPlaceholder="Search feedback..."
                  emptyMessage="No feedback found"
                  columns={[
                    { key: 'employeeName', header: 'Employee', sortable: true, render: (f: FeedbackRow) => (
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="font-semibold text-[#0F172A] text-sm">{f.employeeName}</span>
                            {f.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{f.employeeCode}</span>}
                          </div>
                          <div className="text-xs text-[#64748B] truncate max-w-[220px]">{f.email || ''}</div>
                        </div>
                      </div>
                    ), sortValue: (f: FeedbackRow) => f.employeeName },
                    { key: 'companyName', header: 'Company', sortable: true, render: (f: FeedbackRow) => <span className="text-sm text-[#64748B]">{getCompanyName(f.company_id)}</span>, sortValue: (f: FeedbackRow) => getCompanyName(f.company_id) },
                    { key: 'branchName', header: 'Branch', sortable: true, render: (f: FeedbackRow) => <span className="text-sm text-[#64748B]">{getBranchName(f.branch_id)}</span>, sortValue: (f: FeedbackRow) => getBranchName(f.branch_id) },
                    { key: 'departmentName', header: 'Department', sortable: true, render: (f: FeedbackRow) => <span className="text-sm text-[#64748B]">{getDeptName(f.department_id)}</span>, sortValue: (f: FeedbackRow) => getDeptName(f.department_id) },
                    { key: 'reviewerName', header: 'Reviewer', render: (f: FeedbackRow) => <span className="text-sm text-[#64748B]">{f.reviewerName}</span> },
                    { key: 'feedbackType', header: 'Feedback Type', render: (f: FeedbackRow) => <span className="text-sm text-[#64748B]">{f.feedbackType || '-'}</span> },
                    {
                      key: 'overallRating', header: 'Rating', align: 'center', sortable: true,
                      render: (f: FeedbackRow) => (
                        <div className="flex items-center justify-center gap-1">
                          <Star className="w-3.5 h-3.5 text-[#F97316] fill-current" />
                          <span className="font-semibold text-[#0F172A] text-sm">{f.overallRating || '-'}</span>
                        </div>
                      ),
                      sortValue: (f: FeedbackRow) => f.overallRating || 0,
                    },
                    {
                      key: 'status', header: 'Status', align: 'center', sortable: true,
                      render: (f: FeedbackRow) => <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getAttendanceStatusBadge(f.status || '')}`}>{capitalizeStatus(f.status ?? '')}</span>,
                      sortValue: (f: FeedbackRow) => f.status,
                    },
                  ]}
                  actions={(f: FeedbackRow) => (
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => handleOpenFeedbackModal(f)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteConfirm({ type: 'feedback', id: f.id, name: f.employeeName || 'this feedback' })} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                />
              </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="animate-in fade-in duration-300 space-y-6">
            {/* Score Distribution Chart */}
            <div className="bg-white rounded-2xl border border-[var(--border-color)] p-6">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-4">
                <span className="w-1.5 h-4 rounded-full bg-[#1C64F2]" /> Score Distribution
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(() => {
                    const buckets = [{ name: '1', count: 0 }, { name: '2', count: 0 }, { name: '3', count: 0 }, { name: '4', count: 0 }, { name: '5', count: 0 }];
                    reviews.forEach((r: ReviewRow) => {
                      const s = Math.round(r.overallScore || 0);
                      if (s >= 1 && s <= 5) buckets[s - 1].count++;
                    });
                    return buckets;
                  })()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748B' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
                    <Bar dataKey="count" fill="#1C64F2" radius={[6, 6, 0, 0]} name="Reviews" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Goal Status Pie */}
              <div className="bg-white rounded-2xl border border-[var(--border-color)] p-6">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-4">
                  <span className="w-1.5 h-4 rounded-full bg-[#10B981]" /> Goal Status
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={(() => {
                        const statusMap: Record<string, number> = {};
                        goals.forEach((g: GoalRow) => { const s = g.status || 'active'; statusMap[s] = (statusMap[s] || 0) + 1; });
                        const COLORS = ['#1C64F2', '#10B981', '#F97316', '#64748B'];
                        return Object.entries(statusMap).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));
                      })()} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Feedback Type Breakdown */}
              <div className="bg-white rounded-2xl border border-[var(--border-color)] p-6">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-4">
                  <span className="w-1.5 h-4 rounded-full bg-[#7C3AED]" /> Feedback by Type
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(() => {
                      const typeMap: Record<string, number> = {};
                      feedback.forEach((f: FeedbackRow) => { const t = f.feedbackType || 'other'; typeMap[t] = (typeMap[t] || 0) + 1; });
                      return Object.entries(typeMap).map(([name, count]) => ({ name, count }));
                    })()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#64748B' }} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
                      <Bar dataKey="count" fill="#7C3AED" radius={[6, 6, 0, 0]} name="Feedback" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Review Status Flow */}
            <div className="bg-white rounded-2xl border border-[var(--border-color)] p-6">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-4">
                <span className="w-1.5 h-4 rounded-full bg-[#F97316]" /> Review Status Overview
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(['draft', 'submitted', 'acknowledged', 'completed'] as const).map((s) => {
                  const count = reviews.filter((r: ReviewRow) => r.status === s).length;
                  const colorMap: Record<string, string> = {};
                  colorMap['draft'] = "bg-[#F1F5F9] text-[#64748B]";
                  colorMap['submitted'] = "bg-[#FFF7ED] text-[#D97706]";
                  colorMap['acknowledged'] = "bg-[#EFF6FF] text-[#1C64F2]";
                  colorMap['completed'] = "bg-[#ECFDF5] text-[#059669]";
                  return (
                    <div key={s} className={`rounded-xl p-4 text-center ${colorMap[s]}`}>
                      <p className="text-2xl font-bold">{count}</p>
                      <p className="text-xs font-medium capitalize mt-1">{s}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'configuration' && (
          <div className="animate-in fade-in duration-300">
            <PerformanceConfig />
          </div>
        )}
      </div>

      {/* Full Page Drawer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
            onClick={handleCloseDrawer}
          />
          <div
            className={`fixed inset-0 bg-white shadow-2xl transform transition-all duration-300 ease-in-out ${
              isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
          >
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1C64F2] to-[#1C64F2bb] flex items-center justify-center text-white shadow-sm">
                    <Target className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#0F172A] leading-tight">{editingReview ? 'Edit Performance Review' : 'Start Performance Review'}</h2>
                    <p className="text-xs text-[#64748B]">Fill in the review details and click {editingReview ? 'Update' : 'Submit'} to save</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleCloseDrawer} className="px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">Cancel</button>
                  <button onClick={handleSubmitReview} disabled={createReviewMutation.isPending || updateReviewMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10">
                    {(createReviewMutation.isPending || updateReviewMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {createReviewMutation.isPending || updateReviewMutation.isPending ? 'Saving...' : (editingReview ? 'Update Review' : 'Submit Review')}
                  </button>
                  <button onClick={handleCloseDrawer} className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Help Text */}
              <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
                <p className="text-[11px] text-[#B45309]">
                  <Info className="w-3.5 h-3.5 inline mr-1" />
                  Fields marked with <span className="font-semibold text-[#DC2626]">*</span> are mandatory. Click {editingReview ? 'Update Review' : 'Submit Review'} to save.
                </p>
              </div>

              {/* Form Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  {renderPerformanceForm()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BULK UPLOAD MODAL */}
      <Modal
        isOpen={showBulkUpload}
        onClose={() => { setShowBulkUpload(false); setUploadFile(null); }}
        title="Bulk Upload Performance Data"
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Instructions:</strong>
              <br />1. Download the template first
              <br />2. Fill in your data in the CSV file
              <br />3. Upload the filled CSV file
              <br />4. Existing items will be updated, new items will be created
              <br />
              <strong>Required columns:</strong> employee_id, reviewer_id, review_period, review_year, scores
            </p>
          </div>
          <button
            onClick={() => {
              const csv = 'employee_id,reviewer_id,review_period,review_year,productivity_score,quality_score,communication_score,teamwork_score\nEMP001,REV001,Q1,2026,4,5,4,4\n';
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'performance_template.csv';
              a.click(); URL.revokeObjectURL(url);
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#10B981] text-white text-sm font-medium rounded-xl hover:bg-[#059669] transition-all duration-200"
          >
            <Download className="w-4 h-4" />
            Download Template
          </button>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Upload CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-[var(--text-primary)]"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => { setShowBulkUpload(false); setUploadFile(null); }}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => uploadFile && bulkUploadMutation.mutate(uploadFile)}
              disabled={!uploadFile || bulkUploadMutation.isPending}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {bulkUploadMutation.isPending ? (
                null
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* GOAL CREATE/EDIT MODAL */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex">
          <div className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isGoalClosing ? 'opacity-0' : 'opacity-100'}`} onClick={handleCloseGoalModal} />
          <div className={`fixed inset-0 bg-white shadow-2xl transform transition-all duration-300 ease-in-out ${isGoalClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10B981] to-[#10B981bb] flex items-center justify-center text-white shadow-sm">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#0F172A] leading-tight">{editingGoal ? 'Edit Goal' : 'Create New Goal'}</h2>
                    <p className="text-xs text-[#64748B]">Fill in the goal details and click {editingGoal ? 'Update' : 'Create'} to save</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleCloseGoalModal} className="px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">Cancel</button>
                  <button onClick={handleSubmitGoal} disabled={createGoalMutation.isPending || updateGoalMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10">
                    {(createGoalMutation.isPending || updateGoalMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {createGoalMutation.isPending || updateGoalMutation.isPending ? 'Saving...' : (editingGoal ? 'Update Goal' : 'Create Goal')}
                  </button>
                  <button onClick={handleCloseGoalModal} className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
                <p className="text-[11px] text-[#B45309]">
                  <Info className="w-3.5 h-3.5 inline mr-1" />
                  Fields marked with <span className="font-semibold text-[#DC2626]">*</span> are mandatory. Click {editingGoal ? 'Update Goal' : 'Create Goal'} to save.
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  <GoalFeedbackForm type="goal" data={newGoal} setData={setNewGoal as Dispatch<SetStateAction<Record<string, FormDataValue>>>} companies={companies} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FEEDBACK CREATE/EDIT MODAL */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex">
          <div className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isFeedbackClosing ? 'opacity-0' : 'opacity-100'}`} onClick={handleCloseFeedbackModal} />
          <div className={`fixed inset-0 bg-white shadow-2xl transform transition-all duration-300 ease-in-out ${isFeedbackClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#7C3AEDbb] flex items-center justify-center text-white shadow-sm">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#0F172A] leading-tight">{editingFeedback ? 'Edit Feedback' : 'Submit 360 Feedback'}</h2>
                    <p className="text-xs text-[#64748B]">Fill in the feedback details and click {editingFeedback ? 'Update' : 'Submit'} to save</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleCloseFeedbackModal} className="px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">Cancel</button>
                  <button onClick={handleSubmitFeedback} disabled={createFeedbackMutation.isPending || updateFeedbackMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10">
                    {(createFeedbackMutation.isPending || updateFeedbackMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {createFeedbackMutation.isPending || updateFeedbackMutation.isPending ? 'Saving...' : (editingFeedback ? 'Update Feedback' : 'Submit Feedback')}
                  </button>
                  <button onClick={handleCloseFeedbackModal} className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
                <p className="text-[11px] text-[#B45309]">
                  <Info className="w-3.5 h-3.5 inline mr-1" />
                  Fields marked with <span className="font-semibold text-[#DC2626]">*</span> are mandatory. Click {editingFeedback ? 'Update Feedback' : 'Submit Feedback'} to save.
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  <GoalFeedbackForm type="feedback" data={newFeedback} setData={setNewFeedback as Dispatch<SetStateAction<Record<string, FormDataValue>>>} companies={companies} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW DETAIL/EDIT DRAWER */}
      {showReviewDetail && selectedReview && (
        <div className="fixed inset-0 z-50 flex">
          <div className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isReviewDetailClosing ? 'opacity-0' : 'opacity-100'}`} onClick={handleCloseReviewDetail} />
          <div className={`fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl transform transition-all duration-300 ease-in-out overflow-y-auto ${isReviewDetailClosing ? 'translate-x-full' : 'translate-x-0'}`}>
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-white">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Review — {selectedReview.employeeName}</h2>
              <div className="flex items-center gap-2">
                {isEditingReview ? (
                  <>
                    <button onClick={() => setIsEditingReview(false)} className="px-3 py-1.5 text-sm text-[#64748B] hover:bg-[#F1F5F9] rounded-lg transition-colors">Cancel</button>
                    <button onClick={handleSaveReviewEdit} disabled={updateReviewMutation.isPending} className="px-3 py-1.5 text-sm bg-[var(--primary-blue)] text-white rounded-lg hover:bg-[#1E40AF] transition-colors flex items-center gap-1 disabled:opacity-50">
                      {updateReviewMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Save
                    </button>
                  </>
                ) : (
                  <button onClick={() => setIsEditingReview(true)} className="px-3 py-1.5 text-sm bg-[#1C64F2] text-white rounded-lg hover:bg-[#1E40AF] transition-colors flex items-center gap-1">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                )}
                <button onClick={handleCloseReviewDetail} className="p-2 hover:bg-[var(--background)] rounded-lg transition-colors"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <ReviewDetailSection title="Overview">
                <DetailField label="Employee" value={selectedReview.employeeName ?? ''} />
                <DetailField label="Reviewer" value={selectedReview.reviewerName ?? ''} />
                <DetailField label="Period" value={selectedReview.reviewPeriod ?? ''} />
                <DetailField label="Year" value={String(selectedReview.reviewYear)} />
                <DetailField label="Status" value={selectedReview.status} badge />
                <DetailField label="Overall Score" value={selectedReview.overallScore ? `${selectedReview.overallScore}/5` : '-'} />
                <DetailField label="Rating" value={selectedReview.rating || '-'} />
              </ReviewDetailSection>
              <ReviewDetailSection title="Performance Scores">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    ['Productivity', 'productivityScore'], ['Quality', 'qualityScore'], ['Communication', 'communicationScore'],
                    ['Teamwork', 'teamworkScore'], ['Leadership', 'leadershipScore'], ['Initiative', 'initiativeScore'],
                    ['Punctuality', 'punctualityScore'], ['Problem Solving', 'problemSolvingScore'], ['Collaboration', 'collaborationScore'],
                    ['Adaptability', 'adaptabilityScore'], ['Creativity', 'creativityScore'], ['Attendance', 'attendanceScore'],
                  ].map(([label, key]) => (
                    <div key={key} className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-lg">
                      <span className="text-xs text-[#64748B]">{label}</span>
                      {isEditingReview ? (
                        <input type="number" min="1" max="5" value={editReviewData[key] || 0} onChange={(e) => setEditReviewData({ ...editReviewData, [key]: parseInt(e.target.value) })} className="w-16 px-2 py-1 border border-[var(--border-color)] rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#1C64F2]" />
                      ) : (
                        <span className="text-sm font-semibold text-[#0F172A]">{((selectedReview as unknown as Record<string, string | number>)[key] || 0)}/5</span>
                      )}
                    </div>
                  ))}
                </div>
              </ReviewDetailSection>
              <ReviewDetailSection title="Goals & Development">
                <DetailTextArea label="Goals Set" value={selectedReview.goalsSet || ''} editing={isEditingReview} onChange={(v) => setEditReviewData({ ...editReviewData, goalsSet: v })} />
                <DetailTextArea label="Goals Achieved" value={selectedReview.goalsAchieved || ''} editing={isEditingReview} onChange={(v) => setEditReviewData({ ...editReviewData, goalsAchieved: v })} />
                <DetailTextArea label="Strengths" value={selectedReview.strengths || ''} editing={isEditingReview} onChange={(v) => setEditReviewData({ ...editReviewData, strengths: v })} />
                <DetailTextArea label="Areas for Improvement" value={selectedReview.areasForImprovement || ''} editing={isEditingReview} onChange={(v) => setEditReviewData({ ...editReviewData, areasForImprovement: v })} />
                <DetailTextArea label="Development Plan" value={selectedReview.developmentPlan || ''} editing={isEditingReview} onChange={(v) => setEditReviewData({ ...editReviewData, developmentPlan: v })} />
                <DetailTextArea label="Key Projects" value={selectedReview.keyProjects || ''} editing={isEditingReview} onChange={(v) => setEditReviewData({ ...editReviewData, keyProjects: v })} />
              </ReviewDetailSection>
              <ReviewDetailSection title="Recommendations">
                <DetailField label="Promotion Eligible" value={selectedReview.promotionEligible ? 'Yes' : 'No'} />
                <DetailField label="Salary Recommendation" value={selectedReview.salaryRecommendation || '-'} />
                <DetailField label="Salary %" value={selectedReview.salaryPercentage ? `${selectedReview.salaryPercentage}%` : '-'} />
                <DetailTextArea label="Reviewer Comments" value={selectedReview.reviewerComments || ''} editing={isEditingReview} onChange={(v) => setEditReviewData({ ...editReviewData, reviewerComments: v })} />
                <DetailTextArea label="Employee Comments" value={selectedReview.employeeComments || ''} editing={isEditingReview} onChange={(v) => setEditReviewData({ ...editReviewData, employeeComments: v })} />
              </ReviewDetailSection>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirm && (
        <Modal isOpen={true} onClose={() => setDeleteConfirm(null)} title={`Delete ${deleteConfirm.type}`}>
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm font-medium border border-[var(--border-color)] rounded-lg hover:bg-[var(--background)] transition-colors">Cancel</button>
              <button
                onClick={() => {
                  if (deleteConfirm.type === 'review') deleteReviewMutation.mutate(deleteConfirm.id);
                  else if (deleteConfirm.type === 'goal') deleteGoalMutation.mutate(deleteConfirm.id);
                  else deleteFeedbackMutation.mutate(deleteConfirm.id);
                }}
                disabled={deleteReviewMutation.isPending || deleteGoalMutation.isPending || deleteFeedbackMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-[#C81E1E] text-white rounded-lg hover:bg-[#9B1C1C] transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {(deleteReviewMutation.isPending || deleteGoalMutation.isPending || deleteFeedbackMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      <BulkDeleteModal
        isOpen={!!bulkDeleteReviews}
        onClose={() => setBulkDeleteReviews(null)}
        onConfirm={() => {
          if (!bulkDeleteReviews) return;
          bulkDeleteReviews.items.forEach((r) => deleteReviewMutation.mutate(r.id));
          setBulkDeleteReviews(null);
        }}
        count={bulkDeleteReviews?.items.length ?? 0}
        entityType="review"
        consequences={['Performance data will be permanently removed', 'Historical ratings and feedback will be lost']}
        isDeleting={deleteReviewMutation.isPending}
      />

      <BulkDeleteModal
        isOpen={!!bulkDeleteGoals}
        onClose={() => setBulkDeleteGoals(null)}
        onConfirm={() => {
          if (!bulkDeleteGoals) return;
          bulkDeleteGoals.items.forEach((g) => deleteGoalMutation.mutate(g.id));
          setBulkDeleteGoals(null);
        }}
        count={bulkDeleteGoals?.items.length ?? 0}
        entityType="goal"
        consequences={['Performance data will be permanently removed', 'Historical ratings and feedback will be lost']}
        isDeleting={deleteGoalMutation.isPending}
      />

      <BulkDeleteModal
        isOpen={!!bulkDeleteFeedback}
        onClose={() => setBulkDeleteFeedback(null)}
        onConfirm={() => {
          if (!bulkDeleteFeedback) return;
          bulkDeleteFeedback.items.forEach((f) => deleteFeedbackMutation.mutate(f.id));
          setBulkDeleteFeedback(null);
        }}
        count={bulkDeleteFeedback?.items.length ?? 0}
        entityType="feedback"
        consequences={['Performance data will be permanently removed', 'Historical ratings and feedback will be lost']}
        isDeleting={deleteFeedbackMutation.isPending}
      />
    </div>
  );
};

export default Performance;

