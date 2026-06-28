import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makePassportPdf } from "./fixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Validation rule under test: PASSPORT-EXPIRED.
 * We generate a passport whose expiry is in the past, upload it, and assert that
 * the file row appears, the markdown contains the holder + expiry, and the case
 * gets a High-severity red flag on the compliance side.
 */
test("expired passport produces a High-severity PASSPORT-EXPIRED red flag", async ({ page }) => {
  test.setTimeout(240_000);

  page.on("pageerror", (err) => console.log("[browser:pageerror]", err.message));

  const pdfBytes = await makePassportPdf({
    holder: "Alex Tester",
    nationality: "British",
    passportNumber: "TEST123456",
    issueDate: "01 JAN 2015",
    expiryDate: "01 JAN 2020",
  });
  const fixtureDir = path.join(__dirname, "tmp");
  await mkdir(fixtureDir, { recursive: true });
  const fixturePath = path.join(fixtureDir, "expired-passport.pdf");
  await writeFile(fixturePath, pdfBytes);

  await page.goto("/");
  await expect(page.getByText("Investor Onboarding Agent")).toBeVisible();
  await page.getByRole("button", { name: /reset all demo data/i }).click();
  await page.waitForTimeout(1500);
  await page.reload();

  // Enter case B this time (returning-lp) for variation
  await page.getByText("Limited partnership").click();
  await expect(page).toHaveURL(/\/onboarding/);

  // Agent greets + emits the legal form picker — pick Limited Partnership
  await expect(page.getByRole("button", { name: /limited partnership/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /limited partnership/i }).click();

  // Identity card appears next — fill in and submit
  await expect(page.getByTestId("identity-card")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("identity-legal-name").fill("Atlas Growth Opportunities LP");
  await page.getByTestId("identity-jurisdiction").fill("Cayman Islands");
  await page.getByTestId("identity-primary-contact").fill("Sarah Whitfield");
  await page.getByTestId("identity-submit").click();

  await expect(page.getByText("Upload documents").first()).toBeVisible({ timeout: 10_000 });

  // Pick fixture
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /choose files/i }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(fixturePath);

  await page.getByRole("button", { name: /^submit upload$/i }).click();

  // Wait for the file to appear and classification to land
  const fileRow = page.locator('[data-testid="file-row"]').first();
  await expect(fileRow).toBeVisible({ timeout: 180_000 });

  const classification = page.locator('[data-testid="file-classification"]').first();
  await expect(classification).not.toHaveText(/^(Pending|Processing failed)$/, { timeout: 180_000 });

  const classText = (await classification.textContent())?.trim() ?? "";
  expect(classText).toMatch(/passport/i);

  // Open the markdown view and confirm holder name + expiry text are present
  await page.locator('[data-testid="file-row"] >> button[title="View Markdown extraction"]').first().click();
  const md = page.locator('[data-testid="md-content"]');
  await expect(md).toBeVisible({ timeout: 30_000 });
  const mdText = (await md.textContent()) ?? "";
  // Extraction may split the holder name across "Surname" and "Given names" rows;
  // accept either token.
  expect(mdText.toLowerCase()).toMatch(/alex/);
  expect(mdText.toLowerCase()).toMatch(/tester/);
  expect(mdText).toMatch(/2020/);

  // Close modal
  await page.getByRole("button", { name: /^close$/i }).click();

  // Hop over to the Compliance workspace to confirm the red flag was emitted.
  // The case selector persists `activeKey` in localStorage, so the LP case is already
  // selected from the onboarding session — but pin it explicitly to be safe.
  await page.goto("/compliance");
  await page.locator("select").first().selectOption("returning-lp");
  await page.getByRole("button", { name: /red flags/i }).click();

  // The flags table should contain PASSPORT-EXPIRED with High severity
  await expect(page.getByText(/PASSPORT-EXPIRED/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/High/).first()).toBeVisible();
});
