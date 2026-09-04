# IronHealth — instruções para Claude Code

Este ficheiro é o equivalente, para Claude Code, das regras em `.agents/rules/` (usadas pelo Antigravity). Editar os dois em conjunto quando a regra for de processo/workflow — ver [[multi-agent-worktree-setup]] na memória.

## Onde vive o quê

- **Specs de produto/feature** ("o que construir"): `specs/PRD.md`, `PRODUCT.md`, SDD, Manual do Utilizador. Consultar antes de implementar uma feature nova; propor atualizações em vez de assumir.
- **Regras de processo** ("como trabalhar"): este ficheiro (`CLAUDE.md`) para mim, `.agents/rules/*.md` para o Antigravity. Mantidos em paralelo, não fundidos.

## Estrutura de worktrees

- `IronHealth-master` — hub do `.git` partilhado, branch `dev`. **Não editar diretamente aqui.**
- `IronHealth-claude` — a minha worktree, branch `dev-claude`. Trabalho sempre aqui.
- `IronHealth-antigravity` — worktree do Antigravity, branch `dev-antigravity`.

Nunca fazer `git checkout` para outra branch dentro desta pasta.

## Fluxo de deploy

1. `git add <ficheiros-alterados>` (nunca `git add -A` nem `git commit -a`)
2. `git commit` + `git push origin dev-claude`
3. `git fetch`, depois merge `dev-claude` → `dev` e `push origin dev` **sem pedir autorização** — mas antes verificar `origin/dev-antigravity`/`origin/dev` para não sobrepor trabalho concorrente; resolver conflitos reais ou avisar em vez de forçar.
4. Merge para `master` **apenas com autorização explícita e inequívoca** do utilizador, sempre um pedido fresco (não vale aprovação de sessões anteriores).
5. Nunca correr `git commit`/`git push` diretamente em `master`.

Ver [[deploy-workflow-rules]] na memória para o detalhe completo desta regra.

## Servidor de desenvolvimento

Ao começar a trabalhar no projeto, verificar se `npm run dev` está a correr; se não estiver, arrancar em background.

## Antes de um merge para `dev`/`master`

- Correr `npm run build` e, quando relevante, `npm test` antes do push — não assumir que o merge é limpo.
- Se o merge tocar `supabase/` (migrations, functions) ou `.sql`, rever com mais cuidado — é sensível a dados reais.
- Se tocar componentes de UI/estilos globais, verificar rapidamente acessibilidade e contraste.
- Antes de qualquer merge para `master`, ou quando o utilizador pedir "review"/"prepara para deploy": correr o agente `.claude/agents/pre-deploy-reviewer.md`.

## Sincronização

`dev-claude` deve começar cada sessão sincronizado com `origin/dev` (ver histórico de consolidação em 2026-09-04 na memória `multi-agent-worktree-setup`) — não esperar que fique muito desatualizado para corrigir.
