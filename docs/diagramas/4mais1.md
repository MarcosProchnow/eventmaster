# Modelo 4+1 (Kruchten)

Quatro visões ligadas por cenários. Os diagramas C4 ([c4.md](c4.md)) cobrem parte delas; aqui elas são organizadas pelo modelo 4+1.

## +1. Cenários (casos de uso que guiam a arquitetura)
| Cenário | Requisitos | Por que guia a arquitetura |
|---|---|---|
| C1. Participante reserva e paga ingressos | RF05, RF06, RNF01, RNF02, RNF03 | Concorrência no estoque, idempotência, integração externa |
| C2. Gateway confirma o pagamento por webhook | RF05, RF06, RNF02 | Autenticidade da mensagem, liquidação atômica |
| C3. Sistema avisa o participante por e-mail | RF07 | Processamento assíncrono e confiável |
| C4. Organizador publica um evento | RF02, RF03, RNF04 | Autorização por papel e por dono do recurso |

## Visão lógica (o que o sistema faz)
Módulos de negócio e seus conceitos principais. Setas = "conhece".
```mermaid
classDiagram
  direction LR
  class User { id, email, name, role }
  class Event { id, organizerId, title, status: draft|published|cancelled, startsAt, endsAt }
  class TicketType { id, eventId, name, priceCents, quantity, sold }
  class Order { id, userId, eventId, status: reserved|paid|expired|cancelled, totalCents, expiresAt, requestHash }
  class OrderItem { ticketTypeId, quantity, unitPriceCents }
  class Ticket { id, code, checkedInAt }
  class Payment { id, orderId, method: pix|boleto|card, status: pending|approved|declined|refunded, providerRef }
  class OutboxMessage { id, type, payload, processedAt }
  User "1" --> "*" Event : organiza
  Event "1" *-- "*" TicketType
  User "1" --> "*" Order : compra
  Order "1" *-- "*" OrderItem
  OrderItem --> TicketType
  Order "1" *-- "*" Ticket : emitidos ao pagar
  Order "1" --> "*" Payment
```
Padrões: Hexagonal (portas e adaptadores), Repository, Strategy (meio de pagamento no `SandboxGateway`), Observer via eventos de domínio no outbox, funções puras de decisão (`planReservation`, `decideSettlement`) no lugar de lógica espalhada.

## Visão de processos (comportamento em execução)
Cenários C1 e C2: reserva, pagamento e confirmação.
```mermaid
sequenceDiagram
  autonumber
  actor P as Participante
  participant W as web (nginx)
  participant A as api
  participant DB as PostgreSQL
  participant G as Gateway sandbox
  participant K as worker
  P->>W: POST /v1/events/:id/orders (Idempotency-Key)
  W->>A: repassa (X-Forwarded-For)
  A->>DB: BEGIN · SELECT tipos FOR UPDATE (ordem por id)
  A->>DB: sold += n (CHECK sold <= quantity) · INSERT pedido (hash do pedido) · COMMIT
  A-->>P: 201 pedido reservado por 15 min
  P->>A: POST /v1/orders/:id/pay {method}
  A->>G: cria cobrança (porta PaymentGateway)
  A->>DB: INSERT pagamento pending (1 pendente por pedido)
  A-->>P: 201 instruções (Pix, boleto ou cartão)
  G->>A: POST /v1/webhooks/payments (HMAC + timestamp)
  A->>DB: BEGIN · trava pagamento e pedido · decideSettlement · pedido=paid · emite ingressos · INSERT outbox order.paid · COMMIT
  K->>DB: relay: lê outbox (SKIP LOCKED) e publica na fila pg-boss
  K->>P: e-mail "pagamento confirmado" (SMTP)
  P->>A: GET /v1/orders/:id (a página consulta a cada 4 s)
  A-->>P: paid + ingressos com QR code
```
Concorrência: uma instância da API (Node, laço de eventos único) e um worker. A serialização do estoque é feita pelo banco (trava por linha), não pela aplicação; por isso a API pode ganhar réplicas sem mudar a regra.

## Visão de desenvolvimento (organização do código)
```mermaid
flowchart LR
  subgraph monorepo[monorepo pnpm]
    API[apps/api\nmódulos: identity, events,\norders, payments, notifications]
    WEB[apps/web\nfeatures: auth, events,\norders, organizer]
    CLIENT[packages/api-client\ngerado do openapi.json]
    E2E[e2e\nPlaywright + axe]
  end
  API -->|gera| OAS[(openapi.json)]
  OAS -->|openapi-typescript| CLIENT
  WEB --> CLIENT
  E2E -->|sobe e testa| API & WEB
```
Regras de dependência verificadas no CI pelo dependency-cruiser (ADR 0012): camadas Hexagonais, API pública entre módulos, features do front isoladas, sem ciclos. Contrato: o CI falha se `openapi.json` ou o cliente gerado estiverem desatualizados.

## Visão física (implantação)
```mermaid
flowchart LR
  subgraph host[Host de contêineres - Compose hoje, plataforma gerenciada no deploy]
    WEB[web\nnginx-unprivileged :8080]
    API[api\nnode:24-alpine :3000]
    WRK[worker\nmesma imagem]
    MIG[migrate\ntarefa única]
  end
  INTERNET([Internet]) -->|HTTPS| LB[TLS da plataforma] --> WEB
  WEB --> API
  API & WRK & MIG --> PG[(PostgreSQL gerenciado)]
  WRK --> SMTP[(Provedor de e-mail)]
  API & WRK -.-> OTLP[(Coletor OTLP)]
```
Rede privada entre `web`, `api` e `worker`; só `web` é exposto. Processos sem root, segredos por variável de ambiente, healthchecks em `/health` (API) e `/healthz` (nginx). Escolha do provedor: ADR 0014.
