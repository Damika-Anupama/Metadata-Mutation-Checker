import { describe, it, expect } from "vitest";
import { analyzeSignatures } from "./pdf-signatures";
import { runMetadataChecks, type MetadataResult } from "./metadata-analysis";

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

// A signed body whose /ByteRange covers exactly its own length; the second
// range ends at `coverageEnd`. Callers append bytes past that to simulate a
// post-signing revision.
function signedPdf(trailer = ""): string {
  const head =
    "%PDF-1.7\n" +
    "5 0 obj<</Type/Sig/SubFilter/adbe.pkcs7.detached/ByteRange [0 200 1200 300]>>endobj\n";
  // Pad so the file length reaches coverageEnd (1200 + 300 = 1500).
  const padded = head.padEnd(1500, " ");
  return padded + trailer;
}

describe("analyzeSignatures", () => {
  it("reports no signature for an ordinary document", () => {
    const info = analyzeSignatures("%PDF-1.4\n1 0 obj<</Type/Page>>endobj\n%%EOF");
    expect(info.has_signature).toBe(false);
    expect(info.modified_after_signing).toBe(false);
  });

  it("detects a signature with no post-signing content", () => {
    const info = analyzeSignatures(signedPdf());
    expect(info.has_signature).toBe(true);
    expect(info.signature_count).toBeGreaterThanOrEqual(1);
    expect(info.modified_after_signing).toBe(false);
  });

  it("detects content appended after the signed byte range", () => {
    const revision = "\n6 0 obj<</Type/Annot>>endobj\nxref\n0 1\ntrailer<</Root 1 0 R>>\n%%EOF\n";
    const info = analyzeSignatures(signedPdf(revision));
    expect(info.has_signature).toBe(true);
    expect(info.modified_after_signing).toBe(true);
  });

  it("does not flag a bare trailing newline as a revision", () => {
    const info = analyzeSignatures(signedPdf("\n"));
    expect(info.modified_after_signing).toBe(false);
  });
});

describe("runMetadataChecks — signature forensics (F6)", () => {
  const has = (m: MetadataResult, needle: string) =>
    runMetadataChecks(m).some((f) => f.title.toLowerCase().includes(needle.toLowerCase()));

  it("flags modification after signing as High", () => {
    const meta = makeMeta({ has_signature: true, modified_after_signing: true });
    expect(has(meta, "modified after it was digitally signed")).toBe(true);
    const finding = runMetadataChecks(meta).find((f) =>
      f.title.toLowerCase().includes("modified after it was digitally signed")
    );
    expect(finding?.severity).toBe("High");
  });

  it("surfaces a plain signature as a low-severity context note", () => {
    const meta = makeMeta({ has_signature: true, modified_after_signing: false });
    expect(has(meta, "digitally signed")).toBe(true);
    expect(has(meta, "modified after")).toBe(false);
  });

  it("does not mention signatures for an unsigned document", () => {
    expect(has(makeMeta({ has_signature: false }), "digitally signed")).toBe(false);
  });
});
