import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  FileText, Search, Download, Printer, Copy, Check, X, Pencil,
  Briefcase, ClipboardCheck, Award, TrendingUp, LogOut, FileBadge, Stamp,
  ChevronDown, ChevronRight, Sparkles, ZoomIn, ZoomOut, Users, Building2,
  Eye, HelpCircle,
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
import { personDisplayName } from '../utils/employeeNameUtils';
import type { Employee } from '../types';

/* ──────────────────────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────────────────────── */

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
  helpText: string;
  subject: (f: Record<string, string>) => string;
  greeting: (f: Record<string, string>) => string;
  body: (f: Record<string, string>) => string[];
  closing: (f: Record<string, string>) => string[];
  contextTitle?: string;
  context?: (f: Record<string, string>) => string[];
  fields: FieldDef[];
};

/* ──────────────────────────────────────────────────────────────────────────────
   Template data — IDENTICAL to original (all business logic preserved)
   ────────────────────────────────────────────────────────────────────────────── */

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
    helpText: 'Use this when extending a formal job offer to a selected candidate. Fill in the designation, salary (annual CTC), joining date, and reporting manager. The letter includes probation, notice period, and acceptance deadline terms. Send within 24-48 hours of the verbal offer to secure the candidate.',
    subject: (f) => `Offer of Employment — ${f.designation || 'Position'}`,
    greeting: (f) => `Dear ${f.employee_name || 'Candidate'},`,
    body: (f) => [
      `We are pleased to extend to you this formal offer of employment for the position of ${f.designation || '[Designation]'}${f.department ? ', within the ' + f.department + ' department' : ''}, reporting to ${f.reporting_to || '[Reporting Manager]'}. This offer is made in recognition of the competencies you demonstrated during the selection process and the value you are expected to bring to ${f.company_name || '[Company]'}.`,
      `Your annual cost-to-company (CTC) shall be Rs. ${f.salary || '[Amount]'} per annum, comprising basic salary, house rent allowance, provident fund, gratuity, medical insurance, and such other components as detailed in the enclosed compensation annexure. You shall additionally be eligible for benefits including ${f.probation_months ? 'completion of probation entitling you to' : ''} group personal accident insurance, paid leaves as per company policy, and such other perquisites as may be amended from time to time at the sole discretion of the management.`,
      `Your expected date of joining is ${f.joining_date || '[Date]'} and you shall serve an initial probationary period of ${f.probation_months || '[X]'} months from the date of joining, during which your performance shall be periodically evaluated. Upon successful completion of probation, your employment shall be confirmed in writing by the management. During the probationary period, either party may terminate the engagement by providing ${f.notice_period || '[X]'} days' written notice or salary in lieu thereof.`,
      `This offer is contingent upon the satisfactory completion of pre-employment formalities including verification of educational credentials, previous employment records, identity and address proof, police verification, medical fitness certificate, and such other documents as may be required by the Human Resources department. Any misrepresentation or suppression of material facts shall render this offer void ab initio at the discretion of the management.`,
      `We kindly request you to signify your unconditional acceptance of this offer by signing and returning a duplicate copy of this letter within seven (7) calendar days of receipt. Failure to communicate acceptance within the stipulated period, or the receipt of any subsequent communication declining this offer, shall entitle the management to withdraw this offer without further notice. This offer letter shall not constitute a binding contract until acceptance is received and acknowledged in writing by the company.`,
    ],
    closing: () => ['We warmly welcome you to the team and look forward to a mutually rewarding association.', 'With warm regards,'],
    contextTitle: 'Terms of Employment',
    context: (f) => {
      const rows: string[] = [];
      if (f.reporting_to) rows.push(`Reporting to: ${f.reporting_to}`);
      if (f.probation_months) rows.push(`Probation period: ${f.probation_months} months from the date of joining, extendable by up to ${f.probation_months} months at management's discretion`);
      if (f.notice_period) rows.push(`Notice period: ${f.notice_period} on either side post confirmation; ${Math.round(Number(f.notice_period) / 2) || 30} days during probation`);
      if (f.salary) rows.push(`Annual CTC: Rs. ${f.salary} per annum (detailed breakup enclosed in the annexure)`);
      rows.push(`Working hours: Monday to Friday, 9:30 AM – 6:30 PM IST (45 hours weekly), with one-hour lunch break`);
      rows.push(`Leave entitlement: 15 days paid leave per annum, 10 days sick leave, 10 days casual leave, plus national and company-declared holidays`);
      rows.push(`Statutory benefits: Provident fund and gratuity contributions as per applicable law; group personal accident insurance and group medical insurance from date of joining`);
      rows.push(`Intellectual property: All work product, inventions, and discoveries made during employment shall belong exclusively to the company`);
      rows.push(`Confidentiality: Employee shall not disclose, publish, or use any confidential information during or after employment without written consent`);
      rows.push(`Non-solicitation: For a period of twelve (12) months post-separation, employee shall not solicit or recruit any employee or client of the company`);
      rows.push(`Dispute resolution: Any dispute arising out of or in connection with this employment shall be referred to arbitration in accordance with the Arbitration and Conciliation Act, 1996`);
      rows.push(`Governing law: This offer and the employment relationship shall be governed by the laws of India, subject to the jurisdiction of courts in ${f.location || '[City]'}`);
      return rows;
    },
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
    helpText: 'Issue this after the candidate accepts the offer and before their joining date. This is the legally binding employment contract — it confirms role, CTC, probation, notice period, and all statutory terms. Ensure all fields are accurate as this document has legal standing.',
    subject: (f) => `Letter of Appointment — ${f.employee_name || 'Employee'}`,
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `With reference to your application dated [Date], the subsequent interviews, and your acceptance of the offer of employment, the management is pleased to formally appoint you as ${f.designation || '[Designation]'} in the ${f.department || '[Department]'} department of ${f.company_name || '[Company]'}, with effect from ${f.joining_date || '[Date]'}. You shall report to ${f.reporting_to || '[Reporting Manager]'} at ${f.location || '[Location]'}. This appointment is made subject to the terms and conditions set forth herein and such other policies, standing orders, and amendments as may be promulgated by the company from time to time.`,
      `You shall be entitled to an annual cost-to-company (CTC) of Rs. ${f.salary || '[Amount]'} per annum, structured in accordance with the compensation annexure enclosed hereto. The CTC is inclusive of basic pay, allowances, provident fund contributions, gratuity, superannuation benefits, and such other statutory and company-sponsored benefits as applicable. Your salary shall be subject to applicable deductions including but not limited to provident fund, professional tax, income tax at source (TDS), and any other statutory levies as mandated by law.`,
      `Your initial period of employment shall be probationary for a duration of ${f.probation_months || '[X]'} months from the date of joining, during which period your performance, conduct, and suitability for continued employment shall be assessed. The management reserves the right, at its sole discretion, to extend the probationary period by such additional duration as may be deemed necessary, or to confirm your services upon satisfactory completion of the probationary term. Confirmation shall be communicated in writing and shall be contingent upon clearance from your reporting manager, the HR department, and completion of all induction milestones. Until such confirmation, either party may terminate this engagement by providing ${f.notice_period || '[X]'} days' written notice or salary in lieu thereof.`,
      `Your employment shall be governed by the company's human resource policies, code of conduct, standing orders, and all amendments thereto, copies of which shall be furnished to you separately and shall be deemed to form an integral part of this appointment letter. You shall at all times conduct yourself in a manner consistent with the professional standards expected of employees of the company and shall comply with all lawful directions issued by the management in the discharge of your duties.`,
      `The management reserves the right to transfer your services, at any time, to any of its offices, branches, subsidiaries, affiliates, or client sites, whether in India or abroad, as organisational requirements may necessitate. You acknowledge and agree that such transfers shall be binding and that failure to comply with a transfer order may be treated as misconduct. Upon confirmation, your employment shall be subject to a notice period of ${f.notice_period || '[X]'} days on either side, or salary in lieu of such notice, as per company policy.`,
      ...(f.address ? [`As per our records, your address for official communication is: ${f.address}. Please notify Human Resources in writing of any change thereto within seven (7) days of such change. Failure to maintain updated records may result in correspondence being deemed served upon dispatch.`] : []),
    ],
    closing: () => ['With warm regards,'],
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
    context: (f) => {
      const rows: string[] = [];
      if (f.reporting_to) rows.push(`Reporting to: ${f.reporting_to}`);
      if (f.probation_months) rows.push(`Probation period: ${f.probation_months} months from the date of joining`);
      if (f.notice_period) rows.push(`Notice period: ${f.notice_period} on either side post confirmation`);
      if (f.salary) rows.push(`Annual CTC: Rs. ${f.salary} per annum (detailed breakup enclosed in the annexure)`);
      rows.push(`Transfer: Company reserves right to transfer to any office, branch or client site`);
      rows.push(`Intellectual property created during employment vests in the company`);
      rows.push(`Confidentiality and non-solicitation obligations survive termination`);
      return rows;
    },
  },
  {
    id: 'confirmation',
    label: 'Probation Confirmation',
    description: 'Confirm employment after probation',
    icon: FileBadge,
    helpText: 'Issue when an employee successfully completes their probation period. Fill in the review period, confirmation date, and reviewer remarks. This letter activates enhanced benefits (gratuity eligibility, higher leave, etc.) and extends the notice period to full terms.',
    subject: () => 'Confirmation of Employment',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `We are pleased to inform you that, consequent upon the successful completion of your probationary period of ${f.review_period || '[duration]'}, your services as ${f.designation || '[Designation]'} in the ${f.department || '[Department]'} department of ${f.company_name || '[Company]'} stand formally confirmed with effect from ${f.confirmation_date || '[Date]'}. This confirmation is issued subject to satisfactory compliance with all terms and conditions of your original appointment letter and applicable company policies.`,
      `Your performance during the probationary period has been evaluated by your reporting manager and the Human Resources department, and the management records its appreciation of the contributions made by you. ${f.remarks ? 'In particular, the assessment noted: ' + f.remarks + '. ' : ''}Your conduct, adherence to deadlines, and alignment with organisational values have been found to be consistent with the standards expected of confirmed employees of the company.`,
      `Upon confirmation, you shall henceforth be entitled to all benefits applicable to confirmed employees including enhanced leave entitlements, provident fund employer contribution as per statutory requirements, gratuity eligibility upon completion of five years of continuous service, group insurance coverage, and such other benefits as may be extended from time to time at the discretion of the management. The notice period applicable to your employment shall be ${f.notice_period || '[X]'} days on either side, or salary in lieu thereof, as per company policy.`,
      `We look forward to your continued professional growth, dedication, and sustained contribution to the objectives of ${f.company_name || '[Company]'}. The management is committed to providing you with opportunities for skill development and career advancement, and we encourage you to actively participate in performance review cycles and training programmes. All other terms and conditions of your appointment, as set forth in your original appointment letter, shall remain unaltered unless expressly communicated in writing.`,
    ],
    closing: () => ['Please accept our heartfelt congratulations and best wishes for a rewarding and fulfilling career ahead.'],
    contextTitle: 'Assessment Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.review_period) rows.push(`Review period: ${f.review_period}`);
      if (f.remarks) rows.push(`Reviewer remarks: ${f.remarks}`);
      rows.push(`Status: Probation completed — employment confirmed`);
      rows.push(`Benefits: Enhanced entitlements effective from date of confirmation`);
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
    helpText: 'Issue after completing the annual or semi-annual performance review cycle. Enter the increment percentage, revised CTC, effective date, and rating. The letter serves as official record of the salary revision and should reference the review period.',
    subject: (f) => `Salary Revision — FY ${f.financial_year || '2025-26'}`,
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `With reference to the annual performance review conducted for the financial year ${f.financial_year || '2025-26'}, the management has reviewed your performance across the prescribed evaluation parameters and is pleased to communicate its decision regarding your compensation revision. The review encompassed your key performance indicators, behavioural competencies, project deliverables, and overall contribution to the departmental and organisational objectives during the review cycle.`,
      `In recognition of your performance, the management has approved an increment of ${f.increment_pct || '[X]'}%, effective ${f.effective_date || '[Date]'}. Your revised annual cost-to-company (CTC) shall accordingly be Rs. ${f.new_salary || '[Amount]'} per annum, the detailed breakup of which is enclosed in the compensation annexure hereto. This revision shall be reflected in your salary disbursement from the month following the effective date, and any arrears payable shall be credited to your registered bank account in accordance with company practice.`,
      `Your overall performance rating for the review period stands at ${f.rating || '[Rating]'}. ${f.remarks ? 'The assessment noted the following: ' + f.remarks + '. ' : ''}The management acknowledges your specific contributions including consistency in meeting deliverables, collaboration with cross-functional teams, and adherence to quality standards. This revision reflects the organisation's confidence in your capabilities and its commitment to rewarding merit.`,
      `As you enter the next performance cycle, the management expects sustained improvement and continued alignment with organisational goals. You are encouraged to discuss career development objectives with your reporting manager and participate in the learning and development programmes offered by the company. Future revisions shall be contingent upon performance in the subsequent review cycles and prevailing business conditions.`,
    ],
    closing: () => ['Best wishes for continued success and growth.'],
    contextTitle: 'Performance Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.rating) rows.push(`Overall rating: ${f.rating}`);
      if (f.financial_year) rows.push(`Review year: ${f.financial_year}`);
      if (f.remarks) rows.push(`Reviewer remarks: ${f.remarks}`);
      if (f.increment_pct) rows.push(`Increment approved: ${f.increment_pct}%`);
      if (f.new_salary) rows.push(`Revised CTC: Rs. ${f.new_salary} per annum`);
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
    helpText: 'Issue on or after the employee\'s last working day, once all exit formalities (asset return, clearance, FnF) are complete. This is a critical document for the employee\'s next employer. Include clearance notes and notice period served.',
    subject: () => 'Relieving Letter',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `This is to formally confirm that ${f.employee_name || '[Name]'}, ${f.designation || '[Designation]'} (Employee Code: ${f.employee_code || '[Code]'}) stands relieved from the services of ${f.company_name || '[Company]'} with effect from the close of business hours on ${f.last_working_day || '[Date]'}. This relieving is issued in accordance with the terms of your resignation${f.notice_served ? ', noting that the notice period served was ' + f.notice_served : ''}.`,
      `All exit formalities have been duly completed, including but not limited to departmental clearance, handover of responsibilities, return of company property (identity card, laptop, access cards, library books, and any other company assets), revocation of system access and email credentials, and full-and-final settlement of all monetary dues. ${f.clearance_notes ? 'The following clearances have been recorded: ' + f.clearance_notes + '. ' : ''}We confirm that no dues remain outstanding on either side as of the aforementioned date.`,
      `We acknowledge and appreciate the contributions made by you during your tenure with ${f.company_name || '[Company]'} and wish you every success in your future professional endeavours. The company retains no obligation towards you beyond the date of this relieving, save and except for any obligations that survive termination as stipulated in your appointment letter or applicable policies.`,
    ],
    closing: () => ['With warm regards,'],
    contextTitle: 'Separation Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.notice_served) rows.push(`Notice period served: ${f.notice_served}`);
      if (f.clearance_notes) rows.push(`Clearance: ${f.clearance_notes}`);
      rows.push(`All company property returned and access revoked`);
      rows.push(`Full-and-final settlement completed`);
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
    helpText: 'Issue upon request for visa applications, background verification, or new employment. Certifies the employee\'s tenure, designation, and conduct. Include key responsibilities and department for a comprehensive service record.',
    subject: () => 'To Whom It May Concern — Service Certificate',
    greeting: () => 'To Whom It May Concern,',
    body: (f) => [
      `This is to certify that ${f.employee_name || '[Name]'}, holding the designation of ${f.designation || '[Designation]'} (Employee Code: ${f.employee_code || '[Code]'}), was employed with ${f.company_name || '[Company]'} for the period from ${f.joining_date || '[From]'} to ${f.last_working_day || '[To]'}, a total continuous tenure of [duration]. During this period, ${f.employee_name || 'the individual'} was assigned to the ${f.department || '[Department]'} department and ${f.responsibilities ? 'was responsible for ' + f.responsibilities + '.' : 'discharged the duties and responsibilities assigned to the role.'}`,
      `Throughout the tenure of employment, the conduct and performance of ${f.employee_name || 'the individual'} were assessed as ${f.conduct || 'entirely satisfactory'}. ${f.employee_name || 'The individual'} demonstrated professional competence, reliability, and adherence to organisational values. No disciplinary proceedings were initiated or pending against ${f.employee_name || 'the individual'} during the said period, and all statutory and internal compliance requirements were met.`,
      `We have no hesitation in commending ${f.employee_name || 'the individual'} to prospective employers and wish every success in all future professional assignments. This certificate is issued upon request without any admission of liability and without prejudice to any rights or obligations of either party under the employment contract or applicable law. The contents herein are based on records available with the company as on the date of issuance.`,
    ],
    closing: () => ['Issued on request, without prejudice to either party\'s rights.', 'Sincerely,'],
    contextTitle: 'Role Snapshot',
    context: (f) => {
      const rows: string[] = [];
      if (f.responsibilities) rows.push(`Key responsibilities: ${f.responsibilities}`);
      if (f.department) rows.push(`Department: ${f.department}`);
      rows.push(`Conduct: ${f.conduct || 'Satisfactory'}`);
      return rows;
    },
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
    helpText: 'Issue when an employee needs company clearance for a visa application, bank loan, or higher education. Specify the exact purpose and validity period. The NOC is purpose-specific — a separate certificate is needed for each different purpose.',
    subject: () => 'No Objection Certificate',
    greeting: () => 'To Whom It May Concern,',
    body: (f) => [
      `This is to certify that ${f.employee_name || '[Name]'}, ${f.designation || '[Designation]'} (Employee Code: ${f.employee_code || '[Code]'}), is presently employed with ${f.company_name || '[Company]'} in the ${f.department || '[Department]'} department, having joined on ${f.joining_date || '[Date]'} on a ${f.probation_months ? f.probation_months + '-month probationary basis' : 'permanent basis'}. As on the date of this certificate, the employee is actively engaged in duties assigned by the management and is in good standing with the organisation.`,
      `At the request of the employee, and subject to verification of the stated purpose, the management hereby confirms that it has no objection to the employee ${f.purpose || 'applying for a visa / loan / higher studies'}, as declared in the employee's request dated ${f.date || '[Date]'}. This No Objection Certificate is issued solely and exclusively for the specific purpose aforementioned and shall not be deemed or construed as a commitment, undertaking, or representation of any kind whatsoever for any other purpose, jurisdiction, or authority.`,
      `This certificate is valid for a period of ${f.validity_days || '[X]'} days from the date of issuance and shall lapse automatically upon expiry unless renewed in writing by the authorised signatory. The contents herein are based on records available with the company and are subject to the employee's continued compliance with the terms of employment. The company reserves the right to withdraw or amend this certificate in the event of material change in circumstances, including but not limited to separation, disciplinary proceedings, or identification of discrepancies in the employee's declaration.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Validity & Limitations',
    context: (f) => {
      const rows: string[] = [];
      if (f.validity_days) rows.push(`This certificate is valid for ${f.validity_days} days from the date of issue`);
      if (f.purpose) rows.push(`Issued for: ${f.purpose}`);
      rows.push(`Not valid for any purpose other than the stated above`);
      rows.push(`Subject to employee's continued compliance with terms of employment`);
      return rows;
    },
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
    helpText: 'Issue before initiating any disciplinary action — this is a mandatory step under natural justice. Describe the misconduct factually, set a reply deadline (typically 24-72 hours), and warn that non-response equals no defence. Keep the tone neutral — this is not a finding of guilt.',
    subject: (f) => `Show Cause Notice — ${f.misconduct || 'Misconduct'}`,
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `It has been brought to the notice of the management that ${f.misconduct_details || '[describe the act of misconduct, with dates]'}. The matter has been duly investigated and the preliminary findings indicate conduct that, if substantiated upon inquiry, constitutes a material violation of the company's code of conduct, standing orders, and the terms of your employment. The management is therefore obligated to afford you an opportunity to be heard before any adverse finding is recorded or disciplinary action is initiated, in accordance with the principles of natural justice.`,
      `You are hereby required to show cause, in writing, within ${f.reply_days || '48 hours'} of receipt of this notice, as to why appropriate disciplinary action — up to and including termination of employment — should not be initiated against you in respect of the matter specified above. Your written explanation shall set out in detail the facts, circumstances, and any mitigating factors that you wish the management to consider, and shall be supported by such documentary evidence as you may deem relevant.`,
      `Please note that failure to furnish a reply within the stipulated time shall be construed as having no explanation to offer, and the management shall proceed to take such action as it may deem fit on the basis of available records and witness statements, ex parte and without further reference to you. You shall further be informed of the date and time of any domestic enquiry that may be convened, at which you shall have the right to present your defence and examine witnesses.`,
      `This notice is issued without prejudice to any other rights or remedies available to the management under law, the terms of your employment, and applicable company policies. The issuance of this notice does not by itself constitute a finding of guilt or a precursor to any particular outcome; the same shall be determined upon conclusion of the enquiry process in accordance with established procedures.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Notice Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.misconduct) rows.push(`Matter: ${f.misconduct}`);
      if (f.reply_days) rows.push(`Reply required within: ${f.reply_days} of receipt of this notice`);
      rows.push(`Non-response shall be treated as having no defence to offer`);
      rows.push(`Right to be heard: Enquiry proceedings shall be convened if explanation is unsatisfactory`);
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
    helpText: 'Issue after reviewing the employee\'s response to a show cause notice (or after an enquiry). Specify the warning level (First / Second / Final) and the improvement area. A final warning should explicitly state consequences. Retain a copy in the personnel file.',
    subject: (f) => `${f.warning_level || 'Written'} Warning — ${f.misconduct || 'Conduct'}`,
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `With reference to the show cause notice issued to you on [Show Cause Date] regarding ${f.misconduct_details || '[describe the issue]'} and the subsequent enquiry and/or your written explanation dated [Reply Date], the management has carefully considered the matter and finds that your conduct constituted a violation of the company's code of conduct and applicable standing orders. Accordingly, the management has decided to impose upon you a ${f.warning_level || 'written'} warning for the said misconduct, which shall be placed on record in your personnel file.`,
      `This ${f.warning_level || 'written'} warning is issued to formally place on record the management's expectation of sustained and demonstrable improvement in ${f.improvement_area || 'the cited areas'} with immediate effect. You are hereby advised that any recurrence of similar misconduct, or any further breach of the company's policies, standing orders, or code of conduct, shall invite progressively stricter disciplinary action including but not limited to suspension, demotion, transfer, or termination of employment, without further warning or notice.`,
      `A copy of this warning shall be retained in your personnel file and shall form part of your permanent employment record. ${f.warning_level === 'Final' ? 'As this constitutes a final warning, it shall be taken into consideration during future appraisals, promotions, confirmation decisions, and any other employment-related assessments. Repeated violations following a final warning may result in summary termination of employment in accordance with applicable standing orders.' : 'This warning shall be taken into consideration during future appraisals and employment-related assessments.'}`,
      `You are expected to acknowledge receipt of this warning in writing and to ensure immediate and sustained compliance with all applicable policies and standards. The management remains available to discuss any concerns you may have regarding the expectations outlined herein and encourages you to seek guidance from your reporting manager and the Human Resources department for your professional development.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Warning Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.warning_level) rows.push(`Level: ${f.warning_level} warning`);
      if (f.misconduct) rows.push(`Misconduct: ${f.misconduct}`);
      if (f.improvement_area) rows.push(`Improvement expected in: ${f.improvement_area}`);
      rows.push(`Consequences of recurrence: Escalating disciplinary action up to and including termination`);
      rows.push(`Record: This warning shall be retained in the employee's personnel file`);
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
    helpText: 'Issue when an employee\'s performance consistently falls below expectations. Define clear, measurable goals and a realistic duration (typically 4-12 weeks). Specify review frequency. The PIP should be developmental in intent — document the support you will provide.',
    subject: () => 'Performance Improvement Plan (PIP)',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `Following your performance review conducted on [Review Date], the management has identified certain areas where your performance has fallen below the standards expected for your role as ${f.designation || '[Designation]'}. In order to provide you with a structured opportunity to demonstrate improvement, the management has placed you on a Performance Improvement Plan (PIP) for a period of ${f.pip_duration || '[X weeks]'}, commencing ${f.date || '[Date]'}. This plan is developmental in intent and consequential in outcome, and is issued in accordance with the company's performance management policy and applicable standing orders.`,
      `The specific improvement goals prescribed for the duration of this PIP are: ${f.pip_goals || '[list the measurable goals]'}. Each goal shall be assessed against the defined metrics and benchmarks as agreed between you and your reporting manager. Progress shall be reviewed ${f.review_frequency || 'fortnightly'} at scheduled meetings with your reporting manager, during which your progress shall be documented and discussed. The minutes of each review meeting shall be signed by both parties and placed on record.`,
      `During the PIP period, the company shall make available to you such support as may be reasonably required, including but not limited to mentoring by your reporting manager, access to training and development resources, periodic one-on-one feedback sessions with the HR department, and any other intervention that may be deemed appropriate to facilitate your improvement. You are expected to actively participate in all scheduled reviews and to demonstrate genuine and sustained effort towards achieving the prescribed goals.`,
      `Please be advised that failure to demonstrate the required level of improvement by the end of the plan period, or failure to participate actively in the review process, may result in further disciplinary action including reassignment to an alternative role, demotion to a lower grade, or separation of employment, in accordance with applicable standing orders and company policy. The management reserves the right to modify, extend, or conclude the PIP at its discretion based on periodic assessment of your progress. We encourage you to engage fully with this process and to seek guidance from your manager and HR throughout the plan period.`,
    ],
    closing: () => ['We wish you a successful turnaround and look forward to positive outcomes.', 'With warm regards,'],
    contextTitle: 'Plan Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.pip_duration) rows.push(`Duration: ${f.pip_duration}`);
      if (f.review_frequency) rows.push(`Reviews: ${f.review_frequency}`);
      if (f.pip_goals) rows.push(`Goals: ${f.pip_goals}`);
      rows.push(`Support available: Manager mentoring, HR feedback sessions, training resources`);
      rows.push(`Consequences of non-improvement: Reassignment, demotion, or separation`);
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
    helpText: 'Issue when an employee needs to be suspended pending a domestic enquiry (typically for serious misconduct). Specify the suspension duration, restrict access to premises and colleagues, and mention subsistence allowance. This is a severe step — ensure legal review.',
    subject: () => 'Order of Suspension Pending Enquiry',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `With reference to the show cause notice dated ${f.notice_date || '[Date]'} issued to you regarding ${f.misconduct || '[matter]'}, and pending the completion and outcome of the domestic enquiry proceedings in respect thereof, you are hereby placed under suspension with effect from ${f.suspension_date || '[Date]'} for a period of ${f.suspension_days || '[X days]'}. This order of suspension is issued in accordance with the applicable standing orders, the company's disciplinary policy, and such other regulations as may be applicable to your employment.`,
      `During the period of suspension, you shall be entitled to receive a subsistence allowance as determined in accordance with the applicable standing orders and statutory provisions, subject to such deductions as may be prescribed by law. You are hereby directed not to enter the company premises, access company systems, or contact any employee, client, vendor, or witness connected with the enquiry proceedings, whether directly or indirectly, without the prior written permission of the enquiry officer. Any breach of these restrictions shall be treated as a separate act of misconduct and may attract further disciplinary consequences.`,
      `You are directed to cooperate fully and in good faith with the enquiry proceedings, including attendance at all hearings scheduled by the enquiry officer, production of documents as may be called for, and examination of witnesses as may be necessary. Failure to cooperate, or deliberate evasion of enquiry proceedings, shall be treated as insubordination and may result in an adverse inference being drawn against you. You shall further ensure that you remain available at your registered contact details and inform the company of any change of address or contact information during the suspension period.`,
      `The enquiry proceedings shall be concluded as expeditiously as possible in accordance with the principles of natural justice, and the final decision of the management shall be communicated to you in writing upon conclusion of the enquiry. The suspension period may be extended if the enquiry cannot be concluded within the stipulated duration, in accordance with applicable standing orders. This suspension order is without prejudice to any other rights or remedies available to the management under law, the terms of your employment, or applicable company policies.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Suspension Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.suspension_days) rows.push(`Duration: ${f.suspension_days}`);
      if (f.suspension_date) rows.push(`Effective from: ${f.suspension_date}`);
      if (f.notice_date) rows.push(`Show cause notice dated: ${f.notice_date}`);
      rows.push(`Subsistence allowance: As per applicable standing orders`);
      rows.push(`Restrictions: No entry to premises, no contact with witnesses or colleagues`);
      rows.push(`Enquiry: Shall be concluded and decision communicated in writing`);
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
    helpText: 'Issue as the final step in disciplinary proceedings or for restructuring/downsizing. Specify the reason, notice pay details, and settlement timeline. Ensure due process has been followed (show cause → enquiry → opportunity of hearing). Legal review is strongly recommended.',
    subject: () => 'Termination of Employment',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `We regret to inform you that, upon due consideration of all relevant circumstances, the management has found it necessary to terminate your employment with ${f.company_name || '[Company]'} as ${f.designation || '[Designation]'} (Employee Code: ${f.employee_code || '[Code]'}), with effect from ${f.last_working_day || '[Date]'}${f.termination_reason ? ', on account of ' + f.termination_reason : ''}. This termination is issued in accordance with the applicable standing orders, the terms of your appointment letter, and such other policies and regulations as may govern your employment. The management has arrived at this decision after affording you due process and opportunity of hearing as required under applicable law and company policy.`,
      `In settlement of your dues, you shall be paid ${f.notice_pay || 'salary in lieu of the applicable notice period'}, less any statutory deductions as applicable. Your full-and-final settlement, including encashment of accrued and unused earned leaves as per company policy, any outstanding salary dues, bonus or incentive payments as applicable, and such other amounts as may be payable, shall be computed and processed within ${f.settlement_days || '30 days'} of your last working day, subject to completion of all exit formalities and return of company property. An itemised statement of settlement shall be furnished to you upon processing.`,
      `You are hereby directed to return all company property in your possession on or before your last working day, including but not limited to identity card, laptop, mobile phone, access cards, security tokens, documents, data, keys, and any other company assets. Your access to company systems, email, and premises shall be revoked with effect from the close of business on your last working day. Any company property not returned shall be deducted from your settlement dues, and the company reserves the right to initiate recovery proceedings for any shortfall.`,
      `You acknowledge and agree that the following obligations shall survive the termination of your employment and shall continue to bind you: (a) confidentiality of proprietary information, trade secrets, and business data of the company and its clients; (b) non-solicitation of employees, clients, and business partners of the company for a period of [X months] from the date of termination; (c) non-compete obligations, if any, as stipulated in your employment contract; (d) return of all intellectual property and work product created during the course of your employment. Any breach of these surviving obligations may entitle the company to seek injunctive relief and damages as permitted by law.`,
      `For any queries relating to your settlement or exit formalities, you may contact the Human Resources department at [HR Contact Details]. We acknowledge your contributions during your tenure with the company and, notwithstanding the circumstances of separation, wish you well in your future endeavours.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Separation Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.notice_pay) rows.push(`Notice pay: ${f.notice_pay}`);
      if (f.settlement_days) rows.push(`Settlement within: ${f.settlement_days} of last working day`);
      rows.push(`Return of company property: Mandatory on or before last working day`);
      rows.push(`Surviving obligations: Confidentiality, non-solicitation, non-compete`);
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
    helpText: 'Issue when an employee has been absent without leave or communication for an extended period. Send via registered post / email with read receipt. Set a final deadline (typically 7-15 days) and warn that non-response will be treated as job abandonment. Document all contact attempts.',
    subject: () => 'Notice Regarding Unauthorised Absence',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `Our records indicate that you have remained absent from duty without prior sanction, approval, or intimation since ${f.absent_since || '[Date]'} — a continuous period of unauthorised absence of [duration] working days as on the date of this notice. Multiple attempts to contact you at your registered mobile number, email address, and residential address have been unsuccessful. Such prolonged unauthorised absence, devoid of any communication or reasonable explanation, constitutes a serious breach of the company's attendance policy and standing orders, and may amount to deemed abandonment of employment.`,
      `You are hereby directed to report to the Human Resources department of ${f.company_name || '[Company]'}, either in person or in writing, within ${f.reply_days || '7 days'} of receipt of this notice, along with a satisfactory written explanation and supporting documentary evidence (including medical certificates, if applicable) for your unauthorised absence. Your explanation must address the specific reasons for your absence, the steps taken to inform the management, and the circumstances that prevented you from fulfilling your attendance obligations.`,
      `Please note that failure to respond within the stipulated time, or failure to furnish a satisfactory explanation with supporting evidence, shall be construed as an admission that you have no defence to offer and that you have voluntarily abandoned your employment. The management shall in such event be entitled to presume that you are no longer interested in continued employment and shall proceed with appropriate action, including formal termination of your services, recovery of any outstanding dues (including salary overpaid, advances, or company property in your possession), and such other action as may be deemed necessary in accordance with company policy and applicable law.`,
      `This notice is issued without prejudice to any other rights or remedies available to the management under the terms of your employment, standing orders, applicable labour laws, or any other statutory or contractual provisions. The issuance of this notice does not by itself constitute termination of your employment; the same shall be determined upon expiry of the stipulated response period or upon completion of any further enquiry as may be deemed necessary by the management.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Absence Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.absent_since) rows.push(`Absent since: ${f.absent_since}`);
      if (f.reply_days) rows.push(`Respond within: ${f.reply_days} of receipt of this notice`);
      rows.push(`Non-response: Treated as voluntary abandonment of employment`);
      rows.push(`Consequences: Termination and recovery of applicable dues`);
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
    helpText: 'Issue when promoting an employee to a higher role. Include current and new designation, revised CTC, effective date, and new department (if applicable). Mention the key achievements that led to the promotion. This is a morale-boosting document — make it celebratory.',
    subject: (f) => `Promotion — ${f.new_designation || 'New Role'}`,
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `On the recommendation of your reporting manager and the leadership team, and subject to approval by the competent authority, we are delighted to promote you from ${f.designation || '[Current Role]'} to ${f.new_designation || '[New Role]'}, with effect from ${f.promotion_date || '[Date]'}. ${f.new_department ? 'In connection with this elevation, you shall henceforth be assigned to the ' + f.new_department + ' department.' : ''} This promotion is a recognition of your consistent performance, demonstrated leadership qualities, ownership of responsibilities, and alignment with the values and objectives of ${f.company_name || '[Company]'}.`,
      `Your revised annual cost-to-company (CTC) shall be Rs. ${f.new_salary || '[Amount]'} per annum, the detailed breakup of which is enclosed in the compensation annexure. This revised compensation supersedes your previous CTC with effect from the date of promotion, and any differential amount payable shall be computed and credited to your registered bank account in the next salary disbursement cycle, subject to applicable statutory deductions. You shall also be eligible for benefits commensurate with your new grade as per company policy.`,
      `This promotion recognises your specific achievements including ${f.remarks || '[key contributions and accomplishments]'}, your ability to lead and mentor team members, your consistent delivery of results against targets, and your demonstrated commitment to professional excellence. The management acknowledges the value you have added to your team and the organisation, and considers this elevation well-deserved on the strength of your performance track record.`,
      `In your enhanced capacity, you shall be expected to assume the responsibilities and duties associated with the new designation, including ${f.new_designation ? 'leadership of ' + f.new_designation + '-level initiatives' : 'elevated functional and strategic responsibilities'}, mentoring of junior team members, and contribution to departmental planning and goal-setting. The management shall provide you with such support, training, and resources as may be necessary to facilitate a smooth transition. All other terms and conditions of your employment, including notice period, transfer clause, and confidentiality obligations, shall remain unchanged unless expressly communicated in writing.`,
    ],
    closing: () => ['Heartfelt congratulations on this well-deserved recognition.', 'Warm regards,'],
    contextTitle: 'Promotion Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.designation && f.new_designation) rows.push(`Promotion: ${f.designation} → ${f.new_designation}`);
      if (f.new_salary) rows.push(`Revised CTC: Rs. ${f.new_salary} per annum`);
      if (f.promotion_date) rows.push(`Effective from: ${f.promotion_date}`);
      if (f.new_department) rows.push(`New department: ${f.new_department}`);
      if (f.remarks) rows.push(`Key achievements: ${f.remarks}`);
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
    helpText: 'Issue when transferring an employee to a different location or department. Include current and new location, new department (if changing), reporting manager, and handover deadline. Mention relocation assistance if applicable. Employee must acknowledge receipt within 3 working days.',
    subject: () => 'Order of Transfer',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `Consequent upon organisational requirements, operational exigencies, and in the interest of the company, the management has decided to transfer your services from ${f.current_location || '[Current Location]'} to ${f.new_location || '[New Location]'}${f.new_department ? ', and you shall henceforth function within the ' + f.new_department + ' department' : ''}, with effect from ${f.transfer_date || '[Date]'}. This transfer order is issued in accordance with the applicable standing orders, the terms of your appointment letter, and the transfer clause contained therein, which you acknowledged at the time of your appointment.`,
      `You are directed to complete the handover of all your current responsibilities, projects, pending assignments, and documentation to your designated successor or such other person as may be nominated by your reporting manager, on or before ${f.handover_date || 'the effective date of transfer'}. Upon completion of handover, you shall report to ${f.reporting_to || 'your new reporting manager'} at the new location and assume the duties and responsibilities as may be assigned to you. You shall ensure a smooth and orderly transition with minimal disruption to ongoing operations.`,
      `Your designation, compensation (CTC), and all other terms and conditions of your employment shall remain unchanged upon transfer. The company shall extend reasonable relocation assistance, as per the prevailing company policy, to facilitate your transition to the new location. Such assistance shall include reimbursement of travel expenses, temporary accommodation (if applicable), and such other support as may be prescribed under the relocation policy, subject to submission of valid receipts and bills in accordance with the prescribed procedure.`,
      `The management acknowledges that a transfer involves personal disruption and appreciates your understanding and cooperation in this regard. The company shall make available to you such information and support as may be required to ensure a seamless transition, including introduction to the new team, familiarisation with local facilities, and any other administrative assistance. You are expected to acknowledge receipt of this transfer order in writing within three (3) working days and to confirm your compliance with the handover and reporting timeline specified herein.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Transfer Summary',
    context: (f) => {
      const rows: string[] = [];
      if (f.current_location && f.new_location) rows.push(`Transfer: ${f.current_location} → ${f.new_location}`);
      if (f.transfer_date) rows.push(`Effective from: ${f.transfer_date}`);
      if (f.handover_date) rows.push(`Handover by: ${f.handover_date}`);
      if (f.reporting_to) rows.push(`Report to: ${f.reporting_to}`);
      rows.push(`Compensation and terms: Unchanged`);
      rows.push(`Relocation assistance: As per company policy`);
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
    helpText: 'Issue after receiving an employee\'s resignation letter. Confirm the last working day, settlement timeline, and exit formalities required (knowledge transfer, asset return, clearance). Include a reminder of surviving obligations (confidentiality, non-solicitation).',
    subject: () => 'Acceptance of Resignation',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `This is with reference to your resignation letter dated ${f.resignation_date || '[Date]'}, submitted to the Human Resources department. After due consideration of your request, the management has accepted your resignation, and you shall be relieved from the services of ${f.company_name || '[Company]'} with effect from the close of business hours on ${f.last_working_day || '[Date]'}. This acceptance is subject to completion of all applicable notice period requirements and exit formalities as prescribed under company policy.`,
      `You are directed to complete a thorough and orderly knowledge transfer of all your responsibilities, projects, client relationships, pending assignments, and documentation to your designated successor or such other person as may be nominated by your reporting manager, prior to your last working day. You shall further complete all exit formalities including return of company property (identity card, laptop, mobile phone, access cards, documents, and any other company assets), revocation of system access and email credentials, and settlement of any outstanding dues. An exit clearance form, duly signed by all relevant departmental heads, shall be submitted to the Human Resources department on or before your last working day.`,
      `Your full-and-final settlement, including encashment of accrued and unused earned leaves, any outstanding salary dues, bonus or incentive payments as applicable, and deductions for any notice shortfall (if applicable) or unrecovered advances, shall be computed and processed within ${f.settlement_days || '30 days'} of your last working day, subject to receipt of the completed exit clearance form. An itemised statement of settlement shall be furnished to you upon processing, and the net payable amount shall be credited to your registered bank account.`,
      `We acknowledge and appreciate the contributions made by you during your tenure with ${f.company_name || '[Company]'} and extend our sincere wishes for your continued success and growth in your future professional endeavours. You are reminded that obligations relating to confidentiality, non-solicitation, and return of company intellectual property, as stipulated in your appointment letter and applicable policies, shall survive the termination of your employment and shall continue to bind you.`,
    ],
    closing: () => ['With warm regards,'],
    contextTitle: 'Exit Terms',
    context: (f) => {
      const rows: string[] = [];
      if (f.resignation_date) rows.push(`Resignation dated: ${f.resignation_date}`);
      if (f.last_working_day) rows.push(`Last working day: ${f.last_working_day}`);
      rows.push(`Exit formalities: Knowledge transfer, asset return, clearance required`);
      rows.push(`Settlement: Full-and-final within ${f.settlement_days || '30 days'} of last working day`);
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
    helpText: 'Issue after computing all dues on separation. List earnings (leave encashment, bonus, salary arrears) and deductions (notice shortfall, asset recovery, advances). Specify the net payable amount and credit timeline. Employee must sign the duplicate copy to acknowledge.',
    subject: () => 'Full and Final Settlement Statement',
    greeting: (f) => `Dear ${f.employee_name || 'Employee'},`,
    body: (f) => [
      `Consequent upon your separation from ${f.company_name || '[Company]'} with effect from ${f.last_working_day || '[Date]'}, and in accordance with the company's exit policy and applicable provisions of your appointment letter, your full-and-final settlement has been duly computed. This statement reflects all amounts payable to you by the company and all amounts recoverable from you, determined on the basis of records available as on the date of computation. We enclose herewith the detailed settlement statement for your review and records.`,
      `The earnings payable to you are as follows: ${f.earnings || '[leave encashment for [X] accumulated earned leaves at daily rate of Rs. [amount]; performance bonus for [period] at Rs. [amount]; salary arrears for [period] at Rs. [amount]; gratuity as applicable]'}, as itemised in the enclosed annexure. All earnings have been computed in accordance with the terms of your appointment letter, applicable company policies, and statutory provisions, including the Payment of Gratuity Act, 1972, where applicable.`,
      `The deductions and recoveries applied against your settlement are: ${f.deductions || '[notice period shortfall of [X] days at daily rate of Rs. [amount]; outstanding salary advance of Rs. [amount]; recovery of company assets (laptop model [X] valued at Rs. [amount], mobile phone valued at Rs. [amount]); any other recoverable amounts]'}, as detailed in the enclosed annexure. All deductions have been computed in accordance with the terms of your employment, applicable standing orders, and such authorisations as may have been furnished by you during the course of your employment.`,
      `The net amount payable to you, after accounting for all earnings and deductions, is Rs. ${f.net_payable || '[Amount]'} (Rupees [in words] only). This amount shall be credited to your registered bank account (Account No. [XXXX]) within ${f.settlement_days || '7 working days'} from the date of this letter, subject to receipt of your signed acknowledgement in the duplicate copy enclosed. Your acceptance of this settlement shall constitute a full and final discharge of all claims, demands, and causes of action arising from or in connection with your employment with the company, and you shall have no further claim against the company in respect of any matter whatsoever.`,
    ],
    closing: () => ['With regards,'],
    contextTitle: 'Settlement Breakup',
    context: (f) => {
      const rows: string[] = [];
      if (f.earnings) rows.push(`Earnings payable: ${f.earnings}`);
      if (f.deductions) rows.push(`Deductions and recoveries: ${f.deductions}`);
      if (f.net_payable) rows.push(`Net payable: Rs. ${f.net_payable}`);
      rows.push(`Credit timeline: ${f.settlement_days || '7 working days'} from date of this letter`);
      rows.push(`Acknowledgement: Signed duplicate copy required`);
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
    helpText: 'Issue when an employee needs proof of employment and income — typically for home loan, personal loan, visa, or rental agreement. Include gross monthly, annual CTC, and purpose. This is a third-party document — keep it factual and concise.',
    subject: () => 'Salary Certificate',
    greeting: () => 'To Whom It May Concern,',
    body: (f) => [
      `This is to certify that ${f.employee_name || '[Name]'}, ${f.designation || '[Designation]'} (Employee Code: ${f.employee_code || '[Code]'}), is presently employed with ${f.company_name || '[Company]'} in the ${f.department || '[Department]'} department, having joined on ${f.joining_date || '[Date]'} on a continuing basis. As on the date of this certificate, the employee is actively engaged in duties assigned by the management and is in good standing with the organisation.`,
      `As per the company's records, the current compensation details of the employee are as follows: gross monthly emoluments (exclusive of variable components) stand at Rs. ${f.gross_monthly || '[Amount]'} per month, translating to an annual cost-to-company (CTC) of Rs. ${f.salary || '[Amount]'} per annum. The CTC comprises basic salary, house rent allowance, provident fund (employer contribution), gratuity provision, medical insurance, and such other components as detailed in the compensation annexure. All amounts are subject to applicable statutory deductions including provident fund (employee contribution), professional tax, and income tax at source (TDS) as per applicable law.`,
      `This certificate is issued at the request of the employee for ${f.purpose || 'official purposes'} and is based on records available with the company as on the date of issuance. The contents herein are true and correct to the best of our knowledge and belief. This certificate does not constitute a guarantee of continued employment or a commitment regarding future compensation, and the company reserves the right to amend the terms of employment, including compensation, in accordance with applicable policy and law. Any reliance on this certificate for purposes beyond those stated herein shall be at the sole risk of the receiving party.`,
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
    helpText: 'Use when offering an internship position. Include role, department, duration, stipend, and start date. Clarify that this is not an employment offer and IP vests in the company. Specify weekly commitment and leave entitlement.',
    subject: (f) => `Internship Offer — ${f.designation || 'Intern'}`,
    greeting: (f) => `Dear ${f.employee_name || 'Candidate'},`,
    body: (f) => [
      `We are pleased to offer you an internship as ${f.designation || '[Role]'}${f.department ? ', with the ' + f.department + ' department' : ''} at ${f.company_name || '[Company]'}, for a period of ${f.intern_duration || '[X months]'} commencing ${f.joining_date || '[Date]'} and concluding on [End Date]. This internship is offered to provide you with practical exposure and professional development in your chosen field, under the guidance of the company's experienced professionals.`,
      `You shall be paid a consolidated stipend of Rs. ${f.stipend || '[Amount]'} per month for the duration of the internship, payable at the end of each calendar month subject to regular attendance and satisfactory engagement. A dedicated mentor shall be assigned from the ${f.department || '[Department]'} team to guide your learning, set objectives, and provide regular feedback. You shall be expected to adhere to the company's work culture, including punctuality, professional conduct, and compliance with applicable policies and confidentiality obligations.`,
      `This internship offer does not constitute, and shall not be construed as, an offer of employment or a promise of future absorption into the company. Any extension of the internship or offer of employment upon completion shall be subject to a separate evaluation of your performance, the availability of suitable positions, and the sole discretion of the management. You acknowledge that all intellectual property created during the course of this internship shall vest exclusively in the company, and you shall maintain strict confidentiality regarding all proprietary information, trade secrets, and business data to which you may have access during the internship period.`,
      `The company shall provide you with such infrastructure, tools, and resources as may be reasonably necessary for the discharge of your assigned duties. You shall be covered under the company's group personal accident insurance policy during the internship period, subject to the terms thereof. The internship shall require a minimum commitment of [X hours] per week, and you shall be entitled to [X] days of leave during the internship period, subject to prior approval from your mentor. Upon satisfactory completion of the internship, a certificate of completion shall be issued to you, detailing the duration, role, and key learnings from the programme.`,
    ],
    closing: () => ['We look forward to welcoming you to the team and hosting a rewarding internship experience.', 'With warm regards,'],
    contextTitle: 'Internship Terms',
    context: (f) => {
      const rows: string[] = [];
      if (f.intern_duration) rows.push(`Duration: ${f.intern_duration}`);
      if (f.stipend) rows.push(`Stipend: Rs. ${f.stipend} per month`);
      if (f.department) rows.push(`Department: ${f.department}`);
      rows.push(`Mentor: Assigned from the department team`);
      rows.push(`IP assignment: All intellectual property vests in the company`);
      rows.push(`No employment guarantee: Absorption subject to separate evaluation`);
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
    helpText: 'Issue at the end of a successful internship period. Include the intern\'s role, department, duration, key contributions, and performance assessment. This certificate serves as a professional reference for the intern\'s future opportunities.',
    subject: () => 'Certificate of Internship',
    greeting: () => 'To Whom It May Concern,',
    body: (f) => [
      `This is to certify that ${f.employee_name || '[Name]'} has successfully completed an internship as ${f.designation || '[Role]'} in the ${f.department || '[Department]'} department of ${f.company_name || '[Company]'} during the period from ${f.joining_date || '[From]'} to ${f.last_working_day || '[To]'} — a total duration of [X months/weeks]. During this period, ${f.employee_name || 'the intern'} was actively engaged in ${f.responsibilities || 'assigned project work'} and participated in the day-to-day operations of the department under the supervision of the assigned mentor.`,
      `The performance of ${f.employee_name || 'the intern'} during the internship period was assessed as ${f.conduct || 'good'}. ${f.employee_name || 'The intern'} demonstrated a commendable aptitude for learning, professional conduct, adherence to deadlines, and the ability to work both independently and collaboratively within team settings. ${f.responsibilities ? 'Key contributions include: ' + f.responsibilities + '. ' : ''}The skills and competencies developed during the internship reflect a genuine commitment to professional growth and alignment with the standards expected in a corporate environment.`,
      `We commend ${f.employee_name || 'the intern'} on the successful completion of the internship and are confident that the knowledge, skills, and experience gained during this programme will serve as a strong foundation for future professional endeavours. We wish ${f.employee_name || 'the intern'} every success in all future academic and career pursuits. This certificate is issued upon request without any admission of liability and without prejudice to any rights or obligations of either party.`,
    ],
    closing: () => ['Sincerely,'],
    contextTitle: 'Internship Snapshot',
    context: (f) => {
      const rows: string[] = [];
      if (f.responsibilities) rows.push(`Key work: ${f.responsibilities}`);
      if (f.department) rows.push(`Department: ${f.department}`);
      rows.push(`Performance assessment: ${f.conduct || 'Good'}`);
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
  { title: 'Joining', ids: ['intern_offer', 'offer', 'appointment'] },
  { title: 'Growth', ids: ['confirmation', 'appraisal', 'promotion', 'transfer', 'pip'] },
  { title: 'Discipline', ids: ['showcause', 'warning', 'suspension', 'absconding', 'termination'] },
  { title: 'Separation', ids: ['resignation_acceptance', 'relieving', 'experience', 'fnf'] },
  { title: 'Certificates', ids: ['noc', 'salary_certificate', 'intern_completion'] },
];

/* ──────────────────────────────────────────────────────────────────────────────
   Category pill helpers
   ────────────────────────────────────────────────────────────────────────────── */

type CategoryKey = 'all' | 'joining' | 'growth' | 'discipline' | 'separation' | 'certificates';

const CATEGORY_PILLS: Array<{ key: CategoryKey; label: string; groupTitles: string[]; icon: string }> = [
  { key: 'all', label: 'All Templates', groupTitles: [], icon: '📄' },
  { key: 'joining', label: 'Joining', groupTitles: ['Joining'], icon: '📄' },
  { key: 'growth', label: 'Growth', groupTitles: ['Growth'], icon: '📄' },
  { key: 'discipline', label: 'Discipline', groupTitles: ['Discipline'], icon: '📄' },
  { key: 'separation', label: 'Separation', groupTitles: ['Separation'], icon: '📄' },
  { key: 'certificates', label: 'Certificates', groupTitles: ['Certificates'], icon: '📄' },
];

function getTemplatesForCategory(cat: CategoryKey): Template[] {
  if (cat === 'all') return TEMPLATES;
  const pill = CATEGORY_PILLS.find((p) => p.key === cat);
  if (!pill) return TEMPLATES;
  const ids = TEMPLATE_GROUPS.filter((g) => pill.groupTitles.includes(g.title)).flatMap((g) => g.ids);
  return TEMPLATES.filter((t) => ids.includes(t.id));
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

/* ──────────────────────────────────────────────────────────────────────────────
   Step definitions
   ────────────────────────────────────────────────────────────────────────────── */

const STEPS = ['Template', 'Letterhead', 'Employee', 'Details'] as const;

/* ──────────────────────────────────────────────────────────────────────────────
   Component
   ────────────────────────────────────────────────────────────────────────────── */

const Letters = () => {
  const [mounted, setMounted] = useState(false);
  const [templateId, setTemplateId] = useState('');
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
  const [letterhead, setLetterhead] = useState<Record<string, string>>({});
  const [customTerms, setCustomTerms] = useState<Record<string, string[]>>({});
  const [newTermInput, setNewTermInput] = useState('');
  const [editingTermIdx, setEditingTermIdx] = useState<number | null>(null);
  const [editingTermValue, setEditingTermValue] = useState('');
  const [removedDefaults, setRemovedDefaults] = useState<Record<string, number[]>>({});
  const [editedDefaults, setEditedDefaults] = useState<Record<string, Record<number, string>>>({});
  const previewContentRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);

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

  const addCustomTerm = () => {
    const term = newTermInput.trim();
    if (!term) return;
    setCustomTerms((prev) => ({
      ...prev,
      [templateId]: [...(prev[templateId] || []), term],
    }));
    setNewTermInput('');
  };

  const removeCustomTerm = (idx: number) => {
    setCustomTerms((prev) => ({
      ...prev,
      [templateId]: (prev[templateId] || []).filter((_, i) => i !== idx),
    }));
    if (editingTermIdx === -(idx + 1)) {
      setEditingTermIdx(null);
      setEditingTermValue('');
    }
  };

  const startEditTerm = (idx: number, value: string) => {
    setEditingTermIdx(idx);
    setEditingTermValue(value);
  };

  const saveEditTerm = () => {
    if (editingTermIdx === null || !editingTermValue.trim()) return;
    if (editingTermIdx >= 0) {
      setEditedDefaults((prev) => ({
        ...prev,
        [templateId]: { ...(prev[templateId] || {}), [editingTermIdx]: editingTermValue.trim() },
      }));
    } else {
      const customIdx = -(editingTermIdx + 1);
      setCustomTerms((prev) => ({
        ...prev,
        [templateId]: (prev[templateId] || []).map((t, i) => i === customIdx ? editingTermValue.trim() : t),
      }));
    }
    setEditingTermIdx(null);
    setEditingTermValue('');
  };

  const removeDefaultTerm = (idx: number) => {
    setRemovedDefaults((prev) => ({
      ...prev,
      [templateId]: [...(prev[templateId] || []), idx],
    }));
    setEditedDefaults((prev) => {
      const copy = { ...(prev[templateId] || {}) };
      delete copy[idx];
      return { ...prev, [templateId]: copy };
    });
  };

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

  const contextRows = useMemo(() => {
    const allDefaultRows = template.context ? template.context(merged) : [];
    const edited = editedDefaults[templateId] || {};
    const removed = removedDefaults[templateId] || [];
    const keptDefaults = allDefaultRows
      .map((row, i) => edited[i] ?? row)
      .filter((_, i) => !removed.includes(i));
    const extra = customTerms[templateId] || [];
    return [...keptDefaults, ...extra];
  }, [template, merged, customTerms, removedDefaults, editedDefaults, templateId]);

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

  const downloadPdf = useCallback(() => {
    const missing = template.fields.filter((f) => f.required && !merged[f.key]);
    if (missing.length > 0) {
      toast.error(`Please fill in: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
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
  }, [template, merged, letterhead, contextRows, contactLine]);

  const copyText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(letterText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success('Letter text copied');
    } catch {
      toast.error('Copy failed');
    }
  }, [letterText]);

  /* ── Zoom / preview font size ──────────────────────────────────────────────── */
  const [zoomPct, setZoomPct] = useState(100);
  const previewFontSize = Math.round((zoomPct / 100) * 15);

  useEffect(() => {
    if (!previewContentRef.current) return;
    const el = previewContentRef.current;
    const calculatePages = () => {
      const contentHeight = el.scrollHeight;
      const PAGE_HEIGHT_PX = 1059;
      const pages = Math.max(1, Math.ceil(contentHeight / PAGE_HEIGHT_PX));
      setPageCount(pages);
    };
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => requestAnimationFrame(calculatePages));
    });
    observer.observe(el);
    // Calculate after delays to handle initial render and template switches
    const timer1 = setTimeout(calculatePages, 50);
    const timer2 = setTimeout(calculatePages, 200);
    const timer3 = setTimeout(calculatePages, 500);
    return () => {
      observer.disconnect();
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [letterText, zoomPct, previewFontSize]);

  /* ── Category / search ─────────────────────────────────────────────────────── */
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [templateSearch, setTemplateSearch] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const filteredGroups = useMemo(() => {
    const catTemplates = getTemplatesForCategory(activeCategory);
    const query = templateSearch.trim().toLowerCase();
    const visible = query ? catTemplates.filter((t) => t.label.toLowerCase().includes(query) || t.description.toLowerCase().includes(query)) : catTemplates;

    return TEMPLATE_GROUPS
      .map((g) => ({
        ...g,
        templates: g.ids
          .map((id) => TEMPLATES.find((t) => t.id === id))
          .filter((t): t is Template => !!t && visible.some((v) => v.id === t.id)),
      }))
      .filter((g) => g.templates.length > 0);
  }, [activeCategory, templateSearch]);

  const toggleGroup = (title: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  /* ── Step calculation ──────────────────────────────────────────────────────── */
  const currentStep = useMemo(() => {
    const hasLetterhead = !!(letterhead.company_name || letterhead.company_address || letterhead.company_logo);
    const hasEmployee = !!selectedEmployee;
    const hasFields = template.fields.some((fd) => fd.key !== 'ref_no' && fd.key !== 'date' && fields[fd.key]);
    if (hasFields) return 3;
    if (hasEmployee) return 2;
    if (hasLetterhead) return 1;
    return 0;
  }, [template, fields, letterhead, selectedEmployee]);

  /* ── Loading state ─────────────────────────────────────────────────────────── */
  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <div className="p-6 space-y-6">
          <div className="shimmer h-20 rounded-2xl" />
          <div className="shimmer h-10 rounded-xl w-96" />
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            <div className="xl:col-span-2 space-y-4">
              <div className="shimmer h-64 rounded-2xl" />
              <div className="shimmer h-80 rounded-2xl" />
            </div>
            <div className="xl:col-span-3">
              <div className="shimmer h-[60vh] rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] animate-page-enter">
      <div className="w-full mx-auto space-y-6">

        <PageHero
          title="Letters"
          subtitle="Generate professional HR letters — offer, appointment, appraisal, relieving and more — in one click"
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

        {/* ──────────────────── STEP PROGRESS INDICATOR ──────────────────── */}
        <div className="flex items-center justify-center pt-5 pb-1">
          <nav className="flex items-center gap-0">
            {STEPS.map((step, idx) => {
              const done = idx < currentStep;
              const active = idx === currentStep;
              return (
                <div key={step} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`
                        w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300
                        ${done ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' : ''}
                        ${active ? 'bg-[var(--primary-blue)] text-white shadow-lg shadow-blue-200 ring-4 ring-blue-100 animate-pulse-soft' : ''}
                        ${!done && !active ? 'bg-gray-200 dark:bg-gray-700 text-gray-400' : ''}
                      `}
                    >
                      {done ? <Check className="w-4 h-4" /> : idx + 1}
                    </div>
                    <span className={`mt-1.5 text-[11px] font-semibold tracking-wide ${active ? 'text-[var(--primary-blue)]' : done ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {step}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`w-12 sm:w-20 h-0.5 mx-2 mt-[-18px] rounded-full transition-colors duration-500 ${idx < currentStep ? 'bg-emerald-400' : idx === currentStep ? 'bg-blue-300' : 'bg-gray-200 dark:bg-gray-700'}`} />
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* ──────────────────── TOP CATEGORY PILLS ──────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 flex-1 min-w-0">
            {CATEGORY_PILLS.map((pill) => (
              <button
                key={pill.key}
                onClick={() => { setActiveCategory(pill.key); setTemplateSearch(''); }}
                className={`
                  relative shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2
                  ${activeCategory === pill.key
                    ? 'bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] text-white shadow-lg shadow-blue-500/25 scale-[1.02]'
                    : 'bg-white text-[#64748B] border border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] hover:shadow-md hover:shadow-gray-100'
                  }
                `}
              >
                <span className="text-base">{pill.icon}</span>
                {pill.label}
              </button>
            ))}
          </div>

          <div className="relative shrink-0 w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates…"
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              className="w-full pl-10 pr-16 py-2.5 bg-white/80 backdrop-blur border border-[var(--border-color)] rounded-xl text-sm focus:ring-2 focus:ring-[var(--primary-blue)] focus:border-transparent outline-none transition-all"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-gray-100 text-gray-500 text-[11px] font-bold rounded-md">
              {filteredGroups.reduce((n, g) => n + g.templates.length, 0)}
            </span>
          </div>
        </div>

        {/* ──────────────────── MAIN GRID ──────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-stretch">

          {/* ════════════════ LEFT COLUMN ════════════════ */}
          <div className="xl:col-span-2 space-y-5">

            {/* ── SECTION 1: Template Cards ── */}
            <div
              className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/40 shadow-xl overflow-hidden transition-all duration-300"
              style={{ animationDelay: '0ms' }}
            >
              <div className="px-5 py-4 border-b border-[var(--border-color)]/50 bg-gradient-to-r from-indigo-50/50 to-blue-50/50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Choose Template</h3>
                    <p className="text-[11px] text-gray-400">{TEMPLATES.length} templates available</p>
                  </div>
                </div>
              </div>

              <div className="p-4 max-h-[48vh] overflow-y-auto custom-scrollbar space-y-4">
                {filteredGroups.length === 0 && (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gray-100 flex items-center justify-center">
                      <Search className="w-7 h-7 text-gray-300" />
                    </div>
                    <p className="text-sm font-medium text-gray-400">No templates match your search</p>
                    <p className="text-xs text-gray-300 mt-1">Try a different keyword</p>
                  </div>
                )}

                {filteredGroups.map((g) => (
                  <div key={g.title}>
                    <button
                      onClick={() => toggleGroup(g.title)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50/80 transition-colors group"
                    >
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 group-hover:text-gray-500">
                        {g.title}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-gray-300 bg-gray-100 px-1.5 py-0.5 rounded">
                          {g.templates.length}
                        </span>
                        {collapsedGroups.has(g.title)
                          ? <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                          : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                        }
                      </div>
                    </button>

                    {!collapsedGroups.has(g.title) && (
                      <div className="space-y-1.5 mt-1">
                        {g.templates.map((t, cardIdx) => {
                          const selected = templateId === t.id;
                          return (
                            <button
                              key={t.id}
                              onClick={() => setTemplateId(t.id)}
                              style={{ animationDelay: `${cardIdx * 50}ms` }}
                              className={`
                                w-full flex items-start gap-3 p-3.5 rounded-xl text-left transition-all duration-200 group/card
                                ${selected
                                  ? 'border-2 border-[var(--primary-blue)] bg-blue-50/70 shadow-md shadow-blue-100'
                                  : 'border border-gray-100 hover:border-blue-200 hover:bg-white hover:shadow-md hover:scale-[1.015]'
                                }
                              `}
                            >
                              <span
                                className={`
                                  w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200
                                  ${selected
                                    ? 'bg-gradient-to-br from-[var(--primary-blue)] to-indigo-600 text-white shadow-lg shadow-blue-200'
                                    : 'bg-gray-100 text-gray-500 group-hover/card:bg-indigo-50 group-hover/card:text-indigo-500'
                                  }
                                `}
                              >
                                <t.icon className="w-5 h-5" />
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-[var(--text-primary)] leading-tight">
                                  {t.label}
                                </span>
                                <span className="block text-xs text-gray-400 mt-0.5 leading-snug line-clamp-1">
                                  {t.description}
                                </span>
                              </span>
                              <span className="shrink-0 mt-1">
                                {selected
                                  ? (
                                    <span className="w-5 h-5 rounded-full bg-[var(--primary-blue)] flex items-center justify-center">
                                      <Check className="w-3 h-3 text-white" />
                                    </span>
                                  )
                                  : (
                                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover/card:text-blue-400 group-hover/card:translate-x-0.5 transition-all" />
                                  )
                                }
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Help Panel (collapsible) ── */}
            {templateId && (
              <div
                className="bg-gradient-to-r from-amber-50/80 to-orange-50/80 backdrop-blur-xl rounded-2xl border border-amber-200/60 shadow-lg overflow-hidden transition-all duration-300"
                style={{ animationDelay: '25ms' }}
              >
                <button
                  onClick={() => setShowHelp((h) => !h)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-amber-100/30 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                    <HelpCircle className="w-4 h-4 text-white" />
                  </div>
                  <span className="flex-1">
                    <span className="text-sm font-bold text-amber-900">How to create this letter</span>
                    <span className="block text-[11px] text-amber-600/80 mt-0.5">Tips and guidance for {template.label}</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-amber-500 transition-transform duration-200 ${showHelp ? 'rotate-180' : ''}`} />
                </button>
                {showHelp && (
                  <div className="px-5 pb-4 pt-0">
                    <p className="text-xs text-amber-800 leading-relaxed bg-white/60 rounded-xl px-4 py-3 border border-amber-200/40">
                      {template.helpText}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── SECTION 2: Letterhead ── */}
            {templateId && (
            <div
              className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/40 shadow-xl overflow-hidden"
              style={{ animationDelay: '50ms' }}
            >
              <div className="px-5 py-4 border-b border-[var(--border-color)]/50 bg-gradient-to-r from-violet-50/50 to-purple-50/50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Letterhead</h3>
                    <p className="text-[11px] text-gray-400">Company details & branding</p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Live mini preview */}
                {(letterhead.company_name || letterhead.company_logo) && (
                  <div className="p-3 rounded-xl bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-100 flex items-center gap-3 transition-all">
                    {letterhead.company_logo ? (
                      <img src={letterhead.company_logo} alt="" className="h-10 w-10 object-contain rounded-lg" />
                    ) : (
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
                        {(letterhead.company_name || 'C')[0]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">{letterhead.company_name || 'Company Name'}</p>
                      {letterhead.company_address && (
                        <p className="text-[11px] text-gray-400 truncate">{letterhead.company_address}</p>
                      )}
                    </div>
                    <Eye className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  </div>
                )}

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
                    <div className="h-[42px] flex items-center border border-dashed border-gray-200 rounded-lg px-2 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                      <CompactImageUpload
                        value={letterhead.company_logo || ''}
                        onChange={(dataUrl) => setLh({ company_logo: dataUrl })}
                        onClear={() => setLh({ company_logo: '' })}
                        accept="image/png,image/jpeg,image/webp"
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400 min-h-[16px] leading-4">Drag & drop or click</p>
                  </div>
                </div>

                {(customCompany || companyId === '') && (
                  <FormField label="Company name" required>
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
            )}

            {/* ── SECTION 3: Employee Picker ── */}
            {templateId && (
            <div
              className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/40 shadow-xl overflow-hidden"
              style={{ animationDelay: '100ms' }}
            >
              <div className="px-5 py-4 border-b border-[var(--border-color)]/50 bg-gradient-to-r from-emerald-50/50 to-teal-50/50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                    <Users className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Employee</h3>
                    <p className="text-[11px] text-gray-400">Auto-fill letter fields</p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="relative" ref={pickerRef}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name or code…"
                    value={selectedEmployee ? personDisplayName(selectedEmployee as never, '') : employeeSearch}
                    onChange={(e) => {
                      setEmployeeSearch(e.target.value);
                      if (selectedEmployee) clearEmployee();
                      else setShowPicker(true);
                    }}
                    onFocus={() => { if (!selectedEmployee) setShowPicker(true); }}
                    readOnly={!!selectedEmployee}
                    className="w-full pl-10 pr-10 py-2.5 border border-[var(--border-color)] rounded-xl focus:ring-2 focus:ring-[var(--primary-blue)] focus:border-transparent outline-none text-sm bg-white/60 transition-all"
                  />
                  {selectedEmployee && (
                    <button
                      type="button"
                      onClick={clearEmployee}
                      aria-label="Remove employee"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {showPicker && (
                    <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-2xl max-h-56 overflow-auto">
                      {(employees as Employee[]).length === 0 && (
                        <p className="px-4 py-3 text-sm text-gray-400">No matches — keep typing or fill fields manually.</p>
                      )}
                      {(employees as Employee[]).map((emp) => (
                        <button
                          key={emp.id}
                          onClick={() => pickEmployee(emp)}
                          className="w-full text-left px-4 py-3 hover:bg-blue-50/60 flex items-center gap-3 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {getInitials(personDisplayName(emp as never, ''))}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{personDisplayName(emp as never, '')}</p>
                            <p className="text-[11px] text-gray-400 truncate">
                              {(emp as { employeeCode?: string }).employeeCode || `#${emp.id}`}
                              {(emp as { department?: { name?: string } | string }).department && (
                                <> · {typeof (emp as { department?: { name?: string } | string }).department === 'object'
                                  ? ((emp as { department?: { name?: string } }).department as { name?: string })?.name
                                  : String((emp as { department?: string }).department)}</>
                              )}
                            </p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField label="Designation">
                    <input value={fields.designation || ''} onChange={(e) => set('designation', e.target.value)} className={formInputClass} placeholder="e.g. Software Engineer" />
                  </FormField>
                  <FormField label="Department">
                    <input value={fields.department || ''} onChange={(e) => set('department', e.target.value)} className={formInputClass} placeholder="e.g. Engineering" />
                  </FormField>
                </div>

                {selectedEmployee && (
                  <div className="rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50/50 border-2 border-emerald-200/70 p-4 transition-all animate-fade-in">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold">
                        {getInitials(personDisplayName(selectedEmployee as never, ''))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-emerald-800 truncate">{personDisplayName(selectedEmployee as never, '')}</p>
                        <p className="text-[11px] text-emerald-600">{(selectedEmployee as { employeeCode?: string }).employeeCode}</p>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full uppercase tracking-wider">Auto-filled</span>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
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
                          <dt className="text-emerald-600/70 shrink-0 font-medium">{k}:</dt>
                          <dd className="font-semibold text-gray-800 truncate">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                {!selectedEmployee && (
                  <p className="text-center text-xs text-gray-300 py-2">Search above to auto-fill employee details</p>
                )}
              </div>
            </div>
            )}

            {/* ── SECTION 4: Letter Details ── */}
            {templateId && (
            <div
              className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/40 shadow-xl overflow-hidden"
              style={{ animationDelay: '150ms' }}
            >
              <div className="px-5 py-4 border-b border-[var(--border-color)]/50 bg-gradient-to-r from-amber-50/50 to-orange-50/50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Letter Details</h3>
                    <p className="text-[11px] text-gray-400">Fill template-specific fields</p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
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
                          className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-[var(--primary-blue)] to-indigo-500 rounded-xl hover:shadow-lg hover:shadow-blue-200 hover:-translate-y-0.5 transition-all active:translate-y-0"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
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
            )}

            {/* ── SECTION 5: Terms & Annexure ── */}
            {templateId && (
            <div
              className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/40 shadow-xl overflow-hidden"
              style={{ animationDelay: '200ms' }}
            >
              <div className="px-5 py-4 border-b border-[var(--border-color)]/50 bg-gradient-to-r from-violet-50/50 to-purple-50/50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Terms & Annexure</h3>
                    <p className="text-[11px] text-gray-400">Edit, delete or add terms — all are customizable</p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-2">
                {/* All visible terms (defaults + custom) */}
                {contextRows.map((row, i) => {
                  const isCustom = i >= (template.context ? template.context(merged).length - (removedDefaults[templateId] || []).length : 0);
                  const origIdx = isCustom ? -1 : i;
                  return (
                    <div
                      key={`term-${i}`}
                      className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 group transition-colors ${
                        isCustom
                          ? 'bg-violet-50 border border-violet-200 text-violet-800'
                          : 'bg-gray-50 border border-gray-100 text-gray-700'
                      }`}
                    >
                      <span className={`mt-0.5 shrink-0 ${isCustom ? 'text-violet-400' : 'text-gray-400'}`}>•</span>
                      {editingTermIdx === i ? (
                        <input
                          type="text"
                          value={editingTermValue}
                          onChange={(e) => setEditingTermValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); saveEditTerm(); }
                            if (e.key === 'Escape') { setEditingTermIdx(null); setEditingTermValue(''); }
                          }}
                          onBlur={saveEditTerm}
                          autoFocus
                          className="flex-1 text-xs bg-white border border-violet-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
                        />
                      ) : (
                        <span
                          className="flex-1 leading-relaxed cursor-pointer hover:underline decoration-dotted underline-offset-2"
                          onClick={() => startEditTerm(i, row)}
                          title="Click to edit"
                        >
                          {row}
                        </span>
                      )}
                      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                        {editingTermIdx === i ? (
                          <button
                            onClick={saveEditTerm}
                            className="w-5 h-5 rounded-full flex items-center justify-center text-emerald-500 hover:bg-emerald-100 transition-colors"
                            aria-label="Save"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        ) : (
                          <button
                            onClick={() => startEditTerm(i, row)}
                            className="w-5 h-5 rounded-full flex items-center justify-center text-violet-400 hover:bg-violet-100 hover:text-violet-700 transition-colors"
                            aria-label="Edit"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={() => isCustom ? removeCustomTerm(i - (contextRows.length - (customTerms[templateId] || []).length)) : removeDefaultTerm(origIdx)}
                          className="w-5 h-5 rounded-full flex items-center justify-center text-violet-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                          aria-label="Delete"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Restore removed defaults */}
                {(removedDefaults[templateId] || []).length > 0 && (
                  <div className="pt-1">
                    <button
                      onClick={() => setRemovedDefaults((prev) => ({ ...prev, [templateId]: [] }))}
                      className="text-[11px] text-gray-400 hover:text-violet-600 underline transition-colors"
                    >
                      Restore {removedDefaults[templateId].length} removed default term{(removedDefaults[templateId].length) > 1 ? 's' : ''}
                    </button>
                  </div>
                )}

                {/* Add new term */}
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <input
                    type="text"
                    value={newTermInput}
                    onChange={(e) => setNewTermInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTerm(); } }}
                    placeholder="Add a new term…"
                    className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={addCustomTerm}
                    disabled={!newTermInput.trim()}
                    className="shrink-0 px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-violet-500 to-purple-500 rounded-xl hover:shadow-lg hover:shadow-violet-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Add
                  </button>
                </div>

                {contextRows.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">No terms yet. Add terms above.</p>
                )}
              </div>
            </div>
            )}

          </div>

          {/* ════════════════ RIGHT COLUMN: LIVE PREVIEW ════════════════ */}
          <div
            className="xl:col-span-3 animate-slide-in-right"
            style={{ animationDelay: '200ms' }}
          >
            <div className="sticky top-4 flex flex-col h-full">

              {/* ── Preview floating toolbar ── */}
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[var(--primary-blue)]" />
                  Live Preview
                </h3>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-white/80 backdrop-blur border border-[var(--border-color)] rounded-xl px-1 py-1">
                    <button
                      onClick={() => setZoomPct((z) => Math.max(70, z - 10))}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-500"
                      title="Zoom out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-12 text-center text-xs font-bold text-[var(--text-primary)] tabular-nums">{zoomPct}%</span>
                    <button
                      onClick={() => setZoomPct((z) => Math.min(150, z + 10))}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-500"
                      title="Zoom in"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className={`text-[11px] font-medium hidden sm:block px-2 py-0.5 rounded-lg ${pageCount > 1 ? 'text-amber-700 bg-amber-50 border border-amber-200' : 'text-gray-400'}`}>Page 1 of {pageCount}</span>
                  <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-lg hidden sm:block">
                    A4 · Times · Print-ready
                  </span>
                </div>
              </div>

              {/* ── Preview paper ── */}
              <div className="bg-white rounded-2xl border border-[var(--border-color)] shadow-2xl overflow-hidden transition-all duration-300 flex-1 flex flex-col">
                {templateId ? (
                <div
                  className="px-10 py-8 font-serif leading-relaxed text-gray-900"
                  ref={previewContentRef}
                  style={{ fontSize: `${previewFontSize}px`, lineHeight: 1.75 }}
                >
                  {/* Logo */}
                  {letterhead.company_logo && (
                    <div className="flex justify-center mb-3">
                      <img src={letterhead.company_logo} alt="Company logo" className="h-16 object-contain" />
                    </div>
                  )}

                  {/* Company header */}
                  <p className="text-center font-bold" style={{ fontSize: `${Math.round(previewFontSize * 1.25)}px` }}>
                    {letterhead.company_name || 'Company Name'}
                  </p>
                  {letterhead.company_address && (
                    <p className="text-center text-gray-500 mt-1" style={{ fontSize: `${Math.round(previewFontSize * 0.8)}px` }}>
                      {letterhead.company_address}
                    </p>
                  )}
                  {contactLine && (
                    <p className="text-center text-gray-500 mt-0.5" style={{ fontSize: `${Math.round(previewFontSize * 0.8)}px` }}>
                      {contactLine}
                    </p>
                  )}

                  {/* Separator */}
                  <hr className="my-5 border-gray-300" />

                  {/* Ref & Date */}
                  <div className="flex justify-between" style={{ fontSize: `${Math.round(previewFontSize * 0.85)}px` }}>
                    <span>Ref: {merged.ref_no || '-'}</span>
                    <span>Date: {merged.date || '-'}</span>
                  </div>

                  {/* Subject */}
                  <p className="font-bold mt-5" style={{ fontSize: `${Math.round(previewFontSize * 0.95)}px` }}>
                    Subject: {template.subject(merged)}
                  </p>

                  {/* Greeting */}
                  <p className="mt-5">{template.greeting(merged)}</p>

                  {/* Body paragraphs */}
                  {template.body(merged).map((p, i) => (
                    <p key={i} className="mt-3 text-justify">{p}</p>
                  ))}

                  {/* Page break indicator */}
                  {pageCount > 1 && (
                    <div className="my-6 flex items-center gap-3" style={{ fontSize: `${Math.round(previewFontSize * 0.75)}px` }}>
                      <div className="flex-1 border-t-2 border-dashed border-gray-300" />
                      <span className="text-gray-400 font-medium whitespace-nowrap">— Page 2 —</span>
                      <div className="flex-1 border-t-2 border-dashed border-gray-300" />
                    </div>
                  )}

                  {/* Context / Annexure */}
                  {contextRows.length > 0 && (
                    <div className="mt-6 rounded-xl bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 p-5 transition-all">
                      <p className="font-bold uppercase tracking-wide text-gray-700" style={{ fontSize: `${Math.round(previewFontSize * 0.85)}px` }}>
                        {template.contextTitle || 'Annexure'}
                      </p>
                      <ul className="mt-2.5 space-y-1.5">
                        {contextRows.map((r, i) => (
                          <li key={i} className="text-gray-700 flex gap-2">
                            <span className="text-gray-400 mt-0.5">•</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Closing */}
                  <div className="mt-8">
                    {template.closing(merged).map((c, i) => (
                      <p key={i}>{c}</p>
                    ))}
                    <p className="mt-1 font-medium">{letterhead.signatory || 'Authorised Signatory'}</p>
                    <p className="font-bold">{letterhead.company_name || 'Company Name'}</p>
                  </div>
                </div>
                ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-blue-50 flex items-center justify-center mb-4">
                    <FileText className="w-8 h-8 text-indigo-400" />
                  </div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">How to create a letter</h3>
                  <div className="space-y-3 text-sm text-[#64748B] max-w-sm">
                    <div className="flex items-start gap-3 text-left">
                      <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                      <p>Select a letter template from the left panel</p>
                    </div>
                    <div className="flex items-start gap-3 text-left">
                      <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                      <p>Choose an employee and fill in the required fields</p>
                    </div>
                    <div className="flex items-start gap-3 text-left">
                      <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                      <p>Preview your letter here and download as PDF</p>
                    </div>
                  </div>
                </div>
                )}
              </div>

              {/* ── Action bar ── */}
              {templateId && (
              <div className="flex gap-3 mt-4">
                <button
                  onClick={downloadPdf}
                  className="flex-1 flex items-center justify-center gap-2.5 px-5 py-3.5 bg-gradient-to-r from-[var(--primary-blue)] to-indigo-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-200 hover:shadow-xl hover:shadow-blue-300 hover:-translate-y-0.5 transition-all active:translate-y-0"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
                <button
                  onClick={copyText}
                  className={`
                    flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold rounded-xl border transition-all
                    ${copied
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-white border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-gray-50 hover:border-gray-300'
                    }
                  `}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy Text'}
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center justify-center gap-2 px-4 py-3.5 bg-white border border-[var(--border-color)] text-[var(--text-secondary)] text-sm font-semibold rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all"
                >
                  <Printer className="w-4 h-4" />
                  Print
                </button>
              </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Letters;
