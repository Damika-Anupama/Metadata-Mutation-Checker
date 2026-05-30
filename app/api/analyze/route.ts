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

export const runtime = "nodejs";

const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB ?? "8");
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
  const regex = new RegExp(`/${key}\\s*\\(([^)]*(?:\\\\.[^)]*)*)\\)`, "s");
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
    const extractedMetadata = extractPdfMetadata(bytes, fileValue);
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
