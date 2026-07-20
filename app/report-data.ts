// Module-scope constants, demo fixture, and pure helpers shared across the
// Analyze/Compare/Batch/History UI. Extracted from page.tsx (F5) so the client
// component holds view logic and these stay independently testable and reusable.
import type { Mode, Report } from "@/lib/types";

export const ANALYZE_ENDPOINT = "/api/analyze";
export const REQUEST_TIMEOUT_MS = 30000;
export const MAX_UPLOAD_SIZE_MB = 8;
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
export const LOG_PREFIX = "[PDF Auto Analyze]";
export const TAB_ORDER: Mode[] = ["analyze", "compare", "batch", "history"];

// Shareable reports are encoded into the URL hash (client-only, never sent to
// the server) as base64url JSON, so a link reconstructs the report with no
// backend and no re-upload.
export const SHARE_HASH_PREFIX = "#report=";

export const HISTORY_KEY = "mmc-history";
export const ANNOTATIONS_KEY = "mmc-annotations";
export const HISTORY_MAX = 50;

export const DEMO_REPORT: Report = {
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

export const compareKeys = [
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

export function getFileDebugInfo(selectedFile: File) {
  return {
    name: selectedFile.name,
    type: selectedFile.type || "unknown",
    sizeBytes: selectedFile.size,
    lastModified: new Date(selectedFile.lastModified).toISOString(),
  };
}

export function formatValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "N/A";
  return String(value);
}

export function validatePdfFile(selectedFile: File | null) {
  if (!selectedFile) return "Please choose a PDF file first.";
  const hasPdfMime = selectedFile.type === "application/pdf";
  const hasPdfName = selectedFile.name.toLowerCase().endsWith(".pdf");
  if (!hasPdfMime && !hasPdfName) return "Only PDF files are supported for this demo.";
  if (selectedFile.size > MAX_UPLOAD_SIZE_BYTES) return `PDF is too large. Upload a file up to ${MAX_UPLOAD_SIZE_MB}MB.`;
  if (selectedFile.size === 0) return "The selected PDF is empty. Choose a valid document.";
  return "";
}

export function encodeReportToHash(report: Report): string {
  const bytes = new TextEncoder().encode(JSON.stringify(report));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeReportFromHash(encoded: string): Report | null {
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (data && typeof data === "object" && Array.isArray((data as Report).findings)) {
      return data as Report;
    }
    return null;
  } catch {
    return null;
  }
}

export function getDateGapLabel(report: Report): string {
  const created = report.extracted_metadata.created_date as string | null;
  const modified = report.extracted_metadata.modified_date as string | null;
  if (!created || !modified) return "—";
  const createdMs = new Date(created).getTime();
  const modifiedMs = new Date(modified).getTime();
  if (Number.isNaN(createdMs) || Number.isNaN(modifiedMs)) return "—";
  const diff = modifiedMs - createdMs;
  if (diff < 0) return "Modified before created";
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Same day";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}yr`;
}

export function getBatchRiskBadge(level: string) {
  if (level === "High") return { label: "High", className: "bg-red-100 text-red-700" };
  if (level === "Medium") return { label: "Medium", className: "bg-amber-100 text-amber-700" };
  return { label: "Low", className: "bg-emerald-100 text-emerald-700" };
}

export function annotationKey(documentName: string, findingTitle: string): string {
  return `${documentName}::${findingTitle}`;
}

export function formatRelativeTime(ts: number): string {
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
