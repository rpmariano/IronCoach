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

## Coordenação entre sessões — evitar colisão com outra sessão Claude ativa

Incidente 2026-09-04: duas sessões Claude Code (uma local nesta pasta, outra cloud — sessões cloud têm o seu próprio clone isolado, não mexem nesta pasta, mas fazem push para as mesmas branches) escreveram em `dev-claude`/`dev` ao mesmo tempo sem se verem uma à outra. Uma reintroduziu, sem saber, duas coisas que a outra tinha acabado de remover de propósito. Não há forma de impedir outra sessão de existir — mas há forma de detetar a tempo, antes de o dano acontecer.

`.claude-session-lock.json` (raiz do repo, **committed** — não gitignored, tem de ser visível a partir de qualquer clone, incluindo sessões cloud) regista quem está a trabalhar em cada branch agora:

```json
{ "session": "<nome/id da sessão>", "startedAt": "<ISO>", "heartbeatAt": "<ISO>" }
```

**Ao começar a trabalhar nesta branch** (antes do primeiro `git commit`):
1. `git fetch origin`
2. `git show origin/dev-claude:.claude-session-lock.json` (falha silenciosamente se o ficheiro ainda não existir nessa branch — assumir livre)
3. Se existir e `heartbeatAt` for de **há menos de 45 minutos**: **parar e avisar o utilizador** — "parece que outra sessão está ativa desde HH:MM, confirmas que posso continuar?" — nunca decidir sozinho que está tudo bem.
4. Caso contrário (sem lock, ou lock com mais de 45min): escrever/commitar `.claude-session-lock.json` com os dados desta sessão como parte do primeiro commit, e fazer push o mais cedo possível — é o aviso que protege a próxima sessão a chegar.

**Durante uma sessão longa:** atualizar `heartbeatAt` e voltar a fazer commit/push antes de cada novo push a `dev-claude` (não precisa de commit dedicado — inclui no próximo commit de trabalho).

**Não há limpeza garantida no fim** — uma sessão pode simplesmente parar sem "fechar" o lock. A janela de 45min é a rede de segurança real, não a limpeza. Por isso: nunca tratar um lock com mais de 45min como sinal de perigo, e nunca tratar a AUSÊNCIA de lock como garantia absoluta — é deteção best-effort, não um lock exclusivo de verdade.

Mesma lógica antes do merge `dev-claude` → `dev` (passo 3 do Fluxo de deploy acima): verificar também `origin/dev:.claude-session-lock.json` antes de fazer push a `dev`, pelo mesmo motivo.
