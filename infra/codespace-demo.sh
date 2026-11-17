#!/usr/bin/env bash
# Demonstração no próprio GitHub Codespace: aplicação completa em contêineres, aberta pela porta 8080.
#
#   infra/codespace-demo.sh                  sobe (ou atualiza) e mostra a URL
#   infra/codespace-demo.sh aprovar <pedido> aprova o pagamento sandbox de um pedido (faz o papel do gateway)
#   infra/codespace-demo.sh parar            derruba os contêineres e mantém os dados
#
# A porta 8080 nasce PRIVADA (só a conta dona do Codespace abre a URL). Torná-la pública é decisão do dono:
#   gh codespace ports visibility 8080:public -c "$CODESPACE_NAME"   (a porta precisa estar registrada: abra o
#   Codespace no VS Code e veja a aba Portas). Nunca torne pública a 8025: a caixa de e-mails não tem senha.
# O app roda enquanto o Codespace estiver ligado; ao desligar por inatividade, rode este script de novo.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CODESPACE_NAME:?este script é para rodar dentro de um GitHub Codespace}"

# Projeto próprio: volume de dados separado do ambiente de desenvolvimento (que não é tocado).
export COMPOSE_PROJECT_NAME=eventmaster-demo
# URL que o visitante abre; vai para os links dos e-mails (veja infra/compose.demo.yaml).
export PUBLIC_URL="https://${CODESPACE_NAME}-8080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
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

# Segredos só se ainda não existirem (o .env fica fora do Git).
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^JWT_SECRET=$|JWT_SECRET=$(openssl rand -hex 32)|; s|^WEBHOOK_SECRET=$|WEBHOOK_SECRET=$(openssl rand -hex 32)|" .env
fi

# O ambiente de desenvolvimento usa as portas 8080 e 8025: para só esses contêineres (sem apagar dados).
# O Postgres dele fica ligado: a demonstração não publica a porta 5432.
COMPOSE_PROJECT_NAME=eventmaster docker compose --profile app stop web mailpit >/dev/null 2>&1 || true

dc up -d --build --wait
dc exec -T api node src/db/seed.ts

echo
echo "EventMaster no ar (visibilidade da porta 8080: veja a aba Portas):"
echo "  App:      $PUBLIC_URL"
echo "  E-mails:  https://${CODESPACE_NAME}-8025.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
