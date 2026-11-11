/** Gera `openapi.json` (contrato da API, ADR 0003). O CI falha se estiver desatualizado. */
import { writeFile } from "node:fs/promises";
import { buildApp } from "./app.ts";
import { createPool } from "./db/client.ts";

// O pool é preguiçoso: nenhuma conexão é aberta para gerar o documento.
const pool = createPool("postgres://unused:unused@localhost:1/unused");
const app = await buildApp({ pool, allowDevAuth: false });
await app.ready();
await writeFile("openapi.json", `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
await pool.end();
console.log("openapi.json gerado.");
