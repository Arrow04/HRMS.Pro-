import React from 'react';
import { 
  Cloud, 
  CloudRain, 
  Sun, 
  Wind, 
  AlertTriangle, 
  Clock, 
  Calendar
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getBranchContext } from '../services/employeeService';

interface BranchContextProps {
  branchId: number;
}

const BranchContextWidget: React.FC<BranchContextProps> = ({ branchId }) => {
  const { data: context, isLoading, error } = useQuery({
    queryKey: ['branchContext', branchId],
    queryFn: () => getBranchContext(branchId),
    refetchInterval: 300000 // Refetch every 5 minutes
  });

  if (isLoading) return (
    <div className="p-6 bg-white rounded-[2rem] border border-gray-100 animate-pulse">
      <div className="h-4 w-32 bg-gray-100 rounded-full mb-4"></div>
      <div className="h-8 w-48 bg-gray-100 rounded-full"></div>
    </div>
  );

  if (error || !context) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">
        Unable to load branch context. Please check your connection.
      </div>
    );
  }

  const { weather, currentTime, currentDate } = context;

  const WeatherIcon = () => {
    const iconClass = "w-6 h-6 md:w-10 md:h-10";
    if (weather.condition.includes('Rain') || weather.condition.includes('Shower')) return <CloudRain className={`${iconClass} text-blue-500`} />;
    if (weather.condition.includes('Cloud')) return <Cloud className={`${iconClass} text-gray-400`} />;
    if (weather.condition.includes('Sun') || weather.condition.includes('Clear')) return <Sun className={`${iconClass} text-orange-400`} />;
    return <Wind className={`${iconClass} text-gray-300`} />;
  };

  return (
    <div className="relative overflow-hidden bg-white/40/40 backdrop-blur-xl rounded-2xl md:rounded-[2.5rem] border border-white/50 shadow-2xl shadow-blue-900/5 p-4 md:p-8 group transition-all hover:shadow-blue-900/10">
      {/* Decorative background gradient */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl group-hover:bg-blue-600/10 transition-colors"></div>
      
      <div className="relative z-10 flex flex-col md:flex-row justify-between gap-4 md:gap-8">
        {/* Left: Date & Time */}
        <div className="space-y-1">
           <div className="flex items-center gap-2 md:gap-3 text-2xl md:text-4xl font-black text-[var(--text-primary)] tracking-tighter">
              <Clock className="w-6 h-6 md:w-8 md:h-8 text-gray-200" />
              {currentTime}
           </div>
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-8 md:ml-11 flex items-center gap-2">
              <Calendar className="w-3 h-3" /> {currentDate}
           </p>
        </div>

        {/* Right: Weather & Alerts */}
        <div className="flex flex-col items-start md:items-end gap-2 md:gap-3 text-left md:text-right">
           <div className="flex items-center gap-3 md:gap-4">
              <div>
                 <p className="text-2xl md:text-3xl font-black text-[var(--text-primary)] tracking-tighter">{weather.temp}</p>
                 <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{weather.condition}</p>
              </div>
              <div className="p-2 md:p-4 bg-gray-50 rounded-2xl md:rounded-3xl border border-gray-100">
                 <WeatherIcon />
              </div>
           </div>
           
           {weather.alert !== "No active alerts" && (
             <div className="mt-2 flex items-center gap-2 md:gap-3 px-3 md:px-5 py-2 md:py-3 bg-red-50 text-red-600 rounded-xl md:rounded-2xl border border-red-100 animate-bounce duration-1000">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="text-[9px] font-black uppercase tracking-widest leading-none">{weather.alert}</span>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default BranchContextWidget;
