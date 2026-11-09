# 0011. Configuração 12-factor, Docker Compose e CI no GitHub Actions

- Status: Aceito
- Data: 2026-11-09

## Contexto
Ambiente deve subir com um comando (RNF09) e segredos nunca no código (RNF10).

## Alternativas consideradas
1. Instalação manual.
2. **Docker Compose para dev, imagem multi-stage para produção, GitHub Actions para CI.**

## Decisão
Configuração por variáveis de ambiente validadas no boot; Compose com api, worker, postgres e mailpit; imagem `node:24-alpine` sem root; CI com lint, typecheck, testes, build e auditoria.

## Consequências
+ Reprodutível e portátil.
- Hospedagem de produção será decidida em ADR próprio (custo e DR).
