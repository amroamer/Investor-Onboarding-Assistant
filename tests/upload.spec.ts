import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeUtilityBillPdf } from "./fixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("upload a real PDF, run extraction + classification + validation, view markdown", async ({ page }) => {
  test.setTimeout(240_000);

  // Capture browser console and network failures for diagnostics
  page.on("console", (msg) => console.log(`[browser:${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.log("[browser:pageerror]", err.message));
  page.on("requestfailed", (req) => console.log("[browser:requestfailed]", req.url(), req.failure()?.errorText));
  page.on("response", (res) => {
    if (res.status() >= 400) console.log("[browser:HTTP]", res.status(), res.url());
  });

  // Generate fixture: a utility bill with a real table
  const pdfBytes = await makeUtilityBillPdf();
  const fixtureDir = path.join(__dirname, "tmp");
  await mkdir(fixtureDir, { recursive: true });
  const fixturePath = path.join(fixtureDir, "utility-bill.pdf");
  await writeFile(fixturePath, pdfBytes);

  // Landing — reset to a clean state, then enter onboarding
  await page.goto("/");
  await expect(page.getByText("Investor Onboarding Agent")).toBeVisible();

  // Reset all demo data so we start from empty cases
  await page.getByRole("button", { name: /reset all demo data/i }).click();

  // Wait a beat for reset mutation to land
  await page.waitForTimeout(1500);
  await page.reload();

  // Enter case A
  await page.getByText("Corporate investor").click();
  await expect(page).toHaveURL(/\/onboarding/);

  // Agent greets + emits the legal form picker
  await expect(page.getByRole("button", { name: /^corporation/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /^corporation/i }).click();

  // Identity card appears next — fill in and submit
  await expect(page.getByTestId("identity-card")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("identity-legal-name").fill("Horizon Capital Holdings Ltd.");
  await page.getByTestId("identity-jurisdiction").fill("Cayman Islands");
  await page.getByTestId("identity-primary-contact").fill("Olivia Bennett");
  await page.getByTestId("identity-submit").click();

  // Now the upload card should appear
  await expect(page.getByText("Upload documents").first()).toBeVisible({ timeout: 10_000 });

  // Pick the fixture file via the hidden file input
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /choose files/i }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(fixturePath);

  // Confirm the file is listed before submit
  await expect(page.getByText("utility-bill.pdf")).toBeVisible();

  // Submit — this kicks the real Claude pipeline (extract + classify + validate)
  await page.getByRole("button", { name: /^submit upload$/i }).click();

  // Pipeline takes ~30-60s for one PDF. Wait for the files panel to populate.
  const fileRow = page.locator('[data-testid="file-row"]').first();
  await expect(fileRow).toBeVisible({ timeout: 180_000 });

  // The classification must NOT be "Pending" / "Processing failed" by the end
  const classification = page.locator('[data-testid="file-classification"]').first();
  await expect(classification).not.toHaveText(/^(Pending|Processing failed)$/, { timeout: 180_000 });

  const classText = (await classification.textContent())?.trim() ?? "";
  test.info().annotations.push({ type: "classification", description: classText });

  // It should look like a Proof of address / utility / bank statement
  expect(classText).toMatch(/proof of address|utility|bank|other/i);

  // Open the Markdown extraction
  await page.locator('[data-testid="file-row"] >> button[title="View Markdown extraction"]').first().click();

  // The markdown modal should show the extracted content
  const mdContent = page.locator('[data-testid="md-content"]');
  await expect(mdContent).toBeVisible({ timeout: 30_000 });

  const text = (await mdContent.textContent()) ?? "";
  test.info().annotations.push({ type: "markdown-length", description: String(text.length) });

  // Key value extractions must be present
  expect(text.toLowerCase()).toContain("jane doe");
  expect(text).toContain("62.72");

  // Tables must be preserved as Markdown tables (header-row + cells with |)
  // Look for at least 3 consecutive lines with pipes (header, separator, row)
  const pipeLines = text.split("\n").filter((l) => /\|.*\|/.test(l));
  expect(pipeLines.length).toBeGreaterThanOrEqual(3);
});
