/**
 * End-to-end Limited-Partnership onboarding flow through the v2 Stepper UI.
 *
 * Drives the seven-step flow with the eleven Atlas Growth Opportunities LP
 * demo PDFs (see lpKycFixtures.ts). The test is intentionally observational —
 * it asserts the happy-path skeleton (correct page renders, profile saves,
 * documents reach an end state) but also captures per-slot status,
 * agent findings and screenshots so that a misclassification on any of the
 * 11 docs surfaces as test output rather than a hard failure.
 *
 * Requires the production-style server (`node serve.mjs`) running on
 * `PLAYWRIGHT_BASE_URL` with ANTHROPIC_API_KEY + DATABASE_URL configured.
 */
import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LP_KYC_BUILDERS } from "./lpKycFixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * LP requirement keys after the 5-form taxonomy update — matches
 * src/lib/stepper/requirements.ts for "Limited Partnership". Eleven slots.
 */
const LP_SLOT_KEYS = [
  "certificate_of_limited_partnership",
  "limited_partnership_agreement",
  "register_of_partners",
  "authorised_signatory_list",
  "entity_tax_residency",
  "gp_constitutional_docs",
  "gp_register_of_directors",
  "evidence_of_authority_partnership",
  "photo_id",
  "proof_of_address",
  "pep_declaration",
] as const;

