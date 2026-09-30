import { jsPDF } from 'jspdf';
import { personDisplayName } from '../utils/employeeNameUtils';
import { uploadUrl } from '../utils/uploadUrl';

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
  accountHolderName?: string;
  ifscCode?: string;
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
  currentState?: string;
  currentPincode?: string;
  permanentState?: string;
  permanentPincode?: string;
  permanentLandmark?: string;
  birthCertificateNumber?: string;
  spousePhone?: string;
  numberOfChildren?: string | number;
  childrenNames?: string;
  nomineeRelationship?: string;
  pfNumber?: string;
  pfUan?: string;
  esicNumber?: string;
  gratuityApplicable?: boolean;
  mediclaimNumber?: string;
  mediclaimProvider?: string;
  lifeInsuranceNumber?: string;
  lifeInsuranceProvider?: string;
  deviceType?: string;
  deviceSerialNumber?: string;
  deviceIpAddress?: string;
  deviceMacAddress?: string;
  deviceAssignedDate?: string;
  itAssignedBy?: string;
  itAssignedDate?: string;
  itCompletionDate?: string;
  itNotes?: string;
  itChecklist?: string[];
  salaryTemplateName?: string;
  payFrequency?: string;
  payRate?: string | number;
  achievementsDetails?: Array<Record<string, unknown>>;
  activitiesDetails?: Array<Record<string, unknown>>;
  personWithDisability?: boolean;
  branchNames?: string;
  deviceName?: string;
  geofenceEnabled?: boolean;
}

const STR = (v: unknown) => String(v ?? '').trim();

// jsPDF core fonts are Latin-1 only — anything else renders as a "?" glyph
const T = (v: string): string =>
  String(v ?? '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u20B9/g, 'Rs. ')
    .replace(/\u00A0/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\u0000-\u00FF]/g, '');

// Pretty-print raw DB tokens: west_bengal -> West Bengal, full_time -> Full Time
const H = (v: unknown): string => {
  const s = STR(v);
  return /^[a-z][a-z_ ]*$/.test(s)
    ? s.replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase())
    : s;
};

const fmtDate = (d: unknown): string => {
  const s = STR(d);
  if (!s) return '';
  return s.split('T')[0];
};

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
  y = ensureSpace(doc, y, 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(29, 100, 242);
  doc.text(T(title), 14, y);
  doc.setDrawColor(203, 213, 225);
  doc.line(14, y + 2, 196, y + 2);
  return y + 6.5;
};

// Truncate text with ellipsis so it can never exceed maxWidth.
const clip = (doc: jsPDF, s: string, w: number): string => {
  if (doc.getTextWidth(s) <= w) return s;
  let out = s;
  while (out.length > 1 && doc.getTextWidth(`${out}...`) > w) out = out.slice(0, -1);
  return `${out}...`;
};

const addKV = (doc: jsPDF, left: { label: string; value: string }[], right: { label: string; value: string }[], y: number): number => {
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i++) {
    const l = left[i];
    const r = right[i];
    const lVal = l ? T(H(l.value)) : '';
    const rVal = r ? T(H(r.value)) : '';
    if (!lVal && !rVal) continue; // skip fully empty rows to save space
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    // Measure labels so long labels can never collide with values.
    let lLabel = l && lVal && l.label ? T(`${l.label}:`) : '';
    let rLabel = r && rVal && r.label ? T(`${r.label}:`) : '';
    // Right label capped at 60mm, drawn right-aligned ending at 154.
    if (rLabel) rLabel = clip(doc, rLabel, 60);
    const rLabelW = rLabel ? doc.getTextWidth(rLabel) : 0;
    // Left value column ends before the right label begins (never past 125
    // in two-column rows; 194 = full content width in single-column rows).
    const lValueEnd = right.length ? Math.min(125, 154 - rLabelW - 4) : 194;
    // Left label always leaves at least 35mm for its value.
    if (lLabel) lLabel = clip(doc, lLabel, lValueEnd - 16 - 35);
    const lLabelW = lLabel ? doc.getTextWidth(lLabel) : 0;
    const lValueX = Math.max(70, 16 + lLabelW + 3);
    const lValueW = Math.max(30, lValueEnd - lValueX);
    // Right value: right-aligned at 196, max 40 wide (starts at >=156),
    // guaranteed 2mm gap after the right label.
    const rValueW = 40;
    const lLines = lVal ? (doc.splitTextToSize(lVal, lValueW) as string[]) : [];
    const rLines = rVal ? (doc.splitTextToSize(rVal, rValueW) as string[]) : [];
    const rowLines = Math.max(1, lLines.length, rLines.length);
    y = ensureSpace(doc, y, 5 * rowLines + 2);
    if (lVal) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      if (lLabel) {
        doc.setTextColor(148, 163, 184);
        doc.text(lLabel, 16, y);
      }
      doc.setTextColor(51, 65, 85);
      doc.text(lLines, lValueX, y);
    }
    if (rVal) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      if (rLabel) {
        doc.setTextColor(148, 163, 184);
        doc.text(rLabel, 154, y, { align: 'right' });
      }
      doc.setTextColor(51, 65, 85);
      doc.text(rLines, 196, y, { align: 'right' });
    }
    y += 5 * rowLines;
  }
  return y + 3;
};

