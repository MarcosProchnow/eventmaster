import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";
import { api, ApiError, call } from "../src/api/client";
import { attendee } from "./fixtures";
import { apiError, server } from "./server";

describe("renovação de sessão no cliente", () => {
  it("após 401, renova a sessão uma única vez e repete as requisições", async () => {
    let refreshes = 0;
    let authorized = false;
    server.use(
      http.get("*/v1/me", () =>
        authorized ? HttpResponse.json(attendee) : apiError(401, "unauthorized", "Sessão expirada."),
      ),
      http.post("*/v1/auth/refresh", () => {
        refreshes += 1;
        authorized = true;
        return HttpResponse.json(attendee);
      }),
    );

    const [first, second] = await Promise.all([call(api.GET("/v1/me")), call(api.GET("/v1/me"))]);

    expect(first).toEqual(attendee);
    expect(second).toEqual(attendee);
    expect(refreshes).toBe(1);
  });

  it("se a renovação falha, o 401 chega como ApiError", async () => {
    server.use(http.get("*/v1/me", () => apiError(401, "unauthorized", "Sessão expirada.")));

    const error = await call(api.GET("/v1/me")).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: "unauthorized", message: "Sessão expirada." });
  });

  it("não tenta renovar quando a própria rota de autenticação responde 401", async () => {
    let refreshes = 0;
    server.use(
      http.post("*/v1/auth/login", () => apiError(401, "invalid_credentials", "E-mail ou senha inválidos.")),
      http.post("*/v1/auth/refresh", () => {
        refreshes += 1;
        return HttpResponse.json(attendee);
      }),
    );

    await expect(
      call(api.POST("/v1/auth/login", { body: { email: "ana@example.com", password: "errada-123" } })),
    ).rejects.toMatchObject({ status: 401 });
    expect(refreshes).toBe(0);
  });
});
