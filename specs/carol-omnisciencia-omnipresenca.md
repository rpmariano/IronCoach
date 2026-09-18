# Carol — caminho para a omnisciência e a omnipresença

> Data: 2026-09-18 · Base: `dev` em `abec7b8` · Complementa [carol-auditoria.md](carol-auditoria.md) e [carol-vida.html](carol-vida.html).
> Prioridade definida pelo produto: **omnisciência primeiro**, omnipresença depois.

## Onde estamos

| Eixo | Nota atual | Nota depois da Fase 1 | Nota depois de tudo |
|---|---|---|---|
| **Omnisciência** | **7,0 / 10** (3,7 antes da Fase 1, 6,0 depois dela) | 6,0 / 10 | 8,6 / 10 |
| **Omnipresença** | **6,6 / 10** (2,8 de manhã; 6,1 depois da P.3) | — | 9,0 / 10 |

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
| 1.5 | O Palmarés lê `medal_awards`: recordes em vigor, distâncias, objetivos batidos, sequência, terreno e O Ano em Km. Junta as últimas 5 provas concluídas, com o tempo real da corrida ligada face ao objetivo. |
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

**Ficou de fora:** um ecrã de privacidade para rever ou apagar os check-ins. Hoje, a única forma de apagar dados é retirar o consentimento do ciclo, que apaga só o ciclo.

Com a Fase 2, O3 passa de 2 para 7 e O7 de 3 para 7. Contando também a ação 1.3, O1 fica em 9. A omnisciência sobe para **7,0**.

### Fase 3 — o que ela recomendou e o que aconteceu (O4) · 7,4 para 7,8

| Ação | Dimensão | Esforço | Onde |
|---|---|---|---|
| **3.1** Guardar cada recomendação concreta com um identificador: refeição sugerida, treino ajustado, descanso | O4 | M | `save_meal_suggestions`, itens do plano, memória |
| **3.2** Comparar automaticamente recomendação e registo seguinte, e entregar o resultado no contexto | O4 | M | Helper em `_shared`, lido pelo chat e pelo cartão |

### Fase 4 — os dados que o atleta não escreve (O6, O8) · 7,8 para 8,6

| Ação | Dimensão | Esforço | Onde |
|---|---|---|---|
| **4.1** Integração com relógio para FC em repouso, HRV e sono diários. Começar pelo Health Connect e pelo Apple Health, via exportação, ou pelo Strava | O6 | G | Nova Edge Function e tabela `daily_physiology` |
| **4.2** Meteorologia da prova a 7 dias e na véspera, e do dia do treino longo | O8 | P | Estender `enrich-race-event` com uma API de meteorologia |
| **4.3** Perfil altimétrico do percurso da prova | O8 | M | `enrich-race-event` |

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
