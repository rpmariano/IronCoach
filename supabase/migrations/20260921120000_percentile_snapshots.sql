-- ============================================================================
-- Onde estás — comparação por percentil dentro do escalão (gamificação, Fase 5)
--
-- NÃO APLICADA. Este ficheiro é só o desenho escrito; a aplicação é um pedido
-- à parte, com o cuidado habitual (CLAUDE.md: a BD é produção real).
--
-- O que entra:
--   a) privacy_consents   — o livro do consentimento. SÓ INSERÇÕES.
--   b) profiles.*_consent — cache do estado atual, lida pela agregação.
--   c) trigger de revogação, à imagem de clear_cycle_data_on_consent_revoked.
--   d) percentile_snapshots — os agregados. SEM user_id NENHUM.
--
-- O princípio que segura tudo: o atleta entra num DENOMINADOR, não numa
-- lista. A linha do snapshot é de um segmento (escalão × género × modalidade
-- × janela), já não é de ninguém — e é por isso que a leitura é segura sem
-- `security definer` e sem função de RPC pelo meio: não há linha de outro
-- atleta para proteger, porque não há linha de atleta nenhum.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- a) privacy_consents — o livro, só inserções
-- ────────────────────────────────────────────────────────────────────────────
--
-- O art. 7.º/1 do RGPD exige DEMONSTRAR que o consentimento foi dado. Uma
-- coluna `consent_at` que se sobrescreve demonstra o estado, não o histórico:
-- depois de retirar e voltar a dar, já não há forma de dizer quando foi dado
-- da primeira vez nem quando foi retirado. Por isso isto é um livro de
-- movimentos — uma linha por ato, `granted_at` OU `revoked_at`, nunca as duas
-- — e não há política de UPDATE nem de DELETE: uma linha escrita fica escrita.
--
-- Dois âmbitos INDEPENDENTES, e a independência é a regra, não um detalhe:
--   'stats_pool'  — entrar no denominador das distribuições (nunca aparece
--                   nome nenhum: o atleta é mais um no `n` de um segmento);
--   'leaderboard' — aparecer com nome abreviado numa tabela com nomes.
-- Conceder um NUNCA implica o outro. A UI mostra-os como duas decisões
-- separadas e o servidor trata-os como duas linhas de tipos diferentes.

create table if not exists public.privacy_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('stats_pool', 'leaderboard')),
  granted_at timestamptz,
  revoked_at timestamptz,
  -- Que texto é que ele leu quando disse que sim. Sem isto, o livro prova
  -- que houve consentimento mas não a QUÊ.
  policy_version text not null default 'v1' check (char_length(policy_version) between 1 and 40),
  -- De onde veio o ato ('app', 'onboarding', 'suporte'). Um consentimento
  -- retirado por pedido ao suporte tem de se distinguir de um retirado pelo
  -- próprio no ecrã.
  source text not null default 'app' check (char_length(source) between 1 and 60),
  created_at timestamptz not null default now(),
  -- Uma linha é UM ato: ou é a concessão, ou é a retirada.
  constraint privacy_consents_um_ato check (
    (granted_at is not null and revoked_at is null)
    or (granted_at is null and revoked_at is not null)
  )
);

create index if not exists privacy_consents_user_kind_idx
  on public.privacy_consents(user_id, kind, created_at desc);

comment on table public.privacy_consents is
  'Livro do consentimento de privacidade (RGPD art. 7.º/1): uma linha por ato, '
  'só inserções. A verdade está aqui; profiles.stats_pool_consent_at e '
  'profiles.leaderboard_consent_at são cache do estado atual.';

alter table public.privacy_consents enable row level security;

-- Convenção do projeto: "own rows" + "admin read all". Aqui o "own rows"
-- parte-se em dois — select e insert — DE PROPÓSITO: um `for all` dava
-- também update e delete, e um livro que se pode reescrever não demonstra
-- nada. Sem política de update/delete, o RLS nega-as por omissão.
drop policy if exists "own privacy_consents select" on public.privacy_consents;
create policy "own privacy_consents select" on public.privacy_consents
  for select using (auth.uid() = user_id);

drop policy if exists "own privacy_consents insert" on public.privacy_consents;
create policy "own privacy_consents insert" on public.privacy_consents
  for insert with check (auth.uid() = user_id);

