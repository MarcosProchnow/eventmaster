# syntax=docker/dockerfile:1
# Front-end: build estático do Vite servido por nginx, que também repassa /v1 à API.
# Assim front e API ficam na mesma origem, como exigem os cookies SameSite=Strict (ADR 0009).
# Build a partir da raiz do monorepo:  docker build -f apps/web/Dockerfile .

FROM node:24-alpine AS build
RUN npm install -g pnpm@12.16.1
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --filter "@eventmaster/web..." \
 && pnpm --filter @eventmaster/web run build

# Variante oficial do nginx que roda sem root (porta 8080).
FROM nginxinc/nginx-unprivileged:1.30-alpine AS runtime
# Endereço da API dentro da rede; trocado na subida do contêiner (template + envsubst).
ENV API_UPSTREAM=http://api:3000
# Faz a imagem oficial exportar NGINX_LOCAL_RESOLVERS (DNS do ambiente) para o template.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY apps/web/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
