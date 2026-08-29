import api from './api';

export interface LookupItem {
  id: string;
  tabCategory: string;
  fieldName: string;
  key: string;
  value: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface TabLookupStructure {
  [tabCategory: string]: {
    [fieldName: string]: LookupItem[];
  };
}

// Get lookup by field name (backward compatibility)
export const getLookupByField = async (fieldName: string): Promise<LookupItem[]> => {
  const response = await api.get(`/lookup/field/${fieldName}`);
  return response.data;
};

// Get lookup by tab and field name (new tab-based approach)
export const getLookupByTabAndField = async (tabCategory: string, fieldName: string): Promise<LookupItem[]> => {
  const response = await api.get(`/lookup/tab/${tabCategory}/${fieldName}`);
  return response.data;
};

// Get all lookups by tab
export const getLookupByTab = async (tabCategory: string): Promise<{ [fieldName: string]: LookupItem[] }> => {
  const response = await api.get(`/lookup/tab/${tabCategory}`);
  return response.data;
};

// Get all lookups
export const getAllLookups = async (): Promise<LookupItem[]> => {
  const response = await api.get('/lookup');
  return response.data;
};

// Get complete lookup structure
export const getLookupStructure = async (): Promise<TabLookupStructure> => {
  const response = await api.get('/lookup/structure');
  return response.data;
};

// Get tab categories
export const getTabCategories = async (): Promise<string[]> => {
  const response = await api.get('/lookup/tabs');
  return response.data;
};

// Get field names
export const getFieldNames = async (): Promise<string[]> => {
  const response = await api.get('/lookup/fields');
  return response.data;
};

// Tab categories matching employee form tabs
export const TAB_CATEGORIES = {
  BASIC: 'basic',
  PERSONAL: 'personal',
  IDENTITY: 'identity',
  ACADEMIC: 'academic',
  FAMILY: 'family',
  ADDRESS: 'address',
  PREVIOUSEMPLOYMENT: 'previousEmployment',
  DOCUMENTS: 'documents',
  BANK: 'bank',
  BENEFITS: 'benefits',
  SALARY: 'salary',
  EMPLOYMENT: 'employment',
  ROASTER: 'roaster',
  LOGIN: 'login',
  DEVICE: 'device'
} as const;

// Field names organized by tab categories
export const TAB_FIELD_MAPPING = {
  // Personal tab
  [TAB_CATEGORIES.PERSONAL]: {
    GENDER: 'gender',
    BLOOD_GROUP: 'blood_group',
    MARITAL_STATUS: 'marital_status'
  },
  // Identity tab
  [TAB_CATEGORIES.IDENTITY]: {
    DOCUMENT_TYPE: 'document_type'
  },
  // Academic tab
  [TAB_CATEGORIES.ACADEMIC]: {
    EDUCATION_LEVEL: 'education_level'
  },
  // Family tab
  [TAB_CATEGORIES.FAMILY]: {
    RELATIONSHIP: 'relationship'
  },
  // Address tab
  [TAB_CATEGORIES.ADDRESS]: {
    COUNTRY: 'country',
    STATE: 'state',
    CITY: 'city'
  },
  // Previous Employment tab
  [TAB_CATEGORIES.PREVIOUSEMPLOYMENT]: {
    EMPLOYMENT_TYPE: 'employment_type'
  },
  // Documents tab
  [TAB_CATEGORIES.DOCUMENTS]: {
    DOCUMENT_TYPE: 'document_type'
  },
  // Benefits tab
  [TAB_CATEGORIES.BENEFITS]: {
    BENEFIT_TYPE: 'benefit_type'
  },
  // Salary tab
  [TAB_CATEGORIES.SALARY]: {
    SALARY_FREQUENCY: 'salary_frequency',
    PAYROLL_TYPE: 'payroll_type'
  },
  // Employment tab
  [TAB_CATEGORIES.EMPLOYMENT]: {
    EMPLOYMENT_TYPE: 'employment_type'
  },
  // Roaster tab
  [TAB_CATEGORIES.ROASTER]: {
    SHIFT_TYPE: 'shift_type',
    WORK_PATTERN: 'work_pattern'
  },
  // Login tab
  [TAB_CATEGORIES.LOGIN]: {
    USER_ROLE: 'user_role',
    ACCOUNT_STATUS: 'account_status'
  },
  // Device tab
  [TAB_CATEGORIES.DEVICE]: {
    DEVICE_TYPE: 'device_type'
  }
} as const;

// Legacy lookup categories for backward compatibility
export const LOOKUP_CATEGORIES = {
  GENDER: 'gender',
  BLOOD_GROUP: 'blood_group',
  MARITAL_STATUS: 'marital_status',
  EMPLOYMENT_TYPE: 'employment_type',
  EDUCATION_LEVEL: 'education_level',
  RELATIONSHIP: 'relationship',
  USER_ROLE: 'user_role',
  DEVICE_TYPE: 'device_type',
  BENEFIT_TYPE: 'benefit_type',
  SALARY_FREQUENCY: 'salary_frequency',
  SHIFT_TYPE: 'shift_type',
  DOCUMENT_TYPE: 'document_type',
  COUNTRY: 'country',
  STATE: 'state',
  CITY: 'city',
  PAYROLL_TYPE: 'payroll_type',
  WORK_PATTERN: 'work_pattern',
  ACCOUNT_STATUS: 'account_status'
} as const;

// CRUD Operations for Core Master Management
export const createLookupItem = async (lookupData: {
  tabCategory: string;
  fieldName: string;
  key: string;
  value: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<LookupItem> => {
  const response = await api.post('/lookup/', lookupData);
  return response.data;
};

export const updateLookupItem = async (
  id: number,
  lookupData: Partial<LookupItem>
): Promise<LookupItem> => {
  const response = await api.put(`/lookup/${id}`, lookupData);
  return response.data;
};

export const deleteLookupItem = async (id: number): Promise<{ message: string }> => {
  const response = await api.delete(`/lookup/${id}`);
  return response.data;
};

export const toggleLookupItem = async (id: number): Promise<{ id: number; isActive: boolean }> => {
  const response = await api.patch(`/lookup/${id}/toggle`);
  return response.data;
};

export const bulkCreateLookupItems = async (
  items: Array<{
    tabCategory: string;
    fieldName: string;
    key: string;
    value: string;
    description?: string;
    sortOrder?: number;
    isActive?: boolean;
  }>
): Promise<{ message: string; count: number }> => {
  const response = await api.post('/lookup/bulk', items);
  return response.data;
};

// Legacy function for backward compatibility
export const getLookupBySubCategory = getLookupByField;
