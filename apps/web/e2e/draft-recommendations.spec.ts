import { expect, test } from "@playwright/test";

test("explains recommendations and manages draft targets", async ({ page }) => {
  await page.goto("/draft-demo");

  await expect(page.getByRole("heading", { name: "Draft recommendations" })).toBeVisible();
  await expect(page.locator(".recommendation-card")).toHaveCount(6);
  await expect(page.getByText("No single hidden score decides the pick.")).toBeVisible();
  await expect(page.getByText("4 sims")).toBeVisible();

  const valueCard = page.locator(".recommendation-card").filter({ hasText: "Best overall value" });
  await valueCard.getByRole("button", { name: "Queue", exact: true }).click();
  await valueCard.getByRole("button", { name: "Watch", exact: true }).click();

  await expect(page.getByRole("region", { name: "Draft queue" })).toContainText("Marcus Reed");
  await expect(page.getByRole("region", { name: "Watchlist" })).toContainText("Marcus Reed");

  await page.getByLabel("Filter available players by position").selectOption("WR");
  const availablePlayers = page.getByRole("region", { name: "Available players" });
  await expect(availablePlayers.getByText("Theo Brooks")).toBeVisible();
  await expect(availablePlayers.getByText("Marcus Reed")).toHaveCount(0);
});
