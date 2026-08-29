import { Smartphone, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
const MobileOnly = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Smartphone className="w-10 h-10 text-blue-600" />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Mobile App Only
        </h1>
        
        <p className="text-gray-600 mb-6 leading-relaxed">
          As an Employee, you can only access the HRMS system through the <strong>mobile application</strong>. 
          Please download our mobile app to:
        </p>
        
        <ul className="text-left text-sm text-gray-600 mb-6 space-y-2 bg-gray-50 p-4 rounded-xl">
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            Mark attendance & check in/out
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            Apply for leave
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            View holidays
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            Submit expenses
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            View performance reviews
          </li>
        </ul>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigate('/login')}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          Contact your HR Admin if you need help accessing the mobile app.
        </p>
      </div>
    </div>
  </div>
);
};

export default MobileOnly;
