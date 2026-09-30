import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, RefreshCcw, RotateCcw, Landmark } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAccounts, getJournals, reverseJournal } from '../services/accountingService';
import type { GLAccount, JournalEntry } from '../services/accountingService';
import { formatCurrency, getAppCurrency } from '../services/currencyService';

const ENTRY_TYPE_LABELS: Record<string, string> = {
  payroll: 'Payroll',
  fnf: 'Full & Final',
  manual: 'Manual',
  expense: 'Expense',
  loan: 'Loan',
};

const AccountingPanel = () => {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');

  const { data: accounts = [] } = useQuery({
    queryKey: ['gl-accounts'],
    queryFn: getAccounts,
    staleTime: 5 * 60 * 1000,
  });

  const { data: journals = [], isLoading: loadingJournals } = useQuery({
    queryKey: ['gl-journals', filter],
    queryFn: () => getJournals(filter === 'all' ? {} : { entryType: filter }),
    staleTime: 60 * 1000,
  });

  const reverseMutation = useMutation({
    mutationFn: (id: number) => reverseJournal(id, 'Manual reversal from payroll'),
    onSuccess: () => {
      toast.success('Journal reversed');
      queryClient.invalidateQueries({ queryKey: ['gl-journals'] });
    },
    onError: () => toast.error('Failed to reverse journal'),
  });

  const accountName = (id: number) => accounts.find((a: GLAccount) => a.id === id)?.name || `#${id}`;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)] bg-gradient-to-r from-[#F8FAFC] to-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#059669] to-[#047857] flex items-center justify-center text-white shadow-sm">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">Accounting Journals</h3>
              <p className="text-xs text-[var(--text-tertiary)]">Double-entry GL postings for payroll &amp; F&F settlements</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#059669]/30"
            >
              <option value="all">All entries</option>
              <option value="payroll">Payroll</option>
              <option value="fnf">Full &amp; Final</option>
            </select>
            <button
              onClick={() => { queryClient.invalidateQueries({ queryKey: ['gl-journals'] }); }}
              className="px-3 py-2 text-sm font-medium text-[#059669] hover:bg-[#059669]/10 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <RefreshCcw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-5 border-b border-[var(--border-color)] bg-[#F8FAFC]">
          <div className="bg-white rounded-xl border border-[var(--border-color)] p-4">
            <div className="flex items-center gap-2 text-[#059669] mb-1">
              <Landmark className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Chart of Accounts</span>
            </div>
            <p className="text-2xl font-bold text-[#0F172A]">{accounts.length}</p>
            <p className="text-xs text-[var(--text-tertiary)]">accounts in this organization</p>
          </div>
          <div className="bg-white rounded-xl border border-[var(--border-color)] p-4">
            <div className="flex items-center gap-2 text-[#1C64F2] mb-1">
              <BookOpen className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Posted Journals</span>
            </div>
            <p className="text-2xl font-bold text-[#0F172A]">{journals.length}</p>
            <p className="text-xs text-[var(--text-tertiary)]">posted entries (reverse uses mirror entries)</p>
          </div>
        </div>

        <div className="p-5">
          {loadingJournals ? (
            null
          ) : journals.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-[var(--text-tertiary)]">No journals yet. Mark a payroll as Paid or complete an F&F to post one.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {journals.map((j: JournalEntry) => (
                <div key={j.id} className="rounded-xl border border-[var(--border-color)] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-[#F8FAFC] border-b border-[var(--border-color)]">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${j.entryType === 'fnf' ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#DCFCE7] text-[#047857]'}`}>
                        {ENTRY_TYPE_LABELS[j.entryType] || j.entryType}
                      </span>
                      <span className="text-sm font-semibold text-[#0F172A]">{j.description || `Journal #${j.id}`}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[var(--text-tertiary)]">{j.referenceNo || ''} &middot; {j.status}</span>
                      {j.status === 'posted' && (
                        <button
                          onClick={() => reverseMutation.mutate(j.id)}
                          disabled={reverseMutation.isPending}
                          className="p-1.5 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Reverse this journal"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-white text-xs text-[var(--text-tertiary)]">
                          <th className="text-left px-4 py-2 font-medium">Account</th>
                          <th className="text-right px-4 py-2 font-medium">Debit</th>
                          <th className="text-right px-4 py-2 font-medium">Credit</th>
                          <th className="text-left px-4 py-2 font-medium">Narration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {j.lines.map((ln) => (
                          <tr key={ln.id} className="border-t border-[var(--border-color)]">
                            <td className="px-4 py-2">
                              <span className="text-[#0F172A]">{ln.accountName || accountName(ln.accountId)}</span>
                              <span className="text-xs text-[var(--text-tertiary)] ml-1">{ln.accountCode}</span>
                            </td>
                            <td className="px-4 py-2 text-right text-[#059669]">{ln.debit > 0 ? formatCurrency(ln.debit, getAppCurrency()) : ''}</td>
                            <td className="px-4 py-2 text-right text-[#DC2626]">{ln.credit > 0 ? formatCurrency(ln.credit, getAppCurrency()) : ''}</td>
                            <td className="px-4 py-2 text-[var(--text-tertiary)]">{ln.narration}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-[var(--border-color)] bg-[#F8FAFC] font-semibold">
                          <td className="px-4 py-2 text-[#0F172A]">Totals</td>
                          <td className="px-4 py-2 text-right text-[#059669]">{formatCurrency(j.totalDebit, getAppCurrency())}</td>
                          <td className="px-4 py-2 text-right text-[#DC2626]">{formatCurrency(j.totalCredit, getAppCurrency())}</td>
                          <td className="px-4 py-2" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountingPanel;