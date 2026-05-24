export type Finding = {
  title: string;
  severity: "Low" | "Medium" | "High";
  confidence: number;
  category: string;
  explanation: string;
};

export type MetadataResult = {
  file_name: string;
  file_size_bytes: number;
  file_type: string;
  pdf_version: string | null;
  created_date: string | null;
  modified_date: string | null;
  raw_created_date: string | null;
  raw_modified_date: string | null;
  author: string | null;
  creator: string | null;
  producer: string | null;
  title: string | null;
  subject: string | null;
  page_count: number;
  is_encrypted: boolean;
};

const suspiciousTools = [
  "preview",
  "acrobat",
  "photoshop",
  "illustrator",
  "canva",
  "online pdf",
  "scanner",
  "pdf editor",
];

function cleanValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

export function parsePdfDate(rawDate: unknown): string | null {
  const value = cleanValue(rawDate);
  if (!value) return null;

  try {
    const clean = value.replace(/^D:/, "");
    const year = clean.slice(0, 4);
    const month = clean.slice(4, 6) || "01";
    const day = clean.slice(6, 8) || "01";
    const hour = clean.slice(8, 10) || "00";
    const minute = clean.slice(10, 12) || "00";
    const second = clean.slice(12, 14) || "00";

    if (year.length === 4) {
      const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString().replace(".000Z", "");
      }
    }
  } catch {
    return value;
  }

  return value;
}

function safeParseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addFinding(
  findings: Finding[],
  title: string,
  severity: Finding["severity"],
  confidence: number,
  explanation: string,
  category: string
) {
  findings.push({ title, severity, confidence, explanation, category });
}

export function runMetadataChecks(metadata: MetadataResult): Finding[] {
  const findings: Finding[] = [];
  const created = metadata.created_date;
  const modified = metadata.modified_date;
  const creator = metadata.creator ?? "";
  const producer = metadata.producer ?? "";
  const author = metadata.author;
  const title = metadata.title;

  const createdDate = safeParseDate(created);
  const modifiedDate = safeParseDate(modified);

  if (modified && !created) {
    addFinding(
      findings,
      "Modified date exists but created date is missing",
      "Medium",
      0.7,
      "The document has a modified date but no creation date. This may suggest metadata was removed, changed, or not saved by the creating software.",
      "date"
    );
  }

  if (!created && !modified) {
    addFinding(
      findings,
      "Created and modified dates are missing",
      "Medium",
      0.65,
      "Both creation and modification dates are missing. This can happen naturally, but it may also indicate metadata removal.",
      "date"
    );
  }

  if (created && !createdDate) {
    addFinding(
      findings,
      "Created date format is unusual",
      "Low",
      0.45,
      "The created date exists but could not be parsed into a standard date format.",
      "date"
    );
  }

  if (modified && !modifiedDate) {
    addFinding(
      findings,
      "Modified date format is unusual",
      "Low",
      0.45,
      "The modified date exists but could not be parsed into a standard date format.",
      "date"
    );
  }

  if (createdDate && modifiedDate) {
    if (modifiedDate < createdDate) {
      addFinding(
        findings,
        "Modified date is earlier than created date",
        "High",
        0.85,
        "The modified date appears earlier than the created date. This is unusual and may indicate incorrect or altered metadata.",
        "date"
      );
    }

    const daysDifference = Math.floor(
      (modifiedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDifference > 30) {
      addFinding(
        findings,
        "Document modified significantly after creation",
        "Medium",
        0.75,
        `The document was modified ${daysDifference} days after creation. This may indicate editing, conversion, or normal document handling.`,
        "date"
      );
    }
  }

  if (creator && producer && creator.toLowerCase() !== producer.toLowerCase()) {
    addFinding(
      findings,
      "Creator and producer mismatch",
      "Low",
      0.6,
      "The document appears to have been created using one tool and exported or processed using another. This is common and should not be treated as proof of tampering.",
      "software"
    );
  }

  const combinedTools = `${creator} ${producer}`.toLowerCase();
  const matchedTool = suspiciousTools.find((tool) => combinedTools.includes(tool));
  if (matchedTool) {
    addFinding(
      findings,
      `Document metadata references ${matchedTool}`,
      "Low",
      0.5,
      `The metadata references ${matchedTool}. This may indicate editing, exporting, scanning, or normal document handling.`,
      "software"
    );
  }

  if (!author) {
    addFinding(
      findings,
      "Missing author metadata",
      "Low",
      0.4,
      "The author field is empty. This may happen naturally depending on the software used to create the document.",
      "missing_metadata"
    );
  }

  if (!title) {
    addFinding(
      findings,
      "Missing title metadata",
      "Low",
      0.35,
      "The title field is empty. This is common and does not strongly indicate tampering by itself.",
      "missing_metadata"
    );
  }

  if (metadata.is_encrypted) {
    addFinding(
      findings,
      "PDF is encrypted",
      "Medium",
      0.7,
      "The PDF is encrypted. Some metadata or content may not be fully accessible for analysis.",
      "structure"
    );
  }

  if (metadata.page_count === 0) {
    addFinding(
      findings,
      "PDF has zero pages",
      "High",
      0.9,
      "The PDF appears to contain no pages, which is abnormal for a document file.",
      "structure"
    );
  }

  return findings;
}

function severityWeight(severity: string) {
  const weights: Record<string, number> = { Low: 10, Medium: 25, High: 45 };
  return weights[severity] ?? 0;
}

export function calculateRiskScore(findings: Finding[]) {
  if (!findings.length) return 0;

  let score = findings.reduce(
    (total, finding) => total + severityWeight(finding.severity) * finding.confidence,
    0
  );

  const categories = new Set(findings.map((finding) => finding.category));
  if (categories.size >= 3) score += 10;

  const lowFindings = findings.filter((finding) => finding.severity === "Low");
  if (lowFindings.length === findings.length) score = Math.min(score, 30);

  return Math.min(Math.round(score), 100);
}

export function getRiskLevel(score: number) {
  if (score <= 30) return "Low";
  if (score <= 65) return "Medium";
  return "High";
}

export function getSummary(score: number) {
  const level = getRiskLevel(score);
  if (level === "Low") {
    return "The document contains limited or weak metadata indicators. No strong metadata mutation signals were detected.";
  }
  if (level === "Medium") {
    return "The document contains metadata patterns that may suggest post-creation editing, conversion, or metadata changes. These findings should be reviewed carefully.";
  }
  return "The document contains multiple or stronger metadata indicators that may suggest unusual metadata changes. These findings should be reviewed with additional evidence.";
}

export function getRecommendedAction(score: number) {
  const level = getRiskLevel(score);
  if (level === "Low") {
    return "No immediate action is required. Review manually only if the document is part of a sensitive process.";
  }
  if (level === "Medium") {
    return "Review the document manually and compare it with source records if the file is important.";
  }
  return "Perform a deeper manual review, compare with original files, and verify the document through additional evidence.";
}
