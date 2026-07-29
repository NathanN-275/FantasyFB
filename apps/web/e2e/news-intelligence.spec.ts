import { expect, test } from "@playwright/test";

test("filters the synthetic news feed and keeps facts separate from interpretation", async ({
  page
}) => {
  await page.goto("/news");

  await expect(page.getByRole("heading", { name: "News intelligence" })).toBeVisible();
  await expect(page.getByText("Synthetic demonstration only")).toBeVisible();
  await expect(page.locator(".news-story")).toHaveCount(5);
  await expect(page.getByText("Reported facts").first()).toBeVisible();
  await expect(page.getByText("FantasyFB interpretation").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Read original article ↗" }).first()).toBeVisible();

  await page.getByLabel("Position").selectOption("QB");
  await page.getByRole("button", { name: "Apply filters" }).click();

  await expect(page).toHaveURL(/position=QB/);
  await expect(page.locator(".result-count")).toHaveText("2 stories");
  await expect(page.locator(".news-story")).toHaveCount(2);
});
