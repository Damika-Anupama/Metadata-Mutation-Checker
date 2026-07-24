import { describe, it, expect } from "vitest";
import {
  parsePdfDate,
  runMetadataChecks,
  calculateRiskScore,
  getRiskLevel,
  getSummary,
  getRecommendedAction,
  type MetadataResult,
} from "./metadata-analysis";

// A "clean" document that should trip no findings — override per test.
function makeMeta(overrides: Partial<MetadataResult> = {}): MetadataResult {
  return {
    file_name: "doc.pdf",
    file_size_bytes: 1000,
    file_type: "application/pdf",
    pdf_version: "1.7",
    created_date: "2020-06-15T00:00:00Z",
    modified_date: "2020-06-15T00:00:00Z",
    raw_created_date: "D:20200615000000Z",
    raw_modified_date: "D:20200615000000Z",
    author: "Jane Doe",
    creator: "Microsoft Word",
    producer: "Microsoft Word",
    title: "Quarterly Report",
    page_count: 5,
    is_encrypted: false,
    incremental_updates: 0,
    ...overrides,
  };
}

const titles = (m: MetadataResult) => runMetadataChecks(m).map((f) => f.title);
const hasFinding = (m: MetadataResult, needle: string) =>
  titles(m).some((t) => t.toLowerCase().includes(needle.toLowerCase()));

describe("parsePdfDate", () => {
  it("honors a positive timezone offset (converts to UTC)", () => {
    expect(parsePdfDate("D:20200615120000+05'30'")).toBe("2020-06-15T06:30:00Z");
  });

  it("honors a negative timezone offset", () => {
    expect(parsePdfDate("D:20200615120000-08'00'")).toBe("2020-06-15T20:00:00Z");
  });

  it("treats an explicit Z as UTC", () => {
    expect(parsePdfDate("D:20200615120000Z")).toBe("2020-06-15T12:00:00Z");
  });

  it("treats a naive timestamp (no offset) as UTC and keeps the Z", () => {
    expect(parsePdfDate("D:20200615120000")).toBe("2020-06-15T12:00:00Z");
  });

  it("defaults missing month/day/time components", () => {
    expect(parsePdfDate("D:2020")).toBe("2020-01-01T00:00:00Z");
  });

  it("works without the D: prefix", () => {
    expect(parsePdfDate("20200615120000Z")).toBe("2020-06-15T12:00:00Z");
  });

  it("returns null for empty/nullish input", () => {
    expect(parsePdfDate("")).toBeNull();
    expect(parsePdfDate(null)).toBeNull();
    expect(parsePdfDate(undefined)).toBeNull();
  });

  it("returns the raw value when it cannot be parsed", () => {
    expect(parsePdfDate("not a date")).toBe("not a date");
  });

  it("trims surrounding whitespace", () => {
    expect(parsePdfDate("  D:20200615120000Z  ")).toBe("2020-06-15T12:00:00Z");
  });
});

describe("runMetadataChecks — a clean document", () => {
  it("produces no findings", () => {
    expect(runMetadataChecks(makeMeta())).toEqual([]);
  });
});

describe("runMetadataChecks — date rules", () => {
  it("flags a future creation date as High", () => {
    const m = makeMeta({ created_date: "2999-01-01T00:00:00Z", modified_date: null });
    const f = runMetadataChecks(m).find((x) => x.title.includes("Creation date is in the future"));
    expect(f?.severity).toBe("High");
  });

  it("flags a future modification date", () => {
    expect(hasFinding(makeMeta({ modified_date: "2999-01-01T00:00:00Z" }), "Modification date is in the future")).toBe(true);
  });

  it("flags a creation date before the PDF format existed (1993)", () => {
    expect(hasFinding(makeMeta({ created_date: "1990-01-01T00:00:00Z", modified_date: null }), "predates the PDF format")).toBe(true);
  });

  it("flags a creation date predating its declared PDF version", () => {
    const m = makeMeta({ pdf_version: "2.0", created_date: "2010-06-01T00:00:00Z", modified_date: null });
    expect(hasFinding(m, "predates PDF 2.0 format")).toBe(true);
  });

  it("flags modified earlier than created", () => {
    const m = makeMeta({ created_date: "2020-06-15T00:00:00Z", modified_date: "2020-06-10T00:00:00Z" });
    expect(hasFinding(m, "Modified date is earlier than created date")).toBe(true);
  });

  it("flags a multi-year gap between creation and modification as High", () => {
    const m = makeMeta({ created_date: "2010-01-01T00:00:00Z", modified_date: "2020-01-01T00:00:00Z" });
    const f = runMetadataChecks(m).find((x) => x.title.includes("years after creation"));
    expect(f?.severity).toBe("High");
  });

  it("flags a small (>30 day) gap as Low", () => {
    const m = makeMeta({ created_date: "2020-01-01T00:00:00Z", modified_date: "2020-03-01T00:00:00Z" });
    const f = runMetadataChecks(m).find((x) => x.title === "Document modified after creation");
    expect(f?.severity).toBe("Low");
  });

  it("flags a missing created date when modified exists", () => {
    expect(hasFinding(makeMeta({ created_date: null }), "created date is missing")).toBe(true);
  });

  it("flags both dates missing", () => {
    expect(hasFinding(makeMeta({ created_date: null, modified_date: null }), "Created and modified dates are missing")).toBe(true);
  });

  it("flags a timezone shift between creation and modification", () => {
    const m = makeMeta({
      raw_created_date: "D:20200101120000+00'00'",
      raw_modified_date: "D:20200101120000+05'00'",
    });
    expect(hasFinding(m, "Timezone shift")).toBe(true);
  });
});

