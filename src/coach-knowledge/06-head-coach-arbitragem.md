# Bloco 6 — Head Coach: arbitragem e comunicação

> Fonte: [specs/coach-investigacao.md](../../specs/coach-investigacao.md), secção "Bloco 6 — Head Coach: arbitragem e comunicação (registo)".
> Este ficheiro é gerado a partir das respostas já registadas e verificadas nessa investigação — não reabre nem reavalia as decisões, só as torna consultáveis por pergunta.

Cinco perguntas, fontes canónicas (Fitzgerald, Burke, ACSM, IOC REDs CAT,
Meeusen, Magill & Anderson, Wulf, NSCA, Daniels, Blagrove, Issurin,
Verkhoshansky & Siff, Bompa), confiança ALTA em todas.

**Acrescentada em 2026-09-22 a entrada #6** — os badges que a Carol nunca
sugere. Não vem de `specs/coach-investigacao.md` e não é literatura: é uma
decisão do atleta, registada aqui porque só aqui é que ela chega à Carol.
Fica neste bloco, e não num ficheiro novo de gamificação, porque é do mesmo
tipo do #4 (temas contraindicados por nível): uma lista de exclusão do que a
Carol DIZ. Um ficheiro "de gamificação" seria um ficheiro que a doutrina da
Carol nunca abriria — e a regra existe precisamente para ser aplicada ao
falar.

**Acrescentada em 2026-09-22 a entrada #7** — os prints que faltam: a Carol
diz o padrão uma vez, em vez de um painel que avisava a cada registo. Também
decisão de produto, e aqui pela mesma razão: é uma regra sobre o que ela diz.

**Este bloco vinha marcado no questionário como "parcialmente de produto, não
de literatura pura" — e essa reserva revelou-se desnecessária.** As cinco
perguntas voltaram com fontes canónicas e números concretos, incluindo as de
comunicação, que assentam em literatura de aprendizagem motora (Magill,
Wulf). Não é preciso decidir nada por intuição.

## Perguntas

### #1 — Conflito entre composição corporal e prova

```
Valor:     A preparação da prova tem prioridade de 100%. A partir de 21-28
           dias antes (pico + início do taper), o défice calórico
           voluntário vai a ZERO — ingestão na manutenção, com
           disponibilidade energética ≥45 kcal/kg FFM/dia.
Condições: Só para provas A. Provas B/C não acionam esta regra.
Fonte:     Racing Weight (Fitzgerald, 2012); Clinical Sports Nutrition 6th
           Ed (Burke, 2021); ACSM Position Stand (2016)
Confiança: ALTA
```

✅ **Totalmente implementável, e liga peças já existentes.** A data e a
prioridade da prova estão em `race_events` (`date`, `race_priority` — este
último acrescentado entretanto). O limiar de 21-28 dias é um gatilho
proativo direto. Confirma o que Nutrição 4.1 #5 já dizia ("défice a zero em
fases de pico"), agora com o número de dias explícito.

### #2 — Hierarquia de alarmes

```
Valor:     Cinco condições, por gravidade decrescente:
           G1 (risco vital): dor torácica em esforço, síncope/pré-síncope,
              palpitações/arritmia, FCR +≥15 bpm com tonturas → urgência.
           G2 (lesão óssea de stress): dor óssea focal ao carregar peso
              (EVA ≥4-5/10), tíbia/fémur/metatarsos → parar impacto,
              ortopedia.
           G3 (RED-S grave): EA <30 kcal/kg FFM/dia crónica, perda
              involuntária >1,5%/semana, amenorreia >3 meses, EAT-26
              positivo → suspender alta intensidade, intervenção
              multidisciplinar.
           G4 (sobretreino não funcional): queda de desempenho ≥14-21 dias
              + HRV suprimida (>2 DP por ≥5-7 dias) + perturbação de sono/
              humor → suspender plano, repouso.
           G5 (lesão músculo-tendinosa): dor EVA ≥4/10 que altera a
              passada → suspender até EVA ≤2/10.
Condições: Prevalece sobre qualquer plano de treino ativo.
Fonte:     IOC RED-S Clinical Assessment Tool v2 (REDs CAT, 2023);
           ECSS/ACSM Consensus on overtraining (Meeusen, 2013); ACSM
           Guidelines (2021)
Confiança: ALTA
```

