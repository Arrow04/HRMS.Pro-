import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { Undo2, CheckCircle2, XCircle } from 'lucide-react';

interface UseUndoDeleteOptions<T> {
  entityName: string;
  /** performs the delete */
  onDelete: (item: T) => Promise<unknown> | unknown;
  /** recreates the item from a snapshot (captured before delete) */
  onRestore: (item: T) => Promise<unknown> | unknown;
  /** optional callbacks to refetch after delete / restore */
  onDeleteDone?: () => void;
  onRestoreDone?: () => void;
}

/**
 * Shows a toast with an "Undo" action after deleting. The item is captured
 * before deletion so it can be recreated via the create endpoint on Undo.
 */
export function useUndoDelete<T>({
  entityName,
  onDelete,
  onRestore,
  onDeleteDone,
  onRestoreDone,
}: UseUndoDeleteOptions<T>) {
  const deleteWithUndo = useCallback(
    async (item: T) => {
      const toastId = toast.loading(`Deleting ${entityName.toLowerCase()}...`);

      try {
        await onDelete(item);
        toast.dismiss(toastId);

        toast.custom(
          (t) => (
            <div
              onClick={() => toast.dismiss(t.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border border-[#E2E8F0] bg-white cursor-pointer transition-all ${
                t.visible ? 'animate-pop' : ''
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#0F172A]">
                  {entityName} deleted
                </p>
                <p className="text-xs text-[#64748B] truncate">Click Undo to restore it</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast.dismiss(t.id);
                  toast.promise(
                    Promise.resolve().then(() => onRestore(item)),
                    {
                      loading: `Restoring ${entityName.toLowerCase()}...`,
                      success: `${entityName} restored`,
                      error: `Failed to restore ${entityName.toLowerCase()}`,
                    }
                  ).then(() => onRestoreDone?.());
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#1C64F2] hover:bg-[#1E40AF] transition-colors shrink-0"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Undo
              </button>
            </div>
          ),
          { duration: 6000, position: 'bottom-right' }
        );

        onDeleteDone?.();
      } catch (error) {
        toast.dismiss(toastId);
        toast.custom(
          (t) => (
            <div
              onClick={() => toast.dismiss(t.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border border-red-100 bg-white cursor-pointer transition-all ${
                t.visible ? 'animate-pop' : ''
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <XCircle className="w-4 h-4 text-red-600" />
              </div>
              <p className="text-sm font-semibold text-[#0F172A]">
                Failed to delete {entityName.toLowerCase()}
              </p>
            </div>
          ),
          { duration: 4000, position: 'bottom-right' }
        );
        throw error;
      }
    },
    [entityName, onDelete, onRestore, onDeleteDone, onRestoreDone]
  );

  return { deleteWithUndo };
}
