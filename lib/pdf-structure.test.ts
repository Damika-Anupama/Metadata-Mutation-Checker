import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { parsePdfStructure } from "./pdf-structure";

// The naive text scan the route uses as a baseline (mirror of route.ts
// countPages) — it cannot see page objects hidden in compressed object streams.
function naiveTextScanPageCount(bytes: Uint8Array): number {
  const text = new TextDecoder("latin1").decode(bytes);
  return text.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

async function buildPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.addPage();
  doc.addPage();
  doc.setTitle("Structural Title");
  doc.setAuthor("Ada Lovelace");
  doc.setCreator("Test Creator App");
  doc.setProducer("Test Producer Lib");
  doc.setSubject("Structural Subject");
  doc.setCreationDate(new Date("2020-01-02T03:04:05Z"));
  doc.setModificationDate(new Date("2021-06-15T12:00:00Z"));
  // Default save uses object streams (PDF 1.5+), which is exactly the R3 case:
  // pages live in a compressed stream the text scan can't read.
  return doc.save();
}

describe("parsePdfStructure", () => {
  it("counts pages structurally when a text scan would miss them (closes R3)", async () => {
    const bytes = await buildPdf();

    // Precondition: the text scan really does undercount compressed pages.
    expect(naiveTextScanPageCount(bytes)).toBeLessThan(3);

    const structure = await parsePdfStructure(bytes);
    expect(structure.parsed).toBe(true);
    expect(structure.page_count).toBe(3);
  });

  it("recovers Info-dictionary metadata and dates", async () => {
    const structure = await parsePdfStructure(await buildPdf());

    expect(structure.title).toBe("Structural Title");
    expect(structure.author).toBe("Ada Lovelace");
    expect(structure.creator).toBe("Test Creator App");
    expect(structure.producer).toBe("Test Producer Lib");
    expect(structure.subject).toBe("Structural Subject");
    expect(structure.creation_date).toBe("2020-01-02T03:04:05Z");
    expect(structure.modification_date).toBe("2021-06-15T12:00:00Z");
    expect(structure.is_encrypted).toBe(false);
  });

  it("returns an unparsed result for non-PDF / corrupt bytes instead of throwing", async () => {
    const garbage = new TextEncoder().encode("this is not a pdf at all");
    const structure = await parsePdfStructure(garbage);

    expect(structure.parsed).toBe(false);
    expect(structure.page_count).toBeNull();
  });
});
