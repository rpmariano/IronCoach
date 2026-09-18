-- ============================================================================
-- "O plano encurtou" — o último ponto em aberto da revisão pré-deploy de
-- 2026-09-18 (specs/plano-vinculado-a-prova.md §4.3)
-- ============================================================================
-- APLICADA EM PRODUÇÃO a 2026-09-18 08:11 UTC (version 20260918081148).
-- Testada lá num bloco que abortava no fim: prova antecipada com treinos
-- depois → encurta e marca; antecipada sem nada depois → encurta e NÃO
-- marca; adiada → não marca.
-- ============================================================================
--
-- Quando uma prova-objetivo é antecipada, o trigger encurta o plano até ao
-- dia novo e cancela os treinos que ficavam depois. O rasto era só uma nota
-- em cada item cancelado — o atleta via "a prova não está no plano" (o item
-- de prova do dia antigo também é cancelado), mas não o PORQUÊ, nem que
-- tinha perdido treinos. trimmed_at é esse porquê, gravado no momento em que
-- acontece, e só quando algum treino foi mesmo cancelado: encurtar um plano
-- que não tinha nada para lá do dia novo não merece aviso nenhum.
-- ============================================================================

alter table coach_plans
  add column if not exists trimmed_at timestamptz;

comment on column coach_plans.trimmed_at is
  'A prova-objetivo foi antecipada e o plano encurtou até ela, com treinos '
  'cancelados pelo caminho. Escrito pelo trigger sync_plan_end_to_race_date; '
  'limpo quando a Carol ajusta o plano (respondToPlan, caso A). O cliente '
  'mostra-o como divergência (plano_encurtou, src/utils/planDivergence.js).';

create or replace function public.sync_plan_end_to_race_date()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.date is distinct from old.date then
    -- A prova passou para ANTES do início do plano: o plano perde-a (ver a
    -- migration 20260918074705). Uma proposta por decidir fica inválida.
    update coach_plans
    set race_id = null,
        race_lost_at = now()
    where race_id = new.id
      and status = 'aceite'
      and period_start > new.date;

    update coach_plans
    set status = 'recusado'
    where race_id = new.id
      and status = 'proposto'
      and period_start > new.date;

    -- Caso normal: cancela os treinos que ficaram para lá da prova e marca
    -- trimmed_at SÓ nos planos onde houve de facto algum cancelado — o CTE
    -- devolve os plan_id dos itens que mudou, e é por eles que se marca.
    with cancelados as (
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
        and i.planned_date > new.date
      returning i.plan_id
    )
    update coach_plans
    set trimmed_at = now()
    where id in (select distinct plan_id from cancelados)
      and status = 'aceite';

    update coach_plans
    set period_end = new.date
    where race_id = new.id
      and status in ('proposto', 'aceite');
  end if;

  if (new.date is distinct from old.date or new.race_priority is distinct from old.race_priority)
     and old.conflict_acknowledged_at is not null
     and new.conflict_acknowledged_at is not distinct from old.conflict_acknowledged_at then
    new.conflict_acknowledged_at := null;
  end if;

  return new;
end;
$$;

-- O `create or replace` mantém o ACL, mas revoga-se de novo para o ficheiro
-- ser completo por si só (lição da migration 20260918001600).
revoke execute on function public.sync_plan_end_to_race_date() from public, anon, authenticated;
