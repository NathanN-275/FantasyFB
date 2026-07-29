import { expect, test } from "@playwright/test";

test("analyzes a multi-player fixture and explains roster effects", async ({ page }) => {
  await page.goto("/trade-demo");

  await expect(page.getByRole("heading", { name: "Trade lab" })).toBeVisible();
  await expect(page.getByText("PUBLIC DEMO · SYNTHETIC FIXTURE DATA ONLY")).toBeVisible();
  await expect(
    page.getByText("No league selected—generic configurable assumptions are active.")
  ).toBeVisible();

  await page.getByLabel("Include Owen Hart from SIDE A SENDS").check();
  await page.getByRole("button", { name: "Analyze selected packages" }).click();

  await expect(page.getByText("2-player package").first()).toBeVisible();
  await page.getByText("Position, bench, and replacement details").first().click();
  await expect(page.getByText("Replacements added: 1.").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "What changes—and why" })).toBeVisible();
  await expect(page.getByText(/does not declare fairness/)).toBeVisible();
});