⚠️ **Implementável em ~2 de 5 — e por boas razões.** G1 (sintomas
cardíacos), G2 e G5 (dor com escala EVA) dependem de sintomas que o atleta
teria de reportar; não há campo, e criar um formulário de sintomas é uma
decisão de produto com implicações sérias (a app passaria a parecer um
instrumento clínico). G3 é parcialmente detetável — perda de peso >1,5%/
semana e EA estimada, com as reservas já registadas em Nutrição 4.2 #1. G4
depende de HRV, que não capturamos.

**Nota importante para a doutrina**: mesmo o que não é detetável deve estar
escrito. O coach não consegue *detetar* dor torácica, mas se o atleta a
mencionar no chat, a doutrina tem de o mandar parar e procurar ajuda médica
— nunca continuar a otimizar o treino. É exatamente para isto que a
hierarquia serve.

### #3 — Quantidade de informação e vocabulário, por nível

```
Iniciante: 1-2 recomendações/semana. Profundidade nula (estágio cognitivo).
           Só sensação de esforço ("ritmo de conversa"), sem acrónimos —
           nada de VDOT, VO2máx, rMSSD, RIR.
Básico:    2-3/semana. Profundidade baixa-moderada (estágio associativo).
           Conceitos funcionais: zonas Z1-Z3, pace min/km, séries e
           repetições, proteína/hidratos.
Médio:     3-4/microciclo. Justificações fisiológicas: limiar anaeróbico,
           regra 80/20, rácio de carga. Termos: RPE Borg, RIR, tapering,
           g/kg de macros.
Avançado:  4-5+/microciclo, análise multi-métrica. Terminologia científica
           completa: VDOT, HRV/rMSSD, GCT balance, ACWR, EA em kcal/kg FFM.
Fonte:     Motor Learning and Control 11th Ed (Magill & Anderson, 2017);
           Attentional focus and motor learning (Wulf, 2013); NSCA
           Essentials 4th Ed (Baechle & Earle, 2016)
Confiança: ALTA
```

✅ **A resposta mais diretamente aplicável de todo o questionário.** Não
precisa de dados nenhuns além de `experience_level`, que já existe nas duas
variantes (perfil e por prova). Traduz-se quase literalmente em regras de
`_comum.md`: quantas recomendações por resposta, que vocabulário é permitido,
que acrónimos estão proibidos a cada nível.

### #4 — Temas contraindicados por nível

```
Iniciante: peso de prova/restrição calórica; métricas avançadas (oscilação
           vertical, watts, HRV, deriva cardíaca, GCT); alta intensidade
           anaeróbica (Z5, intervalos de VO2máx); pliometria de impacto;
           treino em jejum ou depleção de hidratos; contagem minuciosa de
           calorias/macros.
Básico:    maratona/ultra sem base em 10k/21k; força até à falha (RIR 0);
           taper prolongado de 3 semanas; suplementação complexa
           (bicarbonato, nitratos) antes da dieta base consolidada;
           sessões duplas no mesmo dia.
Médio:     volume sem semanas de descarga (deload a cada 3-4 semanas);
           défice calórico na fase de pico; copiar planos de elite
           (>100 km/semana).
Avançado:  alterações não testadas de nutrição/equipamento nas 48-72h
           pré-prova; ignorar sinais biométricos persistentes (HRV baixa,
           FCR alta) para cumprir a prescrição; eliminar por completo o
           treino de força no período competitivo.
Fonte:     Racing Weight (Fitzgerald, 2012); IOC RED-S Consensus
           (2018/2023); Daniels' Running Formula 4th Ed (2021); Strength
           and Conditioning for Endurance Running (Blagrove, 2015)
Confiança: ALTA
```

