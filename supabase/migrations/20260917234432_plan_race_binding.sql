-- ============================================================================
-- O plano é para uma prova — specs/plano-vinculado-a-prova.md
-- ============================================================================
-- O grande objetivo da app é um plano que leva o atleta a uma prova, mas
-- coach_plans só tinha period_start/period_end: não sabia para que prova era.
-- Daí um plano poder acabar antes ou depois da prova, duas provas principais
-- coexistirem sem ninguém reparar (o taper de 10-21 dias de cada uma é
-- incompatível com treinar para a outra), e uma prova criada depois do plano
-- só aparecer como aviso dispensável, igual para uma principal e para uma de
-- treino.
--
-- Esta migration só acrescenta as colunas e mantém period_end coerente com a
-- data da prova. A regra "entre hoje e o objetivo só há uma principal" é
-- imposta em propose_training_plan (coach-chat), não aqui: depende do
-- histórico e da conversa, não é uma invariante de linha.
-- ============================================================================
-- APLICADA EM PRODUÇÃO a 2026-09-17 23:44 UTC (version 20260917234432).
-- O deploy-edge-functions.yml NÃO corre migrations — só functions deploy —,
-- por isso esta foi aplicada à mão ANTES do deploy da coach-chat que passou a
-- inserir race_id. Pela ordem contrária, todas as propostas de plano falhavam.
-- Verificado depois: 12 planos existentes, todos com race_id null (a coluna é
-- nullable e o código trata null como plano sem prova).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. coach_plans.race_id — a prova-objetivo
-- ---------------------------------------------------------------------------
-- on delete set null (e não cascade): apagar a prova não pode apagar o plano
-- que o atleta cumpriu. Fica um plano sem objetivo, e o cliente deteta-o
-- (planDivergence, motivo plan_lost_race).
alter table coach_plans
  add column if not exists race_id uuid references race_events(id) on delete set null;

comment on column coach_plans.race_id is
  'A prova-objetivo deste plano. Quando preenchido, period_end é a data da '
  'prova — nesse dia o plano termina (trigger coach_plans_race_end abaixo). '
  'Null = plano sem prova (base aeróbica, regresso de lesão), que só é '
  'válido quando não há prova agendada dentro do período. Ver '
  'specs/plano-vinculado-a-prova.md §2.';

create index if not exists coach_plans_race_idx on coach_plans(race_id)
  where race_id is not null;

-- ---------------------------------------------------------------------------
-- 2. race_events.conflict_acknowledged_at — "fica assim"
-- ---------------------------------------------------------------------------
-- A Carol tenta, não impõe: no fim fica como o atleta quiser. Mas uma decisão
-- tomada não pode voltar a ser pedida, senão a app passa a insistir. Isto é o
-- que torna "mantenho as duas como principais" uma decisão durável em vez de
-- uma dispensa local (localStorage), que se perde ao trocar de dispositivo e
-- fazia a mesma conversa recomeçar.
alter table race_events
  add column if not exists conflict_acknowledged_at timestamptz;

comment on column race_events.conflict_acknowledged_at is
  'O atleta decidiu conscientemente manter esta prova como está, apesar do '
  'conflito com o plano ativo. Escrito pela Carol (update_race_event, '
  'conflict_acknowledged). A deteção de conflito no cliente ignora provas '
  'com isto preenchido. Volta a null se a data ou a prioridade mudarem '
  '(trigger race_events_reset_conflict_ack) — uma decisão sobre esta prova '
  'como secundária no dia 12 não vale para ela mudada para o dia 20. Ver '
  'specs/plano-vinculado-a-prova.md §3.';

-- ---------------------------------------------------------------------------
-- 3. A data da prova mudou → o plano acompanha
-- ---------------------------------------------------------------------------
-- period_end é a única coisa que o cliente lê para saber se um plano está
-- ativo (planDivergence, WeeklyPlanCard, PlanoScreen). Sem isto, adiar a
-- prova deixava o plano a terminar antes dela, e antecipá-la deixava dias
-- planeados depois da prova ter acontecido.
create or replace function public.sync_plan_end_to_race_date()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.date is distinct from old.date then
    -- Itens que ficaram fora do período novo (prova antecipada) passam a
    -- cancelado: um treino planeado para depois da prova já não se faz. Fica
    -- o rasto na nota, para o atleta perceber porque desapareceu do plano.
    update coach_plan_items i
    set status = 'cancelado',
        notes = coalesce(nullif(i.notes, ''), '') ||
                case when coalesce(i.notes, '') = '' then '' else ' ' end ||
                '(cancelado: a prova passou para ' || to_char(new.date, 'YYYY-MM-DD') || ')'
    from coach_plans p
    where i.plan_id = p.id
      and p.race_id = new.id
      and p.status in ('proposto', 'aceite')
      and i.status = 'pendente'
      and i.planned_date > new.date;

    update coach_plans
    set period_end = new.date
    where race_id = new.id
      and status in ('proposto', 'aceite');
  end if;

  -- Mudar a data OU a prioridade torna a decisão anterior obsoleta: já não é
  -- a mesma pergunta. Só se limpa quando havia decisão, para o update não
  -- escrever por escrever.
  if (new.date is distinct from old.date or new.race_priority is distinct from old.race_priority)
     and old.conflict_acknowledged_at is not null
     and new.conflict_acknowledged_at is not distinct from old.conflict_acknowledged_at then
    new.conflict_acknowledged_at := null;
  end if;

  return new;
end;
$$;

-- BEFORE: o reset de conflict_acknowledged_at escreve em new, que só vale
-- antes da gravação. O update aos planos/itens é noutras tabelas, por isso
-- funciona igual aqui.
drop trigger if exists race_events_sync_plan_end on race_events;
create trigger race_events_sync_plan_end
  before update of date, race_priority on race_events
  for each row execute function public.sync_plan_end_to_race_date();
