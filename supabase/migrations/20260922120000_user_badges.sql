-- ============================================================================
-- user_badges — os badges de treino (reforma da gamificação, fase 2)
--
-- NÃO APLICADA. Este ficheiro é só o desenho escrito; a aplicação é um pedido
-- à parte, com o cuidado habitual (CLAUDE.md: a BD é produção real).
--
-- Porquê uma tabela, se as regras vivem em código: as REGRAS vivem mesmo em
-- código (src/utils/badges.js), e é lá que ficam — "90% do tempo em Z2" não é
-- um limiar numa linha, é um cálculo sobre runs.details, e uma tabela de
-- definições obrigaria a um interpretador de regras que ninguém pediu. Isto
-- guarda só o que NÃO se recalcula dos dados:
--   · QUANDO se ganhou (awarded_at);
--   · as REPETIÇÕES — uma linha por period_key, contadas com count(*). Nunca
--     um contador mutável numa coluna: um contador perde as datas, e é das
--     datas que se faz a história ("a última foi a 7 de setembro");
--   · se o atleta JÁ VIU o momento (seen_at) — a fase 4.
-- O estado "a caminho" NÃO se persiste: é cálculo do dia, como os encaixes
-- vazios dos medalhões.
--
-- APPEND-ONLY: a escrita é `insert ... on conflict do nothing`
-- (src/utils/badgeAwards.js, upsert com ignoreDuplicates). Não há política de
-- DELETE de propósito — recalcular com uma regra afinada pode deixar de
-- propor um badge, mas não pode RETIRAR um que já foi visto.
--
-- Diferenças deliberadas face a medal_awards (20260915120000), que é o molde:
--   · `tier` é COLUNA PRÓPRIA. O Palmarés meteu o nível (bronze/prata/ouro)
--     dentro do period_key para não fazer migração, e isso é dívida: o
--     period_key passou a querer dizer duas coisas conforme o medalhão. Num
--     modelo novo não se repete.
--   · `value_unit` diz o que é o `value`. Em medal_awards o número é km numas
--     linhas e segundos noutras, e quem lê tem de adivinhar pela chave.
-- ============================================================================

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- A chave do badge em src/utils/badges.js (BADGE_KEYS). Sem `check (in ...)`
  -- com a lista: badges novos são código, e uma lista aqui obrigava a uma
  -- migração em produção a cada badge novo — ao contrário de medalhao, que é
  -- um conjunto fechado de seis. O limite de comprimento é a única guarda.
  badge_key text not null check (char_length(badge_key) between 1 and 60),
  -- O nível, nos badges que têm escala (A Escalada, a Coruja). '' = badge sem
  -- níveis.
  --
  -- É `not null default ''` e NÃO `null`, e a razão é a chave única lá em
  -- baixo: em Postgres dois NULL são DISTINTOS num índice único (o default é
  -- NULLS DISTINCT), por isso um `tier` nulo fazia a chave deixar de dedupar
  -- — o `on conflict do nothing` nunca encontrava conflito e cada
  -- sincronização gravava outra linha do MESMO badge. Com '' a chave fecha.
  -- É a mesma convenção que period_key já usa aqui e em medal_awards.
  tier text not null default '' check (tier in ('', 'bronze', 'prata', 'ouro')),
  -- O período/ocorrência que distingue as repetições: o id da corrida
  -- (Mestre da Z2, Negative split, Cabra-montesa), a segunda-feira da semana
  -- (Semana 100%, Descanso cumprido), o id da prova (Recorde pessoal), ''
  -- quando o badge se ganha uma vez por nível (A Escalada, a Coruja).
  period_key text not null default '',
  -- O número que o badge gravou. A unidade está na coluna ao lado.
  value numeric,
  value_unit text check (value_unit is null or value_unit in ('pct', 'count', 'seconds', 'km', 'vdot', 'metros')),
  -- Só os badges que nascem de uma prova (hoje: recorde_pessoal). on delete
  -- set null: apagar a prova não apaga a memória do badge.
  race_id uuid references public.race_events(id) on delete set null,
  awarded_at timestamptz not null default now(),
  -- null = o momento da conquista ainda está por mostrar (fase 4). A primeira
  -- sincronização grava já visto o que tem mais de uma semana, para não abrir
  -- a app com uma tempestade de animações.
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, badge_key, tier, period_key)
);

-- O momento da conquista pergunta sempre "o que falta ver deste atleta".
create index if not exists user_badges_user_seen_idx on public.user_badges(user_id, seen_at);

alter table public.user_badges enable row level security;

-- Convenção do projeto: "own rows" + "admin read all". O "own rows" parte-se
-- em três — select, insert, update — DE PROPÓSITO: um `for all` dava também
-- DELETE, e um badge ganho não se apaga (ver "append-only" acima). Sem
-- política de delete, o RLS nega-a por omissão.
drop policy if exists "own user_badges select" on public.user_badges;
create policy "own user_badges select" on public.user_badges
  for select using (auth.uid() = user_id);

drop policy if exists "own user_badges insert" on public.user_badges;
create policy "own user_badges insert" on public.user_badges
  for insert with check (auth.uid() = user_id);

-- O update existe por uma coluna só: seen_at, quando o atleta vê o momento.
drop policy if exists "own user_badges update" on public.user_badges;
create policy "own user_badges update" on public.user_badges
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "admin read all user_badges" on public.user_badges;
create policy "admin read all user_badges" on public.user_badges
  for select using (public.is_admin());

-- Integridade referencial cruzada, no molde de "runs race_id own race"
-- (20260912222014): a RLS "own rows" valida o user_id, mas a verificação da
-- chave estrangeira IGNORA RLS — um cliente podia gravar um badge com o
-- race_id de uma prova de OUTRO atleta (sem fuga de dados, porque não a
-- consegue ler, mas fica uma ligação que não devia existir). Policy
-- RESTRITIVA: soma-se à permissiva em vez de a alargar; `using (true)` não
-- tira nada às leituras, o `with check` é que fecha a porta.
drop policy if exists "user_badges race_id own race" on public.user_badges;
create policy "user_badges race_id own race" on public.user_badges
  as restrictive
  for all
  using (true)
  with check (
    race_id is null
    or exists (
      select 1 from public.race_events r
      where r.id = race_id and r.user_id = auth.uid()
    )
  );

comment on table public.user_badges is
  'Badges de treino já ganhos: quando, repetições (uma linha por period_key) e '
  'se o momento foi visto. As regras vivem em src/utils/badges.js; a '
  'sincronização em src/utils/badgeAwards.js. Append-only.';

comment on column public.user_badges.tier is
  'Nível do badge: '''' (sem níveis), bronze, prata ou ouro. Coluna própria — '
  'não enfiado no period_key, como o Palmarés fez.';

comment on column public.user_badges.value_unit is
  'A unidade de `value`: pct, count, seconds, km, vdot ou metros.';
