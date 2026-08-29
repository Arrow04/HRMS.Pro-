import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { personDisplayName } from '../utils/employeeNameUtils';

interface ResumeData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  employeeCode?: string;
  photoUrl?: string;
  gender?: string;
  dateOfBirth?: string;
  bloodGroup?: string;
  maritalStatus?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  currentAddress?: string;
  permanentAddress?: string;
  landmark?: string;
  companyId?: string | number;
  companyName?: string;
  departmentName?: string;
  designationName?: string;
  employmentType?: string;
  joinDate?: string;
  status?: string;
  educationDetails?: Array<Record<string, unknown>>;
  certifications?: Array<Record<string, unknown>>;
  skillsList?: Array<Record<string, unknown>>;
  languages?: Array<Record<string, unknown>>;
  experienceDetails?: Array<Record<string, unknown>>;
  bankAccounts?: Array<Record<string, unknown>>;
  baseSalary?: string | number;
  aadharNumber?: string;
  panNumber?: string;
  voterId?: string;
  drivingLicense?: string;
  passportNumber?: string;
  fatherName?: string;
  motherName?: string;
  siblingName?: string;
  spouseName?: string;
  nomineeName?: string;
}

const STR = (v: unknown) => String(v ?? '').trim();

const fmtDate = (d: unknown): string => {
  const s = STR(d);
  if (!s) return '';
  return s.split('T')[0];
};

const PAGE_H = 297;
const MARGIN = 14;
const FOOTER_Y = 287;

const ensureSpace = (doc: jsPDF, y: number, needed: number): number => {
  if (y + needed > FOOTER_Y) {
    doc.addPage();
    return MARGIN;
  }
  return y;
};

const addSectionHeading = (doc: jsPDF, title: string, y: number): number => {
  y = ensureSpace(doc, y, 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(29, 100, 242);
  doc.text(title, 14, y);
  doc.setDrawColor(203, 213, 225);
  doc.line(14, y + 2, 196, y + 2);
  return y + 8;
};

const addKV = (doc: jsPDF, left: { label: string; value: string }[], right: { label: string; value: string }[], y: number): number => {
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i++) {
    y = ensureSpace(doc, y, 7);
    const l = left[i];
    const r = right[i];
    if (l && l.value) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text(`${l.label}:`, 16, y);
      doc.setTextColor(51, 65, 85);
      doc.text(l.value, 70, y, { maxWidth: 55 });
    }
    if (r && r.value) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text(`${r.label}:`, 128, y);
      doc.setTextColor(51, 65, 85);
      doc.text(r.value, 180, y, { align: 'right', maxWidth: 60 });
    }
    y += 5.5;
  }
  return y + 4;
};

const addListBlock = (doc: jsPDF, items: { title: string; subtitle: string }[], y: number): number => {
  for (const it of items) {
    if (it.title) {
      y = ensureSpace(doc, y, 8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      doc.text(it.title, 16, y);
      if (it.subtitle) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(it.subtitle, 120, y, { align: 'right', maxWidth: 70 });
      }
      y += 6;
    }
  }
  return y + 3;
};

