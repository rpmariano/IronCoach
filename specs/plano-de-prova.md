# Plano para o dia da prova

Decidido em 2026-09-12. Complementa `PRD.md` §3.4, `prova-concluida.md`,
`gamificacao-provas.md` ("A Carol no balanço") e CAROL.md §7.

## Princípio

Um plano de prova é uma tabela, não um conselho: para cada km, ou grupo de
km, o ritmo a fazer, o tempo de passagem e a instrução (controlar, ritmo,
aguentar, decidir, acelerar). Quando a Carol conhece o percurso, o plano
fala dos troços pelo nome que o site da prova lhes dá: "na subida da
Calçada da Ajuda, entre o km 6 e o 7, sobe para 5.40". Quando não conhece,
diz que não conhece, e planeia só com a distância e o desnível. Nunca
inventa um traçado.

## A régua (uma só, partilhada)

`supabase/functions/_shared/formulas/racePacing.ts`, `buildRacePacingPlan`,
lida pelo hub (via `@formulas`) e pelo coach-chat. Entradas: distância,
tipo (estrada/trail), D+, objetivo (`target_time_seconds`), previsão do
treino (`getRacePrediction`, só corridas anteriores à prova), nível, e
`race_events.web_info.route_segments` quando existir (marco de km,
descrição, sobe/desce/plano — o que o `enrich-race-event` extrai do site).

1. **Ritmo base.** O objetivo, se for realista face à previsão do treino
   (até 3% mais rápido do que ela). Se for mais ambicioso do que isso, o
   plano monta-se sobre a previsão e o objetivo fica como "dia bom":
   decide-se no ponto de decisão. Sem objetivo, a previsão; sem nenhum dos
   dois, não há plano — pede-se o objetivo.
2. **Distribuição** (negative split, por categoria de distância):
   - primeiro km: controlar, mais lento que a base (5/10 km +6 s, meia +8 s,
     maratona +10 s);
   - até 20%: controlar, +3 s;
   - 20% a 55%: ritmo, na base;
   - 55% a 70%: aguentar, na base (maratona +2 s);
   - 70%: ponto de decisão (meia ≈ km 15, maratona ≈ km 30) — se a sensação
     for boa, acelera; se não, mantém;
   - 70% a 90%: −3 s se acelerar;
   - últimos 10% (mínimo 1 km): acelerar (5/10 km −8 s, meia −5 s, maratona −3 s).
3. **Percurso.** Cada `route_segment` com marco de km e relevo ajusta o km
   em que cai: subida +8% no ritmo (trail +15%), descida −4% (trail −3%),
   com a instrução a citar a descrição do troço. Troços sem marco entram só
   como texto do `route_summary`.
4. **Trail** é por esforço, não por ritmo: o ritmo base fica como referência
   de plano, as subidas acima do que se corre a andar ("caminhada tática",
   doutrina 08), as descidas técnicas a controlar; sem zonas de FC no perfil
   fala-se em esforço.
5. **Abastecimento.** A partir da meia: água de 5 em 5 km; hidratos aos ~40
   min e depois a cada ~35 min, nunca nos últimos 10 min (doutrina 04).
6. O tempo de chegada planeado é a soma dos km; a tabela mostra os tempos
   de passagem acumulados.

## Onde aparece

1. **Hub da prova**, nos últimos 7 dias e no dia: cartão "Plano para o dia"
   com a tabela (troço, ritmo, passagem, instrução), as notas de percurso e
   o abastecimento. Sem `web_info` e com site, o botão "Buscar o percurso"
   já existente. Sem objetivo, o cartão pede-o.
2. **Carol na véspera** (`race_eve`): recebe a tabela e os troços no
   contexto e apresenta o plano na voz dela, troço a troço, com os porquês
   — não uma lista seca, mas também sem omitir números. Se o objetivo é
   ambicioso, diz-o e explica o ponto de decisão.
3. **Carol na manhã** (`race_morning`): duas frases e, no máximo, dois
   números: o ritmo do primeiro km e, se ainda não comeu, a hora do
   pequeno-almoço.
