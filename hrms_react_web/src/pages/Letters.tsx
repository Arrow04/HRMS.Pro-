import { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText, Search, Download, Printer, Copy, Check, X,
  Briefcase, ClipboardCheck, Award, TrendingUp, LogOut, FileBadge, Stamp,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import toast from 'react-hot-toast';
import PageHero from '../components/PageHero';
import FormField, { formInputClass, formTextareaClass } from '../components/FormField';
import DatePicker from '../components/DatePicker';
import SearchableSelect from '../components/SearchableSelect';
import CompactImageUpload from '../components/CompactImageUpload';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import { personDisplayName } from '../utils/employeeNameUtils';
import type { Employee } from '../types';

type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'textarea';
  required?: boolean;
  placeholder?: string;
};

type Template = {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  subject: (f: Record<string, string>) => string;
  greeting: (f: Record<string, string>) => string;
  body: (f: Record<string, string>) => string[];
  closing: (f: Record<string, string>) => string[];
  contextTitle?: string;
  context?: (f: Record<string, string>) => string[];
  fields: FieldDef[];
};

const termsContext = (f: Record<string, string>) => {
  const rows: string[] = [];
  if (f.reporting_to) rows.push(`Reporting to: ${f.reporting_to}`);
  if (f.probation_months) rows.push(`Probation period: ${f.probation_months} months from the date of joining`);
  if (f.notice_period) rows.push(`Notice period: ${f.notice_period} on either side post confirmation`);
  if (f.salary) rows.push(`Annual CTC: Rs. ${f.salary} per annum (detailed breakup enclosed in the annexure)`);
  return rows;
};

const COMMON_FIELDS: FieldDef[] = [
  { key: 'ref_no', label: 'Reference No.', type: 'text', placeholder: 'HR/2026/001' },
  { key: 'date', label: 'Letter Date', type: 'date', required: true },
];

