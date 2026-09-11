import { useEffect, useCallback } from 'react';

export function useUnsavedChangesWarning(isDirty: boolean, message = 'You have unsaved changes. Leave anyway?') {
  const handler = useCallback(
    (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = message;
      }
    },
    [isDirty, message],
  );

  useEffect(() => {
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [handler]);
}
