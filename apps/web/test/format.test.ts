import { describe, expect, it } from "vitest";
import { formatMoney, isoToLocalInput, localInputToIso } from "../src/shared/format";

describe("formatação", () => {
  it("converte centavos em reais e mostra preço zero como gratuito", () => {
    expect(formatMoney(0)).toBe("Gratuito");
    // Intl usa espaço não separável entre "R$" e o valor.
    expect(formatMoney(1990)).toBe("R$ 19,90");
    expect(formatMoney(123_456)).toBe("R$ 1.234,56");
  });

  it("ida e volta entre o campo datetime-local e ISO 8601 preserva o horário", () => {
    const local = "2026-12-01T19:30";
    expect(localInputToIso(local)).toMatch(/Z$/);
    expect(isoToLocalInput(localInputToIso(local))).toBe(local);
  });
});
