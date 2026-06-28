/**
 * End-to-end Individual onboarding flow with the six demo KYC PDFs.
 *
 * Drives the legal-form picker + uploads from the sidebar (deterministic
 * regardless of which agent flavor is running) and asserts the new
 * Unmatched-uploads-tray UX:
 *   - all six documents are visible in the files panel
 *   - no document appears in the Unmatched uploads tray
 *   - the checklist header reports zero unmatched
 *
 * This test hits the live Claude API; set ANTHROPIC_API_KEY in the dev
 * server's environment. The pipeline runs sequentially per file, so allow
 * generous timeouts.
 */
import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INDIVIDUAL_KYC_BUILDERS } from "./individualKycFixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Individual flow: upload all six demo KYC PDFs, none land in the unmatched tray", async ({
  page,
}) => {
  // Full pipeline for 6 PDFs: ~30-60s each → budget 12 minutes.
  test.setTimeout(720_000);

  page.on("console", (msg) => console.log(`[browser:${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.log("[browser:pageerror]", err.message));
  page.on("requestfailed", (req) =>
    console.log("[browser:requestfailed]", req.url(), req.failure()?.errorText),
  );
  page.on("response", (res) => {
    if (res.status() >= 400) console.log("[browser:HTTP]", res.status(), res.url());
  });

  // Generate all six fixture PDFs to disk
  const fixtureDir = path.join(__dirname, "tmp", "individual-flow");
  await mkdir(fixtureDir, { recursive: true });
  const fixturePaths: string[] = [];
  for (const { name, build } of INDIVIDUAL_KYC_BUILDERS) {
    const p = path.join(fixtureDir, name);
    await writeFile(p, await build());
    fixturePaths.push(p);
  }

  // Reset demo data so we start from a clean case
  await page.goto("/InvestorAssistant/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByText("Investor Onboarding Agent")).toBeVisible();
  await page.getByRole("button", { name: /reset all demo data/i }).click();
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });

  // Enter onboarding case
  await page.getByText("Corporate investor").click();
  await expect(page).toHaveURL(/\/onboarding/);

  // The sidebar Document checklist shows a legal-form picker when legalForm
  // is undefined. Click "Individual" — that dispatches a user_choice the
  // agent treats as selecting the legal form.
  const sidebarIndividual = page
    .locator('button:has-text("Individual")')
    .filter({ hasNotText: "Limited" }) // exclude "Limited Partnership"
    .first();
  await expect(sidebarIndividual).toBeVisible({ timeout: 30_000 });
  await sidebarIndividual.click();

  // After the click the sidebar switches to the Individual checklist
  // (0 / 6 matched) and the chat shows the new Identity card.
  await expect(page.getByText(/0 \/ 6 matched/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("identity-card")).toBeVisible({ timeout: 30_000 });

  // Fill the identity card (Amelia Rose Brooks — matches the demo PDFs)
  await page.getByTestId("identity-legal-name").fill("Amelia Rose Brooks");
  await page.getByTestId("identity-jurisdiction").fill("United Arab Emirates");
  await page.getByTestId("identity-primary-contact").fill("amelia@example.test");
  await page.getByTestId("identity-dob").fill("1987-05-14");
  await page.getByTestId("identity-nationality").fill("British");
  await page.getByTestId("identity-submit").click();

  // Now the agent emits the requirements + upload cards
  await expect(page.getByText("Upload documents").first()).toBeVisible({ timeout: 30_000 });

  // Use the chat upload card — its hidden <input type="file" multiple>
  // accepts all six PDFs at once.
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /choose files/i }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(fixturePaths);

  // Confirm each filename is listed in the upload card before submit
  for (const fp of fixturePaths) {
    await expect(page.getByText(path.basename(fp)).first()).toBeVisible();
  }
  await page.getByRole("button", { name: /^submit upload$/i }).click();

  // Pipeline begins. Wait for all 6 to land in the files panel.
  const fileRows = page.locator('[data-testid="file-row"]');
  await expect(fileRows).toHaveCount(6, { timeout: 600_000 });

  // None should still be "Pending" / "Processing failed" by the end
  const classifications = page.locator('[data-testid="file-classification"]');
  const count = await classifications.count();
  for (let i = 0; i < count; i++) {
    await expect(classifications.nth(i)).not.toHaveText(/^(Pending|Processing failed)$/, {
      timeout: 600_000,
    });
  }

  // Record what each file ended up being classified as
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    labels.push(((await classifications.nth(i).textContent()) ?? "").trim());
  }
  test.info().annotations.push({
    type: "classifications",
    description: JSON.stringify(labels),
  });

  // CORE ASSERTION: the Unmatched uploads tray must not be present.
  await expect(page.locator('[data-testid="unmatched-uploads-tray"]')).toHaveCount(0);

  // Counter chip showing "X unmatched" must also be absent.
  await expect(page.locator('[data-testid="unmatched-counter"]')).toHaveCount(0);

  // The Individual checklist header should report 6 requirements with at
  // least 5 matched (the demo POA has a stale date and resolves as
  // "Needs attention", which is still matched — not unmatched).
  const checklistHeader = page.getByText(/\d+ \/ 6 matched/);
  await expect(checklistHeader).toBeVisible();
  const headerText = (await checklistHeader.textContent()) ?? "";
  test.info().annotations.push({ type: "checklist-header", description: headerText });
  const matched = Number(headerText.match(/(\d+) \/ 6 matched/)?.[1] ?? "0");
  expect(matched).toBeGreaterThanOrEqual(5);
});
