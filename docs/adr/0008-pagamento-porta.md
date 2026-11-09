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
