/* Glossário: o que cada termo da prontidão quer dizer, na voz da Carol.
   Auditoria de onboarding (specs/onboarding-2026-09/tooltip-content.js): os
   ~73 title="…" da app não aparecem num telemóvel, e os nomes dos pilares
   chegam cortados a 375px ("Disponibilidade…").

   Os limiares são os do motor (supabase/functions/_shared/formulas/:
   readinessIndex.ts, runAcwr.ts, vdotTrend.ts). Se um mudar lá, muda aqui,
   senão o texto contradiz o número que está ao lado. */
export const GLOSSARY = {
  prontidao:
    'Quão preparado estás para a próxima prova, de 0 a 100%. Junta a carga de treino, a energia que comes, a nutrição, a forma aeróbica e, se houver prova, se o tempo que falta chega. Um pilar sem registos não conta.',

  acwr:
    'Carga aguda ÷ crónica: os km desta semana comparados com a média das últimas 4. Entre 0,8 e 1,3 estás a evoluir com segurança; acima de 1,5 subiste depressa demais e o risco de lesão sobe. Precisa de corridas em pelo menos 3 das últimas 4 semanas.',

  disponibilidadeEnergetica:
    'A energia que sobra para o corpo depois do treino: o que comes menos o que gastas a treinar, por kg de massa magra. 45 kcal/kg ou mais é o ideal; abaixo de 30 o corpo começa a poupar (é o sinal de alerta do RED-S).',

  nutricao:
    'Quanto do teu alvo de calorias comeste esta semana, em média. Perto de 100% é o que se quer; muito abaixo não chega para o treino.',

  formaAerobica:
    'Se o teu VDOT (um número que resume a forma aeróbica, a partir dos tempos das corridas) está a subir, estável ou a descer. Precisa de pelo menos 2 corridas de 3 km ou mais feitas a sério: prova, tempo, intervalos ou esforço de 7 para cima.',

  viabilidadeTatica:
    'Se o tempo até à prova e o volume que estás a fazer chegam para a distância e o teu nível, e se o ritmo-alvo bate com as tuas corridas recentes.',

  comoAcordaste:
    'O check-in de hoje: sono, energia, stress e dor. Só entra nos dias em que o fazes.',
};

/** O texto do glossário para cada pilar do índice de prontidão. */
export const PILLAR_GLOSSARY = {
  acwr: GLOSSARY.acwr,
  ea: GLOSSARY.disponibilidadeEnergetica,
  calories: GLOSSARY.nutricao,
  vdot: GLOSSARY.formaAerobica,
  tactic: GLOSSARY.viabilidadeTatica,
  checkin: GLOSSARY.comoAcordaste,
};
