import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#FAFBFE] z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-8 text-center">
        <div className="text-6xl font-bold text-[#6366F1] mb-4">404</div>
        <h1 className="text-2xl font-bold text-[#0F172A] mb-2">Page not found</h1>
        <p className="text-gray-500 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/dashboard"
          className="inline-block bg-[#6366F1] hover:bg-[#4F46E5] text-white font-medium py-2.5 px-6 rounded-lg transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
