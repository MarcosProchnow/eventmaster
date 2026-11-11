import { BusinessRuleError } from "../../../shared/errors.ts";

export type EventStatus = "draft" | "published" | "cancelled";

export interface Event {
  id: string;
  organizerId: string;
  title: string;
  description: string;
  venue: string;
  city: string;
  startsAt: Date;
  endsAt: Date;
  status: EventStatus;
  createdAt: Date;
}

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  priceCents: number;
  quantity: number;
  sold: number;
}

/** Regras puras do domínio: sem banco, sem HTTP. */

export function assertValidPeriod(startsAt: Date, endsAt: Date): void {
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new BusinessRuleError("O evento deve terminar depois de começar");
  }
}

export function assertEditable(event: Event): void {
  if (event.status === "cancelled") {
    throw new BusinessRuleError("Evento cancelado não pode ser alterado");
  }
}

export function assertCanPublish(event: Event, ticketTypeCount: number, now: Date): void {
  if (event.status !== "draft") {
    throw new BusinessRuleError("Apenas eventos em rascunho podem ser publicados");
  }
  if (ticketTypeCount === 0) {
    throw new BusinessRuleError("Defina ao menos um tipo de ingresso antes de publicar");
  }
  if (event.startsAt.getTime() <= now.getTime()) {
    throw new BusinessRuleError("Não é possível publicar um evento que já começou");
  }
}

export function assertCanCancel(event: Event): void {
  if (event.status === "cancelled") {
    throw new BusinessRuleError("Evento já está cancelado");
  }
}
