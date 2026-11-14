-- ============================================================================
-- Autorização do Coach para escrever metas estáveis de nutrição
--
-- Ver specs/coach-investigacao.md, DECISÃO N1 — camada 1: "metas estáveis
-- (proteína, gordura) — o coach pode escrevê-las no perfil, com o toggle de
-- autorização e a cor do módulo Coach a marcar a origem."
--
-- Só proteína e gordura, nunca calorias nem hidratos: essas são metas
-- VARIÁVEIS (camada 2 da mesma decisão) — mudam com o treino do dia e vivem
-- na análise, não numa coluna fixa. Escrevê-las aqui contrariaria a própria
-- decisão que motivou este campo.
--
-- coach_can_set_nutrition_goals: interruptor do atleta — sem ele a Edge
-- Function recusa a escrita mesmo que o modelo tente.
-- protein_goal_set_by_coach / fat_goal_set_by_coach: origem do valor atual,
-- para o Perfil colorir o campo com a cor do módulo Coach. Uma edição manual
-- do atleta desliga a flag correspondente — o valor deixa de ser "do coach"
-- no momento em que o atleta o substitui pelo seu.
--
-- Idempotente: pode correr mais que uma vez sem efeito adverso.
-- ============================================================================

alter table profiles
  add column if not exists coach_can_set_nutrition_goals boolean not null default false;
alter table profiles
  add column if not exists protein_goal_set_by_coach boolean not null default false;
alter table profiles
  add column if not exists fat_goal_set_by_coach boolean not null default false;

comment on column profiles.coach_can_set_nutrition_goals is
  'Autorização explícita do atleta para o Coach escrever protein_goal/fat_goal diretamente no perfil durante a conversa. Sem isto a Edge Function coach-chat recusa a ferramenta update_nutrition_goals mesmo que o modelo a invoque.';
comment on column profiles.protein_goal_set_by_coach is
  'true quando o valor atual de protein_goal foi escrito pelo Coach (não pelo atleta) — usado só para colorir o campo no Perfil. Uma edição manual desliga.';
comment on column profiles.fat_goal_set_by_coach is
  'true quando o valor atual de fat_goal foi escrito pelo Coach (não pelo atleta) — usado só para colorir o campo no Perfil. Uma edição manual desliga.';