describe("runMetadataChecks — software/structure rules", () => {
  it("flags an authoring tool released after the stated creation date", () => {
    const m = makeMeta({ producer: "Adobe PDF Library 23.0", created_date: "2010-01-01T00:00:00Z", modified_date: null });
    expect(hasFinding(m, "Authoring tool post-dates")).toBe(true);
  });

  it("flags a creator/producer mismatch", () => {
    expect(hasFinding(makeMeta({ creator: "Microsoft Word", producer: "Ghostscript" }), "Creator and producer mismatch")).toBe(true);
  });

  it("flags a reference to a suspicious tool", () => {
    expect(hasFinding(makeMeta({ producer: "Smallpdf" }), "smallpdf")).toBe(true);
  });

  it("flags missing author and title", () => {
    expect(hasFinding(makeMeta({ author: null }), "Missing author metadata")).toBe(true);
    expect(hasFinding(makeMeta({ title: null }), "Missing title metadata")).toBe(true);
  });

  it("flags an encrypted PDF", () => {
    expect(hasFinding(makeMeta({ is_encrypted: true }), "PDF is encrypted")).toBe(true);
  });

  it("flags a zero-page PDF as High", () => {
    const f = runMetadataChecks(makeMeta({ page_count: 0 })).find((x) => x.title === "PDF has zero pages");
    expect(f?.severity).toBe("High");
  });

  it("escalates incremental-update severity with count", () => {
    const one = runMetadataChecks(makeMeta({ incremental_updates: 1 })).find((x) => x.title.includes("incremental update"));
    const many = runMetadataChecks(makeMeta({ incremental_updates: 3 })).find((x) => x.title.includes("incremental update"));
    expect(one?.severity).toBe("Medium");
    expect(many?.severity).toBe("High");
  });
});

describe("calculateRiskScore", () => {
  it("is 0 for no findings", () => {
    expect(calculateRiskScore([])).toBe(0);
  });

  it("weights a single High finding by confidence", () => {
    expect(calculateRiskScore([{ title: "x", severity: "High", confidence: 1, category: "date", explanation: "" }])).toBe(45);
  });

  it("caps an all-Low result at 30", () => {
    const lows = [
      { title: "a", severity: "Low" as const, confidence: 1, category: "date", explanation: "" },
      { title: "b", severity: "Low" as const, confidence: 1, category: "software", explanation: "" },
      { title: "c", severity: "Low" as const, confidence: 1, category: "missing_metadata", explanation: "" },
    ];
    // 10+10+10 = 30, +10 category bonus = 40, but all-Low cap wins → 30
    expect(calculateRiskScore(lows)).toBe(30);
  });

  it("clamps to a maximum of 100", () => {
    const highs = ["date", "software", "structure", "missing_metadata"].map((category) => ({
      title: "h", severity: "High" as const, confidence: 1, category, explanation: "",
    }));
    expect(calculateRiskScore(highs)).toBe(100);
  });
});

describe("risk level + narrative helpers", () => {
  it("maps scores to levels at the boundaries", () => {
    expect(getRiskLevel(0)).toBe("Low");
    expect(getRiskLevel(30)).toBe("Low");
    expect(getRiskLevel(31)).toBe("Medium");
    expect(getRiskLevel(65)).toBe("Medium");
    expect(getRiskLevel(66)).toBe("High");
  });

  it("summary and recommended action track the level", () => {
    expect(getSummary(10)).toMatch(/limited or weak/i);
    expect(getSummary(90)).toMatch(/stronger metadata indicators/i);
    expect(getRecommendedAction(10)).toMatch(/no immediate action/i);
    expect(getRecommendedAction(90)).toMatch(/deeper manual review/i);
  });
});
