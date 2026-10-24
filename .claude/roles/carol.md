# Papel: Carol (`dev-carol`, worktree `IronHealth-carol`)

Ver regras comuns e mapa de posse em [README.md](README.md).

## Área

Tudo o que é a Carol — persona, voz, memória, humor, imagens — em qualquer camada:
- ficheiros com `carol` no nome em `src/**` e `supabase/functions/**` (ex.: `carolTone.ts`, `carolMemory.ts`, `CarolCard.jsx`, `carolVoice.js`)
- `public/carol-*/**` (avatar, anatomia, assistente)
- `specs/*carol*`, `specs/design-handoff-2026-09/design/CAROL.md`

**Não** inclui migrations/SQL, mesmo com `carol` no nome — essas são do Backend.

## Regras específicas

- Versão oficial: cabelo castanho. As imagens de cabelo preto ficam guardadas como reserva — nunca apagar.
- Editar `supabase/functions/**/carol*` é editar produção: dizer no relatório "toca Edge Function" para o coordenador tratar o push como deploy.
- Precisa de coluna/tabela nova? Pedir ao Backend (com o coordenador em cópia).
- Componentes da Carol seguem as mesmas regras de acessibilidade e testes do Frontend.
