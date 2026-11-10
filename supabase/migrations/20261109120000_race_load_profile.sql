-- O perfil de carga por prova (pedido do Rui, 2026-11-09).
--
-- A Patty recebeu no mesmo dia dois alertas da Carol que se contradiziam:
-- «estás a esforçar-te demasiado» (a carga) e «fazes poucos km para a meia»
-- (o volume). Cada um certo sozinho, incoerentes juntos. A decisão passa a ser
-- do atleta, por prova:
--   prudente     — como até aqui (base baixa: +10 km sobre a média das 3
--                  semanas antes; senão ACWR 1,5).
--   mais_volume  — base baixa: +15 km; nunca acima do ACWR 1,5 com base normal.
-- Manda o perfil da próxima prova principal (_shared/formulas/loadProfile.ts).
--
-- load_profile_at: quando o atleta escolheu (null = por escolher — e é aí que
-- a app mostra o conflito). load_profile_reverted_at / _reason: um sinal
-- vermelho (dor, RPE ≥ 9 em 2 corridas fáceis seguidas, recuperação em
-- crítico) voltou o Mais volume a Prudente sozinho.
--
-- O atleta grava a escolha com um update direto (RLS "own rows" já cobre
-- race_events). Sem dados a migrar: o default deixa tudo como estava.

alter table public.race_events
  add column if not exists load_profile text not null default 'prudente',
  add column if not exists load_profile_at timestamptz,
  add column if not exists load_profile_reverted_at timestamptz,
  add column if not exists load_profile_revert_reason text;

alter table public.race_events
  drop constraint if exists race_events_load_profile_check;
alter table public.race_events
  add constraint race_events_load_profile_check check (load_profile in ('prudente', 'mais_volume'));

alter table public.race_events
  drop constraint if exists race_events_load_profile_revert_reason_check;
alter table public.race_events
  add constraint race_events_load_profile_revert_reason_check
  check (load_profile_revert_reason is null or load_profile_revert_reason in ('dor', 'rpe_alto', 'recuperacao_critica'));

comment on column public.race_events.load_profile is
  'Perfil de carga escolhido pelo atleta para esta prova: prudente (defeito) ou mais_volume. Manda o da próxima prova principal (loadProfile.ts).';
comment on column public.race_events.load_profile_at is
  'Quando o atleta escolheu o perfil (null = por escolher: a app mostra o conflito carga/volume).';
comment on column public.race_events.load_profile_reverted_at is
  'Quando um sinal vermelho voltou o Mais volume a Prudente sozinho.';
comment on column public.race_events.load_profile_revert_reason is
  'O sinal vermelho que voltou a Prudente: dor, rpe_alto ou recuperacao_critica.';
