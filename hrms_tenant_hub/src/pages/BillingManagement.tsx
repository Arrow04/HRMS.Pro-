import { Settings2 } from 'lucide-react';
import BillingConfig from './BillingConfig';

export default function BillingManagement() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing & Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">Configure payment, tax, trial, and pricing settings. Tenant plans are managed per-tenant on each Tenant's page.</p>
        </div>
        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium">
          <Settings2 className="w-3.5 h-3.5" /> Configuration
        </span>
      </div>

      <BillingConfig />
    </div>
  );
}
