import { defineConfig, devices } from "@playwright/test";

const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const authStatePath = "playwright/.auth/user.json";

/** В CI без RUN_E2E=1 не подключаем тяжёлые демо-спеки — иначе Playwright откроет браузер до test.skip(). */
const skipDemoSpecsInCi = process.env.CI === "true" && process.env.RUN_E2E !== "1";

/**
 * Браузерный сценарий защиты: поднимите фронт (`npm run dev`) и бэкенд при необходимости.
 *
 * В GitHub Actions: задайте `RUN_E2E=1` и `npx playwright install chromium`, иначе файл
 * `demo-defense-flow.spec.ts` игнорируется. Локально (без `CI=true`) сценарий всегда в списке.
 */
export default defineConfig({
  testDir: "e2e",
  testIgnore: skipDemoSpecsInCi ? /(demo-defense-flow|jury-scenarios-smoke)\.spec\.ts$/ : undefined,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    viewport: { width: 1400, height: 900 },
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "setup-auth",
      testMatch: /.*auth\.setup\.ts/
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /.*auth\.setup\.ts/
    },
    {
      name: "chromium-auth-quick",
      testMatch: /.*jury-scenarios-quick\.spec\.ts/,
      dependencies: ["setup-auth"],
      use: { ...devices["Desktop Chrome"], storageState: authStatePath }
    }
  ]
});
