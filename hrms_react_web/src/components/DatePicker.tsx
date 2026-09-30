import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
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
  startOfToday
} from 'date-fns';
import { formatAppDate, useAppSettingsRevision } from '../services/appSettingsService';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  maxDate?: Date;
  minDate?: Date;
}

const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = "Select date",
  className = "",
  required,
  maxDate,
  minDate
}) => {
  useAppSettingsRevision();
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : startOfToday());
  const [tempDate, setTempDate] = useState<Date | null>(value ? new Date(value) : null);
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
  const [decadeStart, setDecadeStart] = useState<number>(() => {
    const y = value ? new Date(value).getFullYear() : new Date().getFullYear();
    return Math.floor(y / 10) * 10;
  });

  const maxDateNorm = maxDate ? new Date(maxDate.getTime()) : null;
  if (maxDateNorm) maxDateNorm.setHours(23, 59, 59, 999);
  const minDateNorm = minDate ? new Date(minDate.getTime()) : null;
  if (minDateNorm) minDateNorm.setHours(0, 0, 0, 0);

  const isOutsideRange = (day: Date) => {
    if (minDateNorm && day < minDateNorm) return true;
    if (maxDateNorm && day > maxDateNorm) return true;
    return false;
  };

  useEffect(() => {
    if (isOpen) {
      setTempDate(value ? new Date(value) : null);
      setCurrentMonth(value ? new Date(value) : startOfToday());
      setViewMode('month');
      setDecadeStart(Math.floor((value ? new Date(value) : new Date()).getFullYear() / 10) * 10);
    }
  }, [isOpen, value]);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextDecade = () => setDecadeStart(decadeStart + 10);
  const prevDecade = () => setDecadeStart(decadeStart - 10);

  const selectYear = (year: number) => {
    setCurrentMonth(new Date(year, currentMonth.getMonth(), 1));
    setViewMode('month');
  };

  const onDateClick = (day: Date) => {
    if (isOutsideRange(day)) return;
    setTempDate(day);
    onChange(format(day, 'yyyy-MM-dd'));
    setIsOpen(false);
  };

  const today = startOfToday();

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
              const isSelectedYear = tempDate && tempDate.getFullYear() === year;
              const yearStart = new Date(year, 0, 1);
              const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
              const isDisabled = ((minDateNorm && yearEnd < minDateNorm) || (maxDateNorm && yearStart > maxDateNorm)) ?? false;
              let cls = "py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer";
              if (isDisabled) {
                cls += " text-gray-300 cursor-not-allowed";
              } else if (isSelectedYear) {
                cls += " bg-[#1C64F2] text-white";
              } else if (isCurrentYear) {
                cls += " bg-gray-100 text-blue-600 font-bold hover:bg-gray-200";
              } else {
                cls += " text-gray-700 hover:bg-gray-100";
              }
              return (
                <button key={year} type="button" disabled={isDisabled} onClick={() => !isDisabled && selectYear(year)} className={cls}>
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
        const isSelected = tempDate && isSameDay(day, tempDate);
        const isToday = isSameDay(day, today);
        const isDisabled = isOutsideRange(day);

        let baseClass = "w-10 h-10 flex items-center justify-center rounded-full text-sm font-medium cursor-pointer transition-all";
        if (isDisabled) {
          baseClass += " text-gray-300 cursor-not-allowed";
        } else if (isSelected) {
          baseClass += " bg-[#1C64F2] text-white shadow-md";
        } else if (isToday) {
          baseClass += " bg-gray-100 text-blue-600 font-bold hover:bg-gray-200";
        } else if (!isCurrentMonth) {
          baseClass += " text-gray-300 pointer-events-none";
        } else {
          baseClass += " text-gray-700 hover:bg-gray-100";
        }

        days.push(
          <div
            key={day.toString()}
            className="flex-1 flex justify-center py-1"
            onClick={() => isCurrentMonth && !isDisabled && onDateClick(cloneDay)}
          >
            <div className={baseClass}>{formattedDate}</div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(<div className="flex justify-between" key={day.toString()}>{days}</div>);
      days = [];
    }
    return <div className="mb-6">{rows}</div>;
  };

  const buttonText = value ? formatAppDate(value) : placeholder;

  return (
    <div className="relative inline-block w-full">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] hover:bg-[#F1F5F9] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1C64F2] w-full ${className}`}
      >
        <CalendarIcon className="w-4 h-4 text-[#64748B] shrink-0" />
        <span className={value ? 'text-[#0F172A]' : 'text-[#94A3B8]'}>{buttonText}</span>
      </button>
      <input type="hidden" value={value} required={required} />

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-0">
          <div
            className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <span className="text-lg font-semibold text-center w-full ml-6">Select Date</span>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 pt-4">
              <div className="mb-6">
                {renderHeader()}
                {renderDays()}
                {renderCells()}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isOutsideRange(today)}
                  onClick={() => { if (!isOutsideRange(today)) { setTempDate(today); onChange(format(today, 'yyyy-MM-dd')); setIsOpen(false); } }}
                  className="px-4 py-2 rounded-full text-sm font-medium bg-blue-50 text-[#1C64F2] border border-blue-200 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => { onChange(''); setIsOpen(false); }}
                  className="px-4 py-2 rounded-full text-sm font-medium bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="p-4 bg-white border-t border-gray-100 flex gap-3 rounded-b-3xl">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-2xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { if (tempDate) { onChange(format(tempDate, 'yyyy-MM-dd')); } setIsOpen(false); }}
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

export default DatePicker;
