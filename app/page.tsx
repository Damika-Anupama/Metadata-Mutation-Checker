"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BatchItem, BatchStatus, CompareRow, CompareSlot, HistoryEntry, Mode, Report } from "@/lib/types";
import {
  ANALYZE_ENDPOINT,
  compareKeys,
  DEMO_REPORT,
  LOG_PREFIX,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_UPLOAD_SIZE_MB,
  REQUEST_TIMEOUT_MS,
  SHARE_HASH_PREFIX,
  TAB_ORDER,
  decodeReportFromHash,
  encodeReportToHash,
  formatRelativeTime,
  formatValue,
  getBatchRiskBadge,
  getDateGapLabel,
  getFileDebugInfo,
  validatePdfFile,
} from "./report-data";
import { useHistory } from "./hooks";
import { DashboardMetric, ReportView } from "./components/report-view";
import {
  ChevronDownIcon,
  CompareIcon,
  EyeIcon,
  FileIcon,
  HistoryIcon,
  LayersIcon,
  ShieldIcon,
  SpinnerIcon,
  TrashIcon,
  UploadIcon,
} from "./components/icons";
import { formatMetadataLabel, getLoadingStep } from "./ui-format";

function HistoryPanel({
  entries,
  onOpen,
  onRemove,
  onClear,
}: {
  entries: HistoryEntry[];
  onOpen: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="mt-12 flex flex-col items-center gap-3 text-center">
        <HistoryIcon className="h-12 w-12 text-slate-300" />
        <p className="font-medium text-slate-500">No history yet</p>
        <p className="max-w-xs text-sm text-slate-400">
          Every document you analyze is saved here automatically. Upload a PDF in the Analyze or Batch tab to get started.
        </p>
      </div>
    );
  }

  const high = entries.filter(e => e.report.metadata_risk_level === "High").length;
  const medium = entries.filter(e => e.report.metadata_risk_level === "Medium").length;
  const low = entries.filter(e => e.report.metadata_risk_level === "Low").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
          <span className="text-slate-700">{entries.length} document{entries.length !== 1 ? "s" : ""}</span>
          {high > 0 && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs text-red-700">{high} High</span>}
          {medium > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs text-amber-700">{medium} Medium</span>}
          {low > 0 && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-700">{low} Low</span>}
        </div>
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          onClick={onClear}
          type="button"
        >
          <TrashIcon className="h-3.5 w-3.5" />
          Clear all
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Document</th>
              <th className="px-4 py-3">Risk</th>
              <th className="hidden px-4 py-3 sm:table-cell">Findings</th>
              <th className="hidden px-4 py-3 sm:table-cell">Analyzed</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => {
              const badge = getBatchRiskBadge(entry.report.metadata_risk_level);
              return (
                <tr className="border-t border-slate-200 transition hover:bg-indigo-50/20" key={entry.id}>
                  <td className="max-w-[200px] px-4 py-3">
                    <p className="truncate font-medium text-slate-800">{entry.report.document_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">{entry.report.findings.length}</td>
                  <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">{formatRelativeTime(entry.savedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700"
                        onClick={() => onOpen(entry)}
                        type="button"
                      >
                        Open
                      </button>
                      <button
                        className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                        onClick={() => onRemove(entry.id)}
                        title="Remove"
                        type="button"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
  id,
  controls,
  onKeyDown,
  tabRef,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  id?: string;
  controls?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  tabRef?: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={tabRef}
      aria-controls={controls}
      aria-selected={active}
      className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition ${
        active ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:bg-white/70 hover:text-slate-700"
      }`}
      id={id}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role="tab"
      // Roving tabindex: only the active tab is in the Tab order; arrow keys move
      // between tabs (WAI-ARIA tabs pattern).
      tabIndex={active ? 0 : -1}
      type="button"
    >
      {children}
    </button>
  );
}

function UploadDropzone({
  inputRef,
  isDragging,
  loading,
  loadingSeconds = 0,
  selectedName,
  title,
  help,
  browseLabel = "Browse Files",
  validationMessage,
  onBrowse,
  onDragLeave,
  onDragOver,
  onDrop,
  onInputChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  loading: boolean;
  loadingSeconds?: number;
  selectedName?: string;
  title: string;
  help: string;
  browseLabel?: string;
  validationMessage?: string;
  onBrowse: () => void;
  onDragLeave: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div
      className={`flex min-h-[270px] items-center justify-center rounded-lg border-2 border-dashed bg-white px-6 py-12 text-center transition ${
        isDragging ? "border-indigo-400 bg-indigo-50/60" : "border-slate-300 hover:border-indigo-300"
      }`}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        accept="application/pdf"
        aria-label="Upload a PDF file"
        className="sr-only"
        name="file"
        onChange={onInputChange}
        onClick={(event) => {
          event.currentTarget.value = "";
        }}
        type="file"
      />
      <div className="flex max-w-md flex-col items-center">
        {loading ? (
          <SpinnerIcon className="mb-5 h-11 w-11 animate-spin text-indigo-600" />
        ) : (
          <UploadIcon className="mb-5 h-11 w-11 text-slate-400" />
        )}
        <p className="text-lg font-medium text-slate-700">{loading ? "Analyzing uploaded PDF..." : title}</p>
        <p className="mt-2 text-sm text-slate-500">
          {loading ? "Extracting metadata and checking for mutation signals. This can take a few seconds." : help}
        </p>
        <button
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-indigo-600 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-indigo-400"
          disabled={loading}
          onClick={onBrowse}
          type="button"
        >
          <FileIcon className="h-4 w-4" />
          {loading ? "Analyzing..." : browseLabel}
        </button>
        {selectedName && (
          <p className="mt-4 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            Selected: <span className="text-slate-900">{selectedName}</span>
          </p>
        )}
        <p className="mt-3 text-xs font-medium text-slate-400">Accepted: PDF only · Max {MAX_UPLOAD_SIZE_MB}MB</p>
        {validationMessage && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {validationMessage}
          </p>
        )}
        {loading && (
          <div className="mt-5 w-full rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-left">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">
              <span>{getLoadingStep(loadingSeconds)}</span>
              <span>{loadingSeconds >= 3 ? `${loadingSeconds}s elapsed` : "Please wait"}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-indigo-600" />
            </div>
            <ul className="mt-3 space-y-1.5 text-xs text-indigo-700/80">
              <li>• {loadingSeconds >= 0 ? "Uploading file" : "Waiting"}</li>
              <li>• {loadingSeconds >= 2 ? "Extracting document metadata" : "Queued metadata extraction"}</li>
              <li>• {loadingSeconds >= 5 ? "Checking mutation signals" : "Preparing mutation checks"}</li>
              <li>• {loadingSeconds >= 8 ? "Preparing the analysis report" : "Report will appear automatically"}</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function BatchDropzone({
  inputRef,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onInputChange,
  onBrowse,
  pending,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBrowse: () => void;
  pending: number;
}) {
  return (
    <div
      className={`flex min-h-[180px] items-center justify-center rounded-lg border-2 border-dashed bg-white px-6 py-10 text-center transition ${
        isDragging ? "border-indigo-400 bg-indigo-50/60" : "border-slate-300 hover:border-indigo-300"
      }`}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <input ref={inputRef} accept="application/pdf" aria-label="Upload PDF files" className="sr-only" multiple onChange={onInputChange} type="file" />
      <div className="flex max-w-sm flex-col items-center">
        <LayersIcon className="mb-4 h-10 w-10 text-slate-400" />
        <p className="text-base font-medium text-slate-700">
          {pending > 0 ? `${pending} file${pending > 1 ? "s" : ""} queued` : "Drop multiple PDFs here"}
        </p>
        <p className="mt-1 text-sm text-slate-500">All files are analyzed in parallel — up to 8 MB each</p>
        <button
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
          onClick={onBrowse}
          type="button"
        >
          <UploadIcon className="h-4 w-4" />
          Add PDFs
        </button>
      </div>
    </div>
  );
}

function BatchTable({
  items,
  onToggleExpand,
  onClear,
  onRemove,
  onRunPending,
  exportStatuses,
  onBatchCopySummary,
  onBatchDownloadJson,
  onBatchDownloadText,
}: {
  items: BatchItem[];
  onToggleExpand: (id: string) => void;
  onClear: () => void;
  onRemove: (id: string) => void;
  onRunPending: () => void;
  exportStatuses: Record<string, string>;
  onBatchCopySummary: (id: string) => void;
  onBatchDownloadJson: (id: string) => void;
  onBatchDownloadText: (id: string) => void;
}) {
  const high = items.filter(i => i.report?.metadata_risk_level === "High").length;
  const medium = items.filter(i => i.report?.metadata_risk_level === "Medium").length;
  const low = items.filter(i => i.report?.metadata_risk_level === "Low").length;
  const pending = items.filter(i => i.status === "pending").length;
  const analyzing = items.filter(i => i.status === "analyzing").length;
  const errors = items.filter(i => i.status === "error").length;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
          <span className="text-slate-700">{items.length} document{items.length !== 1 ? "s" : ""}</span>
          {high > 0 && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs text-red-700">{high} High</span>}
          {medium > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs text-amber-700">{medium} Medium</span>}
          {low > 0 && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-700">{low} Low</span>}
          {analyzing > 0 && <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs text-indigo-700">{analyzing} Analyzing</span>}
          {errors > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{errors} Error</span>}
        </div>
        <div className="flex items-center gap-2">
          {pending > 0 && (
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-700"
              onClick={onRunPending}
              type="button"
            >
              Analyze {pending} pending
            </button>
          )}
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            onClick={onClear}
            type="button"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Clear all
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Filename</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Findings</th>
              <th className="hidden px-4 py-3 sm:table-cell">Size</th>
              <th className="hidden px-4 py-3 sm:table-cell">Date gap</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <BatchRow
                exportStatus={exportStatuses[item.id] ?? ""}
                item={item}
                key={item.id}
                onCopySummary={() => onBatchCopySummary(item.id)}
                onDownloadJson={() => onBatchDownloadJson(item.id)}
                onDownloadText={() => onBatchDownloadText(item.id)}
                onRemove={() => onRemove(item.id)}
                onToggleExpand={() => onToggleExpand(item.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BatchRow({
  item,
  onToggleExpand,
  onRemove,
  exportStatus,
  onCopySummary,
  onDownloadJson,
  onDownloadText,
}: {
  item: BatchItem;
  onToggleExpand: () => void;
  onRemove: () => void;
  exportStatus: string;
  onCopySummary: () => void;
  onDownloadJson: () => void;
  onDownloadText: () => void;
}) {
  const badge = item.report ? getBatchRiskBadge(item.report.metadata_risk_level) : null;
  const dateGap = item.report ? getDateGapLabel(item.report) : "—";
  const fileSize = item.file.size < 1024 * 1024
    ? `${(item.file.size / 1024).toFixed(0)} KB`
    : `${(item.file.size / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <>
      <tr
        className={`border-t border-slate-200 transition ${item.status === "done" ? "cursor-pointer hover:bg-indigo-50/30" : ""} ${item.expanded ? "bg-indigo-50/20" : ""}`}
        onClick={item.status === "done" ? onToggleExpand : undefined}
      >
        <td className="max-w-[180px] px-4 py-3">
          <p className="truncate font-medium text-slate-800">{item.file.name}</p>
        </td>
        <td className="px-4 py-3">
          {item.status === "pending" && <span className="text-xs font-medium text-slate-400">Pending</span>}
          {item.status === "analyzing" && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600">
              <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> Analyzing
            </span>
          )}
          {item.status === "done" && badge && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
          )}
          {item.status === "error" && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500" title={item.error}>Error</span>
          )}
        </td>
        <td className="px-4 py-3 text-slate-600">
          {item.report ? item.report.findings.length : "—"}
        </td>
        <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">{fileSize}</td>
        <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">{dateGap}</td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            {item.status === "done" && (
              <button
                aria-expanded={item.expanded}
                aria-label={`${item.expanded ? "Collapse" : "Expand"} report for ${item.file.name}`}
                className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
                type="button"
              >
                <ChevronDownIcon className={`h-4 w-4 transition-transform ${item.expanded ? "rotate-180" : ""}`} />
              </button>
            )}
            <button
              className="ml-1 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              title="Remove"
              type="button"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {item.expanded && item.report && (
        <tr className="border-t border-indigo-100 bg-indigo-50/10">
          <td className="px-4 pb-6 pt-2" colSpan={6}>
            <ReportView
              exportStatus={exportStatus}
              onCopySummary={onCopySummary}
              onDownloadJson={onDownloadJson}
              onDownloadText={onDownloadText}
              report={item.report}
            />
          </td>
        </tr>
      )}
    </>
  );
}

export default function Home() {
  const history = useHistory();
  const { save: saveToHistory } = history;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const compareInputRefs = [useRef<HTMLInputElement | null>(null), useRef<HTMLInputElement | null>(null)] as const;
  const [mode, setMode] = useState<Mode>("analyze");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [compareFiles, setCompareFiles] = useState<[File | null, File | null]>([null, null]);
  const [compareReports, setCompareReports] = useState<[Report | null, Report | null]>([null, null]);
  const [compareLoading, setCompareLoading] = useState<[boolean, boolean]>([false, false]);
  const [compareDragging, setCompareDragging] = useState<[boolean, boolean]>([false, false]);
  const [compareError, setCompareError] = useState("");
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isSharedView, setIsSharedView] = useState(false);
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchIsDragging, setBatchIsDragging] = useState(false);
  const [batchExportStatuses, setBatchExportStatuses] = useState<Record<string, string>>({});
  const isAnyAnalysisLoading = loading || compareLoading.some(Boolean);

  useEffect(() => {
    if (!isAnyAnalysisLoading) return;
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      setLoadingSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [isAnyAnalysisLoading]);

  // Reconstruct a shared report from the URL hash on the client only (the hash
  // never reaches the server, so this cannot run during SSR without mismatch).
  // Also listen for hashchange so pasting a share link into an already-open tab
  // — a same-document navigation that never remounts — still loads the report.
  useEffect(() => {
    const applyHashReport = () => {
      if (!window.location.hash.startsWith(SHARE_HASH_PREFIX)) return;
      const shared = decodeReportFromHash(window.location.hash.slice(SHARE_HASH_PREFIX.length));
      if (!shared) return;
      setReport(shared);
      setMode("analyze");
      setIsSharedView(true);
      setIsDemoMode(false);
    };
    applyHashReport();
    window.addEventListener("hashchange", applyHashReport);
    return () => window.removeEventListener("hashchange", applyHashReport);
  }, []);

  const requestAnalysis = useCallback(async (selectedFile: File, source: string) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fileInfo = getFileDebugInfo(selectedFile);

    console.info(`${LOG_PREFIX} analysis requested`, { requestId, source, file: fileInfo });
    const formData = new FormData();
    formData.append("file", selectedFile);
    console.debug(`${LOG_PREFIX} form data prepared`, {
      requestId,
      endpoint: ANALYZE_ENDPOINT,
      formKeys: Array.from(formData.keys()),
    });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      console.warn(`${LOG_PREFIX} request timed out`, { requestId, timeoutMs: REQUEST_TIMEOUT_MS });
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      console.info(`${LOG_PREFIX} sending analyze request`, { requestId, endpoint: ANALYZE_ENDPOINT, method: "POST" });
      const response = await fetch(ANALYZE_ENDPOINT, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") ?? "";
      console.info(`${LOG_PREFIX} analyze response received`, {
        requestId,
        ok: response.ok,
        status: response.status,
        contentType,
      });
      const data = contentType.includes("application/json") ? await response.json() : await response.text();

      if (!response.ok) {
        const detail =
          typeof data === "object" && data !== null && "detail" in data
            ? String(data.detail)
            : "Failed to analyze document.";
        console.error(`${LOG_PREFIX} analyze response failed`, { requestId, status: response.status, detail });
        throw new Error(detail);
      }

      if (typeof data !== "object" || data === null || !Array.isArray((data as Report).findings)) {
        console.error(`${LOG_PREFIX} unexpected analyze response shape`, { requestId });
        throw new Error("The analysis service returned an unexpected response.");
      }

      const analyzedReport = data as Report;
      console.info(`${LOG_PREFIX} analysis completed`, {
        requestId,
        source,
        documentName: analyzedReport.document_name,
        riskLevel: analyzedReport.metadata_risk_level,
        riskScore: analyzedReport.metadata_risk_score,
        findingsCount: analyzedReport.findings.length,
      });
      return analyzedReport;
    } finally {
      window.clearTimeout(timeoutId);
      console.debug(`${LOG_PREFIX} analysis request finished`, { requestId, source });
    }
  }, []);

  const analyzeFile = useCallback(
    async (selectedFile: File) => {
      setLoadingSeconds(0);
      setLoading(true);
      setError("");
      setReport(null);
      setIsDemoMode(false);
      setIsSharedView(false);

      try {
        const result = await requestAnalysis(selectedFile, "analyze");
        setReport(result);
        saveToHistory(result);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setError(`The API did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds. Try a smaller PDF.`);
        } else if (err instanceof TypeError) {
          setError(`Could not reach ${ANALYZE_ENDPOINT}. Please try again.`);
        } else {
          setError(err instanceof Error ? err.message : "Something went wrong.");
        }
      } finally {
        setLoading(false);
      }
    },
    [requestAnalysis, saveToHistory]
  );

  const selectFile = useCallback(
    (selectedFile: File | null, source: "input" | "drop" | "submit") => {
      console.info(`${LOG_PREFIX} file selected`, {
        source,
        hasFile: Boolean(selectedFile),
        file: selectedFile ? getFileDebugInfo(selectedFile) : null,
      });
      setFile(selectedFile);
      setError("");
      setReport(null);
      setExportStatus("");
      const validationMessage = validatePdfFile(selectedFile);
      if (validationMessage) {
        setError(validationMessage);
        return;
      }
      void analyzeFile(selectedFile as File);
    },
    [analyzeFile]
  );

  const loadDemo = useCallback(() => {
    setMode("analyze");
    setFile(null);
    setReport(DEMO_REPORT);
    setError("");
    setExportStatus("");
    setIsDemoMode(true);
    setIsSharedView(false);
  }, []);

  const shareReport = useCallback(async () => {
    if (!report) return;
    const url = `${window.location.origin}${window.location.pathname}${SHARE_HASH_PREFIX}${encodeReportToHash(report)}`;
    try {
      await navigator.clipboard.writeText(url);
      setExportStatus("Share link copied to clipboard.");
    } catch {
      // Reflect it in the address bar so the user can still copy it manually.
      window.history.replaceState(null, "", url);
      setExportStatus("Share link added to the address bar — copy it from there.");
    }
  }, [report]);

  const printReport = useCallback(() => {
    // The print stylesheet (globals.css @media print) isolates the report
    // subtree, so the browser's native dialog can save it as a clean PDF.
    window.print();
  }, []);

  const selectCompareFile = useCallback(
    async (slot: CompareSlot, selectedFile: File | null, source: "input" | "drop") => {
      console.info(`${LOG_PREFIX} compare file selected`, {
        slot: slot + 1,
        source,
        hasFile: Boolean(selectedFile),
        file: selectedFile ? getFileDebugInfo(selectedFile) : null,
      });
      setCompareFiles((current) => {
        const next: [File | null, File | null] = [...current];
        next[slot] = selectedFile;
        return next;
      });
      setCompareReports((current) => {
        const next: [Report | null, Report | null] = [...current];
        next[slot] = null;
        return next;
      });
      setCompareError("");
      const validationMessage = validatePdfFile(selectedFile);
      if (validationMessage) {
        setCompareError(`File ${slot + 1}: ${validationMessage}`);
        return;
      }

      setLoadingSeconds(0);
      setCompareLoading((current) => {
        const next: [boolean, boolean] = [...current];
        next[slot] = true;
        return next;
      });

      try {
        const analyzedReport = await requestAnalysis(selectedFile as File, `compare-${slot + 1}`);
        setCompareReports((current) => {
          const next: [Report | null, Report | null] = [...current];
          next[slot] = analyzedReport;
          return next;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to analyze comparison file.";
        console.error(`${LOG_PREFIX} compare analysis failed`, { slot: slot + 1, error: err });
        setCompareError(`File ${slot + 1}: ${message}`);
      } finally {
        setCompareLoading((current) => {
          const next: [boolean, boolean] = [...current];
          next[slot] = false;
          return next;
        });
      }
    },
    [requestAnalysis]
  );

  const compareRows = useMemo<CompareRow[]>(() => {
    const [leftReport, rightReport] = compareReports;
    if (!leftReport || !rightReport) return [];
    return compareKeys.map((key) => {
      const left = formatValue(leftReport.extracted_metadata[key]);
      const right = formatValue(rightReport.extracted_metadata[key]);
      return { key, left, right, matches: left === right };
    });
  }, [compareReports]);

  const differencesCount = compareRows.filter((row) => !row.matches).length;
  const matchesCount = compareRows.length - differencesCount;
  const filteredCompareRows = showOnlyDifferences ? compareRows.filter((row) => !row.matches) : compareRows;
  const riskDelta = compareReports[0] && compareReports[1] ? Math.abs(compareReports[0].metadata_risk_score - compareReports[1].metadata_risk_score) : 0;

  const downloadBlob = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildReportSummary = (currentReport: Report) => [
    `Metadata report: ${currentReport.document_name}`,
    `Risk: ${currentReport.metadata_risk_level} (${currentReport.metadata_risk_score}/100)`,
    `Findings: ${currentReport.findings.length}`,
    `Summary: ${currentReport.summary}`,
    `Recommended action: ${currentReport.recommended_action}`,
  ].join("\n");

  const downloadJson = () => {
    if (!report) return;
    downloadBlob(JSON.stringify(report, null, 2), `${report.document_name}-metadata-report.json`, "application/json");
    setExportStatus("JSON report downloaded.");
  };

  const downloadText = () => {
    if (!report) return;
    const findingsText = report.findings.length
      ? report.findings.map((finding) => `- [${finding.severity}] ${finding.title}: ${finding.explanation}`).join("\n")
      : "- No suspicious metadata indicators were detected.";
    downloadBlob(`${buildReportSummary(report)}\n\nFindings:\n${findingsText}\n`, `${report.document_name}-metadata-report.txt`, "text/plain");
    setExportStatus("Text report downloaded.");
  };

  const copySummary = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(buildReportSummary(report));
      setExportStatus("Summary copied to clipboard.");
    } catch {
      setExportStatus("Couldn't copy to clipboard — try selecting the summary manually.");
    }
  };

  const switchMode = (nextMode: Mode) => {
    console.info(`${LOG_PREFIX} mode changed`, { nextMode });
    setMode(nextMode);
    setError("");
    setCompareError("");
  };

  // WAI-ARIA tabs keyboard support: arrow keys / Home / End move focus between
  // tabs and activate them (automatic activation), matching the roving tabindex.
  const tabRefs = useRef<Partial<Record<Mode, HTMLButtonElement | null>>>({});
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = TAB_ORDER.indexOf(mode);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % TAB_ORDER.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = TAB_ORDER.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextMode = TAB_ORDER[nextIndex];
    switchMode(nextMode);
    tabRefs.current[nextMode]?.focus();
  };

  const analyzeBatchItem = useCallback(async (id: string, file: File) => {
    setBatchItems(prev => prev.map(item => item.id === id ? { ...item, status: "analyzing" as BatchStatus } : item));
    try {
      const result = await requestAnalysis(file, `batch-${id}`);
      setBatchItems(prev => prev.map(item => item.id === id ? { ...item, status: "done" as BatchStatus, report: result } : item));
      saveToHistory(result);
    } catch (err) {
      const message = err instanceof DOMException && err.name === "AbortError"
        ? "Timed out"
        : err instanceof Error ? err.message : "Failed";
      setBatchItems(prev => prev.map(item => item.id === id ? { ...item, status: "error" as BatchStatus, error: message } : item));
    }
  }, [requestAnalysis, saveToHistory]);

  const addBatchFiles = useCallback((files: FileList) => {
    const newItems: BatchItem[] = Array.from(files)
      .filter(f => (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) && f.size > 0 && f.size <= MAX_UPLOAD_SIZE_BYTES)
      .map(f => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: "pending" as BatchStatus,
        report: null,
        error: "",
        expanded: false,
      }));
    if (!newItems.length) return;
    setBatchItems(prev => [...prev, ...newItems]);
    const CONCURRENCY = 3;
    const run = async () => {
      for (let i = 0; i < newItems.length; i += CONCURRENCY) {
        await Promise.all(newItems.slice(i, i + CONCURRENCY).map(item => analyzeBatchItem(item.id, item.file)));
      }
    };
    void run();
  }, [analyzeBatchItem]);

  const runPendingBatch = useCallback(() => {
    const pending = batchItems.filter(i => i.status === "pending");
    if (!pending.length) return;
    const CONCURRENCY = 3;
    const run = async () => {
      for (let i = 0; i < pending.length; i += CONCURRENCY) {
        await Promise.all(pending.slice(i, i + CONCURRENCY).map(item => analyzeBatchItem(item.id, item.file)));
      }
    };
    void run();
  }, [batchItems, analyzeBatchItem]);

  const toggleBatchExpanded = useCallback((id: string) => {
    setBatchItems(prev => prev.map(item => item.id === id ? { ...item, expanded: !item.expanded } : item));
  }, []);

  const removeBatchItem = useCallback((id: string) => {
    setBatchItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearBatch = useCallback(() => {
    setBatchItems([]);
    setBatchExportStatuses({});
  }, []);

  const batchCopySummary = useCallback(async (id: string) => {
    const item = batchItems.find(i => i.id === id);
    if (!item?.report) return;
    try {
      await navigator.clipboard.writeText(buildReportSummary(item.report));
      setBatchExportStatuses(prev => ({ ...prev, [id]: "Summary copied to clipboard." }));
    } catch {
      setBatchExportStatuses(prev => ({ ...prev, [id]: "Couldn't copy to clipboard." }));
    }
  }, [batchItems]);

  const batchDownloadJson = useCallback((id: string) => {
    const item = batchItems.find(i => i.id === id);
    if (!item?.report) return;
    downloadBlob(JSON.stringify(item.report, null, 2), `${item.report.document_name}-metadata-report.json`, "application/json");
    setBatchExportStatuses(prev => ({ ...prev, [id]: "JSON report downloaded." }));
  }, [batchItems]);

  const batchDownloadText = useCallback((id: string) => {
    const item = batchItems.find(i => i.id === id);
    if (!item?.report) return;
    const findingsText = item.report.findings.length
      ? item.report.findings.map(f => `- [${f.severity}] ${f.title}: ${f.explanation}`).join("\n")
      : "- No suspicious metadata indicators were detected.";
    downloadBlob(`${buildReportSummary(item.report)}\n\nFindings:\n${findingsText}\n`, `${item.report.document_name}-metadata-report.txt`, "text/plain");
    setBatchExportStatuses(prev => ({ ...prev, [id]: "Text report downloaded." }));
  }, [batchItems]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-[76px] max-w-5xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ShieldIcon className="h-8 w-8 shrink-0 text-indigo-600" />
            <div>
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-950">
                Document Metadata Mutation Checker
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">Analyze metadata consistency & compare documents</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {["Next.js", "TypeScript", "Tailwind CSS", "Node.js"].map((tag) => (
                  <span key={tag} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div
            aria-label="Analysis modes"
            className="flex w-full flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 sm:inline-flex sm:w-fit sm:flex-nowrap"
            role="tablist"
          >
            <TabButton
              active={mode === "analyze"}
              controls="mode-panel"
              id="tab-analyze"
              onClick={() => switchMode("analyze")}
              onKeyDown={handleTabKeyDown}
              tabRef={(el) => { tabRefs.current.analyze = el; }}
            >
              <EyeIcon className="h-4 w-4" />
              Analyze
            </TabButton>
            <TabButton
              active={mode === "compare"}
              controls="mode-panel"
              id="tab-compare"
              onClick={() => switchMode("compare")}
              onKeyDown={handleTabKeyDown}
              tabRef={(el) => { tabRefs.current.compare = el; }}
            >
              <CompareIcon className="h-4 w-4" />
              Compare
            </TabButton>
            <TabButton
              active={mode === "batch"}
              controls="mode-panel"
              id="tab-batch"
              onClick={() => switchMode("batch")}
              onKeyDown={handleTabKeyDown}
              tabRef={(el) => { tabRefs.current.batch = el; }}
            >
              <LayersIcon className="h-4 w-4" />
              Batch
            </TabButton>
            <TabButton
              active={mode === "history"}
              controls="mode-panel"
              id="tab-history"
              onClick={() => switchMode("history")}
              onKeyDown={handleTabKeyDown}
              tabRef={(el) => { tabRefs.current.history = el; }}
            >
              <HistoryIcon className="h-4 w-4" />
              History
              {history.entries.length > 0 && (
                <span className="ml-0.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-700">
                  {history.entries.length}
                </span>
              )}
            </TabButton>
          </div>
        </div>
      </header>

      <main
        aria-labelledby={`tab-${mode}`}
        className="mx-auto w-full max-w-5xl flex-1 px-6 py-8"
        id="mode-panel"
        role="tabpanel"
        tabIndex={0}
      >
        {mode === "analyze" ? (
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!file) {
                  setError(validatePdfFile(file));
                  return;
                }
                selectFile(file, "submit");
              }}
            >
              <UploadDropzone
                help="Supports PDF files up to 8MB. Analysis starts automatically."
                inputRef={inputRef}
                isDragging={isDragging}
                loading={loading}
                loadingSeconds={loadingSeconds}
                onBrowse={() => inputRef.current?.click()}
                onDragLeave={() => setIsDragging(false)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  selectFile(event.dataTransfer.files?.[0] ?? null, "drop");
                }}
                onInputChange={(event) => selectFile(event.target.files?.[0] ?? null, "input")}
                selectedName={file?.name}
                browseLabel="Browse File"
                title="Drag & drop your file here"
                validationMessage={error}
              />
            </form>


            {!report && !loading && (
              <p className="mt-4 text-center text-sm text-slate-500">
                Don&apos;t have a PDF handy?{" "}
                <button
                  className="font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-700"
                  onClick={loadDemo}
                  type="button"
                >
                  Try with a sample document
                </button>
              </p>
            )}

            {isDemoMode && report && (
              <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                <span className="font-semibold">Demo mode</span>
                <span className="text-amber-700">Showing pre-loaded sample analysis. Upload your own PDF to analyze a real document.</span>
                <button
                  className="ml-auto text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900"
                  onClick={() => { setReport(null); setIsDemoMode(false); }}
                  type="button"
                >
                  Clear demo
                </button>
              </div>
            )}

            {isSharedView && report && (
              <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800">
                <span className="font-semibold">Shared report</span>
                <span className="text-indigo-700">You&apos;re viewing an analysis opened from a shared link.</span>
                <button
                  className="ml-auto text-xs font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                  onClick={() => {
                    setReport(null);
                    setIsSharedView(false);
                    window.history.replaceState(null, "", window.location.pathname);
                  }}
                  type="button"
                >
                  Start fresh
                </button>
              </div>
            )}

            {report && <ReportView exportStatus={exportStatus} onCopySummary={copySummary} onDownloadJson={downloadJson} onDownloadText={downloadText} onPrint={printReport} onShare={shareReport} report={report} />}
          </>
        ) : mode === "compare" ? (
          <>
            <div className="grid gap-5 lg:grid-cols-2">
              {[0, 1].map((index) => {
                const slot = index as CompareSlot;
                return (
                  <UploadDropzone
                    key={slot}
                    help="Upload a PDF to compare extracted metadata."
                    inputRef={compareInputRefs[slot]}
                    isDragging={compareDragging[slot]}
                    loading={compareLoading[slot]}
                    loadingSeconds={loadingSeconds}
                    onBrowse={() => compareInputRefs[slot].current?.click()}
                    onDragLeave={() =>
                      setCompareDragging((current) => {
                        const next: [boolean, boolean] = [...current];
                        next[slot] = false;
                        return next;
                      })
                    }
                    onDragOver={(event) => {
                      event.preventDefault();
                      setCompareDragging((current) => {
                        const next: [boolean, boolean] = [...current];
                        next[slot] = true;
                        return next;
                      });
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setCompareDragging((current) => {
                        const next: [boolean, boolean] = [...current];
                        next[slot] = false;
                        return next;
                      });
                      void selectCompareFile(slot, event.dataTransfer.files?.[0] ?? null, "drop");
                    }}
                    onInputChange={(event) => void selectCompareFile(slot, event.target.files?.[0] ?? null, "input")}
                    selectedName={compareFiles[slot]?.name}
                    title={`Upload ${slot === 0 ? "original" : "comparison"} PDF`}
                  />
                );
              })}
            </div>

            {compareError && (
              <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {compareError}
              </div>
            )}

            {compareReports[0] && compareReports[1] && (
              <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Comparison dashboard</p>
                    <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                      {differencesCount === 0 ? "Metadata matches" : `${differencesCount} metadata differences found`}
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      {compareReports[0].document_name} compared with {compareReports[1].document_name}
                    </p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                    <input
                      checked={showOnlyDifferences}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      onChange={(event) => setShowOnlyDifferences(event.target.checked)}
                      type="checkbox"
                    />
                    Show only differences
                  </label>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-4">
                  <DashboardMetric label="Compared fields" tone="indigo" value={`${compareRows.length}`} />
                  <DashboardMetric label="Matching" tone="emerald" value={`${matchesCount}`} />
                  <DashboardMetric label="Different" tone={differencesCount ? "amber" : "emerald"} value={`${differencesCount}`} />
                  <DashboardMetric label="Risk delta" tone={riskDelta ? "amber" : "emerald"} value={`${riskDelta}`} />
                </div>

                <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Field</th>
                        <th className="px-4 py-3 font-semibold">Original</th>
                        <th className="px-4 py-3 font-semibold">Comparison</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCompareRows.length === 0 ? (
                        <tr>
                          <td className="px-4 py-5 text-center text-sm font-medium text-slate-500" colSpan={4}>
                            No differences to show.
                          </td>
                        </tr>
                      ) : (
                        filteredCompareRows.map((row) => (
                          <tr className={`border-t border-slate-200 transition ${row.matches ? "hover:bg-slate-50" : "bg-amber-50/40 hover:bg-amber-50"}`} key={row.key}>
                            <td className="bg-slate-50 px-4 py-3 font-medium text-slate-700">{formatMetadataLabel(row.key)}</td>
                            <td className="px-4 py-3 text-slate-600">{row.left}</td>
                            <td className="px-4 py-3 text-slate-600">{row.right}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  row.matches ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {row.matches ? "Match" : "Different"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        ) : mode === "batch" ? (
          <>
            <input
              ref={batchInputRef}
              accept="application/pdf"
              className="sr-only"
              multiple
              onChange={(e) => { if (e.target.files?.length) addBatchFiles(e.target.files); }}
              type="file"
            />
            <BatchDropzone
              inputRef={batchInputRef}
              isDragging={batchIsDragging}
              onBrowse={() => batchInputRef.current?.click()}
              onDragLeave={() => setBatchIsDragging(false)}
              onDragOver={(e) => { e.preventDefault(); setBatchIsDragging(true); }}
              onDrop={(e) => {
                e.preventDefault();
                setBatchIsDragging(false);
                if (e.dataTransfer.files?.length) addBatchFiles(e.dataTransfer.files);
              }}
              onInputChange={(e) => { if (e.target.files?.length) addBatchFiles(e.target.files); }}
              pending={batchItems.filter(i => i.status === "pending").length}
            />
            {batchItems.length > 0 && (
              <BatchTable
                exportStatuses={batchExportStatuses}
                items={batchItems}
                onBatchCopySummary={batchCopySummary}
                onBatchDownloadJson={batchDownloadJson}
                onBatchDownloadText={batchDownloadText}
                onClear={clearBatch}
                onRemove={removeBatchItem}
                onRunPending={runPendingBatch}
                onToggleExpand={toggleBatchExpanded}
              />
            )}
          </>
        ) : mode === "history" ? (
          <HistoryPanel
            entries={history.entries}
            onClear={history.clear}
            onOpen={(entry) => {
              setReport(entry.report);
              setFile(null);
              setIsDemoMode(false);
              setError("");
              setExportStatus("");
              switchMode("analyze");
            }}
            onRemove={history.remove}
          />
        ) : null}

      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl justify-center px-6 py-6 text-sm text-slate-500 sm:justify-end">
          <div className="flex flex-wrap gap-3">
            <a className="font-medium text-slate-700 transition hover:text-indigo-600" href="https://github.com/Damika-Anupama/Metadata-Mutation-Checker" rel="noreferrer" target="_blank">
              GitHub repo
            </a>
            <a className="font-medium text-slate-700 transition hover:text-indigo-600" href="https://github.com/Damika-Anupama" rel="noreferrer" target="_blank">
              Developer profile
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

