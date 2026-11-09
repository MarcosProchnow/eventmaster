# 0009. Autenticação com access token curto e refresh rotativo

- Status: Aceito
- Data: 2026-11-09

## Contexto
API consumida por SPA; precisa de logout real e papéis (RBAC).

## Alternativas consideradas
1. Sessão no servidor.
2. **JWT de acesso curto + refresh token opaco rotativo em cookie httpOnly.**
3. Token em localStorage.

## Decisão
Access token de 10 a 15 min; refresh rotativo com hash no banco, em cookie httpOnly, Secure e SameSite. Senhas com argon2. RBAC (participante, organizador, admin) com checagem de propriedade do recurso. Login social via OAuth2/OIDC com PKCE como complemento.

## Consequências
+ Reduz exposição a XSS; permite revogação.
- Exige CORS com credenciais e proteção CSRF.
