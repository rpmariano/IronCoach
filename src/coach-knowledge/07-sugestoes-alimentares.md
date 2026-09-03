# Bloco 7 — Sugestões alimentares

> Fonte: [specs/coach-investigacao.md](../../specs/coach-investigacao.md), secção "Bloco 7 — Sugestões alimentares".
> Este ficheiro é gerado a partir das respostas já registadas e verificadas nessa investigação — não reabre nem reavalia as decisões, só as torna consultáveis por pergunta.

**Respostas registadas (2026-08-10).** Seis perguntas, confiança ALTA em
todas. Fontes: ACSM/AND, ISSN Nutrient Timing (Kerksick), Burke, Jeukendrup,
Lis, Venderley & Campbell, Rogerson, Fitzgerald — e, na #2, a **Tabela de
Composição de Alimentos do INSA/PortFIR**, que é a referência portuguesa.

## Porque existe este bloco

Ficou uma assimetria por resolver: o coach já consegue **propor treinos** como
dados estruturados (`propose_training_plan`), mas em nutrição só sabe comentar
retrospetivamente. O objetivo original de "sugerir planos alimentares"
perdeu-se pelo caminho.

Os blocos 4.1, 4.2 e 4.3 já dão os **alvos** — g/kg de proteína e hidratos por
nível, distribuição por refeição (0,3-0,4 g/kg a cada 3-4h), défice máximo,
mínimo de gordura, timing peri-treino. O que falta é a ponte entre saber os
números e **sugerir comida concreta**: quantos gramas de que alimento.

## Desenho decidido (2026-08-10)

Um "plano alimentar semanal" a espelhar o plano de treino seria ~40 entradas
por semana (5-6 refeições × 7 dias) — atrito alto, adesão baixa. **Decidiu-se
não criar uma entidade de plano alimentar.** Em vez disso, três formas de
entrega, todas em cima do que já existe:

1. **Correção de refeições registadas.** O coach comenta uma refeição já
   introduzida — *"o teu pequeno-almoço tem 12 g de proteína, devia ter
   25-30 g"*. Retrospetivo, acionável, zero atrito. Já hoje há
   `meals.coach_notes`; é onde isto encaixa.

2. **Sugestão integrada no cartão do treino planeado.** O item do plano já
   mostra *"longão 18 km, domingo"* — passa a poder mostrar também o que
   comer à volta dele (véspera, antes, depois). Reutiliza `coach_plan_items`,
   sem entidade nova. É aqui que os alvos de 4.3 #1 e #3 (peri-treino, carga
   de hidratos) ganham forma concreta.

3. **Cartão de resumo do Coach no Início.** Várias mensagens curtas: o que se
   passou recentemente, avisos para hoje, sugestão de refeição, preparação
   para amanhã. É a materialização da proatividade descrita no PRD 3.6.1 #3 —
   **gatilhos determinísticos decidem quando falar, o modelo só escreve o
   quê**. Peça nova, precisa de desenho próprio (quando gera, onde guarda,
   que custo por geração).

## Enquadramento de segurança — decidido, não negociável

Sugerir alimentação aproxima-se de aconselhamento nutricional, que em Portugal
é ato regulado. Acresce o que o Bloco 5 #7 registou: **15-30% de prevalência
de comportamento alimentar desordenado** em corredores recreativos
incentivados a perseguir um peso ideal.

Duas regras, a escrever na doutrina antes de qualquer implementação:

- **Sugestão educativa, nunca prescrição.** O enquadramento é explícito na
  interface, não escondido num rodapé.
- **A hierarquia de alarmes do Bloco 6 #2 tem precedência absoluta.** Havendo
  sinal de RED-S, perda de peso rápida ou gordura corporal no piso
  fisiológico, o coach **recusa sugerir plano alimentar** e emite alerta. Não
  é "sugere com cuidado" — é não sugere.

## Perguntas

### #1 — Distribuição de calorias e macros pelas refeições

