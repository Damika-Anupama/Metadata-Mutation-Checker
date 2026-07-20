// Client-side persistence hooks extracted from page.tsx (F5): per-finding
// annotations and analysis history, both backed by localStorage.
import { useCallback, useEffect, useState } from "react";
import type { AnnotationMap, FindingAnnotation, HistoryEntry, Report } from "@/lib/types";
import { ANNOTATIONS_KEY, HISTORY_KEY, HISTORY_MAX } from "./report-data";

export function useAnnotations() {
  const [map, setMap] = useState<AnnotationMap>(() => {
    try {
      const raw = localStorage.getItem(ANNOTATIONS_KEY);
      return raw ? (JSON.parse(raw) as AnnotationMap) : {};
    } catch {
      return {};
    }
  });

  const get = useCallback((key: string): FindingAnnotation => {
    return map[key] ?? { status: null, note: "" };
  }, [map]);

  const set = useCallback((key: string, annotation: FindingAnnotation) => {
    setMap(prev => {
      // Merge against the freshest persisted map, not just this hook instance's
      // (possibly stale) state. Several ReportViews can be mounted at once
      // (e.g. multiple expanded batch rows) and all share ANNOTATIONS_KEY, so
      // serializing from stale state would silently drop other views' writes.
      let base = prev;
      try {
        const raw = localStorage.getItem(ANNOTATIONS_KEY);
        if (raw) base = { ...prev, ...(JSON.parse(raw) as AnnotationMap) };
      } catch {
        // ignore malformed/unavailable storage
      }
      const next = { ...base, [key]: annotation };
      try { localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(next)); } catch {
        // ignore quota/unavailable storage
      }
      return next;
    });
  }, []);

  return { get, set };
}

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  // Load persisted history on the client only. Reading localStorage in the
  // useState initializer runs during SSR prerender (throws → []) and again on
  // the client (populated), which produces a React hydration mismatch — and a
  // visible flash of the History count — for returning users.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      // Deliberate post-mount setState: the value only exists on the client, so
      // hydrating with it up front would mismatch the server-rendered [].
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setEntries(JSON.parse(raw) as HistoryEntry[]);
    } catch {
      // ignore malformed/unavailable storage
    }
  }, []);

  const save = useCallback((report: Report) => {
    setEntries(prev => {
      const entry: HistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        savedAt: Date.now(),
        report,
      };
      const next = [entry, ...prev].slice(0, HISTORY_MAX);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setEntries(prev => {
      const next = prev.filter(e => e.id !== id);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
  }, []);

  return { entries, save, remove, clear };
}
