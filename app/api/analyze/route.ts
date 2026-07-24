import { NextResponse } from "next/server";
import {
  calculateRiskScore,
  getRecommendedAction,
  getRiskLevel,
  getSummary,
  parsePdfDate,
  runMetadataChecks,
  type MetadataResult,
} from "../../../lib/metadata-analysis";
import { parsePdfStructure, type PdfStructure } from "../../../lib/pdf-structure";
import { extractXmp } from "../../../lib/xmp";
import { analyzeSignatures } from "../../../lib/pdf-signatures";

export const runtime = "nodejs";

const DEFAULT_MAX_UPLOAD_SIZE_MB = 8;
const parsedMaxUploadMb = Number(process.env.MAX_UPLOAD_SIZE_MB);
// Fall back to the default when the env var is unset, non-numeric, or <= 0,
// so a misconfigured value can never silently disable the size cap
// (NaN comparisons are always false, which would let any file through).
const MAX_UPLOAD_SIZE_MB =
  Number.isFinite(parsedMaxUploadMb) && parsedMaxUploadMb > 0
    ? parsedMaxUploadMb
    : DEFAULT_MAX_UPLOAD_SIZE_MB;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

const metadataKeys = [
  "CreationDate",
  "ModDate",
  "Author",
  "Creator",
  "Producer",
  "Title",
  "Subject",
];

function cleanValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function decodePdfBytes(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

function getPdfHeader(text: string): string | null {
  const match = text.slice(0, 64).match(/%PDF-[0-9.]+/);
  return match?.[0] ?? null;
}

function unescapePdfString(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function extractLiteralString(pdfText: string, key: string): string | null {
  // Use a linear-time alternation `(?:[^\\)]|\\.)*` instead of the nested
  // quantifier `[^)]*(?:\\.[^)]*)*`, which is catastrophically backtracking
  // (ReDoS) and can hang the request on a crafted PDF with an unbalanced
  // parenthesis. This form also correctly walks past escaped `\)` inside the
  // string to the real closing paren.
  const regex = new RegExp(`/${key}\\s*\\(((?:[^\\\\)]|\\\\.)*)\\)`, "s");
  const match = pdfText.match(regex);
  return match ? unescapePdfString(match[1]) : null;
}

function extractHexString(pdfText: string, key: string): string | null {
  const regex = new RegExp(`/${key}\\s*<([0-9A-Fa-f\\s]+)>`);
  const match = pdfText.match(regex);
  if (!match) return null;

  const hex = match[1].replace(/\s/g, "");
  if (!hex || hex.length % 2 !== 0) return null;

  try {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? []);
    return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return null;
  }
}

function extractMetadataValue(pdfText: string, key: string): string | null {
  return cleanValue(extractLiteralString(pdfText, key) ?? extractHexString(pdfText, key));
}

function countPages(pdfText: string): number {
  const matches = pdfText.match(/\/Type\s*\/Page\b/g);
  return matches?.length ?? 0;
}

function countIncrementalUpdates(pdfText: string): number {
  const matches = pdfText.match(/%%EOF/g);
  return matches ? Math.max(0, matches.length - 1) : 0;
}

function extractPdfMetadata(bytes: Uint8Array, file: File): MetadataResult {
  const pdfText = decodePdfBytes(bytes);
  const rawMetadata = Object.fromEntries(
    metadataKeys.map((key) => [key, extractMetadataValue(pdfText, key)])
  );
  const xmp = extractXmp(pdfText);
  const signatures = analyzeSignatures(pdfText);

  return {
    file_name: file.name,
    file_size_bytes: file.size,
    file_type: file.type || "application/pdf",
    pdf_version: getPdfHeader(pdfText),
    created_date: parsePdfDate(rawMetadata.CreationDate),
    modified_date: parsePdfDate(rawMetadata.ModDate),
    raw_created_date: rawMetadata.CreationDate,
    raw_modified_date: rawMetadata.ModDate,
    author: rawMetadata.Author,
    creator: rawMetadata.Creator,
    producer: rawMetadata.Producer,
    title: rawMetadata.Title,
    subject: rawMetadata.Subject,
    page_count: countPages(pdfText),
    is_encrypted: /\/Encrypt\b/.test(pdfText),
    incremental_updates: countIncrementalUpdates(pdfText),
    xmp_present: xmp.present,
    xmp_producer: xmp.producer,
    xmp_creator_tool: xmp.creator_tool,
    xmp_create_date: xmp.create_date,
    xmp_modify_date: xmp.modify_date,
    xmp_title: xmp.title,
    xmp_author: xmp.creator,
    xmp_pdfa_part: xmp.pdfa_part,
    xmp_pdfa_conformance: xmp.pdfa_conformance,
    has_signature: signatures.has_signature,
    signature_count: signatures.signature_count,
    modified_after_signing: signatures.modified_after_signing,
  };
}

// Merge pdf-lib's structural read over the text-scan baseline. pdf-lib wins for
// facts it derives from the parsed object graph (page count, encryption); for
// text fields and dates it only fills gaps the text scan left null, so the
// text scan's raw date strings (and their timezone offsets) are preserved.
function mergeStructure(base: MetadataResult, structure: PdfStructure): MetadataResult {
  if (!structure.parsed) {
    return { ...base, structure_parsed: false };
  }
  return {
    ...base,
    structure_parsed: true,
    // Authoritative: the real page tree closes the R3 zero-page false positive
    // for PDFs whose pages live in compressed object streams.
    page_count: structure.page_count ?? base.page_count,
    // Either signal is enough to treat the document as encrypted.
    is_encrypted: base.is_encrypted || structure.is_encrypted === true,
    title: base.title ?? structure.title,
    author: base.author ?? structure.author,
    creator: base.creator ?? structure.creator,
    producer: base.producer ?? structure.producer,
    subject: base.subject ?? structure.subject,
    created_date: base.created_date ?? structure.creation_date,
    modified_date: base.modified_date ?? structure.modification_date,
  };
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Metadata Mutation Checker API is running",
    endpoint: "/api/analyze",
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const fileValue = formData.get("file");

    if (!(fileValue instanceof File)) {
      return NextResponse.json({ detail: "Please upload a PDF file." }, { status: 400 });
    }

    if (!fileValue.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { detail: "Only PDF files are supported in this implementation." },
        { status: 400 }
      );
    }

    if (fileValue.size === 0) {
      return NextResponse.json({ detail: "Uploaded file is empty." }, { status: 400 });
    }

    if (fileValue.size > MAX_UPLOAD_SIZE_BYTES) {
      return NextResponse.json(
        { detail: `File is too large. Maximum allowed size is ${MAX_UPLOAD_SIZE_MB} MB.` },
        { status: 413 }
      );
    }

    const bytes = new Uint8Array(await fileValue.arrayBuffer());

    // Validate actual PDF content, not just the .pdf extension. Per the PDF
    // spec a reader scans the first bytes for the header, so allow a little
    // leading slack rather than requiring it at offset 0. This also avoids
    // emitting misleading "zero pages / high risk" findings for a non-PDF
    // file that was simply renamed to .pdf.
    const headerSlice = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
    if (!headerSlice.includes("%PDF-")) {
      return NextResponse.json(
        { detail: "File does not look like a valid PDF (missing %PDF header)." },
        { status: 400 }
      );
    }

    // Text-scan baseline (fast, tolerant, preserves raw date strings + PDF
    // header version), then override the fields pdf-lib can read authoritatively.
    const textScanMetadata = extractPdfMetadata(bytes, fileValue);
    const structure = await parsePdfStructure(bytes);
    const extractedMetadata = mergeStructure(textScanMetadata, structure);
    const findings = runMetadataChecks(extractedMetadata);
    const riskScore = calculateRiskScore(findings);
    const riskLevel = getRiskLevel(riskScore);

    return NextResponse.json({
      document_name: fileValue.name,
      file_type: extractedMetadata.file_type,
      metadata_risk_score: riskScore,
      metadata_risk_level: riskLevel,
      summary: getSummary(riskScore),
      extracted_metadata: extractedMetadata,
      findings,
      recommended_action: getRecommendedAction(riskScore),
      disclaimer:
        "Metadata indicators are not proof of tampering. They should be reviewed with additional evidence.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze document.";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
