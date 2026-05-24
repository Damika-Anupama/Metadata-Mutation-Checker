"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

type Finding = {
  title: string;
  severity: string;
  confidence: number;
  category: string;
  explanation: string;
};

type Report = {
  document_name: string;
  file_type: string;
  metadata_risk_score: number;
  metadata_risk_level: string;
  summary: string;
  extracted_metadata: Record<string, unknown>;
  findings: Finding[];
  recommended_action: string;
  disclaimer: string;
};

type IconProps = { className?: string };
type Mode = "analyze" | "compare";
type CompareSlot = 0 | 1;

type CompareRow = {
  key: string;
  left: string;
  right: string;
  matches: boolean;
};

const ANALYZE_ENDPOINT = "/api/analyze";
const REQUEST_TIMEOUT_MS = 30000;
const LOG_PREFIX = "[PDF Auto Analyze]";
const compareKeys = [
  "file_size_bytes",
  "pdf_version",
  "created_date",
  "modified_date",
  "author",
  "creator",
  "producer",
  "title",
  "subject",
  "page_count",
  "is_encrypted",
];

function getFileDebugInfo(selectedFile: File) {
  return {
    name: selectedFile.name,
    type: selectedFile.type || "unknown",
    sizeBytes: selectedFile.size,
    lastModified: new Date(selectedFile.lastModified).toISOString(),
  };
}

function formatValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "N/A";
  return String(value);
}

function ShieldIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M12 3.25 5.75 5.6v5.25c0 4.1 2.62 7.72 6.25 9.05 3.63-1.33 6.25-4.95 6.25-9.05V5.6L12 3.25Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="m9.25 12.1 1.75 1.75 3.9-4.15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function EyeIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M2.75 12s3.35-6.25 9.25-6.25S21.25 12 21.25 12 17.9 18.25 12 18.25 2.75 12 2.75 12Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M12 14.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function CompareIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M7 4v13.25A2.75 2.75 0 0 0 9.75 20H17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M17 16.5 20.5 20 17 23.5M17 4H9.75A2.75 2.75 0 0 0 7 6.75V8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M4 4h6M4 8h6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function UploadIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M12 15.75V4.75m0 0-4 4m4-4 4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M5 14.75v2.5A2.75 2.75 0 0 0 7.75 20h8.5A2.75 2.75 0 0 0 19 17.25v-2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function SpinnerIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-20" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function FileIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M7 3.75h6.2L17 7.55v12.7H7a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M13 3.75V8h4M8.5 12.5h7M8.5 16h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function DownloadIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M12 4.75v10.5m0 0-4-4m4 4 4-4M5 19.25h14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function getRiskClass(level: string) {
  if (level === "High") return "border-red-200 bg-red-50 text-red-700";
  if (level === "Medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function getRiskAccent(level: string) {
  if (level === "High") return "text-red-600";
  if (level === "Medium") return "text-amber-600";
  return "text-emerald-600";
}

function getRiskRingColor(level: string) {
  if (level === "High") return "#dc2626";
  if (level === "Medium") return "#d97706";
  return "#059669";
}

function formatBytes(value: unknown) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "N/A";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMetadataLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getMetadataGroup(key: string) {
  if (["file_name", "file_size_bytes", "file_type", "pdf_version", "page_count", "is_encrypted"].includes(key)) return "File & structure";
  if (["created_date", "modified_date", "raw_created_date", "raw_modified_date"].includes(key)) return "Dates";
  if (["author", "title", "subject"].includes(key)) return "Document details";
  if (["creator", "producer"].includes(key)) return "Authoring tools";
  return "Other metadata";
}

function getMetadataStatus(value: unknown) {
  if (value === undefined || value === null || value === "") return { label: "Missing", className: "bg-amber-50 text-amber-700" };
  if (typeof value === "boolean") return { label: value ? "Yes" : "No", className: value ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700" };
  return { label: "Present", className: "bg-emerald-50 text-emerald-700" };
}

function DashboardMetric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "indigo" | "amber" | "emerald" }) {
  const toneClass = {
    slate: "bg-slate-50 text-slate-950",
    indigo: "bg-indigo-50 text-indigo-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
  }[tone];

  return (
    <div className={`rounded-lg border border-slate-200 p-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">{label}</p>
      <p className="mt-2 text-xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function RiskScoreRing({ score, level }: { score: number; level: string }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(score, 100)) / 100) * circumference;

  return (
    <div className="relative grid h-32 w-32 shrink-0 place-items-center">
      <svg aria-hidden="true" className="h-32 w-32 -rotate-90" viewBox="0 0 112 112">
        <circle cx="56" cy="56" fill="none" r={radius} stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="56"
          cy="56"
          fill="none"
          r={radius}
          stroke={getRiskRingColor(level)}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="10"
        />
      </svg>
      <div className="absolute text-center">
        <p className={`text-3xl font-black ${getRiskAccent(level)}`}>{score}</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">risk score</p>
      </div>
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition ${
        active ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:bg-white/70 hover:text-slate-700"
      }`}
      onClick={onClick}
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
  selectedName,
  title,
  help,
  onBrowse,
  onDragLeave,
  onDragOver,
  onDrop,
  onInputChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  loading: boolean;
  selectedName?: string;
  title: string;
  help: string;
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
          {loading ? "Analyzing..." : "Browse Files"}
        </button>
        {selectedName && (
          <p className="mt-4 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            Selected: <span className="text-slate-900">{selectedName}</span>
          </p>
        )}
        {loading && (
          <div className="mt-5 w-full rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-left">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">
              <span>Processing</span>
              <span>Please wait</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-indigo-600" />
            </div>
            <ul className="mt-3 space-y-1.5 text-xs text-indigo-700/80">
              <li>• Reading PDF structure</li>
              <li>• Extracting document metadata</li>
              <li>• Preparing the analysis report</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const compareInputRefs = [useRef<HTMLInputElement | null>(null), useRef<HTMLInputElement | null>(null)] as const;
  const [mode, setMode] = useState<Mode>("analyze");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [compareFiles, setCompareFiles] = useState<[File | null, File | null]>([null, null]);
  const [compareReports, setCompareReports] = useState<[Report | null, Report | null]>([null, null]);
  const [compareLoading, setCompareLoading] = useState<[boolean, boolean]>([false, false]);
  const [compareDragging, setCompareDragging] = useState<[boolean, boolean]>([false, false]);
  const [compareError, setCompareError] = useState("");

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
      setLoading(true);
      setError("");
      setReport(null);

      try {
        setReport(await requestAnalysis(selectedFile, "analyze"));
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
    [requestAnalysis]
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
      if (!selectedFile) return;
      void analyzeFile(selectedFile);
    },
    [analyzeFile]
  );

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
      if (!selectedFile) return;

      setCompareLoading((current) => {
        const next: [boolean, boolean] = [...current];
        next[slot] = true;
        return next;
      });

      try {
        const analyzedReport = await requestAnalysis(selectedFile, `compare-${slot + 1}`);
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

  const downloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.document_name}-metadata-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const switchMode = (nextMode: Mode) => {
    console.info(`${LOG_PREFIX} mode changed`, { nextMode });
    setMode(nextMode);
    setError("");
    setCompareError("");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-[76px] max-w-5xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ShieldIcon className="h-8 w-8 shrink-0 text-indigo-600" />
            <div>
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-950">
                Document Metadata Mutation Checker
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">Analyze metadata consistency & compare documents</p>
            </div>
          </div>

          <div className="inline-flex w-fit items-center gap-1 rounded-lg bg-slate-100 p-1">
            <TabButton active={mode === "analyze"} onClick={() => switchMode("analyze")}>
              <EyeIcon className="h-4 w-4" />
              Analyze
            </TabButton>
            <TabButton active={mode === "compare"} onClick={() => switchMode("compare")}>
              <CompareIcon className="h-4 w-4" />
              Compare
            </TabButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {mode === "analyze" ? (
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!file) {
                  setError("Please choose a PDF file first.");
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
                title="Drag & drop your file here"
              />
            </form>

            {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

            {report && <ReportView report={report} onDownload={downloadJson} />}
          </>
        ) : (
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
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Comparison report</p>
                    <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                      {differencesCount === 0 ? "Metadata matches" : `${differencesCount} metadata differences found`}
                    </h2>
                  </div>
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-sm font-semibold text-indigo-700">
                    {compareReports[0].document_name} vs {compareReports[1].document_name}
                  </span>
                </div>

                <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Field</th>
                        <th className="px-4 py-3 font-semibold">Original</th>
                        <th className="px-4 py-3 font-semibold">Comparison</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareRows.map((row) => (
                        <tr className="border-t border-slate-200" key={row.key}>
                          <td className="bg-slate-50 px-4 py-3 font-medium text-slate-700">{row.key}</td>
                          <td className="px-4 py-3 text-slate-600">{row.left}</td>
                          <td className="px-4 py-3 text-slate-600">{row.right}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                row.matches ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {row.matches ? "Match" : "Different"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ReportView({ report, onDownload }: { report: Report; onDownload: () => void }) {
  return (
    <section className="mt-8 grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Analysis dashboard</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{report.document_name}</h2>
          </div>
          <button className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50" onClick={onDownload} type="button">
            <DownloadIcon className="h-4 w-4" />
            Download JSON
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-6 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center">
          <RiskScoreRing level={report.metadata_risk_level} score={report.metadata_risk_score} />
          <div className="min-w-0 flex-1">
            <div className={`inline-flex rounded-full border px-3.5 py-1.5 text-sm font-semibold ${getRiskClass(report.metadata_risk_level)}`}>
              {report.metadata_risk_level} metadata risk
            </div>
            <p className="mt-4 leading-7 text-slate-600">{report.summary}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <DashboardMetric label="Findings" tone={report.findings.length ? "amber" : "emerald"} value={`${report.findings.length}`} />
          <DashboardMetric label="File size" value={formatBytes(report.extracted_metadata.file_size_bytes)} />
          <DashboardMetric label="Pages" value={formatValue(report.extracted_metadata.page_count)} />
          <DashboardMetric label="Encrypted" tone={report.extracted_metadata.is_encrypted ? "amber" : "emerald"} value={report.extracted_metadata.is_encrypted ? "Yes" : "No"} />
        </div>

        <div className="mt-6 rounded-lg border border-indigo-100 bg-indigo-50 p-5">
          <h3 className="font-semibold text-indigo-950">Recommended action</h3>
          <p className="mt-2 leading-7 text-indigo-900/75">{report.recommended_action}</p>
        </div>
        <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-500">{report.disclaimer}</p>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">Findings</h3>
          {report.findings.length === 0 ? (
            <p className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm font-medium text-emerald-700">No suspicious metadata indicators were detected.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {report.findings.map((finding, index) => (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" key={`${finding.title}-${index}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="font-semibold text-slate-950">{finding.title}</h4>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">{finding.severity}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{finding.category} · {Math.round(finding.confidence * 100)}% confidence</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{finding.explanation}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <MetadataTable metadata={report.extracted_metadata} />
      </div>
    </section>
  );
}


function MetadataTable({ metadata }: { metadata: Record<string, unknown> }) {
  const [query, setQuery] = useState("");
  const rows = Object.entries(metadata).map(([key, value]) => ({ key, value, group: getMetadataGroup(key) }));
  const filteredRows = rows.filter((row) => {
    const text = `${row.key} ${row.group} ${formatValue(row.value)}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });
  const groups = Array.from(new Set(filteredRows.map((row) => row.group)));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-950">Extracted metadata</h3>
          <p className="mt-1 text-sm text-slate-500">Grouped fields with searchable values and missing-data flags.</p>
        </div>
        <label className="relative block sm:w-64">
          <span className="sr-only">Search metadata</span>
          <input
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search metadata..."
            type="search"
            value={query}
          />
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        {filteredRows.length === 0 ? (
          <p className="bg-slate-50 px-4 py-5 text-sm font-medium text-slate-500">No metadata fields match your search.</p>
        ) : (
          groups.map((group) => (
            <div key={group}>
              <div className="bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{group}</div>
              <table className="w-full border-collapse text-left text-sm">
                <tbody>
                  {filteredRows
                    .filter((row) => row.group === group)
                    .map((row) => {
                      const status = getMetadataStatus(row.value);
                      return (
                        <tr className="border-t border-slate-200 transition hover:bg-indigo-50/30" key={row.key}>
                          <td className="w-2/5 bg-slate-50 px-4 py-3 font-medium text-slate-700">{formatMetadataLabel(row.key)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatValue(row.value)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
