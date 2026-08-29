/**
 * Employee API Service - handles all HTTP communication
 * Following Single Responsibility Principle
 */

import api from './api';
import type {
  IEmployee,
  IEmployeeTransfer,
  IBranchAssignment,
  IDepartmentAssignment,
  ILifecycleEvent,
  ICreateEmployeeDTO,
  IUpdateEmployeeDTO,
  ICreateTransferDTO,
  ICreateAssignmentDTO,
  IEmployeeFilters
} from '../models/employee.model';

// Employee CRUD
export const getEmployees = async (filters?: IEmployeeFilters): Promise<IEmployee[]> => {
  const params = new URLSearchParams();
  if (filters?.search) params.append('search', filters.search);
  if (filters?.companyId) params.append('company_id', filters.companyId.toString());
  if (filters?.branchId) params.append('branch_id', filters.branchId.toString());
  if (filters?.departmentId) params.append('department_id', filters.departmentId.toString());
  if (filters?.status) params.append('status', filters.status);
  
  const response = await api.get(`/employees?${params.toString()}`);
  return response.data;
};

export const getEmployeeById = async (id: number): Promise<IEmployee> => {
  const response = await api.get(`/employees/${id}`);
  return response.data;
};

export const createEmployee = async (data: ICreateEmployeeDTO): Promise<IEmployee> => {
  const response = await api.post('/employees', data);
  return response.data;
};

export const updateEmployee = async (id: number, data: IUpdateEmployeeDTO): Promise<IEmployee> => {
  const response = await api.put(`/employees/${id}`, data);
  return response.data;
};

export const deleteEmployee = async (id: number): Promise<void> => {
  await api.delete(`/employees/${id}`);
};

// Transfer Operations
export const getTransfers = async (employeeId?: number): Promise<IEmployeeTransfer[]> => {
  const params = employeeId ? `?employee_id=${employeeId}` : '';
  const response = await api.get(`/employees/transfers${params}`);
  return response.data;
};

export const getTransferById = async (id: number): Promise<IEmployeeTransfer> => {
  const response = await api.get(`/employees/transfers/${id}`);
  return response.data;
};

export const createTransfer = async (data: ICreateTransferDTO): Promise<IEmployeeTransfer> => {
  const response = await api.post('/employees/transfers', data);
  return response.data;
};

export const approveTransfer = async (id: number): Promise<IEmployeeTransfer> => {
  const response = await api.put(`/employees/transfers/${id}/approve`);
  return response.data;
};

export const completeTransfer = async (id: number): Promise<IEmployeeTransfer> => {
  const response = await api.put(`/employees/transfers/${id}/complete`);
  return response.data;
};

export const rejectTransfer = async (id: number, reason: string): Promise<IEmployeeTransfer> => {
  const response = await api.put(`/employees/transfers/${id}/reject?reason=${encodeURIComponent(reason)}`);
  return response.data;
};

export const deleteTransfer = async (id: number): Promise<void> => {
  await api.delete(`/employees/transfers/${id}`);
};

// Assignment Operations
export const getBranchAssignments = async (employeeId?: number): Promise<IBranchAssignment[]> => {
  const params = employeeId ? `?employee_id=${employeeId}` : '';
  const response = await api.get(`/employees/assignments/branches${params}`);
  return response.data;
};

export const getDepartmentAssignments = async (employeeId?: number): Promise<IDepartmentAssignment[]> => {
  const params = employeeId ? `?employee_id=${employeeId}` : '';
  const response = await api.get(`/employees/assignments/departments${params}`);
  return response.data;
};

export const getEmployeeAssignments = async (employeeId: number): Promise<{
  branches: IBranchAssignment[];
  departments: IDepartmentAssignment[];
}> => {
  const response = await api.get(`/employees/assignments/employee/${employeeId}`);
  return response.data;
};

export const createBranchAssignment = async (data: ICreateAssignmentDTO): Promise<IBranchAssignment> => {
  const response = await api.post('/employees/assignments/branches', data);
  return response.data;
};

export const createDepartmentAssignment = async (data: ICreateAssignmentDTO): Promise<IDepartmentAssignment> => {
  const response = await api.post('/employees/assignments/departments', data);
  return response.data;
};

export const updateBranchAssignment = async (
  id: number,
  data: Partial<IBranchAssignment>
): Promise<IBranchAssignment> => {
  const response = await api.put(`/employees/assignments/branches/${id}`, data);
  return response.data;
};

export const updateDepartmentAssignment = async (
  id: number,
  data: Partial<IDepartmentAssignment>
): Promise<IDepartmentAssignment> => {
  const response = await api.put(`/employees/assignments/departments/${id}`, data);
  return response.data;
};

// Lifecycle Events
export const getLifecycleEvents = async (employeeId: number): Promise<ILifecycleEvent[]> => {
  const response = await api.get(`/employees/${employeeId}/lifecycle`);
  return response.data;
};
