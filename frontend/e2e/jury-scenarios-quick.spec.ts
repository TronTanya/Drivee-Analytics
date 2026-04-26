import { expect, test } from "@playwright/test";

/** Локальные demo-ноутбуки: id с префиксом `demo-` (см. `isLocalDemoNotebook` в notebooks/[id]/page.tsx). */
const DEMO_NOTEBOOK = "/notebooks/demo-jury-e2e-quick";

test("jury-mode quick: страница сценариев и демо trace_explainability", async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto("/scenarios");
  await expect(page.getByRole("heading", { name: /^Сценарии$/ })).toBeVisible();

  await page.goto(`${DEMO_NOTEBOOK}?demo_case=trace_explainability`);
  await expect(page).toHaveURL(/demo_case=trace_explainability/);
  await expect(page.getByTestId("notebook-trace-panel").first()).toBeVisible({ timeout: 60_000 });
});
