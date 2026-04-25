import { expect, test } from "@playwright/test";

const demoEmail = process.env.PLAYWRIGHT_DEMO_EMAIL ?? "manager@drivee.local";
const demoPassword = process.env.PLAYWRIGHT_DEMO_PASSWORD ?? "demo123";

/**
 * NL с DDL/DML: guardrails до SQL; при mock — заранее заглушенный ответ с blocked=true.
 * В CI без RUN_E2E=1 файл исключается в playwright.config.ts.
 */
test("dangerous-query: DROP TABLE блокируется, SQL не исполняется, показана причина", async ({ page }) => {
  test.setTimeout(120_000);

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

  await page.getByTestId("notebook-prompt-input").fill("DROP TABLE orders");
  await page.getByTestId("notebook-submit-prompt").click();
  // После отправки композер очищается — кнопка остаётся disabled из‑за пустого поля; ждём исход пайплайна.
  const blocked = page.getByTestId("notebook-guardrails-blocked");
  await expect(blocked).toBeVisible({ timeout: 90_000 });
  await expect(blocked).toContainText(/опасн|DDL|DML|запрещ|политик/i);

  await expect(page.locator("pre code").filter({ hasText: /^\s*DROP\s+TABLE\s+orders/i })).toHaveCount(0);
  await expect(page.getByTestId("notebook-result-table").locator("table")).toHaveCount(0);
});
