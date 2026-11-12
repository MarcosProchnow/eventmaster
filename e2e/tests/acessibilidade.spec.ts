/** Páginas públicas, inclusive com mensagens de erro na tela, e navegação por teclado. */
import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "../support/helpers";

test("lista de eventos, login e cadastro sem violações WCAG (também com erros de validação)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Eventos" })).toBeVisible();
  await expectNoA11yViolations(page);

  for (const [path, button] of [
    ["/entrar", "Entrar"],
    ["/cadastro", "Criar conta"],
  ] as const) {
    await page.goto(path);
    await page.getByRole("button", { name: button }).click();
    await expect(page.getByText("Informe um e-mail válido")).toBeVisible();
    await expectNoA11yViolations(page);
  }
});

test("o primeiro Tab leva ao link de pular para o conteúdo", async ({ page }) => {
  await page.goto("/entrar");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
});
