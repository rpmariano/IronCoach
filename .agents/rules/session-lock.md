---
description: Coordenação entre sessões de IA (Antigravity, Claude Code local, Claude Code cloud) para detetar colisões na mesma branch antes de acontecerem. O assistente deve seguir isto sempre, sem o utilizador precisar de pedir.
---

# Lock de sessão — evitar colisão com outra sessão ativa na mesma branch

Incidente 2026-09-04: duas sessões Claude Code (uma local, outra cloud — sessões cloud têm o seu próprio clone isolado, mas fazem push para as mesmas branches partilhadas) escreveram em `dev-claude`/`dev` ao mesmo tempo sem se verem uma à outra. Uma reintroduziu, sem saber, duas coisas que a outra tinha acabado de remover de propósito. Não há forma de impedir outra sessão de existir — mas há forma de detetar a tempo.

`.claude-session-lock.json` (raiz do repo, **committed**, não gitignored — tem de ser visível a partir de qualquer clone) regista quem está a trabalhar em cada branch agora:

```json
{ "session": "<nome/id da sessão>", "startedAt": "<ISO>", "heartbeatAt": "<ISO>" }
```

**Ao começar a trabalhar na tua branch (`dev-antigravity`)**, antes do primeiro commit:
1. `git fetch origin`
2. `git show origin/dev-antigravity:.claude-session-lock.json` (falha silenciosamente se ainda não existir — assumir livre)
3. Se existir e `heartbeatAt` for de **há menos de 45 minutos**: **parar e avisar o utilizador**, nunca decidir sozinho que está tudo bem.
4. Caso contrário: escrever/commitar `.claude-session-lock.json` com os dados desta sessão no primeiro commit, e fazer push cedo — é o aviso que protege a próxima sessão.

**Durante uma sessão longa:** atualizar `heartbeatAt` a cada novo push (não precisa de commit dedicado).

**Antes de mergear para `dev`** (passo já existente em `auto-agents.md`): verificar também `origin/dev:.claude-session-lock.json` pelo mesmo motivo — outra sessão pode estar a mergear para `dev` ao mesmo tempo.

**Sem limpeza garantida no fim** — a janela de 45min é a rede de segurança real, não a limpeza. Nunca tratar um lock com mais de 45min como perigo, nem a ausência de lock como garantia absoluta — é deteção best-effort, não um lock exclusivo de verdade.
