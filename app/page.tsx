"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnnotationMap, AnnotationStatus, BatchItem, BatchStatus, CompareRow, CompareSlot, Finding, FindingAnnotation, HistoryEntry, IconProps, Mode, Report } from "@/lib/types";

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
    incremental_updates: 1,
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

function LayersIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M2 8.5 12 3.75 22 8.5 12 13.25 2 8.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="m2 13 10 4.75L22 13M2 17.5l10 4.75 10-4.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function TrashIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function DateTimeline({ metadata }: { metadata: Record<string, unknown> }) {
  const createdStr = metadata.created_date as string | null;
  const modifiedStr = metadata.modified_date as string | null;
  if (!createdStr && !modifiedStr) return null;

  const createdMs = createdStr ? new Date(createdStr).getTime() : null;
  const modifiedMs = modifiedStr ? new Date(modifiedStr).getTime() : null;
  const todayMs = Date.now();

  const earliest = Math.min(createdMs ?? todayMs, modifiedMs ?? todayMs);
  const totalSpan = Math.max(todayMs - earliest, 1);

  const L = 40;
  const R = 460;
  const W = R - L;
  const Y = 38;

  const clamp = (x: number) => Math.max(L, Math.min(R, x));
  const posX = (ms: number) => clamp(L + ((ms - earliest) / totalSpan) * W);

  const cX = createdMs !== null ? posX(createdMs) : null;
  const mX = modifiedMs !== null ? posX(modifiedMs) : null;
  const tX = posX(todayMs);

  const isFlipped = createdMs !== null && modifiedMs !== null && modifiedMs < createdMs;
  const gapMs = createdMs !== null && modifiedMs !== null ? Math.abs(modifiedMs - createdMs) : null;
  const gapDays = gapMs !== null ? Math.floor(gapMs / 86400000) : null;

  const gapColor = gapDays === null ? "#6366f1"
    : gapDays === 0 ? "#059669"
    : gapDays > 365 ? "#dc2626"
    : gapDays > 30 ? "#d97706"
    : "#059669";

  const gapLabel = gapDays === null ? null
    : gapDays === 0 ? "same day"
    : gapDays < 30 ? `${gapDays}d gap`
    : gapDays < 365 ? `${Math.floor(gapDays / 30)}mo gap`
    : `${(gapDays / 365).toFixed(1)}yr gap`;

  const fmt = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const anchorFor = (x: number) => x < L + W * 0.12 ? "start" : x > R - W * 0.12 ? "end" : "middle";

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Document timeline</p>
      {isFlipped && (
        <p className="mb-2 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
          Modified date is earlier than creation date — strong anomaly
        </p>
      )}
      <svg aria-hidden="true" className="w-full" viewBox="0 0 500 85">
        {/* base track */}
        <line x1={L} y1={Y} x2={R} y2={Y} stroke="#e2e8f0" strokeLinecap="round" strokeWidth={4} />

        {/* created → modified colored segment */}
        {cX !== null && mX !== null && (
          <line
            stroke={gapColor}
            strokeLinecap="round"
            strokeWidth={4}
            x1={Math.min(cX, mX)}
            x2={Math.max(cX, mX)}
            y1={Y}
            y2={Y}
          />
        )}

        {/* gap label above midpoint */}
        {cX !== null && mX !== null && gapLabel && Math.abs(mX - cX) > 24 && (
          <text
            dominantBaseline="auto"
            fill={gapColor}
            fontSize={10}
            fontWeight="700"
            textAnchor="middle"
            x={(cX + mX) / 2}
            y={Y - 12}
          >
            {gapLabel}
          </text>
        )}

        {/* created dot */}
        {cX !== null && createdMs !== null && (
          <>
            <circle cx={cX} cy={Y} fill="white" r={6} stroke={gapColor} strokeWidth={2.5} />
            <text dominantBaseline="hanging" fill="#64748b" fontSize={10} fontWeight="600" textAnchor={anchorFor(cX)} x={cX} y={Y + 12}>
              Created
            </text>
            <text dominantBaseline="hanging" fill="#94a3b8" fontSize={10} textAnchor={anchorFor(cX)} x={cX} y={Y + 24}>
              {fmt(createdMs)}
            </text>
          </>
        )}

        {/* modified dot */}
        {mX !== null && modifiedMs !== null && (
          <>
            <circle cx={mX} cy={Y} fill="white" r={6} stroke={isFlipped ? "#dc2626" : gapColor} strokeWidth={2.5} />
            <text dominantBaseline="hanging" fill="#64748b" fontSize={10} fontWeight="600" textAnchor={anchorFor(mX)} x={mX} y={Y + 12}>
              Modified
            </text>
            <text dominantBaseline="hanging" fill="#94a3b8" fontSize={10} textAnchor={anchorFor(mX)} x={mX} y={Y + 24}>
              {fmt(modifiedMs)}
            </text>
          </>
        )}

        {/* today dot */}
        <circle cx={tX} cy={Y} fill="#94a3b8" r={4} />
        <text dominantBaseline="hanging" fill="#94a3b8" fontSize={10} textAnchor={anchorFor(tX)} x={tX} y={Y + 12}>
          Today
        </text>
      </svg>
    </div>
  );
}

