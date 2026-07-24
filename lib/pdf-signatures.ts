// Digital-signature / xref forensics (F6).
//
// A PDF signature covers a set of byte ranges declared in its /ByteRange entry:
// [start1 len1 start2 len2]. The signed bytes are [start1, start1+len1) and
// [start2, start2+len2); the gap between them holds the signature itself. In a
// correctly signed file the second range ends at (essentially) end-of-file, so
// the signature covers the whole document. If bytes were appended past that end
// — a later incremental update / revision — the signature no longer covers the
// whole file, which is exactly how a signed PDF is tampered with after signing.

export type SignatureInfo = {
  has_signature: boolean;
  signature_count: number;
  // A signature was found and content exists beyond the range it covers, i.e.
  // the document was revised after signing (invalidating that coverage).
  modified_after_signing: boolean;
};

const EMPTY: SignatureInfo = {
  has_signature: false,
  signature_count: 0,
  modified_after_signing: false,
};

// Markers that only appear in a genuine appended revision (objects + a fresh
// cross-reference section), used to distinguish real post-sign edits from
// harmless trailing whitespace after the signature's own %%EOF.
const REVISION_MARKER = /\bobj\b|\bxref\b|\btrailer\b|\/Type/;

export function analyzeSignatures(pdfText: string): SignatureInfo {
  const hasSigObject = /\/Type\s*\/Sig\b/.test(pdfText);
  const hasSubFilter = /\/SubFilter\s*\/(adbe|ETSI)/i.test(pdfText);
  const byteRanges = [
    ...pdfText.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g),
  ];

  const hasSignature = hasSigObject || hasSubFilter || byteRanges.length > 0;
  if (!hasSignature) return EMPTY;

  // The furthest byte any signature claims to cover.
  let maxCoverageEnd = 0;
  for (const match of byteRanges) {
    const coverageEnd = Number.parseInt(match[3], 10) + Number.parseInt(match[4], 10);
    if (coverageEnd > maxCoverageEnd) maxCoverageEnd = coverageEnd;
  }

  let modifiedAfterSigning = false;
  if (maxCoverageEnd > 0 && maxCoverageEnd < pdfText.length) {
    const trailing = pdfText.slice(maxCoverageEnd);
    // A real appended revision re-declares objects and an xref/trailer and ends
    // in its own %%EOF; require both so a stray trailing newline isn't flagged.
    modifiedAfterSigning = trailing.includes("%%EOF") && REVISION_MARKER.test(trailing);
  }

  return {
    has_signature: true,
    // Count signature objects; fall back to the number of ByteRange entries.
    signature_count: Math.max(
      (pdfText.match(/\/Type\s*\/Sig\b/g) ?? []).length,
      byteRanges.length
    ),
    modified_after_signing: modifiedAfterSigning,
  };
}
