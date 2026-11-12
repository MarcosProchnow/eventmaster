/**
 * Fitness functions de arquitetura (ADR 0012): regras de dependência
 * verificadas a cada commit pelo CI. Se alguém importar o banco dentro do
 * domínio, por exemplo, o build quebra com a regra e o motivo.
 *
 *   pnpm run arch
 */
const API = "^apps/api/src/";
const MOD = `${API}modules/[^/]+/`;
const WEB = "^apps/web/src/";

/**
 * Superfície pública de cada módulo para os outros (RNF06). Tudo o mais é interno.
 * - tipos de domínio e regras puras que outro domínio precisa conhecer;
 * - funções de infraestrutura que participam da transação de outro módulo
 *   (reservar estoque, gravar no outbox) — o preço de um monólito com um só banco;
 * - schemas HTTP de parâmetros reaproveitados em rotas aninhadas.
 */
const PUBLIC_API = [
  `${API}modules/events/domain/event\\.ts$`,
  `${API}modules/events/infra/ticket-inventory\\.ts$`,
  `${API}modules/events/http/schemas\\.ts$`,
  `${API}modules/orders/domain/order\\.ts$`,
  `${API}modules/orders/application/orders-service\\.ts$`,
  `${API}modules/orders/infra/order-store\\.ts$`,
  `${API}modules/orders/http/schemas\\.ts$`,
  `${API}modules/notifications/infra/outbox\\.ts$`,
];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ---------- Gerais ----------
    {
      name: "sem-ciclos",
      severity: "error",
      comment: "Dependência circular impede entender e testar as partes separadamente.",
      from: {},
      to: { circular: true },
    },
    {
      name: "sem-import-quebrado",
      severity: "error",
      comment: "Import que não resolve para nenhum arquivo ou pacote.",
      from: {},
      to: { couldNotResolve: true },
    },

    // ---------- API: Hexagonal (ADR 0001) ----------
    {
      name: "dominio-puro",
      severity: "error",
      comment:
        "O domínio é o centro do hexágono: só conhece outros domínios e `shared`. " +
        "Nada de casos de uso, adaptadores, HTTP, banco, pacotes npm ou APIs do Node.",
      from: { path: `${MOD}domain/` },
      to: {
        pathNot: [`${MOD}domain/`, `${API}shared/`],
      },
    },
    {
      name: "aplicacao-sem-infra",
      severity: "error",
      comment:
        "Casos de uso dependem de portas (interfaces), não de adaptadores. " +
        "Banco, HTTP e bibliotecas de infraestrutura ficam fora da camada de aplicação.",
      from: { path: `${MOD}application/` },
      to: {
        path: [`${MOD}(infra|http)/`, `${API}db/`, "(^|/)node_modules/(fastify|drizzle-orm|pg|pg-boss|nodemailer|jose)/"],
      },
    },
    {
      name: "http-sem-infra",
      severity: "error",
      comment:
        "Rotas chamam casos de uso; quem liga casos de uso aos adaptadores é o composition root (`app.ts`, `worker/`).",
      from: { path: `${MOD}http/` },
      to: { path: [`${MOD}infra/`, `${API}db/`] },
    },
    {
      name: "infra-sem-http",
      severity: "error",
      comment: "Adaptadores de saída não conhecem os de entrada.",
      from: { path: `${MOD}infra/` },
      to: { path: `${MOD}http/` },
    },
    {
      name: "shared-sem-modulos",
      severity: "error",
      comment: "`shared` é a base de todos os módulos; não pode depender de nenhum deles nem do banco.",
      from: { path: `${API}shared/` },
      to: { path: [`${API}modules/`, `${API}db/`] },
    },
    {
      name: "modulos-sem-composition-root",
      severity: "error",
      comment: "Módulos não importam os pontos de montagem da aplicação (`app.ts`, `main.ts`, `worker`).",
      from: { path: `${API}modules/` },
      to: { path: `${API}(app|main|worker|openapi)(\\.ts$|/)` },
    },

    {
      name: "modulos-so-pela-api-publica",
      severity: "error",
      comment:
        "Um módulo só usa de outro o que está em PUBLIC_API (abaixo). Ampliar essa lista é uma " +
        "decisão de arquitetura visível no diff, e é também o contrato a manter se o módulo virar " +
        "um serviço (docs/arquitetura/microsservicos.md).",
      from: { path: `${API}modules/([^/]+)/` },
      to: { path: `${API}modules/`, pathNot: [`${API}modules/$1/`, ...PUBLIC_API] },
    },
    // ---------- Front-end (ADR 0004) ----------
    {
      name: "web-base-sem-features",
      severity: "error",
      comment: "`shared` e `api` são a base das telas; não dependem de features nem do app.",
      from: { path: `${WEB}(shared|api)/` },
      to: { path: `${WEB}(features|app)/` },
    },
    {
      name: "web-features-sem-app",
      severity: "error",
      comment: "Features não importam o roteador/app; o app é que monta as features.",
      from: { path: `${WEB}features/` },
      to: { path: `${WEB}app/` },
    },
    {
      name: "web-features-isoladas",
      severity: "error",
      comment:
        "Uma feature não usa outra, exceto `auth` (sessão). Código comum vai para `shared`.",
      from: { path: `${WEB}features/([^/]+)/` },
      to: { path: `${WEB}features/`, pathNot: `${WEB}features/($1|auth)/` },
    },
    {
      name: "web-cliente-unico",
      severity: "error",
      comment:
        "Só `src/api` fala com o cliente gerado; as telas usam `api/client` (renovação de sessão e erros padronizados).",
      from: { path: WEB, pathNot: `${WEB}api/` },
      to: { path: "(^|/)(node_modules/@eventmaster/api-client|packages/api-client)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // Imports só de tipo também contam: acoplamento por tipo ainda é acoplamento.
    tsPreCompilationDeps: true,
    exclude: { path: "\\.d\\.ts$" },
    // Pacotes ESM modernos (ex.: react-router) só se resolvem pelo campo `exports`.
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types"],
    },
    reporterOptions: {
      dot: { collapsePattern: "^apps/api/src/modules/[^/]+/[^/]+" },
    },
  },
};
