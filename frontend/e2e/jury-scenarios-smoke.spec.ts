import { expect, test } from "@playwright/test";

const demoEmail = process.env.PLAYWRIGHT_DEMO_EMAIL ?? "manager@drivee.local";
const demoPassword = process.env.PLAYWRIGHT_DEMO_PASSWORD ?? "demo123";

/** Префикс `demo-` — клиентский демо-ноутбук без UUID в БД. */
const DEMO_NOTEBOOK = "/notebooks/demo-jury-e2e-smoke";

test("jury-mode: 5 сценариев открываются и показывают ключевые маркеры", async ({ page }) => {
  test.setTimeout(300_000);

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Вход в систему/i })).toBeVisible();
  await page.locator("#login-email").fill(demoEmail);
  await page.locator("#login-password").fill(demoPassword);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(/\/notebooks(\/)?$/);

  await page.goto("/scenarios");
  await expect(page.getByRole("heading", { name: /^Сценарии$/ })).toBeVisible();

  await page.goto(`${DEMO_NOTEBOOK}?demo_case=ru_table_chart_insight_forecast`);
  await expect(page).toHaveURL(/demo_case=ru_table_chart_insight_forecast/);
  await expect(page.getByTestId("notebook-trace-panel").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Прозрачность pipeline", { exact: true }).first()).toBeVisible({ timeout: 60_000 });

  await page.goto(`${DEMO_NOTEBOOK}?demo_case=trace_explainability`);
  await expect(page).toHaveURL(/demo_case=trace_explainability/);
  await expect(page.getByText("Прозрачность pipeline", { exact: true }).first()).toBeVisible({ timeout: 60_000 });

  await page.goto(`${DEMO_NOTEBOOK}?demo_case=ambiguity_revenue`);
  await expect(page).toHaveURL(/demo_case=ambiguity_revenue/);
  await expect(page.getByText("Нужно уточнение").first()).toBeVisible({ timeout: 60_000 });

  await page.goto(`${DEMO_NOTEBOOK}?demo_case=guardrails_long_prompt`);
  await expect(page).toHaveURL(/demo_case=guardrails_long_prompt/);
  await expect(
    page
      .locator("body")
      .getByText(/Запрос слишком длинный|Промпт слишком длинный|prompt_abuse|Ошибка запроса к pipeline:/i)
      .first()
  ).toBeVisible({ timeout: 60_000 });

  await page.goto(`${DEMO_NOTEBOOK}?demo_case=trace_explainability`);
  await expect(page).toHaveURL(/demo_case=trace_explainability/);
  await expect(page.getByTestId("notebook-trace-panel").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Прозрачность pipeline", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
});
