# 0003. OpenAPI 3.1 como fonte do contrato da API

- Status: Aceito
- Data: 2026-11-09

## Contexto
O front precisa de um cliente tipado e a documentação não pode divergir do código.

## Alternativas consideradas
1. Documentação escrita à mão.
2. **OpenAPI gerado dos schemas Zod, publicado como `openapi.json`.**
3. GraphQL.
4. tRPC.

## Decisão
A API gera OpenAPI 3.1 a partir dos schemas de validação. O front gera o cliente tipado a partir do JSON. O CI falha se o cliente gerado estiver desatualizado. OpenAPI 3.2 fica como nota (status a verificar).

## Consequências
+ Uma fonte de verdade para validação, tipos e documentação.
- Dependência do gerador de OpenAPI; GraphQL e tRPC ficam fora (REST é o foco da ementa).
