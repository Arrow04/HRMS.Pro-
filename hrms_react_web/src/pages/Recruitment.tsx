import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Briefcase, Users, Calendar, Plus, Search, MapPin, Ban,
  Edit2, Trash2, CheckCircle2, X, XCircle,
  TrendingUp, UserCheck, CloudCog,
  Download, Upload, Loader2, Info, Award, Sparkles, LogIn, FileText, RotateCcw, ExternalLink, Eye, Settings, Star, Layers, Clock
} from 'lucide-react';
import { formatAppDate } from '../services/appSettingsService';
import PhoneInput from '../components/PhoneInput';
import StateSelect from '../components/StateSelect';
import PincodeInput from '../components/PincodeInput';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useMasterData } from '../hooks/useMasterData';
import { useEmployeePicker } from '../hooks/useEmployeePicker';
import { useAppConfig } from '../context/AppConfigContext';
import { formatEmployeeLabel, normalizePickerEmployee } from '../utils/employeePickerUtils';
import { joinEmployeeName, personDisplayName, personInitials, splitEmployeeName, toFullNamePayload } from '../utils/employeeNameUtils';
import toast from 'react-hot-toast';
import ToggleSwitch from '../components/ToggleSwitch';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import ConfirmActionModal from '../components/ConfirmActionModal';
import DateRangePicker from '../components/DateRangePicker';
import DatePicker from '../components/DatePicker';
import TimePicker from '../components/TimePicker';
import SearchableSelect from '../components/SearchableSelect';
import OnboardingSection from '../components/OnboardingSection';
import StatsCard from '../components/StatsCard';
import PageHero from '../components/PageHero';
import ExportButton from '../components/ExportButton';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import type { JobOpening, Candidate, Interview, Company, Department, Branch, Employee } from '../types';

// =============================================================================
// LOCAL TYPES
// =============================================================================

type RecruitmentJob = JobOpening & {
  [key: string]: string | number | undefined;
  companyId?: number;
  branchId?: number;
  departmentId?: number;
  date?: string;
  updatedAt?: string;
};

type RecruitmentCandidate = Candidate & {
  [key: string]: string | number | undefined;
  name?: string;
  firstName?: string;
  lastName?: string;
  companyId?: number;
  branchId?: number;
  departmentId?: number;
  date?: string;
  createdAt?: string;
  updatedAt?: string;
};

type RecruitmentInterview = Interview & {
  [key: string]: string | number | undefined;
  jobId?: number;
  scheduledAt?: string;
  candidate?: string;
  candidate_name?: string;
  companyId?: number;
  branchId?: number;
  departmentId?: number;
  updatedAt?: string;
};

type RecruitmentItem = RecruitmentJob | RecruitmentCandidate | RecruitmentInterview;

// One row per candidate in the Interviews tab, with all rounds nested.
type GroupedInterview = {
  id: number;
  candidateId: number;
  candidateName: string;
  jobId?: number;
  jobTitle?: string;
  companyId?: number;
  companyName?: string;
  interviewerId?: number;
  interviewerName?: string;
  rounds: RecruitmentInterview[];
  interviewIds: number[];
  interviewRound: number;
  status: string;
  interviewType: string;
  scheduledAt?: string;
  rating?: number;
  feedback?: string;
  technicalScore?: number;
  communicationScore?: number;
  overallScore?: number;
};

type BranchOption = Branch & { companyId?: number };
type EmployeeOption = Employee & { is_active?: boolean };

type RecruitmentFormData = Record<string, string | number | undefined>;

// =============================================================================
// TABS CONFIGURATION
// =============================================================================

const TABS = [
  { id: 'jobs', label: 'Job Openings', icon: Briefcase, color: 'blue', description: 'Manage job postings' },
  { id: 'candidates', label: 'Candidates', icon: Users, color: 'green', description: 'Track applicants' },
  { id: 'interviews', label: 'Interviews', icon: Calendar, color: 'orange', description: 'Schedule interviews' },
  { id: 'offered', label: 'Job Offered', icon: Award, color: 'emerald', description: 'Selected candidates' },
  { id: 'onboarding', label: 'Onboarding', icon: LogIn, color: 'teal', description: 'Onboard selected candidates' },
];

const PORTALS: { id: string; name: string; description: string; url: string; icon: React.ElementType; bg: string; color: string }[] = [
  { id: 'linkedin', name: 'LinkedIn', description: 'Post jobs on LinkedIn', url: 'https://www.linkedin.com/post/new/', icon: CloudCog, bg: '#0A66C2', color: '#FFFFFF' },
  { id: 'naukri', name: 'Naukri.com', description: 'India\'s largest job portal', url: 'https://www.naukri.com/hr-jobs-in-india', icon: Briefcase, bg: '#E55B2D', color: '#FFFFFF' },
  { id: 'indeed', name: 'Indeed', description: 'Post jobs on Indeed', url: 'https://www.indeed.com/hire/job-post', icon: Search, bg: '#2557A7', color: '#FFFFFF' },
  { id: 'glassdoor', name: 'Glassdoor', description: 'Post jobs on Glassdoor', url: 'https://www.glassdoor.com/employers/', icon: Sparkles, bg: '#00A6FB', color: '#FFFFFF' },
  { id: 'monster', name: 'Monster', description: 'Post jobs on Monster', url: 'https://hiring.monster.com/', icon: TrendingUp, bg: '#6D1F8B', color: '#FFFFFF' },
  { id: 'shine', name: 'Shine.com', description: 'Post jobs on Shine', url: 'https://www.shine.com/recruiter/', icon: Award, bg: '#F98D00', color: '#FFFFFF' },
  { id: 'apna', name: 'Apna', description: 'Post jobs on Apna', url: 'https://apna.co/employer', icon: Users, bg: '#5B21B6', color: '#FFFFFF' },
  { id: 'foundit', name: 'Foundit (Monster India)', description: 'Post jobs on Foundit', url: 'https://www.foundit.in/recruiter/', icon: UserCheck, bg: '#E4002B', color: '#FFFFFF' },
];

const CANDIDATE_TAB_STATUSES = ['applied', 'invited', 'shortlisted', 'not_arrived', 'rejected'];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  applied: { label: 'Applied', color: 'bg-sky-100 text-sky-700' },
  invited: { label: 'Invited', color: 'bg-cyan-100 text-cyan-700' },
  shortlisted: { label: 'Shortlisted', color: 'bg-violet-100 text-violet-700' },
  interviewed: { label: 'Interviewed', color: 'bg-purple-100 text-purple-700' },
  not_arrived: { label: 'Not Arrived', color: 'bg-orange-100 text-orange-700' },
  offered: { label: 'Offered', color: 'bg-amber-100 text-amber-700' },
  hired: { label: 'Hired', color: 'bg-emerald-100 text-emerald-700' },
  not_joined: { label: 'Not Joined', color: 'bg-gray-100 text-gray-700' },
  onboarded: { label: 'Onboarded', color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejected', color: 'bg-rose-100 text-rose-700' },
};

