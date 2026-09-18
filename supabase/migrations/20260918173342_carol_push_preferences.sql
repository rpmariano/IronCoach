-- ============================================================================
-- As preferências das notificações da Carol
-- (specs/carol-omnisciencia-omnipresenca.md, ação P.6)
-- APLICADA EM PRODUÇÃO a 2026-09-18 17:33 UTC (version 20260918173342).
-- Testada lá numa transação revertida: o check recusa um tipo desconhecido.
-- ============================================================================
--
-- Até aqui o coach-proactive-tick só notificava quem tinha os lembretes de
-- ÁGUA ligados — o único interruptor que existia. Agora a Carol tem o seu:
--   carol_push_enabled      opt-in, desligado por omissão;
--   carol_push_start_hour   janela, em horas de Lisboa (9h por omissão);
--   carol_push_end_hour     … até (exclusivo; 21h por omissão);
--   carol_push_max_per_day  1 a 3 por dia (1 por omissão);
--   carol_push_types        os momentos que o atleta aceita.
-- ============================================================================

alter table public.profiles
  add column if not exists carol_push_enabled boolean not null default false,
  add column if not exists carol_push_start_hour smallint not null default 9 check (carol_push_start_hour between 0 and 23),
  add column if not exists carol_push_end_hour smallint not null default 21 check (carol_push_end_hour between 0 and 23),
  add column if not exists carol_push_max_per_day smallint not null default 1 check (carol_push_max_per_day between 1 and 3),
  add column if not exists carol_push_types text[] not null default array['race_morning','race_eve','race_after','silence']
    check (carol_push_types <@ array['race_morning','race_eve','race_after','silence']);

comment on column public.profiles.carol_push_enabled is
  'O atleta aceita notificações da Carol (coach-proactive-tick). Desligado por omissão: é opt-in.';
comment on column public.profiles.carol_push_start_hour is 'Início da janela das notificações da Carol, hora de Lisboa.';
comment on column public.profiles.carol_push_end_hour is 'Fim da janela das notificações da Carol, hora de Lisboa (exclusivo).';
comment on column public.profiles.carol_push_max_per_day is 'Máximo de notificações da Carol por dia (1 a 3).';
comment on column public.profiles.carol_push_types is 'Os momentos que o atleta aceita ser notificado: race_morning, race_eve, race_after, silence.';
