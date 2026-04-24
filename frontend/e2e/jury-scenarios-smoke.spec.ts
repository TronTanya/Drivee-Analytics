import { expect, test } from "@playwright/test";

const demoEmail = process.env.PLAYWRIGHT_DEMO_EMAIL ?? "manager@drivee.local";
const demoPassword = process.env.PLAYWRIGHT_DEMO_PASSWORD ?? "demo123";

test("jury-mode: 5 сценариев открываются и показывают ключевые маркеры", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Вход в ваш workspace/i })).toBeVisible();
  await page.locator("#login-email").fill(demoEmail);
  await page.locator("#login-password").fill(demoPassword);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(/\/notebooks(\/)?$/);

  await page.goto("/scenarios");

  const scenario1 = page.getByRole("link", { name: /Сценарий 1: RU запрос/i });
  const scenario2 = page.getByRole("link", { name: /Сценарий 2: Trace/i });
  const scenario3 = page.getByRole("link", { name: /Сценарий 3: Неоднозначность/i });
  const scenario4 = page.getByRole("link", { name: /Сценарий 4: Guardrails/i });
  const scenario5 = page.getByRole("link", { name: /Сценарий 5: Ограничения MVP/i });

  await expect(scenario1).toBeVisible();
  await expect(scenario2).toBeVisible();
  await expect(scenario3).toBeVisible();
  await expect(scenario4).toBeVisible();
  await expect(scenario5).toBeVisible();

  await scenario1.click();
  await expect(page).toHaveURL(/demo_case=ru_table_chart_insight_forecast/);
  await expect(page.getByText("Ограничения демо (честно)", { exact: true })).toBeVisible();
  await expect(page.getByTestId("notebook-trace-panel")).toBeVisible();

  await page.goto("/scenarios");
  await scenario2.click();
  await expect(page).toHaveURL(/demo_case=trace_explainability/);
  await expect(page.getByText("Прозрачность pipeline", { exact: true })).toBeVisible();

  await page.goto("/scenarios");
  await scenario3.click();
  await expect(page).toHaveURL(/demo_case=ambiguity_revenue/);
  await expect(page.getByText("Нужно уточнение")).toBeVisible({ timeout: 60_000 });

  await page.goto("/scenarios");
  await scenario4.click();
  await expect(page).toHaveURL(/demo_case=guardrails_long_prompt/);
  await expect(page.getByText("Запрос слишком длинный для безопасной обработки.")).toBeVisible({ timeout: 60_000 });

  await page.goto("/scenarios");
  await scenario5.click();
  await expect(page).toHaveURL(/demo_case=trace_explainability/);
  await expect(page.getByText("Ограничения демо (честно)", { exact: true })).toBeVisible();
});