const statusBadge = (status?: string) => {
  const cfg = STATUS_LABELS[status || ''] || { label: (status || 'applied').replace(/_/g, ' '), color: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${cfg.color}`}>
      {cfg.label}
    </span>
  );
};

const candidateDisplayName = (c: RecruitmentCandidate | null | undefined) =>
  c ? personDisplayName(c, `Candidate #${c.id}`) : 'Candidate';

const calcRatingFromScores = (comm?: number, tech?: number, overall?: number): number | undefined => {
  const vals = [comm, tech, overall].filter((v) => v !== undefined && v !== null) as number[];
  if (vals.length === 0) return undefined;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length; // 0-10 scale
  const rating = Math.round((avg / 10) * 5); // map to 1-5
  return Math.min(5, Math.max(1, rating));
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const Recruitment = () => {
  const queryClient = useQueryClient();
  const { dialCode } = useAppConfig();
  const [activeTab, setActiveTab] = useState<'jobs' | 'candidates' | 'interviews' | 'offered' | 'onboarding'>('jobs');
const onboardingRef = useRef<{ startOnboarding: () => void }>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [branchFilter] = useState('all');
  const [departmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [offeredStatusFilter, setOfferedStatusFilter] = useState<string>('all');
  const [candidateDepartmentFilter, setCandidateDepartmentFilter] = useState<string>('all');
  const [interviewRoundFilter, setInterviewRoundFilter] = useState<string>('all');
  const [interviewTypeFilter, setInterviewTypeFilter] = useState<string>('all');
  const [interviewStatusFilter, setInterviewStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showModal, setShowModal] = useState<string | null>(null);
  const [formData, setFormData] = useState<RecruitmentFormData>({});
  const [editingItem, setEditingItem] = useState<RecruitmentItem | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number, name: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RecruitmentCandidate | null>(null);
  const [rejectTargets, setRejectTargets] = useState<RecruitmentCandidate[] | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSource, setRejectSource] = useState<'candidate' | 'interview'>('candidate');
  const [reasonActionTargets, setReasonActionTargets] = useState<RecruitmentCandidate[] | null>(null);
  const [reasonActionType, setReasonActionType] = useState<'shortlist' | 'reject' | 'restore' | 'delete' | 'select' | 'notjoined' | 'restoreoffered'>('shortlist');
  const [reasonActionReason, setReasonActionReason] = useState('');
  const [postJobTarget, setPostJobTarget] = useState<RecruitmentJob | null>(null);
  const [, setFormTab] = useState('basic');
  const [isClosing, setIsClosing] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsingResume, setParsingResume] = useState(false);
  const [isFresher, setIsFresher] = useState(false);
  const [interviewCompanyId, setInterviewCompanyId] = useState<number | ''>('');
  const [quickEditInterview, setQuickEditInterview] = useState<RecruitmentInterview | null>(null);
  const [quickEditGroup, setQuickEditGroup] = useState<GroupedInterview | null>(null);
  const [quickEditBulk, setQuickEditBulk] = useState<RecruitmentInterview[] | null>(null);
  const [quickEditDraft, setQuickEditDraft] = useState<{
    round?: number;
    status?: string;
    type?: string;
    rating?: number;
    feedback?: string;
    technicalScore?: number;
    communicationScore?: number;
    overallScore?: number;
    scheduledAt?: string;
    durationMinutes?: number;
    location?: string;
    meetingLink?: string;
    interviewerId?: number;
  }>({});
  const [quickEditTab, setQuickEditTab] = useState<'overview' | 'rounds' | 'performance'>('overview');
  const [quickEditRound, setQuickEditRound] = useState<number>(1);
  const [interviewRoundTab, setInterviewRoundTab] = useState<number>(1);
  const [viewRoundsCandidate, setViewRoundsCandidate] = useState<RecruitmentCandidate | null>(null);
  const [viewRoundsTab, setViewRoundsTab] = useState<number>(1);
  const [onboardTarget, setOnboardTarget] = useState<RecruitmentCandidate | null>(null);
  const [onboardJoinDate, setOnboardJoinDate] = useState('');
  const [bulkDeleteCandidates, setBulkDeleteCandidates] = useState<RecruitmentCandidate[] | null>(null);
  const [bulkDeleteJobs, setBulkDeleteJobs] = useState<RecruitmentJob[] | null>(null);
  const [restoreCandidateTarget, setRestoreCandidateTarget] = useState<RecruitmentCandidate | null>(null);
  const [activateJobsTarget, setActivateJobsTarget] = useState<RecruitmentJob[] | null>(null);
  const [deactivateJobsTarget, setDeactivateJobsTarget] = useState<RecruitmentJob[] | null>(null);
  const [eraseRoundTarget, setEraseRoundTarget] = useState<{ active: RecruitmentInterview; label: string } | null>(null);

  // Ensure the modal is always visible when opened (not stuck in the closing animation)
  useEffect(() => {
    if (showModal) setIsClosing(false);
  }, [showModal]);

  // =============================================================================
  // DATA QUERIES
  // =============================================================================

  const { data: jobs, isLoading: loadingJobs, isFetching } = useQuery<RecruitmentJob[]>({
    queryKey: ['recruitment-jobs'],
    queryFn: async () => {
      const response = await api.get(`/recruitment/jobs`);
      return response.data || [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: candidates, isLoading: loadingCandidates } = useQuery<RecruitmentCandidate[]>({
    queryKey: ['recruitment-candidates'],
    queryFn: async () => {
      const response = await api.get(`/recruitment/candidates`);
      return response.data || [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: onboardingPicker = [] } = useEmployeePicker({ status: 'new' });
  const onboardingEmployees = onboardingPicker.map(normalizePickerEmployee);

  // Employees still sitting in the onboarding pipeline (status 'new').
  const onboardingEmployeeIds = useMemo(
    () => new Set((onboardingEmployees || []).map((e) => Number((e as { id?: number }).id))),
    [onboardingEmployees]
  );


  // Master data for recruitment dropdowns
  const { data: jobStatusOptions = [] } = useMasterData('JOB_STATUS');
  const { data: applicationStatusOptions = [] } = useMasterData('APPLICATION_STATUS');
  const { data: interviewStatusOptions = [] } = useMasterData('INTERVIEW_STATUS');
  // Selected / Rejected are actions with their own buttons, not manual statuses.
  const interviewStatusOptionsFiltered = interviewStatusOptions.filter(
    (o: { code: string; name: string }) => o.code !== 'selected' && o.code !== 'rejected'
  );
  const { data: employmentTypeOptions = [] } = useMasterData('RECRUITMENT_EMPLOYMENT_TYPE');
  const { data: jobLocationOptions = [] } = useMasterData('JOB_LOCATION');
  const { data: interviewTypeOptions = [] } = useMasterData('INTERVIEW_TYPE');
  const { data: interviewRoundOptions = [] } = useMasterData('INTERVIEW_ROUND');
  const { data: genderOptions = [] } = useMasterData('GENDER');
  const { data: bloodGroupOptions = [] } = useMasterData('BLOOD_GROUP');
  const { data: maritalStatusOptions = [] } = useMasterData('MARITAL_STATUS');
  const { data: educationLevelOptions = [] } = useMasterData('EDUCATION_LEVEL');
  const { data: statusOptions = [] } = useMasterData('EMPLOYEE_STATUS');
  const { data: deviceTypeOptions = [] } = useMasterData('DEVICE_TYPE');
  const { data: activityTypeOptions = [] } = useMasterData('ACTIVITY_TYPE');

  const { data: interviews, isLoading: loadingInterviews } = useQuery<RecruitmentInterview[]>({
    queryKey: ['recruitment-interviews'],
    queryFn: async () => {
      const response = await api.get(`/recruitment/interviews`);
      return response.data || [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: pickerEmployees = [] } = useEmployeePicker({ status: 'active' });
  const employees = pickerEmployees.map(normalizePickerEmployee) as EmployeeOption[];

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['companies-dropdown'],
    queryFn: async () => {
      const res = await api.get('/companies');
      return res.data?.items || res.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  useQuery<BranchOption[]>({
    queryKey: ['branches-dropdown'],
    queryFn: async () => {
      const res = await api.get('/branches');
      return res.data?.items || res.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments-dropdown'],
    queryFn: async () => {
      const res = await api.get('/departments');
      return res.data?.items || res.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });



  // =============================================================================
  // MUTATIONS
  // =============================================================================

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const endpoint = showModal === 'job' ? 'recruitment/jobs' : showModal === 'candidate' ? 'recruitment/candidates' : 'recruitment/interviews';
      return api.post(`/${endpoint}`, payload);
    },
    onSuccess: () => {
      toast.success('Created successfully');
      setShowModal(null);
      setFormData({});
      setEditingItem(null);
      queryClient.invalidateQueries({ queryKey: ['recruitment-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-interviews'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-pipeline-stats'] });
      setFormTab('basic');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(err.response?.data?.detail || err.message || 'Failed to create');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) => {
      const endpoint = showModal === 'job' ? 'recruitment/jobs' : showModal === 'candidate' ? 'recruitment/candidates' : 'recruitment/interviews';
      return api.put(`/${endpoint}/${id}`, payload);
    },
    onSuccess: () => {
      toast.success('Updated successfully');
      setShowModal(null);
      setFormData({});
      setEditingItem(null);
      queryClient.invalidateQueries({ queryKey: ['recruitment-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-interviews'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-pipeline-stats'] });
      setFormTab('basic');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(err.response?.data?.detail || err.message || 'Failed to update');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const endpoint = activeTab === 'jobs'
        ? `recruitment/jobs/${id}`
        : activeTab === 'interviews'
          ? `recruitment/interviews/${id}`
          : `recruitment/candidates/${id}`;
      return api.delete(`/${endpoint}`);
    },
    onSuccess: () => {
      toast.success('Deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['recruitment-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-interviews'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-pipeline-stats'] });
    },
    onError: () => toast.error('Failed to delete'),
    onSettled: () => setDeleteTarget(null)
  });

  const onboardMutation = useMutation({
    mutationFn: async ({ id, joinDate }: { id: number; joinDate?: string }) => {
      return api.post(`/recruitment/candidates/${id}/onboard`, { joinDate });
    },
    onSuccess: (data: { data?: { employeeId?: number; employeeCode?: string } }) => {
      toast.success(`Candidate moved to onboarding${data.data?.employeeCode ? ` (${data.data.employeeCode})` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['recruitment-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-' + activeTab] });
      queryClient.invalidateQueries({ queryKey: ['onboardingEmployees'] });
      setOnboardTarget(null);
      setOnboardJoinDate('');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(`Failed to move to onboarding: ${err.response?.data?.detail || err.message}`);
    }
  });

  const handleOnboardCandidate = (candidate: RecruitmentCandidate) => {
    setOnboardTarget(candidate);
    setOnboardJoinDate('');
  };

  const handleRejectCandidate = (candidate: RecruitmentCandidate, source: 'candidate' | 'interview' = 'candidate') => {
    setRejectTarget(candidate);
    setRejectSource(source);
    setRejectReason('');
  };

  const submitRejection = async () => {
    if (!rejectTarget && !rejectTargets) return;
    try {
      if (rejectTargets && rejectTargets.length > 0) {
        if (rejectTargets.length > 1) {
          await api.post('/recruitment/candidates/bulk-status', {
            ids: rejectTargets.map((c) => c.id),
            status: 'rejected',
            reason: rejectReason,
          });
        } else {
          await Promise.allSettled(
            rejectTargets.map((c) => api.patch(`/recruitment/candidates/${c.id}/status`, { status: 'rejected', reason: rejectReason }))
          );
        }
        toast.success(`${rejectTargets.length} candidate(s) rejected`);
        setRejectTargets(null);
      } else if (rejectTarget) {
        await api.patch(`/recruitment/candidates/${rejectTarget.id}/status`, { status: 'rejected', reason: rejectReason });
        if (rejectSource === 'interview') {
          // Also mark the related interview as rejected so the record's source is clear
          const cand = (candidates || []).find((c: RecruitmentCandidate) => c.id === rejectTarget.id);
          if (cand?.interviewId) {
            await api.put(`/recruitment/interviews/${cand.interviewId}/status`, { status: 'rejected', decision: 'reject', reason: rejectReason });
          }
        }
        toast.success(`${candidateDisplayName(rejectTarget)} rejected`);
        setRejectTarget(null);
      }
      queryClient.invalidateQueries({ queryKey: ['recruitment-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-interviews'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-pipeline-stats'] });
      setRejectReason('');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(`Failed to reject: ${err.response?.data?.detail || err.message}`);
    }
  };

  const submitReasonAction = async () => {
    if (!reasonActionTargets || reasonActionTargets.length === 0) return;
    const targets = reasonActionTargets;
    try {
      if (reasonActionType === 'delete') {
        targets.forEach((c) => deleteMutation.mutate(c.id));
        setReasonActionTargets(null);
        setReasonActionReason('');
        return;
      }
      const status = reasonActionType === 'reject' ? 'rejected' : reasonActionType === 'select' ? 'offered' : reasonActionType === 'notjoined' ? 'not_joined' : reasonActionType === 'shortlist' ? 'shortlisted' : reasonActionType === 'restoreoffered' ? 'offered' : 'applied';
      if (targets.length > 1) {
        await api.post('/recruitment/candidates/bulk-status', {
          ids: targets.map((c) => c.id),
          status,
          reason: reasonActionReason,
        });
      } else {
        await Promise.allSettled(
          targets.map((c) => api.patch(`/recruitment/candidates/${c.id}/status`, { status, reason: reasonActionReason }))
        );
      }
      const verb = reasonActionType === 'reject' ? 'rejected' : reasonActionType === 'select' ? 'selected' : reasonActionType === 'notjoined' ? 'marked as not joined' : reasonActionType === 'restoreoffered' ? 'restored to offered' : reasonActionType === 'shortlist' ? 'shortlisted' : 'restored';
      toast.success(`${targets.length} candidate(s) ${verb}`);
      queryClient.invalidateQueries({ queryKey: ['recruitment-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-interviews'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-pipeline-stats'] });
      setReasonActionTargets(null);
      setReasonActionReason('');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(`Failed: ${err.response?.data?.detail || err.message}`);
    }
  };

  // Bulk upload mutation
  const bulkUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const endpoint = activeTab === 'jobs' ? 'recruitment/jobs/bulk-upload' : activeTab === 'candidates' ? 'recruitment/candidates/bulk-upload' : 'recruitment/interviews/bulk-upload';
      return api.post(`/${endpoint}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    },
    onSuccess: (data: { data?: { created?: number; updated?: number } }) => {
      toast.success(`Bulk upload completed: ${data.data?.created || 0} created, ${data.data?.updated || 0} updated`);
      queryClient.invalidateQueries({ queryKey: ['recruitment-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-interviews'] });
      queryClient.invalidateQueries({ queryKey: ['recruitment-pipeline-stats'] });
      setShowBulkUpload(false);
      setUploadFile(null);
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(`Bulk upload failed: ${err.response?.data?.message || err.message}`);
    }
  });

  // Download template function
  const downloadTemplate = async () => {
    try {
      const endpoint = activeTab === 'jobs' ? 'recruitment/jobs/template' : activeTab === 'candidates' ? 'recruitment/candidates/template' : 'recruitment/interviews/template';
      const response = await api.get(`/${endpoint}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${activeTab}_bulk_upload_template.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded successfully');
    } catch {
      toast.error('Failed to download template');
    }
  };

  // =============================================================================
  // HANDLERS
  // =============================================================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showModal === 'interview') {
      // Map form field names to the backend schema (interviewType/interviewRound)
      const targetRound = interviewRoundTab || Number(formData.round) || Number(formData.interviewRound) || 1;
      const existing = (interviews || []).find((i: RecruitmentInterview) =>
        i.candidateId === Number(formData.candidateId) && Number(i.interviewRound || 1) === targetRound
      );
      const rawSched = (formData.scheduledAt as string | undefined) || '';
      const safeSched = (rawSched && rawSched.trim() !== '' && rawSched !== 'T') ? rawSched : (existing?.scheduledAt || existing?.date || new Date().toISOString());
      const payload: Record<string, string | number | undefined> = {
        ...formData,
        scheduledAt: safeSched,
        interviewType: formData.type || formData.interviewType || 'in_person',
        interviewRound: targetRound,
        status: (formData.status as string | undefined) || existing?.status || 'scheduled',
      };
      delete payload.type;
      delete payload.round;
      if (existing && !editingItem) {
        updateMutation.mutate({ id: existing.id, payload });
      } else if (editingItem) {
        updateMutation.mutate({ id: editingItem.id, payload });
      } else {
        createMutation.mutate(payload);
      }
    } else if (editingItem) {
      // Preserve existing status on candidate edits when the dropdown was left unset
      const payload = showModal === 'candidate' && (!formData.status || formData.status === '')
        ? { ...formData, status: (editingItem as RecruitmentCandidate).status || 'applied' }
        : formData;
      updateMutation.mutate({
        id: editingItem.id,
        payload: showModal === 'candidate' ? toFullNamePayload(payload as Record<string, unknown>) : payload,
      });
    } else {
      createMutation.mutate(showModal === 'candidate' ? toFullNamePayload(formData as Record<string, unknown>) : formData);
    }
  };

  // Load a round tab's data into the Add/Edit Interview form (drawer).
  const selectRoundTab = (num: number) => {
    setInterviewRoundTab(num);
    const candId = Number(formData.candidateId);
    const rr = (interviews || []).find((i: RecruitmentInterview) => i.candidateId === candId && Number(i.interviewRound || 1) === num);
    setEditingItem((rr as unknown as RecruitmentItem) || null);
    if (rr) {
      setFormData({
        candidateId: String(rr.candidateId),
        jobId: String(rr.jobId ?? ''),
        jobOpeningId: String(rr.jobId ?? ''),
        companyId: rr.companyId ? String(rr.companyId) : '',
        interviewerId: rr.interviewerId ? String(rr.interviewerId) : '',
        round: rr.interviewRound,
        interviewRound: rr.interviewRound,
        type: rr.interviewType,
        interviewType: rr.interviewType,
        scheduledAt: rr.scheduledAt || rr.date || '',
        status: rr.status || '',
        rating: rr.rating,
        feedback: rr.feedback || '',
        technicalScore: rr.technicalScore,
        communicationScore: rr.communicationScore,
        overallScore: rr.overallScore,
      });
    } else {
      setFormData((prev) => ({
        candidateId: prev.candidateId,
        jobId: prev.jobId,
        jobOpeningId: prev.jobOpeningId,
        companyId: prev.companyId,
        interviewerId: prev.interviewerId,
        round: num,
        interviewRound: num,
        type: '',
        interviewType: '',
        scheduledAt: '',
        status: '',
        rating: undefined,
        feedback: '',
        technicalScore: undefined,
        communicationScore: undefined,
        overallScore: undefined,
      }));
    }
  };

  const handleEdit = (item: RecruitmentItem) => {
    setEditingItem(item);
    // Map publishedDate -> postDate for the job form
    const mapped = { ...item, postDate: (item as RecruitmentJob).publishedDate ? String((item as RecruitmentJob).publishedDate).split('T')[0] : undefined };
    setFormData(mapped as RecruitmentFormData);
    setFormTab('basic');
    setShowModal(activeTab === 'jobs' ? 'job' : activeTab === 'candidates' ? 'candidate' : 'interview');
    if (activeTab === 'interviews') {
      setInterviewRoundTab(Number((item as RecruitmentInterview).interviewRound || 1));
    }
    setIsClosing(false);
  };

  const handleCloseDrawer = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowModal(null);
      setFormData({});
      setEditingItem(null);
      setFormTab('basic');
      setIsFresher(false);
      setInterviewCompanyId('');
      setIsClosing(false);
    }, 300);
  };

  const openPostJob = (job: RecruitmentJob) => {
    setPostJobTarget(job);
  };

  const postJobToPortal = (portal: { id: string; name: string; url: string }) => {
    if (!postJobTarget) return;
    // Open the official portal URL so the user can log in and post the job there.
    window.open(portal.url, '_blank', 'noopener,noreferrer');
    toast.success(`Opened ${portal.name} — please log in and post "${postJobTarget.title}"`);
    setPostJobTarget(null);
  };

  const handleToggleJobStatus = async (job: RecruitmentJob) => {
    try {
      const newStatus = job.status === 'open' ? 'closed' : 'open';
      await api.patch(`/recruitment/jobs/${job.id}/status`, { status: newStatus });
      toast.success(`Job ${newStatus} successfully`);
      queryClient.invalidateQueries({ queryKey: ['recruitment-jobs'] });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      // Error logged
      toast.error(`Failed to toggle status: ${err.response?.data?.detail || err.message}`);
    }
  };

  const generateJobCode = async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    let unique = false;
    let attempts = 0;
    while (!unique && attempts < 10) {
      attempts++;
      code = Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      try {
        const res = await api.get('/recruitment/jobs/check-code', { params: { code, excludeId: editingItem?.id } });
        unique = !res.data?.duplicate;
      } catch {
        unique = true; // if the check fails, use the code anyway
      }
    }
    setFormData((prev) => ({ ...prev, jobCode: code }));
    return code;
  };

  // =============================================================================
  // FILTERED DATA
  // =============================================================================
  const filteredJobs = useMemo(() => {
    if (!jobs) return [];
    return jobs.filter((j: RecruitmentJob) => {
      const matchSearch = (j.title || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'all' || j.status === statusFilter;
      const matchCompany = companyFilter === 'all' || j.companyId?.toString() === companyFilter;
      const matchBranch = branchFilter === 'all' || j.branchId?.toString() === branchFilter;
      const matchDept = departmentFilter === 'all' || j.departmentId?.toString() === departmentFilter;
      
      const itemDate = j.createdAt || j.date || j.updatedAt;
      const matchStart = !startDate || (itemDate && itemDate.substring(0, 10) >= startDate);
      const matchEnd = !endDate || (itemDate && itemDate.substring(0, 10) <= endDate);

      return matchSearch && matchStatus && matchCompany && matchBranch && matchDept && matchStart && matchEnd;
    });
  }, [jobs, searchTerm, statusFilter, companyFilter, branchFilter, departmentFilter, startDate, endDate]);

  const filteredCandidates = useMemo(() => {
    if (!candidates) return [];
    return candidates.filter((c: RecruitmentCandidate) => {
      const matchSearch = (c.name || c.fullName || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      const matchCompany = companyFilter === 'all' || c.companyId?.toString() === companyFilter;
      const matchDept = candidateDepartmentFilter === 'all' || c.departmentId?.toString() === candidateDepartmentFilter;

      const itemDate = c.createdAt || c.date || c.updatedAt;
      const matchStart = !startDate || (itemDate && itemDate.substring(0, 10) >= startDate);
      const matchEnd = !endDate || (itemDate && itemDate.substring(0, 10) <= endDate);

      return matchSearch && matchStatus && matchCompany && matchDept && matchStart && matchEnd;
    });
  }, [candidates, searchTerm, statusFilter, companyFilter, candidateDepartmentFilter, startDate, endDate]);

  const candidatesTabList = useMemo(
    () => filteredCandidates.filter((c: RecruitmentCandidate) => CANDIDATE_TAB_STATUSES.includes(c.status)),
    [filteredCandidates]
  );

  const filteredOffered = useMemo(() => filteredCandidates.filter(
    (c: RecruitmentCandidate) => (c.status === 'offered' || c.status === 'hired' || c.status === 'not_joined') && (offeredStatusFilter === 'all' || c.status === offeredStatusFilter)
  ), [filteredCandidates, offeredStatusFilter]);

  const filteredInterviews = useMemo(() => {
    if (!interviews) return [];
    return interviews.filter((i: RecruitmentInterview) => {
      const matchSearch = (i.candidate || i.candidate_name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchCompany = companyFilter === 'all' || i.companyId?.toString() === companyFilter;

      const roundNum = Number(i.interviewRound || 1);
      const roundCode = roundNum === 5 ? 'final' : `round_${roundNum}`;
      const matchRound = interviewRoundFilter === 'all' || interviewRoundFilter === roundCode || interviewRoundFilter === String(roundNum);
      const matchType = interviewTypeFilter === 'all' || String(i.interviewType || '') === interviewTypeFilter;
      const matchStatus = interviewStatusFilter === 'all' || String(i.status || '') === interviewStatusFilter;

      const itemDate = i.date || i.scheduledAt || i.createdAt || i.updatedAt;
      const matchStart = !startDate || (itemDate && itemDate.substring(0, 10) >= startDate);
      const matchEnd = !endDate || (itemDate && itemDate.substring(0, 10) <= endDate);

      return matchSearch && matchCompany && matchRound && matchType && matchStatus && matchStart && matchEnd;
    });
  }, [interviews, searchTerm, companyFilter, interviewRoundFilter, interviewTypeFilter, interviewStatusFilter, startDate, endDate]);

  const interviewsTabList = useMemo(() => {
    const candById = new Map((candidates || []).map((c: RecruitmentCandidate) => [c.id, c.status]));
    return (interviewStatusFilter === 'all' ? filteredInterviews : filteredInterviews).filter((i: RecruitmentInterview) => {
      // Hide interviews for candidates who have left the interview pipeline
      // (rejected, hired/onboarded/active). Their history stays in the DB.
      const candStatus = i.candidateId ? candById.get(Number(i.candidateId)) : undefined;
      if (candStatus === 'rejected') return false;
      if (candStatus === 'hired' || candStatus === 'onboarded') return false;
      if (interviewStatusFilter === 'all' && String(i.status || '') === 'rejected') return false;
      return true;
    });
  }, [filteredInterviews, interviewStatusFilter, candidates]);

  // Group interviews by candidate so the Interviews tab shows ONE row per
  // employee; all round data lives inside the "rounds" array (viewed via the
  // Rounds modal / Quick Edit).
  const groupedInterviews = useMemo(() => {
    if (!interviews) return [];
    const byCandidate = new Map<number, RecruitmentInterview[]>();
    (interviews as RecruitmentInterview[]).forEach((iv) => {
      const key = Number(iv.candidateId);
      if (!key) return;
      const arr = byCandidate.get(key) || [];
      arr.push(iv);
      byCandidate.set(key, arr);
    });
    const groups: GroupedInterview[] = [];
    byCandidate.forEach((rounds, candidateId) => {
      rounds.sort((a, b) => (a.interviewRound || 1) - (b.interviewRound || 1) || a.id - b.id);
      const latest = rounds[rounds.length - 1];
      groups.push({
        id: candidateId,
        candidateId,
        candidateName: latest.candidateName || `Candidate #${candidateId}`,
        jobId: latest.jobId,
        jobTitle: latest.jobTitle,
        companyId: latest.companyId,
        companyName: latest.companyName as string | undefined,
        interviewerId: latest.interviewerId,
        interviewerName: latest.interviewerName,
        rounds,
        interviewIds: rounds.map((r) => r.id),
        interviewRound: latest.interviewRound || 1,
        status: latest.status || 'scheduled',
        interviewType: latest.interviewType || 'technical',
        scheduledAt: latest.scheduledAt || latest.date,
        rating: latest.rating,
        feedback: latest.feedback,
        technicalScore: latest.technicalScore as number | undefined,
        communicationScore: latest.communicationScore as number | undefined,
        overallScore: latest.overallScore,
      });
    });
    return groups;
  }, [interviews]);

  const groupedInterviewsTabList = useMemo(() => {
    const candById = new Map((candidates || []).map((c: RecruitmentCandidate) => [c.id, c.status]));
    return groupedInterviews.filter((g) => {
      const candStatus = g.candidateId ? candById.get(g.candidateId) : undefined;
      if (candStatus === 'rejected') return false;
      if (candStatus === 'offered') return false;
      if (candStatus === 'hired' || candStatus === 'onboarded') return false;
      const matchSearch = (g.candidateName || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchCompany = companyFilter === 'all' || g.companyId?.toString() === companyFilter;
      const matchRound = interviewRoundFilter === 'all' || g.rounds.some((r) => {
        const roundNum = Number(r.interviewRound || 1);
        const roundCode = roundNum === 5 ? 'final' : `round_${roundNum}`;
        return interviewRoundFilter === roundCode || interviewRoundFilter === String(roundNum);
      });
      const matchType = interviewTypeFilter === 'all' || g.rounds.some((r) => String(r.interviewType || '') === interviewTypeFilter);
      const matchStatus = interviewStatusFilter === 'all' || g.rounds.some((r) => String(r.status || '') === interviewStatusFilter);
      const matchDates = g.rounds.some((r) => {
        const itemDate = r.date || r.scheduledAt || r.createdAt || r.updatedAt;
        return (!startDate || (itemDate && itemDate.substring(0, 10) >= startDate)) &&
               (!endDate || (itemDate && itemDate.substring(0, 10) <= endDate));
      });
      return matchSearch && matchCompany && matchRound && matchType && matchStatus && matchDates;
    });
  }, [groupedInterviews, searchTerm, companyFilter, interviewRoundFilter, interviewTypeFilter, interviewStatusFilter, startDate, endDate, candidates]);

  // =============================================================================
  // STATS
  // =============================================================================

  const statCards = [
    {
      label: 'Total Jobs',
      value: jobs?.length || 0,
      trend: (() => { const total = jobs?.length || 0; const open = jobs?.filter((j: RecruitmentJob) => j.status === 'open').length || 0; return total ? Math.round((open / total) * 100) : 0; })(),
      icon: Briefcase,
      iconBg: 'bg-gradient-to-br from-[#1C64F2]/20 via-[#3B82F6]/10 to-[#60A5FA]/5',
      iconColor: 'text-[var(--primary-blue)]',
      onClick: () => setActiveTab('jobs'),
      tooltip: 'All job postings in the system',
    },
    {
      label: 'Total Candidates',
      value: (candidates || []).filter((c: RecruitmentCandidate) => ['applied', 'invited', 'shortlisted', 'not_arrived', 'rejected'].includes(c.status)).length || 0,
      trend: (() => { const total = (candidates || []).filter((c: RecruitmentCandidate) => ['applied', 'invited', 'shortlisted', 'not_arrived', 'rejected'].includes(c.status)).length; const shortlisted = candidates?.filter((c: RecruitmentCandidate) => c.status === 'shortlisted').length || 0; return total ? Math.round((shortlisted / total) * 100) : 0; })(),
      icon: Users,
      iconBg: 'bg-gradient-to-br from-[#14B8A6]/20 via-[#2DD4BF]/10 to-[#5EEAD4]/5',
      iconColor: 'text-[#0D9488]',
      onClick: () => setActiveTab('candidates'),
      tooltip: 'Active candidates in the hiring pipeline',
    },
    {
      label: 'Total Interviews',
      value: groupedInterviewsTabList.length || 0,
      trend: (() => { const total = groupedInterviewsTabList.length || 0; const done = groupedInterviewsTabList.filter((g) => g.status === 'completed' || g.status === 'selected').length || 0; return total ? Math.round((done / total) * 100) : 0; })(),
      icon: Calendar,
      iconBg: 'bg-gradient-to-br from-[#F59E0B]/20 via-[#FBBF24]/10 to-[#FCD34D]/5',
      iconColor: 'text-[#D97706]',
      onClick: () => setActiveTab('interviews'),
      tooltip: 'Interviews scheduled and completed',
    },
    {
      label: 'Total Job Offered',
      value: candidates?.filter((c: RecruitmentCandidate) => c.status === 'offered' || c.status === 'hired' || c.status === 'not_joined').length || 0,
      trend: (() => { const offered = candidates?.filter((c: RecruitmentCandidate) => c.status === 'offered' || c.status === 'hired').length || 0; const total = candidates?.length || 0; return total ? Math.round((offered / total) * 100) : 0; })(),
      icon: Award,
      iconBg: 'bg-gradient-to-br from-[#7C3AED]/20 via-[#8B5CF6]/10 to-[#A78BFA]/5',
      iconColor: 'text-[#6D28D9]',
      onClick: () => setActiveTab('offered'),
      tooltip: 'Candidates who received job offers',
    },
    {
      label: 'Total Onboarded',
      value: (onboardingEmployees || []).length || 0,
      trend: (() => { const onboarded = (onboardingEmployees || []).length; const total = candidates?.length || 0; return total ? Math.round((onboarded / total) * 100) : 0; })(),
      icon: LogIn,
      iconBg: 'bg-gradient-to-br from-[#10B981]/20 via-[#34D399]/10 to-[#6EE7B7]/5',
      iconColor: 'text-[#059669]',
      onClick: () => setActiveTab('onboarding'),
      tooltip: 'Candidates who completed onboarding',
    },
    {
      label: 'Rejected',
      value: candidates?.filter((c: RecruitmentCandidate) => c.status === 'rejected').length || 0,
      trend: (() => { const rejected = candidates?.filter((c: RecruitmentCandidate) => c.status === 'rejected').length || 0; const total = candidates?.length || 0; return total ? -Math.round((rejected / total) * 100) : 0; })(),
      icon: XCircle,
      iconBg: 'bg-gradient-to-br from-[#EF4444]/20 via-[#F87171]/10 to-[#FCA5A5]/5',
      iconColor: 'text-[#DC2626]',
      onClick: () => setActiveTab('candidates'),
      tooltip: 'Candidates who were rejected',
    },
  ];

  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (jobs && jobs.length > 0 && !hasLoaded) {
      setHasLoaded(true);
    }
  }, [jobs, hasLoaded]);

  const isInitialLoading = !hasLoaded && isFetching;
  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] animate-page-enter">
        <div className="w-full mx-auto space-y-6 p-6">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  // =============================================================================
  // RENDER TABLES
  // =============================================================================

  const renderJobsTable = () => (
    <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
      {loadingJobs ? (
        <div className="animate-page-enter"><PageSkeleton /></div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            data={filteredJobs}
            rowKey={(job: RecruitmentJob) => job.id}
            searchable
            searchKeys={(job: RecruitmentJob) => `${job.title || ''} ${job.jobCode || ''} ${job.companyName || companies.find((c: Company) => c.id === job.companyId)?.name || ''} ${job.departmentName || ''} ${job.location || ''} ${job.employmentType || ''} ${job.status || ''} ${job.vacancyCount || ''}`}
            searchPlaceholder="Search anything here..."
            emptyMessage="No job openings found"
            logEntityType="job"
            logFor={(job: RecruitmentJob) => ({ id: job.id, label: job.title })}
            onEdit={(job) => handleEdit(job as RecruitmentItem)}
            bulkActions={[
              {
                label: 'Activate',
                icon: CheckCircle2,
                variant: 'success',
                onAction: (items) => {
                  setActivateJobsTarget(items as RecruitmentJob[]);
                },
              },
              {
                label: 'Deactivate',
                icon: Ban,
                variant: 'amber',
                onAction: (items) => {
                  setDeactivateJobsTarget(items as RecruitmentJob[]);
                },
              },
              {
                label: 'Post Job',
                icon: CloudCog,
                variant: 'primary',
                disabled: (selected) => selected.length !== 1,
                disabledTitle: 'Select a single job to post',
                onAction: (items) => {
                  const first = (items as RecruitmentJob[])[0];
                  if (first) openPostJob(first);
                },
              },
              {
                label: 'Delete',
                icon: Trash2,
                variant: 'danger',
                onAction: (items) => {
                  setBulkDeleteJobs(items as RecruitmentJob[]);
                },
              },
            ]}
            columns={[
              {
                key: 'title', header: 'Job Title', sortable: true,
                render: (job: RecruitmentJob) => (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                      <Briefcase className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-[#0F172A] text-sm">{job.title}</div>
                      <div className="text-xs text-[#94A3B8]">{job.jobCode || `ID: ${job.id}`}</div>
                    </div>
                  </div>
                ),
                sortValue: (job: RecruitmentJob) => job.title,
              },
              { key: 'companyId', header: 'Company', sortable: true, sortValue: (job: RecruitmentJob) => job.companyName || companies.find((c: Company) => c.id === job.companyId)?.name || '', render: (job: RecruitmentJob) => <span className="text-sm text-[#64748B]">{job.companyName || companies.find((c: Company) => c.id === job.companyId)?.name || '-'}</span> },
              { key: 'departmentId', header: 'Department', sortable: true, sortValue: (job: RecruitmentJob) => job.departmentName || '', render: (job: RecruitmentJob) => <span className="text-sm text-[#64748B]">{job.departmentName || '-'}</span> },
              { key: 'location', header: 'Location', render: (job: RecruitmentJob) => {
                const loc = job.location || '';
                const locLabel = (jobLocationOptions as Array<{ code: string; name: string }>).find((o) => o.code === loc)?.name || (loc ? loc.charAt(0).toUpperCase() + loc.slice(1) : 'Remote');
                return <span className="text-sm text-[#64748B] flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{locLabel}</span>;
              } },
              { key: 'employmentType', header: 'Job Type', render: (job: RecruitmentJob) => <span className="text-sm text-[#64748B]">{job.employmentType || 'full-time'}</span> },
              { key: 'vacancyCount', header: 'Vacancies', render: (job: RecruitmentJob) => <span className="text-sm text-[#64748B]">{job.vacancyCount || 1}</span> },
              { key: 'postDate', header: 'Job Post Date', sortable: true, sortValue: (job: RecruitmentJob) => job.publishedDate || job.postDate || '', render: (job: RecruitmentJob) => {
                const d = String(job.publishedDate || job.postDate || job.createdAt || '');
                return <span className="text-sm text-[#64748B]">{d ? formatAppDate(d) : '-'}</span>;
              } },
              {
                key: 'status', header: 'Recruitment Status', align: 'center',
                render: (job: RecruitmentJob) => <ToggleSwitch checked={job.status === 'open'} onChange={() => handleToggleJobStatus(job)} helpText={job.status === 'open' ? 'Click to close this job opening' : 'Click to reopen this job opening'} />,
              },
            ]}
            actions={(job: RecruitmentJob) => (
              <div className="flex items-center justify-end gap-1.5">
                <button onClick={() => openPostJob(job)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1C64F2] hover:bg-[#1E40AF] text-white rounded-lg text-xs font-semibold transition-colors" title="Post to job portals">
                  <CloudCog className="w-3.5 h-3.5" /> Post Job
                </button>
                <button onClick={() => handleEdit(job)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => setDeleteTarget({ id: job.id, name: job.title })} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );

  const renderCandidatesTable = () => (
    <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
      {loadingCandidates ? (
        <div className="flex justify-center p-8">null</div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            data={candidatesTabList}
            logEntityType="candidate" logFor={(candidate: RecruitmentCandidate) => ({ id: candidate.id, label: candidateDisplayName(candidate) })}
            rowKey={(candidate: RecruitmentCandidate) => candidate.id}
            searchable
            searchKeys={(candidate: RecruitmentCandidate) => `${candidateDisplayName(candidate)} ${candidate.email} ${candidate.phone || ''} ${candidate.status || ''} ${candidate.companyName || ''} ${candidate.departmentName || ''} ${candidate.jobTitle || ''} ${candidate.currentPosition || ''} ${candidate.source || ''}`}
            searchPlaceholder="Search anything here..."
            emptyMessage="No candidates found"
            onEdit={(candidate) => handleEdit(candidate as RecruitmentItem)}
            bulkActions={[
              {
                label: 'Shortlisted',
                icon: Award,
                variant: 'success',
                onAction: (items) => {
                  setReasonActionTargets(items as RecruitmentCandidate[]);
                  setReasonActionType('shortlist');
                  setReasonActionReason('');
                },
              },
              {
                label: 'Rejected',
                icon: XCircle,
                variant: 'orange',
                onAction: (items) => {
                  setRejectTargets(items as RecruitmentCandidate[]);
                  setRejectTarget(null);
                  setRejectReason('');
                },
              },
              {
                label: 'Restore',
                icon: RotateCcw,
                variant: 'slate',
                onAction: (items) => {
                  setReasonActionTargets(items as RecruitmentCandidate[]);
                  setReasonActionType('restore');
                  setReasonActionReason('');
                },
              },
              {
                label: 'Delete',
                icon: Trash2,
                variant: 'danger',
                onAction: (items) => {
                  setReasonActionTargets(items as RecruitmentCandidate[]);
                  setReasonActionType('delete');
                  setReasonActionReason('');
                },
              },
            ]}
            columns={[
              {
                key: 'fullName', header: 'Name', sortable: true,
                render: (candidate: RecruitmentCandidate) => (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                      {personInitials(candidate, 'C')}
                    </div>
                    <div>
                      <div className="font-medium text-[#0F172A]">{candidateDisplayName(candidate)}</div>
                      {candidate.currentPosition && <div className="text-xs text-[#94A3B8]">{candidate.currentPosition}</div>}
                    </div>
                  </div>
                ),
                sortValue: (candidate: RecruitmentCandidate) => candidateDisplayName(candidate),
              },
              { key: 'email', header: 'Email', render: (candidate: RecruitmentCandidate) => <span className="text-sm text-[#64748B]">{candidate.email}</span> },
              { key: 'companyId', header: 'Company', sortable: true, sortValue: (candidate: RecruitmentCandidate) => candidate.companyName || '', render: (candidate: RecruitmentCandidate) => <span className="text-sm text-[#64748B]">{candidate.companyName || '-'}</span> },
              { key: 'departmentId', header: 'Department', sortable: true, sortValue: (candidate: RecruitmentCandidate) => candidate.departmentName || '', render: (candidate: RecruitmentCandidate) => <span className="text-sm text-[#64748B]">{candidate.departmentName || '-'}</span> },
              {
                key: 'jobTitle', header: 'Applied Job', sortable: true, sortValue: (candidate: RecruitmentCandidate) => candidate.jobTitle || '',
                render: (candidate: RecruitmentCandidate) => candidate.jobTitle ? (
                  <div>
                    <div>{candidate.jobTitle}</div>
                    <div className="text-xs text-[#94A3B8]">Job #{candidate.jobId}</div>
                  </div>
                ) : <span className="text-sm text-[#64748B]">-</span>,
              },
              { key: 'phone', header: 'Phone', render: (candidate: RecruitmentCandidate) => <span className="text-sm text-[#64748B]">{candidate.phone || '-'}</span> },
              {
                key: 'status', header: 'Candidate Status',
                render: (candidate: RecruitmentCandidate) => statusBadge(candidate.status),
              },
              {
                key: 'reason', header: 'Reason', sortable: true,
                sortValue: (candidate: RecruitmentCandidate) => candidate.selectionReason || candidate.rejectionReason || '',
                render: (candidate: RecruitmentCandidate) => {
                  const reason = candidate.selectionReason || candidate.rejectionReason || '';
                  if (!reason) return <span className="text-sm text-[#94A3B8]">-</span>;
                  return <span className="text-sm text-[#64748B] max-w-[220px] line-clamp-2 block">{reason}</span>;
                },
              },
            ]}
            actions={(candidate: RecruitmentCandidate) => (
              <div className="flex items-center justify-end gap-1.5">
                {candidate.status === 'shortlisted' ? (
                  <>
                    <button
                      onClick={() => { setReasonActionTargets([candidate]); setReasonActionType('restore'); setReasonActionReason(''); }}
                      title="Restore to previous status"
                      className="px-2.5 py-1.5 bg-[#64748B] text-white text-xs font-medium rounded-lg hover:bg-[#475569] transition-colors flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Restore
                    </button>
                  </>
                ) : candidate.status === 'rejected' ? (
                  <>
                    <button
                      onClick={() => { setReasonActionTargets([candidate]); setReasonActionType('restore'); setReasonActionReason(''); }}
                      title="Restore candidate"
                      className="px-2.5 py-1.5 bg-[#64748B] text-white text-xs font-medium rounded-lg hover:bg-[#475569] transition-colors flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Restore
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setReasonActionTargets([candidate]); setReasonActionType('shortlist'); setReasonActionReason(''); }}
                      title="Shortlist candidate"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#10B981] text-white text-xs font-medium rounded-lg hover:bg-[#059669] transition-colors"
                    >
                      <Award className="w-3.5 h-3.5" /> Shortlisted
                    </button>
                    <button
                      onClick={() => handleRejectCandidate(candidate, 'candidate')}
                      title="Reject candidate"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#F59E0B] text-white text-xs font-medium rounded-lg hover:bg-[#D97706] transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Rejected
                    </button>
                  </>
                )}
                <button onClick={() => { setEditingItem(candidate); setFormData(candidate); setIsFresher(!candidate.experienceYears && !candidate.currentCompany); setShowModal('candidate'); }} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => { setReasonActionTargets([candidate]); setReasonActionType('delete'); setReasonActionReason(''); }} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );

  const renderInterviewsTable = () => {
    const roundNames: Record<number, string> = { 1: 'Recruiter', 2: 'HR Manager', 3: 'Technical', 4: 'Behavioral', 5: 'Final' };
    const roundBadgeCls: Record<number, string> = {
      1: 'bg-blue-100 text-blue-700', 2: 'bg-violet-100 text-violet-700',
      3: 'bg-cyan-100 text-cyan-700', 4: 'bg-pink-100 text-pink-700', 5: 'bg-amber-100 text-amber-700',
    };
    const typeMap: Record<string, { label: string; cls: string }> = {
      telephonic: { label: 'Telephonic', cls: 'bg-teal-100 text-teal-700' },
      video: { label: 'Video', cls: 'bg-indigo-100 text-indigo-700' },
      face_to_face: { label: 'Face to Face', cls: 'bg-pink-100 text-pink-700' },
      panel: { label: 'Panel', cls: 'bg-lime-100 text-lime-700' },
      in_person: { label: 'In Person', cls: 'bg-sky-100 text-sky-700' },
    };
    const statusMap: Record<string, string> = {
      scheduled: 'bg-sky-100 text-sky-700', completed: 'bg-emerald-100 text-emerald-700',
      selected: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-gray-100 text-gray-700',
      rejected: 'bg-rose-100 text-rose-700', rescheduled: 'bg-amber-100 text-amber-700',
      no_show: 'bg-orange-100 text-orange-700', in_progress: 'bg-cyan-100 text-cyan-700',
      pending: 'bg-yellow-100 text-yellow-700',
    };
    const fmtDate = (dt?: string) => {
      if (!dt) return 'Not scheduled';
      const d = new Date(dt);
      if (isNaN(d.getTime())) return dt;
      const h = d.getHours();
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
    };
    const toCandidates = (items: GroupedInterview[]) => (items as GroupedInterview[])
      .map((g) => (candidates || []).find((c: RecruitmentCandidate) => c.id === g.candidateId))
      .filter((c): c is RecruitmentCandidate => !!c);

    return (
      <div className="overflow-hidden bg-white rounded-2xl border border-[#E9EDF3]">
        {loadingInterviews ? (
          <div className="flex justify-center p-8">null</div>
        ) : (
          <DataTable
            data={groupedInterviewsTabList}
            logEntityType="candidate" logFor={(interview: GroupedInterview) => ({ id: interview.candidateId, label: interview.candidateName || `Candidate #${interview.candidateId}` })}
            rowKey={(interview: GroupedInterview) => interview.candidateId}
            searchable
            searchKeys={(interview: GroupedInterview) => `${interview.candidateName || ''} ${interview.jobTitle || ''} ${interview.companyName || ''} ${interview.rounds.map((r) => `${r.status || ''} ${r.interviewType || ''} ${r.interviewRound || ''} ${r.interviewerName || ''}`).join(' ')}`}
            searchPlaceholder="Search anything here..."
            emptyMessage="No interviews scheduled yet"
            onEdit={(interview) => {
              const latest = (interview as GroupedInterview).rounds[(interview as GroupedInterview).rounds.length - 1] || (interview as GroupedInterview).rounds[0];
              if (latest) handleEdit(latest as RecruitmentItem);
            }}
            bulkActions={[
              {
                label: 'Selected',
                icon: CheckCircle2,
                variant: 'success',
                onAction: (items) => {
                  const cands = toCandidates(items as GroupedInterview[]);
                  if (cands.length === 0) { toast.error('No candidates found'); return; }
                  setReasonActionTargets(cands);
                  setReasonActionType('select');
                  setReasonActionReason('');
                },
              },
              {
                label: 'Rejected',
                icon: XCircle,
                variant: 'amber',
                onAction: (items) => {
                  const cands = toCandidates(items as GroupedInterview[]);
                  if (cands.length === 0) { toast.error('No candidates found'); return; }
                  setReasonActionTargets(cands);
                  setReasonActionType('reject');
                  setReasonActionReason('');
                },
              },
              {
                label: 'Delete',
                icon: Trash2,
                variant: 'danger',
                onAction: (items) => {
                  const cands = toCandidates(items as GroupedInterview[]);
                  if (cands.length === 0) { toast.error('No candidates found'); return; }
                  setBulkDeleteCandidates(cands);
                },
              },
            ]}
            columns={[
              { key: 'candidateName', header: 'Candidate', sortable: true, render: (interview: GroupedInterview) => (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                    {(interview.candidateName || 'I')[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-[#0F172A]">{interview.candidateName || `Candidate #${interview.candidateId}`}</div>
                    {interview.jobTitle && <div className="text-xs text-[#94A3B8]">{interview.jobTitle}</div>}
                  </div>
                </div>
              ), sortValue: (interview: GroupedInterview) => interview.candidateName || '' },
              { key: 'companyName', header: 'Company', sortable: true, sortValue: (interview: GroupedInterview) => interview.companyName || '', render: (interview: GroupedInterview) => <span className="text-[#64748B]">{interview.companyName || '-'}</span> },
              { key: 'interviewRound', header: 'Rounds', sortable: true, sortValue: (interview: GroupedInterview) => interview.rounds.length, render: (interview: GroupedInterview) => (
                <div className="flex flex-wrap gap-1">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const exists = interview.rounds.some((r) => Number(r.interviewRound || 1) === n);
                    return (
                      <span key={n} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${exists ? (roundBadgeCls[n] || 'bg-gray-100 text-gray-700') : 'bg-gray-50 text-[#CBD5E1]'}`}>
                        {roundNames[n]}
                      </span>
                    );
                  })}
                </div>
              ) },
              { key: 'interviewerName', header: 'Interviewer', render: (interview: GroupedInterview) => (
                <div className="space-y-0.5">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const rr = interview.rounds.find((r) => Number(r.interviewRound || 1) === n);
                    const val = rr?.interviewerName || (rr?.interviewerId ? `#${rr.interviewerId}` : '');
                    return (
                      <div key={n} className="flex items-center min-h-[22px]">
                        <span className={`text-[12px] whitespace-nowrap ${val ? 'text-[#64748B]' : 'text-[#CBD5E1]'}`}>{val || 'Not selected'}</span>
                      </div>
                    );
                  })}
                </div>
              ) },
              { key: 'scheduledAt', header: 'Scheduled At', render: (interview: GroupedInterview) => (
                <div className="space-y-0.5">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const rr = interview.rounds.find((r) => Number(r.interviewRound || 1) === n);
                    const dt = rr ? (rr.scheduledAt || rr.date) : '';
                    return (
                      <div key={n} className="flex items-center min-h-[22px]">
                        <span className={`text-[12px] whitespace-nowrap ${dt ? 'text-[#64748B]' : 'text-[#CBD5E1]'}`}>{dt ? fmtDate(dt) : 'Not selected'}</span>
                      </div>
                    );
                  })}
                </div>
              ) },
              { key: 'interviewType', header: 'Type', render: (interview: GroupedInterview) => (
                <div className="space-y-0.5">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const rr = interview.rounds.find((r) => Number(r.interviewRound || 1) === n);
                    const t = rr ? (rr.interviewType || '').toLowerCase() : '';
                    const type = typeMap[t];
                    return (
                      <div key={n} className="flex items-center min-h-[22px]">
                        {type ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap capitalize ${type.cls}`}>{type.label}</span>
                        ) : (
                          <span className="text-[12px] text-[#CBD5E1]">Not selected</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) },
              { key: 'status', header: 'Status', render: (interview: GroupedInterview) => (
                <div className="space-y-0.5">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const rr = interview.rounds.find((r) => Number(r.interviewRound || 1) === n);
                    const s = rr ? (rr.status || 'scheduled').toLowerCase() : '';
                    return (
                      <div key={n} className="flex items-center min-h-[22px]">
                        {rr ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${statusMap[s] || 'bg-gray-100 text-gray-700'}`}>{rr.status || 'Scheduled'}</span>
                        ) : (
                          <span className="text-[12px] text-[#CBD5E1]">Not selected</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) },
              { key: 'rating', header: 'Performance', sortable: true, sortValue: (interview: GroupedInterview) => interview.rating || 0, render: (interview: GroupedInterview) => (
                <div className="space-y-0.5">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const rr = interview.rounds.find((r) => Number(r.interviewRound || 1) === n);
                    const rating = rr ? Number(rr.rating || 0) : 0;
                    return (
                      <div key={n} className="flex items-center min-h-[22px]">
                        {rating > 0 ? (
                          <div className="flex items-center gap-0.5 whitespace-nowrap">
                            {[1, 2, 3, 4, 5].map((x) => (
                              <Star key={x} className={`w-3 h-3 ${x <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />
                            ))}
                            <span className="ml-1 text-xs font-medium text-[#0F172A]">{rating}/5</span>
                          </div>
                        ) : (
                          <span className="text-xs text-[#CBD5E1]">Not selected</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) },
            ]}
            actions={(interview: GroupedInterview) => (
              <div className="flex items-center justify-end gap-1.5">
                {interview.status === 'rejected' ? (
                  <button onClick={async () => { await api.patch(`/recruitment/candidates/${interview.candidateId}/status`, { status: 'shortlisted' }); queryClient.invalidateQueries({ queryKey: ['recruitment-interviews'] }); queryClient.invalidateQueries({ queryKey: ['recruitment-candidates'] }); }} className="px-2.5 py-1.5 bg-[#64748B] text-white text-xs font-medium rounded-lg hover:bg-[#475569] transition-colors flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> Restore</button>
                ) : (
                  <>
                    <button onClick={() => { const c = (candidates || []).find((x: RecruitmentCandidate) => x.id === interview.candidateId); if (c) { setReasonActionTargets([c]); setReasonActionType('select'); setReasonActionReason(''); } }} className="px-2.5 py-1.5 bg-[#10B981] text-white text-xs font-medium rounded-lg hover:bg-[#059669] transition-colors flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Selected</button>
                    <button onClick={() => { const c = (candidates || []).find((x: RecruitmentCandidate) => x.id === interview.candidateId); if (c) { setReasonActionTargets([c]); setReasonActionType('reject'); setReasonActionReason(''); } }} className="px-2.5 py-1.5 bg-[#F59E0B] text-white text-xs font-medium rounded-lg hover:bg-[#D97706] transition-colors flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Rejected</button>
                  </>
                )}
                <button onClick={() => { const latest = interview.rounds[interview.rounds.length - 1] || interview.rounds[0]; if (latest) handleEdit(latest as RecruitmentItem); }} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => { const c = (candidates || []).find((x: RecruitmentCandidate) => x.id === interview.candidateId); if (c) setBulkDeleteCandidates([c]); }} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          />
        )}
      </div>
    );
  };

  const renderOfferedTable = () => {
    const offeredCandidates = filteredOffered;
    return (
    <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
      {loadingCandidates ? (
        <div className="flex justify-center p-8">null</div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            data={offeredCandidates}
            logEntityType="candidate" logFor={(candidate: RecruitmentCandidate) => ({ id: candidate.id, label: candidateDisplayName(candidate) })}
            rowKey={(candidate: RecruitmentCandidate) => candidate.id}
            searchable
            searchKeys={(candidate: RecruitmentCandidate) => `${candidateDisplayName(candidate)} ${candidate.email} ${candidate.phone || ''} ${candidate.status || ''} ${candidate.companyName || ''} ${candidate.jobTitle || ''}`}
            searchPlaceholder="Search anything here..."
            emptyMessage="No offered / hired candidates found"
            onEdit={(candidate) => handleEdit(candidate as RecruitmentItem)}
            bulkActions={[
              {
                label: 'Onboard',
                icon: LogIn,
                variant: 'indigo',
                disabled: (selected) => selected.length !== 1,
                disabledTitle: 'Select exactly one candidate to onboard',
                onAction: (items) => {
                  if (items.length === 1) {
                    const c = items[0] as RecruitmentCandidate;
                    handleOnboardCandidate(c);
                  }
                },
              },
              {
                label: 'Not Joined',
                icon: XCircle,
                variant: 'amber',
                onAction: (items) => {
                  const cands = (items as RecruitmentCandidate[]).filter((c) => c.status !== 'not_joined' && c.status !== 'hired');
                  if (cands.length === 0) { toast.error('Selected candidates cannot be marked as not joined'); return; }
                  setReasonActionTargets(cands);
                  setReasonActionType('notjoined');
                  setReasonActionReason('');
                },
              },
              {
                label: 'Restore',
                icon: RotateCcw,
                variant: 'slate',
                onAction: (items) => {
                  const cands = (items as RecruitmentCandidate[]).filter((c) => c.status === 'not_joined');
                  if (cands.length === 0) { toast.error('Only "Not Joined" candidates can be restored'); return; }
                  setReasonActionTargets(cands);
                  setReasonActionType('restoreoffered');
                  setReasonActionReason('');
                },
              },
              {
                label: 'Delete',
                icon: Trash2,
                variant: 'danger',
                onAction: (items) => {
                  setBulkDeleteCandidates(items as RecruitmentCandidate[]);
                },
              },
            ]}
            columns={[
              {
                key: 'fullName', header: 'Name', sortable: true,
                render: (candidate: RecruitmentCandidate) => (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                      {personInitials(candidate, 'C')}
                    </div>
                    <div>
                      <div className="font-medium text-[#0F172A]">{candidateDisplayName(candidate)}</div>
                      {candidate.jobTitle && <div className="text-xs text-[#94A3B8]">{candidate.jobTitle}</div>}
                    </div>
                  </div>
                ),
                sortValue: (candidate: RecruitmentCandidate) => candidateDisplayName(candidate),
              },
              { key: 'email', header: 'Email', render: (candidate: RecruitmentCandidate) => <span className="text-[#64748B]">{candidate.email}</span> },
              { key: 'phone', header: 'Phone', render: (candidate: RecruitmentCandidate) => <span className="text-[#64748B]">{candidate.phone || '-'}</span> },
              {
                key: 'status', header: 'Status',
                render: (candidate: RecruitmentCandidate) => statusBadge(candidate.status),
              },
              {
                key: 'reason', header: 'Reason', sortable: true,
                sortValue: (candidate: RecruitmentCandidate) => candidate.selectionReason || candidate.rejectionReason || '',
                render: (candidate: RecruitmentCandidate) => {
                  const reason = candidate.selectionReason || candidate.rejectionReason || '';
                  if (!reason) return <span className="text-[#94A3B8]">-</span>;
                  return <span className="text-[#64748B] max-w-[220px] line-clamp-2 block">{reason}</span>;
                },
              },
              {
                key: 'hiredDate', header: 'Hired Date', sortable: true,
                sortValue: (candidate: RecruitmentCandidate) => candidate.hiredDate || '',
                render: (candidate: RecruitmentCandidate) => {
                  const dt = candidate.hiredDate;
                  if (!dt) return <span className="text-[#94A3B8]">-</span>;
                  const d = new Date(dt);
                  const formatted = isNaN(d.getTime()) ? dt : formatAppDate(d);
                  return <span className="text-[#64748B] whitespace-nowrap">{formatted}</span>;
                },
              },
            ]}
            actions={(candidate: RecruitmentCandidate) => {
              const empId = candidate.employeeId;
              const stillOnboarding = empId ? onboardingEmployeeIds.has(Number(empId)) : false;
              const isOnboarded = !!candidate.onboarded && !stillOnboarding;
              return (
              <div className="flex items-center justify-end gap-1.5">
                {candidate.onboarded && (isOnboarded ? (
                  <span className="inline-flex items-center px-2 py-1 bg-emerald-600 text-white rounded-full text-xs font-bold whitespace-nowrap">Onboarded</span>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 bg-amber-500 text-white rounded-full text-xs font-bold whitespace-nowrap">Pending</span>
                ))}
                {candidate.status === 'not_joined' && (
                  <button
                    onClick={() => { setReasonActionTargets([candidate]); setReasonActionType('restoreoffered'); setReasonActionReason(''); }}
                    title="Restore to offered"
                    className="px-2.5 py-1.5 bg-[#64748B] text-white text-xs font-medium rounded-lg hover:bg-[#475569] transition-colors flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Restore
                  </button>
                )}
                {!candidate.onboarded && candidate.status !== 'not_joined' && (
                  <button onClick={() => handleOnboardCandidate(candidate)} title="Move to onboarding"
                    className="px-2.5 py-1.5 bg-indigo-500 text-white text-xs font-medium rounded-lg hover:bg-indigo-600 transition-colors flex items-center gap-1.5">
                    <LogIn className="w-3.5 h-3.5" /> Onboard
                  </button>
                )}
                {candidate.status !== 'not_joined' && candidate.status !== 'hired' && (
                  <button
                    onClick={() => { setReasonActionTargets([candidate]); setReasonActionType('notjoined'); setReasonActionReason(''); }}
                    title="Mark as not joined"
                    className="px-2.5 py-1.5 bg-[#F59E0B] text-white text-xs font-medium rounded-lg hover:bg-[#D97706] transition-colors flex items-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Not Joined
                  </button>
                )}
                <button onClick={() => setDeleteTarget({ id: candidate.id, name: candidateDisplayName(candidate) })} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
              );
            }}
          />
        </div>
      )}
    </div>
    );
  };

const renderJobForm = () => {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
          <input type="text" required value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          <p className="mt-1 text-xs text-gray-400">Enter the role title as text, e.g. Senior React Developer.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Job Code</label>
          <div className="relative">
            <input
              type="text"
              value={formData.jobCode ? String(formData.jobCode) : ''}
              onChange={(e) => setFormData({...formData, jobCode: e.target.value})}
              placeholder="Enter or generate code"
              className="w-full px-4 py-2 pr-24 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              type="button"
              onClick={generateJobCode}
              title="Auto-generate a unique 7-character code"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1.5 bg-[#1C64F2] text-white text-[11px] font-semibold rounded-lg hover:bg-[#1E40AF] transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> Generate
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400">Unique job code, if assigned</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
          <SearchableSelect
            value={formData.companyId ? String(formData.companyId) : ''}
            onChange={(val) => setFormData({...formData, companyId: val === '' ? '' : String(val)})}
            options={(companies || []).map((c: Company) => ({ id: c.id, name: c.name }))}
            placeholder="Select Company"
            showAllOption={false}
            clearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-gray-400">Select the company hiring for this role from the list.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
          <SearchableSelect
            value={formData.departmentId ? String(formData.departmentId) : ''}
            onChange={(val) => setFormData({...formData, departmentId: val === '' ? '' : String(val)})}
            options={(departments || []).filter((d: Department) => !formData.companyId || (d.companyId as number).toString() === formData.companyId.toString()).map((d: Department) => ({ id: d.id, name: d.name }))}
            placeholder="Select Department"
            showAllOption={false}
            clearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-gray-400">Select the team this role belongs to.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type *</label>
          <SearchableSelect
            value={formData.employmentType ? String(formData.employmentType) : ''}
            onChange={(val) => setFormData({...formData, employmentType: val === '' ? '' : String(val)})}
            options={(employmentTypeOptions as Array<{ code: string; name: string }>).map((opt) => ({ id: opt.code, name: opt.name }))}
            placeholder="Select Type"
            showAllOption={false}
            clearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-gray-400">Select the employment contract type, e.g. Full Time, Part Time, Contract.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vacancy Count *</label>
          <input type="number" min="1" required value={formData.vacancyCount} onChange={(e) => setFormData({...formData, vacancyCount: parseInt(e.target.value)})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          <p className="mt-1 text-xs text-gray-400">Enter a whole number for the number of openings, e.g. 3.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <SearchableSelect
            value={formData.location ? String(formData.location) : ''}
            onChange={(val) => setFormData({...formData, location: val === '' ? '' : String(val)})}
            options={(jobLocationOptions as Array<{ code: string; name: string }>).map((opt) => ({ id: opt.code, name: opt.name }))}
            placeholder="Select Location"
            showAllOption={false}
            clearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-gray-400">Select the work location type — Onsite, Remote, Hybrid, or Field.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Job Status</label>
          <SearchableSelect
            value={formData.status ? String(formData.status) : ''}
            onChange={(val) => setFormData({...formData, status: val === '' ? '' : String(val)})}
            options={(jobStatusOptions as Array<{ code: string; name: string }>).map((opt) => ({ id: opt.code, name: opt.name }))}
            placeholder="Select Job Status"
            showAllOption={false}
            clearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-gray-400">Select the job status — Open means accepting applications, Closed means hiring is paused.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Job Post Date</label>
          <DatePicker
            value={formData.postDate ? String(formData.postDate) : ''}
            onChange={(val) => setFormData({...formData, postDate: val})}
            placeholder="Select Date"
          />
          <p className="mt-1 text-xs text-gray-400">Select the date the job was / will be posted.</p>
        </div>
        <div className="lg:col-span-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea rows={4} value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"></textarea>
          <p className="mt-1 text-xs text-gray-400">Enter the role responsibilities and requirements as a paragraph of text.</p>
        </div>
      </div>
    );
  };

  const handleParseResume = async () => {
    if (!resumeFile) return;
    setParsingResume(true);
    try {
      // 1. Upload the resume file so it's persisted on the candidate record
      let resumeUrl = formData.resumeUrl || '';
      const uploadForm = new FormData();
      uploadForm.append('file', resumeFile);
      const upRes = await api.post('/recruitment/resume-upload', uploadForm, { headers: { 'Content-Type': 'multipart/form-data' } });
      resumeUrl = upRes.data?.resumeUrl || upRes.data?.url || resumeUrl;

      // 2. Parse the resume and auto-fill candidate fields
      const form = new FormData();
      form.append('file', resumeFile);
      const res = await api.post('/recruitment/parse-resume', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const d = res.data;

      // Count which fields were successfully extracted, so we can tell the user
      // what was auto-filled vs what still needs manual entry.
      const extracted: string[] = [];
      if (d.firstName) extracted.push('name');
      if (d.email) extracted.push('email');
      if (d.phone) extracted.push('phone');
      if (d.currentCompany) extracted.push('company');
      if (d.currentTitle) extracted.push('position');
      if (d.experienceYears) extracted.push('experience');
      if (d.skillsText) extracted.push('skills');
      if (d.educationText) extracted.push('education');

      const next = {
        ...formData,
        firstName: d.firstName || formData.firstName,
        lastName: d.lastName || formData.lastName,
        email: d.email || formData.email,
        phone: d.phone || formData.phone,
        skills: d.skillsText || formData.skills,
        education: d.educationText || formData.education,
        experienceYears: d.experienceYears ?? formData.experienceYears,
        currentCompany: d.currentCompany || formData.currentCompany,
        currentPosition: d.currentTitle || formData.currentPosition,
        linkedinUrl: d.linkedinUrl || formData.linkedinUrl,
        address: d.address || formData.address,
        resumeUrl,
        notes: d.summary || formData.notes,
      };
      setFormData(next);
      setFormTab('basic');

      if (extracted.length === 0) {
        // Nothing could be extracted — the resume is still attached, so the
        // user can fill the form manually and the file stays on the record.
        toast.error(`We couldn't auto-fill from "${resumeFile.name}". Please fill the fields manually — your resume is still attached.`, { duration: 5000 });
      } else if (extracted.length < 8) {
        const missing: string[] = [];
        if (!d.firstName) missing.push('name');
        if (!d.email) missing.push('email');
        if (!d.phone) missing.push('phone');
        if (!d.currentCompany) missing.push('company');
        if (!d.currentTitle) missing.push('position');
        if (!d.experienceYears) missing.push('experience');
        if (!d.skillsText) missing.push('skills');
        if (!d.educationText) missing.push('education');
        toast.success(`Auto-filled: ${extracted.join(', ')}. Please add manually: ${missing.join(', ')}.`, { duration: 5000 });
      } else {
        toast.success(`Resume parsed — all details auto-filled${d.llmEnriched ? ' (AI enhanced)' : ''}`);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(e.response?.data?.detail || e.message || 'Failed to parse resume');
    } finally {
      setParsingResume(false);
    }
  };

  const renderCandidateForm = () => {
    return (
      <div className="space-y-4">
        {/* AI Resume Parser */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <p className="text-sm font-semibold text-blue-900">AI Resume Parser</p>
          </div>
          <p className="text-xs text-blue-700 mb-3">Upload a resume (PDF, DOCX, or TXT) and we'll auto-fill the candidate details.</p>
          <div className="flex items-center gap-3">
            <label className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-white border border-dashed border-blue-300 rounded-lg text-sm text-blue-700 hover:border-blue-500 cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              <span className="truncate">{resumeFile ? resumeFile.name : 'Choose resume file...'}</span>
              <input type="file" accept=".pdf,.docx,.doc,.txt" className="hidden" onChange={(e) => setResumeFile(e.target.files?.[0] || null)} />
            </label>
            <button
              type="button"
              onClick={handleParseResume}
              disabled={!resumeFile || parsingResume}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {parsingResume ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {parsingResume ? 'Parsing...' : 'Parse & Auto-fill'}
            </button>
          </div>
          {formData.resumeUrl ? (
            <div className="mt-3 flex items-center justify-between bg-white border border-emerald-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-emerald-700 min-w-0">
                <FileText className="w-4 h-4 shrink-0" />
                <span className="truncate">Resume attached — {resumeFile?.name || 'file'}</span>
              </div>
              <a href={String(formData.resumeUrl || '')} target="_blank" rel="noopener noreferrer"
                className="shrink-0 text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <Eye className="w-3 h-3" /> View
              </a>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={joinEmployeeName(String(formData.firstName || ''), String(formData.lastName || ''))}
              onChange={(e) => {
                const { firstName, lastName } = splitEmployeeName(e.target.value);
                setFormData({ ...formData, firstName, lastName });
              }}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">Candidate's full name</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            <p className="mt-1 text-xs text-gray-400">Candidate's email address</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <PhoneInput value={String(formData.phone || '')} onChange={(v) => setFormData({...formData, phone: v})} defaultDial={dialCode} placeholder="98765 43210" inputClassName="w-full px-4 py-2 border border-gray-200 rounded-r-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            <p className="mt-1 text-xs text-gray-400">Contact number with country code</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
            <SearchableSelect
              value={formData.companyId ? String(formData.companyId) : ''}
              onChange={(val) => setFormData({...formData, companyId: val === '' ? undefined : Number(val), departmentId: undefined, jobId: undefined, jobOpeningId: undefined})}
              options={(companies || []).map((c: Company) => ({ id: c.id, name: c.name }))}
              placeholder="Select Company"
              showAllOption={false}
              clearable
              className="w-full"
            />
            <p className="mt-1 text-xs text-gray-400">Select the company the candidate applied/invited for the interview</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <SearchableSelect
              value={formData.departmentId ? String(formData.departmentId) : ''}
              onChange={(val) => setFormData({...formData, departmentId: val === '' ? undefined : Number(val), jobId: undefined, jobOpeningId: undefined})}
              options={(departments || []).filter((d: Department) => !formData.companyId || (d.companyId as number).toString() === String(formData.companyId)).map((d: Department) => ({ id: d.id, name: d.name }))}
              placeholder="Select Department"
              showAllOption={false}
              clearable
              className="w-full"
            />
            <p className="mt-1 text-xs text-gray-400">Select the department the candidate applied/invited for the interview</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Applied Job *</label>
            <SearchableSelect
              value={formData.jobId || formData.jobOpeningId || ''}
              onChange={(val) => setFormData({...formData, jobId: String(val), jobOpeningId: String(val)})}
              options={(jobs || [])
                .filter((j: RecruitmentJob) => (!formData.companyId || String(j.companyId) === String(formData.companyId)) && (!formData.departmentId || String(j.departmentId) === String(formData.departmentId)))
                .map((j: RecruitmentJob) => ({ id: j.id, name: j.companyName ? `${j.title} — ${j.companyName}` : j.title }))}
              placeholder="Select Job"
              showAllOption={false}
              clearable
              className="w-full"
            />
            <p className="mt-1 text-xs text-gray-400">The job opening this candidate is applying for</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Candidate Status</label>
            <SearchableSelect
              value={formData.status ? String(formData.status) : ''}
              onChange={(val) => setFormData({...formData, status: val === '' ? '' : String(val)})}
              options={(applicationStatusOptions as Array<{ code: string; name: string }>).map((opt) => ({ id: opt.code, name: opt.name }))}
              placeholder="Select Candidate Status"
              showAllOption={false}
              clearable
              className="w-full"
            />
            <p className="mt-1 text-xs text-gray-400">Current stage in the hiring pipeline — Applied or Invited</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <SearchableSelect
              value={formData.source ? String(formData.source) : ''}
              onChange={(val) => setFormData({...formData, source: val === '' ? '' : String(val)})}
              options={[
                { id: 'job_portal', name: 'Job Portal' },
                { id: 'referral', name: 'Referral' },
                { id: 'walk_in', name: 'Walk-in' },
                { id: 'website', name: 'Company Website' },
                { id: 'campus', name: 'Campus Placement' },
                { id: 'direct', name: 'Direct' },
                { id: 'other', name: 'Other' },
              ]}
              placeholder="Select Source"
              showAllOption={false}
              clearable
              className="w-full"
            />
            <p className="mt-1 text-xs text-gray-400">Where the candidate came from, e.g. Job Portal, Referral, Direct</p>
          </div>
          <div className="lg:col-span-3">
            <div className="flex items-center gap-3">
              <ToggleSwitch
                checked={isFresher}
                onChange={(next) => {
                  setIsFresher(next);
                  if (next) {
                    setFormData({ ...formData, currentCompany: '', currentPosition: '', experienceYears: undefined, currentSalary: undefined, noticePeriod: '' });
                  }
                }}
                helpText={isFresher ? 'Experienced' : 'Fresher'}
              />
              <span className="text-sm font-medium text-gray-700">{isFresher ? 'Fresher' : 'Experienced'}</span>
            </div>
            <p className="mt-1 text-xs text-gray-400">Turn this on if the candidate is a fresher with no prior work experience.</p>
          </div>
          {!isFresher && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Company</label>
                <input type="text" value={formData.currentCompany || ''} onChange={(e) => setFormData({...formData, currentCompany: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                <p className="mt-1 text-xs text-gray-400">Where the candidate currently works</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Position</label>
                <input type="text" value={formData.currentPosition || ''} onChange={(e) => setFormData({...formData, currentPosition: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                <p className="mt-1 text-xs text-gray-400">Their current job title, e.g. Senior Engineer</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Experience (years)</label>
                <input type="number" min="0" step="0.5" value={formData.experienceYears ?? ''} onChange={(e) => setFormData({...formData, experienceYears: e.target.value === '' ? undefined : +e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                <p className="mt-1 text-xs text-gray-400">Total years of work experience</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Salary</label>
                <input type="number" min="0" value={formData.currentSalary ?? ''} onChange={(e) => setFormData({...formData, currentSalary: e.target.value === '' ? undefined : +e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                <p className="mt-1 text-xs text-gray-400">Annual gross salary in INR, if known</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notice Period</label>
                <input type="text" value={formData.noticePeriod || ''} onChange={(e) => setFormData({...formData, noticePeriod: e.target.value})} placeholder="e.g. 30 days, immediate" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                <p className="mt-1 text-xs text-gray-400">Time needed before joining, e.g. 30 days</p>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expected Salary</label>
            <input type="number" min="0" value={formData.expectedSalary ?? ''} onChange={(e) => setFormData({...formData, expectedSalary: e.target.value === '' ? undefined : +e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            <p className="mt-1 text-xs text-gray-400">Salary expectation in INR, if disclosed</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn URL</label>
            <input type="url" value={formData.linkedinUrl || ''} onChange={(e) => setFormData({...formData, linkedinUrl: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            <p className="mt-1 text-xs text-gray-400">Full LinkedIn profile link, e.g. linkedin.com/in/name</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Portfolio URL</label>
            <input type="url" value={formData.portfolioUrl || ''} onChange={(e) => setFormData({...formData, portfolioUrl: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            <p className="mt-1 text-xs text-gray-400">GitHub, Behance, or personal site link</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input type="text" value={formData.address || ''} onChange={(e) => setFormData({...formData, address: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            <p className="mt-1 text-xs text-gray-400">Street / area address</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <StateSelect value={String(formData.state || '')} onChange={(v) => setFormData({ ...formData, state: v })} />
            <p className="mt-1 text-xs text-gray-400">State of residence</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
            <PincodeInput value={String(formData.pincode || '')} onChange={(v) => setFormData({ ...formData, pincode: v })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            <p className="mt-1 text-xs text-gray-400">6-digit postal pincode</p>
          </div>
          <div className="lg:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Skills</label>
            <textarea rows={2} value={formData.skills || ''} onChange={(e) => setFormData({...formData, skills: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"></textarea>
            <p className="mt-1 text-xs text-gray-400">Comma-separated skills, e.g. Python, React, AWS</p>
          </div>
          <div className="lg:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea rows={4} value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"></textarea>
            <p className="mt-1 text-xs text-gray-400">Internal notes about the candidate</p>
          </div>
        </div>
      </div>
    );
  };

  const renderInterviewForm = () => {
    // Only shortlisted candidates can be scheduled for an interview round,
    // scoped by the selected company. Always include the currently-selected
    // candidate (e.g. when editing) so their name shows in the field.
    const selectedCandId = formData.candidateId ? Number(formData.candidateId) : null;
    const companyCandidates = (candidates || []).filter((c: RecruitmentCandidate) =>
      (c.status === 'shortlisted' || (selectedCandId !== null && c.id === selectedCandId)) &&
      (!interviewCompanyId || c.companyId === Number(interviewCompanyId))
    );
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <div className="flex border-b border-[var(--border-color)] mb-1">
            {[1, 2, 3, 4, 5].map((num) => {
              const labels: Record<number, string> = { 1: 'Recruiter', 2: 'HR Manager', 3: 'Technical', 4: 'Behavioral', 5: 'Final' };
              const isActive = interviewRoundTab === num;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => selectRoundTab(num)}
                  className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${isActive ? 'text-[#1C64F2] border-[#1C64F2]' : 'text-[#64748B] hover:text-[#0F172A] border-transparent'}`}
                >
                  {labels[num]} Round
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-1">Select a round tab to schedule or edit that round's interview. All rounds for the candidate are managed from here.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
          <SearchableSelect
            value={interviewCompanyId ? String(interviewCompanyId) : ''}
            onChange={(val) => {
              const companyId = val === '' ? '' : Number(val);
              setInterviewCompanyId(companyId);
              setFormData({ ...formData, candidateId: '', companyId: companyId || undefined });
            }}
            options={(companies || []).map((c: Company) => ({ id: c.id, name: c.name }))}
            placeholder="Select Company"
            showAllOption={false}
            clearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-gray-400">Select the company to filter candidates for the interview.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Candidate *</label>
          <SearchableSelect
            value={formData.candidateId ? String(formData.candidateId) : ''}
            onChange={(val) => {
              const nextFormData: RecruitmentFormData = { ...formData, candidateId: val === '' ? '' : String(val) };
              if (val !== '' && !editingItem) {
                const candId = Number(val);
                // Auto-fill the Applied Job from the candidate's applied job.
                const cand = (candidates || []).find((c: RecruitmentCandidate) => c.id === candId);
                if (cand?.jobId) {
                  nextFormData.jobId = String(cand.jobId);
                  nextFormData.jobOpeningId = String(cand.jobId);
                }
                const existing = (interviews || []).filter((i: RecruitmentInterview) => i.candidateId === candId);
                const next = existing.length > 0 ? Math.min(Math.max(...existing.map((i) => Number(i.interviewRound || 1))) + 1, 5) : 1;
                nextFormData.round = next;
                nextFormData.interviewRound = next;
                setInterviewRoundTab(next);
                setEditingItem(null);
              }
              setFormData(nextFormData);
            }}
            options={companyCandidates.map((c: RecruitmentCandidate) => ({ id: c.id, name: c.jobTitle ? `${candidateDisplayName(c)} — ${c.jobTitle}` : candidateDisplayName(c) }))}
            placeholder="Select Candidate"
            showAllOption={false}
            clearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-gray-400">Shortlisted candidates for the selected company.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Applied Job *</label>
          <SearchableSelect
            value={formData.jobId || formData.jobOpeningId || ''}
            onChange={(val) => setFormData({...formData, jobId: String(val), jobOpeningId: String(val)})}
            options={(jobs || []).map((j: RecruitmentJob) => ({ id: j.id, name: j.companyName ? `${j.title} — ${j.companyName}` : j.title }))}
            placeholder="Select Job"
            showAllOption={false}
            clearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-gray-400">Job the candidate applied for</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Interviewer *</label>
          <SearchableSelect
            value={formData.interviewerId ? String(formData.interviewerId) : ''}
            onChange={(val) => setFormData({...formData, interviewerId: val === '' ? '' : String(val)})}
            options={(employees || []).map((em: EmployeeOption) => ({ id: em.userId || em.id, name: `${formatEmployeeLabel(em)}${em.designation ? ` — ${em.designation}` : ''}`.trim() }))}
            placeholder="Select Interviewer"
            showAllOption={false}
            clearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-gray-400">Employee conducting the interview</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <SearchableSelect
            value={formData.type ? String(formData.type) : String(formData.interviewType || '')}
            onChange={(val) => setFormData({...formData, type: val === '' ? '' : String(val)})}
            options={(interviewTypeOptions as Array<{ code: string; name: string }>).map((opt) => ({ id: opt.code, name: opt.name }))}
            placeholder="Select Type"
            showAllOption={false}
            clearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-gray-400">Technical, HR, or behavioral round</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Interview Date *</label>
          <DatePicker
            value={(formData.scheduledAt as string | undefined)?.split('T')[0] || ''}
            onChange={(val) => setFormData({...formData, scheduledAt: val + 'T' + ((formData.scheduledAt as string | undefined)?.split('T')[1] || '')})}
            placeholder="Select Date"
          />
          <p className="mt-1 text-xs text-gray-400">Select the date of the interview.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Interview Time *</label>
          <TimePicker
            value={(formData.scheduledAt as string | undefined)?.split('T')[1] || ''}
            onChange={(val) => setFormData({...formData, scheduledAt: ((formData.scheduledAt as string | undefined)?.split('T')[0] || '') + 'T' + val})}
          />
          <p className="mt-1 text-xs text-gray-400">Select the time of the interview.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <SearchableSelect
            value={formData.status ? String(formData.status) : ''}
            onChange={(val) => setFormData({...formData, status: val === '' ? '' : String(val)})}
            options={(interviewStatusOptionsFiltered as Array<{ code: string; name: string }>).map((opt) => ({ id: opt.code, name: opt.name }))}
            placeholder="Select Status"
            showAllOption={false}
            clearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-gray-400">Scheduled, completed, or cancelled</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
          <SearchableSelect
            value={formData.rating !== undefined && formData.rating !== '' ? String(formData.rating) : ''}
            onChange={(val) => setFormData({...formData, rating: val === '' ? undefined : parseFloat(String(val))})}
            options={[
              { id: 1, name: '1 — Poor' },
              { id: 2, name: '2 — Below Average' },
              { id: 3, name: '3 — Average' },
              { id: 4, name: '4 — Good' },
              { id: 5, name: '5 — Excellent' },
            ]}
            placeholder="Select Rating"
            showAllOption={false}
            clearable
            className="w-full"
          />
          <p className="mt-1 text-xs text-gray-400">Rate the candidate from Poor (1) to Excellent (5).</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Communication Score (1-10)</label>
          <input
            type="number" min={1} max={10}
            value={formData.communicationScore !== undefined && formData.communicationScore !== '' ? String(formData.communicationScore) : ''}
            onChange={(e) => setFormData({...formData, communicationScore: e.target.value === '' ? undefined : Number(e.target.value)})}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            placeholder="0-10"
          />
          <p className="mt-1 text-xs text-gray-400">Communication skills score for this round.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Technical Score (1-10)</label>
          <input
            type="number" min={1} max={10}
            value={formData.technicalScore !== undefined && formData.technicalScore !== '' ? String(formData.technicalScore) : ''}
            onChange={(e) => setFormData({...formData, technicalScore: e.target.value === '' ? undefined : Number(e.target.value)})}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            placeholder="0-10"
          />
          <p className="mt-1 text-xs text-gray-400">Technical ability score for this round.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Overall Score (1-10)</label>
          <input
            type="number" min={1} max={10}
            value={formData.overallScore !== undefined && formData.overallScore !== '' ? String(formData.overallScore) : ''}
            onChange={(e) => setFormData({...formData, overallScore: e.target.value === '' ? undefined : Number(e.target.value)})}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            placeholder="0-10"
          />
          <p className="mt-1 text-xs text-gray-400">Overall score for this round.</p>
        </div>
        <div className="lg:col-span-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Feedback</label>
          <textarea rows={4} value={formData.feedback} onChange={(e) => setFormData({...formData, feedback: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"></textarea>
          <p className="mt-1 text-xs text-gray-400">Interviewer notes on candidate performance</p>
        </div>
      </div>
    );
  };


  return (
    <div className="min-h-screen bg-[var(--background)] animate-page-enter">
      <div className="w-full mx-auto space-y-6">
        {/* Header Section */}
        <PageHero
          title="Recruitment"
          subtitle="Manage jobs, candidates, and interviews"
          icon={Briefcase}
          accent="violet"
          breadcrumbs={['HRMS.Pro!', 'Recruitment']}
          actions={
            <>
              {activeTab === 'onboarding' && (
                <>
                  <ExportButton
                    rows={(onboardingEmployees || []) as unknown[]}
                    filename="onboarding_export"
                    label="Export"
                  />
                </>
              )}
              {activeTab !== 'onboarding' && (
              <ExportButton
                rows={(activeTab === 'jobs' ? filteredJobs : activeTab === 'candidates' ? candidatesTabList : activeTab === 'interviews' ? interviewsTabList : activeTab === 'offered' ? filteredOffered : []) as unknown[]}
                filename="recruitment_export"
                label="Export"
              />
              )}
              {activeTab !== 'onboarding' && activeTab !== 'offered' && (
              <button
                onClick={() => setShowBulkUpload(true)} title="Upload .csv file"
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload
              </button>
              )}
              {activeTab === 'interviews' && (
                <button
                  onClick={() => { setEditingItem(null); setIsClosing(false); setInterviewCompanyId(''); setFormData({ candidateId: '', jobId: '', interviewerId: '', round: 1, interviewRound: 1, type: '', scheduledAt: '', status: '', feedback: '', rating: undefined }); setInterviewRoundTab(1); setShowModal('interview'); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02] whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Schedule Interview
                </button>
              )}
              {activeTab !== 'onboarding' && activeTab !== 'interviews' && activeTab !== 'offered' && (
              <button
                onClick={() => {
                  setEditingItem(null);
                  setIsClosing(false);
                  if (activeTab === 'jobs') {
                    setFormData({ title: '', jobCode: '', description: '', employmentType: '', location: '', vacancyCount: 1, departmentId: '', companyId: '', status: '', postDate: '' });
                    setShowModal('job');
                  } else {
                    setFormData({ jobId: '', firstName: '', lastName: '', email: '', phone: '', source: '', status: '', resumeUrl: '', notes: '' });
                    setIsFresher(false);
                    setShowModal('candidate');
                  }
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02] whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                {activeTab === 'jobs' ? 'Post Job' : 'Add Candidate'}
              </button>
              )}
            </>
          }
        />

        {/* Stats Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
          {statCards.map((stat, index) => (
            <div key={stat.label} className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 100}ms` }}>
              <StatsCard icon={stat.icon} label={stat.label} value={stat.value} trend={stat.trend} tooltip={stat.tooltip} iconBg={stat.iconBg} iconColor={stat.iconColor} onClick={stat.onClick} />
            </div>
          ))}
        </div>

        {/* Tabs Section */}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'jobs' | 'candidates' | 'interviews' | 'offered' | 'onboarding')}
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

        {/* Main Content Area */}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
{/* Filters Section */}
{activeTab !== 'onboarding' && (
        <div className="p-4 border-b border-[var(--border-color)] bg-white">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <SearchableSelect
                value={companyFilter}
                onChange={(val) => setCompanyFilter(val.toString())}
                options={companies?.map((c: Company) => ({ id: c.id, name: c.name })) || []}
                placeholder="All Companies"
                allOption="All Companies"
                className="w-48"
              />
              {activeTab === 'jobs' && (
                <SearchableSelect
                  value={statusFilter}
                  onChange={(val) => setStatusFilter(val.toString())}
                  options={[
                    { id: 'open', name: 'Open' },
                    { id: 'closed', name: 'Closed' },
                  ]}
                  placeholder="All Job Status"
                  allOption="All Job Status"
                  className="w-44"
                />
              )}
              {activeTab === 'candidates' && (
                <>
                  <SearchableSelect
                    value={candidateDepartmentFilter}
                    onChange={(val) => setCandidateDepartmentFilter(val.toString())}
                    options={(departments || []).map((d: Department) => ({ id: d.id, name: d.name })) || []}
                    placeholder="All Departments"
                    allOption="All Departments"
                    className="w-44"
                  />
                  <SearchableSelect
                    value={statusFilter}
                    onChange={(val) => setStatusFilter(val.toString())}
                    options={[
                      { id: 'applied', name: 'Applied' },
                      { id: 'invited', name: 'Invited' },
                      { id: 'shortlisted', name: 'Shortlisted' },
                      { id: 'not_arrived', name: 'Not Arrived' },
                      { id: 'rejected', name: 'Rejected' },
                    ]}
                    placeholder="All Candidate Status"
                    allOption="All Candidate Status"
                    className="w-44"
                  />
                </>
              )}
              {activeTab === 'interviews' && (
                <>
                  <SearchableSelect
                    value={interviewRoundFilter}
                    onChange={(val) => setInterviewRoundFilter(val.toString())}
                    options={(interviewRoundOptions as Array<{ code: string; name: string }>).map((opt) => ({ id: opt.code, name: opt.name }))}
                    placeholder="All Rounds"
                    allOption="All Rounds"
                    className="w-44"
                  />
                  <SearchableSelect
                    value={interviewTypeFilter}
                    onChange={(val) => setInterviewTypeFilter(val.toString())}
                    options={(interviewTypeOptions as Array<{ code: string; name: string }>).map((opt) => ({ id: opt.code, name: opt.name }))}
                    placeholder="All Types"
                    allOption="All Types"
                    className="w-44"
                  />
                  <SearchableSelect
                    value={interviewStatusFilter}
                    onChange={(val) => setInterviewStatusFilter(val.toString())}
                    options={(interviewStatusOptionsFiltered as Array<{ code: string; name: string }>).map((opt) => ({ id: opt.code, name: opt.name }))}
                    placeholder="All Status"
                    allOption="All Status"
                    className="w-44"
                  />
                </>
              )}
              {activeTab === 'offered' && (
                <SearchableSelect
                  value={offeredStatusFilter}
                  onChange={(val) => setOfferedStatusFilter(val.toString())}
                  options={[
                    { id: 'offered', name: 'Offered' },
                    { id: 'hired', name: 'Hired' },
                    { id: 'not_joined', name: 'Not Joined' },
                  ]}
                  placeholder="All Status"
                  allOption="All Status"
                  className="w-40"
                />
              )}
              <DateRangePicker 
                startDate={startDate} 
                endDate={endDate} 
                onDateChange={(start, end) => { setStartDate(start); setEndDate(end); }} 
              />
              {Boolean(searchTerm || statusFilter !== 'all' || offeredStatusFilter !== 'all' || candidateDepartmentFilter !== 'all' || companyFilter !== 'all' || interviewRoundFilter !== 'all' || interviewTypeFilter !== 'all' || interviewStatusFilter !== 'all' || startDate || endDate) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setOfferedStatusFilter('all');
                  setCandidateDepartmentFilter('all');
                  setCompanyFilter('all');
                  setInterviewRoundFilter('all');
                  setInterviewTypeFilter('all');
                  setInterviewStatusFilter('all');
                  setStartDate('');
                  setEndDate('');
                }}
                className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors"
                title="Clear Filters"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              )}
            </div>
          </div>
        </div>
        )}

        
          {activeTab === 'jobs' && renderJobsTable()}
          {activeTab === 'candidates' && renderCandidatesTable()}
          {activeTab === 'interviews' && renderInterviewsTable()}
          {activeTab === 'offered' && renderOfferedTable()}
          {activeTab === 'onboarding' && (
            <OnboardingSection
              ref={onboardingRef}
              companiesList={companies || []}
              genderOptions={genderOptions}
              bloodGroupOptions={bloodGroupOptions}
              maritalStatusOptions={maritalStatusOptions}
              educationLevelOptions={educationLevelOptions}
              employmentTypeOptions={employmentTypeOptions}
              statusOptions={statusOptions}
              deviceTypeOptions={deviceTypeOptions}
              activityTypeOptions={activityTypeOptions}
            />
          )}
        </div>
      </div>

      {/* Bulk Upload Modal */}
      <Modal
        isOpen={showBulkUpload}
        onClose={() => { setShowBulkUpload(false); setUploadFile(null); }}
        title={`Bulk Upload ${activeTab === 'jobs' ? 'Jobs' : activeTab === 'candidates' ? 'Candidates' : 'Interviews'}`}
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
              <strong>Required columns:</strong> {activeTab === 'jobs' ? 'title, description, location, organization_id, company_id, status' : activeTab === 'candidates' ? 'full_name, email, phone, job_opening_id, company_id, status, source' : 'candidate_id, interviewer_id, company_id, date, status, feedback, rating'}
            </p>
          </div>
          <button
            onClick={downloadTemplate}
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
                <Loader2 className="w-5 h-5 animate-spin" />
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

      {/* Quick Edit Interview Popover (single or bulk) */}
      {(quickEditInterview || quickEditBulk) && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => { setQuickEditInterview(null); setQuickEditGroup(null); setQuickEditBulk(null); setQuickEditDraft({}); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-[var(--border-color)] w-full max-w-3xl flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white">
                  <Settings className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">Manage Interview</h3>
                  <p className="text-xs text-[#64748B]">
                    {quickEditBulk
                      ? `${quickEditBulk.length} interview(s) selected`
                      : quickEditInterview?.candidateName || `Interview #${quickEditInterview?.id}`}
                  </p>
                </div>
              </div>
              <button onClick={() => { setQuickEditInterview(null); setQuickEditGroup(null); setQuickEditBulk(null); setQuickEditDraft({}); }} className="p-2 text-[#64748B] hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-3 bg-[#EFF6FF] border-b border-[#BFDBFE]">
              <p className="text-xs text-[#1D4ED8] flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>{quickEditTab === 'overview'
                  ? 'Manage all interview rounds for this candidate - view, edit or delete any round.'
                  : quickEditTab === 'performance'
                    ? 'Rate this candidate\u2019s performance in this round. Leave any field blank to keep its current value.'
                    : 'Schedule or update an interview round. Change the round number to switch to another round; leave fields blank to keep their current values.'}</span>
              </p>
            </div>
            <div className="flex border-b border-[var(--border-color)] bg-[#F8FAFC]">
              {[1, 2, 3, 4, 5].map((num) => {
                const labels: Record<number, string> = { 1: 'Recruiter', 2: 'HR Manager', 3: 'Technical', 4: 'Behavioral', 5: 'Final' };
                const isActive = quickEditTab === 'overview' && quickEditRound === num;
                return (
                  <button
                    key={num}
                    onClick={() => {
                      const rr = (quickEditGroup?.rounds || []).find((r) => Number(r.interviewRound || 1) === num);
                      setQuickEditRound(num);
                      setQuickEditInterview(rr || null);
                      setQuickEditDraft({});
                      setQuickEditTab('overview');
                    }}
                    className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors border-b-2 ${isActive ? 'text-[#1C64F2] border-[#1C64F2] bg-white' : 'text-[#64748B] hover:text-[#0F172A] border-transparent'} flex items-center justify-center gap-1.5 whitespace-nowrap`}
                  >
                    {`${labels[num] || `Round ${num}`} Round`}
                  </button>
                );
              })}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
              {quickEditTab === 'overview' && (
                <div className="space-y-4">
                  {(() => {
                    const labels: Record<number, string> = { 1: 'Recruiter', 2: 'HR Manager', 3: 'Technical', 4: 'Behavioral', 5: 'Final' };
                    const rr = quickEditInterview || (quickEditGroup?.rounds || []).find((r) => Number(r.interviewRound || 1) === quickEditRound) || null;
                    const label = labels[quickEditRound] || `Round ${quickEditRound}`;
                    return (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#0F172A]">{label} Round</span>
                          {rr ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">Saved</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500">Not scheduled yet</span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Interviewer</label>
                            <SearchableSelect
                              value={quickEditDraft.interviewerId !== undefined ? String(quickEditDraft.interviewerId) : (rr?.interviewerId ? String(rr.interviewerId) : '')}
                              onChange={(val) => setQuickEditDraft((prev) => ({ ...prev, interviewerId: val === '' ? undefined : Number(val) }))}
                              options={(employees || []).map((em: EmployeeOption) => ({ id: em.userId || em.id, name: `${formatEmployeeLabel(em)}${em.designation ? ` — ${em.designation}` : ''}`.trim() }))}
                              placeholder="Select Interviewer"
                              showAllOption={false}
                              className="w-full"
                            />
                            <p className="mt-1 text-xs text-gray-400">Employee conducting the interview.</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Interview Date</label>
                            <DatePicker
                              value={(() => { const dt = quickEditDraft.scheduledAt ?? rr?.scheduledAt ?? rr?.date ?? ''; return dt ? String(dt).split('T')[0] : ''; })()}
                              onChange={(val) => {
                                const cur = (quickEditDraft.scheduledAt ?? rr?.scheduledAt ?? rr?.date ?? '').toString();
                                const time = cur.split('T')[1] || '00:00';
                                setQuickEditDraft((prev) => ({ ...prev, scheduledAt: val + 'T' + time }));
                              }}
                              placeholder="Select Date"
                            />
                            <p className="mt-1 text-xs text-gray-400">Date of the interview.</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Interview Time</label>
                            <TimePicker
                              value={(() => { const dt = quickEditDraft.scheduledAt ?? rr?.scheduledAt ?? rr?.date ?? ''; return String(dt).split('T')[1] || ''; })()}
                              onChange={(val) => {
                                const cur = (quickEditDraft.scheduledAt ?? rr?.scheduledAt ?? rr?.date ?? '').toString();
                                const date = cur.split('T')[0] || '';
                                setQuickEditDraft((prev) => ({ ...prev, scheduledAt: date + 'T' + val }));
                              }}
                            />
                            <p className="mt-1 text-xs text-gray-400">Time of the interview.</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Interview Type</label>
                            <SearchableSelect
                              value={quickEditDraft.type ?? rr?.interviewType ?? ''}
                              onChange={(val) => setQuickEditDraft((prev) => ({ ...prev, type: String(val) }))}
                              options={(interviewTypeOptions as Array<{ code: string; name: string }>).map((opt) => ({ id: opt.code, name: opt.name }))}
                              placeholder="Select Type"
                              showAllOption={false}
                              className="w-full"
                            />
                            <p className="mt-1 text-xs text-gray-400">Telephonic, Video, Face to Face, or Panel.</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Interview Status</label>
                            <SearchableSelect
                              value={quickEditDraft.status ?? rr?.status ?? ''}
                              onChange={(val) => setQuickEditDraft((prev) => ({ ...prev, status: String(val) }))}
                              options={(interviewStatusOptionsFiltered as Array<{ code: string; name: string }>).map((opt) => ({ id: opt.code, name: opt.name }))}
                              placeholder="Select Status"
                              showAllOption={false}
                              className="w-full"
                            />
                            <p className="mt-1 text-xs text-gray-400">Scheduled, Completed, Rejected, Rescheduled.</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
                            <SearchableSelect
                              value={quickEditDraft.rating !== undefined ? String(quickEditDraft.rating) : (rr?.rating != null ? String(rr.rating) : '')}
                              onChange={(val) => setQuickEditDraft((prev) => ({ ...prev, rating: val === '' ? undefined : Number(val) }))}
                              options={[
                                { id: 1, name: '1 — Poor' },
                                { id: 2, name: '2 — Below Average' },
                                { id: 3, name: '3 — Average' },
                                { id: 4, name: '4 — Good' },
                                { id: 5, name: '5 — Excellent' },
                              ]}
                              placeholder="Select Rating"
                              showAllOption={false}
                              clearable
                              className="w-full"
                            />
                            <p className="mt-1 text-xs text-gray-400">Overall rating for this round (1-5).</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Communication Score (1-10)</label>
                            <input
                              type="number" min={1} max={10}
                              value={quickEditDraft.communicationScore !== undefined ? String(quickEditDraft.communicationScore) : (rr?.communicationScore != null ? String(rr.communicationScore) : '')}
                              onChange={(e) => {
                                const comm = e.target.value === '' ? undefined : Number(e.target.value);
                                const tech = quickEditDraft.technicalScore;
                                const overall = quickEditDraft.overallScore;
                                const rating = calcRatingFromScores(comm, tech, overall);
                                setQuickEditDraft((prev) => ({ ...prev, communicationScore: comm, rating: rating !== undefined ? rating : prev.rating }));
                              }}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            />
                            <p className="mt-1 text-xs text-gray-400">Communication skills score.</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Technical Score (1-10)</label>
                            <input
                              type="number" min={1} max={10}
                              value={quickEditDraft.technicalScore !== undefined ? String(quickEditDraft.technicalScore) : (rr?.technicalScore != null ? String(rr.technicalScore) : '')}
                              onChange={(e) => {
                                const tech = e.target.value === '' ? undefined : Number(e.target.value);
                                const comm = quickEditDraft.communicationScore;
                                const overall = quickEditDraft.overallScore;
                                const rating = calcRatingFromScores(comm, tech, overall);
                                setQuickEditDraft((prev) => ({ ...prev, technicalScore: tech, rating: rating !== undefined ? rating : prev.rating }));
                              }}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            />
                            <p className="mt-1 text-xs text-gray-400">Technical ability score.</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Overall Score (1-10)</label>
                            <input
                              type="number" min={1} max={10}
                              value={quickEditDraft.overallScore !== undefined ? String(quickEditDraft.overallScore) : (rr?.overallScore != null ? String(rr.overallScore) : '')}
                              onChange={(e) => {
                                const overall = e.target.value === '' ? undefined : Number(e.target.value);
                                const comm = quickEditDraft.communicationScore;
                                const tech = quickEditDraft.technicalScore;
                                const rating = calcRatingFromScores(comm, tech, overall);
                                setQuickEditDraft((prev) => ({ ...prev, overallScore: overall, rating: rating !== undefined ? rating : prev.rating }));
                              }}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            />
                            <p className="mt-1 text-xs text-gray-400">Overall score for this round.</p>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Feedback</label>
                            <textarea
                              rows={3}
                              value={quickEditDraft.feedback ?? rr?.feedback ?? ''}
                              onChange={(e) => setQuickEditDraft((prev) => ({ ...prev, feedback: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            />
                            <p className="mt-1 text-xs text-gray-400">Interviewer notes on this round's performance.</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--border-color)] bg-[#F8FAFC]">
              <button
                onClick={() => { setQuickEditInterview(null); setQuickEditGroup(null); setQuickEditBulk(null); setQuickEditDraft({}); }}
                className="px-4 py-2 text-sm font-medium text-[#64748B] hover:text-[#0F172A] bg-white border border-[#E2E8F0] rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              {!quickEditBulk && (() => {
                const active = (quickEditGroup?.rounds || []).find((r) => Number(r.interviewRound || 1) === quickEditRound);
                const labels: Record<number, string> = { 1: 'Recruiter', 2: 'HR Manager', 3: 'Technical', 4: 'Behavioral', 5: 'Final' };
                return (
                  <>
                    {active && (
                      <button
                        onClick={() => {
                          setEraseRoundTarget({ active, label: labels[quickEditRound] || `Round ${quickEditRound}` });
                        }}
                        className="px-4 py-2 text-sm font-medium text-white bg-[#EF4444] hover:bg-[#DC2626] rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="w-4 h-4" /> Erase Data
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        const base = quickEditGroup;
                        if (!base) return;
                        const targetRound = Math.min(quickEditRound || 1, 5);
                        const existing = base.rounds.find((r) => Number(r.interviewRound || 1) === targetRound);
                        const roundLabel = labels[targetRound] || `Round ${targetRound}`;
                        const draftSched = quickEditDraft.scheduledAt;
                        const safeSched = (draftSched && draftSched.trim() !== '' && draftSched !== 'T')
                          ? draftSched
                          : (existing?.scheduledAt || existing?.date || new Date().toISOString());
                        const payload = {
                          candidateId: base.candidateId,
                          jobId: base.jobId,
                          companyId: base.companyId,
                          interviewerId: quickEditDraft.interviewerId ?? existing?.interviewerId,
                          scheduledAt: safeSched,
                          interviewType: quickEditDraft.type ?? existing?.interviewType,
                          interviewRound: targetRound,
                          status: (quickEditDraft.status ?? existing?.status) || 'scheduled',
                          rating: quickEditDraft.rating,
                          feedback: quickEditDraft.feedback,
                          overallScore: quickEditDraft.overallScore,
                          technicalScore: quickEditDraft.technicalScore,
                          communicationScore: quickEditDraft.communicationScore,
                        };
                        try {
                          if (existing) {
                            await api.put(`/recruitment/interviews/${existing.id}`, payload);
                            toast.success(`${roundLabel} round updated`);
                          } else {
                            await api.post('/recruitment/interviews', payload);
                            toast.success(`${roundLabel} round added`);
                          }
                          queryClient.invalidateQueries({ queryKey: ['recruitment-interviews'] });
                          queryClient.invalidateQueries({ queryKey: ['recruitment-candidates'] });
                          setQuickEditInterview(null);
                          setQuickEditGroup(null);
                          setQuickEditBulk(null);
                          setQuickEditDraft({});
                        } catch (error: unknown) {
                          const err = error as { response?: { data?: { detail?: string } }; message?: string };
                          toast.error(`Failed to save: ${err.response?.data?.detail || err.message}`);
                        }
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-[#1C64F2] hover:bg-[#1E40AF] rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Save Round
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

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
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-white">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm"
                    style={{
                      background: showModal === 'job'
                        ? 'linear-gradient(135deg, #1C64F2, #1C64F2bb)'
                        : showModal === 'candidate'
                          ? 'linear-gradient(135deg, #10B981, #10B981bb)'
                          : 'linear-gradient(135deg, #F59E0B, #F59E0Bbb)'
                    }}
                  >
                    {showModal === 'job' ? <Briefcase className="w-5 h-5" /> : showModal === 'candidate' ? <Users className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#0F172A] leading-tight">
                      {editingItem ? (
                        showModal === 'job' ? 'Edit Job Opening' :
                        showModal === 'candidate' ? 'Edit Candidate' : 'Edit Interview'
                      ) : (
                        showModal === 'job' ? 'Add Job Opening' :
                        showModal === 'candidate' ? 'Add Candidate' : 'Schedule Interview'
                      )}
                    </h2>
                    <p className="text-xs text-[#64748B]">
                      {showModal === 'job'
                        ? editingItem ? 'Update the job posting details' : 'Create a new job opening for your company'
                        : showModal === 'candidate'
                          ? editingItem ? 'Update the candidate profile' : 'Add a new candidate to the pipeline'
                          : editingItem ? 'Update the interview details' : 'Schedule a new interview'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCloseDrawer}
                    className="px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="recruitment-form"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10 flex items-center gap-2"
                  >
                    {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : (editingItem ? 'Update' : 'Create')}
                  </button>
                  <button
                    onClick={handleCloseDrawer}
                    className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {showModal === 'candidate' && (
                <div className="px-6 py-2.5 bg-[#FFF7ED] border-b border-[var(--border-color)]">
                  <p className="text-[11px] text-[#B45309]">
                    <Info className="w-4 h-4 inline mr-1" />
                    Fill in the candidate details below and click Create to save.
                  </p>
                </div>
              )}

              {showModal === 'interview' && (
                <div className="px-6 py-2.5 bg-[#FFF7ED] border-b border-[var(--border-color)]">
                  <p className="text-[11px] text-[#B45309]">
                    <Info className="w-4 h-4 inline mr-1" />
                    Fill in the interview details below and click Create to save.
                  </p>
                </div>
              )}

              {/* Form Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <form key={showModal + (editingItem ? editingItem.id : 'new')} id="recruitment-form" onSubmit={handleSubmit} className="space-y-4">
                  {showModal === 'job' && renderJobForm()}
                  {showModal === 'candidate' && renderCandidateForm()}
                  {showModal === 'interview' && renderInterviewForm()}
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Post Job to Portal Modal */}
      <Modal isOpen={!!postJobTarget} onClose={() => setPostJobTarget(null)} title="Post Job to Portal">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl">
            <div className="w-11 h-11 rounded-full bg-[#1C64F2]/10 flex items-center justify-center shrink-0">
              <Briefcase className="w-6 h-6 text-[#1C64F2]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#0F172A] truncate">{postJobTarget?.title || 'Job'}</p>
              <p className="text-xs text-[#64748B]">{postJobTarget?.location || 'Remote'} — {postJobTarget?.employmentType || 'full-time'}</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-2">Select a job portal</label>
            <div className="grid grid-cols-1 gap-2.5">
              {PORTALS.map((portal) => (
                <button key={portal.id} onClick={() => postJobToPortal(portal)}
                  className="flex items-center gap-3 px-4 py-3 border border-[#E2E8F0] rounded-xl hover:border-[#1C64F2] hover:bg-[#F8FAFC] transition-all group text-left">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: portal.bg, color: portal.color }}>
                    <portal.icon className="w-5 h-5" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#0F172A]">{portal.name}</p>
                    <p className="text-xs text-[#94A3B8]">{portal.description}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-[#94A3B8] group-hover:text-[#1C64F2] transition-colors" />
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-[#94A3B8] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3">
            Selecting a portal will open the official website in a new tab. Log in there and post the job manually — the job title and details are shown above for reference.
          </p>
        </div>
      </Modal>

      {/* Reject Candidate Modal */}
      <Modal isOpen={!!rejectTarget || !!rejectTargets} onClose={() => { setRejectTarget(null); setRejectTargets(null); setRejectReason(''); }} title={rejectTargets ? 'Reject Candidates' : 'Reject Candidate'}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-xl">
            <div className="w-11 h-11 rounded-full bg-[#DC2626]/10 flex items-center justify-center shrink-0">
              <XCircle className="w-6 h-6 text-[#DC2626]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">
                {rejectTargets ? `Reject ${rejectTargets.length} selected candidate(s)` : (rejectTarget ? candidateDisplayName(rejectTarget) : 'Candidate')}
              </p>
              <p className="text-xs text-[#64748B]">
                {rejectTargets ? 'A single rejection reason will be applied to all selected candidates.' : `${rejectTarget?.currentPosition || rejectTarget?.jobTitle || 'Candidate'} · ${rejectTarget?.email || ''}`}
              </p>
              {!rejectTargets && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium mt-1.5 ${rejectSource === 'interview' ? 'bg-orange-100 text-orange-700' : 'bg-violet-100 text-violet-700'}`}>
                  {rejectSource === 'interview' ? 'From Interviews' : 'From Candidates'}
                </span>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="e.g. Failed the technical assessment, poor communication skills, salary expectations too high..."
              className="w-full px-4 py-3 border border-[#E2E8F0] rounded-xl text-sm focus:ring-2 focus:ring-[#1C64F2] focus:border-transparent outline-none text-[#0F172A] placeholder-[#94A3B8] resize-none"
            />
            <p className="text-xs text-[#94A3B8] mt-1.5">The reason will be stored with the candidate's record and shown in the Rejected list.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setRejectTarget(null); setRejectTargets(null); setRejectReason(''); }}
              className="flex-1 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] font-medium rounded-xl hover:bg-[#F1F5F9] transition-colors">
              Cancel
            </button>
            <button onClick={submitRejection} disabled={!rejectReason.trim()}
              className="flex-1 px-4 py-2.5 bg-[#DC2626] text-white font-medium rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <XCircle className="w-4 h-4" /> {rejectSource === 'interview' ? 'Reject from Interview' : rejectTargets ? `Reject ${rejectTargets.length} Candidates` : 'Reject Candidate'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Action Reason Modal (shortlist / select / reject / restore / delete) */}
      <Modal
        isOpen={!!reasonActionTargets && reasonActionTargets.length > 0}
        onClose={() => { setReasonActionTargets(null); setReasonActionReason(''); }}
        title={reasonActionType === 'shortlist' ? 'Shortlist Candidate' : reasonActionType === 'select' ? 'Select Candidate' : reasonActionType === 'reject' ? 'Reject Candidate' : reasonActionType === 'notjoined' ? 'Mark as Not Joined' : reasonActionType === 'restoreoffered' ? 'Restore to Offered' : reasonActionType === 'delete' ? 'Delete Candidate' : 'Restore Candidate'}
      >
        <div className="space-y-4">
          {(() => {
            const CONFIGS = {
              shortlist: { label: 'Shortlist', verb: 'Shortlisting', reasonLabel: 'Shortlist Reason', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0', text: '#047857', icon: Award },
              select: { label: 'Select', verb: 'Selecting', reasonLabel: 'Selection Reason', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0', text: '#047857', icon: CheckCircle2 },
              reject: { label: 'Reject', verb: 'Rejecting', reasonLabel: 'Rejection Reason', color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', icon: XCircle },
              notjoined: { label: 'Not Joined', verb: 'Marking as not joined', reasonLabel: 'Not Joined Reason', color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', icon: XCircle },
              restore: { label: 'Restore', verb: 'Restoring to pipeline', reasonLabel: 'Restore Reason', color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0', text: '#475569', icon: RotateCcw },
              restoreoffered: { label: 'Restore', verb: 'Restoring to offered', reasonLabel: 'Restore Reason', color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0', text: '#475569', icon: RotateCcw },
              delete: { label: 'Delete', verb: 'Deleting', reasonLabel: 'Delete Reason', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C', icon: Trash2 },
            } as const;
            const cfg = CONFIGS[reasonActionType] || CONFIGS.restore;
            const Icon = cfg.icon;
            const isDanger = reasonActionType === 'delete';
            return (
              <>
                <div className="flex items-center gap-3 p-4 rounded-xl border" style={{ background: cfg.bg, borderColor: cfg.border }}>
                  <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: cfg.color, color: '#fff' }}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">
                      {reasonActionTargets && reasonActionTargets.length > 1
                        ? `${cfg.label} ${reasonActionTargets.length} selected candidate(s)`
                        : (reasonActionTargets && reasonActionTargets.length === 1 ? candidateDisplayName(reasonActionTargets[0]) : 'Candidate')}
                    </p>
                    <p className="text-xs text-[#64748B]">
                      {reasonActionTargets && reasonActionTargets.length > 1
                        ? 'A single reason will be applied to all selected candidates.'
                        : (reasonActionTargets && reasonActionTargets.length === 1 ? `${reasonActionTargets[0].currentPosition || reasonActionTargets[0].jobTitle || 'Candidate'} · ${reasonActionTargets[0].email || ''}` : '')}
                    </p>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium mt-1.5" style={{ background: cfg.border, color: cfg.text }}>
                      {cfg.verb}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1.5">{cfg.reasonLabel}</label>
                  <textarea
                    value={reasonActionReason}
                    onChange={(e) => setReasonActionReason(e.target.value)}
                    rows={4}
                    placeholder={reasonActionType === 'shortlist'
                      ? "e.g. Strong technical skills, relevant experience, good communication..."
                      : reasonActionType === 'select'
                        ? "e.g. Excellent performance across all rounds, strong culture fit..."
                        : reasonActionType === 'reject'
                          ? "e.g. Did not meet the required skill level, poor communication..."
                          : reasonActionType === 'notjoined'
                            ? "e.g. Accepted another offer, salary negotiation failed, relocation issue..."
                            : reasonActionType === 'delete'
                              ? "e.g. Duplicate record, invalid contact details, test data..."
                              : "e.g. Reconsidered application, candidate showed interest again..."}
                    className="w-full px-4 py-3 border border-[#E2E8F0] rounded-xl text-sm focus:ring-2 focus:ring-[#1C64F2] focus:border-transparent outline-none text-[#0F172A] placeholder-[#94A3B8] resize-none"
                  />
                  <p className="text-xs text-[#94A3B8] mt-1.5">{reasonActionType === 'delete'
                    ? 'This will permanently remove the selected candidate(s) from the system. This action cannot be undone.'
                    : reasonActionType === 'reject'
                      ? 'The candidate will be moved out of the pipeline and can be restored later. The reason will be stored with the candidate\'s record.'
                      : reasonActionType === 'notjoined'
                        ? 'The candidate will be marked as not joined and moved out of the active pipeline. The reason will be stored with the candidate\'s record.'
                        : 'The reason will be stored with the candidate\'s record.'}</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setReasonActionTargets(null); setReasonActionReason(''); }}
                    className="flex-1 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] font-medium rounded-xl hover:bg-[#F1F5F9] transition-colors">
                    Cancel
                  </button>
                  <button onClick={submitReasonAction}
                    className={`flex-1 px-4 py-2.5 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 ${isDanger ? 'bg-[#DC2626] hover:bg-red-700' : ''}`}
                    style={isDanger ? undefined : { background: cfg.color }}>
                    <Icon className="w-4 h-4" />
                    {reasonActionType === 'shortlist' ? 'Shortlist Candidate' : reasonActionType === 'select' ? 'Select Candidate' : reasonActionType === 'reject' ? 'Reject Candidate' : reasonActionType === 'notjoined' ? 'Mark as Not Joined' : reasonActionType === 'restoreoffered' ? 'Restore to Offered' : reasonActionType === 'delete' ? 'Delete Candidate' : 'Restore Candidate'}
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      </Modal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        itemName={deleteTarget?.name || 'this item'}
        isDeleting={deleteMutation.isPending}
      />

      {/* Move to Onboarding Modal - asks for the hired date */}
      <Modal
        isOpen={!!onboardTarget}
        onClose={() => { if (!onboardMutation.isPending) setOnboardTarget(null); }}
        title="Move to Onboarding"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5]">
            <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 bg-[#10B981] text-white">
              <LogIn className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">{onboardTarget ? candidateDisplayName(onboardTarget) : ''}</p>
              <p className="text-xs text-[#64748B]">Set the hired date, then move this candidate into the onboarding pipeline.</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Hired Date</label>
            <DatePicker
              value={onboardJoinDate}
              onChange={setOnboardJoinDate}
              placeholder="Select hired date"
            />
            <p className="mt-1 text-xs text-[#94A3B8]">The date the candidate officially joins. Leave blank to use today.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setOnboardTarget(null)}
              disabled={onboardMutation.isPending}
              className="flex-1 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] font-medium rounded-xl hover:bg-[#F1F5F9] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { if (onboardTarget) onboardMutation.mutate({ id: onboardTarget.id, joinDate: onboardJoinDate || undefined }); }}
              disabled={onboardMutation.isPending}
              className="flex-1 px-4 py-2.5 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600"
            >
              {onboardMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              Move to Onboarding
            </button>
          </div>
        </div>
      </Modal>

      {/* Bulk Delete Candidates Modal */}
      <Modal
        isOpen={!!bulkDeleteCandidates && bulkDeleteCandidates.length > 0}
        onClose={() => setBulkDeleteCandidates(null)}
        title="Delete Candidates"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2]">
            <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 bg-[#DC2626] text-white">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">Delete {bulkDeleteCandidates?.length || 0} candidate(s)?</p>
              <p className="text-xs text-[#64748B] mt-1">This will permanently remove the selected records and their associated history. This action cannot be undone.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setBulkDeleteCandidates(null)}
              className="flex-1 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] font-medium rounded-xl hover:bg-[#F1F5F9] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                (bulkDeleteCandidates || []).forEach((c) => deleteMutation.mutate(c.id));
                setBulkDeleteCandidates(null);
              }}
              className="flex-1 px-4 py-2.5 bg-[#DC2626] hover:bg-red-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </div>
      </Modal>

      {/* Bulk Delete Jobs Modal */}
      <Modal
        isOpen={!!bulkDeleteJobs && bulkDeleteJobs.length > 0}
        onClose={() => setBulkDeleteJobs(null)}
        title="Delete Jobs"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2]">
            <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 bg-[#DC2626] text-white">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">Delete {bulkDeleteJobs?.length || 0} job(s)?</p>
              <p className="text-xs text-[#64748B] mt-1">This will permanently remove the selected records and their associated history. This action cannot be undone.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setBulkDeleteJobs(null)}
              className="flex-1 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] font-medium rounded-xl hover:bg-[#F1F5F9] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                (bulkDeleteJobs || []).forEach((j) => deleteMutation.mutate(j.id));
                setBulkDeleteJobs(null);
              }}
              className="flex-1 px-4 py-2.5 bg-[#DC2626] hover:bg-red-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </div>
      </Modal>

      {viewRoundsCandidate && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setViewRoundsCandidate(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-[var(--border-color)] w-full max-w-lg flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white">
                  <Layers className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">Interview Rounds</h3>
                  <p className="text-xs text-[#64748B]">{candidateDisplayName(viewRoundsCandidate)} · {viewRoundsCandidate.jobTitle || 'Candidate'}</p>
                </div>
              </div>
              <button onClick={() => setViewRoundsCandidate(null)} className="p-2 text-[#64748B] hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-3 bg-[#FFFBEB] border-b border-[#FDE68A]">
              <p className="text-xs text-[#B45309] flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>View this candidate's performance across every interview round. Click a round tab to see its details.</span>
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              {(() => {
                const roundLabels: Record<number, string> = { 1: 'Recruiter', 2: 'HR Manager', 3: 'Technical', 4: 'Behavioral', 5: 'Final' };
                const rounds = (interviews || [])
                  .filter((i: RecruitmentInterview) => i.candidateId === viewRoundsCandidate.id)
                  .sort((a, b) => (a.interviewRound || 1) - (b.interviewRound || 1));
                const totalRounds = Math.max(5, ...rounds.map((r) => r.interviewRound || 1));
                const pickBestRound = (num: number) => {
                  const matches = rounds.filter((r) => (r.interviewRound || 1) === num);
                  if (matches.length === 0) return null;
                  // Prefer the record with actual performance data; otherwise the latest one.
                  return matches.sort((a, b) => {
                    const aData = (a.rating != null ? 1 : 0) + (a.feedback ? 1 : 0) + (a.overallScore != null ? 1 : 0) + (a.technicalScore != null ? 1 : 0) + (a.communicationScore != null ? 1 : 0);
                    const bData = (b.rating != null ? 1 : 0) + (b.feedback ? 1 : 0) + (b.overallScore != null ? 1 : 0) + (b.technicalScore != null ? 1 : 0) + (b.communicationScore != null ? 1 : 0);
                    return bData - aData;
                  })[0];
                };
                const active = pickBestRound(viewRoundsTab);
                return (
                  <>
                    <div className="flex flex-wrap gap-2 mb-4 border-b border-[var(--border-color)] pb-3">
                      {Array.from({ length: totalRounds }, (_, idx) => idx + 1).map((num) => {
                        const round = pickBestRound(num);
                        const isActive = viewRoundsTab === num;
                        return (
                          <button
                            key={num}
                            onClick={() => setViewRoundsTab(num)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isActive ? 'bg-amber-500 text-white shadow-sm' : round ? 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]' : 'bg-white text-[#94A3B8] border border-dashed border-[#CBD5E1] hover:bg-[#F8FAFC]'}`}
                          >
                            {roundLabels[num] || `Round ${num}`}
                            {round && (round.status || 'scheduled') === 'selected' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                            {round && (round.status || 'scheduled') === 'rejected' && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
                          </button>
                        );
                      })}
                    </div>
                    {active ? (
                      <div className="border border-[#E9EDF3] rounded-xl overflow-hidden">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 bg-[#F8FAFC] border-b border-[#E9EDF3]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-[#0F172A]">{roundLabels[active.interviewRound || 1] || `Round ${active.interviewRound || 1}`}</span>
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${(active.status || 'scheduled') === 'selected' ? 'bg-emerald-100 text-emerald-700' : (active.status || 'scheduled') === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-sky-100 text-sky-700'}`}>
                              {active.status || 'Scheduled'}
                            </span>
                            {active.interviewType && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-[#E2E8F0] text-[10px] text-[#94A3B8] capitalize">
                                {String(active.interviewType).replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-[#64748B]">Performance</span>
                            {Number(active.rating || 0) > 0 ? (
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <Star key={n} className={`w-3.5 h-3.5 ${n <= Number(active.rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
                                ))}
                                <span className="ml-1 text-xs font-semibold text-[#0F172A]">{active.rating}/5</span>
                              </div>
                            ) : (
                              <span className="text-xs text-[#94A3B8]">Not rated</span>
                            )}
                          </div>
                        </div>
                        <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-[#94A3B8]">Communication</p>
                            <p className="text-sm font-medium text-[#0F172A]">{active.communicationScore != null ? `${active.communicationScore}/10` : '—'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-[#94A3B8]">Technical</p>
                            <p className="text-sm font-medium text-[#0F172A]">{active.technicalScore != null ? `${active.technicalScore}/10` : '—'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-[#94A3B8]">Overall</p>
                            <p className="text-sm font-medium text-[#0F172A]">{active.overallScore != null ? `${active.overallScore}/10` : '—'}</p>
                          </div>
                        </div>
                        {active.feedback && (
                          <div className="px-4 pb-3">
                            <p className="text-[11px] uppercase tracking-wide text-[#94A3B8] mb-1">Feedback</p>
                            <p className="text-sm text-[#475569]">{active.feedback}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="border border-dashed border-[#CBD5E1] rounded-xl flex flex-col items-center justify-center py-12 text-center">
                        <span className="w-12 h-12 rounded-full bg-[#F1F5F9] flex items-center justify-center mb-3">
                          <Clock className="w-5 h-5 text-[#94A3B8]" />
                        </span>
                        <p className="text-sm font-semibold text-[#64748B]">{roundLabels[viewRoundsTab] || `Round ${viewRoundsTab}`} not completed yet</p>
                        <p className="text-xs text-[#94A3B8] mt-1">No interview has been conducted for this round yet.</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--border-color)] bg-[#F8FAFC]">
              <button
                onClick={() => setViewRoundsCandidate(null)}
                className="px-4 py-2 text-sm font-medium text-[#64748B] hover:text-[#0F172A] bg-white border border-[#E2E8F0] rounded-lg hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmActionModal
        isOpen={!!restoreCandidateTarget}
        title="Restore Candidate"
        message={`Restore ${candidateDisplayName(restoreCandidateTarget as RecruitmentCandidate)} back to the recruitment pipeline?`}
        consequence="The candidate will be moved back to the 'Applied' stage and become visible in the pipeline again."
        confirmLabel="Restore"
        variant="success"
        onConfirm={() => {
          if (restoreCandidateTarget) {
            api.patch(`/recruitment/candidates/${restoreCandidateTarget.id}/status`, { status: 'applied' })
              .then(() => {
                toast.success('Candidate restored to pipeline');
                queryClient.invalidateQueries({ queryKey: ['recruitment-candidates'] });
                queryClient.invalidateQueries({ queryKey: ['recruitment-' + activeTab] });
                queryClient.invalidateQueries({ queryKey: ['recruitment-pipeline-stats'] });
              })
              .catch(() => toast.error('Failed to restore candidate'));
            setRestoreCandidateTarget(null);
          }
        }}
        onCancel={() => setRestoreCandidateTarget(null)}
      />
      <ConfirmActionModal
        isOpen={!!activateJobsTarget}
        title={`Activate ${activateJobsTarget?.length || 0} Job(s)?`}
        message={`You are about to activate ${activateJobsTarget?.length || 0} selected job opening(s).`}
        consequence="These jobs will become visible to candidates and appear as 'Open' in the recruitment pipeline."
        confirmLabel="Activate"
        variant="success"
        onConfirm={() => {
          if (activateJobsTarget) {
            activateJobsTarget.forEach((j) => {
              if (j.status !== 'open') api.patch(`/recruitment/jobs/${j.id}/status`, { status: 'open' });
            });
            toast.success(`${activateJobsTarget.length} job(s) activated`);
            queryClient.invalidateQueries({ queryKey: ['recruitment-jobs'] });
            setActivateJobsTarget(null);
          }
        }}
        onCancel={() => setActivateJobsTarget(null)}
      />
      <ConfirmActionModal
        isOpen={!!deactivateJobsTarget}
        title={`Deactivate ${deactivateJobsTarget?.length || 0} Job(s)?`}
        message={`You are about to deactivate ${deactivateJobsTarget?.length || 0} selected job opening(s).`}
        consequence="These jobs will be marked as 'Closed' and will no longer be visible to candidates."
        confirmLabel="Deactivate"
        variant="warning"
        onConfirm={() => {
          if (deactivateJobsTarget) {
            deactivateJobsTarget.forEach((j) => {
              if (j.status !== 'closed') api.patch(`/recruitment/jobs/${j.id}/status`, { status: 'closed' });
            });
            toast.success(`${deactivateJobsTarget.length} job(s) deactivated`);
            queryClient.invalidateQueries({ queryKey: ['recruitment-jobs'] });
            setDeactivateJobsTarget(null);
          }
        }}
        onCancel={() => setDeactivateJobsTarget(null)}
      />
      <ConfirmActionModal
        isOpen={!!eraseRoundTarget}
        title={`Erase ${eraseRoundTarget?.label || 'Round'} Data?`}
        message={`Erase the data for the ${eraseRoundTarget?.label || 'round'}? You can add it again later.`}
        consequence="This will permanently remove the interview data for this round. The candidate's other round data will remain intact."
        confirmLabel="Erase Data"
        variant="danger"
        onConfirm={async () => {
          if (eraseRoundTarget) {
            try {
              await api.delete(`/recruitment/interviews/${eraseRoundTarget.active.id}`);
              toast.success(`${eraseRoundTarget.label} round data erased`);
              queryClient.invalidateQueries({ queryKey: ['recruitment-interviews'] });
              queryClient.invalidateQueries({ queryKey: ['recruitment-candidates'] });
              setQuickEditGroup((prev) => prev ? {
                ...prev,
                rounds: prev.rounds.filter((r) => r.id !== eraseRoundTarget.active.id),
                interviewIds: prev.interviewIds.filter((id) => id !== eraseRoundTarget.active.id),
              } : prev);
              setQuickEditInterview(null);
              setQuickEditDraft({});
            } catch (error: unknown) {
              const err = error as { response?: { data?: { detail?: string } }; message?: string };
              toast.error(`Failed to erase: ${err.response?.data?.detail || err.message}`);
            }
            setEraseRoundTarget(null);
          }
        }}
        onCancel={() => setEraseRoundTarget(null)}
      />
    </div>
  );
};

export default Recruitment;

