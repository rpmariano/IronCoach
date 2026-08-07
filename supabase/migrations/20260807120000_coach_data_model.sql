-- ============================================================================
-- Enriquecimento do modelo de dados para os coaches especializados
--
-- NÃO APLICADA — para revisão. Aplicar com:
--   supabase db push        (ou via painel SQL do Supabase)
--
-- Contexto: specs/coach-investigacao.md
-- Todas as colunas são nullable e idempotentes: nenhum registo existente é
-- destruído e a migração pode correr duas vezes sem efeito adverso.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. profiles.birth_date — idade cronológica
-- ---------------------------------------------------------------------------
-- Guardamos a DATA DE NASCIMENTO, não a idade. Uma coluna `age` fica
-- silenciosamente errada a partir do primeiro aniversário; a data derivada em
-- runtime está sempre certa.
--
-- Necessária para: zonas de frequência cardíaca (todas as fórmulas dependem da
-- idade), necessidades proteicas ajustadas à idade, ritmo de recuperação
-- esperado. Sem ela, o coach de corrida não pode falar de zonas de FC.
--
-- Nota: `body_assessments.metabolic_age` NÃO serve para isto — é uma estimativa
-- da balança sobre o estado metabólico, não a idade real.

alter table profiles
  add column if not exists birth_date date;

comment on column profiles.birth_date is
  'Data de nascimento. A idade é derivada em runtime — nunca guardar a idade '
  'em coluna própria, fica desatualizada. Usada para zonas de FC e ajuste de '
  'necessidades nutricionais.';


-- ---------------------------------------------------------------------------
-- 2. race_events — objetivo da prova em formato computável
-- ---------------------------------------------------------------------------
-- A coluna `target_time` (text) mantém-se: é o que o utilizador escreveu, serve
-- de fallback de apresentação e evita perda de informação. Mas não é calculável
-- — os 6 registos existentes provam-no: "5.20 por km", "50m", "1:55:00",
-- "2h no total", "1h 50min no total".
--
-- Pior: misturam duas semânticas. Umas entradas são RITMO, outras TEMPO TOTAL.
-- Daí duas colunas separadas em vez de uma.

alter table race_events
  -- Objetivo em tempo total (ex.: "1:55:00" numa meia → 6900)
  add column if not exists target_time_seconds integer
    check (target_time_seconds is null or target_time_seconds > 0),

  -- Objetivo em ritmo médio (ex.: "5:20 por km" → 320)
  add column if not exists target_pace_seconds_per_km integer
    check (target_pace_seconds_per_km is null or target_pace_seconds_per_km > 0),

  -- Distância oficial da prova. `race_type` só a implica em '5k'/'10k'/'21k'/
  -- '42k'; para 'estrada', 'trail', 'ultra' e 'outro' não diz nada — e são
  -- 4 das 6 provas registadas. Sem distância não há taper calibrado, não há
  -- conversão entre ritmo e tempo, e não há forma de avaliar se o objetivo é
  -- viável face ao histórico.
  --
  -- Criada nullable para permitir o backfill abaixo; passa a NOT NULL no fim
  -- da migração, por decisão de produto (campo imprescindível ao coach).
  add column if not exists distance_km numeric
    check (distance_km is null or distance_km > 0);

comment on column race_events.target_time_seconds is
  'Objetivo de tempo total, em segundos. Preencher este OU '
  'target_pace_seconds_per_km — conhecida a distance_km, um converte no outro.';
comment on column race_events.target_pace_seconds_per_km is
  'Objetivo de ritmo médio, em segundos por km.';
comment on column race_events.distance_km is
  'Distância oficial. Obrigatória na prática para qualquer cálculo do coach, '
  'apesar de nullable para não partir registos antigos.';


-- ---------------------------------------------------------------------------
-- 3. Conversão dos 6 registos existentes
-- ---------------------------------------------------------------------------
-- Feita por valor literal em vez de parser genérico: são 6 linhas, e um regex
-- que aceite "5.20 por km" e "1h 50min no total" ao mesmo tempo seria mais
-- arriscado do que escrever as conversões à mão.

-- "5.20 por km" = 5min20s/km = 320 s/km (confirmado pelo utilizador).
-- Convenção da app: o ponto separa minutos de segundos no ritmo, e é sempre
-- assim que o ritmo é apresentado — ver formatPace() em src/utils/run.js.
update race_events
   set target_pace_seconds_per_km = 320
 where target_time = '5.20 por km'
   and target_pace_seconds_per_km is null;

update race_events set target_time_seconds = 3000  -- "50m"
 where target_time = '50m' and target_time_seconds is null;

update race_events set target_time_seconds = 6900  -- "1:55:00"
 where target_time = '1:55:00' and target_time_seconds is null;

update race_events set target_time_seconds = 7200  -- "2h no total"
 where target_time = '2h no total' and target_time_seconds is null;

update race_events set target_time_seconds = 6600  -- "1h 50min no total"
 where target_time = '1h 50min no total' and target_time_seconds is null;


-- Distância: só onde `race_type` a determina sem ambiguidade.
update race_events set distance_km = 5       where race_type = '5k'  and distance_km is null;
update race_events set distance_km = 10      where race_type = '10k' and distance_km is null;
update race_events set distance_km = 21.0975 where race_type = '21k' and distance_km is null;
update race_events set distance_km = 42.195  where race_type = '42k' and distance_km is null;

-- Distâncias das provas em 'estrada', indicadas pelo utilizador.
update race_events set distance_km = 10
 where name in ('Corrida do Tejo', 'Volkswagen run') and distance_km is null;

update race_events set distance_km = 21.0975
 where name in ('Meia dos Descobrimentos', 'Meia de Lisboa') and distance_km is null;


-- ---------------------------------------------------------------------------
-- 4. distance_km passa a obrigatória
-- ---------------------------------------------------------------------------
-- Decisão de produto: sem distância o coach não consegue calcular ritmo-alvo,
-- taper nem viabilidade do objetivo — a prova fica inútil para análise.
--
-- Este passo falha de propósito se algum registo tiver ficado sem distância.
-- Preferível abortar a migração do que passar a aceitar provas incalculáveis.
alter table race_events
  alter column distance_km set not null;


-- ---------------------------------------------------------------------------
-- Verificação pós-migração
-- ---------------------------------------------------------------------------
-- select name, race_type, target_time, target_time_seconds,
--        target_pace_seconds_per_km, distance_km
--   from race_events order by date;
