import { expect, test } from "@playwright/test";

test("shows the public sample-data label", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("PUBLIC DEMO · SAMPLE DATA ONLY", { exact: true })).toBeVisible();
});

test("exposes the complete public demo without private records", async ({ page }) => {
  await page.goto("/features");
  await expect(page.getByRole("heading", { name: "See the whole board." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open sample" })).toHaveCount(6);
  await expect(page.getByText("Sample means sample.")).toBeVisible();

  await page.goto("/league-demo");
  await expect(page.getByRole("heading", { name: "Harbor City Home League" })).toBeVisible();
  await expect(page.getByText("Synthetic sample standings")).toBeVisible();

  await page.goto("/rankings");
  await expect(page.getByRole("heading", { name: "Sample rankings" })).toBeVisible();

  await page.goto("/about");
  await expect(page.getByText("Architecture overview", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "public GitHub repository" })).toBeVisible();
});
