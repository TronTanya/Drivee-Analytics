import { expect, test } from "@playwright/test";

test("jury-mode quick: 5 сценариев доступны в авторизованной сессии", async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto("/scenarios");
  await expect(page.getByText("Режим показа жюри", { exact: true })).toBeVisible();

  await expect(page.getByRole("link", { name: /Сценарий 1: RU запрос/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Сценарий 2: Trace/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Сценарий 3: Неоднозначность/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Сценарий 4: Guardrails/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Сценарий 5: Ограничения MVP/i })).toBeVisible();

  await page.getByRole("link", { name: /Сценарий 2: Trace/i }).click();
  await expect(page).toHaveURL(/demo_case=trace_explainability/);
  await expect(page.getByTestId("notebook-trace-panel")).toBeVisible();
});
