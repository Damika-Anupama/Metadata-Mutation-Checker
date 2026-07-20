import { PDFDocument, PDFName, PDFString, PDFHexString, PDFDict } from "pdf-lib";

// Structural facts recovered by actually loading the PDF with pdf-lib, rather
// than scanning the raw bytes with regexes. This is what closes the R3 false
// positive: a text scan for `/Type /Page` cannot see pages stored inside
// compressed object streams (PDF 1.5+), so it reports "zero pages" on perfectly
// valid documents. pdf-lib walks the real page tree, so the count is accurate.
export type PdfStructure = {
  // True when pdf-lib successfully loaded the document. When false, callers
  // should fall back to their text-scan heuristics.
  parsed: boolean;
  page_count: number | null;
  is_encrypted: boolean | null;
  // Info-dictionary values as pdf-lib reads them (handles values that live in
  // compressed metadata the text scan can miss). Null when absent or unreadable.
  title: string | null;
  author: string | null;
  creator: string | null;
  producer: string | null;
  subject: string | null;
  creation_date: string | null;
  modification_date: string | null;
};

const EMPTY: PdfStructure = {
  parsed: false,
  page_count: null,
  is_encrypted: null,
  title: null,
  author: null,
  creator: null,
  producer: null,
  subject: null,
  creation_date: null,
  modification_date: null,
};

function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

// pdf-lib throws on a malformed value inside an otherwise loadable PDF, so each
// getter is isolated: one bad field must not lose the rest of the metadata.
function safe<T>(getter: () => T | undefined): T | null {
  try {
    const value = getter();
    return value ?? null;
  } catch {
    return null;
  }
}

// Read a raw Info-dictionary string entry without going through pdf-lib's typed
// getters, which can throw when a value is present but not a plain string.
function readInfoString(doc: PDFDocument, key: string): string | null {
  return safe(() => {
    const infoRef = doc.context.trailerInfo.Info;
    if (!infoRef) return null;
    const info = doc.context.lookup(infoRef);
    if (!(info instanceof PDFDict)) return null;
    const value = info.get(PDFName.of(key));
    if (value instanceof PDFString || value instanceof PDFHexString) {
      return clean(value.decodeText());
    }
    return null;
  });
}

function toIso(date: Date | null): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/\.000Z$/, "Z");
}

export async function parsePdfStructure(bytes: Uint8Array): Promise<PdfStructure> {
  let doc: PDFDocument;
  try {
    // ignoreEncryption lets us still read the (unencrypted) page tree and Info
    // dictionary of an encrypted document instead of throwing outright.
    doc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
  } catch {
    return EMPTY;
  }

  const pageCount = safe(() => doc.getPageCount());

  return {
    parsed: true,
    page_count: pageCount,
    is_encrypted: doc.isEncrypted,
    title: readInfoString(doc, "Title") ?? clean(safe(() => doc.getTitle())),
    author: readInfoString(doc, "Author") ?? clean(safe(() => doc.getAuthor())),
    creator: readInfoString(doc, "Creator") ?? clean(safe(() => doc.getCreator())),
    producer: readInfoString(doc, "Producer") ?? clean(safe(() => doc.getProducer())),
    subject: readInfoString(doc, "Subject") ?? clean(safe(() => doc.getSubject())),
    creation_date: toIso(safe(() => doc.getCreationDate() ?? null)),
    modification_date: toIso(safe(() => doc.getModificationDate() ?? null)),
  };
}
