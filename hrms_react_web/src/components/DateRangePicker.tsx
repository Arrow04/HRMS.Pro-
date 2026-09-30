import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Info } from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  subDays,
  startOfToday,
  isWithinInterval,
  isBefore
} from 'date-fns';
import { formatAppDate, useAppSettingsRevision } from '../services/appSettingsService';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string) => void;
  onStartDateChange?: (start: string) => void;
  onEndDateChange?: (end: string) => void;
  placeholder?: string;
  className?: string;
}

type QuickSelect = 'Today' | 'Yesterday' | 'Last 7 days' | 'Last 30 days' | 'This Month' | 'Last Month' | 'Custom';

const DateRangePicker: React.FC<DateRangePickerProps> = ({ 
  startDate, 
  endDate, 
  onDateChange, 
  placeholder = "Filter by Date",
  className = ""
}) => {
  useAppSettingsRevision();
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(startDate ? new Date(startDate) : startOfToday());
  const [tempStart, setTempStart] = useState<Date | null>(startDate ? new Date(startDate) : null);
  const [tempEnd, setTempEnd] = useState<Date | null>(endDate ? new Date(endDate) : null);
  const [activeQuickSelect, setActiveQuickSelect] = useState<QuickSelect>('Custom');
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
  const [decadeStart, setDecadeStart] = useState<number>(() => {
    const y = startDate ? new Date(startDate).getFullYear() : new Date().getFullYear();
    return Math.floor(y / 10) * 10;
  });

  // Reset internal state when opened
  useEffect(() => {
    if (isOpen) {
      setTempStart(startDate ? new Date(startDate) : null);
      setTempEnd(endDate ? new Date(endDate) : null);
      setCurrentMonth(startDate ? new Date(startDate) : startOfToday());
      setViewMode('month');
      setDecadeStart(Math.floor((startDate ? new Date(startDate) : new Date()).getFullYear() / 10) * 10);
    }
  }, [isOpen, startDate, endDate]);

  const handleQuickSelect = (selection: QuickSelect) => {
    setActiveQuickSelect(selection);
    const today = startOfToday();
    
    switch (selection) {
      case 'Today':
        setTempStart(today);
        setTempEnd(today);
        setCurrentMonth(today);
        break;
      case 'Yesterday': {
        const yesterday = subDays(today, 1);
        setTempStart(yesterday);
        setTempEnd(yesterday);
        setCurrentMonth(yesterday);
        break;
      }
      case 'Last 7 days':
        setTempStart(subDays(today, 6));
        setTempEnd(today);
        setCurrentMonth(today);
        break;
      case 'Last 30 days':
        setTempStart(subDays(today, 29));
        setTempEnd(today);
        setCurrentMonth(today);
        break;
      case 'This Month':
        setTempStart(startOfMonth(today));
        setTempEnd(endOfMonth(today));
        setCurrentMonth(today);
        break;
      case 'Last Month': {
        const lastMonth = subMonths(today, 1);
        setTempStart(startOfMonth(lastMonth));
        setTempEnd(endOfMonth(lastMonth));
        setCurrentMonth(lastMonth);
        break;
      }
      case 'Custom':
        break;
    }
  };

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextDecade = () => setDecadeStart(decadeStart + 10);
  const prevDecade = () => setDecadeStart(decadeStart - 10);

  const selectYear = (year: number) => {
    setCurrentMonth(new Date(year, currentMonth.getMonth(), 1));
    setViewMode('month');
  };

  const onDateClick = (day: Date) => {
    setActiveQuickSelect('Custom');
    
    if (!tempStart || (tempStart && tempEnd)) {
      // Start a new range
      setTempStart(day);
      setTempEnd(null);
    } else if (tempStart && !tempEnd) {
      // Complete the range
      if (isBefore(day, tempStart)) {
        setTempEnd(tempStart);
        setTempStart(day);
      } else {
        setTempEnd(day);
      }
    }
  };

  const handleConfirm = () => {
    if (tempStart) {
      const startStr = format(tempStart, 'yyyy-MM-dd');
      const endStr = tempEnd ? format(tempEnd, 'yyyy-MM-dd') : startStr;
      onDateChange(startStr, endStr);
    } else {
      onDateChange('', '');
    }
    setIsOpen(false);
  };

  const renderHeader = () => {
    if (viewMode === 'year') {
      const years = Array.from({ length: 12 }, (_, i) => decadeStart + i);
      return (
        <>
          <div className="flex justify-between items-center mb-4">
            <button type="button" onClick={prevDecade} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
            <span className="font-semibold text-[#0F172A]">{decadeStart} - {decadeStart + 11}</span>
            <button type="button" onClick={nextDecade} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <ChevronRight className="w-5 h-5 text-gray-700" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {years.map((year) => {
              const isCurrentYear = year === new Date().getFullYear();
              const isSelectedYear = tempStart && tempStart.getFullYear() === year;
              let cls = "py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer";
              if (isSelectedYear) {
                cls += " bg-[#1C64F2] text-white";
              } else if (isCurrentYear) {
                cls += " bg-gray-100 text-blue-600 font-bold hover:bg-gray-200";
              } else {
                cls += " text-gray-700 hover:bg-gray-100";
              }
              return (
                <button key={year} type="button" onClick={() => selectYear(year)} className={cls}>
                  {year}
                </button>
              );
            })}
          </div>
        </>
      );
    }

    return (
      <div className="flex justify-between items-center mb-6">
        <button type="button" onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <button
          type="button"
          onClick={() => {
            setDecadeStart(Math.floor(currentMonth.getFullYear() / 10) * 10);
            setViewMode('year');
          }}
          className="font-semibold text-[#0F172A] hover:bg-gray-100 px-3 py-1 rounded-lg transition-colors"
          title="Jump to year"
        >
          {format(currentMonth, 'MMMM yyyy')}
        </button>
        <button type="button" onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <ChevronRight className="w-5 h-5 text-gray-700" />
        </button>
      </div>
    );
  };

  const renderDays = () => {
    const days = [];
    const startDate = startOfWeek(currentMonth);
    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={i} className="text-center text-xs font-semibold text-gray-500 mb-4 w-10">
          {format(addDays(startDate, i), 'EE').substring(0, 2).toUpperCase()}
        </div>
      );
    }
    return <div className="flex justify-between">{days}</div>;
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = '';

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, 'd');
        const cloneDay = day;

        const isCurrentMonth = isSameMonth(day, monthStart);
        const isSelectedStart = tempStart && isSameDay(day, tempStart);
        const isSelectedEnd = tempEnd && isSameDay(day, tempEnd);
        const isWithin = tempStart && tempEnd && isWithinInterval(day, { start: tempStart, end: tempEnd });
        const isToday = isSameDay(day, startOfToday());

        // Determine styles
        let baseClass = "w-10 h-10 flex items-center justify-center rounded-full text-sm font-medium cursor-pointer transition-all";
        
        if (isSelectedStart || isSelectedEnd) {
          baseClass += " bg-[#1C64F2] text-white shadow-md";
        } else if (isWithin) {
          baseClass += " bg-blue-50 text-blue-700 rounded-none";
        } else if (!isCurrentMonth) {
          baseClass += " text-gray-300 pointer-events-none"; // Disabling interaction for outside month as per standard clean design
        } else if (isToday) {
          baseClass += " bg-gray-100 text-blue-600 font-bold hover:bg-gray-200";
        } else {
          baseClass += " text-gray-700 hover:bg-gray-100";
        }

        days.push(
          <div 
            key={day.toString()} 
            className="flex-1 flex justify-center py-1 relative"
            onClick={() => isCurrentMonth && onDateClick(cloneDay)}
          >
             {/* Background connector for ranges */}
             {isWithin && !isSelectedStart && !isSelectedEnd && (
                <div className="absolute inset-y-1 inset-x-0 bg-blue-50 -z-10" />
             )}
             {isSelectedStart && tempEnd && !isSameDay(tempStart, tempEnd) && (
                <div className="absolute inset-y-1 right-0 w-1/2 bg-blue-50 -z-10" />
             )}
             {isSelectedEnd && tempStart && !isSameDay(tempStart, tempEnd) && (
                <div className="absolute inset-y-1 left-0 w-1/2 bg-blue-50 -z-10" />
             )}
            <div className={baseClass}>
              {formattedDate}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="flex justify-between" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return <div className="mb-6">{rows}</div>;
  };

  // Button text
  let buttonText = placeholder;
  if (startDate && endDate) {
    if (startDate === endDate) {
      buttonText = formatAppDate(startDate);
    } else {
      buttonText = `${formatAppDate(startDate)} - ${formatAppDate(endDate)}`;
    }
  } else if (startDate) {
    buttonText = formatAppDate(startDate);
  }

  return (
    <div className="relative inline-block">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] hover:bg-[#F1F5F9] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1C64F2] ${className}`}
      >
        <CalendarIcon className="w-4 h-4 text-[#64748B]" />
        {buttonText}
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-0">
          <div 
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <span className="text-lg font-semibold text-center w-full ml-6">Select Date</span>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Scrollable Area */}
            <div className="overflow-y-auto p-6 pt-4 flex-1">
              {/* Calendar Area */}
              <div className="mb-6">
                {renderHeader()}
                {renderDays()}
                {renderCells()}
              </div>

              {/* Quick Selects */}
              <div className="flex flex-wrap gap-2">
                {(['Today', 'Yesterday', 'Last 7 days', 'Last 30 days', 'This Month', 'Last Month', 'Custom'] as QuickSelect[]).map((qs) => (
                  <button
                    key={qs}
                    onClick={() => handleQuickSelect(qs)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      activeQuickSelect === qs 
                        ? 'bg-blue-50 text-[#1C64F2] border border-blue-200 shadow-sm' 
                        : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {qs}
                  </button>
                ))}
              </div>

              {activeQuickSelect === 'Custom' && (
                <div className="mt-5 p-3 bg-blue-50 rounded-xl flex items-start gap-2 border border-blue-100/50">
                  <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-700 font-medium leading-relaxed">
                    {!tempStart 
                      ? "Click on a date to set the start date." 
                      : !tempEnd || (tempStart && tempEnd && tempStart.getTime() === tempEnd.getTime())
                        ? "Click another date to set the end date, or click Confirm for a single day."
                        : "Date range selected. Click Confirm to apply."}
                  </p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 bg-white border-t border-gray-100 flex gap-3 rounded-b-3xl">
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-2xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-3 bg-[#1C64F2] text-white font-semibold rounded-2xl hover:bg-[#1E40AF] transition-colors shadow-md shadow-blue-500/20"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;
