# 0011. Configuração 12-factor, Docker Compose e CI no GitHub Actions

- Status: Aceito
- Data: 2026-11-09 (implementação: 2026-11-12)

## Contexto
Ambiente deve subir com um comando (RNF09) e segredos nunca no código (RNF10).

## Alternativas consideradas
1. Instalação manual.
2. **Docker Compose para dev, imagem multi-stage para produção, GitHub Actions para CI.**

## Decisão
Configuração por variáveis de ambiente validadas no boot; Compose com api, worker, postgres e mailpit; imagem `node:24-alpine` sem root; CI com lint, typecheck, testes, build e auditoria.

## Implementação

**Imagens** (build a partir da raiz do monorepo):

| Imagem | Base | Tamanho | Detalhes |
|---|---|---|---|
| `apps/api/Dockerfile` (API, worker e migrations) | `node:24-alpine` | ~370 MB | `pnpm fetch` em camada própria (cache) e `pnpm deploy --prod`: só dependências de produção. Sem etapa de compilação: o Node 24 executa TypeScript direto. Arquivos do root, processo como `node`. `HEALTHCHECK` em `/health`. |
| `apps/web/Dockerfile` (front) | `nginxinc/nginx-unprivileged:1.30-alpine` | ~91 MB | Build do Vite servido pelo nginx sem root (porta 8080), que também repassa `/v1` à API: **front e API na mesma origem**, como exigem os cookies `SameSite=Strict` (ADR 0009). |

**nginx do front** (`apps/web/nginx/`): fallback da SPA para `index.html` (sem cache), `/assets/` com cache imutável, CSP restrita (`default-src 'self'`, sem scripts ou estilos inline), `nosniff`, `Referrer-Policy`, `Permissions-Policy`. O endereço da API vem de `API_UPSTREAM` (template + envsubst).

**Dois defeitos achados ao testar os contêineres, e corrigidos:**
1. *Rate limit global atrás do proxy.* Atrás do nginx, a API via todas as requisições vindo do IP do proxy: o limite de 10 logins por minuto passaria a valer para todos os usuários juntos. Nova variável `TRUST_PROXY` (endereços dos proxies confiáveis; no Compose, `uniquelocal`), e o nginx sobrescreve `X-Forwarded-For` com o IP que ele vê, para o cliente não forjar o cabeçalho. Teste de integração cobre os dois casos.
2. *502 depois de reiniciar a API.* O nginx resolvia o nome `api` uma vez só, ao subir; recriada a API com outro IP, o front respondia 502. Agora usa `resolver` (o DNS do ambiente, lido do `/etc/resolv.conf` pela própria imagem oficial) e o nome é resolvido de novo a cada 10 s. O CI recria a API e confere que o front continua respondendo.

**Compose** (`compose.yaml`), por perfis:
- padrão: só Postgres e Mailpit (desenvolvimento com `pnpm dev`, como antes);
- `app`: `migrate` (roda as migrations e termina) → `api` e `worker` → `web` em http://localhost:8080. A API não publica porta: o acesso de fora é só pelo front;
- `observabilidade`: Jaeger (ADR 0010).
Segredos vêm do `.env` da raiz (fora do Git, modelo em `.env.example`); sem eles a API se recusa a subir.

**CI** (`.github/workflows/ci.yml`), três jobs:
- `check`: typecheck, lint (oxlint), testes (API e front), fitness functions, `pnpm audit --prod --audit-level high`, contrato OpenAPI e cliente gerado atualizados, build do front;
- `e2e`: Playwright + axe (ADR 0012);
- `containers`: build das duas imagens, aplicação completa no Compose, `infra/smoke-test.sh` (rotas, CSP, CSRF por origem, cookies `HttpOnly; Secure; SameSite=Strict`, nenhum processo como root) e o teste de reinício da API.

**Dependabot** (`.github/dependabot.yml`): npm (agrupado), GitHub Actions e imagens Docker, semanal.

**Lint: oxlint 1.93** em vez de ESLint. O `typescript-eslint` exige TypeScript abaixo de 6.1 e o projeto usa TS 7; o oxlint não depende do compilador. Categorias `correctness` e `suspicious` como erro, plugins de TypeScript, React (inclusive regras de hooks), jsx-a11y, unicorn e Vitest: 219 regras. Desligadas, por não se aplicarem: `react-in-jsx-scope` (JSX antigo), `no-async-endpoint-handlers` (regra do Express 4; o Fastify espera handlers `async`), `require-to-throw-message` e `consistent-function-scoping` (estilo), `prefer-tag-over-role` (os `role` usados são ARIA válidos). O lint achou e foi corrigido: `Date.now()` chamado durante a renderização (React exige render puro).

## Consequências
+ `docker compose --profile app up` sobe o sistema inteiro como em produção, com segredos fora do código.
+ O CI testa as imagens de verdade, não só o código.
- O job de contêineres leva alguns minutos a mais por push.
- Hospedagem de produção: ADR 0014.
