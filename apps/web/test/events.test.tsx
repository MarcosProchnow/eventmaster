import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";
import { event } from "./fixtures";
import { renderApp } from "./render";
import { server } from "./server";

/** Registra os parâmetros de cada chamada a `GET /v1/events`. */
function mockEvents(total: number) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get("*/v1/events", ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      const items = params.get("q") === "nada" ? [] : [event];
      return HttpResponse.json({ items, total: items.length ? total : 0, page: Number(params.get("page")), pageSize: 9 });
    }),
  );
  return requests;
}

describe("lista de eventos", () => {
  it("mostra os eventos publicados com link para o detalhe", async () => {
    mockEvents(1);
    renderApp("/");

    const link = await screen.findByRole("link", { name: /Festival de Jazz/ });
    expect(link).toHaveAttribute("href", `/eventos/${event.id}`);
    expect(link).toHaveTextContent("Parque Barigui · Curitiba");
  });

  it("busca por nome e cidade envia os filtros à API", async () => {
    const requests = mockEvents(1);
    const { user } = renderApp("/");
    await screen.findByRole("link", { name: /Festival de Jazz/ });

    await user.type(screen.getByLabelText("Buscar por nome"), "nada");
    await user.type(screen.getByLabelText("Cidade"), "Curitiba");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText("Nenhum evento encontrado para esta busca.")).toBeInTheDocument();
    const last = requests.at(-1);
    expect(last?.get("q")).toBe("nada");
    expect(last?.get("city")).toBe("Curitiba");
    expect(last?.get("page")).toBe("1");
  });

  it("pagina os resultados", async () => {
    const requests = mockEvents(20);
    const { user } = renderApp("/");

    expect(await screen.findByText("Página 1 de 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Próxima" }));

    expect(await screen.findByText("Página 2 de 3")).toBeInTheDocument();
    expect(requests.at(-1)?.get("page")).toBe("2");
  });
});
