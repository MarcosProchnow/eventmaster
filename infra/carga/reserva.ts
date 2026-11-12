/**
 * Teste de carga da reserva (RNF03: p95 < 300 ms com 50 requisições concorrentes).
 *
 *   docker compose --profile app up -d --build --wait
 *   node infra/carga/reserva.ts                     # BASE_URL=http://localhost:8080 TOTAL=1000 CONCORRENCIA=50
 *
 * Cria um organizador, um evento publicado com um único tipo de ingresso e um
 * participante; depois dispara TOTAL reservas de 1 ingresso, CONCORRENCIA por vez,
 * por padrão todas no MESMO tipo de ingresso. É o pior caso: cada reserva trava a mesma linha
 * (`SELECT ... FOR UPDATE`, ADR 0006), então as transações fazem fila no banco.
 * No fim confere que o estoque vendido é igual ao número de pedidos criados (RNF01).
 */
const BASE = process.env.BASE_URL ?? "http://localhost:8080";
const TOTAL = Number(process.env.TOTAL ?? 1000);
const CONCURRENCY = Number(process.env.CONCORRENCIA ?? 50);
// TIPOS > 1 espalha as reservas por vários tipos de ingresso (sem disputa pela mesma trava).
const TYPES = Number(process.env.TIPOS ?? 1);
const run = Date.now().toString(36);

type Cookies = Map<string, string>;

async function request(method: string, path: string, cookies: Cookies | null, body?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      origin: new URL(BASE).origin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookies ? { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const c of response.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const [name, value] = pair!.split("=");
    cookies?.set(name!, value!);
  }
  return response;
}

async function ok(response: Response, what: string) {
  if (!response.ok) throw new Error(`${what}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function signUp(role: "organizer" | "attendee") {
  const cookies: Cookies = new Map();
  const email = `carga-${role}-${run}@example.com`;
  await ok(await request("POST", "/v1/auth/register", cookies, { name: `Carga ${role}`, email, password: "senha-do-teste-de-carga", role }), "cadastro");
  return cookies;
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;

// ---------- preparação ----------
const organizer = await signUp("organizer");
const day = 86_400_000;
const event = await ok(
  await request("POST", "/v1/events", organizer, {
    title: `Evento de carga ${run}`,
    description: "Gerado pelo teste de carga.",
    venue: "Arena",
    city: "Curitiba",
    startsAt: new Date(Date.now() + 60 * day).toISOString(),
    endsAt: new Date(Date.now() + 60 * day + 3 * 3_600_000).toISOString(),
  }),
  "criar evento",
);
const ticketTypes: { id: string }[] = [];
for (let i = 0; i < TYPES; i += 1) {
  ticketTypes.push(
    await ok(
      await request("POST", `/v1/events/${event.id}/ticket-types`, organizer, { name: `Setor ${i + 1}`, priceCents: 5000, quantity: TOTAL * 2 }),
      "criar tipo de ingresso",
    ),
  );
}
await ok(await request("POST", `/v1/events/${event.id}/publish`, organizer, {}), "publicar");
const attendee = await signUp("attendee");

let counter = 0;
const reserve = async () => {
  const ticketType = ticketTypes[counter++ % TYPES]!;
  const started = performance.now();
  const response = await request(
    "POST",
    `/v1/events/${event.id}/orders`,
    attendee,
    { items: [{ ticketTypeId: ticketType.id, quantity: 1 }] },
    { "idempotency-key": crypto.randomUUID() },
  );
  await response.arrayBuffer();
  return { ms: performance.now() - started, status: response.status };
};

// Aquecimento (conexões, JIT, cache de planos do Postgres): fora da medição.
for (let i = 0; i < 20; i += 1) await reserve();

// ---------- medição ----------
const results: { ms: number; status: number }[] = [];
let next = 0;
const startedAt = performance.now();
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < TOTAL) {
      next += 1;
      results.push(await reserve());
    }
  }),
);
const seconds = (performance.now() - startedAt) / 1000;

const latencies = results.map((r) => r.ms).toSorted((a, b) => a - b);
const statuses = Object.groupBy(results, (r) => String(r.status));
const types = await ok(await request("GET", `/v1/events/${event.id}/ticket-types`, null), "estoque");
const sold = types.reduce((sum: number, t: { quantity: number; available: number }) => sum + t.quantity - t.available, 0);
const created = (statuses["201"]?.length ?? 0) + 20; // + aquecimento

const p95 = percentile(latencies, 95);
console.log(
  JSON.stringify(
    {
      alvo: BASE,
      reservas: TOTAL,
      concorrencia: CONCURRENCY,
      tiposDeIngresso: TYPES,
      duracaoSegundos: Number(seconds.toFixed(1)),
      reservasPorSegundo: Math.round(TOTAL / seconds),
      latenciaMs: Object.fromEntries(
        [["p50", 50], ["p95", 95], ["p99", 99], ["max", 100]].map(([k, p]) => [k, Number(percentile(latencies, p as number).toFixed(1))]),
      ),
      status: Object.fromEntries(Object.entries(statuses).map(([k, v]) => [k, v!.length])),
      estoque: { vendidos: sold, pedidosCriados: created, consistente: sold === created },
      rnf03: p95 < 300 ? `atende (p95 ${p95.toFixed(0)} ms < 300 ms)` : `NÃO atende (p95 ${p95.toFixed(0)} ms)`,
    },
    null,
    2,
  ),
);
if (sold !== created) process.exitCode = 1;
