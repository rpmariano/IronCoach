/*
 * Glossário: o texto para o MetricInfo (src/components/BI/MetricInfo.jsx)
 * nos termos que hoje aparecem sem explicação.
 * Destino proposto: src/utils/glossary.js
 *
 * Porquê MetricInfo e não `title="…"`: os ~73 `title` da app só aparecem
 * ao passar o rato; num telemóvel não existem. O MetricInfo abre por toque,
 * já tem área de toque de 44px e fecha os outros quando se abre.
 *
 * Tom: o da Carol (tu, frases curtas, diz o que fazer com o número).
 * Os valores de referência são os que o motor usa
 * (supabase/functions/_shared/formulas/readinessIndex.ts), para o texto
 * não contradizer o cálculo.
 */
export const GLOSSARY = {
  rpe:
    'Esforço percebido, de 1 a 10: quão duro te pareceu, não o que o relógio diz. 1–3 fácil, dá para conversar; 4–6 moderado; 7–8 duro, só frases curtas; 9–10 no limite.',

  acwr:
    'Carga aguda ÷ crónica: os km desta semana comparados com a média das últimas 4. Entre 0,8 e 1,3 estás a evoluir com segurança; acima de 1,5 subiste depressa demais e o risco de lesão sobe. Precisa de 4 semanas de corridas.',

  vdot:
    'Um número que resume a tua forma aeróbica, calculado a partir dos tempos das tuas corridas (método de Jack Daniels). Mais alto = mais rápido para o mesmo esforço. Serve para comparar-te contigo, não com os outros.',

  prontidao:
    'Quão preparado estás para a próxima prova, de 0 a 100%. Junta a carga de treino, a energia que comes, a nutrição, a forma aeróbica e, se houver prova, se o tempo que falta chega. Precisa de duas semanas de registos para dizer alguma coisa.',

  disponibilidadeEnergetica:
    'A energia que sobra para o corpo depois do treino: o que comes menos o que gastas a treinar, por kg de massa magra. Abaixo de 30 kcal/kg o corpo começa a poupar (é o sinal de alerta do RED-S); 45 ou mais é o ideal.',

  formaAerobica:
    'Se o teu VDOT está a subir, estável ou a descer, comparando a corrida mais recente com as anteriores. Precisa de pelo menos 2 corridas com tempo.',

  viabilidadeTatica:
    'Se o tempo até à prova e o volume que estás a fazer chegam para a distância e o teu nível. Desce quando a prova está perto de mais ou o volume semanal está longe do necessário.',

  dPositivo:
    'D+ é o desnível positivo: a soma de todas as subidas do percurso, em metros. 500 m D+ num trail de 15 km é um percurso com subidas a sério.',

  zonas:
    'Z1 e Z2 são as zonas de frequência cardíaca fáceis. A regra 80/20: cerca de 80% do tempo nelas e 20% em esforço mais duro. Precisa de corridas com FC (relógio ou app).',

  volumeCarga:
    'Séries × repetições × peso, somado. Se este número sobe ao longo das semanas, estás a ficar mais forte.',

  paceMedio:
    'Minutos por quilómetro. 5:15/km quer dizer que cada km demorou 5 minutos e 15 segundos; quanto mais baixo, mais rápido.',
};

/*
 * Onde pôr cada um (todos com <MetricInfo text={GLOSSARY.x} /> a seguir ao rótulo):
 *
 *   rpe                        Run/RunRegistration.jsx:2054 (e trocar o rótulo, ver contextual-hints.jsx)
 *   acwr                       Run/RunDashboard.jsx:326 ("ACWR Status");
 *                              Dashboard/OverviewDashboard.jsx:67 (badge "ACWR x.x")
 *   vdot                       Run/RaceHubView.jsx:689 ("VDOT no início / fim")
 *   prontidao                  BI/RaceReadinessCard.jsx:128 e :168; Run/RaceHubView.jsx:757 e :906
 *                              (substitui os title="…" que lá estão)
 *   disponibilidadeEnergetica  pilar "Disponibilidade Energética" do RaceReadinessCard
 *   formaAerobica              pilar "Forma Aeróbica (VDOT)"
 *   viabilidadeTatica          pilar "Viabilidade Tática"
 *   dPositivo                  campo D+ no formulário de prova (RunAgenda) e no passo "prova" do onboarding
 *   zonas                      Run/RaceHubView.jsx:1044 ("Z1/Z2: n%")
 *   volumeCarga                já explicado em BI/VolumeLoadChart.jsx:124; usar este texto no
 *                              cartão do pilar Ginásio ("kg vol.")
 *   paceMedio                  KPI "Pace Médio" do RunDashboard
 *
 * Nos pilares do RaceReadinessCard os nomes estão cortados a 375px
 * ("Disponibilidade…", "Viabilidade Tá…"): o (i) resolve também isso,
 * porque o texto completo aparece ao tocar.
 */
