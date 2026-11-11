export interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

export interface NotificationLog {
  /** Registra a tentativa. `"already_sent"` se este evento já gerou um e-mail entregue. */
  begin(entry: { outboxId: string; userId: string; type: string }): Promise<"pending" | "already_sent">;
  markSent(outboxId: string): Promise<void>;
  markFailed(outboxId: string): Promise<void>;
}

export interface ContactDirectory {
  find(userId: string): Promise<{ name: string; email: string } | null>;
}

/** Evento de domínio saído do outbox, como trafega na fila. */
export interface OutboxMessage {
  outboxId: string;
  type: string;
  payload: Record<string, unknown>;
}
