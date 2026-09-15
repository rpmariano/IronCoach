-- ============================================================================
-- medal_awards — O Terreno e A Sequência entram, A Época e A Consistência saem
-- (specs/palmares-medalhoes.md, "Os medalhões").
--
-- Porquê: os medalhões 4 e 5 eram sobre o calendário e sobre o plano da
-- Carol, não sobre provas. Em 2026-09-15 foram substituídos por dois que
-- puxam para o Palmarés conquistas de prova que já existiam e só viviam no
-- hub (`primeira_trail` e `sequencia`, em src/utils/achievements.js):
--
--   'terreno'   — 1.ª e 5.ª prova em cada terreno (estrada, trail)
--   'sequencia' — a maior sequência de sempre de provas seguidas registadas
--
-- Só muda a restrição do `medalhao`: nada de novo a guardar, os encaixes e os
-- period_key continuam a ter a mesma forma ('estrada1', 'trail5', 'seq2'...,
-- com period_key '' porque cada um se ganha uma vez só).
--
-- ATENÇÃO — 'epoca' e 'consistencia' FICAM na lista de valores aceites, de
-- propósito. A app já não os calcula, mas a tabela foi sincronizada em
-- produção com esses valores antes desta mudança: tirá-los da restrição faria
-- a validação falhar nas linhas que já lá estão. São histórico — não se
-- apagam nem se reescrevem, e uma linha antiga d'A Época continua a poder ser
-- lida (fica sem título nem frase, que se reconstroem do `due` e já não
-- existem para ela: é exatamente o que src/utils/medalAwards.js faz com
-- qualquer linha sem entrada devida).
--
-- ATENÇÃO: é produção. Só se aplica com pedido explícito.
-- ============================================================================

alter table public.medal_awards
  drop constraint if exists medal_awards_medalhao_check;

alter table public.medal_awards
  add constraint medal_awards_medalhao_check
  check (medalhao in ('ano_km', 'distancias', 'recordes', 'epoca', 'consistencia', 'superacao', 'terreno', 'sequencia'));

comment on constraint medal_awards_medalhao_check on public.medal_awards is
  'Os medalhões que a app calcula hoje (ano_km, distancias, recordes, terreno, sequencia, superacao) mais epoca e consistencia, que deixaram de se calcular em 2026-09-15 mas cujas linhas já gravadas ficam como histórico.';
