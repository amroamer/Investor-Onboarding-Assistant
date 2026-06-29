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
 * Asserts the agentic prefill behaviour: after the 6 PDFs are processed,
 * Ownership / SoW-SoF / Declarations should already contain the relevant
 * extracted values — the test does NOT manually type those fields.
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

test("Stepper · Individual flow: agent extracts and prefills steps 3/4/5 from 6 demo PDFs, user confirms and submits", async ({ page }) => {
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
  await page.locator('[data-testid="profile-primaryContactEmail"]').fill("amelia@example.com");
  // Step 1 is now a flat 5-card list — clicking the Individual card selects it.
  await page.locator('[data-testid="legal-form-individual"]').click();
  await expect(page.locator('[data-testid="legal-form-individual"]')).toHaveAttribute(
    "data-active",
    "true",
  );
  await page.locator('[data-testid="profile-next"]').click();

  // ── Step 2: Documents (slot-based with agent chip) ─────────────────────
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="documents-counter"]')).toHaveText("0 / 6");
  await expect(page.locator('[data-testid="documents-agent-chip"]')).toBeVisible();

  // Drop all six demo PDFs into the bulk strip — the auto-classifier slots each.
  await page.locator('[data-testid="documents-bulk-input"]').setInputFiles(fixturePaths);

  const slotKeys = [
    "photo_id",
    "proof_of_address",
    "tax_residency",
    "source_of_wealth",
    "source_of_funds",
    "pep_declaration",
  ];
  for (const k of slotKeys) {
    await expect(page.locator(`[data-testid="slot-${k}"]`)).toBeVisible();
  }
  await page.waitForFunction(
    (keys) => {
      for (const k of keys) {
        const el = document.querySelector(`[data-testid="slot-${k}"]`);
        const status = el?.getAttribute("data-status");
        if (!status || status === "required" || status === "in_flight") return false;
      }
      return true;
    },
    slotKeys,
    { timeout: 600_000 },
  );

  await expect(page.locator('[data-testid="documents-counter"]')).toHaveText("6 / 6", { timeout: 60_000 });
  await page.locator('[data-testid="documents-next"]').click();

  // ── Step 3: Ownership — prefilled from passport ───────────────────────
  await expect(page.getByRole("heading", { name: "Ownership and related parties" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="agent-prefill-banner"]')).toBeVisible();
  await expect(page.locator('[data-testid="agent-prefill-banner"]')).toHaveAttribute("data-empty", "false");
  // The prefill chip shows the source filename — visible in display mode.
  await expect(page.locator('[data-testid="ownership-name-0-chip-source"]')).toBeVisible();
  // Click Edit on Party 1 so the inputs mount, then verify prefilled values.
  await page.locator('[data-testid="ownership-row-0"] >> text=Edit').click();
  await expect(page.locator('[data-testid="ownership-name-0"]')).toHaveValue("Amelia Rose Brooks");
  await expect(page.locator('[data-testid="ownership-nationality-0"]')).toHaveValue("British");
  await page.locator('[data-testid="ownership-next"]').click();

  // ── Step 4: SoW & SoF — prefilled from SoW PDF + bank statement ───────
  await expect(page.getByRole("heading", { name: "Source of Wealth & Source of Funds" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="agent-prefill-banner"]')).toBeVisible();
  await expect(page.locator('[data-testid="agent-prefill-banner"]')).toHaveAttribute("data-empty", "false");

  // SoW: category should map to "Employment income"; narrative should mention the consulting work.
  // sow-category and sof-category are Radix Select triggers — assert visible text, not input value.
  await expect(page.locator('[data-testid="sow-category"]')).toHaveText(/Employment income/);
  const sowDetail = await page.locator('[data-testid="sow-detail"]').inputValue();
  expect(sowDetail).toMatch(/consulting|Brightlake|wealth/i);

  // SoF: category and narrative should reference the Emirates Crescent Bank account.
  await expect(page.locator('[data-testid="sof-category"]')).toHaveText(/Personal bank account/);
  const sofDetail = await page.locator('[data-testid="sof-detail"]').inputValue();
  expect(sofDetail).toMatch(/Emirates Crescent Bank/i);
  expect(sofDetail).toMatch(/250,?000/);

  await page.locator('[data-testid="sowsof-next"]').click();

  // ── Step 5: Declarations — prefilled from tax + PEP docs ──────────────
  await expect(page.getByRole("heading", { name: "Declarations", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="agent-prefill-banner"]')).toBeVisible();
  await expect(page.locator('[data-testid="agent-prefill-banner"]')).toHaveAttribute("data-empty", "false");

  // Tax card renders as a confirmation row; click Edit to expose inputs and verify.
  await page.locator('[data-testid="dec-card-tax"] >> text=Edit').click();
  await expect(page.locator('[data-testid="dec-tax-country"]')).toHaveValue("United Arab Emirates");
  await expect(page.locator('[data-testid="dec-us-person-no"]')).toHaveAttribute("data-active", "true");

  // PEP card — click Edit, then verify all three "No" answers are pre-selected.
  await page.locator('[data-testid="dec-card-pep"] >> text=Edit').click();
  await expect(page.locator('[data-testid="dec-pep-self-no"]')).toHaveAttribute("data-active", "true");
  await expect(page.locator('[data-testid="dec-pep-family-no"]')).toHaveAttribute("data-active", "true");
  await expect(page.locator('[data-testid="dec-pep-associate-no"]')).toHaveAttribute("data-active", "true");

  // Individual flow — no FATCA classification block.
  await expect(page.locator('[data-testid="dec-fatca-section"]')).toHaveCount(0);
  // Attestation is the only thing the investor must tick by hand.
  await page.locator('[data-testid="dec-attestation"]').click();
  await page.locator('[data-testid="declarations-next"]').click();

  // ── Step 6: Review ────────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: /Review and confirm/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="review-agent-summary"]')).toBeVisible();
  await expect(page.locator('[data-testid="review-profile"]')).toContainText("Amelia Rose Brooks");
  await expect(page.locator('[data-testid="review-profile"]')).toContainText("Individual");
  // Documents row is a compact summary — verify the count + completion text.
  await expect(page.locator('[data-testid="review-documents"]')).toContainText(/6 of 6 documents received/);
  await expect(page.locator('[data-testid="review-documents"]')).toContainText(/All required documents uploaded/);
  // Expand the Declarations row to reveal the source-of-truth chips, then assert at least one is visible.
  await page.locator('[data-testid="review-declarations"] >> [aria-label="Expand"]').click();
  await expect(page.locator('[data-testid="review-source-tag"]').first()).toBeVisible();
  await page.locator('[data-testid="review-confirm"]').click();
  await page.locator('[data-testid="review-submit"]').click();

  // ── Step 7: Submitted ─────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: "Submitted", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="submitted-receipt"]')).toContainText(/Case submitted/i);
  await expect(page.locator('[data-testid="submitted-receipt"]')).toContainText(/STP-/);
});
