#!/usr/bin/env bash
# Smoke test da aplicação em contêineres (CI e uso manual):
#   docker compose --profile app up -d --build --wait && infra/smoke-test.sh
# Confere o caminho front (nginx) -> API -> banco, os cabeçalhos de segurança,
# os cookies de sessão e que os processos não rodam como root.
set -euo pipefail
BASE="${BASE_URL:-http://localhost:8080}"

fail() { echo "FALHOU: $*" >&2; exit 1; }
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
expect() {
  local want=$1; shift
  local got; got=$(status "$@")
  [ "$got" = "$want" ] || fail "$* -> $got (esperado $want)"
  echo "ok  $want  ${*: -1}"
}

expect 200 "$BASE/healthz"
expect 200 "$BASE/"
expect 200 "$BASE/eventos/rota-da-spa"            # fallback da SPA para index.html
expect 200 "$BASE/v1/events"                      # nginx -> API -> Postgres
expect 404 "$BASE/assets/nao-existe.js"

headers=$(curl -sI "$BASE/")
grep -qi "^content-security-policy: default-src 'self'" <<<"$headers" || fail "CSP ausente"
grep -qi "^x-content-type-options: nosniff" <<<"$headers" || fail "X-Content-Type-Options ausente"
echo "ok  cabeçalhos de segurança"

# Escrita vinda de outra origem é recusada (proteção CSRF, ADR 0009).
expect 403 -X POST "$BASE/v1/auth/login" -H 'content-type: application/json' \
  -H 'origin: https://outro-site.example' -d '{"email":"a@example.com","password":"qualquer-coisa"}'

# Cadastro pela mesma origem: 201 e cookies de sessão protegidos.
email="smoke-$(date +%s)-$RANDOM@example.com"
response=$(curl -s -D - -o /dev/null -X POST "$BASE/v1/auth/register" -H 'content-type: application/json' \
  -H "origin: $BASE" -d "{\"name\":\"Smoke Test\",\"email\":\"$email\",\"password\":\"senha-do-smoke-test\",\"role\":\"attendee\"}")
grep -q "^HTTP/1.1 201" <<<"$response" || fail "cadastro não retornou 201"
grep -qi "^set-cookie: access_token=.*HttpOnly; Secure; SameSite=Strict" <<<"$response" || fail "cookie de acesso sem HttpOnly/Secure/SameSite"
echo "ok  cadastro e cookies (HttpOnly, Secure, SameSite=Strict)"

if command -v docker >/dev/null; then
  for service in api worker web; do
    uid=$(docker compose exec -T "$service" id -u)
    [ "$uid" != "0" ] || fail "$service roda como root"
  done
  echo "ok  api, worker e web sem root"
fi
echo "Smoke test concluído."
