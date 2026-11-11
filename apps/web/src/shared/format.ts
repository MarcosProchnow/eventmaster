const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" });
const shortDateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** A API trabalha com centavos inteiros; a conversão para reais é só de exibição. */
export const formatMoney = (cents: number) => (cents === 0 ? "Gratuito" : money.format(cents / 100));
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatShortDateTime = (iso: string) => shortDateTime.format(new Date(iso));

/** Valor de `<input type="datetime-local">` (hora local) para ISO 8601 em UTC. */
export const localInputToIso = (value: string) => new Date(value).toISOString();

/** ISO 8601 para o formato de `<input type="datetime-local">`, em hora local. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
