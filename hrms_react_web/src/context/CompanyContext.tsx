import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

export interface Company {
  id: number;
  name: string;
  code?: string;
  status?: string;
}

interface CompanyContextType {
  companies: Company[];
  selectedCompanyId: string;
  selectedCompany: Company | null;
  setSelectedCompanyId: (id: string) => void;
  loading: boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

const STORAGE_KEY = 'selectedCompanyId';

export const CompanyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) || 'all'
  );
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const res = await api.get('/companies', { params: { active_only: true } });
        if (active) {
          setCompanies(res.data || []);
        }
      } catch {
        // ignore
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user]);

  const setSelectedCompanyId = useCallback((id: string) => {
    setSelectedCompanyIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
    // Reload to apply the filter across all pages
    window.location.reload();
  }, []);

  const selectedCompany = companies.find(c => String(c.id) === selectedCompanyId) || null;

  return (
    <CompanyContext.Provider value={{ companies, selectedCompanyId, selectedCompany, setSelectedCompanyId, loading }}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = (): CompanyContextType => {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within a CompanyProvider');
  return ctx;
};
