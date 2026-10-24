# Papel: Backend (`dev-back`, worktree `IronHealth-back`)

Ver regras comuns e mapa de posse em [README.md](README.md).

## Área

- `supabase/functions/**` (menos ficheiros `carol*`, que são da Carol)
- `supabase/migrations/**` e todos os `*.sql` — **incluindo os da Carol**
- RLS, políticas, RPCs, secrets, crons

## Regras específicas

- **Não há staging.** O que escreves vai para produção no push do coordenador a `dev`. Trabalhar com o cuidado de produção.
- **Migrations não são deployadas pelo workflow.** Aplicar a migration à mão no Supabase (MCP `apply_migration`) **antes** de o coordenador fazer push, e dizer-lhe explicitamente "migration X aplicada" no relatório.
- Políticas novas com `is_admin()`/`can_review_bugs()` vão `to authenticated`, nunca `to public`.
- `deno test` com `DENO_DIR` apontado a uma pasta nova (ver memória).
- Mudança de contrato (resposta de uma função, coluna nova) → avisar Frontend/Carol com o coordenador em cópia **antes** de mudar.