drop policy if exists "admin read all privacy_consents" on public.privacy_consents;
create policy "admin read all privacy_consents" on public.privacy_consents
  for select using (public.is_admin());


-- ────────────────────────────────────────────────────────────────────────────
-- b) profiles — cache do estado atual (a verdade continua no livro)
-- ────────────────────────────────────────────────────────────────────────────
--
-- A tarefa de agregação percorre os perfis: perguntar "quem consente agora?"
-- ao livro obrigava a um DISTINCT ON por atleta e por tipo a cada volta.
-- Estas colunas são só isso — o estado atual, derivado. Se um dia
-- divergirem, manda o livro.

alter table public.profiles
  add column if not exists stats_pool_consent_at timestamptz,
  add column if not exists leaderboard_consent_at timestamptz,
  -- Nome abreviado ("Rui M."), escolhido pelo atleta. Só tem uso com
  -- leaderboard_consent_at preenchido; a revogação limpa-o (trigger abaixo).
  add column if not exists leaderboard_display_name text
    check (leaderboard_display_name is null or char_length(leaderboard_display_name) between 2 and 40),
  add column if not exists leaderboard_scope text not null default 'escalao'
    check (leaderboard_scope in ('escalao', 'global'));

comment on column public.profiles.stats_pool_consent_at is
  'Cache: quando o atleta entrou no denominador das distribuições. null = fora. '
  'A verdade está em privacy_consents (kind = ''stats_pool'').';
comment on column public.profiles.leaderboard_consent_at is
  'Cache: quando o atleta aceitou aparecer com nome abreviado nas tabelas. '
  'null = não aparece. Independente de stats_pool_consent_at.';


-- ────────────────────────────────────────────────────────────────────────────
-- d) percentile_snapshots — os agregados (declarada antes do trigger, que a
--    marca para recomputação)
-- ────────────────────────────────────────────────────────────────────────────
--
-- PORQUE É QUE ISTO SE PODE LER SEM `security definer`: uma linha desta
-- tabela não tem `user_id`, não tem data de nascimento, não tem nome, não
-- tem chave estrangeira nenhuma para `auth.users`. É a distribuição de um
-- SEGMENTO — e um segmento com pelo menos 20 pessoas lá dentro. Ler a linha
-- toda não diz nada sobre ninguém em concreto, e por isso a política de
-- leitura pode ser `using (true)` sem função privilegiada pelo meio: não há
-- linha de outro atleta que a função tivesse de filtrar.
--
-- k = 20 É UM CONTROLO DE PRIVACIDADE, NÃO UM PARÂMETRO DE AFINAÇÃO.
-- Vive no `check (n >= 20)` da tabela, e não numa constante do servidor, por
-- um motivo só: uma constante muda-se num commit distraído; isto tem de ser
-- uma migração escrita à mão, lida por alguém. Não baixar.

create table if not exists public.percentile_snapshots (
  metric       text not null default 'plan_execution'
    check (metric in ('plan_execution')),
  -- Escalão já DERIVADO: a agregação lê birth_date, converte, e a data de
  -- nascimento nunca chega aqui (minimização). 'sub23' e '23-34' não levam
  -- letra — o género está na coluna ao lado; dos 35 para cima seguem a
  -- convenção do atletismo (M35/F35…), e o check cruzado obriga a letra a
  -- bater certo com o género.
  age_band     text not null check (age_band in (
    'sub23', '23-34',
    'M35', 'M40', 'M45', 'M50+',
    'F35', 'F40', 'F45', 'F50+'
  )),
  gender       text not null check (gender in ('F','M')),
  terrain      text not null check (terrain in ('estrada','trail')),
  window_start date not null,
  window_end   date not null,
  n_band       text not null check (n_band in ('20-49','50-199','200+')),
  n            integer not null check (n >= 20),   -- o limiar k, travado na BD
  boundaries   numeric[] not null                  -- 19 fronteiras de ventil
    check (array_length(boundaries, 1) = 19),
  computed_at  timestamptz not null default now(),
  -- Marcado quando uma revogação torna esta janela desatualizada. Não é para
  -- os clientes verem (ver os GRANTs por coluna, mais abaixo): saber que
  -- ALGUÉM saiu agora é informação a mais.
  stale_at     timestamptz,
  primary key (metric, age_band, gender, terrain, window_start),
  constraint percentile_snapshots_janela check (window_end > window_start),
  -- A letra do escalão tem de bater certo com o género.
  constraint percentile_snapshots_escalao_genero check (
    age_band in ('sub23', '23-34') or left(age_band, 1) = gender
  )
);

