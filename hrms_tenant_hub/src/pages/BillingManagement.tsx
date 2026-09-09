import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import BillingConfig from './BillingConfig';

export default function BillingManagement() {
  return (
    <div className="p-6 lg:p-8 space-y-6 animate-page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Billing & Configuration</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Configure payment, tax, trial, and pricing settings. Tenant plans are managed per-tenant on each Tenant's page.</p>
        </div>
        <Link to="/superadmin" className="btn-secondary flex items-center gap-1.5 text-xs">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </Link>
      </div>

      <BillingConfig />
    </div>
  );
}
