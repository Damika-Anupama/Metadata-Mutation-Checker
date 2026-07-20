"use client";

// The report-rendering cluster, extracted from page.tsx (F5): the analysis
// dashboard (ReportView) and its parts — risk ring, metric tiles, document
// timeline, per-finding cards, and the searchable metadata table. DashboardMetric
// is also used by the Compare view, so it is exported.
import { useState } from "react";
import type { AnnotationStatus, Finding, Report } from "@/lib/types";
import { DownloadIcon } from "./icons";
import { useAnnotations } from "../hooks";
import { annotationKey, formatValue } from "../report-data";
import {
  formatBytes,
  formatMetadataLabel,
  getMetadataGroup,
  getMetadataStatus,
  getRiskAccent,
  getRiskClass,
  getRiskRingColor,
} from "../ui-format";

function DateTimeline({ metadata }: { metadata: Record<string, unknown> }) {
  const [todayMs] = useState(() => Date.now());
  const createdStr = metadata.created_date as string | null;
  const modifiedStr = metadata.modified_date as string | null;
  if (!createdStr && !modifiedStr) return null;

  const toMs = (value: string | null) => {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
  };
  const createdMs = toMs(createdStr);
  const modifiedMs = toMs(modifiedStr);

  // Both dates present but unparseable (parsePdfDate can return a raw string):
  // guarding only against null would let NaN flow into every SVG coordinate.
  if (createdMs === null && modifiedMs === null) return null;

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

  // A non-color textual label for the gap severity so the meaning isn't carried
  // by the segment color alone (WCAG 1.4.1 Use of Color).
  const gapSeverity = gapDays === null ? null
    : gapDays === 0 ? "Same day"
    : gapDays > 365 ? "Large gap"
    : gapDays > 30 ? "Moderate gap"
    : "Small gap";

  // Screen-reader description: the SVG itself is decorative geometry, so expose
  // the timeline's meaning through a single role="img" label instead of hiding
  // it entirely (the previous aria-hidden dropped it from assistive tech).
  const timelineSummary = [
    createdMs !== null ? `created ${fmt(createdMs)}` : null,
    modifiedMs !== null ? `modified ${fmt(modifiedMs)}` : null,
    gapLabel ? `${gapLabel}${gapSeverity ? ` (${gapSeverity.toLowerCase()})` : ""}` : null,
    isFlipped ? "modified date is earlier than creation date" : null,
  ].filter(Boolean).join(", ");

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Document timeline</p>
      {isFlipped && (
        <p className="mb-2 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
          Modified date is earlier than creation date — strong anomaly
        </p>
      )}
      <svg aria-label={`Document timeline: ${timelineSummary}.`} className="w-full" role="img" viewBox="0 0 500 85">
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
      {gapLabel && gapSeverity && (
        <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
          <span
            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
              gapDays !== null && gapDays > 365 ? "bg-red-600"
                : gapDays !== null && gapDays > 30 ? "bg-amber-600"
                : "bg-emerald-600"
            }`}
          />
          <span>
            Created→modified: <span className="font-semibold text-slate-700">{gapLabel}</span> ({gapSeverity})
          </span>
        </p>
      )}
    </div>
  );
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

export function DashboardMetric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "indigo" | "amber" | "emerald" }) {
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

export function ReportView({
  report,
  exportStatus,
  onCopySummary,
  onDownloadJson,
  onDownloadText,
  onShare,
  onPrint,
}: {
  report: Report;
  exportStatus: string;
  onCopySummary: () => void;
  onDownloadJson: () => void;
  onDownloadText: () => void;
  onShare?: () => void;
  onPrint?: () => void;
}) {
  const annotations = useAnnotations();
  return (
    <section className="report-print-root mt-8 grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Analysis dashboard</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{report.document_name}</h2>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            {onShare && (
              <button className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50" onClick={onShare} type="button">
                Share
              </button>
            )}
            {onPrint && (
              <button className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50" onClick={onPrint} type="button">
                Print / PDF
              </button>
            )}
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
