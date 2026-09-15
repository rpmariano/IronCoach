-- ============================================================================
-- medal_awards — as medalhas do Palmarés (specs/palmares-medalhoes.md, "Dados").
--
-- Porquê: os seis medalhões recalculam-se dos dados que já existem
-- (src/utils/medalhoes.js), mas três coisas não: QUANDO se ganhou, as
-- RE-CUNHAGENS ("Mês ganho 2×", os recordes anteriores) e se o atleta JÁ VIU
-- o momento da medalha. É só isso que esta tabela guarda.
--
-- Uma linha por (medalhão, encaixe, período): a chave única torna a
-- sincronização idempotente — src/utils/medalAwards.js faz upsert com
-- ignoreDuplicates, e dois dispositivos a sincronizar ao mesmo tempo não
-- duplicam nada.
--
-- period_key: '2026-08' | '2026-Q3' | '2026-H2' | '2026' (O Ano em Km),
-- o id da prova (Os Recordes, A Época), a segunda-feira da semana em que a
-- sequência chegou a N (A Consistência), '' quando o encaixe só se ganha uma
-- vez (As Distâncias, A Superação).
--
-- seen_at null = o momento da medalha ainda está por mostrar. A primeira
-- sincronização grava já visto o que tem mais de uma semana, para não abrir a
-- app com uma tempestade de animações; o que é desta semana fica por ver.
--
-- ATENÇÃO: é produção. Só se aplica com pedido explícito.
-- ============================================================================

create table if not exists public.medal_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  medalhao text not null
    check (medalhao in ('ano_km', 'distancias', 'recordes', 'epoca', 'consistencia', 'superacao')),
  slot text not null,
  period_key text not null default '',
  -- km (O Ano em Km), segundos (Os Recordes, A Época), semanas / objetivos.
  value numeric,
  -- on delete set null: apagar a prova não apaga a memória da medalha.
  race_id uuid references public.race_events(id) on delete set null,
  awarded_at timestamptz not null default now(),
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, medalhao, slot, period_key)
);

-- O momento da medalha pergunta sempre "o que falta ver deste atleta".
create index if not exists medal_awards_user_seen_idx on public.medal_awards(user_id, seen_at);

alter table public.medal_awards enable row level security;

drop policy if exists "own medal_awards select" on public.medal_awards;
create policy "own medal_awards select" on public.medal_awards
  for select using (auth.uid() = user_id);

drop policy if exists "own medal_awards insert" on public.medal_awards;
create policy "own medal_awards insert" on public.medal_awards
  for insert with check (auth.uid() = user_id);

drop policy if exists "own medal_awards update" on public.medal_awards;
create policy "own medal_awards update" on public.medal_awards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.medal_awards is
  'Medalhas do Palmarés já ganhas: quando, re-cunhagens e se o momento foi visto. As regras vivem em src/utils/medalhoes.js; a sincronização em src/utils/medalAwards.js.';
