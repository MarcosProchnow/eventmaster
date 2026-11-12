import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import pg from "pg";
import { API_URL, DATABASE_URL, WEBHOOK_SECRET } from "../env";

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

export function newUser(name: string): TestUser {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return { name, email: `${name.toLowerCase()}-${id}@example.com`, password: "senha-de-teste-e2e" };
}

export async function signUp(page: Page, user: TestUser, role: "attendee" | "organizer") {
  await page.goto("/cadastro");
  await page.getByLabel("Nome").fill(user.name);
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel(/^Senha/).fill(user.password);
  if (role === "organizer") await page.getByLabel("Organizar eventos").check();
  await page.getByRole("button", { name: "Criar conta" }).click();
}

/**
 * Acessibilidade automática (axe-core) contra WCAG 2.1 A e AA. Pega parte dos
 * problemas (contraste, rótulos, ARIA, estrutura); não substitui teste manual
 * com teclado e leitor de tela.
 */
export async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary, "violações de acessibilidade").toEqual([]);
}

/** Valor de `<input type="datetime-local">` daqui a `days` dias, às `hour`h. */
export function localDateTime(days: number, hour: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`;
}

/**
 * Faz o papel do gateway: aprova o pagamento pendente do pedido enviando o
 * webhook assinado. O `providerRef` é o identificador do lado do gateway e não
 * é exposto ao cliente; por isso o teste o lê do banco.
 */
export async function approvePayment(request: APIRequestContext, orderId: string) {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  let providerRef: string | undefined;
  try {
    const { rows } = await client.query<{ provider_ref: string }>(
      "select provider_ref from payments.payments where order_id = $1 and status = 'pending'",
      [orderId],
    );
    providerRef = rows[0]?.provider_ref;
  } finally {
    await client.end();
  }
  expect(providerRef, "pagamento pendente do pedido").toBeTruthy();

  const body = JSON.stringify({ providerRef, status: "approved" });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest("hex");
  const response = await request.post(`${API_URL}/v1/webhooks/payments`, {
    headers: {
      "content-type": "application/json",
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": signature,
    },
    data: body,
  });
  expect(response.ok(), await response.text()).toBe(true);
}
