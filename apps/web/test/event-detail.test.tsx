import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { beforeEach, describe, expect, it } from "vitest";
import { formatMoney } from "../src/shared/format";
import { attendee, event, fullPrice, halfPrice, reservedOrder } from "./fixtures";
import { renderApp } from "./render";
import { apiError, server, signIn } from "./server";

let ticketTypeLoads = 0;

beforeEach(() => {
  ticketTypeLoads = 0;
  server.use(
    http.get("*/v1/events/:id", () => HttpResponse.json(event)),
    http.get("*/v1/events/:id/ticket-types", () => {
      ticketTypeLoads += 1;
      return HttpResponse.json([fullPrice, halfPrice]);
    }),
  );
});

const add = (name: string) => screen.getByRole("button", { name: `Adicionar um ingresso ${name}` });
const total = () => screen.getByText("Total").nextElementSibling;

describe("detalhe do evento e carrinho", () => {
  it("visitante vê os ingressos, mas precisa entrar para comprar", async () => {
    renderApp(`/eventos/${event.id}`);

    expect(await screen.findByRole("heading", { name: "Festival de Jazz" })).toBeInTheDocument();
    expect(await screen.findByText("Meia")).toBeInTheDocument();
    expect(screen.getByText(/restam 2/)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Entre para comprar" })).toBeInTheDocument();
  });

  it("calcula o total e respeita o estoque disponível", async () => {
    signIn(attendee);
    const { user } = renderApp(`/eventos/${event.id}`);
    await screen.findByText("Meia");

    await user.click(add("Inteira"));
    await user.click(add("Inteira"));
    await user.click(add("Meia"));
    await user.click(add("Meia"));

    expect(total()?.textContent).toBe(formatMoney(30_000));
    // Só restavam 2 meias.
    expect(add("Meia")).toBeDisabled();
  });

  it("limita a 10 ingressos por pedido", async () => {
    signIn(attendee);
    const { user } = renderApp(`/eventos/${event.id}`);
    await screen.findByText("Inteira");

    for (let i = 0; i < 10; i += 1) await user.click(add("Inteira"));

    expect(add("Inteira")).toBeDisabled();
    expect(total()?.textContent).toBe(formatMoney(100_000));
  });

  it("reserva com Idempotency-Key e abre o pedido", async () => {
    signIn(attendee);
    const sent: { key: string | null; body: unknown }[] = [];
    server.use(
      http.post("*/v1/events/:id/orders", async ({ request }) => {
        sent.push({ key: request.headers.get("idempotency-key"), body: await request.json() });
        return HttpResponse.json(reservedOrder, { status: 201 });
      }),
      http.get("*/v1/orders/:id", () => HttpResponse.json(reservedOrder)),
    );
    const { user } = renderApp(`/eventos/${event.id}`);
    await screen.findByText("Inteira");

    await user.click(add("Inteira"));
    await user.click(add("Inteira"));
    await user.click(add("Meia"));
    await user.click(screen.getByRole("button", { name: "Reservar ingressos" }));

    expect(await screen.findByRole("heading", { name: /Pedido 44444444/ })).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent[0]?.body).toEqual({
      items: [
        { ticketTypeId: fullPrice.id, quantity: 2 },
        { ticketTypeId: halfPrice.id, quantity: 1 },
      ],
    });
  });

  it("se o estoque acabou, mostra o erro e recarrega as quantidades", async () => {
    signIn(attendee);
    server.use(
      http.post("*/v1/events/:id/orders", () =>
        apiError(409, "insufficient_stock", "Não há ingressos suficientes de Meia."),
      ),
    );
    const { user } = renderApp(`/eventos/${event.id}`);
    await screen.findByText("Meia");
    const loadsBefore = ticketTypeLoads;

    await user.click(add("Meia"));
    await user.click(screen.getByRole("button", { name: "Reservar ingressos" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não há ingressos suficientes de Meia.");
    await expect.poll(() => ticketTypeLoads).toBeGreaterThan(loadsBefore);
  });
});