```
Descanso/leve (<60 min Z1-Z2):
  Pequeno-almoço 20-25% kcal · 0,3-0,4 g/kg proteína · 1,0-1,5 g/kg hidratos
  Almoço         30-35% · 0,3-0,4 g/kg P · 1,0-1,5 g/kg H
  Lanche         10-15% · 15-20 g P · 0,5 g/kg H
  Jantar         25-30% · 0,3-0,4 g/kg P · 1,0 g/kg H
  Ceia (opc.)     5-10% · 20-30 g P lenta (caseína) · <0,5 g/kg H
Treino exigente (>60 min Z3-Z5):
  Hidratos concentram-se na janela peri-treino, que passa a levar 40-50% do
  total diário.
  Pré (1-3h antes): 1,0-2,0 g/kg H fáceis + 0,2-0,3 g/kg P
  Intra (>75 min):  30-90 g/h H
  Pós (0-2h):       1,0-1,2 g/kg H + 0,3-0,4 g/kg P (20-40 g)
  Restantes refeições mantêm 0,3-0,4 g/kg de proteína; as gorduras preenchem
  as calorias que sobram fora da janela.
Condições: 3-6 treinos/semana. Fracionar proteína em 3-5 doses de
           0,3-0,4 g/kg, espaçadas 3-4h — limiar ótimo de síntese proteica.
Fonte:     ACSM/AND Joint Position Statement (2016); ISSN Nutrient Timing
           (Kerksick, 2017); Clinical Sports Nutrition 6th Ed (Burke, 2021)
Confiança: ALTA
```

✅ **Computável, e resolve a granularidade que faltava.** `meals.meal_type` é
exatamente o slot que estas percentagens usam (`pequeno-almoco`, `almoco`,
`lanche`, `jantar`, `ceia`) — dá para verificar se o pequeno-almoço tem os
20-25% que devia. É a peça que faltava para a **correção de refeições**
(forma de entrega 1): sem isto o coach só sabia o total do dia, agora sabe
qual a refeição que está mal.

### #2 — Equivalência prática: g/kg → alimentos

```
Proteína por 100 g (porção comestível, cozinhado):
  Frango/peru peito 30-31 · Vaca magra 28-30 · Porco lombo 27-29
  Salmão/atum fresco 24-26 · Atum conserva natural 25
  Ovo inteiro 12,5 (≈6,0-6,5 g/ovo) · Claras 11
  Quark/Skyr/Grego 0% 10-12 · Tofu firme 12-15
  Lentilhas/grão/feijão cozidos 8-9 · Whey 80% → 24 g/scoop de 30 g
Fonte:     Tabela de Composição de Alimentos INSA/PortFIR; USDA FoodData
           Central
Confiança: ALTA
```

✅ **É a ponte que motivou este bloco inteiro.** Sem isto, o coach sabia
"precisas de 1,8 g/kg" e não sabia dizer "150 g de frango". A fonte ser o
**INSA/PortFIR** importa: é a tabela portuguesa, não a americana — os
alimentos e as porções batem certo com o que o utilizador come.

⚠️ **O exemplo da resposta não fecha as contas.** Para 70 kg a 1,8 g/kg
(126 g), a ementa dada soma ~119 g — fica 7 g curta. Não invalida os valores
por 100 g (esses estão certos), mas significa que **o coach tem de somar, não
copiar ementas de exemplo**. A doutrina deve dizer isso explicitamente.

### #3 — Estrutura do dia alimentar, por nível

```
Iniciante: 3-4 refeições fixas. Sem timing complexo nem intra-treino. Regra
           do prato (⅓ proteína magra, ⅓ hidratos complexos, ⅓ vegetais),
           hidratação pela sede.
Básico:    4-5 refeições. Periodização simples — mais hidratos ao lanche e
           jantar em dias longos/intensos; mais vegetais e gordura boa nos
           dias de descanso.
Médio:     5 refeições calculadas em g/kg e alinhadas ao horário do treino.
           Intra-treino estruturado >75 min (30-60 g/h) e variação diária
           real de hidratos (4 g/kg descanso vs. 7 g/kg dia de qualidade).
Avançado:  5-6 estímulos periodizados, com dupla sessão quando aplicável.
           Intra-treino 60-90+ g/h com rácio glicose:frutose, suplementação
           validada (nitratos, beta-alanina, cafeína), periodização de
           glicogénio, carga 10-12 g/kg pré-prova.
Condições: A complexidade acompanha a maturidade — evitar sobrecarga
           cognitiva nos níveis iniciais (ver Bloco 6 #3).
Fonte:     Clinical Sports Nutrition 6th Ed (Burke, 2021); Jeukendrup
           (2014); ACSM Position Stand (2016)
Confiança: ALTA
```

