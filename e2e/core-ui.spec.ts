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
    await page.getByRole("button", { name: "Batch" }).click();
    await expect(page.getByText(/Drop multiple PDFs here/i)).toBeVisible();

    await page.getByRole("button", { name: "Compare" }).click();
    await expect(page.getByText(/Upload a PDF to compare/i).first()).toBeVisible();

    await page.getByRole("button", { name: "Analyze" }).click();
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
});
