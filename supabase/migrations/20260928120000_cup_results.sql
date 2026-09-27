-- ============================================================================
-- Competições por jornadas — M2: o job da classificação (specs/trofeu.md §7,
-- §4.5–4.6, §6.4, §10 Fase 4)
--
-- POR APLICAR — precisa de autorização explícita do dono, depois do ensaio
-- revertido (scratchpad/ensaio_m2.sql, montado por build_ensaio_m2.sh a
-- partir DESTE texto: tem de acabar em "ENSAIO OK … 0 falhas"). Nome
-- provisório: ao aplicar, renomeia-se para a `version` real (como a M1).
--
-- PROCEDIMENTO DE APLICAÇÃO. Não há staging:
--   1. O código da Fase 4 (pacote 1: @formulas/cup.ts com a regra
--      `fim_ano_epoca`) tem de estar em produção ANTES desta migração: ela
--      põe `fim_ano_epoca` na 34.ª, e um cup.ts antigo lia-a como "no dia da
--      prova" (M35 em vez de M40 numa jornada de dezembro). Sem jornadas nem
--      inscritos na 34.ª a janela não tem efeito, mas a ordem mantém-se.
--      Com inscrições ATIVAS na 34.ª e age_rule ainda null, a M2 falha
--      inteira (nada aplicado) com a frase da guarda da regra de idade (§1):
--      o escalão das provas "Vou" já criadas ficava errado — decidir antes.
--      Em 2026-09-27 (SELECT): 34.ª "2026/27", age_rule null, 0 inscrições.
--   2. Corre inteira numa transação (begin/commit abaixo) com lock_timeout de
--      5 s. Só toca em tabelas cup_* (nada em race_events nem em profiles).
--      Com o limite, um pedido longo a segurar uma cup_* faz a migração
--      falhar sem aplicar nada, em vez de pôr a app em fila atrás dela.
--      O ensaio (bloco DO) tira as linhas begin/commit e fica com o resto.
--   3. O deploy-edge-functions.yml não corre migrações. O código da Fase 4
--      tolera a M2 em falta (42P01/42703/PGRST204/PGRST205 → comportamento
--      da Fase 3; o job não faz nada).
--   4. Depois: 34.ª com age_rule 'fim_ano_epoca' e os 32 escalões; advisors
--      sem os avisos de search_path de cup_band/cup_norm_text.
--   5. SEM cron aqui (o segredo não entra no git): cria-se à mão depois,
--      copiando o comando de um job existente (fase4-desenho.md, H.6).
-- ============================================================================
--
-- O QUE ESTÁ AQUI:
--   1. A idade pela época (`age_rule = 'fim_ano_epoca'`): o regulamento de
--      Cascais dá os escalões por ANO DE NASCIMENTO, com referência ao 2.º
--      ano da época (2026/27 → idade a 31/12/2027). Nenhuma regra da M1
--      acerta numa jornada de dezembro. Sem coluna nova: o ano sai do
--      season_label (cup_season_ref_year, gémea de seasonRefYear em
--      @formulas/cup.ts), e o CHECK garante que o rótulo se lê (2.º ano =
--      1.º + 1). Com inscrições ativas, a regra e a época não mudam (guarda).
--      cup_resolve_course refeita com a regra (o resto do corpo é o da M1).
--   2. O dorsal como chave: cup_norm_bib/cup_bib_key (gémeas de
--      normBib/bibKeyInput+sha256Hex em @formulas/cupResults.ts), colunas
--      novas em cup_results (bib_key, standings_key, points_source),
--      cup_enrollments.match_refused_key ("não sou eu") e
--      cup_team_results.points_source; mudar o dorsal apaga os "És tu?" do
--      dorsal antigo (trigger).
--   3. cup_standings (a linha DELE na classificação geral; own rows) e
--      cup_sync_state (o estado do job por página; só o admin lê; só
--      agregados — nunca nomes, dorsais ou clubes). cup_team_aliases passa
--      a ser lida só pelo admin (a M1 dava-a a quem tem sessão), e
--      cup_team_results só pelo admin e por quem tem inscrição ativa nesse
--      clube (lida por todos, dizia que clubes têm atletas da app).
--   4. RPCs do atleta: confirm_cup_result ("Sim, sou eu") e
--      reject_cup_result ("Não sou eu"); e as da geral pela chave
--      alternativa (1.º e último nome, quando a exata não acha nenhuma
--      linha): confirm_cup_standing / reject_cup_standing — a ligação fica
--      'proposta' em cup_standings até ele dizer que sim, e a recusa
--      (cup_enrollments.standings_refused_keys) nunca mais volta.
--   5. close_edition com a guarda do dono (não fecha sem jornadas nem antes
--      de passar a última) e o resumo com a geral oficial quando há; apaga
--      também os dados de correspondência novos.
--   6. search_path fixo em cup_band e cup_norm_text (advisors da M1).
--   7. Seed da 34.ª: age_rule 'fim_ano_epoca' e os 32 escalões do
--      regulamento (idades e percursos). O calendário continua fora.
--   8. Verificação — se falhar, a migração falha inteira.
--
-- SEM CONSENTIMENTO NOVO. A §7 aprovada não pede privacy_consents para a
-- correspondência: o dorsal é opcional e dado por ele, a 1.ª linha de cada
-- edição e dorsal só fica com o "sim" dele, e "não sou eu" nunca volta.
-- ============================================================================

begin;
-- Ver PROCEDIMENTO DE APLICAÇÃO no cabeçalho.
set local lock_timeout = '5s';
set local statement_timeout = '60s';


-- ────────────────────────────────────────────────────────────────────────────
-- 1. A idade pela época
-- ────────────────────────────────────────────────────────────────────────────