const TEMPLATES: Template[] = [
  {
    id: 'offer',
    label: 'Offer Letter',
    description: 'Job offer with role, salary and joining date',
    icon: Briefcase,
    subject: (f) => `Offer of Employment — ${f.designation || 'Position'}`,
    greeting: (f) => `Dear ${f.employee_name || 'Candidate'},`,
    body: (f) => [
      `On behalf of ${f.company_name || '[Company]'}, we are delighted to offer you the position of ${f.designation || '[Designation]'}${f.department ? ` within the ${f.department} department` : ''}. Your credentials and interview performance distinguished you among a competitive field, and we are confident you will make a substantive contribution to our organisation.`,
      `Your annual cost-to-company (CTC) shall be Rs. ${f.salary || '[Amount]'} per annum, structured as detailed in the annexure hereto. Your expected date of joining is ${f.joining_date || '[Date]'}.`,
      `This offer remains contingent upon the satisfactory completion of document verification, reference checks and pre-employment formalities. We kindly request you to signify your acceptance by signing and returning a copy of this letter within seven (7) days of receipt, failing which this offer shall stand withdrawn.`,
    ],
    closing: () => ['We look forward to welcoming you aboard.', 'Warm regards,'],
    contextTitle: 'Terms of Employment',
    context: termsContext,
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'department', label: 'Department', type: 'text' },
      { key: 'salary', label: 'Annual CTC (Rs.)', type: 'text', required: true },
      { key: 'joining_date', label: 'Joining Date', type: 'date', required: true },
      { key: 'reporting_to', label: 'Reporting To', type: 'text', placeholder: 'e.g. Head of Engineering' },
      { key: 'probation_months', label: 'Probation (months)', type: 'text', placeholder: 'e.g. 6' },
      { key: 'notice_period', label: 'Notice Period', type: 'text', placeholder: 'e.g. 60 days' },
    ],
  },
  {
    id: 'appointment',
    label: 'Appointment Letter',
    description: 'Formal appointment with terms of employment',
    icon: ClipboardCheck,
    subject: (f) => `Letter of Appointment — ${f.employee_name || 'Employee'}`,
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `With reference to your application and our subsequent discussions, we are pleased to appoint you as ${f.designation || '[Designation]'} at ${f.company_name || '[Company]'}, with effect from ${f.joining_date || '[Date]'}.`,
      `You shall be entitled to an annual cost-to-company (CTC) of Rs. ${f.salary || '[Amount]'} per annum. Your employment shall be governed by the company's human resource policies, code of conduct and applicable standing orders, copies of which will be furnished to you separately and shall be deemed to form part of this appointment.`,
      `Your initial place of posting shall be ${f.location || '[Location]'}. The management reserves the right to transfer your services to any of its offices, branches or client sites, in India or abroad, as organisational requirements may dictate.`,
      ...(f.address ? [`As per our records, your address for official communication is: ${f.address}. Please notify Human Resources in writing of any change thereto.`] : []),
    ],
    closing: () => ['With regards,'],
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'department', label: 'Department', type: 'text' },
      { key: 'salary', label: 'Annual CTC (Rs.)', type: 'text', required: true },
      { key: 'joining_date', label: 'Effective Date', type: 'date', required: true },
      { key: 'location', label: 'Place of Posting', type: 'text' },
      { key: 'reporting_to', label: 'Reporting To', type: 'text', placeholder: 'e.g. Head of Engineering' },
      { key: 'probation_months', label: 'Probation (months)', type: 'text', placeholder: 'e.g. 6' },
      { key: 'notice_period', label: 'Notice Period', type: 'text', placeholder: 'e.g. 60 days' },
    ],
    contextTitle: 'Terms of Employment',
    context: termsContext,
  },
  {
    id: 'confirmation',
    label: 'Probation Confirmation',
    description: 'Confirm employment after probation',
    icon: FileBadge,
    subject: () => 'Confirmation of Employment',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `We take pleasure in informing you that, consequent upon the successful completion of your probationary period, your services as ${f.designation || '[Designation]'} stand confirmed with effect from ${f.confirmation_date || '[Date]'}.`,
      `Your performance during probation has been assessed as satisfactory, and the management places on record its appreciation of your contributions to date. We look forward to your sustained association and professional growth with ${f.company_name || '[Company]'}. All other terms and conditions of your appointment shall remain unaltered.`,
    ],
    closing: () => ['Please accept our congratulations and best wishes for a rewarding career ahead.'],
    contextTitle: 'Assessment Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.review_period) rows.push(`Review period: ${f.review_period}`);
      if (f.remarks) rows.push(`Reviewer remarks: ${f.remarks}`);
      return rows;
    },
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'confirmation_date', label: 'Confirmation Date', type: 'date', required: true },
      { key: 'review_period', label: 'Review Period', type: 'text', placeholder: 'e.g. Jan – Jun 2026' },
      { key: 'remarks', label: 'Reviewer Remarks', type: 'textarea', placeholder: 'e.g. Consistently exceeded expectations on delivery quality…' },
    ],
  },
  {
    id: 'appraisal',
    label: 'Appraisal Letter',
    description: 'Salary revision after performance review',
    icon: TrendingUp,
    subject: (f) => `Salary Revision — FY ${f.financial_year || '2025-26'}`,
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `Further to the annual performance review for FY ${f.financial_year || '2025-26'}, the management is pleased to revise your compensation with an increment of ${f.increment_pct || '[X]'}%, effective ${f.effective_date || '[Date]'}.`,
      `Your revised annual cost-to-company (CTC) shall accordingly be Rs. ${f.new_salary || '[Amount]'} per annum, the detailed structure of which is enclosed in the annexure. This revision is a recognition of your performance and a measure of the organisation's confidence in your continued contribution to ${f.company_name || '[Company]'}.`,
    ],
    closing: () => ['Best wishes,'],
    contextTitle: 'Performance Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.rating) rows.push(`Overall rating: ${f.rating}`);
      if (f.financial_year) rows.push(`Review year: ${f.financial_year}`);
      if (f.remarks) rows.push(`Reviewer remarks: ${f.remarks}`);
      return rows;
    },
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'financial_year', label: 'Financial Year', type: 'text', placeholder: '2025-26' },
      { key: 'increment_pct', label: 'Increment %', type: 'text', required: true },
      { key: 'new_salary', label: 'Revised CTC (Rs.)', type: 'text', required: true },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true },
      { key: 'rating', label: 'Performance Rating', type: 'text', placeholder: 'e.g. 4.5 / Exceeds Expectations' },
      { key: 'remarks', label: 'Reviewer Remarks', type: 'textarea', placeholder: 'Key strengths and growth areas…' },
    ],
  },
  {
    id: 'relieving',
    label: 'Relieving Letter',
    description: 'Confirm separation and last working day',
    icon: LogOut,
    subject: () => 'Relieving Letter',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `This is to confirm that ${f.employee_name || '[Name]'}, ${f.designation || '[Designation]'} (Employee Code: ${f.employee_code || '[Code]'}) stands relieved from the services of ${f.company_name || '[Company]'} with effect from the close of business hours on ${f.last_working_day || '[Date]'}.`,
      `We further confirm that all exit formalities, including departmental clearance and full-and-final settlement of accounts, have been duly completed, and that no dues remain outstanding on either side as of the aforementioned date. We wish you every success in your future endeavours.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Separation Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.notice_served) rows.push(`Notice period: ${f.notice_served}`);
      if (f.clearance_notes) rows.push(`Clearance: ${f.clearance_notes}`);
      return rows;
    },
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'employee_code', label: 'Employee Code', type: 'text' },
      { key: 'last_working_day', label: 'Last Working Day', type: 'date', required: true },
      { key: 'notice_served', label: 'Notice Period', type: 'text', placeholder: 'e.g. Served in full / 30 days waived' },
      { key: 'clearance_notes', label: 'Clearance Notes', type: 'textarea', placeholder: 'e.g. Laptop returned, ID revoked, dues settled…' },
    ],
  },
  {
    id: 'experience',
    label: 'Experience Letter',
    description: 'Service certificate with tenure and conduct',
    icon: Award,
    subject: () => 'To Whom It May Concern — Service Certificate',
    greeting: () => 'To Whom It May Concern,',
    body: (f) => [
      `This is to certify that ${f.employee_name || '[Name]'} was employed with ${f.company_name || '[Company]'} in the capacity of ${f.designation || '[Designation]'}, for the period ${f.joining_date || '[From]'} to ${f.last_working_day || '[To]'}.`,
      `Throughout the tenure of employment, the conduct and performance were found to be ${f.conduct || 'entirely satisfactory'}. We have no hesitation in commending the individual to prospective employers, and we wish every success in all future assignments.`,
    ],
    closing: () => ['Issued on request, without prejudice.', 'Sincerely,'],
    contextTitle: 'Role Snapshot',
    context: (f) => (f.responsibilities ? [`Key responsibilities: ${f.responsibilities}`] : []),
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'joining_date', label: 'Date of Joining', type: 'date', required: true },
      { key: 'last_working_day', label: 'Last Working Day', type: 'date', required: true },
      { key: 'conduct', label: 'Conduct', type: 'text', placeholder: 'satisfactory' },
      { key: 'responsibilities', label: 'Key Responsibilities', type: 'textarea', placeholder: 'e.g. Led payroll processing for 700+ staff; automated…' },
    ],
  },
  {
    id: 'noc',
    label: 'No Objection Certificate',
    description: 'NOC for visa, loan or higher studies',
    icon: Stamp,
    subject: () => 'No Objection Certificate',
    greeting: () => 'To Whom It May Concern,',
    body: (f) => [
      `This is to certify that ${f.employee_name || '[Name]'}, ${f.designation || '[Designation]'} (Employee Code: ${f.employee_code || '[Code]'}) is presently employed with ${f.company_name || '[Company]'}, having joined on ${f.joining_date || '[Date]'}.`,
      `At the employee's request, we confirm that the organisation has no objection to the employee ${f.purpose || 'applying for a visa / loan / higher studies'}, as stated in the request dated ${f.date || '[Date]'}. This certificate is issued solely for the stated purpose and shall not be construed as a commitment or undertaking of any other nature.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Validity',
    context: (f) => (f.validity_days ? [`This certificate remains valid for ${f.validity_days} days from the date of issue.`] : []),
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'employee_code', label: 'Employee Code', type: 'text' },
      { key: 'joining_date', label: 'Date of Joining', type: 'date' },
      { key: 'purpose', label: 'Purpose', type: 'text', placeholder: 'applying for a visa' },
      { key: 'validity_days', label: 'Valid For (days)', type: 'text', placeholder: 'e.g. 90' },
    ],
  },
  {
    id: 'showcause',
    label: 'Show Cause Notice',
    description: 'Seek written explanation for misconduct',
    icon: FileText,
    subject: (f) => `Show Cause Notice — ${f.misconduct || 'Misconduct'}`,
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `It has come to the notice of the management that ${f.misconduct_details || '[describe the act of misconduct, with dates]'}. This conduct, if established, constitutes a serious violation of the company's code of conduct and standing orders.`,
      `You are hereby required to show cause, in writing, within ${f.reply_days || '48 hours'} of receipt of this notice, as to why appropriate disciplinary action — up to and including termination of employment — should not be initiated against you.`,
      `Please note that failure to respond within the stipulated time shall be construed as having no explanation to offer, and the management shall proceed ex parte on the basis of available records.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Notice Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.misconduct) rows.push(`Matter: ${f.misconduct}`);
      if (f.reply_days) rows.push(`Reply within: ${f.reply_days} of receipt`);
      return rows;
    },
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'employee_code', label: 'Employee Code', type: 'text' },
      { key: 'misconduct', label: 'Matter (short)', type: 'text', required: true, placeholder: 'e.g. Unauthorised absence' },
      { key: 'misconduct_details', label: 'Incident Details', type: 'textarea', required: true, placeholder: 'What happened, when, witnesses…' },
      { key: 'reply_days', label: 'Reply Within', type: 'text', placeholder: 'e.g. 48 hours' },
    ],
  },
  {
    id: 'warning',
    label: 'Warning Letter',
    description: 'First or final written warning',
    icon: FileText,
    subject: (f) => `${f.warning_level || 'Written'} Warning — ${f.misconduct || 'Conduct'}`,
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `This letter serves as a ${f.warning_level || 'written'} warning regarding ${f.misconduct_details || '[describe the issue]'}. Despite prior counselling, the expected improvement has not been observed, and the management views this matter with serious concern.`,
      `You are advised to treat this as a final opportunity to demonstrate sustained improvement in ${f.improvement_area || 'the cited areas'}. Please be informed that any recurrence shall invite stricter disciplinary action, including suspension or termination of employment, without further notice.`,
      `A copy of this warning shall be retained in your personnel file${f.warning_level === 'Final' ? ' and shall be considered during appraisals, promotions and confirmation decisions' : ''}.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Warning Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.warning_level) rows.push(`Level: ${f.warning_level} warning`);
      if (f.improvement_area) rows.push(`Improvement expected in: ${f.improvement_area}`);
      return rows;
    },
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'employee_code', label: 'Employee Code', type: 'text' },
      { key: 'warning_level', label: 'Warning Level', type: 'text', placeholder: 'First / Second / Final' },
      { key: 'misconduct', label: 'Matter (short)', type: 'text', required: true },
      { key: 'misconduct_details', label: 'Incident Details', type: 'textarea', required: true },
      { key: 'improvement_area', label: 'Improvement Expected In', type: 'text', placeholder: 'e.g. attendance and punctuality' },
    ],
  },
  {
    id: 'pip',
    label: 'Performance Improvement Plan',
    description: 'Structured PIP with goals and review',
    icon: FileText,
    subject: () => 'Performance Improvement Plan (PIP)',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `Following your recent performance review, the management has placed you on a Performance Improvement Plan for a period of ${f.pip_duration || '[X weeks]'}, commencing ${f.date || '[Date]'}. This plan is intended to support you in bridging identified performance gaps — it is developmental in intent and consequential in outcome.`,
      `Your improvement goals for the plan period are: ${f.pip_goals || '[list the measurable goals]'}. Progress shall be reviewed ${f.review_frequency || 'fortnightly'} with your reporting manager, and the outcome shall be documented.`,
      `Please be advised that failure to demonstrate the required improvement by the end of the plan period may lead to further action, including reassignment, demotion or separation of employment. We encourage you to seek guidance from your manager and HR throughout this period.`,
    ],
    closing: () => ['Wishing you a successful turnaround.', 'Warm regards,'],
    contextTitle: 'Plan Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.pip_duration) rows.push(`Duration: ${f.pip_duration}`);
      if (f.review_frequency) rows.push(`Reviews: ${f.review_frequency}`);
      return rows;
    },
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'pip_duration', label: 'PIP Duration', type: 'text', required: true, placeholder: 'e.g. 6 weeks' },
      { key: 'pip_goals', label: 'Improvement Goals', type: 'textarea', required: true, placeholder: 'Measurable goals…' },
      { key: 'review_frequency', label: 'Review Frequency', type: 'text', placeholder: 'e.g. fortnightly' },
    ],
  },
  {
    id: 'suspension',
    label: 'Suspension Letter',
    description: 'Pending-enquiry suspension order',
    icon: FileText,
    subject: () => 'Order of Suspension Pending Enquiry',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `With reference to the show cause notice dated ${f.notice_date || '[Date]'} regarding ${f.misconduct || '[matter]'}, and pending completion of the disciplinary enquiry, you are hereby placed under suspension with effect from ${f.suspension_date || '[Date]'} for a period of ${f.suspension_days || '[X days]'}.`,
      `During the period of suspension, you shall be entitled to subsistence allowance as per the applicable standing orders, and you shall not enter the company premises or contact witnesses without prior written permission from the enquiry officer.`,
      `You are directed to cooperate fully with the enquiry proceedings. The final decision shall be communicated upon conclusion of the enquiry.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Suspension Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.suspension_days) rows.push(`Duration: ${f.suspension_days}`);
      if (f.suspension_date) rows.push(`Effective: ${f.suspension_date}`);
      return rows;
    },
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'employee_code', label: 'Employee Code', type: 'text' },
      { key: 'misconduct', label: 'Matter (short)', type: 'text', required: true },
      { key: 'notice_date', label: 'Show Cause Date', type: 'date' },
      { key: 'suspension_date', label: 'Suspension From', type: 'date', required: true },
      { key: 'suspension_days', label: 'Duration', type: 'text', placeholder: 'e.g. 15 days' },
    ],
  },
  {
    id: 'termination',
    label: 'Termination Letter',
    description: 'End employment for cause or restructuring',
    icon: FileText,
    subject: () => 'Termination of Employment',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `We regret to inform you that your employment with ${f.company_name || '[Company]'} as ${f.designation || '[Designation]'} stands terminated with effect from ${f.last_working_day || '[Date]'}${f.termination_reason ? `, on account of ${f.termination_reason}` : ''}.`,
      `You shall be paid ${f.notice_pay || 'salary in lieu of the applicable notice period'}, and your full-and-final settlement, including encashment of accrued leave as applicable, shall be processed within ${f.settlement_days || '30 days'} of your last working day, subject to completion of exit formalities and return of company property.`,
      `We remind you that obligations relating to confidentiality, non-solicitation and return of company assets survive the termination of employment.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Separation Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.notice_pay) rows.push(`Notice pay: ${f.notice_pay}`);
      if (f.settlement_days) rows.push(`Settlement within: ${f.settlement_days} of last working day`);
      return rows;
    },
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'employee_code', label: 'Employee Code', type: 'text' },
      { key: 'last_working_day', label: 'Effective Date', type: 'date', required: true },
      { key: 'termination_reason', label: 'Reason', type: 'textarea', placeholder: 'e.g. continued misconduct despite warnings…' },
      { key: 'notice_pay', label: 'Notice Pay', type: 'text', placeholder: 'e.g. 60 days salary in lieu of notice' },
      { key: 'settlement_days', label: 'Settlement Within', type: 'text', placeholder: 'e.g. 30 days' },
    ],
  },
  {
    id: 'absconding',
    label: 'Absconding Notice',
    description: 'Unauthorised absence / job abandonment',
    icon: FileText,
    subject: () => 'Notice Regarding Unauthorised Absence',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `Our records indicate that you have remained absent from duty without prior sanction or intimation since ${f.absent_since || '[Date]'}, and attempts to reach you at your registered contact details have been unsuccessful. Unauthorised absence of this nature amounts to abandonment of employment.`,
      `You are hereby directed to report to Human Resources, in person or in writing, within ${f.reply_days || '7 days'} of receipt of this notice, along with a satisfactory explanation and supporting evidence for your absence.`,
      `Should you fail to respond within the stipulated time, the management shall presume that you are no longer interested in continued employment and shall proceed with appropriate action, including termination and recovery of applicable dues, as per company policy.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Absence Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.absent_since) rows.push(`Absent since: ${f.absent_since}`);
      if (f.reply_days) rows.push(`Respond within: ${f.reply_days} of receipt`);
      return rows;
    },
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'employee_code', label: 'Employee Code', type: 'text' },
      { key: 'absent_since', label: 'Absent Since', type: 'date', required: true },
      { key: 'reply_days', label: 'Respond Within', type: 'text', placeholder: 'e.g. 7 days' },
    ],
  },
  {
    id: 'promotion',
    label: 'Promotion Letter',
    description: 'Elevation with revised role and pay',
    icon: FileText,
    subject: (f) => `Promotion — ${f.new_designation || 'New Role'}`,
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `On the recommendation of your reporting manager and the leadership team, we are delighted to promote you from ${f.designation || '[Current Role]'} to ${f.new_designation || '[New Role]'}, with effect from ${f.promotion_date || '[Date]'}.`,
      `Your revised annual CTC shall be Rs. ${f.new_salary || '[Amount]'} per annum${f.new_department ? `, and you shall henceforth be part of the ${f.new_department} function` : ''}. This elevation recognises your sustained performance, ownership and conduct.`,
      `All other terms of your employment remain unchanged. We congratulate you and look forward to greater contributions in your enhanced capacity.`,
    ],
    closing: () => ['Heartiest congratulations.', 'Warm regards,'],
    contextTitle: 'Promotion Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.designation && f.new_designation) rows.push(`${f.designation} → ${f.new_designation}`);
      if (f.new_salary) rows.push(`Revised CTC: Rs. ${f.new_salary} per annum`);
      return rows;
    },
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Current Designation', type: 'text', required: true },
      { key: 'new_designation', label: 'New Designation', type: 'text', required: true },
      { key: 'new_department', label: 'New Department', type: 'text' },
      { key: 'new_salary', label: 'Revised CTC (Rs.)', type: 'text', required: true },
      { key: 'promotion_date', label: 'Effective Date', type: 'date', required: true },
    ],
  },
  {
    id: 'transfer',
    label: 'Transfer Letter',
    description: 'Location or department transfer order',
    icon: FileText,
    subject: () => 'Order of Transfer',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `Consequent upon organisational requirements, you are hereby transferred from ${f.current_location || '[Current]'} to ${f.new_location || '[New]'}${f.new_department ? `, and shall henceforth function within the ${f.new_department} team` : ''}, with effect from ${f.transfer_date || '[Date]'}.`,
      `Your designation, compensation and all other terms of employment remain unchanged. You are requested to complete handover of your current responsibilities by ${f.handover_date || 'the effective date'} and report to ${f.reporting_to || 'your new reporting manager'} at the new location.`,
      `Reasonable relocation assistance, as per company policy, shall be extended on submission of bills. Please acknowledge receipt of this order.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Transfer Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.current_location && f.new_location) rows.push(`${f.current_location} → ${f.new_location}`);
      if (f.transfer_date) rows.push(`Effective: ${f.transfer_date}`);
      return rows;
    },
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'current_location', label: 'Current Location', type: 'text', required: true },
      { key: 'new_location', label: 'New Location', type: 'text', required: true },
      { key: 'new_department', label: 'New Department', type: 'text' },
      { key: 'transfer_date', label: 'Effective Date', type: 'date', required: true },
      { key: 'reporting_to', label: 'Report To', type: 'text' },
      { key: 'handover_date', label: 'Handover By', type: 'date' },
    ],
  },
  {
    id: 'resignation_acceptance',
    label: 'Resignation Acceptance',
    description: 'Accept resignation and confirm exit terms',
    icon: FileText,
    subject: () => 'Acceptance of Resignation',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `This is with reference to your resignation dated ${f.resignation_date || '[Date]'}. The management has accepted your resignation, and you shall be relieved from the services of ${f.company_name || '[Company]'} with effect from close of business hours on ${f.last_working_day || '[Date]'}.`,
      `You are requested to complete knowledge transfer and exit formalities, including return of company assets, prior to your last working day. Your full-and-final settlement shall be processed within ${f.settlement_days || '30 days'} thereafter.`,
      `We thank you for your contributions and wish you every success ahead.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Exit Terms',
    context: (f) => {
      const rows: string[] = [];
      if (f.resignation_date) rows.push(`Resigned: ${f.resignation_date}`);
      if (f.last_working_day) rows.push(`Last working day: ${f.last_working_day}`);
      return rows;
    },
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'resignation_date', label: 'Resignation Date', type: 'date', required: true },
      { key: 'last_working_day', label: 'Last Working Day', type: 'date', required: true },
      { key: 'settlement_days', label: 'Settlement Within', type: 'text', placeholder: 'e.g. 30 days' },
    ],
  },
  {
    id: 'fnf',
    label: 'Full & Final Settlement',
    description: 'Dues statement on separation',
    icon: FileText,
    subject: () => 'Full and Final Settlement Statement',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `Consequent upon your separation from ${f.company_name || '[Company]'} with effect from ${f.last_working_day || '[Date]'}, your full-and-final settlement has been computed as follows.`,
      `Earnings payable: ${f.earnings || '[leave encashment, bonus, arrears…]'}. Deductions and recoveries: ${f.deductions || '[notice shortfall, advances, asset recovery…]'}. Net amount payable to you: Rs. ${f.net_payable || '[Amount]'}, to be credited to your registered bank account within ${f.settlement_days || '7 working days'} of this letter.`,
      `Acceptance of this settlement shall constitute full and final discharge of all claims arising from your employment. Please sign and return the duplicate copy as acknowledgement.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Settlement Breakup',
    context: (f) => {
      const rows: string[] = [];
      if (f.earnings) rows.push(`Payable: ${f.earnings}`);
      if (f.deductions) rows.push(`Recoveries: ${f.deductions}`);
      if (f.net_payable) rows.push(`Net payable: Rs. ${f.net_payable}`);
      return rows;
    },
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'employee_code', label: 'Employee Code', type: 'text' },
      { key: 'last_working_day', label: 'Last Working Day', type: 'date', required: true },
      { key: 'earnings', label: 'Earnings Payable', type: 'textarea', placeholder: 'e.g. Leave encashment Rs. 18,000; bonus Rs. 25,000…' },
      { key: 'deductions', label: 'Deductions / Recoveries', type: 'textarea', placeholder: 'e.g. Notice shortfall 12 days; laptop charger…' },
      { key: 'net_payable', label: 'Net Payable (Rs.)', type: 'text', required: true },
      { key: 'settlement_days', label: 'Credit Within', type: 'text', placeholder: 'e.g. 7 working days' },
    ],
  },
  {
    id: 'salary_certificate',
    label: 'Salary Certificate',
    description: 'Proof of employment and pay',
    icon: FileText,
    subject: () => 'Salary Certificate',
    greeting: () => 'To Whom It May Concern,',
    body: (f) => [
      `This is to certify that ${f.employee_name || '[Name]'}, ${f.designation || '[Designation]'} (Employee Code: ${f.employee_code || '[Code]'}) is employed with ${f.company_name || '[Company]'} since ${f.joining_date || '[Date]'}.`,
      `As per our records, the current gross monthly emoluments stand at Rs. ${f.gross_monthly || '[Amount]'}, translating to an annual CTC of Rs. ${f.salary || '[Amount]'}. This certificate is issued on request for ${f.purpose || 'official purposes'}.`,
    ],
    closing: () => ['Sincerely,'],
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Designation', type: 'text', required: true },
      { key: 'employee_code', label: 'Employee Code', type: 'text' },
      { key: 'joining_date', label: 'Date of Joining', type: 'date' },
      { key: 'gross_monthly', label: 'Gross Monthly (Rs.)', type: 'text', required: true },
      { key: 'salary', label: 'Annual CTC (Rs.)', type: 'text', required: true },
      { key: 'purpose', label: 'Purpose', type: 'text', placeholder: 'e.g. home loan application' },
    ],
  },
  {
    id: 'intern_offer',
    label: 'Internship Offer',
    description: 'Offer letter for interns with stipend',
    icon: FileText,
    subject: (f) => `Internship Offer — ${f.designation || 'Intern'}`,
    greeting: (f) => `Dear ${f.employee_name || 'Candidate'},`,
    body: (f) => [
      `We are pleased to offer you an internship as ${f.designation || '[Role]'}${f.department ? ` with the ${f.department} team` : ''} at ${f.company_name || '[Company]'}, for a period of ${f.intern_duration || '[X months]'} commencing ${f.joining_date || '[Date]'}.`,
      `You shall be paid a consolidated stipend of Rs. ${f.stipend || '[Amount]'} per month during the internship. A mentor shall be assigned to guide your learning, and a certificate shall be issued on satisfactory completion.`,
      `Please note that this internship does not constitute an offer of employment. Any absorption shall be subject to a separate evaluation and offer process.`,
    ],
    closing: () => ['We look forward to hosting you.', 'Warm regards,'],
    contextTitle: 'Internship Terms',
    context: (f) => {
      const rows: string[] = [];
      if (f.intern_duration) rows.push(`Duration: ${f.intern_duration}`);
      if (f.stipend) rows.push(`Stipend: Rs. ${f.stipend} per month`);
      return rows;
    },
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Intern Role', type: 'text', required: true },
      { key: 'department', label: 'Department', type: 'text' },
      { key: 'intern_duration', label: 'Duration', type: 'text', required: true, placeholder: 'e.g. 6 months' },
      { key: 'joining_date', label: 'Start Date', type: 'date', required: true },
      { key: 'stipend', label: 'Monthly Stipend (Rs.)', type: 'text', required: true },
    ],
  },
  {
    id: 'intern_completion',
    label: 'Internship Completion',
    description: 'Certificate on successful internship',
    icon: FileText,
    subject: () => 'Certificate of Internship',
    greeting: () => 'To Whom It May Concern,',
    body: (f) => [
      `This is to certify that ${f.employee_name || '[Name]'} has successfully completed an internship as ${f.designation || '[Role]'} at ${f.company_name || '[Company]'}, during the period ${f.joining_date || '[From]'} to ${f.last_working_day || '[To]'}.`,
      `During the internship, the performance was assessed as ${f.conduct || 'good'}, with notable contribution in ${f.responsibilities || 'assigned project work'}. We wish every success in future professional pursuits.`,
    ],
    closing: () => ['Sincerely,'],
    contextTitle: 'Internship Snapshot',
    context: (f) => {
      const rows: string[] = [];
      if (f.responsibilities) rows.push(`Key work: ${f.responsibilities}`);
      return rows;
    },
    fields: [
      ...COMMON_FIELDS,
      { key: 'designation', label: 'Intern Role', type: 'text', required: true },
      { key: 'joining_date', label: 'Start Date', type: 'date', required: true },
      { key: 'last_working_day', label: 'End Date', type: 'date', required: true },
      { key: 'conduct', label: 'Performance', type: 'text', placeholder: 'good' },
      { key: 'responsibilities', label: 'Key Work', type: 'textarea', placeholder: 'e.g. Built the attendance dashboard module…' },
    ],
  },
];

