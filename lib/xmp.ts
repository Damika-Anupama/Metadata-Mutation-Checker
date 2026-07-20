// Extract the XMP metadata packet embedded in a PDF and pull the fields that
// have a counterpart in the classic /Info dictionary. XMP packets are, by
// convention, stored uncompressed so they can be located by scanning — so we
// can read them straight from the decoded PDF text without a full parser.
//
// The forensic value (F2): a document carries metadata in two places — the old
// /Info dictionary and the newer XMP stream. Faithful producers keep them in
// sync. When an editor rewrites one but not the other, the two disagree, which
// is a signal the file was processed after its original authoring.

export type XmpMetadata = {
  present: boolean;
  producer: string | null;
  creator_tool: string | null;
  create_date: string | null;
  modify_date: string | null;
  title: string | null;
  creator: string | null;
  // PDF/A archival-conformance identifiers (F7), from the pdfaid namespace.
  pdfa_part: string | null;
  pdfa_conformance: string | null;
};

const EMPTY_XMP: XmpMetadata = {
  present: false,
  producer: null,
  creator_tool: null,
  create_date: null,
  modify_date: null,
  title: null,
  creator: null,
  pdfa_part: null,
  pdfa_conformance: null,
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    // Ampersand last so an entity like &amp;lt; isn't double-decoded.
    .replace(/&amp;/g, "&");
}

function clean(value: string | null): string | null {
  if (value === null) return null;
  const text = decodeXmlEntities(value).trim();
  return text.length ? text : null;
}

// Read an XMP property in either serialization form: as an attribute
// (`xmp:CreateDate="…"`) or as an element (`<xmp:CreateDate>…</xmp:CreateDate>`),
// unwrapping the rdf:Alt/rdf:Seq/rdf:li container used for language-alternative
// and ordered-array values (dc:title, dc:creator).
function readProperty(xml: string, qualifiedName: string): string | null {
  const attr = xml.match(new RegExp(`\\b${qualifiedName}\\s*=\\s*"([^"]*)"`));
  if (attr) return clean(attr[1]);

  const element = xml.match(new RegExp(`<${qualifiedName}\\b[^>]*>([\\s\\S]*?)</${qualifiedName}>`));
  if (element) {
    const inner = element[1];
    const li = inner.match(/<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li>/);
    return clean(li ? li[1] : inner.replace(/<[^>]*>/g, ""));
  }
  return null;
}

export function extractXmp(pdfText: string): XmpMetadata {
  const packet = pdfText.match(/<x:xmpmeta\b[\s\S]*?<\/x:xmpmeta>/);
  if (!packet) return EMPTY_XMP;
  const xml = packet[0];

  return {
    present: true,
    producer: readProperty(xml, "pdf:Producer"),
    creator_tool: readProperty(xml, "xmp:CreatorTool"),
    create_date: readProperty(xml, "xmp:CreateDate"),
    modify_date: readProperty(xml, "xmp:ModifyDate"),
    title: readProperty(xml, "dc:title"),
    creator: readProperty(xml, "dc:creator"),
    pdfa_part: readProperty(xml, "pdfaid:part"),
    pdfa_conformance: readProperty(xml, "pdfaid:conformance"),
  };
}
