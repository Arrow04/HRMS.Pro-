import api from './api';

export interface InvestmentDeclaration {
  id: number;
  employeeId: number;
  financialYear: string;
  taxRegimeId?: number;
  taxRegimeName?: string;
  deduction80c: number;
  deduction80d: number;
  hraExemption: number;
  ltaExemption: number;
  npsDeduction: number;
  homeLoanInterest: number;
  otherIncome: number;
  previousEmployerIncome: number;
  previousEmployerTds: number;
  optOutStandardDeduction: boolean;
  status: string;
  declarationDate?: string;
  submittedAt?: string;
  approvedBy?: number;
  approvedAt?: string;
  notes?: string;
}

export interface DeclarationPayload {
  financialYear: string;
  taxRegimeId?: number;
  deduction80c?: number;
  deduction80d?: number;
  hraExemption?: number;
  ltaExemption?: number;
  npsDeduction?: number;
  homeLoanInterest?: number;
  otherIncome?: number;
  previousEmployerIncome?: number;
  previousEmployerTds?: number;
  optOutStandardDeduction?: boolean;
  notes?: string;
}

export const listDeclarations = async (params?: {
  employeeId?: number;
  financialYear?: string;
}): Promise<InvestmentDeclaration[]> => {
  const response = await api.get<{ status: string; items: InvestmentDeclaration[] }>('/investment-declarations', { params });
  return response.data.items;
};

export const getDeclaration = async (declId: number): Promise<InvestmentDeclaration> => {
  const response = await api.get<{ status: string; item: InvestmentDeclaration }>(`/investment-declarations/${declId}`);
  return response.data.item;
};

export const createDeclaration = async (payload: DeclarationPayload): Promise<InvestmentDeclaration> => {
  const response = await api.post<{ status: string; item: InvestmentDeclaration }>('/investment-declarations', payload);
  return response.data.item;
};

export const updateDeclaration = async (declId: number, payload: DeclarationPayload): Promise<InvestmentDeclaration> => {
  const response = await api.put<{ status: string; item: InvestmentDeclaration }>(`/investment-declarations/${declId}`, payload);
  return response.data.item;
};

export const submitDeclaration = async (declId: number): Promise<InvestmentDeclaration> => {
  const response = await api.post<{ status: string; item: InvestmentDeclaration }>(`/investment-declarations/${declId}/submit`);
  return response.data.item;
};

export const approveDeclaration = async (declId: number, notes?: string): Promise<InvestmentDeclaration> => {
  const response = await api.post<{ status: string; item: InvestmentDeclaration }>(`/investment-declarations/${declId}/approve`, { status: 'approved', notes });
  return response.data.item;
};

export const rejectDeclaration = async (declId: number, notes?: string): Promise<InvestmentDeclaration> => {
  const response = await api.post<{ status: string; item: InvestmentDeclaration }>(`/investment-declarations/${declId}/reject`, { status: 'rejected', notes });
  return response.data.item;
};

export const deleteDeclaration = async (declId: number): Promise<void> => {
  await api.delete(`/investment-declarations/${declId}`);
};