-- "2026/27" → 2027, "2026/2027" → 2027, "1999/00" → 2000, "2027" → 2027;
-- outro formato, ou um fim que não é o início nem o ano seguinte → null.
-- Os mesmos casos que seasonRefYear (SEASON_REF_YEAR_CASES, cup.fixtures.ts).
create or replace function public.cup_season_ref_year(p_label text)
returns integer
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case when y between a and a + 1 then y end
  from (select m[1]::int as a,
               case when m[2] is null then m[1]::int
                    when length(m[2]) = 4 then m[2]::int
                    else (m[1]::int / 100) * 100 + m[2]::int
                         + case when m[2]::int < m[1]::int % 100 then 100 else 0 end end as y
          from (select regexp_match(coalesce(p_label, ''),
                  '^\s*(\d{4})\s*(?:/\s*(\d{2}|\d{4}))?\s*$') as m) s
         where m is not null) t
$$;

revoke execute on function public.cup_season_ref_year(text) from public, anon, authenticated;

alter table public.cup_editions drop constraint if exists cup_editions_age_rule_check;
alter table public.cup_editions add constraint cup_editions_age_rule_check
  check (age_rule in ('data_prova', 'fim_ano_civil', 'fim_ano_epoca'));
-- Sem função no CHECK: o admin escreve cup_editions pelo cliente e não tem
-- EXECUTE nas cup_* — o formato vai por regex e o 2.º ano por contas com
-- built-ins: só "AAAA", "AAAA/AA" ou "AAAA/AAAA" (espaços à volta) com o 2.º
-- ano = 1.º + 1 ("1999/00" também). "2026/25", "2026/2028" ou "2026/26"
-- não passam. Tudo o que passa, cup_season_ref_year lê (o ensaio confere-o
-- caso a caso). [0-9] e não \d: um dígito não ASCII não chega ao ::int.
alter table public.cup_editions drop constraint if exists cup_editions_epoca_legivel;
alter table public.cup_editions add constraint cup_editions_epoca_legivel
  check (age_rule is distinct from 'fim_ano_epoca'
         or (season_label ~ '^\s*[0-9]{4}\s*(/\s*([0-9]{2}|[0-9]{4}))?\s*$'
             and (season_label !~ '/'
                  or substring(season_label from '/\s*([0-9]{2,4})\s*$')::int
                     = case when length(substring(season_label from '/\s*([0-9]{2,4})\s*$')) = 4
                            then substring(season_label from '^\s*([0-9]{4})')::int + 1
                            else (substring(season_label from '^\s*([0-9]{4})')::int + 1) % 100 end)));

-- Mudar a regra de idade (ou a época que ela lê) numa edição com inscrições
-- ativas deixava errados o escalão e o percurso (distância, hora) das provas
-- "Vou" já criadas, e a correspondência a comparar com outro escalão. A
-- guarda recusa-o, com a frase para o admin; sem inscrições ativas, muda-se
-- à vontade. Uma época reescrita que dá o mesmo ano ("2026/27" →
-- "2026/2027") passa. Vale para todos (o admin pelo cliente, o SQL direto e
-- esta migração: o seed abaixo só mexe na 34.ª com age_rule null — com
-- inscrições ativas nela, a M2 falha inteira com esta frase).
create or replace function public.cup_editions_age_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (old.age_rule is distinct from new.age_rule
      or (coalesce(new.age_rule, '') = 'fim_ano_epoca'
          and cup_season_ref_year(old.season_label) is distinct from cup_season_ref_year(new.season_label)))
     and exists (select 1 from cup_enrollments e where e.edition_id = new.id and e.status = 'ativa') then
    raise exception 'Não dá para mudar a regra de idade nem a época de uma edição com inscrições ativas: o escalão e o percurso das provas «Vou» já criadas ficavam errados.'
      using errcode = '22023', hint = 'inscricoes_ativas';
  end if;
  return new;
end $$;

revoke execute on function public.cup_editions_age_guard() from public, anon, authenticated;

drop trigger if exists cup_editions_age_guard on public.cup_editions;
create trigger cup_editions_age_guard
  before update of age_rule, season_label on public.cup_editions
  for each row execute function public.cup_editions_age_guard();

comment on column public.cup_editions.age_rule is
  'Data de referência da idade para o escalão: data_prova (no dia), fim_ano_civil (31/12 do ano da '
  'jornada), fim_ano_epoca (31/12 do 2.º ano da época, tirado do season_label: "2026/27" → 31/12/2027 — '
  'o regulamento de Cascais, escalões por ano de nascimento). null = data_prova.';

