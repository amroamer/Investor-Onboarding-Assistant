/**
 * End-to-end Regulated / Listed Entity onboarding flow through the v2 Stepper UI,
 * followed by a compliance-workspace smoke test for the just-submitted case.
 *
 * Drives the seven-step flow with the seven Nova Capital Markets PJSC demo PDFs
 * (see listedEntityKycFixtures.ts). The Regulated/Listed form has 7 doc slots:
 *   - 5 entity slots: regulated_status, audited_FS, signatory_list, tax_residency, sof
 *   - 2 per-signatory slots: photo_id, proof_of_address
 *
 * Like the LP test, it's observational where it makes sense — captures per-slot
 * statuses and screenshots so misclassifications surface as data, not hard fails.
 *
 * Requires the production-style server (`node serve.mjs`) running on
 * `PLAYWRIGHT_BASE_URL` with ANTHROPIC_API_KEY + DATABASE_URL configured.
 */
import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LISTED_ENTITY_KYC_BUILDERS } from "./listedEntityKycFixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LISTED_SLOT_KEYS = [
  "evidence_of_regulated_status",
  "audited_financial_statements",
  "authorised_signatory_list",
  "entity_tax_residency",
  "entity_source_of_funds",
  "photo_id",
  "proof_of_address",
] as const;

