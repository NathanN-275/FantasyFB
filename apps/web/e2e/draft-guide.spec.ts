import { expect, test } from "@playwright/test";

test("renders a versioned guide with evidence-backed player links and honest gaps", async ({
  page
}) => {
  await page.goto("/draft-guide");

  await expect(page.getByRole("heading", { name: "2026 draft field manual" })).toBeVisible();
  await expect(page.getByText("PUBLIC DEMO · SYNTHETIC SAMPLE DATA").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Claims with receipts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sleepers" })).toBeVisible();
  await expect(page.getByText("NO VALIDATED CALLOUTS").first()).toBeVisible();

  await expect(page.getByRole("link", { name: "Rowan Price" }).first()).toBeVisible();

  await expect(
    page.getByRole("table", {
      name: "Traceable datasets and editorial inputs used in this guide build"
    })
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "sample-adp-2026.12", exact: true })).toBeVisible();
});

test("provides printable and mobile navigation views", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/draft-guide");

  await expect(
    page.getByRole("navigation", { name: "Position strategy navigation" })
  ).toBeVisible();
  await page.getByRole("link", { name: "Open printable view" }).click();

  await expect(page).toHaveURL(/view=print/);
  await expect(page.getByRole("link", { name: "Return to web guide" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Before the clock starts" })).toBeVisible();
});
