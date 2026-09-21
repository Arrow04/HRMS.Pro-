/**
 * Returns the currently selected company ID from the global header dropdown.
 * Stored in localStorage by AppHeader; changes trigger a full page reload.
 *
 * Returns `undefined` when "All Companies" is selected (so backend returns org-wide data).
 * Returns the numeric company ID string when a specific company is selected.
 */
export function useCompanyId(): string | undefined {
  const val = localStorage.getItem('selectedCompanyId');
  if (!val || val === 'all') return undefined;
  return val;
}
