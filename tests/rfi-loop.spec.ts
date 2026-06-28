import { test, expect } from "@playwright/test";

/**
 * Full RFI lifecycle through both surfaces:
 *   Compliance → adds a draft → sends it → investor sees it
 *   Investor → responds → compliance sees the response → compliance marks resolved
 *
 * This exercises the rfi.ts server fns end-to-end (no LLM, no upload pipeline).
 */
test("RFI loop: compliance drafts, sends, investor responds, compliance resolves", async ({ page }) => {
  test.setTimeout(120_000);
  page.on("pageerror", (err) => console.log("[browser:pageerror]", err.message));

  // Reset
  await page.goto("/");
  await expect(page.getByText("Investor Onboarding Agent")).toBeVisible();
  await page.getByRole("button", { name: /reset all demo data/i }).click();
  await page.waitForTimeout(1500);
  await page.reload();

  // Compliance side: draft an RFI + send it
  await page.goto("/compliance");
  // Both seeded cases will have empty RFI lists; pick new-corporate
  await page.locator("select").first().selectOption("new-corporate");
  await page.getByRole("button", { name: /further information/i }).click();

  // Add a draft
  await page
    .locator('[data-testid="rfi-draft-input"]')
    .fill("Please provide a proof of address dated within the last six months.");
  await page.locator('[data-testid="rfi-add-draft"]').click();

  // The draft section should now have 1 item
  const draftRow = page.locator('[data-testid="rfi-draft"]');
  await expect(draftRow).toHaveCount(1, { timeout: 10_000 });

  // Check it (selectedDraftIds was initialised from r.selected which defaults to true,
  // so it should already be ticked — verify and send)
  const checkbox = draftRow.locator('input[type="checkbox"]');
  if (!(await checkbox.isChecked())) await checkbox.check();
  await page.locator('[data-testid="rfi-send-selected"]').click();

  // Sent section now has 1
  await expect(page.locator('[data-testid="rfi-sent"]')).toHaveCount(1, { timeout: 10_000 });

  // Investor side: open onboarding, find the RFI card the agent posted
  await page.goto("/");
  await page.getByText("Corporate investor").click();
  await expect(page).toHaveURL(/\/onboarding/);

  // The agent should have posted "The Compliance team has requested..."
  await expect(
    page.getByText(/the compliance team has requested/i).first(),
  ).toBeVisible({ timeout: 30_000 });

  const rfiItem = page.locator('[data-testid="rfi-item"]').first();
  await expect(rfiItem).toBeVisible();
  await expect(page.locator('[data-testid="rfi-status"]').first()).toContainText(
    /awaiting your response/i,
  );

  // Respond
  await page.getByRole("button", { name: /^respond$/i }).click();
  await page
    .locator('[data-testid="rfi-response-input"]')
    .fill("Uploaded a fresh utility bill via the documents tab.");
  await page.locator('[data-testid="rfi-send"]').click();

  // Status should change to "Awaiting compliance review"
  await expect(page.locator('[data-testid="rfi-status"]').first()).toContainText(
    /awaiting compliance review/i,
    { timeout: 10_000 },
  );

  // Compliance side: see the response in the Responded section, mark resolved
  await page.goto("/compliance");
  await page.locator("select").first().selectOption("new-corporate");
  await page.getByRole("button", { name: /further information/i }).click();

  const respondedRow = page.locator('[data-testid="rfi-responded"]');
  await expect(respondedRow).toHaveCount(1, { timeout: 10_000 });
  await expect(respondedRow).toContainText(/uploaded a fresh utility bill/i);

  await page.locator('[data-testid="rfi-resolve"]').click();

  // The item should disappear from Responded (no more responded items)
  await expect(page.locator('[data-testid="rfi-responded"]')).toHaveCount(0, { timeout: 10_000 });
});
