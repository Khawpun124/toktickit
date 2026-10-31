import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardError } from "./dashboardApi.js";

// Loads a dashboard once and on Refresh. Refresh keeps the current data on screen while it is busy
// and never reloads the page (ui-spec section 4). One request carries all the data, so a failure
// replaces only the data area (section 9).

export type DashboardState<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "forbidden" }
  | { kind: "failed" };

export function useDashboard<T>(load: () => Promise<T>) {
  const [state, setState] = useState<DashboardState<T>>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const latest = useRef(0);

  const run = useCallback(async () => {
    const ticket = ++latest.current;
    try {
      const data = await load();
      if (mounted.current && ticket === latest.current) setState({ kind: "ready", data });
    } catch (err) {
      if (!mounted.current || ticket !== latest.current) return;
      setState(err instanceof DashboardError && err.status === 403 ? { kind: "forbidden" } : { kind: "failed" });
    }
  }, [load]);

  useEffect(() => {
    mounted.current = true;
    void run();
    return () => {
      mounted.current = false;
    };
  }, [run]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await run();
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, [run]);

  const retry = useCallback(async () => {
    setState({ kind: "loading" });
    await run();
  }, [run]);

  return { state, refreshing, refresh, retry };
}
