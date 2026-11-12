import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";
import { attendee, organizer } from "./fixtures";
import { renderApp } from "./render";
import { apiError, server, signIn } from "./server";

describe("login", () => {
  it("valida o formulário antes de chamar a API", async () => {
    let calls = 0;
    server.use(http.post("*/v1/auth/login", () => ((calls += 1), HttpResponse.json(attendee))));
    const { user } = renderApp("/entrar");

    await user.click(await screen.findByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Informe um e-mail válido")).toBeInTheDocument();
    expect(screen.getByText("Informe a senha")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toHaveAttribute("aria-invalid", "true");
    expect(calls).toBe(0);
  });

  it("mostra a mensagem de erro devolvida pela API", async () => {
    server.use(
      http.post("*/v1/auth/login", () => apiError(401, "invalid_credentials", "E-mail ou senha inválidos.")),
    );
    const { user } = renderApp("/entrar");

    await user.type(await screen.findByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-errada");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("E-mail ou senha inválidos.");
  });

  it("rota protegida leva ao login e, depois de entrar, volta para onde o usuário estava", async () => {
    server.use(
      http.post("*/v1/auth/login", () => HttpResponse.json(attendee)),
      http.get("*/v1/orders", () => HttpResponse.json([])),
    );
    const { user } = renderApp("/pedidos");

    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("E-mail"), attendee.email);
    await user.type(screen.getByLabelText("Senha"), "senha-correta-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("heading", { name: "Meus pedidos" })).toBeInTheDocument();
    expect(await screen.findByText(/Você ainda não tem pedidos/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sair" })).toBeInTheDocument();
  });
});

describe("cadastro", () => {
  it("exige senha com ao menos 10 caracteres", async () => {
    const { user } = renderApp("/cadastro");

    await user.type(await screen.findByLabelText("Nome"), "Ana");
    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText(/^Senha/), "curta");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("A senha deve ter ao menos 10 caracteres")).toBeInTheDocument();
  });

  it("organizador recém-cadastrado vai direto para o painel", async () => {
    let body: unknown;
    server.use(
      http.post("*/v1/auth/register", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(organizer, { status: 201 });
      }),
      http.get("*/v1/organizer/events", () => HttpResponse.json([])),
    );
    const { user } = renderApp("/cadastro");

    await user.type(await screen.findByLabelText("Nome"), organizer.name);
    await user.type(screen.getByLabelText("E-mail"), organizer.email);
    await user.type(screen.getByLabelText(/^Senha/), "senha-forte-123");
    await user.click(screen.getByLabelText("Organizar eventos"));
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByRole("heading", { name: "Meus eventos" })).toBeInTheDocument();
    // Espera a lista chegar: uma requisição ainda em voo vazaria para o próximo teste.
    expect(await screen.findByText("Você ainda não criou nenhum evento.")).toBeInTheDocument();
    expect(body).toEqual({
      name: organizer.name,
      email: organizer.email,
      password: "senha-forte-123",
      role: "organizer",
    });
  });
});

describe("área do organizador", () => {
  it("participante logado não vê o painel", async () => {
    signIn(attendee);
    renderApp("/organizador");

    expect(await screen.findByText("Esta área é para organizadores de eventos.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Organizador" })).not.toBeInTheDocument();
  });
});
