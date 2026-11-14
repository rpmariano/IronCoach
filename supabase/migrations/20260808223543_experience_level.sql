-- ============================================================================
-- Nível de experiência do atleta — geral (perfil) e por prova (agenda)
--
-- Duas colunas, propositadamente separadas em vez de uma só:
-- o nível geral de um corredor não se transfere integralmente entre
-- disciplinas (um avançado em estrada pode ser principiante em trail), e uma
-- classificação computada automaticamente a partir do histórico exigiria
-- lógica e manutenção que o produto decidiu não ter para já. Em vez disso,
-- os dois campos são de preenchimento do próprio atleta.
--
-- Ver specs/coach-investigacao.md (Bloco 0) para a doutrina que usa este
-- campo, e src/utils/experience.js para o vocabulário partilhado pelo cliente.
--
-- Idempotente: pode correr mais que uma vez sem efeito adverso.
-- ============================================================================

alter table profiles
  add column if not exists experience_level text
    check (experience_level is null or experience_level in ('iniciante', 'basico', 'medio', 'avancado'));

comment on column profiles.experience_level is
  'Nível GERAL do atleta como corredor. Editável no Perfil; pode também vir '
  'sugerido a partir das respostas ao onboarding (por implementar). Calibra o '
  'que é comum a todos os treinos — linguagem do Coach, limiares de aumento '
  'de volume, distribuição de intensidade — nada ligado a uma prova em '
  'concreto. Ver race_events.experience_level para o nível por prova.';

alter table race_events
  add column if not exists experience_level text
    check (experience_level is null or experience_level in ('iniciante', 'basico', 'medio', 'avancado'));

comment on column race_events.experience_level is
  'Nível AUTODECLARADO do atleta para ESTA prova — responsabilidade do '
  'atleta preencher ao criar/editar a prova (RunAgenda.jsx), sem herdar '
  'automaticamente de profiles.experience_level. Existe para o caso em que o '
  'nível geral não se aplica: um avançado em estrada pode marcar-se '
  'iniciante na primeira prova de trail. Calibra taper, progressão e '
  'viabilidade do objetivo para esta prova especificamente.';
