-- ============================================================================
-- Fechar o acesso por RPC às funções privilegiadas
-- (avisos 0028/0029 do linter de segurança do Supabase, 2026-09-24)
-- APLICADA EM PRODUÇÃO a 2026-09-24 23:54 UTC (version 20260924235403).
-- Testada lá numa transação revertida, com os papéis reais: como anon, as
-- 28 tabelas (e storage.objects) respondem sem erro e as três funções deixam
-- de ser chamáveis; como authenticated, tudo responde; o admin continua a
-- ver todos os perfis e a chamar admin_list_users. O precedente do trigger:
-- enforce_cycle_consent já só tem EXECUTE para postgres/service_role e os
-- check-ins continuam a gravar.
--
-- Depois dela, o linter deixa de dar o 0028 (anon) nas quatro funções. Ficam
-- três 0029 (authenticated), DE PROPÓSITO: o painel Admin chama
-- admin_list_users com sessão, e as políticas precisam de que authenticated
-- execute is_admin() e can_review_bugs(). Nenhuma responde sobre mais
-- ninguém além de quem a chama. Tirá-las do alcance do RPC seria movê-las
-- para um schema não exposto e reescrever as 32 políticas — sem ganho.
-- ============================================================================
--
-- Quatro funções SECURITY DEFINER eram executáveis por anon e authenticated
-- via /rest/v1/rpc/<nome> — o EXECUTE por omissão (PUBLIC) do schema public.
-- Nenhuma expunha dados: admin_list_users() já filtra por is_admin() lá
-- dentro, is_admin() e can_review_bugs() só dizem se QUEM CHAMA é admin ou
-- revisor (false para um anónimo), e handle_new_user() é um trigger (chamada
-- à mão, falha). Mas o acesso não é intencional, e fecha-se:
--
-- 1. handle_new_user() — o trigger de auth.users → profiles. Um trigger
--    dispara sem precisar do EXECUTE de quem insere: o mesmo padrão de
--    enforce_cycle_consent (daily_checkins), que corre nos check-ins de
--    atletas autenticados com o EXECUTE revogado.
-- 2. admin_list_users() — só o painel Admin a chama, com sessão.
-- 3. is_admin() e can_review_bugs() — entram em 32 políticas RLS, todas
--    "to public". As políticas correm com os privilégios de quem consulta, e
--    o Postgres verifica o EXECUTE ao preparar a expressão: sem mais nada,
--    tirar o EXECUTE ao anon fazia uma consulta anónima a qualquer destas
--    tabelas (e a storage.objects) dar ERRO de permissão em vez de vazio.
--    Por isso as políticas passam primeiro a "to authenticated" — o que não
--    muda o que ninguém vê: um anónimo nunca é admin nem revisor, a função
--    devolvia-lhe false — e só depois o anon perde o EXECUTE.
--
-- REGRA DAQUI PARA A FRENTE: uma política de admin nova usa "to
-- authenticated" (create policy "admin read all …" on … for select to
-- authenticated using (public.is_admin())). "to public" com is_admin() faz a
-- consulta de um anónimo falhar. A verificação no fim desta migration
-- documenta o estado em que isto fica.
--
-- A proteção de passwords comprometidas (Auth → "Leaked Password
-- Protection") também foi reportada: é uma definição do Auth, liga-se no
-- dashboard do Supabase, não por migration.
-- ============================================================================

-- 1. O trigger.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2. A lista de utilizadores do Admin.
revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated, service_role;

-- 3a. As políticas de admin e de revisor passam a aplicar-se só a quem tem sessão.
alter policy "admin read all logs" on public.app_logs to authenticated;
alter policy "admin write mappings" on public.app_screen_mappings to authenticated;
alter policy "admin read all" on public.body_assessments to authenticated;
alter policy "admin insert notifications" on public.bug_notifications to authenticated;
alter policy "admin read notifications" on public.bug_notifications to authenticated;
alter policy "admin read bug reports" on public.bug_reports to authenticated;
alter policy "admin update bug reports" on public.bug_reports to authenticated;
alter policy "admin read all" on public.coach_daily_summary to authenticated;
alter policy "admin read all" on public.coach_goal_proposals to authenticated;
alter policy "admin read all coach_impressions" on public.coach_impressions to authenticated;
alter policy "admin read all interventions" on public.coach_interventions to authenticated;
alter policy "admin read all" on public.coach_messages to authenticated;
alter policy "admin read all" on public.coach_notes to authenticated;
alter policy "admin read all" on public.coach_plan_items to authenticated;
alter policy "admin read all" on public.coach_plans to authenticated;
alter policy "admin read all proactive log" on public.coach_proactive_log to authenticated;
alter policy "admin read all recommendations" on public.coach_recommendations to authenticated;
alter policy "admin read all" on public.meal_items to authenticated;
alter policy "admin read all" on public.meals to authenticated;
alter policy "admin read bug report photos" on storage.objects to authenticated;
alter policy "admin read all privacy_consents" on public.privacy_consents to authenticated;
alter policy "admin read all" on public.profiles to authenticated;
alter policy "admin read all" on public.push_subscriptions to authenticated;
alter policy "admin read all" on public.race_events to authenticated;
alter policy "admin read all" on public.runs to authenticated;
alter policy "admin delete unknown logs" on public.unknown_app_image_logs to authenticated;
alter policy "admin read unknown logs" on public.unknown_app_image_logs to authenticated;
alter policy "admin update unknown logs" on public.unknown_app_image_logs to authenticated;
alter policy "admin read all user_badges" on public.user_badges to authenticated;
alter policy "admin read all" on public.water_logs to authenticated;
alter policy "admin read all" on public.workout_session_sets to authenticated;
alter policy "admin read all" on public.workout_sessions to authenticated;

-- 3b. Só depois, o anon perde o EXECUTE.
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.can_review_bugs() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.can_review_bugs() to authenticated, service_role;

-- Nenhuma política que um anónimo avalie pode ficar a chamar estas funções:
-- se alguma escapou à lista acima, a migration falha inteira.
do $$
declare
  left_over text;
begin
  select string_agg(c.relname || '.' || pol.polname, ', ') into left_over
  from pg_policy pol join pg_class c on c.oid = pol.polrelid
  where (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ~* '(is_admin|can_review_bugs)\('
      or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~* '(is_admin|can_review_bugs)\(')
    and (0 = any(pol.polroles) or 'anon'::regrole::oid = any(pol.polroles));
  if left_over is not null then
    raise exception 'Políticas ainda avaliadas por anon com is_admin()/can_review_bugs(): %', left_over;
  end if;
end $$;
