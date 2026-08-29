import React, { useState } from 'react';
import { X, Calendar, CheckCircle2, Loader2, ArrowRightLeft } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { useMasterData } from '../hooks/useMasterData';
import DatePicker from '../components/DatePicker';

interface RosterEmployee {
  id: number;
  first_name?: string;
  last_name?: string;
  company_id?: number;
  branch_id?: number;
  department_id?: number;
}

interface RosterShift {
  id: number;
  name: string;
  start_time?: string;
  end_time?: string;
}

type AssignBy = 'employee' | 'department' | 'branch' | 'company';

interface RosterConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: RosterEmployee[];
  companies: { id: number; name: string }[];
  branches: { id: number; name: string }[];
  departments: { id: number; name: string }[];
  shifts: RosterShift[];
}

const RosterConfigModal: React.FC<RosterConfigModalProps> = ({
  isOpen,
  onClose,
  employees,
  companies,
  branches,
  departments,
  shifts,
}) => {
  const queryClient = useQueryClient();
  const { data: assignLevelOptions = [] } = useMasterData('ROSTER_ASSIGN_LEVEL');
  const [assignBy, setAssignBy] = useState<AssignBy>('company');
  const [targetId, setTargetId] = useState<string>('');
  const [shiftId, setShiftId] = useState<string>('');
  const [weekStartDate, setWeekStartDate] = useState<string>(
    new Date(new Date().setDate(new Date().getDate() - new Date().getDay() + 1)).toISOString().split('T')[0] // Default to this Monday
  );
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default (0=Sun, 6=Sat)
  const [notes, setNotes] = useState('');

  const daysOfWeek = [
    { id: 1, label: 'Mon' },
    { id: 2, label: 'Tue' },
    { id: 3, label: 'Wed' },
    { id: 4, label: 'Thu' },
    { id: 5, label: 'Fri' },
    { id: 6, label: 'Sat' },
    { id: 0, label: 'Sun' }
  ];

  const assignRosterMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      return api.post('/shifts/roster/assign-bulk', payload);
    },
    onSuccess: () => {
      toast.success('Roster assigned successfully');
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      onClose();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to assign roster');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!targetId) {
      toast.error('Please select a target to assign the roster to.');
      return;
    }
    if (!shiftId) {
      toast.error('Please select a shift.');
      return;
    }
    if (selectedDays.length === 0) {
      toast.error('Please select at least one day.');
      return;
    }

    // Determine target employee IDs
    let targetEmployeeIds: number[] = [];

    if (assignBy === 'employee') {
      targetEmployeeIds = [parseInt(targetId)];
    } else if (assignBy === 'department') {
      targetEmployeeIds = employees
        .filter(emp => emp.department_id?.toString() === targetId)
        .map(emp => emp.id);
    } else if (assignBy === 'branch') {
      targetEmployeeIds = employees
        .filter(emp => emp.branch_id?.toString() === targetId)
        .map(emp => emp.id);
    } else if (assignBy === 'company') {
      targetEmployeeIds = employees
        .filter(emp => emp.company_id?.toString() === targetId)
        .map(emp => emp.id);
    }

    if (targetEmployeeIds.length === 0) {
      toast.error(`No employees found for the selected ${assignBy}.`);
      return;
    }

    assignRosterMutation.mutate({
      employee_ids: targetEmployeeIds,
      shift_id: parseInt(shiftId),
      week_start_date: weekStartDate,
      days: selectedDays,
      notes: notes
    });
  };

  const toggleDay = (dayId: number) => {
    if (selectedDays.includes(dayId)) {
      setSelectedDays(selectedDays.filter(d => d !== dayId));
    } else {
      setSelectedDays([...selectedDays, dayId]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300" />
            <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl overflow-y-auto flex flex-col animate-in slide-in-from-right duration-300">
        <div className="p-6 border-b border-[#E2E8F0] flex justify-between items-center bg-gradient-to-r from-[#F8FAFC] to-white">
          <div>
            <h2 className="text-xl font-bold text-[#0F172A]">Configure Roster</h2>
            <p className="text-sm text-[#64748B] mt-1">Assign duty shifts to employees, departments, or branches.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#F1F5F9] rounded-xl transition-colors">
            <X className="w-5 h-5 text-[#64748B]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">Assign By Level</label>
                <select
                  value={assignBy}
                  onChange={(e) => {
                    setAssignBy(e.target.value as AssignBy);
                    setTargetId('');
                  }}
                  className="w-full px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
                >
                  <option value="">Select level</option>
                  {(assignLevelOptions || []).map((opt: any) => (
                    <option key={opt.code || opt.value} value={opt.code || opt.value}>{(opt.name || opt.label)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">Select Target</label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
                >
                  <option value="">Select {assignBy}...</option>
                  {assignBy === 'company' && companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  {assignBy === 'branch' && branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                  {assignBy === 'department' && departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                  {assignBy === 'employee' && employees.map(e => (
                    <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">Select Shift</label>
                <select
                  value={shiftId}
                  onChange={(e) => setShiftId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
                >
                  <option value="">Select a shift...</option>
                  {shifts.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.start_time} - {s.end_time})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">Week Start Date (Monday)</label>
                <DatePicker value={weekStartDate} onChange={setWeekStartDate} required />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-2">Apply to Days</label>
                <div className="flex flex-wrap gap-2">
                  {daysOfWeek.map(day => (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => toggleDay(day.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        selectedDays.includes(day.id) 
                          ? 'bg-[#1C64F2] text-white' 
                          : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">Notes (Optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2] resize-none"
                  placeholder="E.g., Temporary shift swap..."
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-medium text-[#64748B] hover:text-[#0F172A] bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={assignRosterMutation.isPending}
              className="px-6 py-2.5 text-sm font-medium text-white bg-[#1C64F2] hover:bg-[#1E40AF] rounded-xl transition-colors flex items-center gap-2"
            >
              {assignRosterMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Assign Roster
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RosterConfigModal;
