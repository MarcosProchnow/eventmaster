# 0008. Pagamento atrás de uma porta, com webhook idempotente

- Status: Aceito
- Data: 2026-11-09

## Contexto
Várias formas de pagamento; projeto sem dinheiro real.

## Alternativas consideradas
1. Integrar direto um provedor.
2. **Porta `PaymentGateway` com Strategy/Factory (Pix, cartão, boleto) e adaptador sandbox.**

## Decisão
O domínio depende apenas da porta. O adaptador usa gateway simulado ou sandbox. O webhook valida assinatura e é idempotente. Nunca usar credenciais reais.

## Consequências
+ Troca de provedor sem tocar o domínio; fácil de testar.
- Simulação não cobre todos os erros reais do provedor.

## Implementação (Fase 5)
- Porta `PaymentGateway` com um adaptador **sandbox**, que não fala com provedor nenhum e não movimenta dinheiro. Cada forma de pagamento (Pix, boleto, cartão) é uma estratégia que monta as próprias instruções.
- O resultado chega por webhook assinado: HMAC-SHA256 de `<timestamp>.<corpo>`, verificado sobre o corpo bruto, em tempo constante, com tolerância de 5 minutos contra reenvio de avisos antigos.
- A liquidação é uma transação única (pagamento, pedido, estoque, ingressos e outbox), decidida pela regra pura `decideSettlement`. Avisos repetidos ou simultâneos não têm efeito.
- Pagamento aprovado depois de a reserva expirar é marcado como estornado. No sandbox o estorno é só o registro; com um provedor real seria uma chamada à API de estorno, com tentativa e conciliação.
- No máximo um pagamento pendente por pedido (índice único parcial).
- O módulo de pagamentos altera pedido, estoque e outbox por funções públicas dos outros módulos, dentro da mesma transação. É um acoplamento aceito no monólito; em uma extração para microsserviço viraria uma saga.
- A API nunca recebe dados de cartão. Com um provedor real, a coleta seria feita pelo provedor.
- Em desenvolvimento, `pnpm run sandbox:webhook <providerRef> approved|declined` simula o aviso do gateway.
