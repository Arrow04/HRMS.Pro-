import api from './api';

export interface GLAccount {
  id: number;
  organizationId?: number;
  code: string;
  name: string;
  accountType: string;
  isSystem: boolean;
  isActive: boolean;
}

export interface JournalLine {
  id: number;
  accountId: number;
  accountCode?: string;
  accountName?: string;
  debit: number;
  credit: number;
  narration?: string;
}

export interface JournalEntry {
  id: number;
  organizationId?: number;
  companyId?: number;
  entryDate: string;
  entryType: string;
  referenceType?: string;
  referenceId?: number;
  referenceNo?: string;
  description?: string;
  status: string;
  createdAt: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
}

export const getAccounts = async (): Promise<GLAccount[]> => {
  const response = await api.get<{ status: string; items: GLAccount[] }>('/accounting/accounts');
  return response.data.items;
};

export const getJournals = async (params?: {
  entryType?: string;
  referenceType?: string;
  referenceId?: number;
  limit?: number;
}): Promise<JournalEntry[]> => {
  const response = await api.get<{ status: string; items: JournalEntry[] }>('/accounting/journals', { params });
  return response.data.items;
};

export const reverseJournal = async (journalId: number, reason?: string): Promise<void> => {
  await api.post(`/accounting/journals/${journalId}/reverse`, { reason });
};