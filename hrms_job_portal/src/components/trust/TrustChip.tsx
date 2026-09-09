import { ShieldCheck, Clock3, AlertTriangle } from 'lucide-react';

export type TrustState = 'verified' | 'checking' | 'unverified';

export default function TrustChip({ state, reason }: { state: TrustState; reason?: string }) {
  if (state === 'verified') {
    return (
      <span
        title={reason || 'Identity and contact checks passed'}
        className="inline-flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 text-xs font-medium px-2 py-1 rounded-full"
      >
        <ShieldCheck className="w-3.5 h-3.5" /> Verified
      </span>
    );
  }
  if (state === 'checking') {
    return (
      <span
        title={reason || 'Verification in progress'}
        className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 text-xs font-medium px-2 py-1 rounded-full"
      >
        <Clock3 className="w-3.5 h-3.5" /> Under check
      </span>
    );
  }
  return (
    <span
      title={reason || 'Not yet verified — proceed with caution'}
      className="inline-flex items-center gap-1 text-gray-600 bg-gray-100 border border-gray-200 text-xs font-medium px-2 py-1 rounded-full"
    >
      <AlertTriangle className="w-3.5 h-3.5" /> Unverified
    </span>
  );
}

export function companyTrustState(isVerified?: boolean): TrustState {
  return isVerified ? 'verified' : 'unverified';
}
