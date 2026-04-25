import { expect, test } from "@playwright/test";

const demoEmail = process.env.PLAYWRIGHT_DEMO_EMAIL ?? "manager@drivee.local";
const demoPassword = process.env.PLAYWRIGHT_DEMO_PASSWORD ?? "demo123";

/**
 * Полный демо-поток: notebook → NL → артефакты → сохранение отчёта → расписание на /reports.
 * В CI без RUN_E2E=1 файл исключается в playwright.config.ts.
 */
test("demo-flow: notebook → выручка по городам → SQL, таблица, график, trace → отчёт → расписание", async ({
  page
}) => {
  test.setTimeout(180_000);

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

  const prompt = "Покажи выручку по городам за прошлую неделю";
  await page.getByTestId("notebook-prompt-input").fill(prompt);
  await page.getByTestId("notebook-submit-prompt").click();
  // Кнопка снова disabled при пустом композере — ждём артефакты ответа, а не enabled у submit.
  await expect(page.getByText("Предпросмотр SQL", { exact: false }).first()).toBeVisible({ timeout: 90_000 });
  await expect(page.locator("pre code").first()).toContainText(/SELECT/i, { timeout: 30_000 });

  const table = page.getByTestId("notebook-result-table").locator("table");
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(table.locator("tbody tr").first()).toBeVisible();

  const chartSection = page.getByTestId("notebook-result-chart").last();
  await expect(chartSection).toBeVisible();
  await expect(chartSection.locator(".recharts-wrapper").first()).toBeVisible({ timeout: 20_000 });

  const tracePanel = page.getByTestId("notebook-trace-panel").first();
  await expect(tracePanel.getByText("Трассировка запроса", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Открыть explainability trace" })).toBeVisible();

  await page.getByRole("button", { name: "Сохранить отчёт" }).click();
  await expect(page.getByText(/Отчет сохранен/i)).toBeVisible({ timeout: 45_000 });

  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: /Отчеты и сценарии/i })).toBeVisible({ timeout: 30_000 });

  const scheduleBtn = page.getByRole("button", { name: "Изменить расписание" }).first();
  await expect(scheduleBtn).toBeVisible({ timeout: 30_000 });
  await scheduleBtn.click();

  await expect(page.getByText(/Расписание отчёта/i)).toBeVisible({ timeout: 45_000 });
});
