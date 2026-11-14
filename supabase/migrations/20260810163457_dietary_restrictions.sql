-- ============================================================================
-- Restrições alimentares do atleta
--
-- Pré-requisito de todo o Bloco 7 (sugestões alimentares) da investigação.
-- Ver specs/coach-investigacao.md, Bloco 7 #5: sem este campo o Coach não
-- fica calado — fica errado. Sugere 150 g de frango a um vegetariano ou
-- massa a um celíaco, e perde a confiança do utilizador à primeira sugestão.
--
-- Porquê text[] e não uma tabela de junção: as combinações são reais
-- (vegetariano E sem lactose é comum), mas o conjunto de valores é pequeno,
-- fechado e nunca é consultado isoladamente — é sempre lido junto com o
-- resto do perfil. coach_plan_items.categories já usa text[] pela mesma
-- razão, portanto isto segue o padrão que o schema já tem.
--
-- Idempotente: pode correr mais que uma vez sem efeito adverso.
-- ============================================================================

alter table profiles
  add column if not exists dietary_restrictions text[];

comment on column profiles.dietary_restrictions is
  'Restrições alimentares autodeclaradas, editáveis no Perfil. NULL ou array '
  'vazio = sem restrições (omnívoro) — "omnivoro" não é um valor guardado, é '
  'a ausência de valores. Cada entrada muda alvos nutricionais concretos: '
  'vegetariano/vegano exigem 1,8x o ferro de um omnívoro e +10-20% de '
  'proteína; sem_lactose exige atenção a cálcio e vitamina D; sem_gluten '
  'torna a carga de hidratos mais difícil sem exceder fibra. Ver '
  'src/utils/diet.js para o vocabulário partilhado com o cliente e '
  'specs/coach-investigacao.md (Bloco 7 #5) para a doutrina.';

-- Vegano é mais restritivo que vegetariano, nunca ambos ao mesmo tempo: se os
-- dois pudessem coexistir, toda a lógica a jusante teria de decidir qual
-- ganha. Resolve-se aqui, uma vez, em vez de em cada sítio que lê o campo.
alter table profiles
  drop constraint if exists profiles_dietary_restrictions_valid;

alter table profiles
  add constraint profiles_dietary_restrictions_valid check (
    dietary_restrictions is null
    or (
      dietary_restrictions <@ array['vegetariano', 'vegano', 'sem_lactose', 'sem_gluten']::text[]
      and not ('vegetariano' = any (dietary_restrictions) and 'vegano' = any (dietary_restrictions))
    )
  );

-- Alergias e intolerâncias que a lista fechada não consegue exprimir. Existe
-- por segurança, não por otimização: uma alergia a frutos secos ou marisco é
-- potencialmente grave e não cabe num enum de quatro valores derivado de
-- literatura sobre desempenho. O Coach trata este texto como restrição
-- absoluta — nunca sugere nada que o contrarie, mesmo sem o interpretar.
alter table profiles
  add column if not exists dietary_notes text;

comment on column profiles.dietary_notes is
  'Texto livre para alergias, intolerâncias e recusas que dietary_restrictions '
  'não cobre (frutos secos, marisco, etc.). Tratado pelo Coach como restrição '
  'absoluta e nunca contrariado por uma sugestão alimentar.';
