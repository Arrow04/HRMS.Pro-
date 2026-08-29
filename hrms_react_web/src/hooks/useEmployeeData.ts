import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import type { Company, Department, Branch, Designation } from '../types';
import type { Organization } from '../services/employeeService';
import { useMasterData } from './useMasterData';

export const useEmployeeData = (filterOrgId: string | number, filterCompanyId: string | number, formDataCompanyId: string | number, isSuperAdmin: boolean) => {
  // Master data for dropdowns
  const { data: genderOptions = [] } = useMasterData('GENDER');
  const { data: statusOptions = [] } = useMasterData('EMPLOYEE_STATUS');
  const { data: bloodGroupOptions = [] } = useMasterData('BLOOD_GROUP');
  const { data: employmentTypeOptions = [] } = useMasterData('EMPLOYMENT_TYPE');
  const { data: maritalStatusOptions = [] } = useMasterData('MARITAL_STATUS');
  const { data: educationLevelOptions = [] } = useMasterData('EDUCATION_LEVEL');
  const { data: deviceTypeOptions = [] } = useMasterData('EMPLOYEE_DEVICE_TYPE');
  const { data: activityTypeOptions = [] } = useMasterData('ACTIVITY_TYPE');

  // Reference data queries
  const { data: organizationsList } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      try {
        const response = await api.get('/organizations');
        const data: (Organization & { status?: string; is_active?: boolean })[] = response.data || [];
        return data.sort((a, b) => {
          const aActive = a.status !== 'inactive' && a.is_active !== false;
          const bActive = b.status !== 'inactive' && b.is_active !== false;
          return aActive === bActive ? 0 : aActive ? -1 : 1;
        });
      } catch (error) { throw error; }
    },
    enabled: isSuperAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const { data: companiesList } = useQuery({
    queryKey: ['companies', filterOrgId],
    queryFn: async () => {
      try {
        const params = filterOrgId !== 'all' ? `?organizationId=${filterOrgId}` : '';
        const response = await api.get(`/companies${params}`);
        const data: (Company & { is_active?: boolean })[] = response.data || [];
        return data.sort((a, b) => {
          const aActive = a.status !== 'inactive' && a.is_active !== false;
          const bActive = b.status !== 'inactive' && b.is_active !== false;
          return aActive === bActive ? 0 : aActive ? -1 : 1;
        });
      } catch (error) { throw error; }
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: branchesList } = useQuery({
    queryKey: ['branches', formDataCompanyId],
    queryFn: async () => {
      try {
        const params = formDataCompanyId ? `?companyId=${formDataCompanyId}` : '';
        const response = await api.get(`/branches${params}`);
        const data: (Branch & { is_active?: boolean })[] = response.data || [];
        return data.sort((a, b) => {
          const aActive = a.status !== 'inactive' && a.is_active !== false;
          const bActive = b.status !== 'inactive' && b.is_active !== false;
          return aActive === bActive ? 0 : aActive ? -1 : 1;
        });
      } catch (error) { throw error; }
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: departmentsList } = useQuery({
    queryKey: ['departments', formDataCompanyId],
    queryFn: async () => {
      try {
        const params = formDataCompanyId ? `?companyId=${formDataCompanyId}` : '';
        const response = await api.get(`/departments${params}`);
        const data: (Department & { is_active?: boolean })[] = response.data || [];
        return data.sort((a, b) => {
          const aActive = a.status !== 'inactive' && a.is_active !== false;
          const bActive = b.status !== 'inactive' && b.is_active !== false;
          return aActive === bActive ? 0 : aActive ? -1 : 1;
        });
      } catch (error) { throw error; }
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: designations = [], isLoading: loadingDesignations } = useQuery({
    queryKey: ['designations', formDataCompanyId],
    queryFn: async () => {
      try {
        const params = formDataCompanyId ? `?companyId=${formDataCompanyId}` : '';
        const response = await api.get(`/api/designations${params}`);
        const data: (Designation & { is_active?: boolean })[] = response.data || [];
        return data.sort((a, b) => {
          const aActive = a.status !== 'inactive' && a.is_active !== false;
          const bActive = b.status !== 'inactive' && b.is_active !== false;
          return aActive === bActive ? 0 : aActive ? -1 : 1;
        });
      } catch (error) { throw error; }
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    masterData: {
      genderOptions,
      statusOptions,
      bloodGroupOptions,
      employmentTypeOptions,
      maritalStatusOptions,
      educationLevelOptions,
      deviceTypeOptions,
      activityTypeOptions,
    },
    organizationalData: {
      organizationsList,
      companiesList,
      branchesList,
      departmentsList,
      designations,
      loadingDesignations,
    },
  };
};
