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

  test("can switch between Analyze and Compare tabs", async ({ page }) => {
    await page.getByRole("button", { name: "Compare" }).click();
    await expect(page.getByText("Upload original PDF")).toBeVisible();
    await expect(page.getByText("Upload comparison PDF")).toBeVisible();

    await page.getByRole("button", { name: "Analyze" }).click();
    await expect(page.getByText("Drag & drop your file here")).toBeVisible();
  });
});
