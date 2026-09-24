# Carol — caminho para a omnisciência e a omnipresença

> Data: 2026-09-18 · Base: `dev` em `abec7b8` · Complementa [carol-auditoria.md](carol-auditoria.md) e [carol-vida.html](carol-vida.html).
> Prioridade definida pelo produto: **omnisciência primeiro**, omnipresença depois.

## Onde estamos

| Eixo | Nota atual | Nota depois da Fase 1 | Nota depois de tudo |
|---|---|---|---|
| **Omnisciência** | **7,7 / 10** (3,7 no início; 7,0 depois da Fase 2; 7,5 depois da Fase 3) | 6,0 / 10 | 8,6 / 10 |
| **Omnipresença** | **7,6 / 10** (2,8 no início; 6,1 depois da P.3; 7,0 depois da P.4) | — | 9,0 / 10 |

> **Reavaliação a 2026-09-20:** as notas acima pontuavam o que estava implementado, não o que a Carol lê quando decide. Verificadas por dimensão: omnisciência **6,2**, omnipresença **7,2**. Ver [Estado verificado a 2026-09-20](#estado-verificado-a-2026-09-20), no fim, com a Fase 5 e as ações P.9 a P.13.

O 10 absoluto não é atingível, e não deve ser o alvo. Mesmo com tudo feito, a omnisciência fica perto de 8,6. O que falta até 10 é o que o atleta nunca regista nem diz, e o que nenhum relógio mede.

As notas por fase assumem estas subidas: O1 passa a 8 na Fase 1 e a 9 com a ação 1.3, O2 a 9, O5 a 8, O3 e O7 a 8, O4 a 9, O6 a 8 e O8 a 9.

Nenhum treinador sabe o que o atleta não regista nem diz. O objetivo realista é que **tudo o que a app sabe, ou pode perguntar, chegue à Carol no momento em que decide**.

## Como se pontua

Cada eixo divide-se em dimensões com peso. Cada dimensão tem nota de 0 a 10, com uma definição concreta do que é o 10. A nota do eixo é a média ponderada.

---

# Parte 1 — Omnisciência

**Definição de 10:** quando a Carol responde, conhece tudo o que a app sabe sobre o atleta. Isto inclui o que ela própria já lhe disse noutros sítios, o estado dele hoje, e o contexto da próxima prova.

## 1.1 Pontuação por dimensão

| # | Dimensão | Peso | Nota | O que é o 10 |
|---|---|---|---|---|
| O1 | Memória unificada da Carol | 20 | **2** | O chat sabe o que as análises e o cartão diário disseram |
| O2 | Cobertura dos dados que a app já tem | 15 | **6** | Nenhuma tabela relevante fica fora do contexto |
| O3 | Estado subjetivo do atleta | 15 | **2** | Sono, dor, energia e stress de hoje são conhecidos sem ter de perguntar no chat |
| O4 | Ciclo de feedback | 15 | **6** | Sabe se cada recomendação foi seguida e com que resultado |
| O5 | Profundidade temporal | 10 | **5** | Vê a época inteira resumida, não só 30 dias |
| O6 | Dados fisiológicos objetivos | 10 | **2** | FC em repouso, HRV e sono chegam de um relógio, todos os dias |
| O7 | O que o atleta viu na app | 10 | **3** | Sabe que avisos, insights e cartões foram mostrados, lidos ou dispensados |
| O8 | Contexto externo | 5 | **4** | Meteorologia e percurso da prova, e calor ou altitude no dia do treino |
| | **Total** | **100** | **3,7** | |

## 1.2 Porquê cada nota

- **O1 · 2/10.** As análises gravam o comentário na própria linha do registo, em `runs`, `workout_sessions` e `meals`. O chat nunca lê essa coluna. O cartão diário vive em `coach_daily_summary`, que o chat também não lê. O único elo é a memória durável, que só o chat escreve.
- **O2 · 6/10.** Lê corrida, ginásio, nutrição, corpo, água, sapatilhas, provas, planos e memória. Falta o Palmarés, as notas livres do atleta, as metas corporais do perfil, as provas passadas e o diploma.
- **O3 · 2/10.** O único sinal subjetivo é o esforço percebido de cada treino. A hierarquia de alarmes de G1 a G5 só dispara se o atleta mencionar o sinal no chat. Não existe nenhum registo de sono, dor, energia ou ciclo menstrual.
- **O4 · 6/10.** A divergência do plano, o estado dos itens e o insight de baixa adesão já existem. Falta ligar cada recomendação ao que aconteceu depois. Por exemplo, "sugeri 30 g de proteína ao jantar e ele fez 12 g".
- **O5 · 5/10.** As janelas vão de 7 a 30 dias. As ferramentas de histórico permitem ir mais atrás, mas só se ela decidir pedir. Não há um resumo da época, com recordes, volume por mês ou evolução.
- **O6 · 2/10.** Há FC média por sessão e FC em repouso estática no perfil. Não há integração com nenhum relógio.
- **O7 · 3/10.** O cliente envia os insights ativos quando o chat abre. A Carol não sabe o que o atleta viu no Início, nem o que dispensou.
- **O8 · 4/10.** Há `web_info` das provas, preenchido pelo `enrich-race-event`. Não há meteorologia em lado nenhum.

## 1.3 Plano de ação

A ordem segue o impacto por esforço. Esforço: **P** até 1 dia, **M** 2 a 4 dias, **G** mais de uma semana.

### Fase 1 — a Carol ouve-se a si própria (O1, O2, O5) · 3,7 para 6,0

| Ação | Dimensão | Esforço | Onde |
|---|---|---|---|
| **1.1** Injetar no contexto do chat os comentários das análises dos últimos 14 dias, curtos, com data e tipo | O1 | P | `coach-chat`: juntar `coach_notes` aos selects de corrida, ginásio e refeições |
| **1.2** Injetar o cartão diário de hoje e de ontem | O1 | P | `coach-chat`: ler `coach_daily_summary` |
| **1.3** Dar às análises e ao cartão o mesmo bloco de memória durável e o último resumo da conversa | O1 | M | `analyze-*` e `coach-daily-summary`: novo helper em `_shared` |
| **1.4** Ler as notas livres do atleta nos registos | O2 | P | Juntar `notes` aos mesmos selects |
| **1.5** Ler o Palmarés e as últimas 5 provas concluídas, com tempo real e veredicto | O2, O5 | P | `coach-chat`: `medal_awards` e `race_events` com `status = concluida` |
| **1.6** Ler as metas corporais do perfil | O2 | P | Acrescentar `goal_*` ao select do perfil |
| **1.7** Criar um "retrato do atleta" com a época resumida: volume mensal, recordes, provas, tendência de peso | O5 | M | Função partilhada em `_shared`, calculada ao pedido e guardada em cache diária |

**Cuidado com o tamanho do prompt.** O prompt já tem cerca de 50 secções. Cada bloco novo deve ser curto, com um limite de linhas. O retrato do atleta existe para substituir detalhe, não para o somar.

#### Estado: Fase 1 implementada a 2026-09-18

Tudo vive em `supabase/functions/_shared/carolMemory.ts`, com testes em `carolMemory.test.ts`. Não precisou de migration: todas as colunas já existiam em produção.

| Ação | Como ficou |
|---|---|
| 1.1 e 1.4 | Um bloco "Registos comentados" junta, por registo, a nota do atleta e o comentário dela. Janela de 14 dias, com quota por tipo: 6 corridas, 4 sessões de ginásio e 4 refeições. A quota existe porque o atleta mais ativo tinha 41 registos comentados em 14 dias, e as refeições empurravam as corridas para fora. As notas das próximas provas vão num bloco à parte. |
| 1.2 | O cartão de hoje e de ontem, com a prontidão para a prova e o conceito do dia. |
| 1.3 | As quatro análises e o cartão diário recebem a memória durável e as últimas 6 mensagens do chat, dos últimos 7 dias. Não existe um "resumo da conversa" guardado, por isso usam-se as mensagens. |
| 1.5 | O Palmarés lia `medal_awards`: recordes em vigor, distâncias, objetivos batidos, sequência, terreno e O Ano em Km. Junta as últimas 5 provas concluídas, com o tempo real da corrida ligada face ao objetivo. **Atualização 2026-09-22:** a parte do Palmarés foi removida (`medal_awards` deixou de ser lida) e substituída pela vitrina de badges — ver `palmares-medalhoes.md` (histórico) e `06-head-coach-arbitragem.md` #6. As últimas provas concluídas continuam a ser lidas, agora por `buildRaceHistoryContext`. |
| 1.6 | O perfil passa a ler as quatro metas corporais e quem as definiu. A comparação usa a avaliação corporal mais recente dos últimos 30 dias. |
| 1.7 | O retrato da época cobre 12 meses: km por mês, média semanal das últimas 12 semanas face às 12 anteriores, a corrida mais longa, ginásio, provas e peso. **Diferença face ao plano:** é calculado a cada pedido e não tem cache diária. São consultas leves, e uma cache pedia uma tabela nova. |

No chat, os blocos entram no fim do prompt do sistema, numa secção "A tua memória alargada", antes dos insights. As consultas arrancam em paralelo com as outras e cada uma falha sozinha: se uma tabela der erro, sai só esse bloco.

**Por medir:** o aumento real de tokens por mensagem. O teto teórico dos blocos novos anda perto de 12 mil caracteres. O painel de custos da API deve mostrar a diferença na primeira semana.

### Fase 2 — o atleta diz como está (O3, O7) · 6,0 para 7,4

| Ação | Dimensão | Esforço | Onde |
|---|---|---|---|
| **2.1** Check-in diário de 10 segundos no Início: sono, energia, dor com local, stress, de 1 a 5 | O3 | M | Tabela nova `daily_checkins`, componente no Início |
| **2.2** Ligar o check-in à hierarquia de alarmes, para que dor ≥ 4 ou sono mau repetido disparem G2, G4 ou G5 sem o atleta ter de o dizer | O3 | M | `coach-chat` e `coach-daily-summary` |
| **2.3** Ciclo menstrual, opcional e só com consentimento explícito, porque o RED-S depende dele | O3 | M | Campo no check-in e aviso de privacidade |
| **2.4** Registar o que foi mostrado e dispensado: avisos do Início, insights, cartão | O7 | M | Tabela `coach_impressions`, escrita pelo cliente |

#### Estado: Fase 2 implementada a 2026-09-18

A migration `20260918151242_daily_checkins` já está aplicada em produção. Foi testada antes numa transação revertida.

| Ação | Como ficou |
|---|---|
| 2.1 | Um cartão em "Como estou", por cima da órbita: "Como acordaste hoje?". A persiana pergunta o sono, a energia e o stress de 1 a 5, e a dor de 0 a 10 com o local. Há um check-in por dia e editá-lo substitui o anterior. Depois de feito, o cartão mostra o resumo e um botão para editar. Tabela `daily_checkins`. |
| 2.2 | As regras vivem numa fórmula partilhada, `_shared/formulas/checkinAlarms.ts`, que o cliente usa via `@formulas` e o servidor lê: <br>• dor ≥ 4 hoje dá G2 se o local parecer osso, senão G5; <br>• sono ≤ 2 em 3 dos últimos 5 check-ins, com energia ≤ 2 ou stress ≥ 4, dá G4; <br>• sem menstruação há 90 dias, com o ciclo registado há pelo menos 90, dá G3. <br>Um alarme novo abre uma intervenção pelo canal de sempre, se não houver já uma em curso. A Carol lê o check-in no chat, no cartão diário e nas quatro análises. Os alarmes do check-in valem como se o atleta os tivesse dito. |
| 2.3 | O ciclo só aparece num perfil feminino, e só depois de o atleta tocar em "Aceito registar". O consentimento fica em `profiles.cycle_tracking_consent_at`. Sem consentimento, o campo nem sai do telemóvel, e o servidor apaga-o antes de o passar à Carol. Retirar o consentimento apaga o ciclo de todos os check-ins, através de um trigger na base de dados. |
| 2.4 | Tabela `coach_impressions`, com uma linha por dia, tipo e chave. O cartão da Carol conta como visto quando existe para hoje. Os avisos e os insights contam quando a janela do botão flutuante abre, porque antes disso são só um número. Os avisos dispensados ficam marcados. O chat lê os últimos 3 dias. |

**Revisão pré-deploy, com tudo corrigido antes do push:**
- **G4.** A chave passa a ser o primeiro dia mau da janela, estável por episódio. Só chama a Carol se o dia de hoje for um dos maus. Antes, chamava todos os dias, incluindo o primeiro em que o atleta dormiu bem.
- **G3.** Exige pelo menos 20 respostas à pergunta do ciclo nos últimos 90 dias. Um check-in esquecido ou uma resposta em branco não conta como "não". O G3 fica no contexto da Carol, mas não abre uma intervenção, porque não é urgente.
- **Consentimento na base de dados.** Um trigger limpa o ciclo se o perfil não tiver consentimento ou não for feminino. A migration é `20260918152840_daily_checkins_cycle_guard`.
- **Acesso de admin.** Os check-ins deixaram de ser lidos pelo painel de admin.
- **Texto do consentimento.** Passa a dizer a verdade: fica na conta, entra nas análises, que são feitas por um modelo de IA, e desligar apaga os dias marcados. Desligar pede confirmação.
- **Data.** O servidor lê o check-in e as impressões com o dia de Lisboa, como o cliente os grava.
- **Cartão diário.** É refeito depois de cada check-in, para refletir como o atleta acordou.
- **2026-09-23 — o check-in passa a mexer nas coisas:**
  - **Índice de Prontidão.** Ganha o pilar "Como acordaste", só quando há check-in de hoje. É a média do sono, da energia e da calma (stress invertido). A dor tira 5 pontos por cada ponto até 3; a partir de 4, o pilar fica no máximo em 20. O ecrã e a Carol no chat usam a mesma fórmula, `readinessIndex.ts`.
  - **Resumo do dia.** Recebe `checkin_hoje` com o veredicto já decidido: `dia_em_baixo` quando o sono ou a energia estão em 2 ou menos, `dor_alta` quando a dor está em 4 ou mais. Com o dia em baixo, o recap baixa a intensidade do treino de hoje e diz porquê. Com dor alta, põe o impacto em pausa até falarem no chat.
  - **Boas-vindas.** Se o check-in faltar, a tarde também o pede, com o botão que o abre. A noite não o pede, porque já não há treino do dia para ajustar.

**Ficou de fora:** um ecrã de privacidade para rever ou apagar os check-ins. Hoje, a única forma de apagar dados é retirar o consentimento do ciclo, que apaga só o ciclo.

Com a Fase 2, O3 passa de 2 para 7 e O7 de 3 para 7. Contando também a ação 1.3, O1 fica em 9. A omnisciência sobe para **7,0**.

### Fase 3 — o que ela recomendou e o que aconteceu (O4) · 7,4 para 7,8

| Ação | Dimensão | Esforço | Onde |
|---|---|---|---|
| **3.1** Guardar cada recomendação concreta com um identificador: refeição sugerida, treino ajustado, descanso | O4 | M | `save_meal_suggestions`, itens do plano, memória |
| **3.2** Comparar automaticamente recomendação e registo seguinte, e entregar o resultado no contexto | O4 | M | Helper em `_shared`, lido pelo chat e pelo cartão |

#### Estado: Fase 3 implementada a 2026-09-19

| Ação | Como ficou |
|---|---|
| 3.1 | Não precisou de nada novo. As prescrições concretas já tinham identificador: cada treino do plano e a sugestão de refeições de cada dia são linhas de `coach_plan_items`, com `meal_macros`. O que faltava era cruzá-las. |
| 3.2 | `_shared/formulas/prescriptionAdherence.ts` cruza cada prescrição dos últimos 14 dias com o registo real, só de planos aceites e sem os itens cancelados. <br>• **Corrida:** a distância prescrita, ou a duração se não houver distância, contra o registado. Dentro de ±15% é "cumprido"; fora disso é "a menos" ou "a mais"; sem registo é "não feito". <br>• **Ginásio:** a duração, da mesma forma. <br>• **Descanso:** se foi respeitado. <br>• **Refeições:** as kcal e a proteína sugeridas contra o que foi comido. <br>O treino marcado como feito usa a corrida ou a sessão ligada. Sem ligação, conta o que foi registado nesse dia, porque a maior parte dos atletas não marca. |

A Carol lê o bloco "O que prescreveste vs o que aconteceu" no chat. Tem um resumo, por exemplo "8 treinos prescritos: 5 cumpridos, 2 a menos, 1 não feito; descanso respeitado em 3 de 4 dias", e a média de proteína. A instrução é usar os números para calibrar, e não para cobrar: um dia isolado não é um padrão, e um treino "não feito" pode ter sido registado noutro dia.

**Diferença face ao plano:** o cartão diário ainda não lê este bloco, só o chat. As recomendações soltas que ela dá na conversa, fora do plano, também não entram, porque não ficam gravadas de forma estruturada.

Com a Fase 3, O4 passa de 6 para 9. A omnisciência sobe para **7,5**.

### Fase 4 — os dados que o atleta não escreve (O6, O8) · 7,8 para 8,6

| Ação | Dimensão | Esforço | Onde |
|---|---|---|---|
| **4.1** Integração com relógio para FC em repouso, HRV e sono diários. Começar pelo Health Connect e pelo Apple Health, via exportação, ou pelo Strava | O6 | G | Nova Edge Function e tabela `daily_physiology` |
| **4.2** Meteorologia da prova a 7 dias e na véspera, e do dia do treino longo | O8 | P | Estender `enrich-race-event` com uma API de meteorologia |
| **4.3** Perfil altimétrico do percurso da prova | O8 | M | `enrich-race-event` |

#### Estado: 4.2 implementada a 2026-09-19

**Fonte:** Open-Meteo, que é gratuito e não precisa de chave. As provas não têm coordenadas, só o nome do local. Por isso o local é primeiro procurado em Portugal e, se não aparecer, em qualquer país. Depois pede-se a previsão horária desse dia, em hora de Lisboa. O código está em `_shared/raceWeatherFetch.ts`.

**Quando:** só quando a prova é nos próximos 7 dias e tem o local preenchido. Nada fica guardado: a previsão pede-se no momento, com um limite de 4 segundos. Se falhar, não há bloco.

**O que ela recebe:** as horas em que o atleta vai estar a correr, da partida até ao fim previsto pelo objetivo de tempo, ou pela distância a 6,5 min/km. Para essas horas recebe:
- a temperatura e a sensação térmica;
- a humidade, a chuva e o vento;
- o conselho da régua de calor, em `_shared/formulas/raceWeather.ts`. Abaixo de 20 °C de sensação, as condições são boas. Até 25 °C, o ritmo fica 1 a 3% mais lento. Até 30 °C, abranda 3 a 6% e junta sal. Acima de 30 °C, o objetivo de tempo deixa de ser realista.

Chuva a partir de 60% e vento a partir de 25 km/h trazem um aviso próprio. O bloco diz o que foi assumido quando falta a hora de partida ou o objetivo.

**Onde:** no chat, como bloco "Meteorologia da prova". No cartão diário, como `meteorologia_prova`, que ela tem em conta na prontidão e no balanço.

**Ficou de fora:**
- A meteorologia do treino longo, porque a app não sabe onde o atleta treina: o perfil não tem local.
- O perfil altimétrico, a ação 4.3.

Com a 4.2, O8 passa de 4 para 7. A omnisciência sobe para **7,7**.

---

# Parte 2 — Omnipresença

**Definição de 10:** a Carol aparece nos momentos que importam, dentro e fora da app, sempre com a voz dela. Não se repete e não incomoda.

## 2.1 Pontuação por dimensão

| # | Dimensão | Peso | Nota | O que é o 10 |
|---|---|---|---|---|
| P1 | Iniciativa sem a app aberta | 25 | **1** | O servidor decide quando falar, sem depender do atleta |
| P2 | Canal fora da app | 20 | **2** | Push com a voz dela, que abre a conversa certa |
| P3 | Momentos-chave cobertos | 20 | **4** | Véspera, manhã da prova, pós-treino, pós-prova, silêncio, risco, fim de bloco |
| P4 | Consistência entre dispositivos | 10 | **3** | Não repete a mesma mensagem ao mudar de telemóvel |
| P5 | Voz única | 10 | **5** | Tudo o que chega ao atleta soa a Carol |
| P6 | Não intrusiva | 10 | **5** | Horas de silêncio, limite diário, preferências do atleta |
| P7 | Presença durante o treino | 5 | **0** | Algo durante a sessão, por exemplo no relógio |
| | **Total** | **100** | **2,8** | |

## 2.2 Porquê cada nota

- **P1 · 1/10.** Os quatro gatilhos proativos são calculados no cliente. Só disparam quando o atleta abre o Coach ou toca no aviso do Início.
- **P2 · 2/10.** A infraestrutura de push já existe, com `save-push-subscription`, `send-water-reminders` e o handler no `public/sw.js`. Só é usada para a água.
- **P3 · 4/10.** A manhã da prova, a véspera, o balanço pós-prova e o silêncio de 3 dias estão cobertos, mas só dentro da app. Faltam o pós-treino, o risco, o fim de bloco e o conflito de provas fora da app.
- **P4 · 3/10.** A deduplicação vive no `localStorage`, por dispositivo. O servidor só trava durante 6 horas.
- **P5 · 5/10.** O push da água, "Hora de beber água 💧", tem emoji e é frase de manual. A sugestão de nível para a prova é uma fórmula, mas parece ser a Carol.
- **P6 · 5/10.** Já existe a janela de silêncio de 6 horas no servidor. Falta um limite diário e falta o atleta poder escolher.
- **P7 · 0/10.** Não existe. Fica fora do âmbito até haver integração com relógio.

## 2.3 Plano de ação

Depende da Fase 1 da omnisciência. Um gatilho no servidor precisa do mesmo contexto que o chat tem.

| Ação | Dimensão | Esforço | Onde |
|---|---|---|---|
| **P.1** Mover a deduplicação dos gatilhos para o servidor | P4 | P | Tabela `coach_proactive_log` |
| **P.2** Reescrever o push da água na voz da Carol, sem emoji | P5 | P | `send-water-reminders` e `public/sw.js` |
| **P.3** Criar uma função agendada que avalia os gatilhos no servidor, uma vez por hora | P1, P3 | M | Nova Edge Function e `pg_cron` |
| **P.4** Enviar push com texto gerado pela Carol, que abre o Coach já com a conversa certa | P2 | M | Reutilizar o `raceConflictPrompt` e os guiões de cenário |
| **P.5** Juntar gatilhos novos: pós-treino com intervenção, risco do check-in, fim de bloco, conflito de provas | P3 | M | Mesma função agendada |
| **P.6** Preferências do atleta: horas de silêncio, máximo de mensagens por dia, tipos que aceita | P6 | M | Perfil e ecrã de definições |
| **P.7** Identificar a sugestão de nível como fórmula, ou passá-la pela Carol | P5 | P | `RaceLevelSuggestion` |
| **P.8** Alertas no relógio durante o treino | P7 | G | Só depois da ação 4.1 |

#### Estado: P.1 e P.2 implementadas a 2026-09-18

| Ação | Como ficou |
|---|---|
| P.1 | Nova tabela `coach_proactive_log`, com uma linha por atleta e por chave. O cliente envia a chave no pedido. O `coach-chat` recusa a chave que já tenha sido entregue, com o motivo `already_sent`, e grava-a depois de guardar a mensagem. O pedido forçado do balanço, feito pelo atleta, passa sempre. O `localStorage` fica como atalho, e o cliente também marca a chave quando o servidor responde `already_sent`. O lock por utilizador do `coach-chat` impede dois dispositivos de passarem ao mesmo tempo. **Falta:** os avisos do Início continuam a ler só o `localStorage`. Noutro dispositivo, o aviso pode aparecer até o chat ser aberto uma vez. |
| P.2 | O push da água passa a ter o título "Carol" e uma frase com os números do atleta: quanto bebeu, quanto falta e se está atrás do ritmo do dia. A frase é determinística, sem modelo, e está em `send-water-reminders/message.ts`. Um teste garante que nenhuma combinação produz emoji ou ponto de exclamação. |

Com estas duas ações, P4 passa de 3 para 8, P5 de 5 para 7 e P2 de 2 para 3. A omnipresença sobe de **2,8 para 3,7**. O salto grande continua a ser a P.3: os gatilhos avaliados no servidor.

#### Estado: P.3 implementada a 2026-09-18

| Peça | Como ficou |
|---|---|
| Regras | `_shared/formulas/proactiveTriggers.ts` avalia os mesmos quatro momentos que o cliente, com as mesmas chaves: manhã da prova, véspera, balanço e silêncio. Um teste no cliente, `src/utils/proactiveParity.test.js`, compara as duas versões com os mesmos dados. |
| Função | `coach-proactive-tick`, chamada pelo `pg_cron` de hora a hora, ao minuto 7, com o `CRON_SECRET`. Tem `verify_jwt = false` declarado em `supabase/config.toml`. A decisão de enviar é pura e está em `decide.ts`. |
| Travões | Janela das 9h às 21h em Lisboa, ou a partir das 6h para a manhã da prova. Não notifica uma conversa que já aconteceu nem uma chave já notificada. Envia no máximo uma notificação por dia. Não envia se ela falou há menos de 6 horas, porque o chat recusaria a mensagem ao abrir. A chave é gravada antes do envio, para duas execuções cruzadas não enviarem duas vezes. |
| Notificação | O título é "Carol" e a frase é fixa por momento, na voz dela. Tocar abre o Coach: com a app fechada, através de `?tab=coach`; com a app aberta, por mensagem do service worker. É aí que o `coach-chat` escreve a mensagem a sério. |
| Tabela | `coach_proactive_pushes`, com uma linha por chave e o dia de Lisboa. Só o service role escreve. |

**Revisão pré-deploy, com tudo corrigido:**
- **Só quem tem as notificações ligadas.** A subscrição do browser fica depois de o atleta desligar os lembretes, e sem este filtro a Carol ia notificar precisamente quem as desligou. Hoje o único interruptor é o da água, por isso exige-se `water_reminder_enabled = true`.
- **Não repetir conversas anteriores ao registo no servidor.** O `coach_proactive_log` só existe desde hoje. Há três provas de que a conversa já aconteceu: o balanço gravado na prova; a Carol ter falado depois de a corrida da prova ser registada; e, no "como correu?" e no silêncio, a Carol ter falado depois do acontecimento.
- **Migration em falta.** A `race_coach_balance`, escrita a 13 de setembro, nunca tinha sido aplicada. Até aqui, o balanço gravado na prova falhava em silêncio. Foi aplicada agora, com a versão `20260918163837`.

**O cron está ligado desde 2026-09-18, às 18h de Lisboa**, depois de o `sw.js` novo chegar a `master`. O texto abaixo fica como registo de como foi criado. Antes disso: A função está em produção, mas o job `coach-proactive-tick` só deve ser criado depois de o `sw.js` novo chegar aos telemóveis, através do deploy de `master`. Com o `sw.js` antigo, a notificação da Carol usava a etiqueta da água, as duas substituíam-se uma à outra, e o toque não abria o Coach. Para o criar, copia-se o comando do job da água, para o segredo não entrar no repositório:

```sql
select cron.schedule('coach-proactive-tick', '7 * * * *',
  replace((select command from cron.job where jobname = 'send-water-reminders'), 'send-water-reminders', 'coach-proactive-tick'));
```

**Limites:**
- Só chega a quem tem notificações ligadas, e hoje as notificações só se ligam nos lembretes de água. Quem não usa os lembretes não recebe a Carol. As preferências da P.6 devem trazer um interruptor próprio.
- O texto da notificação é fixo. O texto gerado por ela é a P.4.

Com a P.3, P1 passa de 1 para 7, P2 de 3 para 5, P3 de 4 para 6 e P6 de 5 para 6. A omnipresença sobe para **6,1**.

#### Estado: P.6 implementada a 2026-09-18

A migration `20260918173342_carol_push_preferences` está aplicada em produção.

| Peça | Como ficou |
|---|---|
| Perfil | Um bloco "Notificações da Carol" logo a seguir aos lembretes de água, no mesmo cartão e com o mesmo padrão. Ligar pede a permissão do browser na hora, e o resto fica com o Guardar. As opções são as horas de início e de fim, o máximo por dia (1, 2 ou 3) e os momentos aceites: manhã da prova, véspera, balanço e dias sem registos. |
| Base de dados | Cinco colunas novas em `profiles`: `carol_push_enabled`, desligado por omissão, porque é opt-in; `carol_push_start_hour` e `carol_push_end_hour`, das 9h às 21h por omissão; `carol_push_max_per_day`, de 1 a 3; e `carol_push_types`, com um check que só aceita os quatro momentos. |
| Servidor | O `coach-proactive-tick` deixa de depender da água. Notifica quem ligou a Carol, na janela dessa pessoa, até ao máximo dela, e só nos momentos que ela aceitou. A manhã da prova pode adiantar-se até às 6h, porque a prova não espera, mas nunca passa do fim da janela. |

**Por omissão ninguém recebe nada.** Cada atleta tem de ligar as notificações da Carol no Perfil. O ecrã só chega com o deploy de `master`.

Com a P.6, P6 passa de 6 para 9 e P2 de 5 para 6, porque a Carol deixa de depender da água. A omnipresença sobe para **6,6**.

#### Estado: P.4 implementada a 2026-09-19

**O texto da notificação passa a ser escrito por ela.** No momento de enviar, o `coach-proactive-tick` pede ao Gemini uma notificação curta na voz da Carol, com os dados reais do momento: o primeiro nome, a prova, a distância, a hora de partida, o objetivo, o tempo feito e a diferença para o objetivo, ou os dias sem registos. O código está em `coach-proactive-tick/pushText.ts`.

**Guardas:**
- As regras de tom são as da `carolTone`. O texto tem no máximo 140 caracteres, numa só linha.
- O prompt proíbe números que não estejam nos dados.
- O texto é validado: comprimento, sem emoji, sem ponto de exclamação. Se falhar a validação, se a chamada falhar ou se demorar mais de 10 segundos, sai a frase fixa da P.3.

**Decisão:** a conversa a sério continua a ser escrita pelo `coach-chat` quando o atleta abre o Coach. Gerar a mensagem inteira do chat no servidor obrigava a um caminho, autenticado por segredo, para agir em nome de qualquer atleta. É um risco de segurança que não compensa. O toque já abre o Coach no momento certo, desde a P.3.

**Limite:** a notificação e a primeira mensagem do chat são escritas em momentos diferentes. Dizem o mesmo assunto, mas não com as mesmas palavras.

Com a P.4, P2 passa de 6 para 8. A omnipresença sobe para **7,0**.

#### Estado: P.5 implementada a 2026-09-19

A migration `20260918234452_proactive_p5_triggers` está aplicada em produção. Alarga as listas de momentos aceites aos sete, e os perfis que tinham a lista por omissão passaram a ter os sete.

| Momento | Quando | O toque abre |
|---|---|---|
| **Assunto por resolver** (`intervention`) | Há uma intervenção aberta: dor ou sono mau no check-in, ou um desvio que uma análise marcou. Cobre o "pós-treino com intervenção" e o "risco do check-in". A chave muda quando o motivo muda. | O Início, onde está o aviso com "Falar com a Carol" |
| **Provas em conflito** (`race_conflict`) | Duas provas principais no mesmo bloco, com a mesma régua do cliente. | O Início, onde está o aviso do conflito |
| **Fim de bloco** (`block_end`) | Um plano de treino sem prova acaba hoje ou nos próximos 2 dias, e não há outro a seguir. Planos só de refeições não contam. | O Coach, onde ela faz o ponto do bloco e pergunta se preparam o próximo, sem propor o plano antes de o atleta dizer que sim |

**Prioridade no servidor:** assunto por resolver, manhã da prova, véspera, conflito, balanço, fim de bloco e silêncio.

**Privacidade:** o texto do assunto por resolver é sempre genérico e nunca passa pelo gerador: "Preciso de falar contigo sobre uma coisa que vi". O motivo pode ser de saúde e não vai para o ecrã bloqueado.

**Paridade:** o fim de bloco também existe no cliente, em `pickProactiveTrigger`, e no `coach-chat`, com uma instrução própria. O teste de paridade confirma que a chave é a mesma dos dois lados. Os outros dois momentos novos são só do servidor, porque no cliente já têm o seu aviso no Início.

**Perfil:** as preferências passam a ter os sete momentos.

**Ficou de fora:** alertas durante o treino, que dependem do relógio (P.8).

Com a P.5, P3 passa de 6 para 9. A omnipresença sobe para **7,6**.

---

# Ordem recomendada

1. **Fase 1 da omnisciência**, as ações 1.1 a 1.7. É a de maior impacto e menor esforço. Leva a nota de 3,7 a 6,0.
2. **P.1 e P.2**, porque são pequenas e corrigem incoerências visíveis.
3. **Fase 2 da omnisciência**, com o check-in diário. É o maior salto de qualidade nos alarmes de saúde.
4. **P.3, P.4 e P.5**, porque é aqui que a omnipresença passa a existir de verdade.
5. **Fase 3**, e depois a **Fase 4** com o relógio e a meteorologia.

# Riscos a vigiar

- **Tamanho e custo do prompt.** Cada bloco novo aumenta os tokens por mensagem. É preciso medir antes e depois da Fase 1.
- **Privacidade.** O check-in, o ciclo menstrual e os dados de relógio são dados de saúde. Precisam de consentimento explícito e de RLS revista.
- **Fadiga.** Uma Carol omnipresente e mal calibrada passa a ser ruído. O limite diário e as preferências da ação P.6 têm de chegar antes dos gatilhos novos, ou ao mesmo tempo.

# Pendentes fechados a 2026-09-19

- **Recusar uma proposta devolve os treinos feitos** ao bloco de onde vieram. Até aqui, se um aceite tivesse falhado a meio e o atleta recusasse depois, os dias cumpridos deixavam de aparecer no plano.
- **O treino feito noutro dia** cancela o treino redundante do dia em que foi feito, e não o do dia planeado.
- **As refeições do Início** mostram a sugestão mais recente do dia. Antes, podia aparecer a do bloco antigo.
- **Um momento desligado no Perfil não esconde os seguintes.** Por exemplo, com o balanço desligado, o "Estás bem?" ainda pode sair.
- **O cartão diário lê o que ela prescreveu e o que aconteceu** (Fase 3), como `prescrito_vs_feito`, e usa-o no balanço.
- **Apagar os check-ins.** A persiana do check-in tem "Apagar todos os meus check-ins", com confirmação.

**Custo, primeira medida:** o cartão diário passou de cerca de 4 750 para cerca de 7 000 tokens de entrada por chamada. Há só 2 chamadas depois da mudança, por isso é um sinal e não uma medida. O chat ainda não tem nenhuma chamada registada desde a memória nova. Convém repetir a medição daqui a uma semana, pelo `app_logs`.

**Ficou por fazer, e porquê:**
- **A água à meia-noite.** Entre as 00:00 e a 01:00, a notificação da água pode usar o total do dia anterior. Isto só acontece a quem tem a janela dos lembretes a atravessar a meia-noite. A correção obriga a mudar em que dia se grava a água, e isso mexe em registos existentes. Não compensa para uma hora por dia de um caso raro.
- **O relógio**, adiado por decisão do produto.

---

# Estado verificado a 2026-09-20

> Base: `dev` em `b22ad24` (a P.7 em `987f51b` e a 5.2 em `10e9c05`, ambas em `dev` e em produção desde 2026-09-21). Auditoria feita por dimensão, lendo o que cada Edge Function seleciona e o que cada prompt recebe, não o que o repositório tem implementado.

## As notas anteriores estavam inflacionadas

O spec pontuava o que estava implementado, não o que a Carol lê de facto quando decide. A diferença é grande em cinco dimensões:

- **O1 · 9 no spec, 6 verificada.** A memória partilhada existe, mas o cartão diário não lê as impressões, o chat não lia o comentário do analyze-body, e nada do que as boas-vindas ou os momentos do Início dizem chega ao servidor. A Carol contradiz-se a si própria entre o ecrã de entrada e o cartão do mesmo dia.
- **O7 · 7 no spec, 5 verificada.** As impressões só cobrem o cartão, os avisos e os insights. O que as boas-vindas disseram, o que a semana cumprida mostrou e a dispensa dos insights ficam no `localStorage` de um telemóvel.
- **O5 · 8 no spec, 6 verificada.** O retrato da época só vai ao chat. O cartão e as análises continuam a ver 30 dias, e o "novo recorde pessoal" do analyze-run é o mínimo de qualquer distância, sem escalão, enquanto o cartão de confirmação usa outra régua.
- **O4 · 9 no spec, 7 verificada.** A adesão ao plano existe, mas as recomendações soltas do chat não ficam gravadas e o desfecho de cada intervenção é apagado ao resolver.
- **P4 · 8 no spec, 6,5 verificada.** A deduplicação dos gatilhos está no servidor, mas as boas-vindas, os momentos do Início e as dispensas continuam por dispositivo.

A 5.2 foi feita depois da auditoria e já sobe O2 de 7,5 para 8,5; está em `dev` desde `b22ad24`.

## Quadro

| # | Dimensão | Peso | Spec | Verificada | Depois da Fase 5 e P.9 a P.13 |
|---|---|---|---|---|---|
| O1 | Memória unificada | 20 | 9 | 6 | 7,5 |
| O2 | Cobertura dos dados | 15 | 9 | 7,5 | 8,5 |
| O3 | Estado subjetivo | 15 | 7 | 7,5 | 8,5 |
| O4 | Ciclo de feedback | 15 | 9 | 7 | 8 |
| O5 | Profundidade temporal | 10 | 8 | 6 | 8 |
| O6 | Dados fisiológicos | 10 | 2 | 2,5 | 4 |
| O7 | O que o atleta viu | 10 | 7 | 5 | 7,5 |
| O8 | Contexto externo | 5 | 7 | 6 | 8 |
| | **Omnisciência** | 100 | 7,7 | **6,2** | **7,6** |
| P1 | Iniciativa sem a app | 25 | 7 | 8 | 8,5 |
| P2 | Canal fora da app | 20 | 8 | 7 | 8,5 |
| P3 | Momentos-chave | 20 | 9 | 8,5 | 9 |
| P4 | Entre dispositivos | 10 | 8 | 6,5 | 8 |
| P5 | Voz única | 10 | 7 | 6,5 | 8 |
| P6 | Não intrusiva | 10 | 9 | 7,5 | 8,5 |
| P7 | Presença no treino | 5 | 0 | 1,5 | 2 |
| | **Omnipresença** | 100 | 7,6 | **7,2** | **8,2** |

Sem relógio, O6 e P7 não passam de 4. O 10 não é o alvo.

## Regras que este plano respeita

- Uma migration nunca é aplicada pelo deploy: aplica-se à mão em produção, testada numa transação revertida, **antes** do push a `dev`.
- Um push a `dev` que toque `supabase/functions/**` é produção nesse instante; `dev` e `master` não podem divergir num ficheiro de Edge Function.
- Nenhuma Edge Function passa a agir em nome de um atleta por segredo. Tudo o que é novo corre com o JWT do atleta e a RLS de linhas próprias; a conversa a sério continua a ser escrita pelo `coach-chat` quando o atleta abre.
- Sem emoji, sem exclamações, sem aplausos por rotina (CAROL.md).
- Antes de tocar em `Coach.jsx` ou `biEngine.js`: confirmar que `dev-claude` está sincronizado com `origin/dev`, onde outra sessão altera esses ficheiros em paralelo.

## Fase 5 — o que a Carol diz e o que ela lê (O1, O3, O4, O5, O6, O7, O8, P4)

| Ação | Dimensão | Esforço | Onde |
|---|---|---|---|
| **5.1** O que a Carol diz no cliente fica registado, e o cartão e o chat leem-no | O1, O7, P4, P6 | M | Migration `coach_impressions.kind`; `App.jsx`, `weekDone/dayDone/raceMilestone`, `CoachInsightModal`, `Home.jsx`, store; `carolMemory.ts`, `coach-daily-summary` |
| **5.2** O que a app já tem e o chat não lê | O2, O1 | P | Feita em `10e9c05`, em `dev` desde `b22ad24` |
| **5.3** O retrato da época chega ao cartão e ao analyze-run, com recordes por escalão e forma | O5, O1 | M | `carolMemory.ts`, `analyze-run`, `coach-daily-summary`, `_shared/formulas/runRecord.ts` |
| **5.4** Check-in com tendência e ciclo; a FC que os prints já trazem | O3, O6 | M | `checkinAlarms.ts`, `heartRateZones.ts`, `coach-chat`, `analyze-run`, `coach-daily-summary` |
| **5.5** Ciclo de feedback: recomendações soltas e desfecho das intervenções | O4 | G | Migration (2 tabelas, trigger em `profiles`); `coach-chat`, `prescriptionAdherence.ts`, `analyze-*`, `analyze-meal` |
| **5.6** Contexto externo: local de treino, o que esteve na prova, temperatura do relógio, D+ do site | O8 | M | Migration `profiles.training_*`; `Perfil.jsx`, `raceWeatherFetch.ts`, `coach-chat`, `coach-daily-summary`, `analyze-run`, `enrich-race-event` |

**5.1.** As boas-vindas gravam uma impressão `welcome` por cada chave de `markKeys`, com as frases (sem saudação nem CTA) no título; os três momentos do Início gravam `moment` sem título; a dispensa dos insights é o `ignoreAll`, não o "Entendi"; o balanço grava as duas chaves ('balanco' para o chat, a do candidato para o cross-device). Na leitura, `loadInitialData` traz as impressões dos últimos 14 dias para dois conjuntos no store, que os decisores puros recebem por parâmetro (o merge com o `localStorage` faz-se nos chamadores; `readSeen` não muda), e `visibilitychange` refresca-os antes de `tryWelcome`. No servidor, `fetchImpressionsBlock` passa a ser exportada e o cartão diário chama-a ao lado de `fetchAdherenceBlock`; as análises não a recebem. Os rótulos novos falam à Carol na segunda pessoa, como o resto do bloco ("as boas-vindas, em que lhe disseste"; "um momento no Início"); as boas-vindas sem frases e os momentos sem título não entram no prompt (existem só para a sincronização entre dispositivos), e a instrução "não repitas nem contradigas o que já lhe disseste ao abrir a app, salvo dados novos; se lhe perguntaste algo, retoma" só entra quando há boas-vindas com frases de hoje ou de ontem. As datas das impressões passam a Lisboa. O momento do check-in fica de fora: o servidor já tem os `daily_checkins`.

**5.3.** As quatro consultas de 12 meses saem de `fetchChatMemoryBlocks` para um `fetchPortraitBlock` exportado, com projeção `details->splits`, ordem e limite (o teto de 1 000 linhas do PostgREST é silencioso). `fetchSharedMemoryBlock` aceita `{ portrait }` e só o cartão e o analyze-run o pedem. O retrato ganha os melhores ritmos 5/10/21 km por escalão e uma linha de forma (VDOT em palavras, número entre parêntesis), em 12 linhas no máximo, com a nota "para dar medida, não para elogiar por rotina". A régua do recorde (`runRecord.js`) passa a `_shared/formulas` e serve o cliente, o retrato e o analyze-run, que faz uma consulta própria sem filtro de tipo em vez do `previousRuns` segmentado; o retrato substitui `trendStr` e o `bestPaceStr` antigo, não os soma.

**5.4.** Em dois pushes. O check-in troca a linha dos 7 dias por "esta semana vs as 3 anteriores", só com 3 check-ins de cada lado, e o ciclo ganha os inícios, a duração (média só com 3 inícios, durações fora de 18-45 dias descartadas) e o próximo início esperado "por volta de", sempre atrás do consentimento. A FC: `resolveMaxHR` escolhe entre Tanaka e a maior FCmáx repetida nos prints de 12 meses (picos isolados e valores fora de 120-220 ignorados) e diz de onde vem; o chat, o analyze-run e o cartão usam a mesma; `summariseRuns` passa a levar FC máx, VO2 do relógio, limiares, recuperação e zonas; a análise da corrida diz em que zona foi a FC média, para poder dizer que o Z2 do plano foi feito em Z4. A tool de check-ins fica adiada até haver mais de 120 dias de dados.

**5.5.** Em três pushes. As intervenções: `profiles` ganha duas colunas transitórias (origem e desfecho), escritas por quem abre (analyze-run/gym/meal e o check-in) e por quem resolve (`runResolveIntervention`), e um trigger `security definer` copia a abertura e o desfecho para `coach_interventions`; o bloco de adesão passa a ter "avisos: N abertos, M ignorados, K falsos positivos" nos últimos 60 dias — para calibrar, nunca como abertura. As recomendações: o `RESPONSE_SCHEMA` ganha um array opcional simples (sem restrições aninhadas, a lição de 2026-09-05), validado no servidor e gravado depois da mensagem com RLS de inserção própria; `evaluatePrescriptions` cruza cada uma com o registo do dia por tipo, e o descanso com a dor e o sono do dia seguinte. O analyze-meal lê as outras refeições de hoje e a meta do dia: "sugeri 125 g para o dia; com esta vais em 60 g". O cartão diário já lê o bloco de adesão — a nota da Fase 3 que dizia o contrário está errada.

**5.6.** O perfil ganha a cidade de treino, geocodificada uma vez no Perfil (o atleta confirma "Encontrei: Lisboa, Portugal") com coordenadas e altitude guardadas, para o servidor fazer um só pedido. O tempo para o treino entra no chat e no cartão só quando há treino no plano hoje ou amanhã, à hora mediana das corridas recentes ou em duas janelas; o balanço da prova recebe "o tempo que esteve", com o rodapé trocado para não dizer "previsão"; o analyze-run extrai a temperatura do relógio e o resumo das corridas mostra-a; o `enrich-race-event` guarda o D+ segundo o site em `web_info` e o bloco da prova no chat passa a incluir o `route_summary` que já existia. A tabela km a km não muda com o calor: é a régua única com o hub; a Carol diz o ajuste em palavras, como já faz.

## Omnipresença — P.9 a P.13

| Ação | Dimensão | Esforço | Onde |
|---|---|---|---|
| **P.9** A notificação abre a conversa que prometeu, e a Carol sabe que a enviou, o que disse e se foi tocada | P2, O7 | M | Migration `coach_proactive_pushes.body/generated`; `coach-proactive-tick`, `public/sw.js`, `App.jsx`, `Coach.jsx`, `coachProactive.js`, `carolMemory.ts` |
| **P.10** O servidor pergunta pelo treino não registado, respeita a hora da partida e não repete o que a app já mostrou | P1, P3, P6 | G | Migration dos 8 momentos; `proactiveTriggers.ts`, `decide.ts`, `coach-proactive-tick`, `coach-chat`, `send-water-reminders`, `coachProactive.js`, `Perfil.jsx` |
| **P.11** A medalha espera pelas boas-vindas, a véspera e o fim de bloco à vista, e o interruptor das boas-vindas | P3, P6 | M | Migration `profiles.carol_welcome_enabled`; `useMedalMoment.js`, `carolWelcome.js`, `Home.jsx`, `Coach.jsx`, `Perfil.jsx`, uma linha no `coach-chat` |
| **P.12** Voz única: tudo o que se assina Carol fala como ela | P5 | M | `coach-daily-summary`, `_shared/carolTone.ts`, oito funções que dizem "Gemini", `Coach.jsx`, `supabase.js`, `racePlanEngine.js`, `racePhaseEvaluation.ts`, `biEngine.js` |
| **P.13** O plano de ritmos como imagem, para a manhã da prova sem rede | P7 | P | `RacePacingPlanCard.jsx`, `racePlanImage.js`, `raceMural.js` |

**P.9.** O payload leva a chave do momento; o `sw.js` guarda-a e abre `?tab=…&carol=<chave>`; o App regista a impressão `push`, limpa a URL e só consome a chave depois dos dados chegarem: uma intervenção ainda aberta abre o Coach com o intent, um conflito ainda existente idem, e os outros momentos ficam num pedido que o efeito passivo do Coach honra percorrendo a lista de candidatos (nova `listProactiveTriggers`, paridade com o servidor), passando ao seguinte em `already_sent`. O tick grava o texto enviado depois de sair, e um bloco novo no chat diz "notificaste-o: …, tocou / não abriu", com a regra de continuar o assunto em vez de o repetir. O `proactiveTab` do servidor não muda; o `trigger` não vai na URL porque é o prefixo da chave. Fica por decidir, antes de começar, se o toque numa notificação fura as quiet hours como o balanço já faz.

**P.10.** Duas entregas. Primeiro, sem migration: o tick não notifica um momento cujo aviso o Início já mostrou ou o atleta dispensou hoje ("ja_visto", por candidato); a manhã da prova não sai depois da partida e pode adiantar-se até 2 h antes dela, nunca antes das 6 h (restringe o comportamento atual; confirmar com o produto); a água não sai nos 30 min a seguir a uma notificação dela; o tick grava a decisão em `app_logs` (o primeiro escritor server-side, com o usage no topo do meta para o painel Custos o contar, e só quando houve candidato). Depois, com a migration: o momento `missed_workout` avalia o treino de ontem ainda pendente, dentro da janela normal e fora do dia de uma prova, com a frase fixa "Não vi o treino de ontem registado. Aconteceu alguma coisa?" e uma instrução no chat que pergunta e ouve sem reagendar; paridade no cliente e no Perfil. O silêncio ganha uma segunda data, a do último check-in, para dizer "não vejo nenhum treino teu há N dias" em vez de "não registas nada", nos três textos ao mesmo tempo. O "silenciar hoje" fica de fora: a P.6 já cobre.

**P.11.** A medalha espera que a cancela das boas-vindas fique livre. As boas-vindas ganham a variante da véspera, com o nome da prova, a hora de partida e o plano de hoje em vez de uma frase de manual, e um intervalo mínimo de 2 h entre saudações de faixa (a prova e a véspera passam sempre), sem gastar a faixa adiada. O Início ganha o aviso "O bloco está a acabar", com a mesma chave do servidor, cujo "Falar com a Carol" abre o Coach com um intent e `proactive_force`; para isso o `coach-chat` passa a honrar o force também no `block_end` (uma linha, a agrupar com o push da P.9). O Perfil ganha "Boas-vindas ao abrir a app", sempre visível, e o App respeita-o com `=== false`. A marca "um momento de cada vez" fica de fora: são animações de meio segundo em cartões distintos.

**P.12.** As cinco frases do aviso do cartão diário (texto determinístico, não passa pelo modelo) reescritas à mão, mantendo a palavra "água" para o CarolCard não duplicar; um helper `upstreamErrorText` em `carolTone.ts` para as oito funções que hoje dizem "Gemini" ao atleta e para as cinco frases do `coach-chat` em terceira pessoa; o cliente distingue rede de servidor pela classe de erro da supabase-js e mostra a frase do servidor sempre que há resposta; o parecer da prova e os resumos de fase reescritos na voz dela (aparecem sob o avatar no hub, por isso não chega rotulá-los como cálculo); no biEngine só os "!" que sobraram. Um helper `expectCarolVoice` nos testes de cliente e `assertCarolVoice` nos Deno, mais um teste para o que não tinha. Os nomes de módulo ("Coach", "Memória do Coach") e os toasts do sistema não são a voz dela e ficam.

**P.14 — Balanço da semana (2026-09-24).** Pedido de produto: para quem regista todos os dias e tem a prova longe, a Carol ficava semanas sem chamar. Momento `week_review`: à segunda (e à terça, para quem não abriu a app na segunda), o balanço da semana de segunda a domingo que acabou. Só com algum registo **dentro** dessa semana (um registo de hoje não conta) e só num dia sem mais nenhum momento — a prova, a véspera, o "como correu?", o fim de bloco, um assunto por resolver e o "Estás bem?" ficam com o dia. A régua é partilhada (`findWeekToReview` em `proactiveTriggers.ts`), com a chave `week_review:<segunda-feira>`; o tick lê as datas dos registos da semana só à segunda e à terça. No chat, o cliente manda as contagens da semana e da anterior e o `coach-chat` junta o plano dessa semana com o veredicto já decidido (`fetchWeekAdherenceLine`: "Semana cumprida a 100%: sim/não"), para o reconhecimento do CAROL.md §3 não depender do modelo contar linhas. Interruptor "Balanço da semana" no Perfil (desliga a notificação, como os outros momentos; no chat ela escreve-o na mesma). Migration `20260924090000_proactive_week_review`, aplicada antes do deploy.

**P.13.** Reduzida ao botão "Guardar o plano" no cartão de ritmos: uma imagem vertical com as passagens por troço e o abastecimento, partilhada ou descarregada como o mural. Sem modo "em prova", sem cache no service worker, sem cronómetro no ginásio: contrariam o `plano-de-prova.md`, a decisão do `sw.js` e a natureza do formulário de ginásio, e nenhum deles é a Carol a aparecer. P7 continua a valer perto de 2 até haver relógio.

## Ordem recomendada

1. **5.1** (migration das impressões). 2. **5.3** e **5.4** (sem migration). 3. **P.9** (migration do texto das notificações; decidir as quiet hours antes). 4. **P.12** (só strings) e **P.11** (migration do interruptor; a linha do coach-chat vai com a P.9). 5. **P.13**. 6. **P.10** em duas entregas. 7. **5.5** em três pushes. 8. **5.6**.

O merge de `dev-claude` (P.7 e 5.2) para `dev` foi feito a 2026-09-21 (`b22ad24`).

## Riscos a vigiar

- **Migrations e ordem.** Cinco migrations neste plano; nenhuma é aplicada pelo deploy. Se a função chegar antes da coluna ou do check, o erro é silencioso (`console.warn` no cliente, `tally` mal etiquetado no tick) e a funcionalidade parece feita sem o estar.
- **Custo.** O cartão diário está em ~7 000 tokens; 5.1, 5.3 e 5.4 acrescentam-lhe blocos. Medir no `app_logs` uma semana depois de cada uma, e o tick passa a estar lá também.
- **RESPONSE_SCHEMA.** A 5.5 mexe na superfície que deitou o chat abaixo a 2026-09-05. Teste estrutural e validação contra a API real antes do push.
- **Voz.** Cada bloco novo dá à Carol mais razões para elogiar ou cobrar. As instruções dizem "para dar medida" e "para calibrar, não cobrar"; vigiar as primeiras análises depois de cada entrega.
- **Datas locais e dia de Lisboa.** A 5.1 alinhou `coach_impressions` com o dia de Lisboa que o servidor lê; `daily_checkins` continua a gravar com `todayISO()` local (`saveDailyCheckin` no store; `CheckinCard.jsx` lê pelo mesmo dia). Um check-in às 00:30 de Lisboa num telemóvel noutro fuso cai no dia anterior e o cartão não o vê. Fica por alinhar, fora da 5.1: ao mudar, contar com a chave `user_id,date` e com os check-ins já gravados pelo dia local.
