// Shared profile-completion calculation used by the employee form modal's live
// progress bar AND the onboarding/table percentages, so they always agree.

export const isFilled = (v: unknown): boolean => {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
};

// Static scalar fields per tab.
export const STATIC_FIELDS: Record<string, string[]> = {
  personal: ['firstName', 'employeeCode', 'gender', 'dateOfBirth', 'bloodGroup', 'maritalStatus', 'emergencyContact', 'emergencyPhone', 'fatherName', 'motherName', 'siblingName', 'spouseName', 'spousePhone', 'numberOfChildren', 'childrenNames'],
  address: ['currentAddress', 'permanentAddress', 'landmark', 'permanentLandmark', 'currentState', 'currentPincode', 'permanentState', 'permanentPincode', 'aadharNumber', 'panNumber', 'voterId', 'drivingLicense', 'passportNumber'],
  education: [],
  skills: [],
  employment: ['companyId', 'departmentId', 'designationId', 'branchIds', 'joinDate'],
  benefits: ['pfNumber', 'pfUan', 'esicNumber', 'gratuityApplicable', 'mediclaimNumber', 'mediclaimProvider', 'lifeInsuranceNumber', 'lifeInsuranceProvider', 'nomineeName', 'nomineeRelationship'],
  bank: ['bankName', 'bankAccountNumber', 'ifscCode', 'accountHolderName'],
  salary: ['baseSalary', 'salaryTemplateId'],
  login: ['email', 'phone', 'deviceName', 'deviceType', 'deviceSerialNumber', 'deviceIpAddress', 'deviceMacAddress'],
  it_setup: ['itAssignedDate', 'itCompletionDate', 'itAssignedBy', 'itNotes', 'itEmailCreated', 'itSystemAccess', 'itErpAccess', 'itCloudApps', 'itSharedDrives', 'itHrmsAccount', 'itGroupMemberships', 'itCredentialsIssued', 'itVpnAccess', 'itMfaEnabled', 'itPasswordManager', 'itRoleAssigned', 'itEndpointProtection', 'itHardwareAssigned', 'itPolicySigned', 'itTrainingDone', 'itAssetTag', 'itLaptopEncryption', 'itWorkPhone'],
};

// Dynamic list fields per tab: each item counts once when ANY required key is filled.
export const LIST_FIELDS: Record<string, { key: string; required: string[] }[]> = {
  education: [
    { key: 'educationDetails', required: ['educationLevel', 'institution', 'degree'] },
    { key: 'certifications', required: ['name'] },
    { key: 'languages', required: ['name'] },
    { key: 'skillsList', required: ['name'] },
  ],
  experience: [
    { key: 'experienceDetails', required: ['company', 'designation'] },
    { key: 'achievementsDetails', required: ['title'] },
    { key: 'activitiesDetails', required: ['name'] },
  ],
};

export const computeTabStats = (
  record: Record<string, unknown>,
  tid: string,
): { filled: number; total: number } => {
  const staticKeys = STATIC_FIELDS[tid] || [];
  let filled = staticKeys.filter((k) => isFilled(record[k])).length;
  let total = staticKeys.length;
  for (const lf of LIST_FIELDS[tid] || []) {
    const items = (record[lf.key] as Record<string, unknown>[] | undefined) || [];
    total += items.length;
    filled += items.filter((it) => lf.required.some((r) => isFilled(it[r]))).length;
  }
  return { filled, total };
};

export const computeProfileCompletion = (record: Record<string, unknown>): number => {
  const tabs = Object.keys({ ...STATIC_FIELDS, ...LIST_FIELDS });
  let filled = 0;
  let total = 0;
  for (const tid of tabs) {
    const s = computeTabStats(record, tid);
    filled += s.filled;
    total += s.total;
  }
  return total > 0 ? Math.min(100, Math.round((filled / total) * 100)) : 0;
};
