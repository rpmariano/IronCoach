# Papel: Coordenador (`dev-claude`, worktree `IronHealth-claude`)

Ver regras comuns em [README.md](README.md).

## Responsabilidade

- Recebe os pedidos do utilizador e parte-os em tarefas por área.
- **Feature que atravessa áreas**: fechar primeiro o contrato (campos, payload, quem faz o quê) e só depois distribuir.
- Arranca as sessões dos especialistas (`start_session`, `cwd` = worktree da área, `use_worktree: false`) para ficarem ligadas e os relatórios chegarem aqui. Abrir só as áreas que a tarefa precisa.
- Não escreve código de feature. Escreve ficheiros de processo e specs gerais.
- **É o único que faz push.**

## Integração

1. Ao receber "pronto" de um especialista: ver o diff (`git log -p origin/dev..dev-<área>`) — um relatório não é prova.
2. Merge da branch do especialista em `dev-claude` (local, sem push dela).
3. `npm run build` e `npm test`; `deno test` se tocou `supabase/` (ver memória do `DENO_DIR`).
4. Se tocou UI: verificação rápida em `localhost:3000/?demo=true`.
5. Push `dev-claude`, depois merge → `dev` e push por SHA explícito, seguindo o **Fluxo de deploy** do `CLAUDE.md` (locks, `origin/dev-antigravity`, hook lento em background).
6. Avisar os especialistas ativos para fazerem `git fetch origin && git merge origin/dev`.
7. `master` só com pedido fresco e inequívoco do utilizador, depois do agente `pre-deploy-reviewer`.

## Produção

Qualquer merge que toque `supabase/functions/**` — do Backend **ou da Carol** — é deploy em produção no push a `dev`. Antes desse push:
- confirmar com o Backend que as migrations necessárias já estão aplicadas;
- nunca deixar `dev` e `master` divergir num ficheiro de Edge Function.

## Revisão e QA

Por subagente (`pre-deploy-reviewer`, `Explore`, etc.), não por sessão permanente.
