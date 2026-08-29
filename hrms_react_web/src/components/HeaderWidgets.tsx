import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Sun, Moon } from 'lucide-react';
import { formatAppDate, useAppSettingsRevision } from '../services/appSettingsService';

interface HeaderWidgetsProps {
  variant?: 'default' | 'glass';
}

const HeaderWidgets: React.FC<HeaderWidgetsProps> = ({ variant = 'default' }) => {
  useAppSettingsRevision();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isGlass = variant === 'glass';

  return (
    <div className={`
      flex items-center gap-3 py-1.5 px-4 transition-all duration-300
      ${isGlass
        ? 'bg-white/10 backdrop-blur-xl border border-white/20 rounded-full shadow-xl m-4'
        : 'bg-white/90 backdrop-blur-md border border-slate-100 sticky top-2 z-30 shadow-lg rounded-full mx-4 my-2'
      }
    `}>
      <div className="flex-1" />

      {/* Time */}
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-lg ${isGlass ? 'bg-white/10' : 'bg-amber-50'}`}>
          {time.getHours() < 6 || time.getHours() >= 18
            ? <Moon className="w-3.5 h-3.5 text-indigo-500" />
            : <Sun className="w-3.5 h-3.5 text-amber-500" />
          }
        </div>
        <span className={`text-sm font-bold tabular-nums ${isGlass ? 'text-white' : 'text-slate-900'}`}>
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>

      {/* Date */}
      <div className="hidden lg:flex items-center gap-2">
        <div className={`p-1.5 rounded-lg ${isGlass ? 'bg-white/10' : 'bg-indigo-50'}`}>
          <Calendar className={`w-3.5 h-3.5 ${isGlass ? 'text-white' : 'text-indigo-500'}`} />
        </div>
        <span className={`text-sm font-bold ${isGlass ? 'text-white/80' : 'text-[var(--text-primary)]'}`}>
          {formatAppDate(time)}
        </span>
      </div>
    </div>
  );
};

export default HeaderWidgets;