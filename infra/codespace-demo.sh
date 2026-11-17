#!/usr/bin/env bash
# Demonstração no próprio GitHub Codespace: aplicação completa em contêineres, aberta pela porta 8080.
#
#   infra/codespace-demo.sh                  sobe (ou atualiza) e mostra a URL
#   infra/codespace-demo.sh aprovar <pedido> aprova o pagamento sandbox de um pedido (faz o papel do gateway)
#   infra/codespace-demo.sh parar            derruba os contêineres e mantém os dados
#
# A porta 8080 fica PRIVADA: só quem está logado na conta dona do Codespace abre a URL. Torná-la pública
# é decisão do dono: gh codespace ports visibility 8080:public -c "$CODESPACE_NAME"
# O app roda enquanto o Codespace estiver ligado; ao desligar por inatividade, rode este script de novo.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CODESPACE_NAME:?este script é para rodar dentro de um GitHub Codespace}"

# Projeto próprio: volume de dados separado do ambiente de desenvolvimento (que não é tocado).
export COMPOSE_PROJECT_NAME=eventmaster-demo
dc() { docker compose -f compose.yaml -f infra/compose.demo.yaml --profile app "$@"; }

case "${1:-subir}" in
  parar) dc down; exit ;;
  aprovar)
    order="${2:?uso: infra/codespace-demo.sh aprovar <id-do-pedido>}"
    ref=$(dc exec -T postgres psql -U eventmaster -d eventmaster -tAc \
      "select provider_ref from payments.payments where order_id = '$order' and status = 'pending'")
    [ -n "$ref" ] || { echo "Nenhum pagamento pendente para o pedido $order." >&2; exit 1; }
    dc exec -T -e API_URL=http://127.0.0.1:3000 api node src/modules/payments/infra/sandbox-webhook-cli.ts "$ref" approved
    exit ;;
esac

# O Origin enviado pelo navegador precisa ser igual a WEB_ORIGIN (proteção CSRF, ADR 0009).
export WEB_ORIGIN="https://${CODESPACE_NAME}-8080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"

# Segredos só se ainda não existirem (o .env fica fora do Git).
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^JWT_SECRET=$|JWT_SECRET=$(openssl rand -hex 32)|; s|^WEBHOOK_SECRET=$|WEBHOOK_SECRET=$(openssl rand -hex 32)|" .env
fi

# O ambiente de desenvolvimento usa as mesmas portas: para os contêineres dele, sem apagar dados.
COMPOSE_PROJECT_NAME=eventmaster docker compose stop >/dev/null 2>&1 || true

dc up -d --build --wait
dc exec -T api node src/db/seed.ts

echo
echo "EventMaster no ar (porta privada, só para você logado no GitHub):"
echo "  App:      $WEB_ORIGIN"
echo "  E-mails:  https://${CODESPACE_NAME}-8025.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
