import { test, expect } from "@playwright/test";

/**
 * Walk the guided onboarding flow without uploading anything — every transition goes
 * through the agent (`sendAgentEvent`), so this exercises the rule-based agent
 * end-to-end over HTTP and confirms the dispatch wiring is correct for the no-upload
 * branches: session_start → legal-form selection → identity capture → upload card.
 */
test("guided flow walks through agent dispatches without uploads", async ({ page }) => {
  test.setTimeout(120_000);

  page.on("pageerror", (err) => console.log("[browser:pageerror]", err.message));

  await page.goto("/");
  await expect(page.getByText("Investor Onboarding Agent")).toBeVisible();
  await page.getByRole("button", { name: /reset all demo data/i }).click();
  await page.waitForTimeout(1500);
  await page.reload();

  await page.getByText("Corporate investor").click();
  await expect(page).toHaveURL(/\/onboarding/);

  // session_start fires automatically — agent greets + emits the legal form chooser
  await expect(page.getByRole("button", { name: /^corporation/i })).toBeVisible({
    timeout: 30_000,
  });

  // user_choice: Corporation
  await page.getByRole("button", { name: /^corporation/i }).click();

  // The new flow inserts the Identity card BEFORE Documents
  await expect(page.getByTestId("identity-card")).toBeVisible({ timeout: 10_000 });

  // Fill in the identity fields
  await page.getByTestId("identity-legal-name").fill("Atlas Growth Opportunities LP");
  await page.getByTestId("identity-jurisdiction").fill("Cayman Islands");
  await page.getByTestId("identity-primary-contact").fill("Sarah Whitfield");
  await page.getByTestId("identity-submit").click();

  // Identity submitted → agent now emits a requirements card + upload card
  await expect(page.getByText(/here are the documents we will need/i)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Upload documents").first()).toBeVisible();
});
