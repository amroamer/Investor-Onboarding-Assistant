/**
 * End-to-end Individual onboarding flow through the v2 Stepper UI.
 *
 * Drives the new 7-step flow with the six demo Individual KYC PDFs supplied
 * by the product team (Amelia Rose Brooks). All progress is real:
 *   - the Profile step writes to stepper_cases
 *   - the Documents step runs the live Claude extraction + classification
 *     pipeline and the stepper-specific validator
 *   - Ownership / SoW-SoF / Declarations / Review / Submit are saved
 *     through the v2 server functions
 *
 * Requires:
 *   - ANTHROPIC_API_KEY on the dev server
 *   - DATABASE_URL pointing at the same Postgres the dev server uses
 */
import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INDIVIDUAL_KYC_BUILDERS } from "./individualKycFixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Stepper · Individual flow: enter, upload 6 demo PDFs, complete all steps, submit", async ({ page }) => {
  test.setTimeout(900_000); // 15 min — 6 PDFs through the full Claude pipeline

  page.on("console", (msg) => console.log(`[browser:${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.log("[browser:pageerror]", err.message));
  page.on("response", (res) => {
    if (res.status() >= 400) console.log("[browser:HTTP]", res.status(), res.url());
  });

  // Generate the 6 fixture PDFs
  const fixtureDir = path.join(__dirname, "tmp", "stepper-individual");
  await mkdir(fixtureDir, { recursive: true });
  const fixturePaths: string[] = [];
  for (const { name, build } of INDIVIDUAL_KYC_BUILDERS) {
    const p = path.join(fixtureDir, name);
    await writeFile(p, await build());
    fixturePaths.push(p);
  }

  // Land on the home page
  await page.goto("/InvestorAssistant/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByText("Investor Onboarding Agent")).toBeVisible();

  // Click "Onboarding C · Stepper" card → enter v2 flow.
  await page.locator('[data-testid="landing-stepper-card"]').click();
  await expect(page).toHaveURL(/\/v2\/onboarding/);

  // ── Step 1: Profile ────────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: "Investor profile" })).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="profile-investorName"]').fill("Amelia Rose Brooks");
  await page.locator('[data-testid="profile-jurisdiction"]').fill("United Arab Emirates");
  await page.locator('[data-testid="profile-primaryContact"]').fill("Amelia Rose Brooks");
  await page.locator('[data-testid="profile-primaryContactEmail"]').fill("amelia@example.com");
  await page.locator('[data-testid="legal-form-individual"]').click();
  await expect(page.locator('[data-testid="legal-form-individual"]')).toHaveAttribute("data-active", "true");
  await page.locator('[data-testid="profile-next"]').click();

  // ── Step 2: Documents ──────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="documents-counter"]')).toHaveText("0 / 6");

  await page.locator('[data-testid="documents-file-input"]').setInputFiles(fixturePaths);
  for (const fp of fixturePaths) {
    await expect(page.getByText(path.basename(fp)).first()).toBeVisible();
  }
  await page.locator('[data-testid="documents-submit-upload"]').click();

  // Wait until all 6 uploads land in the uploaded-files list with status "ready" or "failed"
  const uploadedRows = page.locator('[data-testid^="uploaded-file-"]');
  await expect(uploadedRows).toHaveCount(6, { timeout: 600_000 });

  // None should still be "extracting"
  const pills = page.locator('[data-testid^="uploaded-file-"] span', { hasText: /^(uploading|extracting|ready|failed)$/i });
  // Wait until none read "extracting"
  await page.waitForFunction(
    () => {
      const nodes = document.querySelectorAll('[data-testid^="uploaded-file-"] span');
      const texts = Array.from(nodes).map((n) => n.textContent?.trim().toLowerCase() ?? "");
      return texts.every((t) => t !== "extracting" && t !== "uploading");
    },
    null,
    { timeout: 600_000 },
  );

  // Print the classification labels for debugging
  const classifications = page.locator('[data-testid="uploaded-classification"]');
  const labels: string[] = [];
  const cnt = await classifications.count();
  for (let i = 0; i < cnt; i++) labels.push(((await classifications.nth(i).textContent()) ?? "").trim());
  test.info().annotations.push({ type: "classifications", description: JSON.stringify(labels) });

  // Counter should reach 6/6
  await expect(page.locator('[data-testid="documents-counter"]')).toHaveText("6 / 6", { timeout: 60_000 });

  // Continue
  await page.locator('[data-testid="documents-next"]').click();

  // ── Step 3: Ownership ─────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: /Ownership/i })).toBeVisible({ timeout: 30_000 });
  // For Individual, row 0 is pre-seeded with the investor — just continue.
  await expect(page.locator('[data-testid="ownership-name-0"]')).toHaveValue("Amelia Rose Brooks");
  await page.locator('[data-testid="ownership-next"]').click();

  // ── Step 4: Source of Wealth & Source of Funds ────────────────────────
  await expect(page.getByRole("heading", { name: "Source of Wealth & Source of Funds" })).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="sow-category"]').selectOption("Employment income");
  await page.locator('[data-testid="sow-detail"]').fill(
    "Senior technology consulting income (2012–2025) and proceeds from sale of a 12% interest in Brightlake Consulting Ltd. in December 2024. Estimated net worth USD 1.5–2.0M.",
  );
  await page.locator('[data-testid="sof-category"]').selectOption("Personal bank account");
  await page.locator('[data-testid="sof-detail"]').fill(
    "Subscription of USD 250,000 to be remitted from Emirates Crescent Bank account ECB-USD-XXXX4412 (closing balance USD 382,745.18). No third-party funding.",
  );
  await page.locator('[data-testid="sowsof-next"]').click();

  // ── Step 5: Declarations ──────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: /Declarations/i })).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="dec-tax-country"]').fill("United Arab Emirates");
  await page.locator('[data-testid="dec-tax-additional"]').fill("None");
  await page.locator('[data-testid="dec-us-person-no"]').click();
  await page.locator('[data-testid="dec-pep-self-no"]').click();
  await page.locator('[data-testid="dec-pep-family-no"]').click();
  await page.locator('[data-testid="dec-pep-associate-no"]').click();
  await page.locator('[data-testid="dec-attestation"]').click();
  await page.locator('[data-testid="declarations-next"]').click();

  // ── Step 6: Review ────────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: /Review and confirm/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="review-profile"]')).toContainText("Amelia Rose Brooks");
  await expect(page.locator('[data-testid="review-profile"]')).toContainText("Individual");
  await expect(page.locator('[data-testid="review-documents"]')).toContainText(/Source of Wealth|Source of Funds|Passport|Proof of address|PEP|Tax residency/);
  await page.locator('[data-testid="review-confirm"]').click();
  await page.locator('[data-testid="review-submit"]').click();

  // ── Step 7: Submitted ─────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: /Submitted/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="submitted-receipt"]')).toContainText(/Case submitted/i);
  await expect(page.locator('[data-testid="submitted-receipt"]')).toContainText(/STP-/);
});
