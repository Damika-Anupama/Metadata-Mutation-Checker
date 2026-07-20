import { test, expect } from "@playwright/test";

// A minimal but valid PDF: 1 page, Microsoft Word 2016 creator, Adobe PDF
// Library 23.6 producer, creation date 2010 — the tool post-dates creation, so
// the live /api/analyze route should surface that finding.
const samplePdf = Buffer.from(
  "%PDF-1.4\n" +
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n" +
    "trailer<</Root 1 0 R/Info<</Author(Jane)/Creator(Microsoft Word 2016)" +
    "/Producer(Adobe PDF Library 23.6)/CreationDate(D:20100101000000Z)>>>>\n" +
    "%%EOF\n"
);

// Mirror of app/page.tsx encodeReportToHash (btoa over latin1 == base64).
function encodeReportToHash(report: unknown): string {
  const json = JSON.stringify(report);
  return Buffer.from(json, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

test.describe("Metadata Mutation Checker — core UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the header and tagline", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: /Document Metadata Mutation Checker/i })
    ).toBeVisible();
    await expect(page.getByText(/Analyze metadata consistency & compare documents/i)).toBeVisible();
  });

  test("demo mode renders the sample report and can be cleared", async ({ page }) => {
    await page.getByRole("button", { name: /Try with a sample document/i }).click();

    await expect(page.getByRole("heading", { name: "service_agreement_2022.pdf" })).toBeVisible();
    await expect(page.getByText(/High metadata risk/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Findings" })).toBeVisible();
    await expect(page.getByText("Demo mode")).toBeVisible();

    await page.getByRole("button", { name: /Clear demo/i }).click();
    await expect(page.getByText("Demo mode")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Try with a sample document/i })).toBeVisible();
  });

  test("switches between Analyze, Compare and Batch tabs", async ({ page }) => {
    await page.getByRole("tab", { name: "Batch" }).click();
    await expect(page.getByText(/Drop multiple PDFs here/i)).toBeVisible();

    await page.getByRole("tab", { name: "Compare" }).click();
    await expect(page.getByText(/Upload a PDF to compare/i).first()).toBeVisible();

    await page.getByRole("tab", { name: "Analyze" }).click();
    await expect(page.getByText(/Drag & drop your file here/i)).toBeVisible();
  });

  test("rejects a non-PDF upload with a validation message", async ({ page }) => {
    await page.locator('input[name="file"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("this is not a pdf"),
    });
    await expect(page.getByText(/Only PDF files are supported/i)).toBeVisible();
  });

  test("analyzes a real uploaded PDF end-to-end via /api/analyze", async ({ page }) => {
    await page.locator('input[name="file"]').setInputFiles({
      name: "sample.pdf",
      mimeType: "application/pdf",
      buffer: samplePdf,
    });

    await expect(page.getByRole("heading", { name: "sample.pdf" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Findings" })).toBeVisible();
    await expect(page.getByText(/Authoring tool post-dates/i)).toBeVisible();
  });

  test("flags an XMP vs Info-dictionary metadata disagreement (F2)", async ({ page }) => {
    // /Info says the producer is Microsoft Word; the embedded XMP packet says
    // Ghostscript — the two metadata stores disagree, which is the F2 signal.
    const mismatchPdf = Buffer.from(
      "%PDF-1.5\n" +
        "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n" +
        "4 0 obj<</Type/Metadata/Subtype/XML/Length 200>>stream\n" +
        '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
        '<rdf:Description xmlns:pdf="http://ns.adobe.com/pdf/1.3/" pdf:Producer="Ghostscript 9.55"/>' +
        "</rdf:RDF></x:xmpmeta>\n" +
        "endstream endobj\n" +
        "trailer<</Root 1 0 R/Info<</Author(Jane)/Creator(Microsoft Word)" +
        "/Producer(Microsoft Word)/CreationDate(D:20200101000000Z)>>>>\n" +
        "%%EOF\n"
    );

    await page.locator('input[name="file"]').setInputFiles({
      name: "mismatch.pdf",
      mimeType: "application/pdf",
      buffer: mismatchPdf,
    });

    await expect(page.getByRole("heading", { name: "mismatch.pdf" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/XMP metadata disagrees with the document info dictionary/i)).toBeVisible();
  });

  test("flags a document modified after it was digitally signed (F6)", async ({ page }) => {
    // A signature whose /ByteRange covers bytes up to offset 1500, followed by
    // an appended revision — content the signature can't cover.
    const base =
      "%PDF-1.7\n" +
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n" +
      "5 0 obj<</Type/Sig/SubFilter/adbe.pkcs7.detached/ByteRange [0 200 1200 300]>>endobj\n" +
      "trailer<</Root 1 0 R>>\n%%EOF\n";
    const revision =
      "6 0 obj<</Type/Annot>>endobj\nxref\n0 1\ntrailer<</Root 1 0 R>>\nstartxref\n1500\n%%EOF\n";
    const tamperedPdf = Buffer.from(base.padEnd(1500, " ") + revision);

    await page.locator('input[name="file"]').setInputFiles({
      name: "signed.pdf",
      mimeType: "application/pdf",
      buffer: tamperedPdf,
    });

    await expect(page.getByRole("heading", { name: "signed.pdf" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/modified after it was digitally signed/i)).toBeVisible();
  });

  test("reconstructs a shared report from the URL hash", async ({ page }) => {
    const report = {
      document_name: "shared_doc.pdf",
      file_type: "PDF",
      metadata_risk_score: 42,
      metadata_risk_level: "Medium",
      summary: "A shared analysis summary.",
      extracted_metadata: {
        file_name: "shared_doc.pdf",
        file_size_bytes: 1234,
        page_count: 3,
        is_encrypted: false,
        created_date: "2021-01-01T00:00:00Z",
        modified_date: "2021-02-01T00:00:00Z",
      },
      findings: [
        { title: "Example shared finding", severity: "Medium", confidence: 0.7, category: "date", explanation: "Detail." },
      ],
      recommended_action: "Review manually.",
      disclaimer: "Indicative only.",
    };

    // Simulate opening the share link fresh (full document load with the hash
    // present), which is how a recipient actually lands on it.
    await page.goto(`/#report=${encodeReportToHash(report)}`);
    await page.reload();
    // Generous timeout: a full reload + hydration + the hash-load effect can
    // exceed the 5s default under parallel-worker load (matches the other
    // report-rendering tests).
    await expect(page.getByRole("heading", { name: "shared_doc.pdf" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Shared report")).toBeVisible();
    await expect(page.getByText("Example shared finding")).toBeVisible();
  });

  test("offers a Print / PDF export of a report that invokes window.print", async ({ page }) => {
    // Stub the native print dialog so clicking the button is observable and
    // doesn't block the test on a real OS dialog.
    await page.addInitScript(() => {
      (window as unknown as { __printed: boolean }).__printed = false;
      window.print = () => {
        (window as unknown as { __printed: boolean }).__printed = true;
      };
    });
    await page.reload();

    await page.getByRole("button", { name: /Try with a sample document/i }).click();
    await expect(page.getByRole("heading", { name: "service_agreement_2022.pdf" })).toBeVisible();

    const printButton = page.getByRole("button", { name: /Print \/ PDF/i });
    await expect(printButton).toBeVisible();
    await printButton.click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __printed: boolean }).__printed))
      .toBe(true);
  });

  test("mode tabs expose ARIA tab semantics and arrow-key navigation", async ({ page }) => {
    const tablist = page.getByRole("tablist", { name: "Analysis modes" });
    await expect(tablist).toBeVisible();

    const analyzeTab = page.getByRole("tab", { name: "Analyze" });
    const compareTab = page.getByRole("tab", { name: "Compare" });
    await expect(analyzeTab).toHaveAttribute("aria-selected", "true");

    // ArrowRight from the active tab moves selection and focus to the next tab.
    await analyzeTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(compareTab).toHaveAttribute("aria-selected", "true");
    await expect(compareTab).toBeFocused();
    await expect(page.getByText(/Upload a PDF to compare/i).first()).toBeVisible();

    // The panel is wired back to the active tab for screen readers.
    await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "tab-compare");
  });
});
