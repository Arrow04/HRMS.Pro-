import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

export default function SafetyBanner() {
  return (
    <div className="bg-red-50 border-y border-red-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
        <p className="text-sm text-red-900">
          <span className="font-semibold">Stay safe:</span> never pay to apply. Verify every offer.{' '}
          <Link to="/safety" className="underline font-medium">
            Safety Center
          </Link>
        </p>
      </div>
    </div>
  );
}
