import { describe, it, expect } from "vitest";
import { extractXmp } from "./xmp";
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

const XMP_PACKET = `
<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:xmp="http://ns.adobe.com/xap/1.0/"
        xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmp:CreateDate="2020-06-15T00:00:00Z"
        pdf:Producer="Ghostscript 9.55">
      <xmp:CreatorTool>LibreOffice 7.2</xmp:CreatorTool>
      <xmp:ModifyDate>2023-02-01T09:30:00Z</xmp:ModifyDate>
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Real &amp; True Title</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>Original Author</rdf:li></rdf:Seq></dc:creator>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

describe("extractXmp", () => {
  it("returns present=false when there is no XMP packet", () => {
    expect(extractXmp("%PDF-1.4\nno xmp here\n%%EOF").present).toBe(false);
  });

  it("reads attribute-form and element-form properties", () => {
    const xmp = extractXmp(XMP_PACKET);
    expect(xmp.present).toBe(true);
    expect(xmp.create_date).toBe("2020-06-15T00:00:00Z"); // attribute form
    expect(xmp.producer).toBe("Ghostscript 9.55"); // attribute form
    expect(xmp.creator_tool).toBe("LibreOffice 7.2"); // element form
    expect(xmp.modify_date).toBe("2023-02-01T09:30:00Z");
  });

  it("unwraps rdf:Alt/rdf:Seq and decodes XML entities", () => {
    const xmp = extractXmp(XMP_PACKET);
    expect(xmp.title).toBe("Real & True Title");
    expect(xmp.creator).toBe("Original Author");
  });
});

describe("runMetadataChecks — XMP/Info mismatch (F2)", () => {
  const has = (m: MetadataResult, needle: string) =>
    runMetadataChecks(m).some((f) => f.title.toLowerCase().includes(needle.toLowerCase()));

  it("flags a producer disagreement between XMP and /Info", () => {
    const meta = makeMeta({
      producer: "Microsoft Word",
      xmp_present: true,
      xmp_producer: "Ghostscript 9.55",
    });
    expect(has(meta, "XMP metadata disagrees")).toBe(true);
  });

  it("flags a creation-date disagreement over a minute apart", () => {
    const meta = makeMeta({
      created_date: "2020-06-15T00:00:00Z",
      xmp_present: true,
      xmp_create_date: "2023-01-01T00:00:00Z",
    });
    expect(has(meta, "XMP metadata disagrees")).toBe(true);
  });

  it("does not flag when XMP and /Info agree", () => {
    const meta = makeMeta({
      producer: "Microsoft Word",
      title: "Quarterly Report",
      created_date: "2020-06-15T00:00:00Z",
      xmp_present: true,
      xmp_producer: "microsoft word", // same, different case
      xmp_title: "Quarterly Report",
      xmp_create_date: "2020-06-15T00:00:30Z", // 30s — within tolerance
    });
    expect(has(meta, "XMP metadata disagrees")).toBe(false);
  });

  it("does not flag when no XMP packet is present", () => {
    expect(has(makeMeta({ xmp_present: false }), "XMP metadata disagrees")).toBe(false);
  });
});
