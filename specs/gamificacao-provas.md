# Palmarés — gamificação das provas

Decidido em 2026-09-12, sobre o canvas "Palmarés da IronCoach"
(https://claude.ai/code/artifact/493e420d-b75a-45ea-abcb-e59d220d454f).
Depende de `prova-concluida.md` (corrida ligada à prova por `runs.race_id`,
memórias em `race_events`). Complementa `PRD.md` §3.4 e CAROL.md §7.

## Princípio

A conquista é um momento, não um bloco fixo. Aparece onde o dia a seguir à
prova se vive — o registo, o Início, a Carol — e arquiva-se num sítio só, o
Palmarés, que vive no separador Provas desde 2026-09-13 (antes no Perfil).
Nunca compete com "o que faço hoje".

## As conquistas (calculadas dos dados, sem tabelas novas)

| Chave | Nome | Regra | Cor |
|---|---|---|---|
| `prova_concluida` | Prova concluída | contagem de `race_events` com `status = 'concluida'` e corrida ligada | âmbar `--race` |
| `objetivo_batido` | Objetivo batido | `details.official_time_seconds` (ou `duration_seconds`) ≤ `target_time_seconds` da prova | verde `--ok` |
| `acima_do_treino` | Acima do treino | `raceOutcome.vsTraining === 'acima'`: o tempo oficial ficou pelo menos `TRAINING_BAND_RATIO` (2%) abaixo do que a previsão de Riegel sobre as corridas ANTERIORES à prova fazia esperar. A única que não exige objetivo marcado nem histórico na distância | ciano `--coach` |
| `recorde_pessoal` | Recorde pessoal | melhor tempo do atleta na categoria de distância da prova (`categorizeDistance` das fórmulas partilhadas), entre corridas `kind = 'competicao'` | ciano `--run` |
| `primeira_trail` | Primeira de trail | primeira prova concluída com `race_type = 'trail'` | âmbar `--race` |
| `sequencia` | Sequência de provas | N provas seguidas concluídas com corrida ligada, sem nenhuma agendada que tenha passado por correr; N ≥ 2 | âmbar `--race` |

`acima_do_treino` não entra nas conquistas PERDIDAS de uma prova
(`PERDIDAS_NA_PROVA`): a diferença face à previsão já está no bloco dos
tempos do hub, e três linhas de "fica para a próxima" na mesma prova passavam
de leitura a repreensão.

Bloqueada = vidro neutro com cadeado, sem cor, e uma frase que diz o que
falta ("Ficaste a 1:42 na Meia de Lisboa"). Desbloqueada = cor do
significado, data e a prova que a deu. Uma função pura
`src/utils/achievements.js` (`computeAchievements({ raceEvents, runs })`)
devolve a lista com `{ key, unlocked, date, raceId, detail, isNew }`;
`isNew` = desbloqueada pela prova registada há menos de 7 dias.

## Onde aparece

1. **Ao guardar a prova** — o `RecordConfirmation` em âmbar ("Prova
   concluída", nome da prova, "1:53:42 · a tua 3.ª prova"); se houver
   conquista nova, entra um cartão 300 ms depois com o ícone, "Nova
   conquista", o nome e o detalhe. Sai aos 1,6 s para o hub. Sem conquista
   nova, só o check. Movimento reduzido: tudo a 120 ms.
2. **Hub da prova (depois)** — secção "Conquistas" entre as memórias e o
   balanço: as conquistas desta prova como cartões; a que ficou por
   desbloquear numa linha ("Objetivo batido fica para a próxima: ficaste a
   1:42").
3. **Início, o dia a seguir** — o cartão "Para onde vou" passa a "Prova
   concluída · ontem" com tempo, pace, objetivo, a ordem da prova em grande
   (26px), as conquistas em chips (`Recorde pessoal`, `Acima do treino`) e
   dois botões: "Ver memórias" (hub) e "Próxima prova" (`RunAgenda`). Fica
   até marcares a próxima prova ou 7 dias, o que vier primeiro; depois o
   Início volta a olhar para a frente. A Carol chama pelo balanço no botão
   flutuante do Início (aviso "O balanço da prova", desde 2026-09-13; antes
   era o cabeçalho do cartão de topo), ligado ao gatilho `race_after` que já
   existe. Sem lembrete permanente no Início.
4. **Carol, no chat** — o balanço `race_after` cita a conquista em texto,
   opinião primeiro, sem cartão: "1:53:42 é o teu melhor tempo na meia —
   4:04 abaixo do anterior". O prompt recebe as conquistas novas no contexto
   (é uma mudança em `coach-chat`, portanto produção: passo à parte, com o
   cuidado habitual).
5. **Substituído em 2026-09-15 pelos medalhões — ver `palmares-medalhoes.md`.**
   O texto abaixo descreve o cartão que existe hoje, até essa spec entrar.
   **Separador Provas** (era Perfil · Pessoal, opção B, até 2026-09-13; ver
   specs/prova-concluida.md §"Onde vivem as provas") — cartão "Palmarés":
   as conquistas em linha (44px cada, cor ou cadeado, rótulo curto) e "Ver
   tudo", que abre uma persiana (`Sheet`) com o resumo ("3 de 5 conquistas ·
   desde outubro de 2026"), a lista completa e as provas concluídas
   (nome, data, tempo, ícones das conquistas).

## O balanço no hub e o mural (2026-09-13)

- **O balanço completo vive no hub.** Uma linha de números não chegava
  ("foi por pouco…"): o hub pede o balanço ao coach-chat assim que a corrida
  está registada (`RaceBalanceCard`, turno `race_after` com
  `proactive_force`) e mostra-o em parágrafos, com a linha de números por
  baixo. O servidor guarda-o em `race_events.coach_balance` (migração
  `20260913200000_race_coach_balance.sql`) e no chat; as respostas do
  "perto" ("Sim, para a próxima quero melhor") levam ao chat com a resposta
  já enviada. Se o chat já fez o balanço neste dispositivo, o hub oferece
  pedi-lo em vez de o repetir.
- **O estúdio do mural (2026-09-14).** O mural automático de 2026-09-13
  saiu: a app escolhia pelo atleta e nunca acertava, e estes murais são
  publicidade que viaja com a foto. No hub, "Montar o mural para partilhar"
  abre o estúdio (`RaceMuralSheet`), com a pré-visualização sempre à vista e
  três passos:
  1. **Modelo** — formato (retrato 4:5, story 9:16, quadrado 1:1) e modelo:
     Capa (uma foto a ocupar tudo), Mosaico de 4, Mosaico de 6, Troféu (a
     medalha num espaço redondo ao centro) e Só números. Cada modelo tem
     espaços para fotos (`studioLayout` em `utils/muralStudio.js`).
  2. **Fotos** — toca-se num espaço, na pré-visualização ou na lista, e
     escolhe-se entre as memórias: até seis fotos, a medalha e o diploma
     (se for imagem). Uma memória que já está noutro espaço troca de lugar.
     O enquadramento é arrastar e ampliar (2026-09-14): arrasta-se a foto
     para a mover e desliza-se um controlo para ampliar até 3×; as setas do
     teclado continuam a ajustar, com o movimento dividido pelo zoom para
     parecer sempre do mesmo tamanho. `coverCrop` em `utils/muralStudio.js`
     calcula o recorte (fx, fy, zoom); é o mesmo cálculo na pré-visualização
     do enquadramento e no desenho final, por isso o que se vê é o que sai.
  3. **Grafismos** — peças prontas que se ligam e desligam: nome e data,
     tempo em grande, distância e ritmo, classificação do diploma, linha do
     ritmo por km (dos parciais do relógio), fichas das conquistas, cartão do
     diploma (tempo chip, bruto, passagens, posições) e medalhão da medalha.
     Um grafismo sem dados fica desligado com o motivo ao lado. Tema de cor
     (dourado, ciano, claro), canto da marca — a marca IronCoach vai sempre
     — e, desde que haja medalha para pôr num modelo que a mostre como
     decoração (não no Troféu, que já a põe ao centro, nem em "Só números",
     sem canto livre nenhum), **canto da medalha** (relatado 2026-09-14: "a
     medalha estraga uma foto" — deixou de ficar presa perto do texto, por
     cima do que estivesse na foto por baixo; um canto de verdade tira-a
     estruturalmente do centro de qualquer foto). Só cantos de CIMA (achado
     na revisão pré-deploy 2026-09-14: um canto de baixo caía sempre em
     cima do texto, que ocupa a banda de baixo da tela na Capa e nos
     Mosaicos — o mesmo problema que isto veio resolver, só que com texto
     em vez de foto); por omissão no canto de cima oposto ao da marca, e se
     calharem no mesmo, a medalha afasta-se dela ao longo do lado
     partilhado (`medalCornerBox`/`MEDAL_CORNERS` em `utils/muralStudio.js`,
     com um teste que prova geometricamente a não sobreposição em todos os
     modelos, formatos e cantos da marca).
  Se o texto não couber no modelo, encolhe até 70% e depois saem grafismos
  por ordem (diploma, conquistas, ritmo, classificação, números, título; o
  tempo nunca sai), e o estúdio diz o que não coube. Desenha-se no
  telemóvel com Canvas (`utils/muralStudioDraw.js`); a composição grava-se
  na prova (2026-09-14, `race_events.mural_composition`, migração
  `20260914090000_race_mural_composition.sql`), por update à parte com
  debounce como a hora da corrida — acompanha a prova entre dispositivos,
  já não fica só no telemóvel onde foi montada.
  A legenda da Carol saiu do mural: o texto do mural chega. Partilha pelo
  menu do telemóvel (Web Share com ficheiro) ou guardando a imagem.

## A Carol no balanço (decidido 2026-09-12)

A régua é uma só, `src/utils/raceOutcome.js` (`classifyRaceOutcome`), e é a
mesma para as conquistas, para o balanço curto do hub e para a Carol:

| Eixo | Regra | Valores |
|---|---|---|
| Objetivo | tempo oficial face a `target_time_seconds` | `superado` (≤ objetivo), `perto` (até 3% acima), `aquem` |
| Treino | tempo oficial face à previsão de Riegel calculada só com as corridas ANTERIORES à prova (`getRacePrediction`) | `acima` (≥ 2% mais rápido), `dentro` (±2%), `abaixo` |
| Histórico | melhor anterior na mesma categoria de distância, entre competições | `isPersonalRecord` |

Sem objetivo, a régua passa a ser a previsão (`basis: 'previsao'`); sem
nenhuma das duas, `concluida`. Sem corrida ligada, `sem_registo`.

O gatilho `race_after` (`coachProactive.js`) dispara com a corrida ligada do
próprio dia da prova até 7 dias depois (chave por corrida, para o "como
correu?" anterior não calar o balanço) e leva o veredicto no body
(`race_outcome`). Sem corrida, mantém-se: de 1 a 3 dias, pergunta e pede o
registo. O coach-chat valida (`parseRaceOutcome`), escreve o bloco
"BALANÇO DA PROVA" com os números e dá a instrução por veredicto
(`raceAfterInstruction`):

- **Objetivo superado** — elogia-se. Acima do que o treino perspetivava:
  elogio a sério, com a previsão e a diferença, e o próximo objetivo pode
  subir (um ponto de exclamação permitido). Dentro do esperado: elogia o
  objetivo cumprido e reconhece o mérito certo, a consistência do treino,
  não um milagre no dia. Abaixo da previsão: o objetivo era conservador,
  diz-se sem rodeios.
- **Perto do objetivo** — congratula ("foi por pouco"), uma explicação
  concreta se os dados a mostrarem, e a pergunta direta: para a próxima é
  para fazer melhor? Este é o único turno proativo com sugestões: "Sim,
  para a próxima quero melhor" / "Por agora fico por aqui". Ao sim, a
  resposta é "então vamos lá treinar" com um caminho concreto.
- **Aquém** — não se finge. Ordem: (1) levantar a cabeça com números reais
  (a prova terminada, o ciclo cumprido); (2) procurar a explicação honesta
  nas ocorrências do treino — treinos falhados, volume, fadiga/ACWR, lesão,
  sono, alimentação, contexto de vida — usando a memória de longo prazo
  (`coach_notes`) e os dados das últimas semanas; sem causa nos dados,
  pergunta o que aconteceu no dia em vez de inventar; (3) fechar a olhar
  para a frente: voltar aos treinos, cabeça levantada, seguimos.
- **Recorde pessoal** reconhece-se sempre, com o número, seja qual for o
  veredicto.

Depois do balanço, a prova fica na memória de longo prazo dela (uma nota
`outro` com tempo, objetivo, veredicto e recorde — `raceOutcomeNote`), para
o próximo balanço e o próximo objetivo terem esta como referência.

## Fora de âmbito

Partilha social, níveis/pontos, notificações push. Se um dia houver
conquistas que não se recalculem dos dados (ex.: "10 provas"), aí sim uma
tabela `achievements` com a data de desbloqueio — não agora.