comment on table public.percentile_snapshots is
  'Distribuições por segmento (escalão × género × modalidade × janela). As '
  'linhas são agregados de pelo menos 20 atletas e NÃO contêm user_id nenhum — '
  'é isso que torna a leitura segura com `using (true)`. Escritas só por '
  'service_role (supabase/functions/compute-percentile-snapshots).';

comment on column public.percentile_snapshots.n is
  'O tamanho exato do segmento. NUNCA sai para o cliente (ver os GRANTs por '
  'coluna): entre dois snapshots, a diferença de n entrega o indivíduo. O que '
  'o cliente lê é n_band.';

alter table public.percentile_snapshots enable row level security;

-- Leitura para toda a gente com sessão; escrita, só service_role. Não há
-- política de insert/update/delete de propósito — o RLS nega-as por omissão,
-- e o service_role passa ao lado do RLS por ser quem é.
drop policy if exists "percentile_snapshots read all" on public.percentile_snapshots;
create policy "percentile_snapshots read all" on public.percentile_snapshots
  for select to authenticated using (true);

-- O RLS é por LINHA; `n` e `stale_at` precisam de proteção por COLUNA, que
-- é privilégio, não política. Por omissão o Supabase dá tudo a anon e
-- authenticated nas tabelas de public — retira-se e devolve-se só o que o
-- cliente pode ver. Consequência prática, e é a intenção: um
-- `select=*` sobre esta tabela falha; o cliente tem de nomear as colunas
-- (ver src/components/Perfil/OndeEstasScreen.jsx).
revoke all on public.percentile_snapshots from anon, authenticated;
grant select (metric, age_band, gender, terrain, window_start, window_end, n_band, boundaries, computed_at)
  on public.percentile_snapshots to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- c) Trigger de revogação — à imagem de clear_cycle_data_on_consent_revoked
-- ────────────────────────────────────────────────────────────────────────────
--
-- Retirar o consentimento tem de ter efeito IMEDIATO, não "a partir do
-- próximo snapshot":
--   · dos snapshots FUTUROS o atleta sai sozinho — a agregação lê
--     profiles.stats_pool_consent_at e ele já lá não está;
--   · as janelas VIVAS (as que ainda não fecharam) ficam marcadas com
--     `stale_at`, e a agregação recomputa-as na volta seguinte;
--   · o nome abreviado desaparece do perfil com a revogação do 'leaderboard',
--     porque sem consentimento não há nome para mostrar em lado nenhum.
--
-- Marcam-se TODAS as janelas vivas, não as do segmento dele: saber qual o
-- segmento a recomputar era, por si só, dizer em que segmento ele está.

create or replace function public.clear_pool_data_on_consent_revoked()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.stats_pool_consent_at is not null and new.stats_pool_consent_at is null then
    update public.percentile_snapshots
      set stale_at = now()
      where window_end >= current_date and stale_at is null;
  end if;

  if old.leaderboard_consent_at is not null and new.leaderboard_consent_at is null then
    new.leaderboard_display_name := null;
  end if;

  return new;
end $$;

-- Lição de 20260918001600: uma função de trigger não tem de estar exposta
-- como RPC. O privilégio EXECUTE é verificado ao CRIAR o trigger, não quando
-- ele dispara — retirá-lo a anon/authenticated não o desliga.
revoke execute on function public.clear_pool_data_on_consent_revoked() from public, anon, authenticated;

-- BEFORE, não AFTER: o `new.leaderboard_display_name := null` tem de chegar à
-- linha que vai ser gravada (o clear_cycle_data_on_consent_revoked é AFTER
-- porque só escreve NOUTRA tabela).
drop trigger if exists clear_pool_data_on_consent_revoked on public.profiles;
create trigger clear_pool_data_on_consent_revoked
  before update of stats_pool_consent_at, leaderboard_consent_at on public.profiles
  for each row execute function public.clear_pool_data_on_consent_revoked();
