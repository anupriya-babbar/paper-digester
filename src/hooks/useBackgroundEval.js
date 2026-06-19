// src/hooks/useBackgroundEval.js
// Fires automatically 3 seconds after a paper is summarised.
// Saves results to Supabase and dispatches a DOM event so the
// sidebar badge can update without a page reload.
//
// Usage in App.jsx (or wherever summarisation completes):
//   const { triggerBackgroundEval } = useBackgroundEval(user?.id);
//   // After summary saved to library:
//   triggerBackgroundEval(savedPaper);

import { useCallback } from 'react';
import { useEval } from './useEval';

export function useBackgroundEval(userId) {
  const { runSummaryEval } = useEval();

  const triggerBackgroundEval = useCallback(async (paper) => {
    if (!paper?.id) return;

    // Small delay so we don't compete with the summary save write
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      const results = await runSummaryEval(paper, userId);

      if (results) {
        // Notify any listening component (e.g. sidebar badge, paper card)
        window.dispatchEvent(
          new CustomEvent('pd:evalComplete', {
            detail: { paperId: paper.id, results },
          })
        );
      }

      return results;
    } catch (err) {
      // Background — swallow silently, don't break the UI
      console.warn('[useBackgroundEval] eval failed silently:', err.message);
      return null;
    }
  }, [runSummaryEval, userId]);

  return { triggerBackgroundEval };
}
