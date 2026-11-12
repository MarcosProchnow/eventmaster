import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { beforeEach, describe, expect, it } from "vitest";
import type { Order } from "../src/api/client";
import { attendee, pixPayment, reservedOrder, tickets } from "./fixtures";
import { renderApp } from "./render";
import { apiError, server, signIn } from "./server";

beforeEach(() => signIn(attendee));

const showOrder = (order: Order) => server.use(http.get("*/v1/orders/:id", () => HttpResponse.json(order)));

describe("página do pedido", () => {
  it("pedido reservado: escolhe a forma de pagamento e mostra as instruções", async () => {
    showOrder(reservedOrder);
    let body: unknown;
    server.use(
      http.post("*/v1/orders/:id/pay", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(pixPayment, { status: 201 });
      }),
    );
    const { user } = renderApp(`/pedidos/${reservedOrder.id}`);

    expect(await screen.findByText("Aguardando pagamento")).toBeInTheDocument();
    expect(screen.getByText(/3 ingressos/)).toBeInTheDocument();
    await user.click(screen.getByLabelText("Cartão"));
    await user.click(screen.getByLabelText("Pix"));
    await user.click(screen.getByRole("button", { name: /^Pagar/ }));

    expect(await screen.findByText("00020126PIXDETESTE")).toBeInTheDocument();
    expect(body).toEqual({ method: "pix" });
  });

  it("pedido pago mostra um QR code por ingresso", async () => {
    showOrder({ ...reservedOrder, status: "paid" });
    server.use(http.get("*/v1/orders/:id/tickets", () => HttpResponse.json(tickets)));
    renderApp(`/pedidos/${reservedOrder.id}`);

    expect(await screen.findByText("Pago")).toBeInTheDocument();
    expect(await screen.findByTitle("QR code do ingresso 1")).toBeInTheDocument();
    expect(screen.getByTitle("QR code do ingresso 2")).toBeInTheDocument();
    expect(screen.getByText("TKT-BBB")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pagar/ })).not.toBeInTheDocument();
  });

  it("pedido expirado explica o que aconteceu", async () => {
    showOrder({ ...reservedOrder, status: "expired" });
    renderApp(`/pedidos/${reservedOrder.id}`);

    expect(await screen.findByText(/A reserva expirou/)).toBeInTheDocument();
  });

  it("pedido de outra pessoa aparece como não encontrado (a API responde 404)", async () => {
    server.use(http.get("*/v1/orders/:id", () => apiError(404, "not_found", "Pedido não encontrado.")));
    renderApp(`/pedidos/${reservedOrder.id}`);

    expect(await screen.findByRole("alert")).toHaveTextContent("Pedido não encontrado.");
  });
});
