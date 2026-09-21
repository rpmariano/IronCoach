-- ============================================================================
-- O que a Carol diz no cliente fica registado (specs/carol-omnisciencia-omnipresenca.md, 5.1)
-- Aplicada à mão em produção a 2026-09-21 (testada antes numa transação revertida).
-- O workflow só faz deploy das funções, não das migrations. Sem esta, cada
-- logImpression 'welcome'/'moment' do cliente falha com 23514 dentro de
-- try/console.warn: a app não parte, mas não grava nada e ninguém dá por isso.
-- ============================================================================
--
-- coach_impressions.kind aceitava só o que o Início mostrava (daily_card, alert,
-- insights). Passa a aceitar as boas-vindas ao abrir a app (welcome), os
-- momentos do Início (moment) e a notificação tocada (push, escrita pela P.9).
-- A constraint chama-se coach_impressions_kind_check por convenção do Postgres:
-- em 20260918151242_daily_checkins.sql o check foi criado inline, sem nome.

alter table public.coach_impressions drop constraint if exists coach_impressions_kind_check;
alter table public.coach_impressions add constraint coach_impressions_kind_check
  check (kind in ('daily_card', 'alert', 'insights', 'welcome', 'moment', 'push'));
comment on column public.coach_impressions.kind is
  'daily_card, alert, insights: o que o Início mostrou. welcome: as boas-vindas ao abrir a app (title = as frases, sem saudação). moment: um momento no Início (semana cumprida, dia fechado, marco da prova; title null). push: a notificação da Carol que o atleta tocou (P.9; a chave é a de coach_proactive_pushes).';
