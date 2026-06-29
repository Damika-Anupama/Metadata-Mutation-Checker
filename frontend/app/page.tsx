"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CompareRow, CompareSlot, Finding, IconProps, Mode, Report } from "@/lib/types";

const ANALYZE_ENDPOINT = "/api/analyze";
const REQUEST_TIMEOUT_MS = 30000;
const MAX_UPLOAD_SIZE_MB = 8;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const LOG_PREFIX = "[PDF Auto Analyze]";

const DEMO_REPORT: Report = {
  document_name: "service_agreement_2022.pdf",
  file_type: "PDF",
  metadata_risk_score: 68,
  metadata_risk_level: "High",
  summary:
    "This document exhibits multiple metadata inconsistencies that warrant further investigation. The creation tool chain is inconsistent, the modification date is significantly later than the creation date, and the author field has been cleared — patterns commonly associated with retroactive document editing.",
  extracted_metadata: {
    file_name: "service_agreement_2022.pdf",
    file_size_bytes: 184320,
    file_type: "PDF",
    pdf_version: "1.6",
    created_date: "2022-04-14",
    modified_date: "2024-09-27",
    raw_created_date: "D:20220414112034+05'30'",
    raw_modified_date: "D:20240927183201Z",
    author: null,
    creator: "Microsoft Word 2016",
    producer: "Adobe PDF Library 23.6",
    title: "Service Agreement",
    subject: null,
    page_count: 8,
    is_encrypted: false,
    incremental_updates: 2,
  },
  findings: [
    {
      title: "Creator/Producer Version Mismatch",
      severity: "High",
      confidence: 0.92,
      category: "Authoring Tools",
      explanation:
        "The document was created using Microsoft Word 2016, but the PDF producer is Adobe PDF Library 23.6 (released in 2023). This means the document was re-exported through a newer tool years after its stated creation date — a strong indicator of post-creation modification.",
    },
    {
      title: "Modification Date 29 Months After Creation",
      severity: "Medium",
      confidence: 0.78,
      category: "Temporal Anomaly",
      explanation:
        "The creation date is April 2022 but the last modification timestamp is September 2024 — a gap of 29 months. The modification also occurred in a different timezone (UTC) than the original creation (+05:30), suggesting the document was edited on a different system or location.",
    },
    {
      title: "Author Field Cleared",
      severity: "Medium",
      confidence: 0.71,
      category: "Missing Fields",
      explanation:
        "The Author metadata field is empty. Microsoft Word typically populates this automatically from the system user account. A blank Author field in a Word-generated PDF usually indicates the field was deliberately cleared before re-exporting.",
    },
  ],
  recommended_action:
    "Request the original source file (e.g., .docx) from the issuing party and verify that creation and modification timestamps are consistent with the stated signing date.",
  disclaimer:
    "This tool identifies statistical and structural anomalies in PDF metadata. Results are indicative only and do not confirm document forgery or authenticity. Consult a qualified document examiner for legal or compliance matters.",
};

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

