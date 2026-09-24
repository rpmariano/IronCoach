-- ============================================================================
-- medal_awards — "Os Recordes" passa a chamar-se "Os Níveis" ('recordes' →
-- 'niveis'), na fusão dos dois motores de prémios (fase 0 da reforma da
-- gamificação, src/utils/premios.js).
--
-- Porquê: havia duas coisas diferentes com o mesmo nome. O medalhão nunca foi
-- o recorde de ninguém — é uma ESCALA DE APTIDÃO (VDOT, bronze/prata/ouro),
-- em que se sobe de degrau sem bater tempo próprio nenhum e em que um 10 km
-- de ouro e uma maratona de ouro valem o mesmo. O recorde pessoal — o melhor
-- tempo do atleta naquela categoria de distância — é outra regra, vive na
-- conquista `recorde_pessoal` (src/utils/achievements.js, predicado
-- `bateuRecordePessoal` em src/utils/premios.js) e ficou lá. A spec chegou a
-- dizer que a conquista "passava a viver em Os Recordes"; nunca passou, e não
-- podia — são duas perguntas diferentes sobre a mesma prova.
--
-- Só muda a restrição do `medalhao`: nada de novo a guardar, os encaixes
-- ('5k', '10k', '21k', '42k', 'ritmo', 'vo2') e os period_key (o nível:
-- 'bronze', 'prata', 'ouro') continuam a ter exatamente a mesma forma e o
-- mesmo significado, e `value` continua a ser o número medido (os segundos
-- da melhor prova, os s/km do passo, o VO2).
--
-- ATENÇÃO — 'recordes' FICA na lista de valores aceites, de propósito, pela
-- mesma razão que 'epoca' e 'consistencia' ficaram em 2026-09-15: as linhas
-- já gravadas em produção com esse valor são histórico e não se apagam nem se
-- reescrevem. As medalhas voltam a ser cunhadas sob 'niveis' (a produção tem
-- dois utilizadores; re-ver a cerimónia é aceitável e foi decidido), e as
-- antigas ficam a ser lidas sem título nem frase, que é o que
-- src/utils/medalAwards.js já faz com qualquer linha sem entrada devida.
--
-- O lado do servidor aceita os dois valores desde já
-- (supabase/functions/_shared/carolMemory.ts, buildPalmaresContext), para a
-- memória da Carol não perder os melhores tempos por prova entre o deploy do
-- cliente e a aplicação desta migração.
--
-- APLICADA EM PRODUÇÃO a 2026-09-22, com autorização explícita, ANTES do
-- merge do código — e a ordem aqui não era uma preferência, era o bloqueio.
-- `src/utils/medalAwards.js` grava o lote inteiro NUM upsert só, e o
-- `ignoreDuplicates` traduz-se em `on conflict do nothing`, que só apanha
-- conflitos de chave única: uma violação de CHECK aborta a instrução TODA.
-- Com o código novo a emitir 'niveis' contra a restrição antiga, deixava de
-- se gravar medalha NENHUMA — ano_km, distancias, terreno, sequencia e
-- superacao incluídas — e nenhuma cerimónia disparava. Sem perda de dados (o
-- `missing` recalcula-se a cada sincronização), mas com o Palmarés mudo até
-- à migração. Por isso: DDL primeiro, sempre.
-- ============================================================================

alter table public.medal_awards
  drop constraint if exists medal_awards_medalhao_check;

alter table public.medal_awards
  add constraint medal_awards_medalhao_check
  check (medalhao in ('ano_km', 'distancias', 'niveis', 'recordes', 'epoca', 'consistencia', 'superacao', 'terreno', 'sequencia'));

comment on constraint medal_awards_medalhao_check on public.medal_awards is
  'Os medalhões que a app calcula hoje (ano_km, distancias, niveis, terreno, sequencia, superacao) mais recordes (renomeado para niveis em 2026-09-21), epoca e consistencia (deixaram de se calcular em 2026-09-15), cujas linhas já gravadas ficam como histórico.';