const TEMPLATE_GROUPS: Array<{ title: string; ids: string[] }> = [
  { title: 'Joining', ids: ['offer', 'appointment', 'intern_offer'] },
  { title: 'Growth', ids: ['confirmation', 'appraisal', 'promotion', 'transfer', 'pip'] },
  { title: 'Discipline', ids: ['showcause', 'warning', 'suspension', 'absconding', 'termination'] },
  { title: 'Separation', ids: ['resignation_acceptance', 'relieving', 'experience', 'fnf'] },
  { title: 'Certificates', ids: ['noc', 'salary_certificate', 'intern_completion'] },
];

const Letters = () => {
  const [mounted, setMounted] = useState(false);
  const [templateId, setTemplateId] = useState('offer');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPicker) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPicker(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showPicker]);
  const [fields, setFields] = useState<Record<string, string>>({ date: new Date().toISOString().slice(0, 10) });
  const [copied, setCopied] = useState(false);
  // Letterhead lives in memory only — nothing is saved on this device.
  const [letterhead, setLetterhead] = useState<Record<string, string>>({});

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const template = useMemo(() => TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0], [templateId]);

  const [companyId, setCompanyId] = useState<string>('');
  const [customCompany, setCustomCompany] = useState(false);

  const clearCompanyFields = () => {
    setLetterhead((lh) => ({
      ...lh,
      company_name: '',
      company_address: '',
      company_email: '',
      company_website: '',
      company_logo: '',
    }));
  };

  const setLh = (patch: Record<string, string>) => {
    setLetterhead((lh) => ({ ...lh, ...patch }));
  };



  const { data: companies = [] } = useQuery({
    queryKey: ['companies', 'letters'],
    queryFn: async () => {
      try {
        const res = await api.get('/companies', { params: { active_only: true } });
        const d = res.data;
        return Array.isArray(d) ? d : d?.items || d?.data || [];
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const pickCompany = (id: string) => {
    setCompanyId(id);
    if (!id || id === 'all') {
      setCompanyId('');
      setCustomCompany(false);
      clearCompanyFields();
      return;
    }
    if (id === '__other') {
      setCustomCompany(true);
      // Clear the previously selected company's details so nothing stale remains.
      setLetterhead((lh) => ({
        ...lh,
        company_name: '',
        company_address: '',
        company_email: '',
        company_website: '',
        company_logo: '',
      }));
      return;
    }
    setCustomCompany(false);
    const c = (companies as Record<string, unknown>[]).find((x) => String(x.id) === id);
    if (!c) return;
    const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
    const addrParts = [str(c.address), [str((c as { city?: unknown }).city), str(c.state)].filter(Boolean).join(', '), str(c.pincode)]
      .map((s) => s.trim()).filter(Boolean);
    const v = {
      ...letterhead,
      company_name: str(c.name),
      company_address: addrParts.join(', '),
      company_email: str(c.email),
      company_website: str(c.website),
    };
    setLetterhead(v);
    toast.success('Company address auto-filled');
  };

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', 'letters', employeeSearch],
    queryFn: async () => {
      const res = await api.get('/employees', { params: { search: employeeSearch, limit: 10, status: 'active' } });
      const d = res.data;
      return Array.isArray(d) ? d : d?.items || d?.data || [];
    },
    enabled: showPicker,
    staleTime: 60 * 1000,
  });

  const pickEmployee = async (emp: Employee) => {
    setSelectedEmployee(emp);
    setShowPicker(false);
    setEmployeeSearch('');
    let full: Record<string, unknown> = emp as unknown as Record<string, unknown>;
    try {
      const res = await api.get(`/employees/${emp.id}`);
      const d = res.data;
      full = (d && typeof d === 'object' ? d : emp) as Record<string, unknown>;
    } catch {
      // fall back to the list-row data
    }
    const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
    const dept = full.department;
    const department = typeof dept === 'object' && dept !== null
      ? str((dept as { name?: unknown }).name)
      : str(dept);
    const branch = full.branch as { name?: unknown } | undefined;
    const branches = full.branches as Array<{ name?: unknown }> | undefined;
    const location = str(branch?.name) || (branches?.[0] ? str(branches[0]?.name) : '');
    const salary = (full.baseSalary as number | undefined) ?? (full as { salary?: number }).salary;
    const company = full.company as { name?: unknown } | undefined;

    setFields((f) => ({
      ...f,
      employee_name: personDisplayName(full as never, '') || f.employee_name || '',
      designation: str(full.designation) || f.designation || '',
      department: department || f.department || '',
      employee_code: str(full.employeeCode) || f.employee_code || '',
      joining_date: str(full.joinDate).slice(0, 10) || f.joining_date || '',
      salary: salary != null ? String(salary) : f.salary || '',
      new_salary: salary != null ? String(salary) : f.new_salary || '',
      current_salary: salary != null ? String(salary) : f.current_salary || '',
      location: location || f.location || '',
      address: str(full.currentAddress) || str(full.address) || f.address || '',
      phone: str(full.phone) || f.phone || '',
      email: str(full.email) || f.email || '',
    }));
    setLetterhead((lh: Record<string, string>) => {
      if (lh.company_name || !company?.name) return lh;
      return { ...lh, company_name: str(company.name) };
    });
    toast.success('Employee details auto-filled — review and edit freely');
  };

  const set = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }));

  const clearEmployee = () => {
    setSelectedEmployee(null);
    setEmployeeSearch('');
    setShowPicker(false);
    setFields((f) => ({
      ...f,
      employee_name: '',
      designation: '',
      department: '',
      employee_code: '',
      joining_date: '',
      salary: '',
      new_salary: '',
      current_salary: '',
      location: '',
      address: '',
      phone: '',
      email: '',
    }));
  };

  const merged = useMemo(() => {
    const f = { ...fields };
    if (selectedEmployee && !f.employee_name) f.employee_name = personDisplayName(selectedEmployee as never, '');
    return f;
  }, [fields, selectedEmployee]);

  const contextRows = useMemo(
    () => (template.context ? template.context(merged) : []),
    [template, merged]
  );

  const contactLine = useMemo(() => {
    const parts = [letterhead.company_email, letterhead.company_website]
      .map((s) => (s || '').trim())
      .filter(Boolean);
    return parts.join('  ·  ');
  }, [letterhead]);

  const letterText = useMemo(() => {
    const c = letterhead.company_name || '[Company Name]';
    const lines = [
      c,
      letterhead.company_address || '[Company Address]',
      ...(contactLine ? [contactLine] : []),
      '',
      `Ref: ${merged.ref_no || '-'}`,
      `Date: ${merged.date || '-'}`,
      '',
      `Subject: ${template.subject(merged)}`,
      '',
      template.greeting(merged),
      '',
      ...template.body(merged).flatMap((p) => [p, '']),
      ...(contextRows.length > 0
        ? [`${template.contextTitle || 'Annexure'}:`, ...contextRows.map((r) => `- ${r}`), '']
        : []),
      ...template.closing(merged),
      letterhead.signatory || 'Authorised Signatory',
      c,
    ];
    return lines.join('\n');
  }, [template, merged, letterhead, contextRows, contactLine]);

  const downloadPdf = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 20;
    const width = 170;
    let y = 22;
    if (letterhead.company_logo) {
      try {
        doc.addImage(letterhead.company_logo, 'PNG', 91, y, 28, 28, undefined, 'FAST');
        y += 32;
      } catch {
        // unreadable image — continue without logo
      }
    }
    doc.setFont('times', 'bold');
    doc.setFontSize(17);
    doc.text(letterhead.company_name || 'Company Name', 105, y, { align: 'center' });
    y += 7;
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    if (letterhead.company_address) {
      const addr = doc.splitTextToSize(letterhead.company_address, width);
      doc.text(addr, 105, y, { align: 'center' });
      y += addr.length * 5;
    }
    if (contactLine) {
      const cl = doc.splitTextToSize(contactLine, width);
      doc.text(cl, 105, y, { align: 'center' });
      y += cl.length * 5;
    }
    y += 2;
    doc.setDrawColor(180);
    doc.line(margin, y, margin + width, y);
    y += 8;
    doc.setFontSize(11);
    doc.text(`Ref: ${merged.ref_no || '-'}`, margin, y);
    doc.text(`Date: ${merged.date || '-'}`, margin + width, y, { align: 'right' });
    y += 9;
    doc.setFont('times', 'bold');
    doc.text(doc.splitTextToSize(`Subject: ${template.subject(merged)}`, width), margin, y);
    y += 8;
    doc.setFont('times', 'normal');
    const paras = [template.greeting(merged), ...template.body(merged)];
    paras.forEach((p) => {
      const lines = doc.splitTextToSize(p, width);
      if (y + lines.length * 6 > 275) {
        doc.addPage();
        y = 22;
      }
      doc.text(lines, margin, y);
      y += lines.length * 6 + 4;
    });
    if (contextRows.length > 0) {
      if (y + 20 > 275) {
        doc.addPage();
        y = 22;
      }
      y += 2;
      doc.setFont('times', 'bold');
      doc.text(template.contextTitle || 'Annexure', margin, y);
      y += 7;
      doc.setFont('times', 'normal');
      contextRows.forEach((r) => {
        const lines = doc.splitTextToSize(`•  ${r}`, width - 6);
        if (y + lines.length * 6 > 275) {
          doc.addPage();
          y = 22;
        }
        doc.text(lines, margin + 4, y);
        y += lines.length * 6 + 2;
      });
      y += 4;
    } else {
      y += 4;
    }
    template.closing(merged).forEach((c) => {
      doc.text(c, margin, y);
      y += 6;
    });
    doc.text(letterhead.signatory || 'Authorised Signatory', margin, y + 4);
    doc.save(`${template.id}-letter-${(merged.employee_name || 'employee').replace(/\s+/g, '-').toLowerCase()}.pdf`);
    toast.success('Letter downloaded as PDF');
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(letterText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success('Letter text copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-[var(--background)] animate-page-enter">
      <div className="space-y-6">
      <PageHero
        title="Letters"
        subtitle="Offer, appointment, appraisal, relieving & more — generated in one click"
        icon={FileText}
        accent="indigo"
        breadcrumbs={['Home', 'Employees', 'Letters']}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={copyText}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/15 text-white text-sm font-semibold rounded-xl border border-white/25 hover:bg-white/25 transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy text'}
            </button>
            <button
              onClick={downloadPdf}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-indigo-900 text-sm font-bold rounded-xl hover:bg-indigo-50 transition-colors shadow-md"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-[var(--border-color)] shadow-sm p-4 animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '0ms' }}>
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">1 · Choose template</h3>
            <div className="space-y-4 max-h-[52vh] overflow-auto pr-1">
              {TEMPLATE_GROUPS.map((g) => (
                <div key={g.title}>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">{g.title}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {g.ids.map((id) => TEMPLATES.find((t) => t.id === id)).filter((t): t is Template => !!t).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTemplateId(t.id)}
                        className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                          templateId === t.id
                            ? 'border-[var(--primary-blue)] bg-blue-50/60 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${templateId === t.id ? 'bg-[var(--primary-blue)] text-white' : 'bg-gray-100 text-gray-500'}`}>
                          <t.icon className="w-4 h-4" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-[var(--text-primary)]">{t.label}</span>
                          <span className="block text-xs text-gray-500 mt-0.5">{t.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[var(--border-color)] shadow-sm p-4 animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '100ms' }}>
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">2 · Letterhead</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Company">
                  <SearchableSelect
                    value={companyId}
                    onChange={(v) => pickCompany(String(v))}
                    options={[
                      ...(companies as Record<string, unknown>[]).map((c) => ({ id: c.id as number | string, name: String(c.name || 'Unnamed') })),
                      { id: '__other', name: 'Other (type manually)…' },
                    ]}
                    placeholder="Search company…"
                    showAllOption={false}
                    clearable
                    className="w-full"
                  />
                </FormField>
                <div className="flex flex-col">
                  <span className="block text-sm font-medium text-[var(--text-primary)] mb-1">Logo</span>
                  <div className="h-[42px] flex items-center">
                    <CompactImageUpload
                      value={letterhead.company_logo || ''}
                      onChange={(dataUrl) => setLh({ company_logo: dataUrl })}
                      onClear={() => setLh({ company_logo: '' })}
                      accept="image/png,image/jpeg,image/webp"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">&nbsp;</p>
                </div>
              </div>
              {(customCompany || companyId === '') && (
                <FormField label="Company name">
                  <input value={letterhead.company_name || ''} onChange={(e) => setLh({ company_name: e.target.value })} className={formInputClass} placeholder="Acme Pvt. Ltd." />
                </FormField>
              )}
              <FormField label="Company address">
                <textarea value={letterhead.company_address || ''} onChange={(e) => setLh({ company_address: e.target.value })} className={formTextareaClass} rows={2} placeholder="Street, City, State — PIN" />
              </FormField>
              <FormField label="Signatory title">
                <input value={letterhead.signatory || ''} onChange={(e) => setLh({ signatory: e.target.value })} className={formInputClass} placeholder="Authorised Signatory" />
              </FormField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Company email">
                  <input value={letterhead.company_email || ''} onChange={(e) => setLh({ company_email: e.target.value })} className={formInputClass} placeholder="hr@company.com" />
                </FormField>
                <FormField label="Website">
                  <input value={letterhead.company_website || ''} onChange={(e) => setLh({ company_website: e.target.value })} className={formInputClass} placeholder="https://…" />
                </FormField>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[var(--border-color)] shadow-sm p-4 animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '200ms' }}>
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">3 · Pick employee</h3>
            <div className="relative" ref={pickerRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or code..."
                value={selectedEmployee ? personDisplayName(selectedEmployee as never, '') : employeeSearch}
                onChange={(e) => {
                  setEmployeeSearch(e.target.value);
                  if (selectedEmployee) clearEmployee();
                  else setShowPicker(true);
                }}
                onFocus={() => { if (!selectedEmployee) setShowPicker(true); }}
                readOnly={!!selectedEmployee}
                className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
              />
              {selectedEmployee && (
                <button
                  type="button"
                  onClick={clearEmployee}
                  aria-label="Remove employee"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-600 flex items-center justify-center transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {showPicker && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-auto">
                  {(employees as Employee[]).length === 0 && (
                    <p className="px-4 py-3 text-sm text-gray-400">No matches — keep typing or fill fields manually.</p>
                  )}
                  {(employees as Employee[]).map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => pickEmployee(emp)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between"
                    >
                      <span className="text-sm font-medium text-[var(--text-primary)]">{personDisplayName(emp as never, '')}</span>
                      <span className="text-xs text-gray-400">{(emp as { employeeCode?: string }).employeeCode || `#${emp.id}`}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <FormField label="Designation">
                <input value={fields.designation || ''} onChange={(e) => set('designation', e.target.value)} className={formInputClass} placeholder="e.g. Software Engineer" />
              </FormField>
              <FormField label="Department">
                <input value={fields.department || ''} onChange={(e) => set('department', e.target.value)} className={formInputClass} placeholder="e.g. Engineering" />
              </FormField>
            </div>
            {selectedEmployee && (
              <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                <p className="text-xs font-bold text-emerald-700 mb-2">✓ Auto-filled from employee record</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {[
                    ['Name', fields.employee_name],
                    ['Code', fields.employee_code],
                    ['Designation', fields.designation],
                    ['Department', fields.department],
                    ['Joining', fields.joining_date],
                    ['CTC', fields.salary ? `Rs. ${fields.salary}` : ''],
                    ['Location', fields.location],
                    ['Phone', fields.phone],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="flex gap-1.5">
                      <dt className="text-emerald-600/80 shrink-0">{k}:</dt>
                      <dd className="font-medium text-gray-800 truncate">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-[var(--border-color)] shadow-sm p-4 animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '300ms' }}>
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">4 · Letter details</h3>
            <div className="space-y-3">
              {template.fields.filter((fd) => fd.key !== 'designation' && fd.key !== 'department').map((fd) => (
                <FormField key={fd.key} label={fd.label} required={fd.required}>
                  {fd.type === 'textarea' ? (
                    <textarea value={fields[fd.key] || ''} onChange={(e) => set(fd.key, e.target.value)} className={formTextareaClass} rows={2} placeholder={fd.placeholder} />
                  ) : fd.type === 'date' ? (
                    <DatePicker value={fields[fd.key] || ''} onChange={(v) => set(fd.key, v)} placeholder={fd.placeholder || 'Select date'} />
                  ) : fd.key === 'ref_no' ? (
                    <div className="flex gap-2">
                      <input value={fields[fd.key] || ''} onChange={(e) => set(fd.key, e.target.value)} className={formInputClass} placeholder={fd.placeholder} />
                      <button
                        type="button"
                        onClick={() => {
                          const yr = new Date().getFullYear();
                          const code = template.id.replace(/[^a-z]/gi, '').slice(0, 5).toUpperCase() || 'HR';
                          const seq = Date.now().toString(36).slice(-4).toUpperCase();
                          set('ref_no', `HR/${yr}/${code}/${seq}`);
                        }}
                        className="shrink-0 px-3 py-2 text-xs font-bold text-white bg-[var(--primary-blue)] rounded-xl hover:opacity-90 transition-opacity"
                      >
                        Generate
                      </button>
                    </div>
                  ) : (
                    <input type={fd.type} value={fields[fd.key] || ''} onChange={(e) => set(fd.key, e.target.value)} className={formInputClass} placeholder={fd.placeholder} />
                  )}
                </FormField>
              ))}
            </div>
          </div>

        </div>

        <div className="xl:col-span-3 animate-in fade-in slide-in-from-right-4" style={{ animationDelay: '200ms' }}>
          <div className="sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Live preview</h3>
              <span className="text-xs text-gray-400">A4 · Times · print-ready PDF</span>
            </div>
            <div className="bg-white rounded-2xl border border-[var(--border-color)] shadow-md overflow-hidden">
              <div className="px-10 py-8 font-serif text-[15px] leading-relaxed text-gray-900 max-h-[70vh] overflow-auto">
                {letterhead.company_logo && (
                  <div className="flex justify-center mb-2">
                    <img src={letterhead.company_logo} alt="Company logo" className="h-16 object-contain" />
                  </div>
                )}
                <p className="text-center text-xl font-bold">{letterhead.company_name || 'Company Name'}</p>
                {letterhead.company_address && <p className="text-center text-xs text-gray-500 mt-1">{letterhead.company_address}</p>}
                {contactLine && <p className="text-center text-xs text-gray-500 mt-0.5">{contactLine}</p>}
                <hr className="my-4 border-gray-300" />
                <div className="flex justify-between text-sm">
                  <span>Ref: {merged.ref_no || '-'}</span>
                  <span>Date: {merged.date || '-'}</span>
                </div>
                <p className="font-bold mt-4">Subject: {template.subject(merged)}</p>
                <p className="mt-4">{template.greeting(merged)}</p>
                {template.body(merged).map((p, i) => (
                  <p key={i} className="mt-3 text-justify">{p}</p>
                ))}
                {contextRows.length > 0 && (
                  <div className="mt-5 rounded-lg bg-gray-50 border border-gray-200 p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-gray-700">
                      {template.contextTitle || 'Annexure'}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {contextRows.map((r, i) => (
                        <li key={i} className="text-sm text-gray-700 flex gap-2">
                          <span className="text-gray-400">•</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-6">
                  {template.closing(merged).map((c, i) => (
                    <p key={i}>{c}</p>
                  ))}
                  <p className="mt-1">{letterhead.signatory || 'Authorised Signatory'}</p>
                  <p className="font-bold">{letterhead.company_name || 'Company Name'}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={downloadPdf} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[var(--primary-blue)] text-white text-sm font-bold rounded-xl hover:opacity-90 shadow-md">
                <Download className="w-4 h-4" /> Download PDF
              </button>
              <button onClick={() => window.print()} className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-[var(--border-color)] text-sm font-semibold rounded-xl hover:bg-gray-50">
                <Printer className="w-4 h-4" /> Print
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default Letters;
