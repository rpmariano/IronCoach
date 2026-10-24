# Leitura pela assistente executiva — contrato

> Coordenador, 2026-10-24. Fonte de verdade para Backend e Frontend. Mudanças a este contrato passam pelo coordenador.

## Objetivo

A assistente executiva (outra app, fora do IronHealth) consulta os dados que **um** utilizador põe no IronHealth — **só os dele, nunca de mais ninguém**, e **só leitura**.

## Garantias (não negociáveis)

1. O utilizador é determinado **só pelo token**. A função **nunca** aceita `user_id` (nem `email`, nem outro identificador) no pedido.
2. Só leitura: a função não escreve em nenhuma tabela de dados do atleta (só no registo de acessos e em `last_used_at`).
3. O token nunca é guardado em claro — só o hash SHA-256. Mostra-se ao utilizador **uma vez**, na criação.
4. Revogável a qualquer momento; um token revogado falha logo no pedido seguinte.
5. Qualquer falha de autenticação devolve o mesmo `401` genérico (não distinguir "não existe" de "revogado").
6. Testes de isolamento: com dois utilizadores A e B, o token de A nunca devolve uma linha de B, em nenhum `resource`.

## Base de dados (Backend)

### `assistant_tokens`

| coluna | tipo | notas |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null → `auth.users` on delete cascade | |
| `token_hash` | text not null unique | SHA-256 hex do token |
| `token_prefix` | text not null | primeiros 8 caracteres, para o utilizador reconhecer o token na lista |
| `label` | text not null, 1-60 chars | ex.: "Assistente executiva" |
| `created_at` | timestamptz default now() | |
| `last_used_at` | timestamptz null | |
| `revoked_at` | timestamptz null | |

RLS: o dono faz `select` das suas linhas (o cliente nunca pede `token_hash`). Nada de `insert`/`update`/`delete` direto pelo cliente — só pelas RPCs.

### RPCs (`security definer`, `to authenticated`, `auth.uid()` obrigatório)

- `create_assistant_token(p_label text) returns table(id uuid, token text, token_prefix text, created_at timestamptz)`
  - Gera `ih_` + 32 bytes aleatórios em base64url. Guarda o hash. Devolve o token em claro **só nesta resposta**.
  - Máximo 3 tokens ativos por utilizador → erro `max_tokens`.
  - Regista o consentimento em `privacy_consents` com `kind = 'assistant_read'` (alargar o `check` de `kind`).
- `revoke_assistant_token(p_id uuid) returns void`
  - Só o dono. Põe `revoked_at = now()`. Se não ficar nenhum token ativo, regista a retirada do consentimento `assistant_read`.

### `assistant_access_log`

`id`, `token_id`, `user_id`, `resource`, `status` (int), `at` (default now()). Sem RLS de leitura para o cliente nesta fase. Serve para limite de pedidos e auditoria.

## Edge Function `assistant-read` (Backend)

- `verify_jwt = false` em `supabase/config.toml` (a autenticação é o token, verificado lá dentro).
- `GET /functions/v1/assistant-read?resource=<r>&from=YYYY-MM-DD&to=YYYY-MM-DD`
- Cabeçalho: `Authorization: Bearer ih_…`
- `from`/`to` opcionais; por defeito os últimos 7 dias; intervalo máximo 92 dias → `400`.
- Limite: 120 pedidos/hora por token → `429`.
- Lê com service role **filtrando sempre por `user_id` do token**.

### `resource`

| valor | conteúdo (resumido, sem colunas internas) |
|---|---|
| `summary` | perfil básico (nome, objetivos ativos), totais do período: treinos, corrida (km, tempo), refeições registadas, média de check-ins, próxima prova |
| `workouts` | sessões de ginásio do período, com exercícios e séries |
| `runs` | corridas do período (data, distância, duração, ritmo, FC média se houver) |
| `meals` | refeições do período, com itens e totais de macros |
| `checkins` | check-ins diários (sono, energia, humor, etc.) e água |
| `body` | avaliações corporais do período |
| `races` | provas futuras e as do período, com resultado/objetivo |
| `goals` | objetivos atuais e histórico de alterações |

**Fora nesta fase:** mensagens e notas do coach, memória da Carol, dados da Taça/rankings (envolvem outros atletas), push, logs.

### Respostas

- `200` → `{ "resource": "...", "from": "...", "to": "...", "timezone": "Europe/Lisbon", "data": ... }` — datas no fuso do utilizador, unidades explícitas nos nomes (`distance_km`, `duration_s`).
- `400` `{ "error": "bad_request" }`, `401` `{ "error": "unauthorized" }`, `429` `{ "error": "rate_limited" }`, `500` `{ "error": "internal" }` (detalhe só no log).

## App (Frontend)

Em **Perfil**, secção nova "Assistente executiva":

- Texto curto: o que a assistente pode ver (lista dos `resource`), que é só leitura e que se revoga aqui.
- Botão "Gerar acesso" → `create_assistant_token('Assistente executiva')` → mostra o token **uma vez**, com botão copiar e aviso de que não volta a aparecer.
- Lista dos tokens ativos: `token_prefix…`, criado em, último uso → botão "Revogar" com confirmação.
- Erro `max_tokens` → mensagem no tom da app, sem códigos.
- Modo demo: mock, sem chamar o Supabase.

## Ordem

1. Backend: migration (aplicada à mão no Supabase antes do push), RPCs, função, testes de isolamento.
2. Frontend: em paralelo contra este contrato (RPCs com mock até a migration estar aplicada).
3. Coordenador integra: primeiro a migration aplicada, depois push.
4. Depois: decidir como a assistente consome (HTTP direto ou servidor MCP por cima desta função).
