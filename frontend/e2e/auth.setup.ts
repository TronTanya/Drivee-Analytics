import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const demoEmail = process.env.PLAYWRIGHT_DEMO_EMAIL ?? "manager@drivee.local";
const demoPassword = process.env.PLAYWRIGHT_DEMO_PASSWORD ?? "demo123";
const authDir = path.resolve(process.cwd(), "playwright/.auth");
const authFile = path.join(authDir, "user.json");

test("setup auth state for quick jury e2e", async ({ page }) => {
  test.setTimeout(60_000);
  fs.mkdirSync(authDir, { recursive: true });

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Вход в ваш workspace/i })).toBeVisible();
  await page.locator("#login-email").fill(demoEmail);
  await page.locator("#login-password").fill(demoPassword);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(/\/notebooks(\/)?$/);

  await page.context().storageState({ path: authFile });
});
