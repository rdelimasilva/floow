import { useEffect } from 'react'

/**
 * Warns the user before leaving the page when there are unsaved changes.
 * Uses the native `beforeunload` event — works for tab close, navigation away, etc.
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])
}