4. **Balanço** (`race_after`): com parciais registados (`runs.details.splits`),
   o cliente manda-os no `race_outcome` e o servidor compara km a km com o
   plano — é daí que sai a causa concreta de um "aquém" ("arrancaste a 5.05
   quando o plano dizia 5.35").

## A véspera e a hora (decidido 2026-09-12)

A hora passa a ser um dado de primeira: `start_time` (time, hora local,
opcional) em `race_events`, `runs` e `workout_sessions` — migração
`20260912212930_start_times.sql`. Nos formulários: "Hora de partida" na
prova (agenda), "Hora" no registo de corrida e no de ginásio.

Com a hora de partida a Carol deixa de aconselhar em abstrato. O coach-chat
calcula a véspera e a manhã (`buildRaceEveContext`, fórmula pura, com o peso
do perfil quando existe) e a Carol apresenta-a na véspera a seguir ao plano,
com horas e quantidades:

- **Jantar da véspera**: hidratos complexos (arroz, massa, batata, pão),
  2 a 4 g/kg, pouca fibra e pouca gordura, nada de novo; a carga de hidratos
  (10-12 g/kg/dia nas 24-48 h) só em provas acima de 90 min (doutrina 4.3).
- **Água**: a base de 30-40 ml/kg no dia, e 5-7 ml/kg nas 4 h antes da
  partida, aos goles; parar 45 min antes.
- **Sono**: 8 h no alvo (7 no mínimo), com a hora de deitar calculada a
  partir da hora de acordar; a noite mais importante é a anterior à véspera.
- **Descontrair**: nada de treino além de 15-20 min muito fáceis, material
  preparado à noite, ecrãs cedo fora, sem experiências novas.
- **Manhã**: acordar 3 h antes da partida (2 h 30 no mínimo), pequeno-almoço
  2 h 30 a 3 h antes (1-2 g/kg de hidratos, pouca fibra), chegada 60 min
  antes, aquecimento 25 min antes.

Sem hora de partida a Carol diz que não a tem e pergunta-a — e o cartão do
plano no hub pede-a. A hora dos treinos (corrida e ginásio) entra nas
linhas que a Carol lê ("às 07:30"): treinos tarde a cortar o sono, e na
última semana o conselho de treinar à hora da prova.

**Onde a hora se vê e se muda (2026-09-13).** A regra do utilizador: a hora
é a da OCORRÊNCIA, nunca a de introdução na app. Corrida, ginásio e
avaliação corporal têm o campo ao lado da data, vazio por omissão ("Hora",
"Hora da avaliação"; `body_assessments.assessment_time`, migração
`20260913223000_body_assessment_time.sql`). A prova tem "Hora de partida"
na agenda e também no registo em modo prova ("O resultado"), pré-preenchida
com a da agenda mas da corrida — a partida real pode não ser a anunciada.
A refeição tem `meals.meal_time` (migração `20260913220000_meal_time.sql`):
a hora é SUGERIDA pelo tipo escolhido (pequeno-almoço 08:00, lanche da
manhã 11:00, almoço 13:00, lanche 17:00, jantar 20:00, ceia 23:00), segue o
tipo enquanto o atleta não lhe tocar, e muda-se à vontade. Todas se gravam
por update à parte (as analyze-* não as conhecem). A Carol conhece-as: o
coach-chat lista corridas e treinos com a hora e, nos hábitos alimentares,
a hora habitual de cada refeição (mediana de `meal_time`,
`computeMealTypicalTimes`); o coach-daily-summary recebe `start_time` das
corridas e treinos, "Almoço às 13:10" nas refeições de hoje e a hora das
avaliações. O Calendário ordena o dia pela hora, entre
tipos (`src/utils/dayOrder.js`): avaliação corporal de manhã, depois o resto
pela hora; sem hora, no fim.

## O plano tem de saber da prova (decidido 2026-09-13)

A véspera é uma fórmula partilhada, `_shared/formulas/raceEve.ts`
(`computeRaceEve`): as horas e as gramas que a Carol diz no chat são as que
o cartão do Início mostra e as que o `coach-daily-summary` recebe.

- **Cartão do Início**: na véspera, "Preparar amanhã" é a prova (partida,
  jantar, deitar, acordar, pequeno-almoço, chegada), não o item do plano; no
  dia, "Aviso de hoje" abre com a prova e a hora. O `coach-daily-summary`
  recebe a véspera no contexto e a estratégia nutricional fala dela.
- **Plano de treino**: o dia da prova é a prova — item `corrida` com
  `training_type = 'prova'`, distância da prova, notas a apontar para o
  plano do hub. O `runProposeTrainingPlan` valida: uma corrida nesse dia
  normaliza-se para `prova`; ginásio ou descanso nesse dia é erro; sem item
  nesse dia, o servidor insere-o; na véspera e antevéspera só recuperação
  ou descanso — a lista do que é recusado (`longo`, `tempo`, `fartlek`,
  `intervalos`, `subidas` e ginásio) vive em `vocabulary.ts` e é a mesma
  que o alerta do Início usa. Registar a prova conclui esse item. As
  sugestões alimentares da véspera e do dia seguem a véspera, que entra no
  prompt a dois dias da prova.
- **Alerta de ajuste**: o cliente deteta quando a realidade se afastou do
  plano (`utils/planDivergence.js`): prova dentro do período do plano sem
  item de prova, treino no dia da prova, treino forte a dois dias da prova,
  duas ou mais sessões falhadas nos últimos 7 dias. Sem tabela nova. O
  aviso "O plano precisa de um ajuste" vive no botão flutuante da Carol no
  Início (conta no número e abre na janela dos insights, com os motivos) —
  desde 2026-09-13 já não no cabeçalho do cartão dela, onde se confundia com
  o resumo do dia; o mesmo vale para "precisa de falar contigo" e para o
  balanço da prova. "Falar com a Carol" entra no "Adaptar plano" com os motivos
  (`plan_divergence` no body), e a Carol explica o que muda e propõe o plano
  ajustado. A mesma deteção não volta a chamar enquanto o plano não mudar.
  As sessões falhadas só contam se foram planeadas depois da última
  reescrita do plano (o `created_at` mais recente dos itens): ajustar um
  plano aceite escreve os itens novos no plano original e deixa os dias
  passados como "pendente", e sem esta regra as falhadas de antes do ajuste
  continuavam a chamar pela Carol depois de ela as ter resolvido (relatado
  2026-09-13).

## Fora de âmbito

Meteorologia, perfil altimétrico do site (só o qualitativo dos segmentos),
ajuste em tempo real durante a prova.