-- O percurso de um atleta numa jornada (§3.5): exceção da jornada para o
-- escalão → percurso do escalão → percurso único da jornada. Zero linhas =
-- não se sabe (a participação "Vou" espera). Corpo da M1; muda só a data de
-- referência da idade (fim_ano_epoca). Espelho: cupCategoryFor/courseFor em
-- @formulas/cup.ts (AGE_PARITY_CASES — os mesmos casos no ensaio).
create or replace function public.cup_resolve_course(p_round_id uuid, p_user_id uuid)
returns table (
  category_code   text,
  course_code     text,
  course_name     text,
  distance_m      integer,
  start_time      time,
  distance_status text
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_round   cup_rounds%rowtype;
  v_rule    text;
  v_tz      text;
  v_label   text;
  v_gender  text;
  v_birth   date;
  v_ref     date;
  v_age     integer;
  v_cat     text;
  v_code    text;
  v_n       integer;
begin
  select * into v_round from cup_rounds where id = p_round_id;
  if not found then
    return;
  end if;
  select e.age_rule, e.time_zone, e.season_label into v_rule, v_tz, v_label
  from cup_editions e where e.id = v_round.edition_id;
  select p.gender, p.birth_date into v_gender, v_birth from profiles p where p.id = p_user_id;

  v_ref := coalesce(v_round.date, cup_local_today(v_tz));
  if v_rule = 'fim_ano_civil' then
    v_ref := make_date(extract(year from v_ref)::int, 12, 31);
  elsif v_rule = 'fim_ano_epoca' then
    -- Época ilegível → sem data de referência → sem idade: só batem escalões
    -- sem limites de idade (como sem data de nascimento).
    v_ref := case when cup_season_ref_year(v_label) is null then null
                  else make_date(cup_season_ref_year(v_label), 12, 31) end;
  end if;
  if v_birth is not null and v_ref is not null then
    v_age := date_part('year', age(v_ref, v_birth))::int;
  end if;

  -- O escalão mais específico que bate: com género antes de misto, e a faixa
  -- de idades mais estreita primeiro. Sem idade ou género, só batem escalões
  -- sem esse critério.
  select c.code, c.course_code into v_cat, v_code
  from cup_categories c
  where c.edition_id = v_round.edition_id
    and (c.gender is null or c.gender = v_gender)
    and (c.min_age is null or c.min_age <= v_age)
    and (c.max_age is null or c.max_age >= v_age)
  order by (c.gender is null), coalesce(c.max_age, 200) - coalesce(c.min_age, 0), c.code
  limit 1;

  if v_cat is not null then
    v_code := coalesce(
      (select o.course_code from cup_round_course_overrides o
        where o.round_id = p_round_id and o.category_code = v_cat),
      v_code);
  end if;

  if v_code is not null and not exists (
    select 1 from cup_round_courses rc where rc.round_id = p_round_id and rc.code = v_code
  ) then
    v_code := null;
  end if;

  if v_code is null then
    select count(*) into v_n from cup_round_courses rc where rc.round_id = p_round_id;
    if v_n = 1 then
      select rc.code into v_code from cup_round_courses rc where rc.round_id = p_round_id;
    end if;
  end if;

  if v_code is null then
    return;
  end if;

  return query
    select v_cat, rc.code, rc.name, rc.distance_m, rc.start_time, rc.distance_status
    from cup_round_courses rc
    where rc.round_id = p_round_id and rc.code = v_code;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. O dorsal como chave da correspondência
-- ────────────────────────────────────────────────────────────────────────────

-- Gémea de normBib (@formulas/cupResults.ts): sem espaços, maiúsculas, sem
-- zeros à esquerda antes de um dígito; vazio → null.
create or replace function public.cup_norm_bib(p text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select nullif(regexp_replace(upper(regexp_replace(coalesce(p, ''), '\s+', '', 'g')), '^0+(?=\d)', ''), '')
$$;

-- sha256(edição:dorsal) — gémea de sha256Hex(bibKeyInput(edição, dorsal)).
-- Não é uma fronteira de segurança (o dorsal está em claro em
-- cup_enrollments.bib): serve para comparar sem guardar o dorsal antigo em
-- claro nas linhas, e apaga-se no close_edition.
create or replace function public.cup_bib_key(p_edition_id uuid, p_bib text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case when public.cup_norm_bib(p_bib) is null or p_edition_id is null then null
    else encode(sha256(convert_to(p_edition_id::text || ':' || public.cup_norm_bib(p_bib), 'UTF8')), 'hex') end
$$;

revoke execute on function public.cup_norm_bib(text) from public, anon, authenticated;
revoke execute on function public.cup_bib_key(uuid, text) from public, anon, authenticated;

alter table public.cup_results
  -- A bib_key com que a linha foi lida.
  add column if not exists bib_key text,
  -- A chave da linha na classificação geral (hash; nunca o nome).
  add column if not exists standings_key text,
  -- A chave ALTERNATIVA da geral (hash do 1.º e último nome, escalão e
  -- clube; nunca o nome): só se tenta quando a exata não acha nenhuma linha.
  add column if not exists standings_alt_key text,
  -- 'calculado' pela app a partir da página da prova (um mínimo: "provisórios")
  -- ou 'oficial' da classificação geral.
  add column if not exists points_source text check (points_source in ('oficial', 'calculado'));

comment on column public.cup_results.match_hash is
  'Identidade da linha: sha256(bib_key|escalão|clube|nome como o site o escreve). Muda → perdida.';
comment on column public.cup_results.bib_key is
  'sha256(edição:dorsal normalizado) com que a linha foi lida (cup_bib_key). Apaga-se no close_edition.';
comment on column public.cup_results.standings_key is
  'Chave da linha dele na classificação geral (hash do nome como o site o escreve, escalão e clube). '
  'Apaga-se no close_edition.';
comment on column public.cup_results.standings_alt_key is
  'Chave alternativa da geral (hash do 1.º e último nome, escalão e clube): liga como proposta quando a '
  'exata não acha nenhuma linha (nome do meio). Apaga-se no close_edition.';

create index if not exists cup_results_round_idx on public.cup_results (round_id);

-- "Não sou eu": a bib_key recusada. A correspondência nunca mais liga esse
-- dorsal nesta edição; só mudar de dorsal desbloqueia.
alter table public.cup_enrollments
  add column if not exists match_refused_key text,
  -- "Não sou eu" na GERAL: as chaves alternativas recusadas (hashes), que
  -- nunca mais se propõem. Só mudam pela RPC reject_cup_standing.
  add column if not exists standings_refused_keys text[] not null default '{}';

-- A coletiva por jornada é uma conta da app sobre a geral oficial
-- ('calculado'); o site não a dá por GET.
alter table public.cup_team_results
  add column if not exists points_source text check (points_source in ('oficial', 'calculado'));

-- Mudar o dorsal: os "És tu?" (e as linhas perdidas) do dorsal antigo saem
-- logo. As confirmadas ficam — foi ele que as confirmou.
create or replace function public.cup_enrollment_bib_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from cup_results
  where enrollment_id = new.id
    and match_status <> 'confirmada'
    and bib_key is distinct from cup_bib_key(new.edition_id, new.bib);
  return null;
end $$;

revoke execute on function public.cup_enrollment_bib_changed() from public, anon, authenticated;

drop trigger if exists cup_enrollment_bib_changed on public.cup_enrollments;
create trigger cup_enrollment_bib_changed
  after update of bib on public.cup_enrollments
  for each row when (old.bib is distinct from new.bib)
  execute function public.cup_enrollment_bib_changed();


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Tabelas novas
-- ────────────────────────────────────────────────────────────────────────────

-- A linha DELE na classificação geral (§7, B.5): lugar no escalão e total
-- oficiais. Own rows, sem "admin read all"; escreve só o job (service_role).
create table if not exists public.cup_standings (
  enrollment_id     uuid primary key references public.cup_enrollments(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  edition_id        uuid not null references public.cup_editions(id) on delete cascade,
  category_code     text,
  category_rank     integer check (category_rank > 0),
  total_points      numeric check (total_points >= 0),
  rounds_scored     integer check (rounds_scored >= 0),
  -- A chave com que se ligou (hash: a exata, ou a alternativa). Apaga-se no
  -- close_edition.
  key_hash          text,
  -- 'confirmada' (pela chave exata, ou a alternativa que ele confirmou) ou
  -- 'proposta' (pela alternativa, por confirmar: o "És tu?" da geral — os
  -- pontos oficiais não entram nas jornadas e o resumo do fecho não a usa).
  match_status      text not null default 'confirmada' check (match_status in ('confirmada', 'proposta')),
  -- Quando a geral foi lida (e bateu) pela última vez.
  source_checked_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists cup_standings_user_idx on public.cup_standings (user_id);
create index if not exists cup_standings_edition_idx on public.cup_standings (edition_id);

-- O estado do job por edição e página (a linha 'edicao' guarda também o
-- trinco da volta). SÓ AGREGADOS — contagens por escalão, hashes, códigos —
-- nunca nomes, dorsais ou clubes. Só o admin lê. É aqui que vive o
-- "pronta/estável" do modo observar (que não escreve nada que os atletas
-- leiam).
create table if not exists public.cup_sync_state (
  edition_id       uuid not null references public.cup_editions(id) on delete cascade,
  target           text not null check (target = 'edicao' or target = 'geral' or target like 'jornada:%'),
  round_id         uuid references public.cup_rounds(id) on delete cascade,
  url              text,
  last_checked_at  timestamptz,
  last_status      text check (last_status in ('ok', 'invariante', 'rede', 'regressao', 'robots', 'sem_url',
                                               'orcamento', 'adaptador', 'bib_scope')),
  last_codes       text[] not null default '{}',
  content_hash     text,
  hash_seen_at     timestamptz,
  ready_at         timestamptz,
  stable_at        timestamptz,
  -- O modo em que a jornada ficou estável. A marca de 'observar' não conta
  -- em 'publicar': ao passar a publicar, as jornadas já lidas voltam a
  -- ler-se (e publicam-se se a página não mudou) — nenhuma fica presa sem a
  -- 1.ª leitura para os atletas (roundDue em @formulas/cupResults.ts).
  stable_mode      text check (stable_mode in ('observar', 'publicar')),
  fail_since       timestamptz,
  rows_total       integer check (rows_total >= 0),
  rows_by_category jsonb,
  summary          jsonb,
  -- Só na linha 'edicao': o trinco da volta (uma volta de cada vez).
  running_since    timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (edition_id, target)
);

alter table public.cup_standings enable row level security;
drop policy if exists "own rows read" on public.cup_standings;
create policy "own rows read" on public.cup_standings
  for select to authenticated using (user_id = auth.uid());
revoke all on public.cup_standings from anon, authenticated;
grant select on public.cup_standings to authenticated;

alter table public.cup_sync_state enable row level security;
drop policy if exists "admin read cup sync" on public.cup_sync_state;
create policy "admin read cup sync" on public.cup_sync_state
  for select to authenticated using (public.is_admin());
revoke all on public.cup_sync_state from anon, authenticated;
grant select on public.cup_sync_state to authenticated;

-- Os clubes vistos na fonte oficial (cup_team_aliases): só o admin lê. A M1
-- deu-lhes o "cup catalog read" (using true) do resto do catálogo, mas o
-- único leitor é o backoffice ("Clubes por ligar"), e um nome que venha de
-- uma página de prova não fica à vista de todos os atletas. O admin continua
-- a ler e a ligar pelo "cup catalog admin write" (for all, is_admin()); o job
-- escreve como service_role.
drop policy if exists "cup catalog read" on public.cup_team_aliases;

-- A coletiva por jornada (cup_team_results): o job só a grava para clubes
-- COM inscritos, por isso, lida por todos, a lista de clubes com linhas
-- dizia que clubes têm atletas da app. Passa a ler só o admin (pelo "cup
-- catalog admin write", for all) e quem tem inscrição ATIVA nessa edição com
-- esse clube — a coletiva do SEU clube, a única que o cliente lê
-- (cupSlice.readResults: .eq('team_id', inscrição ativa.team_id)). As
-- inscrições lêem-se pelo "own rows read" delas (user_id = auth.uid()).
drop policy if exists "cup catalog read" on public.cup_team_results;
drop policy if exists "own team read" on public.cup_team_results;
create policy "own team read" on public.cup_team_results
  for select to authenticated using (
    exists (
      select 1
      from public.cup_enrollments e
      join public.cup_rounds r on r.edition_id = e.edition_id
      where r.id = cup_team_results.round_id
        and e.team_id = cup_team_results.team_id
        and e.user_id = auth.uid()
        and e.status = 'ativa'
    )
  );

-- O job escreve como service_role (bypassrls). Os privilégios por omissão do
-- Supabase já os dão; ficam explícitos para não depender deles.
grant select, insert, update, delete on public.cup_standings, public.cup_sync_state to service_role;

do $$
declare
  t text;
begin
  foreach t in array array['cup_standings', 'cup_sync_state'] loop
    execute format('drop trigger if exists cup_touch_updated_at on public.%I', t);
    execute format(
      'create trigger cup_touch_updated_at before update on public.%I '
      'for each row execute function public.cup_touch_updated_at()', t);
  end loop;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. RPCs do atleta — SECURITY DEFINER, EXECUTE a authenticated
-- ────────────────────────────────────────────────────────────────────────────

-- "Sim, sou eu": confirma a linha proposta (ou a perdida — "a tua linha
-- mudou, continua a ser tu?") desta jornada, na inscrição ATIVA dele, se
-- tiver dados. As outras propostas do MESMO dorsal e da MESMA linha
-- (standings_key: o nome como o site o escreve, o escalão e o clube) nesta
-- inscrição confirmam-se com ela: são as que o job ligaria sozinho na volta
-- seguinte ("as seguintes ligam-se sozinhas"). Uma proposta do mesmo dorsal
-- com outro nome (dorsais trocados pelo organizador) continua a perguntar,
-- e as perdidas também.
create or replace function public.confirm_cup_result(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row cup_results%rowtype;
  v_n   integer := 0;
begin
  if v_uid is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  select cr.* into v_row
  from cup_results cr
  join cup_enrollments e on e.id = cr.enrollment_id
  where cr.round_id = p_round_id
    and cr.user_id = v_uid
    and e.user_id = v_uid
    and e.status = 'ativa'
    and cr.match_status in ('proposta', 'perdida')
    and (cr.official_time_s is not null or cr.position is not null)
  for update of cr;
  if not found then
    raise exception 'Não há nada para confirmar nesta jornada' using errcode = 'P0002';
  end if;

  update cup_results set match_status = 'confirmada' where id = v_row.id;

  if v_row.bib_key is not null and v_row.standings_key is not null then
    update cup_results
    set match_status = 'confirmada'
    where enrollment_id = v_row.enrollment_id
      and id <> v_row.id
      and match_status = 'proposta'
      and bib_key = v_row.bib_key
      and standings_key = v_row.standings_key
      and (official_time_s is not null or position is not null);
    get diagnostics v_n = row_count;
  end if;

  return jsonb_build_object('round_id', p_round_id, 'match_status', 'confirmada', 'also_confirmed', v_n);
end $$;

-- "Não sou eu": guarda a recusa deste dorsal (a correspondência nunca mais o
-- liga nesta edição) e apaga as linhas NÃO confirmadas dele. As confirmadas
-- ficam — foi ele que as confirmou. Com ou sem dados.
create or replace function public.reject_cup_result(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row cup_results%rowtype;
begin
  if v_uid is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  select cr.* into v_row
  from cup_results cr
  join cup_enrollments e on e.id = cr.enrollment_id
  where cr.round_id = p_round_id
    and cr.user_id = v_uid
    and e.user_id = v_uid
    and e.status = 'ativa'
    and cr.match_status in ('proposta', 'perdida')
  for update of cr;
  if not found then
    raise exception 'Não há nada para recusar nesta jornada' using errcode = 'P0002';
  end if;

  update cup_enrollments set match_refused_key = v_row.bib_key where id = v_row.enrollment_id;

  delete from cup_results
  where enrollment_id = v_row.enrollment_id
    and match_status <> 'confirmada'
    and bib_key is not distinct from v_row.bib_key;

  return jsonb_build_object('round_id', p_round_id, 'rejected', true);
end $$;

revoke execute on function public.confirm_cup_result(uuid) from public, anon;
revoke execute on function public.reject_cup_result(uuid) from public, anon;
grant execute on function public.confirm_cup_result(uuid) to authenticated, service_role;
grant execute on function public.reject_cup_result(uuid) to authenticated, service_role;

-- A geral pela chave ALTERNATIVA (§7): quando a exata (o nome inteiro) não
-- acha nenhuma linha, o job tenta o 1.º e o último nome com o escalão, o
-- clube e o ano do perfil; com exatamente uma linha, grava-a 'proposta' e
-- pergunta-se ("És tu? 12.º M40 na geral · 43 pontos"). Nunca se confirma
-- sozinha. Só a linha dele (a inscrição ATIVA dele).
--
-- "Sim, sou eu" na geral: passa a confirmada (os pontos oficiais entram nas
-- jornadas na leitura seguinte da geral).
create or replace function public.confirm_cup_standing(p_enrollment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  update cup_standings cs
  set match_status = 'confirmada'
  from cup_enrollments e
  where cs.enrollment_id = p_enrollment_id
    and e.id = cs.enrollment_id
    and cs.user_id = v_uid
    and e.user_id = v_uid
    and e.status = 'ativa'
    and cs.match_status = 'proposta';
  if not found then
    raise exception 'Não há nada para confirmar na classificação geral' using errcode = 'P0002';
  end if;
  return jsonb_build_object('enrollment_id', p_enrollment_id, 'match_status', 'confirmada');
end $$;

-- "Não sou eu" na geral: guarda a chave (nunca mais se propõe) e apaga a
-- proposta. A chave exata continua como está.
create or replace function public.reject_cup_standing(p_enrollment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row cup_standings%rowtype;
begin
  if v_uid is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  select cs.* into v_row
  from cup_standings cs
  join cup_enrollments e on e.id = cs.enrollment_id
  where cs.enrollment_id = p_enrollment_id
    and cs.user_id = v_uid
    and e.user_id = v_uid
    and e.status = 'ativa'
    and cs.match_status = 'proposta'
  for update of cs;
  if not found then
    raise exception 'Não há nada para recusar na classificação geral' using errcode = 'P0002';
  end if;

  if v_row.key_hash is not null then
    update cup_enrollments
    set standings_refused_keys = array_append(standings_refused_keys, v_row.key_hash)
    where id = p_enrollment_id and not (v_row.key_hash = any(standings_refused_keys));
  end if;
  delete from cup_standings where enrollment_id = p_enrollment_id and match_status = 'proposta';

  return jsonb_build_object('enrollment_id', p_enrollment_id, 'rejected', true);
end $$;

revoke execute on function public.confirm_cup_standing(uuid) from public, anon;
revoke execute on function public.reject_cup_standing(uuid) from public, anon;
grant execute on function public.confirm_cup_standing(uuid) to authenticated, service_role;
grant execute on function public.reject_cup_standing(uuid) to authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. close_edition com a guarda do dono e a geral oficial no resumo
-- ────────────────────────────────────────────────────────────────────────────

-- Corpo da M1 (ver lá o porquê de cada passo) mais:
--   · a guarda (decisão do dono, 2026-09-27): não se fecha sem jornadas, com
--     a última (não cancelada) ainda sem data, nem antes de ela passar — no
--     próprio dia ainda não passou. As canceladas não contam;
--   · o resumo usa a linha dele na geral oficial (cup_standings) quando há
--     e está CONFIRMADA (uma 'proposta' da chave alternativa não conta):
--     pontos e lugar no escalão oficiais, fonte 'oficial'; senão a soma das
--     confirmadas, fonte 'app'. Um resumo 'oficial' não é reescrito por um
--     'app';
--   · apaga também bib_key, standings_key, standings_alt_key,
--     match_refused_key, standings_refused_keys, key_hash e as linhas da
--     geral por confirmar.
create or replace function public.close_edition(p_edition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ed   cup_editions%rowtype;
  v_id   uuid;
  v_last record;
begin
  if not public.is_admin() then
    raise exception 'Só para administradores' using errcode = '42501';
  end if;
  select * into v_ed from cup_editions where id = p_edition_id for update;
  if not found then
    raise exception 'Edição inexistente' using errcode = 'P0002';
  end if;

  select r.round_no, r.date into v_last
  from cup_rounds r
  where r.edition_id = p_edition_id and r.date_status <> 'cancelada'
  order by r.date desc nulls first, r.round_no desc
  limit 1;
  if not found then
    raise exception 'Ainda não dá para fechar: a edição não tem jornadas.'
      using errcode = '22023', hint = 'sem_jornadas';
  end if;
  if v_last.date is null then
    raise exception 'Ainda não dá para fechar: a jornada % ainda não tem data.', v_last.round_no
      using errcode = '22023', hint = 'ultima_sem_data';
  end if;
  if v_last.date >= cup_local_today(v_ed.time_zone) then
    raise exception 'Ainda não dá para fechar: a última jornada (%, %) ainda não passou.',
      v_last.round_no, to_char(v_last.date, 'DD/MM/YYYY')
      using errcode = '22023', hint = 'ultima_por_passar';
  end if;

  update cup_editions
  set status = 'encerrada', closed_at = coalesce(closed_at, now())
  where id = p_edition_id
  returning * into v_ed;

  for v_id in
    select x.id
    from race_events x
    join cup_rounds r on r.id = x.cup_round_id
    where r.edition_id = p_edition_id
      and r.date > cup_local_today(v_ed.time_zone)
      and not cup_race_is_done(x.id)
  loop
    perform cup_release_race(v_id);
  end loop;

  update cup_enrollments set status = 'concluida'
  where edition_id = p_edition_id and status = 'ativa';

  insert into cup_season_summaries (enrollment_id, user_id, edition_id, attendances, rounds_total,
                                    points, category_code, category_rank, team_name, source, computed_at)
  select e.id, e.user_id, e.edition_id,
         (select count(distinct r.id)
            from cup_rounds r
            join race_events x on x.cup_round_id = r.id and x.user_id = e.user_id
           where r.edition_id = e.edition_id and cup_race_is_done(x.id)),
         (select count(*) from cup_rounds r
           where r.edition_id = e.edition_id and r.date_status <> 'cancelada'),
         coalesce(cs.total_points,
                  (select sum(cr.points) from cup_results cr
                    where cr.enrollment_id = e.id and cr.match_status = 'confirmada')),
         coalesce(cs.category_code,
                  (select cr.category_code from cup_results cr
                     join cup_rounds r on r.id = cr.round_id
                    where cr.enrollment_id = e.id and cr.match_status = 'confirmada' and cr.category_code is not null
                    order by r.date desc nulls last limit 1)),
         cs.category_rank,
         coalesce(t.name, e.team_other),
         case when cs.enrollment_id is not null then 'oficial' else 'app' end,
         now()
  from cup_enrollments e
  left join cup_teams t on t.id = e.team_id
  left join cup_standings cs on cs.enrollment_id = e.id and cs.match_status = 'confirmada'
  where e.edition_id = p_edition_id
    and e.status in ('concluida', 'saiu')
  on conflict (enrollment_id) do update
    set attendances = excluded.attendances,
        rounds_total = excluded.rounds_total,
        points = excluded.points,
        category_code = excluded.category_code,
        category_rank = excluded.category_rank,
        team_name = excluded.team_name,
        source = excluded.source,
        computed_at = excluded.computed_at
    where cup_season_summaries.source = 'app' or excluded.source = 'oficial';

  update cup_enrollments set bib = null, match_refused_key = null, standings_refused_keys = '{}'
  where edition_id = p_edition_id
    and (bib is not null or match_refused_key is not null or cardinality(standings_refused_keys) > 0);

  delete from cup_results cr
  using cup_rounds r
  where r.id = cr.round_id and r.edition_id = p_edition_id and cr.match_status <> 'confirmada';

  update cup_results cr set match_hash = null, bib_key = null, standings_key = null, standings_alt_key = null
  from cup_rounds r
  where r.id = cr.round_id and r.edition_id = p_edition_id
    and (cr.match_hash is not null or cr.bib_key is not null or cr.standings_key is not null
         or cr.standings_alt_key is not null);

  delete from cup_standings where edition_id = p_edition_id and match_status <> 'confirmada';

  update cup_standings set key_hash = null
  where edition_id = p_edition_id and key_hash is not null;

  return jsonb_build_object('edition_id', v_ed.id, 'status', v_ed.status, 'closed_at', v_ed.closed_at);
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 6. search_path fixo (advisors da M1: só built-ins, sem EXECUTE para quem
--    tem sessão — fica fixo na mesma)
-- ────────────────────────────────────────────────────────────────────────────

alter function public.cup_band(bigint) set search_path = pg_catalog, pg_temp;
alter function public.cup_norm_text(text) set search_path = pg_catalog, pg_temp;


-- ────────────────────────────────────────────────────────────────────────────
-- 7. Seed da 34.ª pelo regulamento (idempotente; não sobrepõe o que o admin
--    já tenha feito)
-- ────────────────────────────────────────────────────────────────────────────
-- Idades = idade a 31/12/2027 (2.º ano da época), do regulamento geral da
-- 33.ª deslocado um ano (2025/26: Sub12 2015–17 → 9–11; Seniores 1992–2003 →
-- 23–34; …). Sem F75/F80 (F70 aberto); M80 aberto. Percursos (reg. §4):
-- Sub20M/Sub23M/SenM/M35–M55 no LONGO; as femininas, Sub18 M/F e M60–M80 no
-- CURTO; Sub16/14/12 com percurso próprio. Os cup_round_courses com estes
-- códigos criam-se por jornada no backoffice (o calendário nunca vai por
-- migração). Os mesmos 32 em CASCAIS_REG_CATEGORIES (cup.fixtures.ts).

update public.cup_editions e set age_rule = 'fim_ano_epoca'
from public.cup_competitions c
where c.id = e.competition_id and c.slug = 'trofeu-cascais' and e.edition_no = 34 and e.age_rule is null;

-- A tabela e a base dos pontos do regulamento geral (Documento Orientador
-- 2025/26: 11.º–20.º 3, 21.º–30.º 2, 31.º+ 1; por escalão). Em produção já
-- estão postas desde 2026-09-27 e isto não muda nada lá; corrige o seed da M1
-- (13 valores, base por preencher) num ambiente montado de raiz.
update public.cup_editions e
set points_table = '[15,13,11,10,9,8,7,6,5,4,3,3,3,3,3,3,3,3,3,3,2,2,2,2,2,2,2,2,2,2,1]'::jsonb,
    points_basis = coalesce(e.points_basis, 'escalao')
from public.cup_competitions c
where c.id = e.competition_id and c.slug = 'trofeu-cascais' and e.edition_no = 34
  and e.points_table = '[15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]'::jsonb;

insert into public.cup_categories (edition_id, code, name, gender, min_age, max_age, course_code)
select e.id, v.code, v.name, v.gender, v.min_age, v.max_age, v.course_code
from public.cup_editions e
join public.cup_competitions c on c.id = e.competition_id
cross join (values
  ('SUB12M', 'Sub-12 M',   'M',  9, 11, 'SUB12'),
  ('SUB12F', 'Sub-12 F',   'F',  9, 11, 'SUB12'),
  ('SUB14M', 'Sub-14 M',   'M', 12, 13, 'SUB14'),
  ('SUB14F', 'Sub-14 F',   'F', 12, 13, 'SUB14'),
  ('SUB16M', 'Sub-16 M',   'M', 14, 15, 'SUB16'),
  ('SUB16F', 'Sub-16 F',   'F', 14, 15, 'SUB16'),
  ('SUB18M', 'Sub-18 M',   'M', 16, 17, 'CURTO'),
  ('SUB18F', 'Sub-18 F',   'F', 16, 17, 'CURTO'),
  ('SUB20M', 'Sub-20 M',   'M', 18, 19, 'LONGO'),
  ('SUB20F', 'Sub-20 F',   'F', 18, 19, 'CURTO'),
  ('SUB23M', 'Sub-23 M',   'M', 20, 22, 'LONGO'),
  ('SUB23F', 'Sub-23 F',   'F', 20, 22, 'CURTO'),
  ('SENM',   'Seniores M', 'M', 23, 34, 'LONGO'),
  ('SENF',   'Seniores F', 'F', 23, 34, 'CURTO'),
  ('M35',    'M35',        'M', 35, 39, 'LONGO'),
  ('F35',    'F35',        'F', 35, 39, 'CURTO'),
  ('M40',    'M40',        'M', 40, 44, 'LONGO'),
  ('F40',    'F40',        'F', 40, 44, 'CURTO'),
  ('M45',    'M45',        'M', 45, 49, 'LONGO'),
  ('F45',    'F45',        'F', 45, 49, 'CURTO'),
  ('M50',    'M50',        'M', 50, 54, 'LONGO'),
  ('F50',    'F50',        'F', 50, 54, 'CURTO'),
  ('M55',    'M55',        'M', 55, 59, 'LONGO'),
  ('F55',    'F55',        'F', 55, 59, 'CURTO'),
  ('M60',    'M60',        'M', 60, 64, 'CURTO'),
  ('F60',    'F60',        'F', 60, 64, 'CURTO'),
  ('M65',    'M65',        'M', 65, 69, 'CURTO'),
  ('F65',    'F65',        'F', 65, 69, 'CURTO'),
  ('M70',    'M70',        'M', 70, 74, 'CURTO'),
  ('F70',    'F70',        'F', 70, null, 'CURTO'),
  ('M75',    'M75',        'M', 75, 79, 'CURTO'),
  ('M80',    'M80',        'M', 80, null, 'CURTO')
) as v(code, name, gender, min_age, max_age, course_code)
where c.slug = 'trofeu-cascais' and e.edition_no = 34
on conflict (edition_id, code) do nothing;


-- ────────────────────────────────────────────────────────────────────────────
-- 8. Verificação — se falhar, a migração falha inteira
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_bad text;
  v_n   integer;
begin
  -- RLS ligada em todas as tabelas cup_* (incluindo as duas novas).
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'cup\_%' and not c.relrowsecurity;
  if v_bad is not null then
    raise exception 'Tabelas cup_* sem RLS: %', v_bad;
  end if;

  -- Nada para anon.
  select string_agg(distinct table_name, ', ') into v_bad
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public' and table_name like 'cup\_%';
  if v_bad is not null then
    raise exception 'Tabelas cup_* com privilégios para anon: %', v_bad;
  end if;

  -- cup_team_aliases: só o admin lê (nenhuma política que dê a linha a
  -- qualquer atleta com sessão).
  select string_agg(pol.polname, ', ') into v_bad
  from pg_policy pol join pg_class c on c.oid = pol.polrelid
  where c.relname = 'cup_team_aliases'
    and pol.polcmd in ('r', '*')
    and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') not like '%is_admin()%';
  if v_bad is not null then
    raise exception 'cup_team_aliases legível por quem não é admin: %', v_bad;
  end if;

  -- cup_team_results: só o admin e quem tem inscrição ativa nesse clube
  -- (nenhuma política de leitura sem is_admin() nem auth.uid()).
  select string_agg(pol.polname, ', ') into v_bad
  from pg_policy pol join pg_class c on c.oid = pol.polrelid
  where c.relname = 'cup_team_results'
    and pol.polcmd in ('r', '*')
    and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') not like '%is_admin()%'
    and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') not like '%uid()%';
  if v_bad is not null then
    raise exception 'cup_team_results legível por qualquer atleta: %', v_bad;
  end if;

  -- A guarda da regra de idade.
  if not exists (select 1 from pg_trigger where tgname = 'cup_editions_age_guard'
                   and tgrelid = 'public.cup_editions'::regclass and not tgisinternal) then
    raise exception 'Falta a guarda cup_editions_age_guard';
  end if;

  -- Nenhuma política cup_* avaliada por anon/public.
  select string_agg(c.relname || '.' || pol.polname, ', ') into v_bad
  from pg_policy pol join pg_class c on c.oid = pol.polrelid
  where c.relname like 'cup\_%'
    and (0 = any(pol.polroles) or 'anon'::regrole::oid = any(pol.polroles));
  if v_bad is not null then
    raise exception 'Políticas cup_* abertas a anon/public: %', v_bad;
  end if;

  -- As funções internas cup_* (incluindo cup_season_ref_year, cup_norm_bib,
  -- cup_bib_key e o trigger do dorsal) sem EXECUTE para quem tem sessão.
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (p.proname like 'cup\_%' or p.proname = 'guard_cup_race_columns')
    and (has_function_privilege('authenticated', p.oid, 'execute')
         or has_function_privilege('anon', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'Funções internas cup_* executáveis por authenticated/anon: %', v_bad;
  end if;

  -- As RPCs: nunca para anon; sempre para authenticated.
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('enroll_cup', 'update_enrollment', 'leave_cup', 'set_participation',
                      'preview_round_change', 'unmatched_team_names', 'close_edition',
                      'confirm_cup_result', 'reject_cup_result', 'confirm_cup_standing', 'reject_cup_standing')
    and (has_function_privilege('anon', p.oid, 'execute')
         or not has_function_privilege('authenticated', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'RPCs cup com EXECUTE errado (anon sim ou authenticated não): %', v_bad;
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('confirm_cup_result', 'reject_cup_result',
                                                'confirm_cup_standing', 'reject_cup_standing');
  if v_n <> 4 then
    raise exception 'Faltam RPCs do atleta (confirm/reject_cup_result, confirm/reject_cup_standing)';
  end if;

  -- search_path fixo nas funções que os advisors apontaram.
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('cup_band', 'cup_norm_text', 'cup_season_ref_year',
                                                'cup_norm_bib', 'cup_bib_key')
    and p.proconfig is null;
  if v_bad is not null then
    raise exception 'Funções cup_* sem search_path fixo: %', v_bad;
  end if;

  -- A 34.ª: uma regra de idade posta (a do seed, ou outra já posta à mão) e
  -- os 32 escalões do regulamento.
  select count(*) into v_n
  from public.cup_editions e join public.cup_competitions c on c.id = e.competition_id
  where c.slug = 'trofeu-cascais' and e.edition_no = 34 and e.age_rule is null;
  if v_n > 0 then
    raise exception 'A 34.ª ficou sem age_rule';
  end if;
  select count(*) into v_n
  from public.cup_categories k
  join public.cup_editions e on e.id = k.edition_id
  join public.cup_competitions c on c.id = e.competition_id
  where c.slug = 'trofeu-cascais' and e.edition_no = 34
    and k.code in ('SUB12M', 'SUB12F', 'SUB14M', 'SUB14F', 'SUB16M', 'SUB16F', 'SUB18M', 'SUB18F',
                   'SUB20M', 'SUB20F', 'SUB23M', 'SUB23F', 'SENM', 'SENF', 'M35', 'F35', 'M40', 'F40',
                   'M45', 'F45', 'M50', 'F50', 'M55', 'F55', 'M60', 'F60', 'M65', 'F65', 'M70', 'F70',
                   'M75', 'M80');
  if v_n <> 32 and exists (select 1 from public.cup_competitions where slug = 'trofeu-cascais') then
    raise exception 'A 34.ª tem % dos 32 escalões do regulamento', v_n;
  end if;

  -- A regra de idade tem de ler a época da 34.ª.
  if exists (
    select 1 from public.cup_editions e join public.cup_competitions c on c.id = e.competition_id
    where c.slug = 'trofeu-cascais' and e.edition_no = 34 and e.age_rule = 'fim_ano_epoca'
      and public.cup_season_ref_year(e.season_label) is null
  ) then
    raise exception 'A 34.ª tem fim_ano_epoca com um season_label ilegível';
  end if;
end $$;

commit;
