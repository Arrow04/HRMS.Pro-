import api from './api';

export interface DashboardStats {
  totalEmployees: number;
  activeAttendance: number;
  pendingLeaves: number;
  monthlyPayroll: string;
  monthlyPayrollValue: number;
  departmentDistribution: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
  recentActivities: Array<{
    name: string;
    event: string;
    time: string;
    type: string;
  }>;
}

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const response = await api.get<DashboardStats>('/dashboard/stats');
  return response.data;
};
