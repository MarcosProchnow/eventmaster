# 0014. Hospedagem de produção

- Status: Proposto (falta escolher o provedor)
- Data: 2026-11-12

## Contexto
As imagens e o Compose estão prontos e testados no CI (ADR 0011). Falta onde rodar. O que a arquitetura exige do ambiente:

1. **Uma única origem pública** para front e API (cookies `SameSite=Strict`, ADR 0009). A imagem `web` já resolve isso: ela é o único serviço público e repassa `/v1` à API.
2. **Rede privada** entre `web`, `api` e `worker`, com DNS interno (o nginx resolve `API_UPSTREAM`).
3. **Dois processos de longa duração** a partir da mesma imagem: `api` e `worker` (fila pg-boss).
4. **PostgreSQL gerenciado** (backups e atualizações fora da nossa conta) e uma tarefa de migração antes de cada deploy (`node src/db/migrate.ts`).
5. **HTTPS** terminado na plataforma (os cookies são `Secure` com `NODE_ENV=production`).
6. **Segredos** como variáveis de ambiente da plataforma (`JWT_SECRET`, `WEBHOOK_SECRET`, `DATABASE_URL`, `SMTP_URL`).
7. Um serviço de e-mail transacional real no lugar do Mailpit.

## Alternativas consideradas
| Forma | Exemplos (a verificar preço e limites) | Prós | Contras |
|---|---|---|---|
| **Plataforma de contêineres gerenciada** | Fly.io, Render, Railway, Google Cloud Run, Azure Container Apps | Usa as imagens prontas; HTTPS e deploy por imagem; Postgres gerenciado disponível na maioria | Cada uma tem seu jeito de rede privada e de processo em segundo plano (o worker não recebe HTTP); escala para zero pode parar o worker |
| VM única com Docker Compose | Qualquer VPS | Igual ao ambiente testado no CI; custo previsível | Backup, TLS, atualizações e monitoramento por nossa conta |
| Front em CDN (Vercel/Netlify) + API separada | — | CDN global para o front | Quebra a mesma origem: exigiria proxy de reescrita na CDN apontando para a API (possível, mas é mais uma peça) ou mudar a estratégia de cookies |
| Kubernetes gerenciado | EKS, GKE, AKS | Padrão de mercado | Desproporcional para um projeto deste tamanho |

## Recomendação
**Plataforma de contêineres gerenciada + Postgres gerenciado**, publicando as imagens no GitHub Container Registry (GHCR) pelo CI a cada push na `main` que passar nos testes. É o caminho com menos operação e que reaproveita tudo o que já foi testado.

Antes de decidir o provedor, verificar na documentação oficial: suporte a processo sem HTTP (worker), rede privada entre serviços, Postgres gerenciado, preço do menor plano que não pare o worker, e região no Brasil (latência e LGPD).

## Pendências do deploy, independentes do provedor
- **IP real do cliente atrás do balanceador da plataforma.** Hoje o nginx usa o IP de quem o chama; atrás de um balanceador, seria o IP do balanceador, e o rate limit voltaria a ser global. Configurar `set_real_ip_from` com as faixas do balanceador e `real_ip_header X-Forwarded-For` no nginx.
- `WEB_ORIGIN` com a URL pública (HTTPS).
- Backups do Postgres e teste de restauração (Módulo 0: PCN/DR).
- Coletor de traces (OTLP) do provedor ou um serviço externo, apontado por `OTEL_EXPORTER_OTLP_ENDPOINT`.

## Consequências
+ Nenhuma mudança de código para publicar; só configuração.
- Depende de uma conta no provedor escolhido, criada pelo dono do projeto.
