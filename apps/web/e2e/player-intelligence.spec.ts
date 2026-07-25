import { expect, test } from "@playwright/test";

test("filters the semantic player directory and opens a complete profile", async ({ page }) => {
  await page.goto("/players");

  await expect(page.getByRole("heading", { name: "Player intelligence" })).toBeVisible();
  await expect(page.getByText("PUBLIC DEMO · SYNTHETIC SAMPLE DATA").first()).toBeVisible();
  await expect(page.getByRole("table", { name: /2026 player research board/ })).toBeVisible();

  await page.getByLabel("Position").selectOption("WR");
  await page.getByRole("button", { name: "Apply filters" }).click();

  await expect(page).toHaveURL(/position=WR/);
  await expect(page.locator(".result-count")).toHaveText("2 players");
  await expect(page.getByRole("link", { name: /Julian Knox/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Marcus Vale/ })).toHaveCount(0);

  await page.getByRole("link", { name: /Julian Knox/ }).click();
  await expect(page.getByRole("heading", { name: "Julian Knox", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Floor, median, ceiling" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Model versus market" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sources and freshness" })).toBeVisible();
  await expect(page.getByText("All expected research inputs are present")).toBeVisible();
});

test("uses editorial player cards on a draft-day mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/players");

  const card = page.locator(".player-card").first();
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: /Open full evaluation/ })).toBeVisible();
  await expect(page.locator(".player-table-wrap")).toBeHidden();
  await expect(page.locator(".filter-panel")).not.toHaveAttribute("open", "");
});
