import { expect, test } from "@playwright/test";

test("shows the public sample-data label", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("PUBLIC DEMO")).toBeVisible();
  await expect(page.getByText("sample data only")).toBeVisible();
});
