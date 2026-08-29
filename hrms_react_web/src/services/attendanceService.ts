import api from './api';
import { fetchAllEmployeePickerList } from './employeeListService';

export interface AttendanceRecord {
  id: number;
  employeeId: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  workHours: number;
  notes: string;
  location?: string;
  checkInLocationName?: string;
  checkInLatitude?: number;
  checkInLongitude?: number;
  checkInSelfieUrl?: string;
  checkOutLocationName?: string;
  checkOutLatitude?: number;
  checkOutLongitude?: number;
  checkOutSelfieUrl?: string;
  employeeName?: string;
  employeeCode?: string;
  department?: string;
}

export const getAttendance = async (params?: { date?: string; employeeId?: number }) => {
  const response = await api.get<AttendanceRecord[]>('/attendance', { params });
  return response.data;
};

export const clockIn = async (data: {
  latitude: number;
  longitude: number;
  locationName?: string;
  selfieData?: string;
  clientRequestId?: string;
}) => {
  const response = await api.post('/attendance/checkin', data);
  return response.data;
};

export const clockOut = async (data: {
  latitude: number;
  longitude: number;
  locationName?: string;
  selfieData?: string;
  clientRequestId?: string;
}) => {
  const response = await api.post('/attendance/checkout', data);
  return response.data;
};

export const createManualAttendance = async (data: {
  employeeId: number;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: string;
  notes?: string;
}) => {
  const response = await api.post('/attendance/manual', data);
  return response.data;
};

export const getOrganizations = async () => {
  const response = await api.get('/organizations');
  return response.data;
};

export const getDepartments = async (organizationId?: number) => {
  const response = await api.get('/departments', { params: { organizationId } });
  return response.data;
};

export const getEmployees = async (organizationId?: number) => {
  const result = await fetchAllEmployeePickerList({ status: 'active' });
  return result.data;
};

export const bulkUploadAttendance = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/attendance/bulk-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

export const downloadAttendanceTemplate = async () => {
  const response = await api.get('/attendance/template', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'attendance_template.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};
