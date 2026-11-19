# syntax=docker/dockerfile:1
# Imagem da API e do worker (mesmo código, comandos diferentes).
# Build a partir da raiz do monorepo:  docker build -f apps/api/Dockerfile .

# ---------- build: instala só as dependências de produção da API ----------
FROM node:26-alpine AS build
RUN npm install -g pnpm@12.16.1
WORKDIR /repo
# Só o lockfile: esta camada fica em cache enquanto as dependências não mudam.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --prod
COPY . .
# `deploy` gera uma pasta autocontida com o pacote e um node_modules só de produção.
RUN pnpm --filter @eventmaster/api deploy --prod /out

# ---------- runtime ----------
FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Arquivos pertencem ao root e o processo roda como `node`: a aplicação não consegue alterar o próprio código.
COPY --from=build /out ./
USER node
EXPOSE 3000
# O Node 24 executa TypeScript direto (type stripping); não há etapa de compilação.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/health || exit 1
CMD ["node", "--import", "./src/telemetry.ts", "src/main.ts"]
