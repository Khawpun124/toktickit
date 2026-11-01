import { useCallback, useEffect, useRef, useState } from "react";
import { describeActionError, listActions, type ActionTaken } from "../../actionsApi.js";

/**
 * Loads a Ticket's Actions in the order the API returns them (oldest created first); the list is
 * never re-sorted here. `reloadKey` (the Ticket status) reloads it when the Ticket changes.
 */
export function useActions(ticketId: number, reloadKey?: unknown) {
  const [actions, setActions] = useState<ActionTaken[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const list = await listActions(ticketId);
      if (request === requestRef.current) setActions(list);
    } catch (err) {
      if (request === requestRef.current) setError(describeActionError(err, "load").message);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void reload();
    return () => {
      requestRef.current++;
    };
  }, [reload, reloadKey]);

  const replace = useCallback((updated: ActionTaken) => {
    setActions(list => list?.map(a => (a.id === updated.id ? updated : a)) ?? list);
  }, []);

  return { actions, error, loading, reload, replace };
}