**Coerente com Bloco 6 #3 e #4, e a própria fonte remete para lá.** Um
iniciante não recebe "4 g/kg vs 7 g/kg" — recebe "regra do prato". É a mesma
doutrina de comunicação, agora aplicada à nutrição.

### #4 — Alimentos pré-prova (24-48h)

```
Recomendados: arroz branco, massa branca, pão branco/torradas, batata sem
           pele, puré, tapioca, aveia fina coada, corn flakes, banana madura,
           compotas sem pedaços, mel. Proteína magra em porção moderada:
           frango/peru, claras, fiambre de peru, peixe branco. Água,
           isotónicos, sumo de maçã/uva coado.
Evitar:    integrais, aveia grossa, leguminosas, vegetais crus e crucíferas,
           frutos secos e sementes, fruta com casca/grainhas, figos, ameixas.
           Fritos, molhos gordos, carnes gordas, queijos curados, abacate,
           pastelaria. Lactose (se sensível), polióis (sorbitol/xilitol),
           picante, bebidas com gás.
Condições: 24-48h antes de provas >60-90 min.
Fonte:     Burke (2021); Gastrointestinal Complaints During Exercise (Lis,
           2018); ACSM Position Stand (2016)
Confiança: ALTA
```

✅ **Traduz em alimentos os limiares que 4.3 #4 já tinha dado em gramas**
(fibra <10-15 g, gordura <15-20%). É o que permite ao coach dizer "arroz
branco em vez de integral" em vez de "reduz a fibra para 12 g".

### #5 — Restrições alimentares

```
Vegetariano/vegano:
  Substitutos: tofu, tempeh, seitan, proteína de ervilha/arroz, soja
  texturizada, cereais + leguminosas.
  Alvos críticos: B12 (suplementação obrigatória — 250 µg/dia ou
  2000 µg/semana); ferro não-heme (absorção 2-20% vs. 15-35% do heme →
  precisa de 1,8× o valor de omnívoro, com vitamina C à refeição e sem
  café/chá/cálcio); proteína +10-20% pela menor digestibilidade e leucina;
  creatina 3-5 g/dia e ómega-3 de microalgas.
Sem lactose:
  Substitutos: lactose-free, queijos curados (<0,1 g), bebidas vegetais
  enriquecidas, whey isolate, proteína vegetal.
  Alvos críticos: cálcio e vitamina D.
Sem glúten:
  Substitutos: arroz, batata, batata-doce, tapioca, milho, quinoa, trigo
  sarraceno, aveia certificada.
  Alvo crítico: a carga de hidratos (10-12 g/kg) fica MAIS DIFÍCIL sem
  exceder fibra — muitos produtos sem glúten usam farinhas integrais e
  sementes. Priorizar arroz branco, tapioca, fécula de batata.
Fonte:     Vegetarian diets: nutritional considerations for athletes
           (Venderley & Campbell, 2006); Vegan diets: practical advice for
           athletes (Rogerson, JISSN 2017); ACSM (2016); Burke (2021)
Confiança: ALTA
```

🔴 **LACUNA CRÍTICA — não existe campo de restrições alimentares.**
Confirmado por consulta ao schema: `profiles` não tem nada de dieta,
restrição, alergia ou preferência.

**É a lacuna mais grave de todo o documento, e por uma razão diferente das
outras.** As lacunas anteriores (HRV, ferritina, temperatura) limitam o que o
coach *consegue* dizer. Esta faz o coach dizer coisas **erradas**: sugerir
150 g de frango a um vegetariano, ou massa a um celíaco. Nas outras o coach
fica calado; nesta perde a confiança do utilizador à primeira sugestão.

**Consequência**: nenhuma das três formas de entrega do Bloco 7 deve ser
implementada antes de existir este campo. Não é "seria bom ter" — é
pré-requisito.

