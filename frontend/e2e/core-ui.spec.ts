import { test, expect } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

/**
 * End-to-end coverage for the Metadata Mutation Checker UI.
 *
 * Scope: the demo/sample-document path and pure client-side behaviour
 * (validation, tab switching, report rendering, export controls). These run
 * without a backend, so the suite is valid against the Vercel preview deploy.
 */

test.describe("Metadata Mutation Checker — core UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the header, tagline and tech-stack tags", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Document Metadata Mutation Checker" })
    ).toBeVisible();
    await expect(
      page.getByText("Analyze metadata consistency & compare documents")
    ).toBeVisible();

    for (const tag of ["Next.js", "TypeScript", "Tailwind CSS", "Node.js"]) {
      await expect(page.getByText(tag, { exact: true }).first()).toBeVisible();
    }
  });

  test("shows the upload dropzone with PDF-only constraints", async ({ page }) => {
    await expect(page.getByText("Drag & drop your file here")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Browse Files" })
    ).toBeVisible();
    await expect(page.getByText(/Accepted: PDF only/)).toBeVisible();
  });

  test("demo mode renders the sample risk score and findings breakdown", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Try with a sample document" }).click();

    // Demo banner appears
    await expect(page.getByText("Demo mode")).toBeVisible();

    // Risk score ring shows the sample score (68) and level (High)
    await expect(page.getByText("68", { exact: true })).toBeVisible();
    await expect(page.getByText("High").first()).toBeVisible();

    // The three sample findings render in the breakdown
    await expect(
      page.getByText("Creator/Producer Version Mismatch")
    ).toBeVisible();
    await expect(
      page.getByText("Modification Date 29 Months After Creation")
    ).toBeVisible();
    await expect(page.getByText("Author Field Cleared")).toBeVisible();

    // Recommended action / disclaimer present
    await expect(page.getByText(/Request the original source file/)).toBeVisible();
  });

  test("demo mode can be cleared to return to the empty state", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Try with a sample document" }).click();
    await expect(page.getByText("Demo mode")).toBeVisible();

    await page.getByRole("button", { name: "Clear demo" }).click();
    await expect(page.getByText("Demo mode")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Try with a sample document" })
    ).toBeVisible();
  });

  test("rejects a non-PDF upload with a validation message", async ({ page }) => {
    // Write a temporary non-PDF file and feed it to the hidden file input.
    const tmpFile = path.join(os.tmpdir(), `mmc-e2e-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, "this is not a pdf");

    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles(tmpFile);

    await expect(
      page.getByText("Only PDF files are supported for this demo.")
    ).toBeVisible();

    fs.unlinkSync(tmpFile);
  });

  test("demo report shows the risk scale, severity ordering and report controls", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Try with a sample document" }).click();

    // Risk gauge exposes an accessible label for screen readers
    await expect(
      page.getByRole("img", { name: /Metadata risk score 68 out of 100, High risk/ })
    ).toBeVisible();

    // Risk scale bar with Low/High threshold labels
    await expect(page.getByText("Risk scale")).toBeVisible();
    await expect(page.getByText("0 · Low")).toBeVisible();
    await expect(page.getByText("70 · High")).toBeVisible();

    // Report toolbar actions are present
    await expect(page.getByRole("button", { name: "New analysis" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy summary" })).toBeVisible();
    await expect(page.getByRole("button", { name: "JSON" })).toBeVisible();

    // Findings are ordered High-severity first
    await expect(page.locator("h4").first()).toHaveText(
      "Creator/Producer Version Mismatch"
    );
  });

  test("surfaces a recoverable error card when analysis fails", async ({ page }) => {
    // The suite runs without a backend, so a valid PDF upload hits /api/analyze
    // and fails — exercising the API error path, not just client validation.
    const tmpFile = path.join(os.tmpdir(), `mmc-e2e-${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, "%PDF-1.4\n%%EOF\n");

    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles(tmpFile);

    await expect(page.getByText(/Analysis couldn.t be completed/)).toBeVisible({
      timeout: 35_000,
    });
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

    // The fallback action recovers into the sample report
    await page
      .getByRole("button", { name: "Use the sample document instead" })
      .click();
    await expect(page.getByText("Demo mode")).toBeVisible();

    fs.unlinkSync(tmpFile);
  });

  test("can switch between Analyze and Compare tabs", async ({ page }) => {
    const compareTab = page.getByRole("tab", { name: "Compare" });
    const analyzeTab = page.getByRole("tab", { name: "Analyze" });

    await compareTab.click();
    await expect(compareTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Upload original PDF")).toBeVisible();
    await expect(page.getByText("Upload comparison PDF")).toBeVisible();

    await analyzeTab.click();
    await expect(analyzeTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Drag & drop your file here")).toBeVisible();
  });
});