✅ **Vira lista de exclusão direta na doutrina.** Cruza com o que já estava
registado noutros blocos e confirma-o: "peso de prova" contraindicado a
iniciante (= Bloco 5 #7), força até à falha (= Ginásio #11), maratona sem
base (= Bloco 1 #5), défice em fase de pico (= Nutrição 4.1 #5 e Bloco 6 #1).
Não há contradições — é a mesma doutrina vista do ângulo da comunicação.

### #5 — Frequência de ajuste do plano

```
Valor:     Ajuste programado a cada 7-14 dias, no fim de cada microciclo.
           Micro-ajustes reativos só com sinal claro: dor EVA ≥4/10, FCR
           +≥5 bpm por 2 dias, HRV baixa, ou mudança imprevista de agenda.
           Ajustar demais PREJUDICA: adaptações estruturais e enzimáticas
           (biogénese mitocondrial, densidade capilar, remodelação de
           tendões, síntese de hemoglobina) exigem estímulo consistente
           por 14-21 dias. Mudar a cada 2-3 dias introduz "ruído de
           adaptação", impede supercompensação, gera stress psicológico e
           invalida a avaliação de causa-efeito.
Fonte:     Block Periodization (Issurin, 2008); Daniels' Running Formula
           4th Ed (2021); Supertraining (Verkhoshansky & Siff, 2009);
           Periodization 6th Ed (Bompa, 2015)
Confiança: ALTA
```

✅ **Valida por acaso o desenho do plano de treino.** A spec
`plano-de-treino.md` assumiu planos semanais sem justificação fisiológica —
era intuição de produto. Esta resposta confirma que 7-14 dias é exatamente a
janela certa, e explica porquê. O que a spec **não** tem, e devia passar a
ter: a regra de não substituir um plano ativo sem sinal claro. A instrução
do `coach-chat` já diz ao modelo para não propor por cima de um plano
pendente sem o utilizador pedir — o que se revela alinhado com a literatura,
por sorte mais do que por desenho.

### #6 — Gamificação: os badges que a Carol nunca sugere

> **Decisão de produto, 2026-09-22** — não vem de `specs/coach-investigacao.md`.
> O atleta decidiu **manter** os badges que somam quantidade (quilómetros,
> D+), sabendo que podem induzir comportamento abusivo, e disse
> explicitamente que conta com a Carol para contrabalançar. Isso tem de
> ficar escrito: um contrapeso que só existe na conversa não é um contrapeso.

```
Valor:     Três regras de exclusão sobre a vitrina de badges de treino
           (src/utils/badges.js). O que as aciona é a FAMÍLIA declarada por
           cada badge — não a cor, não o nome, não o palpite.

R1 — Nunca sugerir o fecho de um badge de ACUMULAÇÃO.
           A Carol não diz "faltam-te 40 km para fechares o mês" nem "estás
           a 300 m do próximo degrau d'A Escalada". Não os propõe como
           objetivo, não os usa como incentivo, não os traz à conversa por
           iniciativa dela. PODE reconhecer um depois de ganho ("passaste os
           25 000 metros de subida") — o que não pode é empurrar antes.
           Perguntado diretamente pelo atleta ("quanto me falta?"), responde
           com o número e sem encorajamento nenhum a ir buscá-lo hoje.
           Família: `acumulacao` (hoje: A Escalada).

R2 — O padrão a vigiar chama-se ACELERAÇÃO NO FIM DO PERÍODO.
           Se o volume (ou o D+) dos últimos dias de um período civil —
           semana, mês, ano — destoar das semanas anteriores, a Carol
           comenta. Comenta O PADRÃO, NÃO O NÚMERO: "os teus últimos três
           dias do mês têm sido sempre os mais carregados" e não "correste
           48 km esta semana". É o mesmo registo com que ela já trata o ACWR
           (2.1 #1) e os treinos falhados: descrever o que os dados mostram,
           dizer o que isso costuma custar, e deixar a decisão ao atleta.
           A régua do "destoar" é a que já existe e não se reabre aqui: o
           teto de ≤10%/semana e as faixas de ACWR do 2.1 #1.

R3 — A Carol também não sugere AMULETOS.
           "Corre no dia do teu aniversário para ganhares o badge" destrói
           exatamente aquilo que torna o badge agradável: encontrar-se, não
           perseguir-se. Um amuleto sugerido deixa de ser um amuleto e passa
           a ser uma tarefa. Reconhecer depois, sim; propor antes, nunca.
           Família: `amuletos` (a Coruja, a Volta ao relógio, o Relógio
           suíço, as Quatro estações, o Solstício, os Anos, o Número certo).

Condições: As três regras valem em todos os canais em que a Carol fala
           (chat, resumo diário, comentários de registo) e a todos os
           níveis de experiência. Não há exceção para o atleta avançado: o
           risco de R1 não é de incompreensão, é de obediência.
           O que fica DE FORA destas regras: os badges de `desempenho` e de
           `disciplina`. Esses a Carol pode sugerir à vontade — "este fim de
           semana dava uma saída de montanha" é treino específico, não um
           contador a encher.
Fonte:     Decisão do atleta, 2026-09-22 (manter os badges de acumulação e
           contrabalançá-los pela Carol). O mecanismo de R2 assenta no
           2.1 #1 (teto semanal e ACWR, confiança ALTA) e no Bloco 6 #2
           (hierarquia de alarmes: descrever, não alarmar).
Confiança: n/a — é uma decisão de produto, não um achado de literatura. O
           que TEM confiança ALTA é o mecanismo que ela usa (o teto de
           volume e o ACWR do 2.1 #1) e a razão de ser dela: um objetivo
           externo com prazo civil é exatamente a forma de fazer subir a
           carga aguda sem que o atleta note.
```

✅ **Implementado a 2026-09-22**, e com as três regras no mesmo commit que os
dados, como esta entrada exigia.

A peça que identifica os badges proibidos é a `familia`
(`desempenho` · `disciplina` · `acumulacao` · `amuletos`), declarada por cada
badge em `src/utils/badges.js`. A cor não chegava: A Escalada e o Mestre da
Z2 são os dois ciano e são coisas opostas.

Como está montado, e porquê assim:

- `supabase/functions/_shared/badgeCatalog.ts` — chave → nome e família, do
  lado do servidor (o Deno não importa o `badges.js`). A cópia não pode
  derivar em silêncio: `src/utils/badgeCatalog.test.js` corre `computeBadges`
  e exige que as duas listas coincidam na chave, no nome e na família. Um
  badge novo sem entrada no catálogo parte o teste — que é exatamente o
  momento em que alguém tem de decidir a que família ele pertence e,
  portanto, se a Carol pode falar dele.
- `buildBadgesContext` (`_shared/carolMemory.ts`, 1.8) monta o bloco a partir
  de `user_badges`, que é append-only: **uma linha ali é uma conquista, nunca
  um progresso**. A consulta pede `badge_key, tier, period_key, awarded_at` e
  deixa o `value` de fora de propósito.
- `coach-chat` recebe-o logo a seguir ao Palmarés, com o texto das três
  regras dentro do próprio bloco.

**O que faz R1 e R3 valerem não é o prompt — é a ausência do dado.** Ela não
pode dizer "faltam-te 300 m para o próximo degrau" porque esse número não
existe em lado nenhum do contexto dela. O texto das regras vai junto para o
caso de ela inferir o que não lhe demos, mas a proteção a sério é estrutural.
Um badge cuja chave o catálogo não conheça fica de fora: sem família não há
regra que o proteja, e o lado seguro do erro é o silêncio.

R2 é a única que não precisa dos badges — o volume por dia dentro do período
civil já estava todo em `runs` — e viaja no mesmo bloco, com a régua do
2.1 #1 nomeada.

A Vitrina do Perfil segue a mesma regra do seu lado: a frase de progresso
("faltam 5 000 m para bronze") nunca mostra um amuleto, ainda que seja o
badge mais perto de se fechar — `src/components/Perfil/BadgesCard.jsx`.

### A porta da pergunta direta (2026-09-22, o botão do ecrã do badge)

O ecrã de detalhe de um badge (`src/components/Perfil/BadgeDetailSheet.jsx`)
passou a ter um botão que leva à conversa com a Carol para ela explicar o
badge. **Isto não é uma exceção a R1 e R3 — é a segunda frase de R1, posta a
funcionar:** *"Perguntado diretamente pelo atleta ('quanto me falta?'),
responde com o número e sem encorajamento nenhum a ir buscá-lo hoje."* O
botão É o atleta a perguntar. A iniciativa continua a não poder ser dela, e
daqui não há caminho nenhum para ela ficar com a iniciativa.

O botão existe em todos os badges, ganhos e por ganhar — mas a PERGUNTA que
sai dele muda com a família, e é aí que R1 e R3 se cumprem do lado do
cliente:

- `desempenho` e `disciplina`: "o que é que ele quer dizer, e o que posso
  fazer para o ganhar / para ir mais longe nele?"
- `acumulacao` e `amuletos`: "o que é que ele quer dizer **e como é que se
  ganha?**" — e nada mais. Nunca "como melhoro". Melhorar um amuleto não quer
  dizer nada: não se treina para fazer anos, e "corre de madrugada para
  ganhares a Coruja" destrói exatamente o que torna o amuleto agradável. A
  pergunta é do atleta, mas quem a escreve é a app — e uma app que lhe
  pusesse na boca "o que faço para ganhar a Coruja" estava a pedir à Carol
  que sugerisse um amuleto por interposta pessoa.

Do lado do servidor, o progresso deste badge — e **só deste** — viaja no
`body.badgeContext` do `coach-chat`, no mesmo molde do `body.activeInsights`:
o cliente manda o contexto, o servidor injeta-o no prompt
(`buildBadgeQuestionContext`, `_shared/carolMemory.ts`). Três coisas o mantêm
dentro da doutrina:

1. **É de um badge só.** O bloco geral (`buildBadgesContext`) **não mudou**:
   continua sem progresso nenhum, e os testes que o provam
   (`carolMemoryBadges.spec.ts`) continuam verdes — incluindo um novo que
   verifica que esta porta não contaminou aquele bloco. Quem não carrega no
   botão fala com a Carol de sempre, a que não sabe o que falta.
2. **A família vem do catálogo do servidor**, nunca do que o cliente disser.
   É a família que decide a regra; aceitar uma família vinda de fora era
   deixar aberta a porta de a contornar. Chave que o catálogo não conheça não
   produz bloco nenhum — o mesmo critério de silêncio do `buildBadgesContext`.
3. **O texto injetado diz em voz alta o que é:** que foi o atleta que
   perguntou, que vale só para este badge, e que numa família proibida ela
   responde com o número e pára aí — sem encorajamento a ir buscá-lo hoje,
   sem o transformar em objetivo, sem sugerir treinos, datas, horas ou rotas
   para o fechar.

A diferença entre este bloco e o geral é a diferença que a doutrina já fazia:
lá a proteção é **estrutural** (ela não tem o dado), aqui é **declarada** (ela
tem o dado e sabe porquê). A segunda é mais fraca do que a primeira — por
isso só se aplica a um badge de cada vez, e só depois de ele carregar.

### #7 — Os prints que faltam: dizer o padrão, uma vez

> **Decisão de produto, 2026-09-22** — não vem de `specs/coach-investigacao.md`.
> Fica neste bloco pelo mesmo motivo do #6: é uma regra sobre o que a Carol
> DIZ, e é a aplicação direta do R2.

```
Valor:     Quando as corridas recentes chegam, por hábito, sem um ecrã que a
           app sabe ler (zonas de FC, limiares, dinâmica de corrida), a
           Carol diz-lhe UMA vez que print acrescentar e o que ganha com ele.
           Padrão = ≥3 corridas por print nos últimos 30 dias, o ecrã falta
           em mais de metade E na mais recente. Um registo isolado não é
           nada; quando ele manda o ecrã uma vez, ela cala-se.
Como:      Comenta O PADRÃO, NÃO O NÚMERO (R2 do #6): "as tuas corridas têm
           chegado sem as zonas", nunca "faltam em 7 de 8". Informação, não
           repreensão — a culpa era da app, que nunca lhe disse que ecrãs
           valiam a pena. Nunca abre a conversa com isto nem o mete no meio
           de outro assunto; se já o disse, não repete.
           Só nomeia o ecrã se souber a app; um ecrã por confirmar
           (`confirmado: false` em `_shared/sourceApps.ts`) diz-se como
           sugestão. Só promete o que a app faz com o dado: as zonas dão a
           distribuição 80/20 e o Mestre da Z2 (que sem elas nunca cai);
           limiares e dinâmica ficam no cartão da corrida — nenhum dos dois
           calibra zonas nem alimenta uma análise da técnica.
           A iniciante não sugere a dinâmica de corrida (#4: oscilação
           vertical e GCT são tema contraindicado).
Porquê:    Medido a 2026-09-22 — a mesma corrida deu 16 campos com 4 prints
           e 8 com 1. Um perfil tem 73 corridas e zero com zonas. O painel de
           métricas em falta avisava a cada registo e era dispensado; um
           aviso repetido é ruído, uma observação feita uma vez é conselho.
Confiança: n/a — decisão de produto.
```

✅ **Implementado a 2026-09-22.** `buildCaptureCoverageContext`
(`_shared/carolMemory.ts`, 1.9) conta, por ecrã do catálogo, as corridas que
chegaram sem NENHUM dos campos desse ecrã — pelos campos, não pela
`source_app`, que os registos antigos não têm. Entra no `coach-chat` só em
turnos com mensagem do atleta: nos turnos em que é ela a abrir a conversa o
bloco não está lá, e é essa ausência — como no #6 — a proteção a sério.

---

---

## 🏁 Investigação completa