Também liga a 4.2 #2 (ferro): o limiar de preocupação de um vegetariano é
1,8× o de um omnívoro. Sem saber a dieta, o alarme de ferro está calibrado
para a pessoa errada.

### #6 — Erros mais comuns em corredores amadores

```
1. Treinar em jejum por rotina (Z3-Z5 ou longos sem hidratos) → cortisol
   elevado, catabolismo, incapacidade de atingir os ritmos prescritos.
2. Défice excessivo e fobia ao peso (>500-700 kcal/dia em fase de aumento de
   volume) → LEA/RED-S, fraturas de stress, amenorreia/queda de testosterona.
3. Subestimar hidratos (low-carb/cetogénica em endurance, onde o glicogénio
   é ≥80% da via energética acima de VT1) → fadiga crónica, perda de potência
   aeróbica.
4. Inovar no dia da prova (géis novos, pequeno-almoço diferente, cafeína não
   testada) → distúrbios gastrointestinais.
5. Hidratação incorreta em longos/calor — só água em >2h de calor
   (hiponatremia) ou sub-hidratação >2% da massa corporal.
Fonte:     Lis (2018); Racing Weight (Fitzgerald, 2012); ACSM Position Stand
           (2016); Jeukendrup (2014)
Confiança: ALTA
```

✅ **Sem contradições com o já registado — confirma quatro blocos anteriores.**
O erro #2 bate certo com o teto de 500 kcal/dia (4.1 #5 e Bloco 1 #6); o #4
com 4.3 #5 (testar cafeína em treino) e Bloco 6 #4 (nada não testado nas
48-72h); o #5 com 4.2 #4 (sódio e hiponatremia). O #1 e o #3 são novos e
**detetáveis**: treino em jejum vê-se por ausência de refeição antes de uma
sessão Z3-Z5 registada; hidratos cronicamente baixos veem-se de `meal_items`.

**Valor prático**: é a lista do que o coach deve *procurar* antes de o atleta
perguntar — alimenta a forma de entrega 3 (cartão de resumo no Início).

---

## Balanço

**O melhor bloco em implementabilidade de toda a investigação** — quatro das
seis perguntas são diretamente utilizáveis (#1, #2, #4, #6), e as outras duas
são doutrina de comunicação (#3) e o pré-requisito bloqueante (#5).

**Uma única coisa impede avançar**: o campo de restrições alimentares. Está
registado acima como 🔴 porque é diferente em natureza de tudo o resto — não
limita o coach, faz o coach errar.

O campo **Confiança** não é decorativo: limiares de confiança baixa devem gerar
linguagem mais suave na doutrina ("considera", "pode valer a pena") em vez de
afirmações categóricas.

**Quando a literatura não diferenciar por nível, registá-lo** — "sem
diferenciação encontrada" é uma resposta válida e evita que se invente uma.

## Nota de operacionalização (2026-09-03) — baixo atrito nas sugestões

Não reabre nenhuma das perguntas acima; a ciência e os números continuam os
mesmos. O que mudou foi como o prompt operacional (`MEAL_DOCTRINE`, duplicado
em `coach-chat`, `coach-daily-summary` e `analyze-meal`) traduzia esses
números em texto: pedia uma ementa a "fechar as contas" ao grama, com macros
exatos por refeição, muitas vezes com alimentos diferentes a cada dia — na
prática, obrigava o atleta a ir às compras por um ingrediente novo
constantemente. Feedback direto do utilizador: isto gera ansiedade e
frustração, não adesão.

Correção aplicada nos três prompts e nas descrições dos campos
`meal_suggestion`/`save_meal_suggestions`: sugestões por **categoria de
alimento + quantidade redonda** ("150g de peixe", "2 ovos", "150g de iogurte
skyr"), reutilizando um núcleo pequeno de alimentos comuns ao longo da
semana em vez de uma ementa de precisão que varia todos os dias. Os valores
de g/kg e a tabela de equivalência (#2) continuam a calibrar a *ordem de
grandeza* da porção sugerida — deixaram de ser uma equação que tem de fechar
ao grama. As refeições do dia (pequeno-almoço/almoço/lanche/jantar) mantêm-se.