test("Stepper · Limited Partnership flow: agent processes 11 LP demo PDFs and surfaces them across the seven steps", async ({
  page,
}) => {
  test.setTimeout(1_500_000); // 25 min — 11 PDFs through the live Claude pipeline

  // ── Diagnostics ────────────────────────────────────────────────────────
  const browserLog: string[] = [];
  const httpErrors: string[] = [];
  page.on("console", (msg) => {
    const line = `[browser:${msg.type()}] ${msg.text()}`;
    browserLog.push(line);
    if (msg.type() === "error") console.log(line);
  });
  page.on("pageerror", (err) => {
    const line = `[browser:pageerror] ${err.message}`;
    browserLog.push(line);
    console.log(line);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      const line = `[HTTP ${res.status()}] ${res.url()}`;
      httpErrors.push(line);
      console.log(line);
    }
  });

  // ── Build fixture PDFs ─────────────────────────────────────────────────
  const fixtureDir = path.join(__dirname, "tmp", "stepper-lp");
  await mkdir(fixtureDir, { recursive: true });
  const fixturePaths: string[] = [];
  for (const { name, build } of LP_KYC_BUILDERS) {
    const p = path.join(fixtureDir, name);
    await writeFile(p, await build());
    fixturePaths.push(p);
  }
  console.log(`[fixtures] generated ${fixturePaths.length} LP demo PDFs in ${fixtureDir}`);

  const screenshotsDir = path.join(__dirname, "tmp", "stepper-lp-screens");
  await mkdir(screenshotsDir, { recursive: true });
  const shot = async (name: string) => {
    await page.screenshot({
      path: path.join(screenshotsDir, `${name}.png`),
      fullPage: true,
    });
  };

  // ── Land on home page ──────────────────────────────────────────────────
  await page.goto("/InvestorAssistant/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByText("Investor Onboarding Agent")).toBeVisible();
  await page.locator('[data-testid="landing-stepper-card"]').click();
  await expect(page).toHaveURL(/\/v2\/onboarding/);
  await shot("00-stepper-landing");

  // ── Step 1: Profile ────────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: "Investor profile" })).toBeVisible({
    timeout: 30_000,
  });
  await page
    .locator('[data-testid="profile-investorName"]')
    .fill("Atlas Growth Opportunities LP");
  await page
    .locator('[data-testid="profile-primaryContactEmail"]')
    .fill("kyc@atlasgrowth.example");

  // Step 1 is a flat 5-card list — clicking the LP card selects it directly.
  await page.locator('[data-testid="legal-form-limited-partnership"]').click();
  await expect(page.locator('[data-testid="legal-form-limited-partnership"]')).toHaveAttribute(
    "data-active",
    "true",
  );

  // Selected-summary card should appear and list the LP requirements as chips.
  await expect(page.locator('[data-testid="profile-selection-summary"]')).toBeVisible();
  await shot("01-profile-selected");

  await page.locator('[data-testid="profile-next"]').click();

  // ── Step 2: Documents — bulk-upload the 11 LP PDFs ─────────────────────
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 30_000 });
  // LP requirements: 11 slots in total (LP, GP, UBO/signatory).
  await expect(page.locator('[data-testid="documents-counter"]')).toHaveText("0 / 11");
  for (const k of LP_SLOT_KEYS) {
    await expect(page.locator(`[data-testid="slot-${k}"]`)).toBeVisible();
  }
  await shot("02a-documents-empty");

  await page.locator('[data-testid="documents-bulk-input"]').setInputFiles(fixturePaths);

  // Wait until every slot has settled into a terminal status. We don't insist
  // on a specific status per slot — we record what we got.
  await page.waitForFunction(
    (keys) => {
      for (const k of keys) {
        const el = document.querySelector(`[data-testid="slot-${k}"]`);
        const s = el?.getAttribute("data-status");
        if (!s || s === "required" || s === "in_flight") return false;
      }
      return true;
    },
    [...LP_SLOT_KEYS],
    { timeout: 1_200_000 }, // 20 minutes for 11 docs through Claude
  );
  await shot("02b-documents-processed");

  // Record per-slot status to surface in the test report.
  const slotStatus = await page.evaluate((keys) => {
    return keys.map((k) => {
      const el = document.querySelector(`[data-testid="slot-${k}"]`);
      return {
        key: k,
        status: el?.getAttribute("data-status") ?? null,
        text: (el?.textContent ?? "").replace(/\s+/g, " ").slice(0, 220),
      };
    });
  }, [...LP_SLOT_KEYS]);
  console.log("[slots]", JSON.stringify(slotStatus, null, 2));

  // Capture the count + the 5-stat grid + headline banner if visible.
  const counterText = await page.locator('[data-testid="documents-counter"]').textContent();
  console.log("[counter]", counterText);
  const headline = await page
    .locator('[data-testid="docs-headline-banner"]')
    .textContent()
    .catch(() => null);
  console.log("[headline]", headline);

  // We *report* misses rather than fail the run.
  const filledCount = slotStatus.filter((s) => s.status === "received" || s.status === "accepted").length;
  console.log(`[summary] ${filledCount}/${LP_SLOT_KEYS.length} slots filled cleanly`);

  // Only continue if the Continue button is enabled — otherwise capture and stop.
  const nextBtn = page.locator('[data-testid="documents-next"]');
  const disabled = await nextBtn.isDisabled();
  if (disabled) {
    console.log("[step2] Continue is disabled — not all slots are received. Stopping here.");
    await shot("02c-documents-blocked");
    // We still want the run to be informative: surface the slot map as a soft
    // assertion failure attached to the report.
    expect.soft(filledCount, "Expected all 11 LP slots filled").toBe(LP_SLOT_KEYS.length);
    return;
  }
  await nextBtn.click();

  // ── Step 3: Ownership ──────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: /Ownership/i })).toBeVisible({ timeout: 30_000 });
  await shot("03-ownership");
  const firstPartyName = await page
    .locator('[data-testid="ownership-name-0-readonly"], [data-testid="ownership-name-0"]')
    .first()
    .textContent()
    .catch(() => null);
  console.log("[ownership] first party (entity-derived holders):", firstPartyName);
  // Just continue — the prefill is observational; the form is editable.
  if (await page.locator('[data-testid="ownership-add"]').isVisible()) {
    // ensure we can proceed even if no parties prefilled — fill one minimal row
    const anyRows = await page.locator('[data-testid^="ownership-row-"]').count();
    if (anyRows === 0) {
      await page.locator('[data-testid="ownership-add"]').click();
      // The new row goes straight into edit mode. Fill name + role.
      await page.locator('[data-testid="ownership-name-0"]').fill("Atlas Growth GP Ltd.");
      await page.locator('[data-testid="ownership-role-0"]').fill("General Partner");
    }
  }
  await page.locator('[data-testid="ownership-next"]').click();

  // ── Step 4: SoW / SoF ──────────────────────────────────────────────────
  await expect(
    page.getByRole("heading", { name: "Source of Wealth & Source of Funds" }),
  ).toBeVisible({ timeout: 30_000 });
  await shot("04-sowsof");
  // The LP demo PDFs don't include an explicit SoW narrative — fill minimal
  // values so we can proceed and demonstrate the flow.
  const sowDetail = page.locator('[data-testid="sow-detail"]');
  if ((await sowDetail.inputValue()).trim().length === 0) {
    await sowDetail.fill(
      "Atlas Growth Opportunities LP accumulated its capital through committed contributions from its institutional and high-net-worth Limited Partners between 2022 and 2026.",
    );
  }
  const sofDetail = page.locator('[data-testid="sof-detail"]');
  if ((await sofDetail.inputValue()).trim().length === 0) {
    await sofDetail.fill(
      "Subscription of USD 1,500,000 will be remitted from the partnership account ending 8831 in line with the General Partner's written resolution dated 06 June 2026.",
    );
  }
  // Make sure both categories are picked.
  const sowCategoryButton = page.locator('[data-testid="sow-category"]');
  if (await sowCategoryButton.isVisible()) {
    const text = (await sowCategoryButton.textContent()) ?? "";
    if (!text.includes("Family") && !text.includes("Investment") && !text.includes("Employment")) {
      await sowCategoryButton.click();
      await page.getByRole("option", { name: "Family wealth" }).click();
    }
  }
  const sofCategoryButton = page.locator('[data-testid="sof-category"]');
  if (await sofCategoryButton.isVisible()) {
    const text = (await sofCategoryButton.textContent()) ?? "";
    if (!text.includes("Personal") && !text.includes("Investment") && !text.includes("Loan")) {
      await sofCategoryButton.click();
      await page.getByRole("option", { name: "Personal bank account" }).click();
    }
  }
  await page.locator('[data-testid="sowsof-next"]').click();

  // ── Step 5: Declarations ───────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: /Declarations/i })).toBeVisible({
    timeout: 30_000,
  });
  await shot("05a-declarations-readonly");

  // The Tax-residency card shows in confirmation mode by default. If the
  // tax country is empty (agent couldn't extract) we need to click Edit and
  // fill it — entity classification always requires FATCA section + TIN.
  const taxCardEdit = page
    .locator('[data-testid="dec-card-tax"] button', { hasText: "Edit" })
    .first();
  if (await taxCardEdit.isVisible()) {
    await taxCardEdit.click();
  }
  const taxCountryInput = page.locator('[data-testid="dec-tax-country"]');
  if ((await taxCountryInput.inputValue()).trim().length === 0) {
    await taxCountryInput.fill("Cayman Islands");
  }
  // US person — make sure No is selected.
  if (
    (await page
      .locator('[data-testid="dec-us-person-yes"]')
      .getAttribute("data-active")) !== "true" &&
    (await page.locator('[data-testid="dec-us-person-no"]').getAttribute("data-active")) !== "true"
  ) {
    await page.locator('[data-testid="dec-us-person-no"]').click();
  }
  await shot("05b-declarations-tax-edit");

  // FATCA classification (entities only) — Select dropdown
  const fatcaTrigger = page.locator('[data-testid="dec-fatca-section-select"]');
  if (await fatcaTrigger.isVisible()) {
    const fatcaText = (await fatcaTrigger.textContent()) ?? "";
    if (!fatcaText.includes("Section")) {
      await fatcaTrigger.click();
      await page.getByRole("option", { name: /Passive NFFE/i }).click();
    }
    const fatcaTin = page.locator('[data-testid="dec-fatca-tin"]');
    if ((await fatcaTin.inputValue()).trim().length === 0) {
      await fatcaTin.fill("CAY-LP-2022-00418");
    }
  }

  // PEP card — same pattern. Open Edit and tick all three "No".
  const pepCardEdit = page
    .locator('[data-testid="dec-card-pep"] button', { hasText: "Edit" })
    .first();
  if (await pepCardEdit.isVisible()) {
    await pepCardEdit.click();
  }
  for (const k of ["self", "family", "associate"]) {
    const yes = page.locator(`[data-testid="dec-pep-${k}-yes"]`);
    const no = page.locator(`[data-testid="dec-pep-${k}-no"]`);
    if (
      (await yes.getAttribute("data-active")) !== "true" &&
      (await no.getAttribute("data-active")) !== "true"
    ) {
      await no.click();
    }
  }

  // Attestation checkbox.
  await page.locator('[data-testid="dec-attestation"]').click();
  await shot("05c-declarations-ready");
  await page.locator('[data-testid="declarations-next"]').click();

  // ── Step 6: Review ─────────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: /Review and confirm/i })).toBeVisible({
    timeout: 30_000,
  });
  await shot("06-review");
  await expect(page.locator('[data-testid="review-profile"]')).toContainText(
    "Atlas Growth Opportunities LP",
  );
  await expect(page.locator('[data-testid="review-profile"]')).toContainText("Limited Partnership");
  await page.locator('[data-testid="review-confirm"]').click();
  await page.locator('[data-testid="review-submit"]').click();

  // ── Step 7: Submitted ──────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: /Submitted/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="submitted-receipt"]')).toContainText(/Case submitted/i);
  await expect(page.locator('[data-testid="submitted-receipt"]')).toContainText(/STP-/);
  await shot("07-submitted");

  // Test diagnostics summary.
  console.log("───────────────────────────────────────────────────────────");
  console.log(`HTTP errors observed: ${httpErrors.length}`);
  console.log(`Filled doc slots: ${filledCount}/${LP_SLOT_KEYS.length}`);
  console.log("───────────────────────────────────────────────────────────");
});
