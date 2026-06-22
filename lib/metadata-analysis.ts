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
  incremental_updates: number;
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
  "smallpdf",
  "ilovepdf",
  "sejda",
  "pdf24",
  "pdffiller",
  "pdfcreator",
  "nitro pdf",
  "foxit",
  "pdfescape",
  "pdf converter",
  "pdf merge",
  "pdf compressor",
  "ghostscript",
  "pdfium",
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

function extractTimezoneOffset(rawDate: string | null): string | null {
  if (!rawDate) return null;
  const clean = rawDate.replace(/^D:/, "").slice(14);
  const match = clean.match(/^([+-]\d{2}'\d{2}'|Z)/);
  return match?.[1] ?? null;
}

function getProducerReleaseYear(text: string): number | null {
  // Adobe PDF Library 23.x → 2023, 21.x → 2021, etc.
  const adobeLib = text.match(/adobe\s+pdf\s+library\s+(\d{2})\./i);
  if (adobeLib) {
    const major = parseInt(adobeLib[1]);
    if (major >= 10 && major <= 40) return 2000 + major;
  }
  // Adobe Acrobat 2020, Adobe Acrobat DC 2023, etc.
  const acrobat = text.match(/adobe\s+acrobat[^\d]*(\d{4})/i);
  if (acrobat) {
    const year = parseInt(acrobat[1]);
    if (year >= 2000 && year <= 2035) return year;
  }
  // Microsoft Word 2019, Microsoft Office Word 2016, etc.
  const word = text.match(/microsoft[^\d]*(\d{4})/i);
  if (word) {
    const year = parseInt(word[1]);
    if (year >= 2000 && year <= 2035) return year;
  }
  // LibreOffice — 7.x → 2020, 24.x → 2024, 25.x → 2025, etc.
  const libreoffice = text.match(/libreoffice\s+(\d+)\./i);
  if (libreoffice) {
    const major = parseInt(libreoffice[1]);
    const libreYearMap: Record<number, number> = {
      3: 2010, 4: 2013, 5: 2015, 6: 2018, 7: 2020,
      24: 2024, 25: 2025, 26: 2026,
    };
    if (libreYearMap[major]) return libreYearMap[major];
  }
  // OpenOffice.org 3.x → 2008
  if (/openoffice\.org\s+3\./i.test(text)) return 2008;
  // Nitro PDF version strings
  const nitro = text.match(/nitro\s+pdf[^\d]*(\d{4})/i);
  if (nitro) {
    const year = parseInt(nitro[1]);
    if (year >= 2000 && year <= 2035) return year;
  }
  return null;
}

const PDF_INVENTED_YEAR = 1993;

const PDF_VERSION_RELEASE_YEARS: Record<string, number> = {
  "1.0": 1993,
  "1.1": 1994,
  "1.2": 1996,
  "1.3": 1999,
  "1.4": 2001,
  "1.5": 2003,
  "1.6": 2004,
  "1.7": 2006,
  "2.0": 2017,
};

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
  const now = new Date();

  // Rule: future dates
  if (createdDate && createdDate > now) {
    addFinding(
      findings,
      "Creation date is in the future",
      "High",
      0.95,
      `The document's stated creation date (${created}) is in the future. No legitimate document can be created at a future time — this strongly indicates the date metadata has been manually altered or set incorrectly.`,
      "date"
    );
  }

  if (modifiedDate && modifiedDate > now) {
    addFinding(
      findings,
      "Modification date is in the future",
      "High",
      0.95,
      `The document's stated modification date (${modified}) is in the future. This strongly suggests the date metadata was manually altered.`,
      "date"
    );
  }

  // Rule: creation date predates PDF itself
  if (createdDate && createdDate.getFullYear() < PDF_INVENTED_YEAR) {
    addFinding(
      findings,
      "Creation date predates the PDF format",
      "High",
      0.97,
      `The stated creation date (${created}) is before 1993, when Adobe invented the PDF format. No authentic PDF document could have been created before this date — this is a strong indicator of backdated or incorrect metadata.`,
      "date"
    );
  }

  // Rule: PDF version post-dates document creation
  if (metadata.pdf_version && createdDate) {
    const versionYear = PDF_VERSION_RELEASE_YEARS[metadata.pdf_version];
    if (versionYear && createdDate.getFullYear() < versionYear) {
      addFinding(
        findings,
        `Creation date predates PDF ${metadata.pdf_version} format`,
        "High",
        0.93,
        `This document uses the PDF ${metadata.pdf_version} format, which was introduced in ${versionYear}. However, the stated creation date (${created}) is before that year. This is a technical impossibility — the document format did not exist when the document claims to have been created.`,
        "date"
      );
    }
  }

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

    if (daysDifference > 1825) {
      addFinding(
        findings,
        `Document modified ${Math.floor(daysDifference / 365)} years after creation`,
        "High",
        0.85,
        `The document was last modified ${Math.floor(daysDifference / 365)} years after its stated creation date. A gap of this magnitude is a strong signal that the document was re-exported, backdated, or otherwise altered long after the original was produced.`,
        "date"
      );
    } else if (daysDifference > 365) {
      addFinding(
        findings,
        `Document modified over a year after creation`,
        "Medium",
        0.78,
        `The document was modified ${Math.floor(daysDifference / 30)} months after creation. A gap of more than a year between creation and modification is uncommon and may indicate post-creation editing or conversion.`,
        "date"
      );
    } else if (daysDifference > 30) {
      addFinding(
        findings,
        "Document modified after creation",
        "Low",
        0.55,
        `The document was modified ${daysDifference} days after creation. This may indicate minor edits, format conversion, or normal document handling.`,
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

  // Rule: incremental updates
  if (metadata.incremental_updates > 0) {
    const count = metadata.incremental_updates;
    addFinding(
      findings,
      `PDF contains ${count} incremental update${count > 1 ? "s" : ""}`,
      count >= 3 ? "High" : "Medium",
      count >= 3 ? 0.85 : 0.72,
      `The PDF structure contains ${count} incremental update section${count > 1 ? "s" : ""} appended after the original content. Incremental updates are how PDF editors append changes without rewriting the whole file — a common technique when modifying a signed or certified document.`,
      "structure"
    );
  }

  // Rule: timezone shift between creation and modification
  const createdTz = extractTimezoneOffset(metadata.raw_created_date);
  const modifiedTz = extractTimezoneOffset(metadata.raw_modified_date);
  if (createdTz && modifiedTz && createdTz !== modifiedTz) {
    addFinding(
      findings,
      "Timezone shift between creation and modification dates",
      "Low",
      0.62,
      `The document was created with timezone offset ${createdTz} but last modified with ${modifiedTz}. Different timezones between creation and modification can indicate the document was edited on a system in a different region or country.`,
      "date"
    );
  }

  // Rule: producer/creator tool released after stated creation date
  const toolYear = Math.max(
    getProducerReleaseYear(producer) ?? 0,
    getProducerReleaseYear(creator) ?? 0
  ) || null;
  if (toolYear && createdDate && toolYear > createdDate.getFullYear()) {
    const toolName = getProducerReleaseYear(producer) ? `producer (${producer})` : `creator (${creator})`;
    addFinding(
      findings,
      "Authoring tool post-dates stated document creation",
      "High",
      0.9,
      `The document claims to have been created in ${createdDate.getFullYear()}, but the ${toolName} was not released until ${toolYear}. This is an impossible timeline and strongly indicates the document was re-exported or backdated.`,
      "software"
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
