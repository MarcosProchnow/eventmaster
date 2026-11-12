/**
 * Jornada completa no navegador, com API, banco e front reais:
 * organizador cria e publica um evento; participante encontra, reserva,
 * paga (sandbox) e recebe os ingressos com QR code.
 */
import { expect, test } from "@playwright/test";
import { approvePayment, expectNoA11yViolations, localDateTime, newUser, signUp } from "../support/helpers";

test.describe.configure({ mode: "serial" });

const title = `Noite de Choro ${Date.now().toString(36)}`;

test("organizador cria, configura e publica um evento", async ({ page }) => {
  await signUp(page, newUser("Olga"), "organizer");
  await expect(page.getByRole("heading", { name: "Meus eventos" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: "Novo evento" }).click();
  await page.getByLabel("Título").fill(title);
  await page.getByLabel("Descrição").fill("Roda de choro com convidados.");
  await page.getByLabel("Local").fill("Teatro Guaíra");
  await page.getByLabel("Cidade").fill("Curitiba");
  await page.getByLabel("Início").fill(localDateTime(30, 20));
  await page.getByLabel("Término").fill(localDateTime(30, 23));
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "Criar rascunho" }).click();

  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("Rascunho")).toBeVisible();

  await page.getByLabel("Nome").fill("Pista");
  await page.getByLabel("Preço (R$)").fill("80");
  await page.getByLabel("Quantidade").fill("50");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByRole("cell", { name: "Pista" })).toBeVisible();

  await page.getByRole("button", { name: "Publicar evento" }).click();
  await expect(page.getByText("Publicado", { exact: true })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("participante encontra o evento, compra e recebe os ingressos", async ({ page, request }) => {
  await signUp(page, newUser("Ana"), "attendee");
  await expect(page.getByRole("heading", { name: "Eventos" })).toBeVisible();

  await page.getByLabel("Buscar por nome").fill(title);
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByRole("link", { name: new RegExp(title) }).click();

  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const add = page.getByRole("button", { name: "Adicionar um ingresso Pista" });
  await add.click();
  await add.click();
  await expect(page.getByText("R$ 160,00")).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Reservar ingressos" }).click();
  await expect(page).toHaveURL(/\/pedidos\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Aguardando pagamento")).toBeVisible();
  const orderId = page.url().split("/").pop()!;

  await page.getByRole("button", { name: /^Pagar/ }).click();
  await expect(page.getByText("Pix copia e cola")).toBeVisible();
  await expectNoA11yViolations(page);

  await approvePayment(request, orderId);

  // A página consulta o pedido a cada 4 s enquanto aguarda o pagamento.
  await expect(page.getByText("Pago", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("img", { name: "QR code do ingresso 1" })).toBeVisible();
  await expect(page.getByRole("img", { name: "QR code do ingresso 2" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: "Meus pedidos" }).click();
  await expect(page.getByText("2 ingressos · R$ 160,00")).toBeVisible();
});