export const generateResumePdf = (data: ResumeData) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const fullName = personDisplayName(data, 'Employee');

  // Header band
  doc.setFillColor(29, 100, 242);
  doc.rect(0, 0, pageWidth, 30, 'F');

  let nameX = 14;
  const photo = data.photoUrl;
  if (photo) {
    try {
      doc.addImage(photo, 'JPEG', 12, 36, 22, 22, undefined, 'FAST');
    } catch {
      // ignore photo decode failures
    }
  }
  if (photo) nameX = 38;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(fullName, nameX, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const headerLine = [data.employeeCode ? `Code: ${data.employeeCode}` : '', data.designationName || '', data.companyName || ''].filter(Boolean).join('  |  ');
  if (headerLine) doc.text(headerLine, nameX, 23);

  let y = 38;

  // Contact
  const contactLeft = [
    { label: 'Email', value: data.email || '' },
    { label: 'Phone', value: data.phone || '' },
    { label: 'Current Address', value: data.currentAddress || '' },
    { label: 'Permanent Address', value: data.permanentAddress || '' },
  ];
  const contactRight = [
    { label: 'Gender', value: data.gender || '' },
    { label: 'Date of Birth', value: fmtDate(data.dateOfBirth) },
    { label: 'Blood Group', value: data.bloodGroup || '' },
    { label: 'Marital Status', value: data.maritalStatus || '' },
  ];
  y = addSectionHeading(doc, 'Contact & Personal', y);
  y = addKV(doc, contactLeft, contactRight, y);

  // Employment
  y = addSectionHeading(doc, 'Employment', y);
  y = addKV(doc, [
    { label: 'Company', value: data.companyName || '' },
    { label: 'Department', value: data.departmentName || '' },
    { label: 'Designation', value: data.designationName || '' },
  ], [
    { label: 'Employment Type', value: data.employmentType || '' },
    { label: 'Join Date', value: fmtDate(data.joinDate) },
    { label: 'Status', value: data.status || '' },
  ], y);

  // Education
  const eduItems = (data.educationDetails || []).filter((e) => e.educationLevel || e.institution || e.degree).map((e) => ({
    title: [e.educationLevel, e.degree].filter(Boolean).join(' — '),
    subtitle: STR(e.institution),
  }));
  if (eduItems.length) {
    y = addSectionHeading(doc, 'Education', y);
    y = addListBlock(doc, eduItems, y);
  }

  // Certifications
  const certItems = (data.certifications || []).filter((c) => c.name).map((c) => ({
    title: STR(c.name),
    subtitle: STR(c.organization),
  }));
  if (certItems.length) {
    y = addSectionHeading(doc, 'Certifications', y);
    y = addListBlock(doc, certItems, y);
  }

  // Skills & Languages
  const skills = (data.skillsList || []).filter((s) => s.name).map((s) => STR(s.name)).join(', ');
  const languages = (data.languages || []).filter((l) => l.name).map((l) => STR(l.name)).join(', ');
  if (skills || languages) {
    y = addSectionHeading(doc, 'Skills & Languages', y);
    y = addKV(doc, [
      { label: 'Skills', value: skills },
      { label: 'Languages', value: languages },
    ], [], y);
  }

  // Experience
  const expItems = (data.experienceDetails || []).filter((e) => e.company).map((e) => ({
    title: STR(e.company),
    subtitle: [STR(e.designation), e.from ? `${fmtDate(e.from)}${e.to ? ` — ${fmtDate(e.to)}` : ''}` : ''].filter(Boolean).join(' · '),
  }));
  if (expItems.length) {
    y = addSectionHeading(doc, 'Experience', y);
    y = addListBlock(doc, expItems, y);
  }

  // Bank & Salary
  const banks = (data.bankAccounts || []).filter((a) => a.bankName || a.bankAccountNumber).map((a) => `${STR(a.bankName)}${a.bankAccountNumber ? ` (${STR(a.bankAccountNumber)})` : ''}`).join(', ');
  y = addSectionHeading(doc, 'Bank & Salary', y);
  y = addKV(doc, [
    { label: 'Bank Accounts', value: banks },
    { label: 'Base Salary', value: data.baseSalary ? `₹${data.baseSalary}` : '' },
  ], [], y);

  // Identity
  const idLeft = [
    { label: 'Aadhaar', value: data.aadharNumber || '' },
    { label: 'PAN', value: data.panNumber || '' },
    { label: 'Voter ID', value: data.voterId || '' },
  ];
  const idRight = [
    { label: 'Driving License', value: data.drivingLicense || '' },
    { label: 'Passport', value: data.passportNumber || '' },
    { label: 'Emergency Contact', value: data.emergencyContact ? `${data.emergencyContact}${data.emergencyPhone ? ` · ${data.emergencyPhone}` : ''}` : '' },
  ];
  y = addSectionHeading(doc, 'Identity & Emergency', y);
  y = addKV(doc, idLeft, idRight, y);

  // Family
  const famLeft = [
    { label: 'Father', value: data.fatherName || '' },
    { label: 'Mother', value: data.motherName || '' },
    { label: 'Sibling', value: data.siblingName || '' },
  ];
  const famRight = [
    { label: 'Spouse', value: data.spouseName || '' },
    { label: 'Nominee', value: data.nomineeName || '' },
  ];
  y = addSectionHeading(doc, 'Family', y);
  y = addKV(doc, famLeft, famRight, y);

  // Footer
  const totalPages = doc.getNumberOfPages();
  doc.setPage(totalPages);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated by HRMS.Pro! · ${new Date().toLocaleDateString()}`, 14, FOOTER_Y);
  doc.text(`Page ${totalPages}`, 196, FOOTER_Y, { align: 'right' });

  const filename = `${fullName.replace(/\s+/g, '_')}_Resume.pdf`;
  doc.save(filename);
};
