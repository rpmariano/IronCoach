-- ============================================================================
-- O plano que perde a prova tem de o saber — achados M1 e M3 da revisão
-- pré-deploy de 2026-09-18 (specs/plano-vinculado-a-prova.md §3 e §4.3)
-- ============================================================================
-- APLICADA EM PRODUÇÃO a 2026-09-18 07:47 UTC (version 20260918074705).
-- Testada lá mesmo, num bloco que criava provas e planos de teste e abortava
-- no fim (nada ficou gravado): prova antecipada mas dentro do plano → encurta
-- e cancela só o que fica depois; antecipada para antes do início → perde a
-- prova com os itens intactos; apagada → perde a prova; proposta dessa prova
-- → recusada; plano invertido → recusado pela restrição.
-- ============================================================================
--
-- M1. Apagar a prova-objetivo deixava o plano sem sinal nenhum. A FK
-- coach_plans.race_id é `on delete set null` (de propósito: apagar a prova
-- não pode apagar o plano cumprido), e isso punha o race_id a null — que é
-- exatamente o estado de um plano de base legítimo, sem prova. O cliente
-- não tinha como distinguir "nunca teve prova" de "perdeu a prova", e o
-- motivo `plano_sem_prova` que o devia avisar era código morto.
-- race_lost_at é essa diferença, gravada no momento em que acontece.
--
-- M3. Antecipar uma prova para ANTES do início do plano deixava
-- period_end < period_start: o trigger cancelava todos os itens pendentes e
-- o plano desaparecia do cliente (inPlanPeriod ficava vazio), sem aviso.
-- Um plano que já não contém a sua prova não é um plano encurtado — é um
-- plano que ficou sem ela. Passa a ser tratado como tal: desvincula-se e
-- marca-se race_lost_at, com os itens intactos, e a Carol trata do resto.
-- E a invariante que faltava fica na tabela, para nenhum outro caminho a
-- poder partir.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. coach_plans.race_lost_at
-- ---------------------------------------------------------------------------
alter table coach_plans
  add column if not exists race_lost_at timestamptz;

comment on column coach_plans.race_lost_at is
  'O plano tinha uma prova-objetivo e perdeu-a: a prova foi apagada, ou '
  'mudou para antes do início do plano. Com race_id null, é o que distingue '
  'um plano que ficou sem objetivo de um plano de base que nunca o teve. '
  'O cliente mostra-o como divergência (plano_sem_prova, '
  'src/utils/planDivergence.js). Ver specs/plano-vinculado-a-prova.md §4.2.';

-- ---------------------------------------------------------------------------
-- 2. A invariante do período
-- ---------------------------------------------------------------------------
-- Verificado antes de aplicar: 0 linhas com period_end < period_start.
alter table coach_plans
  drop constraint if exists coach_plans_period_order;
alter table coach_plans
  add constraint coach_plans_period_order check (period_end >= period_start);

-- ---------------------------------------------------------------------------
-- 3. A data da prova mudou — agora com o caso da prova antes do plano
-- ---------------------------------------------------------------------------
create or replace function public.sync_plan_end_to_race_date()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.date is distinct from old.date then
    -- A prova passou para ANTES do início do plano: o plano já não a contém.
    -- Não se encurta (daria period_end < period_start, que a restrição acima
    -- agora recusa e que antes fazia o plano desaparecer): perde a prova.
    -- Uma proposta ainda por decidir fica inválida — a Carol propõe outra.
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

    -- Caso normal (a prova continua dentro do plano): o plano acompanha-a e
    -- os treinos que ficaram para lá dela cancelam-se, com o rasto na nota.
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

  if (new.date is distinct from old.date or new.race_priority is distinct from old.race_priority)
     and old.conflict_acknowledged_at is not null
     and new.conflict_acknowledged_at is not distinct from old.conflict_acknowledged_at then
    new.conflict_acknowledged_at := null;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. A prova foi apagada — marca-se ANTES de a FK pôr o race_id a null
-- ---------------------------------------------------------------------------
-- BEFORE DELETE porque depois já não há race_id por onde encontrar o plano:
-- o `on delete set null` da FK corre como parte do próprio delete.
create or replace function public.mark_plan_race_lost()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update coach_plans
  set race_lost_at = now()
  where race_id = old.id
    and status = 'aceite';

  -- Uma proposta para uma prova que deixou de existir não tem para onde ir.
  update coach_plans
  set status = 'recusado'
  where race_id = old.id
    and status = 'proposto';

  return old;
end;
$$;

drop trigger if exists race_events_mark_plan_race_lost on race_events;
create trigger race_events_mark_plan_race_lost
  before delete on race_events
  for each row execute function public.mark_plan_race_lost();

-- ---------------------------------------------------------------------------
-- 5. Funções de trigger não se expõem como RPC
-- ---------------------------------------------------------------------------
-- A lição da migration 20260918001600: as funções de trigger são SECURITY
-- DEFINER e ficavam invocáveis por anon/authenticated. A nova nasce já
-- fechada; a sync_plan_end_to_race_date mantém o ACL que já tinha (o
-- `create or replace` não o repõe), mas revoga-se de novo por segurança.
revoke execute on function public.mark_plan_race_lost() from public, anon, authenticated;
revoke execute on function public.sync_plan_end_to_race_date() from public, anon, authenticated;