function validatePdfFile(selectedFile: File | null) {
  if (!selectedFile) return "Please choose a PDF file first.";
  const hasPdfMime = selectedFile.type === "application/pdf";
  const hasPdfName = selectedFile.name.toLowerCase().endsWith(".pdf");
  if (!hasPdfMime && !hasPdfName) return "Only PDF files are supported for this demo.";
  if (selectedFile.size > MAX_UPLOAD_SIZE_BYTES) return `PDF is too large. Upload a file up to ${MAX_UPLOAD_SIZE_MB}MB.`;
  if (selectedFile.size === 0) return "The selected PDF is empty. Choose a valid document.";
  return "";
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

function getSeverityBadge(severity: string) {
  if (severity === "High") return "border-red-200 bg-red-50 text-red-700";
  if (severity === "Medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function getSeverityAccent(severity: string) {
  if (severity === "High") return "border-l-red-500";
  if (severity === "Medium") return "border-l-amber-500";
  return "border-l-emerald-500";
}

function getConfidenceBar(severity: string) {
  if (severity === "High") return "bg-red-500";
  if (severity === "Medium") return "bg-amber-500";
  return "bg-emerald-500";
}

const SEVERITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

function sortFindingsBySeverity(findings: Finding[]) {
  return [...findings].sort((a, b) => {
    const order = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
    return order !== 0 ? order : b.confidence - a.confidence;
  });
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

const FINDING_CATEGORY_LABELS: Record<string, string> = {
  date: "Date & time",
  software: "Authoring tools",
  missing_metadata: "Missing metadata",
  structure: "Document structure",
};

function formatFindingCategory(category: string) {
  return (
    FINDING_CATEGORY_LABELS[category] ??
    category.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function getMetadataGroup(key: string) {
  if (["file_name", "file_size_bytes", "file_type", "pdf_version", "page_count", "is_encrypted", "incremental_updates"].includes(key)) return "File & structure";
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

function getLoadingStep(seconds: number) {
  if (seconds >= 8) return "Preparing report";
  if (seconds >= 5) return "Checking mutation signals";
  if (seconds >= 2) return "Extracting metadata";
  return "Uploading file";
}

function LandingHighlights({ onLoadDemo }: { onLoadDemo: () => void }) {
  const steps = [
    {
      icon: UploadIcon,
      title: "1 · Upload a PDF",
      body: "Drop in any PDF up to 8MB. Nothing is stored — analysis runs on the spot and starts automatically.",
    },
    {
      icon: ShieldIcon,
      title: "2 · Scan the metadata",
      body: "Creator/producer chains, timestamps, and missing fields are checked against known tampering patterns.",
    },
    {
      icon: EyeIcon,
      title: "3 · Read the report",
      body: "Get a 0–100 risk score, ranked findings with confidence, and a recommended next step you can export.",
    },
  ];

  const features = [
    { icon: ShieldIcon, label: "Rule-based risk scoring" },
    { icon: CompareIcon, label: "Side-by-side document compare" },
    { icon: FileIcon, label: "Searchable, grouped metadata" },
    { icon: DownloadIcon, label: "Export as JSON or text" },
  ];

  return (
    <section className="animate-fade-in-up mt-10">
      <div className="grid gap-4 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-sm font-bold tracking-tight text-slate-900">{title}</h3>
            <p className="mt-1.5 text-sm leading-6 text-slate-500">{body}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">What you get</span>
        {features.map(({ icon: Icon, label }) => (
          <span key={label} className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
            <Icon className="h-4 w-4 text-indigo-500" />
            {label}
          </span>
        ))}
        <button
          className="ml-auto inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100"
          onClick={onLoadDemo}
          type="button"
        >
          <EyeIcon className="h-4 w-4" />
          See a sample report
        </button>
      </div>
    </section>
  );
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
  const clamped = Math.max(0, Math.min(score, 100));
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = prefersReducedMotion ? 0 : 900;

    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      setProgress(1 - Math.pow(1 - t, 3)); // easeOutCubic
      if (t < 1) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [clamped]);

  const offset = circumference - (clamped / 100) * progress * circumference;
  const displayScore = Math.round(clamped * progress);

  return (
    <div
      aria-label={`Metadata risk score ${clamped} out of 100, ${level} risk`}
      className="relative grid h-32 w-32 shrink-0 place-items-center"
      role="img"
    >
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
        <p className={`text-3xl font-black tabular-nums ${getRiskAccent(level)}`}>{displayScore}</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">risk score</p>
      </div>
    </div>
  );
}

function RiskScaleBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(score, 100));
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
        <span>Risk scale</span>
        <span className="tabular-nums text-slate-500">{clamped}/100</span>
      </div>
      <div
        aria-label={`Risk scale: ${clamped} of 100. Bands: Low below 40, Medium 40 to 69, High 70 and above.`}
        className="relative mt-2 h-2.5 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500"
        role="img"
      >
        <div
          aria-hidden="true"
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900 shadow-md transition-[left] duration-700 ease-out"
          style={{ left: `${clamped}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs font-medium text-slate-400">
        <span>0 · Low</span>
        <span>40 · Medium</span>
        <span>70 · High</span>
      </div>
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      aria-selected={active}
      className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
        active ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:bg-white/70 hover:text-slate-700"
      }`}
      onClick={onClick}
      role="tab"
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

export default function Home() {
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
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const isAnyAnalysisLoading = loading || compareLoading.some(Boolean);

  useEffect(() => {
    if (!isAnyAnalysisLoading) return;
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      setLoadingSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [isAnyAnalysisLoading]);

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
      setLoadingSeconds(0);
      setLoading(true);
      setError("");
      setAnalysisFailed(false);
      setReport(null);
      setIsDemoMode(false);

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
        setAnalysisFailed(true);
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
      setAnalysisFailed(false);
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
  }, []);

  const resetAnalysis = useCallback(() => {
    setFile(null);
    setReport(null);
    setError("");
    setExportStatus("");
    setIsDemoMode(false);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    inputRef.current?.click();
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

  const downloadCompareCsv = () => {
    const [left, right] = compareReports;
    if (!left || !right) return;
    const escape = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ["Field", left.document_name, right.document_name, "Status"],
      ...compareRows.map((row) => [
        formatMetadataLabel(row.key),
        row.left,
        row.right,
        row.matches ? "Match" : "Different",
      ]),
    ];
    const csv = rows.map((cells) => cells.map(escape).join(",")).join("\n");
    downloadBlob(csv, "metadata-comparison.csv", "text/csv");
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
    await navigator.clipboard.writeText(buildReportSummary(report));
    setExportStatus("Summary copied to clipboard.");
  };

  const switchMode = (nextMode: Mode) => {
    console.info(`${LOG_PREFIX} mode changed`, { nextMode });
    setMode(nextMode);
    setError("");
    setCompareError("");
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md">
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

          <div aria-label="View mode" className="inline-flex w-fit items-center gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
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
                title="Drag & drop your file here"
                validationMessage={analysisFailed ? "" : error}
              />
            </form>

            {analysisFailed && (
              <div className="animate-fade-in-up mt-5 rounded-xl border border-red-200 bg-red-50 p-5">
                <div className="flex items-start gap-3">
                  <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-red-800">Analysis couldn&apos;t be completed</p>
                    <p className="mt-1 text-sm text-red-700">{error}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!file}
                        onClick={() => file && void analyzeFile(file)}
                        type="button"
                      >
                        <SpinnerIcon className="h-4 w-4" />
                        Try again
                      </button>
                      <button
                        className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                        onClick={loadDemo}
                        type="button"
                      >
                        Use the sample document instead
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!report && !loading && !analysisFailed && (
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

            {!report && !loading && !analysisFailed && <LandingHighlights onLoadDemo={loadDemo} />}

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

            {report && <ReportView exportStatus={exportStatus} onCopySummary={copySummary} onDownloadJson={downloadJson} onDownloadText={downloadText} onReset={resetAnalysis} report={report} />}
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

            {Boolean(compareReports[0]) !== Boolean(compareReports[1]) && (
              <div className="animate-fade-in-up mt-6 flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-5 py-4 text-sm text-indigo-800">
                <CompareIcon className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                <div>
                  <p className="font-semibold">One document analyzed</p>
                  <p className="mt-0.5 text-indigo-700">
                    Upload the {compareReports[0] ? "comparison" : "original"} document to reveal the side-by-side metadata comparison.
                  </p>
                </div>
              </div>
            )}

            {compareReports[0] && compareReports[1] && (
              <section className="animate-fade-in-up mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                      <input
                        checked={showOnlyDifferences}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        onChange={(event) => setShowOnlyDifferences(event.target.checked)}
                        type="checkbox"
                      />
                      Show only differences
                    </label>
                    <button
                      className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      onClick={downloadCompareCsv}
                      type="button"
                    >
                      <DownloadIcon className="h-4 w-4" />
                      CSV
                    </button>
                  </div>
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
        )}

      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-sm">
              <div className="flex items-center gap-2.5">
                <ShieldIcon className="h-6 w-6 text-indigo-600" />
                <span className="text-sm font-bold tracking-tight text-slate-900">Document Metadata Mutation Checker</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                A full-stack demo that flags PDF tampering signals from document metadata.
                Built by{" "}
                <a className="font-medium text-slate-700 underline-offset-2 transition hover:text-indigo-600 hover:underline" href="https://github.com/Damika-Anupama" rel="noreferrer" target="_blank">
                  Damika Anupama
                </a>
                .
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {["Next.js", "TypeScript", "Tailwind CSS", "FastAPI"].map((tag) => (
                  <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <nav className="flex flex-col gap-2.5 text-sm" aria-label="Footer">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Links</p>
              <a className="font-medium text-slate-600 transition hover:text-indigo-600" href="https://github.com/Damika-Anupama/Metadata-Mutation-Checker" rel="noreferrer" target="_blank">
                Source code →
              </a>
              <a className="font-medium text-slate-600 transition hover:text-indigo-600" href="https://github.com/Damika-Anupama" rel="noreferrer" target="_blank">
                Developer profile →
              </a>
            </nav>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-5 text-xs text-slate-400">
            For demonstration only — results are indicative and do not confirm document forgery or authenticity.
          </div>
        </div>
      </footer>
    </div>
  );
}

function ReportView({
  report,
  exportStatus,
  onCopySummary,
  onDownloadJson,
  onDownloadText,
  onReset,
}: {
  report: Report;
  exportStatus: string;
  onCopySummary: () => void;
  onDownloadJson: () => void;
  onDownloadText: () => void;
  onReset: () => void;
}) {
  return (
    <section className="animate-fade-in-up mt-8 grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Analysis dashboard</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{report.document_name}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50" onClick={onReset} type="button">
              <UploadIcon className="h-4 w-4" />
              New analysis
            </button>
            <button className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50" onClick={onCopySummary} type="button">
              Copy summary
            </button>
            <button className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50" onClick={onDownloadText} type="button">
              <DownloadIcon className="h-4 w-4" />
              TXT
            </button>
            <button className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700" onClick={onDownloadJson} type="button">
              <DownloadIcon className="h-4 w-4" />
              JSON
            </button>
          </div>
        </div>
        {exportStatus && <p className="mt-3 text-sm font-medium text-emerald-700">{exportStatus}</p>}

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <RiskScoreRing level={report.metadata_risk_level} score={report.metadata_risk_score} />
            <div className="min-w-0 flex-1">
              <div className={`inline-flex rounded-full border px-3.5 py-1.5 text-sm font-semibold ${getRiskClass(report.metadata_risk_level)}`}>
                {report.metadata_risk_level} metadata risk
              </div>
              <p className="mt-4 leading-7 text-slate-600">{report.summary}</p>
            </div>
          </div>
          <RiskScaleBar score={report.metadata_risk_score} />
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
              {sortFindingsBySeverity(report.findings).map((finding, index) => {
                const confidencePct = Math.round(finding.confidence * 100);
                return (
                  <div className={`rounded-lg border border-l-4 border-slate-200 bg-slate-50 p-4 ${getSeverityAccent(finding.severity)}`} key={`${finding.title}-${index}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h4 className="font-semibold text-slate-950">{finding.title}</h4>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getSeverityBadge(finding.severity)}`}>{finding.severity}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{formatFindingCategory(finding.category)}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{finding.explanation}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div className={`h-full rounded-full ${getConfidenceBar(finding.severity)}`} style={{ width: `${confidencePct}%` }} />
                      </div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">{confidencePct}% confidence</span>
                    </div>
                  </div>
                );
              })}
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