export const generateResumePdf = (data: ResumeData) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const fullName = T(personDisplayName(data, 'Employee'));

  // Header band
  doc.setFillColor(29, 100, 242);
  doc.rect(0, 0, pageWidth, 30, 'F');

  const photo = uploadUrl(data.photoUrl);
  if (photo) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(pageWidth - 14 - 23, 3.5, 23, 23, 2, 2, 'F');
      doc.addImage(photo, 'JPEG', pageWidth - 14 - 22, 4.5, 21, 21, undefined, 'FAST');
    } catch {
      // ignore photo decode failures
    }
  }

  doc.setTextColor(255, 255, 255);
  const nameAvail = pageWidth - 28 - (photo ? 32 : 0);
  doc.setFont('helvetica', 'bold');
  let nameSize = 20;
  doc.setFontSize(nameSize);
  while (nameSize > 12 && doc.getTextWidth(fullName) > nameAvail) {
    nameSize -= 1;
    doc.setFontSize(nameSize);
  }
  doc.text(clip(doc, fullName, nameAvail), 14, 15);
  doc.setFont('helvetica', 'normal');
  const headerLine = [data.employeeCode ? `Code: ${data.employeeCode}` : '', data.designationName || '', data.companyName || ''].filter(Boolean).join('  |  ');
  if (headerLine) {
    let lineSize = 10;
    doc.setFontSize(lineSize);
    const lineTxt = T(headerLine);
    while (lineSize > 7 && doc.getTextWidth(lineTxt) > nameAvail) {
      lineSize -= 0.5;
      doc.setFontSize(lineSize);
    }
    doc.text(clip(doc, lineTxt, nameAvail), 14, 23);
  }

  let y = 38;

  // 1. Personal & Family
  y = addSectionHeading(doc, 'Personal & Family', y);
  y = addKV(doc, [
    { label: 'Gender', value: data.gender || '' },
    { label: 'Date of Birth', value: fmtDate(data.dateOfBirth) },
    { label: 'Blood Group', value: data.bloodGroup || '' },
    { label: 'Marital Status', value: data.maritalStatus || '' },
    { label: 'Person with Disabilities', value: typeof data.personWithDisability === 'boolean' ? (data.personWithDisability ? 'Yes' : 'No') : '' },
    { label: 'Father', value: data.fatherName || '' },
    { label: 'Mother', value: data.motherName || '' },
    { label: 'Sibling', value: data.siblingName || '' },
    { label: 'Children', value: data.childrenNames || '' },
  ], [
    { label: 'Emergency Contact', value: data.emergencyContact ? `${data.emergencyContact}${data.emergencyPhone ? ` · ${data.emergencyPhone}` : ''}` : '' },
    { label: 'Children Count', value: data.numberOfChildren !== undefined && data.numberOfChildren !== null && !['', '0'].includes(String(data.numberOfChildren)) ? String(data.numberOfChildren) : '' },
    { label: 'Spouse', value: [data.spouseName || '', data.spousePhone || ''].filter(Boolean).join(' · ') },
  ], y);

  // 2. Address & Identity
  y = addSectionHeading(doc, 'Address & Identity', y);
  y = addKV(doc, [
    { label: 'Email', value: data.email || '' },
    { label: 'Phone', value: data.phone || '' },
    { label: 'Current Address', value: data.currentAddress || '' },
    { label: 'Current State', value: data.currentState || '' },
    { label: 'Current Pincode', value: data.currentPincode || '' },
    { label: 'Landmark', value: data.landmark || '' },
    { label: 'Aadhaar', value: data.aadharNumber || '' },
    { label: 'PAN', value: data.panNumber || '' },
    { label: 'Voter ID', value: data.voterId || '' },
    { label: 'Birth Certificate', value: data.birthCertificateNumber || '' },
  ], [
    { label: 'Permanent Address', value: data.permanentAddress || '' },
    { label: 'Permanent State', value: data.permanentState || '' },
    { label: 'Permanent Pincode', value: data.permanentPincode || '' },
    { label: 'Permanent Landmark', value: data.permanentLandmark || '' },
    { label: 'Driving License', value: data.drivingLicense || '' },
    { label: 'Passport', value: data.passportNumber || '' },
  ], y);

  // 3. Education & Skills
  const eduRows = (data.educationDetails || []).filter((e) => e.educationLevel || e.institution || e.degree).map((e, i) => ({
    label: `Education ${i + 1}`,
    value: [
      [H(e.educationLevel), H(e.degree)].filter(Boolean).join(' — '),
      e.institution ? `Institution: ${H(e.institution)}` : '',
      e.fieldOfStudy ? `Field of Study: ${H(e.fieldOfStudy)}` : '',
      e.graduationYear ? `Year: ${STR(e.graduationYear)}` : '',
      e.grade ? (String(e.grade).trim().match(/^\d+(\.\d+)?\s*%?$/) ? `Percentage: ${String(e.grade).trim().replace(/%?$/, '%')}` : `Grade: ${STR(e.grade)}`) : '',
    ].filter(Boolean).join(' · '),
  }));
  const certRows = (data.certifications || []).filter((c) => c.name).map((c, i) => ({
    label: `Certification ${i + 1}`,
    value: [STR(c.name), c.organization ? `Organization: ${STR(c.organization)}` : '', c.issueDate ? `Issued: ${fmtDate(c.issueDate)}` : '', c.expiryDate ? `Expires: ${fmtDate(c.expiryDate)}` : ''].filter(Boolean).join(' · '),
  }));
  const skills = (data.skillsList || []).filter((s) => s.name).map((s) => [STR(s.name), s.proficiency ? `(${STR(s.proficiency)})` : '', s.years ? `${STR(s.years)} yrs` : ''].filter(Boolean).join(' ')).join(', ');
  const languages = (data.languages || []).filter((l) => l.name).map((l) => [STR(l.name), l.proficiency ? `(${STR(l.proficiency)})` : '', l.isNative ? '(Native)' : ''].filter(Boolean).join(' ')).join(', ');
  const skillRows = [
    skills ? { label: 'Skills', value: skills } : null,
    languages ? { label: 'Languages', value: languages } : null,
  ].filter(Boolean) as { label: string; value: string }[];
  const eduRowsAll = [...eduRows, ...certRows, ...skillRows];
  if (eduRowsAll.length) {
    y = addSectionHeading(doc, 'Education & Skills', y);
    y = addKV(doc, eduRowsAll, [], y);
  }

  // 4. Experience & More
  const expRows = (data.experienceDetails || []).filter((e) => e.company || e.designation).map((e, i) => ({
    label: `Experience ${i + 1}`,
    value: [
      STR(e.company),
      STR(e.designation),
      e.from ? `${fmtDate(e.from)} - ${e.to ? fmtDate(e.to) : 'Present'}` : '',
      e.reason ? `Reason: ${STR(e.reason)}` : '',
    ].filter(Boolean).join(' · '),
  }));
  const achRows = (data.achievementsDetails || []).filter((a) => a.title).map((a, i) => ({
    label: `Achievement ${i + 1}`,
    value: [STR(a.title), STR(a.org) ? `Organization: ${STR(a.org)}` : '', fmtDate(a.date), STR(a.description)].filter(Boolean).join(' · '),
  }));
  const actRows = (data.activitiesDetails || []).filter((ac) => ac.name).map((ac, i) => ({
    label: `Activity ${i + 1}`,
    value: [STR(ac.name), STR(ac.type) ? `Type: ${STR(ac.type)}` : '', STR(ac.role) ? `Role: ${STR(ac.role)}` : '', STR(ac.description)].filter(Boolean).join(' · '),
  }));
  const expRowsAll = [...expRows, ...achRows, ...actRows];
  if (expRowsAll.length) {
    y = addSectionHeading(doc, 'Experience & More', y);
    y = addKV(doc, expRowsAll, [], y);
  }

  // 5. Employment
  y = addSectionHeading(doc, 'Employment', y);
  y = addKV(doc, [
    { label: 'Company', value: data.companyName || '' },
    { label: 'Department', value: data.departmentName || '' },
    { label: 'Designation', value: data.designationName || '' },
    { label: 'Branch', value: data.branchNames || '' },
  ], [
    { label: 'Employment Type', value: data.employmentType || '' },
    { label: 'Join Date', value: fmtDate(data.joinDate) },
    { label: 'Status', value: data.status || '' },
  ], y);

  // 6. Benefits & Tax
  const benLeft = [
    { label: 'PF Number', value: data.pfNumber || '' },
    { label: 'PF UAN', value: data.pfUan || '' },
    { label: 'ESIC Number', value: data.esicNumber || '' },
    { label: 'Gratuity', value: typeof data.gratuityApplicable === 'boolean' ? (data.gratuityApplicable ? 'Applicable' : 'Not Applicable') : '' },
  ];
  const benRight = [
    { label: 'Mediclaim', value: [data.mediclaimNumber || '', data.mediclaimProvider || ''].filter(Boolean).join(' - ') },
    { label: 'Life Insurance', value: [data.lifeInsuranceNumber || '', data.lifeInsuranceProvider || ''].filter(Boolean).join(' - ') },
    { label: 'Nominee', value: [data.nomineeName || '', data.nomineeRelationship ? `(${data.nomineeRelationship})` : ''].filter(Boolean).join(' ') },
  ];
  if (benLeft.some((f) => f.value) || benRight.some((f) => f.value)) {
    y = addSectionHeading(doc, 'Benefits & Tax', y);
    y = addKV(doc, benLeft, benRight, y);
  }

  // 7. Bank
  const banks = (data.bankAccounts || []).filter((a) => a.bankName || a.bankAccountNumber).map((a) => `${STR(a.bankName)}${a.bankAccountNumber ? ` (${STR(a.bankAccountNumber)})` : ''}${a.ifscCode ? ` - IFSC: ${STR(a.ifscCode)}` : ''}`).join(', ');
  y = addSectionHeading(doc, 'Bank', y);
  y = addKV(doc, [
    { label: 'Bank Accounts', value: banks },
    { label: 'Account Holder', value: data.accountHolderName || '' },
    { label: 'IFSC Code', value: data.ifscCode || '' },
  ], [], y);

  // 8. Salary
  y = addSectionHeading(doc, 'Salary', y);
  y = addKV(doc, [
    { label: 'Base Salary', value: data.baseSalary ? `Rs. ${data.baseSalary}` : '' },
    { label: 'Salary Template', value: data.salaryTemplateName || '' },
    { label: 'Pay Frequency', value: data.payFrequency || '' },
    { label: 'Pay Rate', value: data.payRate ? `Rs. ${data.payRate}` : '' },
  ], [], y);

  // 9. Login & Device
  const devLeft = [
    { label: 'Device Name', value: data.deviceName || '' },
    { label: 'Device Type', value: data.deviceType || '' },
    { label: 'Device Serial', value: data.deviceSerialNumber || '' },
    { label: 'Assigned Date', value: fmtDate(data.deviceAssignedDate) },
  ];
  const devRight = [
    { label: 'IP Address', value: data.deviceIpAddress || '' },
    { label: 'MAC Address', value: data.deviceMacAddress || '' },
  ];
  if (devLeft.some((f) => f.value) || devRight.some((f) => f.value)) {
    y = addSectionHeading(doc, 'Login & Device', y);
    y = addKV(doc, devLeft, devRight, y);
  }

  // 10. IT Setup
  const itLeft = [
    { label: 'IT Assigned By', value: data.itAssignedBy || '' },
    { label: 'IT Assigned Date', value: fmtDate(data.itAssignedDate) },
    { label: 'IT Completion Date', value: fmtDate(data.itCompletionDate) },
    { label: 'IT Notes', value: data.itNotes || '' },
  ];
  const itDone = (data.itChecklist || []).filter(Boolean);
  if (itLeft.some((f) => f.value) || itDone.length) {
    y = addSectionHeading(doc, 'IT Setup', y);
    y = addKV(doc, itLeft, [], y);
    if (itDone.length) {
      // One wrapped paragraph instead of one row per checklist item —
      // per-item rows pushed the PDF to 3 pages.
      addKV(doc, [{ label: 'Checklist', value: `${itDone.length} completed: ${itDone.join(' · ')}` }], [], y);
    }
  }

  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.text(T(`Generated by HRMS.Pro! · ${new Date().toLocaleString()}`), 14, FOOTER_Y);
    doc.text(`Page ${p} of ${totalPages}`, 196, FOOTER_Y, { align: 'right' });
  }

  const filename = `${fullName.replace(/\s+/g, '_')}_Resume.pdf`;
  doc.save(filename);
};