function getDateGapLabel(report: Report): string {
  const created = report.extracted_metadata.created_date as string | null;
  const modified = report.extracted_metadata.modified_date as string | null;
  if (!created || !modified) return "—";
  const diff = new Date(modified).getTime() - new Date(created).getTime();
  if (diff < 0) return "Modified before created";
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Same day";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}yr`;
}

function getBatchRiskBadge(level: string) {
  if (level === "High") return { label: "High", className: "bg-red-100 text-red-700" };
  if (level === "Medium") return { label: "Medium", className: "bg-amber-100 text-amber-700" };
  return { label: "Low", className: "bg-emerald-100 text-emerald-700" };
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

function HistoryIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M12 8v4l2.5 2.5M3.05 11a9 9 0 1 0 .49-3M3 5v6h6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

const HISTORY_KEY = "mmc-history";
const ANNOTATIONS_KEY = "mmc-annotations";

function annotationKey(documentName: string, findingTitle: string): string {
  return `${documentName}::${findingTitle}`;
}

function useAnnotations() {
  const [map, setMap] = useState<AnnotationMap>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ANNOTATIONS_KEY);
      if (raw) setMap(JSON.parse(raw) as AnnotationMap);
    } catch {}
  }, []);

  const get = useCallback((key: string): FindingAnnotation => {
    return map[key] ?? { status: null, note: "" };
  }, [map]);

  const set = useCallback((key: string, annotation: FindingAnnotation) => {
    setMap(prev => {
      const next = { ...prev, [key]: annotation };
      try { localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { get, set };
}

function FindingCard({
  finding,
  documentName,
  annotations,
}: {
  finding: Finding;
  documentName: string;
  annotations: ReturnType<typeof useAnnotations>;
}) {
  const key = annotationKey(documentName, finding.title);
  const annotation = annotations.get(key);
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(annotation.note);

  const toggleStatus = (status: AnnotationStatus) => {
    annotations.set(key, { ...annotation, status: annotation.status === status ? null : status });
  };

  const saveNote = () => {
    annotations.set(key, { ...annotation, note: noteText.trim() });
    setEditingNote(false);
  };

  const isConfirmed = annotation.status === "confirmed";
  const isFalsePositive = annotation.status === "false_positive";

  return (
    <div className={`rounded-lg border p-4 transition ${isConfirmed ? "border-emerald-200 bg-emerald-50/40" : isFalsePositive ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-semibold text-slate-950">{finding.title}</h4>
        <div className="flex items-center gap-2">
          {isConfirmed && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Confirmed</span>}
          {isFalsePositive && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-500">False positive</span>}
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">{finding.severity}</span>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-500">{finding.category} · {Math.round(finding.confidence * 100)}% confidence</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{finding.explanation}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3">
        <button
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${isConfirmed ? "bg-emerald-100 text-emerald-700" : "border border-slate-200 bg-white text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"}`}
          onClick={() => toggleStatus("confirmed")}
          type="button"
        >
          ✓ Confirmed
        </button>
        <button
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${isFalsePositive ? "bg-slate-200 text-slate-600" : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"}`}
          onClick={() => toggleStatus("false_positive")}
          type="button"
        >
          ✗ False positive
        </button>
        <button
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
          onClick={() => { setNoteText(annotation.note); setEditingNote(v => !v); }}
          type="button"
        >
          {annotation.note ? "✎ Edit note" : "+ Note"}
        </button>
      </div>

      {annotation.note && !editingNote && (
        <p className="mt-2 rounded-md border border-slate-100 bg-white/80 px-3 py-2 text-xs italic text-slate-600">
          {annotation.note}
        </p>
      )}

      {editingNote && (
        <div className="mt-2 space-y-1.5">
          <textarea
            autoFocus
            className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note about this finding..."
            rows={2}
            value={noteText}
          />
          <div className="flex gap-2">
            <button className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-indigo-700" onClick={saveNote} type="button">Save</button>
            <button className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50" onClick={() => { setNoteText(annotation.note); setEditingNote(false); }} type="button">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
const HISTORY_MAX = 50;

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setEntries(JSON.parse(raw) as HistoryEntry[]);
    } catch {}
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

function getLoadingStep(seconds: number) {
  if (seconds >= 8) return "Preparing report";
  if (seconds >= 5) return "Checking mutation signals";
  if (seconds >= 2) return "Extracting metadata";
  return "Uploading file";
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
      <input ref={inputRef} accept="application/pdf" className="sr-only" multiple onChange={onInputChange} type="file" />
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
              <ChevronDownIcon className={`h-4 w-4 text-slate-400 transition-transform ${item.expanded ? "rotate-180" : ""}`} />
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
      setReport(null);
      setIsDemoMode(false);

      try {
        const result = await requestAnalysis(selectedFile, "analyze");
        setReport(result);
        history.save(result);
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
    await navigator.clipboard.writeText(buildReportSummary(report));
    setExportStatus("Summary copied to clipboard.");
  };

  const switchMode = (nextMode: Mode) => {
    console.info(`${LOG_PREFIX} mode changed`, { nextMode });
    setMode(nextMode);
    setError("");
    setCompareError("");
  };

  const analyzeBatchItem = useCallback(async (id: string, file: File) => {
    setBatchItems(prev => prev.map(item => item.id === id ? { ...item, status: "analyzing" as BatchStatus } : item));
    try {
      const result = await requestAnalysis(file, `batch-${id}`);
      setBatchItems(prev => prev.map(item => item.id === id ? { ...item, status: "done" as BatchStatus, report: result } : item));
      history.save(result);
    } catch (err) {
      const message = err instanceof DOMException && err.name === "AbortError"
        ? "Timed out"
        : err instanceof Error ? err.message : "Failed";
      setBatchItems(prev => prev.map(item => item.id === id ? { ...item, status: "error" as BatchStatus, error: message } : item));
    }
  }, [requestAnalysis, history.save]);

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
    await navigator.clipboard.writeText(buildReportSummary(item.report));
    setBatchExportStatuses(prev => ({ ...prev, [id]: "Summary copied to clipboard." }));
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

          <div className="inline-flex w-fit items-center gap-1 rounded-lg bg-slate-100 p-1">
            <TabButton active={mode === "analyze"} onClick={() => switchMode("analyze")}>
              <EyeIcon className="h-4 w-4" />
              Analyze
            </TabButton>
            <TabButton active={mode === "compare"} onClick={() => switchMode("compare")}>
              <CompareIcon className="h-4 w-4" />
              Compare
            </TabButton>
            <TabButton active={mode === "batch"} onClick={() => switchMode("batch")}>
              <LayersIcon className="h-4 w-4" />
              Batch
            </TabButton>
            <TabButton active={mode === "history"} onClick={() => switchMode("history")}>
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

            {report && <ReportView exportStatus={exportStatus} onCopySummary={copySummary} onDownloadJson={downloadJson} onDownloadText={downloadText} report={report} />}
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

function ReportView({
  report,
  exportStatus,
  onCopySummary,
  onDownloadJson,
  onDownloadText,
}: {
  report: Report;
  exportStatus: string;
  onCopySummary: () => void;
  onDownloadJson: () => void;
  onDownloadText: () => void;
}) {
  const annotations = useAnnotations();
  return (
    <section className="mt-8 grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Analysis dashboard</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{report.document_name}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
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

        <DateTimeline metadata={report.extracted_metadata} />

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
                <FindingCard
                  annotations={annotations}
                  documentName={report.document_name}
                  finding={finding}
                  key={`${finding.title}-${index}`}
                />
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
