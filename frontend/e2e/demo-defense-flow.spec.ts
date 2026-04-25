import { expect, test } from "@playwright/test";

const demoEmail = process.env.PLAYWRIGHT_DEMO_EMAIL ?? "manager@drivee.local";
const demoPassword = process.env.PLAYWRIGHT_DEMO_PASSWORD ?? "demo123";
const requireRuntimeBadges = process.env.RUN_E2E === "1";

/**
 * В CI без RUN_E2E=1 этот файл исключается в `playwright.config.ts` (без лишнего запуска браузера).
 */
test("защита: приложение → логин → notebook → demo query → таблица, график, trace, инсайт + скриншоты", async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);

  await page.goto("/");
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Вход в систему/i })).toBeVisible();

  await page.locator("#login-email").fill(demoEmail);
  await page.locator("#login-password").fill(demoPassword);
  await page.getByRole("button", { name: "Войти" }).click();

  await page.waitForURL(/\/notebooks(\/)?$/);

  await page.goto("/notebooks/ops-health");
  await expect(page.getByRole("heading", { level: 1, name: /Сценарий ops-health/i })).toBeVisible({
    timeout: 60_000
  });

  const prompt = "Покажи топ-3 города по количеству отменённых заказов на этой неделе";
  await page.getByTestId("notebook-prompt-input").fill(prompt);
  await page.getByTestId("notebook-submit-prompt").click();

  await expect(page.getByTestId("notebook-submit-prompt")).toBeEnabled({ timeout: 90_000 });

  const table = page.getByTestId("notebook-result-table").locator("table");
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(table.locator("tbody tr").first()).toBeVisible();
  expect(await table.locator("tbody tr").count()).toBeGreaterThanOrEqual(1);

  const chartSection = page.getByTestId("notebook-result-chart");
  await expect(chartSection).toBeVisible();
  await expect(chartSection.locator(".recharts-wrapper").first()).toBeVisible({ timeout: 15_000 });

  const tracePanel = page.getByTestId("notebook-trace-panel");
  await expect(tracePanel.getByText("Трассировка запроса", { exact: true })).toBeVisible();
  await expect(tracePanel.getByText("Прозрачность pipeline", { exact: true })).toBeVisible();

  // Runtime mode badges from /health/runtime.
  // В режиме RUN_E2E=1 считаем их обязательным контрактом демо-стенда.
  const runtimeEnvBadge = page.getByTestId("runtime-env-badge");
  const runtimeSqlBadge = page.getByTestId("runtime-sql-mode-badge");
  const runtimeAuthBadge = page.getByTestId("runtime-auth-mode-badge");
  if (requireRuntimeBadges) {
    await expect(runtimeEnvBadge).toBeVisible();
    await expect(runtimeEnvBadge).toContainText("env:");
    await expect(runtimeSqlBadge).toBeVisible();
    await expect(runtimeSqlBadge).toContainText("sql:");
    await expect(runtimeAuthBadge).toBeVisible();
    await expect(runtimeAuthBadge).toContainText("auth:");
  } else if (await runtimeEnvBadge.count()) {
    await expect(runtimeEnvBadge).toBeVisible();
    await expect(runtimeEnvBadge).toContainText("env:");
    await expect(runtimeSqlBadge).toBeVisible();
    await expect(runtimeSqlBadge).toContainText("sql:");
    await expect(runtimeAuthBadge).toBeVisible();
    await expect(runtimeAuthBadge).toContainText("auth:");
  }

  const insight = page.getByTestId("notebook-result-insight");
  await expect(insight).toBeVisible();
  await expect(insight.getByText("Инсайт", { exact: true })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("demo-defense-fullpage.png"), fullPage: true });
  await tracePanel.screenshot({ path: testInfo.outputPath("demo-defense-trace-panel.png") });
  await table.screenshot({ path: testInfo.outputPath("demo-defense-table.png") });
});
