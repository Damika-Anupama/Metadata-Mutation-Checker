// Pure presentation formatters for the report UI, extracted from page.tsx (F5):
// risk color classes, byte/label formatting, metadata grouping/status, and the
// loading-step label. No React, no side effects.

export function getRiskClass(level: string) {
  if (level === "High") return "border-red-200 bg-red-50 text-red-700";
  if (level === "Medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function getRiskAccent(level: string) {
  if (level === "High") return "text-red-600";
  if (level === "Medium") return "text-amber-600";
  return "text-emerald-600";
}

export function getRiskRingColor(level: string) {
  if (level === "High") return "#dc2626";
  if (level === "Medium") return "#d97706";
  return "#059669";
}

export function formatBytes(value: unknown) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "N/A";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatMetadataLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getMetadataGroup(key: string) {
  if (["file_name", "file_size_bytes", "file_type", "pdf_version", "page_count", "is_encrypted"].includes(key)) return "File & structure";
  if (["created_date", "modified_date", "raw_created_date", "raw_modified_date"].includes(key)) return "Dates";
  if (["author", "title", "subject"].includes(key)) return "Document details";
  if (["creator", "producer"].includes(key)) return "Authoring tools";
  return "Other metadata";
}

export function getMetadataStatus(value: unknown) {
  if (value === undefined || value === null || value === "") return { label: "Missing", className: "bg-amber-50 text-amber-700" };
  if (typeof value === "boolean") return { label: value ? "Yes" : "No", className: value ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700" };
  return { label: "Present", className: "bg-emerald-50 text-emerald-700" };
}

export function getLoadingStep(seconds: number) {
  if (seconds >= 8) return "Preparing report";
  if (seconds >= 5) return "Checking mutation signals";
  if (seconds >= 2) return "Extracting metadata";
  return "Uploading file";
}
