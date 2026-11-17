import { describe, expect, it } from "vitest";
import type { Event, TicketType } from "../src/modules/events/domain/event.ts";
import { planReservation } from "../src/modules/orders/domain/order.ts";
import { decideSettlement } from "../src/modules/payments/domain/payment.ts";
import {
  HmacWebhookVerifier,
  signWebhook,
} from "../src/modules/payments/infra/hmac-webhook-verifier.ts";
import { SandboxPaymentGateway } from "../src/modules/payments/infra/sandbox-gateway.ts";
import { BusinessRuleError, ConflictError, NotFoundError } from "../src/shared/errors.ts";

const NOW = new Date("2026-11-11T12:00:00Z");
const event: Event = {
  id: "e1",
  organizerId: "o1",
  title: "Show",
  description: "",
  venue: "Arena",
  city: "Curitiba",
  startsAt: new Date("2027-01-01T20:00:00Z"),
  endsAt: new Date("2027-01-01T23:00:00Z"),
  status: "published",
  createdAt: NOW,
};
const geral: TicketType = { id: "t1", eventId: "e1", name: "Geral", priceCents: 5000, quantity: 10, sold: 8 };
const vip: TicketType = { id: "t2", eventId: "e1", name: "VIP", priceCents: 20000, quantity: 5, sold: 0 };
const plan = (items: { ticketTypeId: string; quantity: number }[], overrides = {}) =>
  planReservation({
    event,
    ticketTypes: [geral, vip],
    items,
    now: NOW,
    activeReservations: 0,
    maxActiveReservations: 3,
    ...overrides,
  });

describe("planReservation", () => {
  it("calcula itens e total com o preço do momento da reserva", () => {
    const result = plan([
      { ticketTypeId: "t1", quantity: 2 },
      { ticketTypeId: "t2", quantity: 1 },
    ]);
    expect(result.totalCents).toBe(2 * 5000 + 20000);
    expect(result.items[0]).toEqual({ ticketTypeId: "t1", quantity: 2, unitPriceCents: 5000 });
  });

  it("recusa quando não há estoque suficiente", () => {
    expect(() => plan([{ ticketTypeId: "t1", quantity: 3 }])).toThrow(ConflictError);
  });

  it("trata evento inexistente, rascunho ou cancelado como não encontrado", () => {
    const item = [{ ticketTypeId: "t1", quantity: 1 }];
    expect(() => plan(item, { event: null })).toThrow(NotFoundError);
    expect(() => plan(item, { event: { ...event, status: "draft" } })).toThrow(NotFoundError);
    expect(() => plan(item, { event: { ...event, status: "cancelled" } })).toThrow(NotFoundError);
  });

  it("recusa evento que já começou", () => {
    expect(() =>
      plan([{ ticketTypeId: "t1", quantity: 1 }], { now: new Date("2027-01-01T20:00:00Z") }),
    ).toThrow(BusinessRuleError);
  });

  it("recusa quando a pessoa já tem o máximo de reservas ativas no evento", () => {
    const items = [{ ticketTypeId: "t2", quantity: 1 }];
    expect(plan(items, { activeReservations: 2 }).items).toHaveLength(1);
    expect(() => plan(items, { activeReservations: 3 })).toThrow(/3 reservas/);
    expect(() => plan(items, { activeReservations: 1, maxActiveReservations: 1 })).toThrow(BusinessRuleError);
  });

  it("recusa tipo de outro evento, tipo repetido, pedido vazio e acima do limite", () => {
    const alheio: TicketType = { ...vip, id: "t9", eventId: "outro" };
    expect(() =>
      plan([{ ticketTypeId: "t9", quantity: 1 }], { ticketTypes: [alheio] }),
    ).toThrow(BusinessRuleError);
    expect(() => plan([{ ticketTypeId: "inexistente", quantity: 1 }])).toThrow(BusinessRuleError);
    expect(() =>
      plan([
        { ticketTypeId: "t2", quantity: 1 },
        { ticketTypeId: "t2", quantity: 1 },
      ]),
    ).toThrow(BusinessRuleError);
    expect(() => plan([])).toThrow(BusinessRuleError);
    expect(() => plan([{ ticketTypeId: "t2", quantity: 11 }])).toThrow(BusinessRuleError);
    expect(() => plan([{ ticketTypeId: "t2", quantity: 0 }])).toThrow(BusinessRuleError);
  });
});

describe("decideSettlement", () => {
  it("cobre todas as combinações", () => {
    expect(decideSettlement("pending", "reserved", "approved")).toBe("confirm");
    expect(decideSettlement("pending", "expired", "approved")).toBe("refund");
    expect(decideSettlement("pending", "cancelled", "approved")).toBe("refund");
    expect(decideSettlement("pending", "reserved", "declined")).toBe("cancel_order");
    expect(decideSettlement("pending", "expired", "declined")).toBe("mark_declined");
    expect(decideSettlement("approved", "paid", "approved")).toBe("ignore");
    expect(decideSettlement("approved", "paid", "declined")).toBe("ignore");
    expect(decideSettlement("declined", "cancelled", "approved")).toBe("ignore");
  });
});

describe("assinatura do webhook", () => {
  const secret = "segredo-de-teste-com-mais-de-32-caracteres";
  const verifier = new HmacWebhookVerifier(secret, () => NOW);
  const ts = String(Math.floor(NOW.getTime() / 1000));
  const body = '{"providerRef":"sbx_1","status":"approved"}';

  it("aceita assinatura correta e recente", () => {
    expect(verifier.verify(body, ts, signWebhook(secret, ts, body))).toBe(true);
  });

  it("recusa corpo alterado, segredo errado, cabeçalhos ausentes e aviso antigo", () => {
    const signature = signWebhook(secret, ts, body);
    expect(verifier.verify(body.replace("approved", "declined"), ts, signature)).toBe(false);
    expect(verifier.verify(body, ts, signWebhook("outro-segredo", ts, body))).toBe(false);
    expect(verifier.verify(body, ts, undefined)).toBe(false);
    expect(verifier.verify(body, undefined, signature)).toBe(false);
    expect(verifier.verify(body, ts, "nao-e-hex")).toBe(false);
    const old = String(Number(ts) - 3600);
    expect(verifier.verify(body, old, signWebhook(secret, old, body))).toBe(false);
  });
});

describe("gateway sandbox (Strategy por método)", () => {
  it("devolve instruções diferentes para cada forma de pagamento", async () => {
    const gateway = new SandboxPaymentGateway(() => NOW);
    const charge = { orderId: "o1", amountCents: 1000 };
    const pix = await gateway.createCharge({ ...charge, method: "pix" });
    const boleto = await gateway.createCharge({ ...charge, method: "boleto" });
    const card = await gateway.createCharge({ ...charge, method: "card" });
    expect(pix.instructions.kind).toBe("pix");
    expect(boleto.instructions).toMatchObject({ kind: "boleto", dueDate: "2026-11-14" });
    expect(card.instructions.kind).toBe("card");
    expect(pix.providerRef).not.toBe(boleto.providerRef);
  });
});