test("Stepper · Listed/Regulated Entity flow: 7 demo PDFs through the seven steps, then compliance cockpit", async ({
  page,
}) => {
  test.setTimeout(1_500_000); // 25 min for live Claude classification

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
  const fixtureDir = path.join(__dirname, "tmp", "stepper-listed-entity");
  await mkdir(fixtureDir, { recursive: true });
  const fixturePaths: string[] = [];
  for (const { name, build } of LISTED_ENTITY_KYC_BUILDERS) {
    const p = path.join(fixtureDir, name);
    await writeFile(p, await build());
    fixturePaths.push(p);
  }
  console.log(
    `[fixtures] generated ${fixturePaths.length} listed-entity demo PDFs in ${fixtureDir}`,
  );

  const screenshotsDir = path.join(__dirname, "tmp", "stepper-listed-entity-screens");
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
  await page.locator('[data-testid="profile-investorName"]').fill("Nova Capital Markets PJSC");
  await page
    .locator('[data-testid="profile-primaryContactEmail"]')
    .fill("kyc@novacapital.example");

  await page.locator('[data-testid="legal-form-regulated-or-listed-entity"]').click();
  await expect(
    page.locator('[data-testid="legal-form-regulated-or-listed-entity"]'),
  ).toHaveAttribute("data-active", "true");
  await expect(page.locator('[data-testid="profile-selection-summary"]')).toBeVisible();
  await shot("01-profile-selected");
  await page.locator('[data-testid="profile-next"]').click();

  // ── Step 2: Documents — bulk-upload the 7 listed-entity PDFs ───────────
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="documents-counter"]')).toHaveText("0 / 7");
  for (const k of LISTED_SLOT_KEYS) {
    await expect(page.locator(`[data-testid="slot-${k}"]`)).toBeVisible();
  }
  await shot("02a-documents-empty");

  await page.locator('[data-testid="documents-bulk-input"]').setInputFiles(fixturePaths);

  await page.waitForFunction(
    (keys) => {
      for (const k of keys) {
        const el = document.querySelector(`[data-testid="slot-${k}"]`);
        const s = el?.getAttribute("data-status");
        if (!s || s === "required" || s === "in_flight") return false;
      }
      return true;
    },
    [...LISTED_SLOT_KEYS],
    { timeout: 1_200_000 },
  );
  await shot("02b-documents-processed");

  const slotStatus = await page.evaluate((keys) => {
    return keys.map((k) => {
      const el = document.querySelector(`[data-testid="slot-${k}"]`);
      return {
        key: k,
        status: el?.getAttribute("data-status") ?? null,
        text: (el?.textContent ?? "").replace(/\s+/g, " ").slice(0, 220),
      };
    });
  }, [...LISTED_SLOT_KEYS]);
  console.log("[slots]", JSON.stringify(slotStatus, null, 2));

  const counterText = await page.locator('[data-testid="documents-counter"]').textContent();
  console.log("[counter]", counterText);
  const headline = await page
    .locator('[data-testid="docs-headline-banner"]')
    .textContent()
    .catch(() => null);
  console.log("[headline]", headline);

  const filledCount = slotStatus.filter(
    (s) => s.status === "received" || s.status === "accepted",
  ).length;
  console.log(`[summary] ${filledCount}/${LISTED_SLOT_KEYS.length} slots filled cleanly`);

  const nextBtn = page.locator('[data-testid="documents-next"]');
  const disabled = await nextBtn.isDisabled();
  if (disabled) {
    console.log(
      "[step2] Continue disabled — not all slots are received. Stopping here.",
    );
    await shot("02c-documents-blocked");
    expect.soft(filledCount, "Expected all 7 listed-entity slots filled").toBe(
      LISTED_SLOT_KEYS.length,
    );
    return;
  }
  await nextBtn.click();

  // ── Step 3: Ownership ──────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: /Ownership/i })).toBeVisible({ timeout: 30_000 });
  await shot("03a-ownership");

  // Listed entities don't need UBO disclosure; we just need to confirm the
  // authorised signatories. The agent should prefill them from the
  // signatory list / photo-IDs. If not, add one minimal row.
  const anyRows = await page.locator('[data-testid^="ownership-row-"]').count();
  console.log(`[ownership] prefilled rows: ${anyRows}`);
  if (anyRows === 0) {
    await page.locator('[data-testid="ownership-add"]').click();
    await page.locator('[data-testid="ownership-name-0"]').fill("Nadia Samira Rahman");
    await page.locator('[data-testid="ownership-role-0"]').fill("Authorised signatory");
  }
  await shot("03b-ownership-filled");
  await page.locator('[data-testid="ownership-next"]').click();

  // ── Step 4: SoW / SoF ──────────────────────────────────────────────────
  // For Listed/Regulated entities, SoW is suppressed — the heading becomes
  // just "Source of Funds" (no SoW card). Use a regex that matches either.
  await expect(
    page.getByRole("heading", { name: /Source of Funds(?: |$)/i }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await shot("04a-sowsof");
  // Listed entity: requiresSourceOfWealth=false, requiresSourceOfFunds=true.
  // Only the SoF card should be visible.
  const sowVisible = await page.locator('[data-testid="sow-detail"]').isVisible().catch(() => false);
  const sofVisible = await page.locator('[data-testid="sof-detail"]').isVisible().catch(() => false);
  console.log(`[sowsof] sow=${sowVisible} sof=${sofVisible} (expected sow=false sof=true)`);

  const sofDetail = page.locator('[data-testid="sof-detail"]');
  if ((await sofDetail.inputValue()).trim().length === 0) {
    await sofDetail.fill(
      "The USD 5,000,000 subscription will be remitted from Nova Capital Markets PJSC's operating account at Gulf Institutional Bank (ref GIB-USD-XXXX9810), funded by operating cash and matured investment proceeds.",
    );
  }
  const sofCategoryButton = page.locator('[data-testid="sof-category"]');
  if (await sofCategoryButton.isVisible()) {
    const t = (await sofCategoryButton.textContent()) ?? "";
    if (!t.includes("Corporate") && !t.includes("Personal") && !t.includes("Investment")) {
      await sofCategoryButton.click();
      await page.getByRole("option", { name: /Corporate bank account/i }).click();
    }
  }
  await shot("04b-sowsof-filled");
  await page.locator('[data-testid="sowsof-next"]').click();

  // ── Step 5: Declarations ───────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: "Declarations", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await shot("05a-declarations-readonly");

  const taxCardEdit = page
    .locator('[data-testid="dec-card-tax"] button', { hasText: "Edit" })
    .first();
  if (await taxCardEdit.isVisible()) {
    await taxCardEdit.click();
  }
  const taxCountryInput = page.locator('[data-testid="dec-tax-country"]');
  if ((await taxCountryInput.inputValue()).trim().length === 0) {
    await taxCountryInput.fill("United Arab Emirates");
  }
  if (
    (await page.locator('[data-testid="dec-us-person-yes"]').getAttribute("data-active")) !==
      "true" &&
    (await page.locator('[data-testid="dec-us-person-no"]').getAttribute("data-active")) !== "true"
  ) {
    await page.locator('[data-testid="dec-us-person-no"]').click();
  }

  // FATCA classification dropdown (entity).
  const fatcaTrigger = page.locator('[data-testid="dec-fatca-section-select"]');
  if (await fatcaTrigger.isVisible()) {
    const fatcaText = (await fatcaTrigger.textContent()) ?? "";
    if (!fatcaText.includes("Section")) {
      await fatcaTrigger.click();
      await page.getByRole("option", { name: /Financial Institution/i }).click();
    }
    const fatcaTin = page.locator('[data-testid="dec-fatca-tin"]');
    if ((await fatcaTin.inputValue()).trim().length === 0) {
      await fatcaTin.fill("100004982100003");
    }
  }
  await shot("05b-declarations-tax-edit");

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

  await page.locator('[data-testid="dec-attestation"]').click();
  await shot("05c-declarations-ready");
  await page.locator('[data-testid="declarations-next"]').click();

  // ── Step 6: Review ─────────────────────────────────────────────────────
  await expect(
    page.getByRole("heading", { name: "Review and confirm", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await shot("06-review");
  await expect(page.locator('[data-testid="review-profile"]')).toContainText(
    "Nova Capital Markets PJSC",
  );
  await expect(page.locator('[data-testid="review-profile"]')).toContainText(
    /Regulated or Listed Entity/i,
  );
  await page.locator('[data-testid="review-confirm"]').click();
  await page.locator('[data-testid="review-submit"]').click();

  // ── Step 7: Submitted ──────────────────────────────────────────────────
  await expect(
    page.getByRole("heading", { name: "Submitted", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="submitted-receipt"]')).toContainText(/Case submitted/i);
  const receiptText = await page.locator('[data-testid="submitted-receipt"]').textContent();
  const caseIdMatch = receiptText?.match(/STP-\d{4}-[A-Z0-9]{6}/);
  const submittedCaseId = caseIdMatch?.[0] ?? null;
  console.log(`[submitted] caseId=${submittedCaseId}`);
  await shot("07-submitted");

  expect(submittedCaseId).toBeTruthy();

  // ── Step 8: Compliance workspace queue ─────────────────────────────────
  await page.goto("/InvestorAssistant/compliance", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page.getByText(/Compliance workspace/i).first()).toBeVisible({ timeout: 30_000 });
  await shot("08a-compliance-queue");

  // The new case should appear in the queue. Click into it via its caseId text.
  const caseRowSel = `text=${submittedCaseId}`;
  const hasRow = await page.locator(caseRowSel).first().isVisible().catch(() => false);
  console.log(`[compliance-queue] case ${submittedCaseId} visible in queue: ${hasRow}`);

  // Navigate directly via query param (more reliable than clicking through cards).
  await page.goto(
    `/InvestorAssistant/compliance?case=${submittedCaseId}`,
    { waitUntil: "domcontentloaded", timeout: 30_000 },
  );

  // The cockpit should render the case hero + tabs.
  await expect(page.locator("body")).toContainText(/Nova Capital Markets PJSC/i, { timeout: 30_000 });
  await shot("08b-compliance-cockpit");

  // Dump high-level signals from the cockpit so we know what compliance sees.
  const cockpitTextSample = await page.locator("body").innerText();
  const headers = cockpitTextSample
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .slice(0, 80)
    .join("\n");
  console.log("[compliance-cockpit:first-80-lines]\n" + headers);

  // Quick sanity: the cockpit should reference Listed/Regulated form and the 7 docs.
  await expect(page.locator("body")).toContainText(/Regulated or Listed Entity/i);

  // ── Diagnostics summary ────────────────────────────────────────────────
  console.log("───────────────────────────────────────────────────────────");
  console.log(`HTTP errors observed: ${httpErrors.length}`);
  console.log(`Filled doc slots: ${filledCount}/${LISTED_SLOT_KEYS.length}`);
  console.log(`Submitted case: ${submittedCaseId}`);
  console.log("───────────────────────────────────────────────────────────");
});
