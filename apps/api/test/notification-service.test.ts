import { beforeEach, describe, expect, it } from "vitest";
import { NotificationService } from "../src/modules/notifications/application/notification-service.ts";
import type {
  Mailer,
  NotificationLog,
} from "../src/modules/notifications/application/ports.ts";
import { buildEmail } from "../src/modules/notifications/domain/templates.ts";

class FakeMailer implements Mailer {
  sent: { to: string; subject: string; text: string }[] = [];
  failures = 0;
  async send(message: { to: string; subject: string; text: string }) {
    if (this.failures > 0) {
      this.failures--;
      throw new Error("SMTP fora do ar");
    }
    this.sent.push(message);
  }
}

class FakeLog implements NotificationLog {
  status = new Map<string, "pending" | "sent" | "failed">();
  async begin(entry: { outboxId: string }) {
    if (this.status.get(entry.outboxId) === "sent") return "already_sent" as const;
    this.status.set(entry.outboxId, "pending");
    return "pending" as const;
  }
  async markSent(outboxId: string) {
    this.status.set(outboxId, "sent");
  }
  async markFailed(outboxId: string) {
    if (this.status.get(outboxId) !== "sent") this.status.set(outboxId, "failed");
  }
}

const message = {
  outboxId: "evt-1",
  type: "order.paid",
  payload: { orderId: "pedido-1", userId: "user-1" },
};

let mailer: FakeMailer;
let log: FakeLog;
let service: NotificationService;

beforeEach(() => {
  mailer = new FakeMailer();
  log = new FakeLog();
  service = new NotificationService({
    mailer,
    log,
    contacts: {
      find: async (id) => (id === "user-1" ? { name: "Ana", email: "ana@example.com" } : null),
    },
    webOrigin: "https://eventmaster.example",
  });
});

describe("NotificationService", () => {
  it("envia o e-mail de confirmação com o link do pedido", async () => {
    expect(await service.handle(message)).toBe("sent");
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: "ana@example.com" });
    expect(mailer.sent[0]!.subject).toContain("confirmado");
    expect(mailer.sent[0]!.text).toContain("Olá, Ana.");
    expect(mailer.sent[0]!.text).toContain("https://eventmaster.example/pedidos/pedido-1");
    expect(log.status.get("evt-1")).toBe("sent");
  });

  it("o mesmo evento entregue duas vezes gera um único e-mail", async () => {
    await service.handle(message);
    expect(await service.handle(message)).toBe("already_sent");
    expect(mailer.sent).toHaveLength(1);
  });

  it("falha de envio sobe o erro (a fila tenta de novo) e a nova tentativa entrega", async () => {
    mailer.failures = 2;
    await expect(service.handle(message)).rejects.toThrow("SMTP fora do ar");
    await expect(service.handle(message)).rejects.toThrow();
    expect(log.status.get("evt-1")).toBe("pending");
    expect(await service.handle(message)).toBe("sent");
    expect(mailer.sent).toHaveLength(1);
  });

  it("ignora tipo sem modelo, usuário inexistente e payload malformado", async () => {
    expect(await service.handle({ ...message, type: "tipo.desconhecido" })).toBe("skipped");
    expect(
      await service.handle({ ...message, payload: { orderId: "p", userId: "sumiu" } }),
    ).toBe("skipped");
    expect(await service.handle({ ...message, payload: {} })).toBe("skipped");
    expect(mailer.sent).toHaveLength(0);
  });

  it("dead-letter marca como falha, mas não rebaixa e-mail já entregue", async () => {
    mailer.failures = 1;
    await service.handle(message).catch(() => undefined);
    await service.markDead(message);
    expect(log.status.get("evt-1")).toBe("failed");

    await service.handle({ ...message, outboxId: "evt-2" });
    await service.markDead({ ...message, outboxId: "evt-2" });
    expect(log.status.get("evt-2")).toBe("sent");
  });
});

describe("modelos de e-mail", () => {
  it("há um modelo para cada evento de domínio", () => {
    const ctx = { userName: "Ana", orderUrl: "https://x.example/pedidos/1" };
    for (const type of ["order.paid", "order.cancelled", "order.expired", "payment.refunded"]) {
      const email = buildEmail(type, ctx);
      expect(email?.subject.length).toBeGreaterThan(5);
      expect(email?.text).toContain(ctx.orderUrl);
    }
    expect(buildEmail("outro", ctx)).toBeNull();
  });
});
