# Bloco 2.5 — Corrida: VO2máx e VDOT

> **Investigação nova, 2026-09-22.** Ao contrário dos outros ficheiros desta
> pasta, este NÃO é conversão de `specs/coach-investigacao.md` — é pesquisa
> feita de raiz, a pedido do atleta, depois de o VO2máx/VDOT ter sido
> excluído por se assumir que duplicava o medalhão "Os Níveis" do Palmarés.
> Duplica em parte, e este ficheiro diz exatamente em que parte (ver #3 e #4).

**Porquê um bloco novo e não uma pergunta dentro do 2.2 (Intensidade).** O
Bloco 2.2 responde a "com que intensidade treinar"; isto responde a "que
aptidão aeróbica é que o atleta tem, e como é que sabemos que melhorou". São
perguntas de medição, não de prescrição, e tocam três ficheiros ao mesmo
tempo (Bloco 0 usa VDOT para classificar nível, Bloco 1 para ritmo de
melhoria, Bloco 2.3 para previsão de tempos). Metê-las dentro de um deles
escondia-as dos outros dois.

**Quatro perguntas. A confiança NÃO é uniforme** — uma delas (#4) fecha com
uma lacuna assumida, e é a mais importante para quem quiser construir um
badge disto.

## Perguntas

### #1 — Normas populacionais de VO2máx por idade e género

```
Pergunta:  Corrida 2.5 #1 — que valores de VO2máx são típicos por escalão
           etário e género
Valor:     Mediana (percentil 50) em ml/kg/min, teste máximo em passadeira
           com análise de gases, população adulta saudável:

           Idade     Homens    Mulheres
           20-29     48,0      37,6
           30-39     42,4      30,2
           40-49     37,8      26,7
           50-59     32,6      23,4
           60-69     28,2      20,0
           70-79     24,4      18,3

           Faixas de interpretação ACSM (percentis): <20 Fraco · 20-39
           Razoável · 40-59 Médio · 60-79 Bom · 80-94 Excelente · ≥95
           Superior.
           Declínio com a idade: ~9-10% por década na população geral. Em
           quem MANTÉM treino de resistência vigoroso, ~5,5% por década,
           contra ~12% em sedentários da mesma idade (seguimento de ~8 anos).
Condições: ISTO É NORMA POPULACIONAL, NÃO ALVO DE TREINO. Diz o que é
           típico para a idade e sexo de alguém — não diz o que essa pessoa
           deve procurar atingir, nem o que precisa para uma prova. Confundir
           as duas coisas é o erro que o Bloco 6 proíbe.
           Valores de passadeira; testes de cicloergómetro dão 10-15% menos e
           não são comparáveis com estes.
Fonte:     ACSM's Guidelines for Exercise Testing and Prescription, 11.ª ed.,
           Tabela 4.7 (dados do Cooper Institute / Aerobics Center
           Longitudinal Study, >80 000 adultos); Kaminsky et al., Reference
           Standards for Cardiorespiratory Fitness Measured With
           Cardiopulmonary Exercise Testing: Data From FRIEND (Mayo Clinic
           Proceedings, 2015; atualização 2022); Rogers et al., Decline in
           VO2max with aging in master athletes and sedentary men (Journal
           of Applied Physiology, 1990)
Confiança: MÉDIA — ver o conflito de tabelas já a seguir.
```

**Conflito entre as duas grandes referências, assinalado e não escondido.**
Há dois registos de referência a competir, e não dão os mesmos números para a
mesma célula:

| Célula | ACSM/Cooper (Tabela 4.7) | FRIEND (Kaminsky) |
|---|---|---|
| Homens 20-29, P50 | 48,0 | 49,5 |
| Mulheres 20-29, P50 | 37,6 | 40,6 |
| Homens 70-79, P50 | 24,4 | 30,8 |
| Mulheres 70-79, P50 | 18,3 | 25,0 |

São populações e métodos diferentes (o Cooper é uma coorte de pessoas que
procuraram avaliação de aptidão; o FRIEND agrega laboratórios clínicos), e o
próprio FRIEND baixou os seus valores de 1,5 a 4,6 ml/kg/min entre a versão
de 2015 e a de 2022. A diferença entre tabelas chega a **6 ml/kg/min no mesmo
sexo e na mesma década** — mais do que o erro de medição do relógio (#2).

**Decisão, pela regra da casa (em conflito, o mais conservador):** adotar a
tabela ACSM/Cooper acima, que é a mais baixa nos escalões mais velhos e
portanto a que MENOS elogia. E, sobretudo: **nunca dizer um percentil ao
atleta**. A doutrina só autoriza a linguagem de banda — "acima", "à volta
de", "abaixo" da mediana da tua idade e sexo — e só quando a diferença for
maior do que a discordância entre tabelas somada ao erro do relógio, o que na
prática significa **≥5 ml/kg/min**. Abaixo disso, não há informação: há ruído.

**Sobre a diferença entre sexos:** é real e fisiológica (concentração de
hemoglobina, tamanho do coração relativo à massa corporal, percentagem de
massa magra), da ordem dos 15-25% na mediana. Por isso a régua é por sexo —
ao contrário da cadência (Bloco 2.4 #3.3), onde a diferença aparente se
explicava por comprimento de perna e a régua por género teria sido
discriminação sem causa.

### #2 — O VO2máx do relógio vs. o VO2máx real

```
Pergunta:  Corrida 2.5 #2 — que erro tem o VO2máx estimado por relógio
Valor:     ERRO TÍPICO: 3-5 ml/kg/min face a teste laboratorial com análise
           de gases (≈5-10% em termos relativos).
           VIÉS SISTEMÁTICO: o relógio SUBESTIMA, e subestima mais quanto
           melhor for o atleta.
           - Fabricante (Firstbeat/Garmin, 79 corredores, 2690 corridas):
             MAPE ~5%, erro abaixo de 3,5 ml/kg/min na maioria das medições.
             Fonte com conflito de interesses declarado.
           - Independente (Forerunner 245, Eur J Appl Physiol, 2025):
             subestimação média de −4,73 e −4,05 ml/kg/min no conjunto dos
             atletas. Moderadamente treinados: MAPE 2,8-4,1%, ICC 0,63-0,66.
             Altamente treinados: subestimação de 6,3 ml/kg/min, MAPE
             9,4-10,4%, ICC 0,34-0,41.
           - Independente (fēnix 6): MAPE 7,05%.
           - Passler et al. (2019): subestimação dentro dos 10%, mas os
             autores concluem que usar estes aparelhos como alternativa ao
             padrão-ouro é "questionável" e deve ser visto "com ceticismo".
           PORQUÊ: o algoritmo modela a relação ritmo↔FC submáxima calibrada
           em população recreativa. Um atleta muito treinado tem FC baixa
           para o ritmo que faz, e o modelo lê isso como... menos aptidão.
Condições: A estimativa só é válida se a corrida cumprir os requisitos do
           fabricante: ≥10 min ao ar livre com sinal de GPS estável e FC
           acima de 70% da FC máxima sem quebrar durante esses 10 min, com
           idade, sexo, altura e peso corretos no perfil do relógio.
           Corrida em passadeira, com paragens, em trail técnico ou com FC
           de pulso instável → valor não fiável.
           NUNCA comparar o VO2máx de dois relógios diferentes, nem de duas
           pessoas: o erro é maior do que quase todas as diferenças que se
           quereria comentar.
Fonte:     Automated Fitness Level (VO2max) Estimation with Heart Rate and
           Speed Data (Firstbeat, white paper, 2017); Validity of VO2max
           estimates from the Forerunner 245 smartwatch in highly vs.
           moderately trained endurance athletes (European Journal of Applied
           Physiology, 2025, doi 10.1007/s00421-025-05923-x); Passler et al.
           (2019), validade de fitness trackers para VO2máx; Accuracy of
           wearables for determining the maximal oxygen uptake and lactate
           threshold: a qualitative systematic review (Frontiers in Sports
           and Active Living, 2025); requisitos de medição: manuais Garmin
           Forerunner/fēnix (2024-2025)
Confiança: ALTA quanto à ordem de grandeza do erro (3-5 ml/kg/min) e ao
           sentido do viés (subestima os bem treinados) — várias fontes
           independentes convergem.
           BAIXA quanto a haver viés POR GÉNERO: encontrei indicação de que
           um estudo de 2017 com Garmin subestimava mulheres e sobrestimava
           homens, e de que o Polar V800 fazia o contrário — direções
           opostas, dependentes do aparelho. Não é base para corrigir nada.
           BAIXA quanto à diferença pulso vs. banda peitoral (3-5 contra
           5-8 ml/kg/min): só o encontrei em fontes secundárias.
```

**Para comparar: mesmo o padrão-ouro não é um ponto.** A variabilidade
combinada (biológica + técnica) do VO2máx medido em laboratório é de ±5,6%,
sendo ≥90% dela biológica e não erro de aparelho (Katch et al., MSSE, 1982).
Uma análise de 742 adultos deu um coeficiente de variação teste-reteste a 2
dias de 5,0%. Ou seja: **nem o laboratório distingue uma diferença de 2-3%.**
O relógio não tem de ser perfeito para ser útil — tem é de ser lido como
índice de tendência, nunca como número absoluto.

### #3 — VDOT e VO2máx: são a mesma coisa?

```
Pergunta:  Corrida 2.5 #3 — que relação há entre VDOT (Daniels) e VO2máx
Valor:     NÃO são a mesma coisa, e a diferença é o ponto todo.
           VO2máx = quanto oxigénio o atleta consegue consumir por minuto
           por kg. Mede-se com gases. É uma medida de CILINDRADA.
           VDOT = "pseudo-VO2máx" inferido de um DESEMPENHO real numa prova
           ou esforço máximo. Daniels & Gilbert (Oxygen Power, 1979)
           atribuíram o mesmo VDOT a atletas que corriam igual, mesmo quando
           tinham VO2máx laboratoriais diferentes — porque o tempo que se faz
           depende também da economia de corrida, da biomecânica, da gestão
           de ritmo e da tolerância ao desconforto. É uma medida de
           RENDIMENTO.
           Duas pessoas com o mesmo VO2máx medido (55) podem ter VDOT 52 e
           58. A que tem melhor economia corre mais depressa com o mesmo
           oxigénio.
           Mecânica: VO2 = −4,60 + 0,182258·v + 0,000104·v² (v em m/min);
           %VO2máx sustentável = 0,8 + 0,1894393·e^(−0,012778·t) +
           0,2989558·e^(−0,1932605·t) (t em minutos); VDOT = VO2 / %VO2máx.
           Zonas de Daniels como % do VDOT: Fácil ~70%, Maratona ~84%,
           Limiar ~88%, Intervalo ~98%, Repetição ~105%.
Condições: O VDOT exige um esforço MÁXIMO real a uma distância conhecida.
           Sem isso não existe — não se estima de um treino fácil. O VO2máx
           do relógio, esse, sai de qualquer corrida que cumpra os requisitos
           do #2, incluindo treinos.
           Para prescrever ritmos e para comparar distâncias diferentes, usa-
           se VDOT (é o que o Bloco 0 #1 e o Bloco 2.3 #4 já fazem). Para
           comparar o atleta com a população da idade e sexo dele, usa-se
           VO2máx (#1). Não se converte um no outro para efeitos de conversa
           com o atleta.
Fonte:     Jack Daniels & Jimmy Gilbert, Oxygen Power (1979); Daniels'
           Running Formula 4.ª ed. (2021)
Confiança: ALTA
```

**Consequência direta para o produto.** A app já calcula VDOT
(`getVDOTTrend` em `src/utils/biEngine.js`, fórmula Daniels-Gilbert
centralizada em `@formulas/racePrediction.ts`), já o mostra na tendência do
dashboard e já o usa como régua d'"Os Níveis" no Palmarés. **O VDOT já está
tomado.** Se o VO2máx vier a valer alguma coisa nova nesta app, tem de ser
pelo lado em que difere do VDOT: comparação com a população (#1) e evolução
de uma medida que existe mesmo em semanas sem prova nenhuma (#4) — nunca
como segunda classificação de aptidão.

### #4 — O que é uma melhoria significativa num ciclo de treino

```
Pergunta:  Corrida 2.5 #4 — quanto é ruído de medição e quanto é sinal
Ruído:     Relógio: erro típico 3-5 ml/kg/min (#2). Laboratório: ±5,6% de
           variabilidade combinada, ~5% de CV teste-reteste a 2 dias.
           Uma leitura isolada do relógio que sobe 1-2 pontos NÃO É NADA.
Sinal esperado (melhoria real, por treino bem feito num bloco de 8-12
           semanas):
Iniciante: +10 a +20% em 8-12 semanas (destreinados). Em ml/kg/min, para
           quem parte dos 30-35, isso são +3 a +7 — acima do ruído do
           relógio, logo DETETÁVEL.
Básico:    +5 a +10%. Parcialmente detetável: a margem inferior confunde-se
           com o erro.
Médio:     +2 a +5%. Em ml/kg/min tipicamente +1 a +2,5 — ABAIXO do erro do
           relógio. Não detetável numa leitura.
Avançado:  <2%, e em quem já está perto do teto pode ser 0% com ganhos reais
           de desempenho (economia, limiar). NÃO detetável, nem em
           laboratório com uma medição só.
Referências de magnitude: meta-análise de 13 ensaios controlados — HIIT
           +4,9 ml/kg/min vs. treino contínuo moderado +1,9 ml/kg/min;
           Helgerud (2007), +13% em 8 semanas com 4×4 min em destreinados.
Condições: Estes números são para VO2máx. Para MELHORIA DE DESEMPENHO, a
           régua já está registada no Bloco 1 (3-5% por bloco em básico,
           1,5-3% em médio, 0,5-1,5% em avançado, em VDOT) e é essa que se
           usa para falar com o atleta.
           LEITURA CRUZADA IMPORTANTE: a partir de médio, a melhoria REAL
           esperada num bloco (1,5-3%) é MENOR do que o erro do instrumento
           que a mediria (5-10%). É por isso que, para um atleta médio ou
           avançado, o VO2máx do relógio não consegue provar que o bloco
           correu bem — o desempenho consegue.
Fonte:     Milanović et al., Effectiveness of High-Intensity Interval
           Training and Continuous Endurance Training for VO2max
           Improvements: A Systematic Review and Meta-Analysis of Controlled
           Trials (2015); Bacon et al., VO2max Trainability and High
           Intensity Interval Training in Humans: A Meta-Analysis (PLOS ONE,
           2013); Helgerud et al. (2007); Katch et al., Biological
           variability in maximum aerobic power (MSSE, 1982)
Confiança: MÉDIA nas magnitudes de melhoria por nível (a literatura é sobre
           destreinados e treinados, não sobre os nossos quatro níveis — a
           correspondência é nossa).
           BAIXA — e é uma LACUNA ASSUMIDA — quanto à pergunta que mais
           interessava: NÃO ENCONTREI nenhum estudo que estabeleça quantos
           pontos o VO2máx de um relógio tem de subir, nem ao longo de
           quantas leituras, para que a subida seja real. A revisão
           sistemática de 2025 sobre wearables diz explicitamente que FALTAM
           estudos longitudinais a acompanhar a estabilidade dos algoritmos
           ao longo de meses ou anos. Quem construir uma regra sobre isto
           está a extrapolar do erro transversal, não a citar evidência.
```

**Regra defensável, dentro do que a evidência aguenta.** Se for preciso
afirmar que o VO2máx do relógio melhorou:

1. Nunca comparar duas leituras isoladas.
2. Comparar **medianas de janelas**: mediana das leituras válidas de 4
   semanas contra a mediana das 4 semanas anteriores (mínimo 3 leituras em
   cada, todas de corridas que cumprem os requisitos do #2).
3. Exigir uma diferença **≥3 ml/kg/min** entre medianas. É o limite inferior
   do erro típico — usar a mediana de várias leituras reduz o erro aleatório,
   mas não toca no viés sistemático, que não desaparece por se medir mais
   vezes.
4. Dizer sempre que é uma estimativa do relógio, nunca "o teu VO2máx subiu".

O ponto 3 é a parte extrapolada: não tem fonte direta. Marcar como MÉDIA-BAIXA
e rever se aparecer literatura longitudinal.

## Ressalva de método desta entrada (2026-09-22)

Mesma limitação do Bloco 2.4 #3: **o proxy de rede desta sessão bloqueou o
acesso direto às páginas dos artigos** (PubMed, PMC, Mayo Clinic Proceedings,
Frontiers, ScienceDirect, MDPI, doi.org — todos `EGRESS_BLOCKED`). Os valores
foram recolhidos por pesquisa, a partir de resumos de resultados que citam as
fontes primárias identificadas acima, e não da leitura do texto integral.

- As tabelas de percentis **não foram lidas na fonte primária**. Os valores
  do #1 são de reproduções da Tabela 4.7 do ACSM. É por isso que o #1 está
  em MÉDIA e não em ALTA, e é por isso que a regra proíbe dizer percentis.
- **Antes de pôr isto em código**, confirmar a tabela do #1 contra o ACSM's
  Guidelines 11.ª ed. em papel/PDF. É o único número deste ficheiro que
  seria mostrado ao atleta quase tal e qual.
- Nenhum número foi escrito de memória.

## O que é implementável já, e o que exige dados novos

**Implementável hoje:**

| Regra | Dados |
|---|---|
| Situar o VO2máx do relógio face à mediana da idade e sexo (#1), em linguagem de banda e só com diferença ≥5 ml/kg/min | `runs.details.vo2_max`, `profiles.birth_date`, `profiles.gender` |
| Rejeitar leituras não fiáveis (#2) | `distance_km`/`time_seconds` (≥10 min), `avg_heart_rate_bpm` vs. FC máx estimada (Tanaka, já calculada no `coach-chat`), `elevation_gain_m` para despistar trail |
| Comparação de medianas de 4 semanas com limiar de 3 ml/kg/min (#4) | histórico de `runs.details.vo2_max` — a app já guarda corrida a corrida |
| Tudo o que é VDOT (#3) | já feito: `getVDOTTrend`, `@formulas/racePrediction.ts` |
| Silenciar o tema em iniciante | Bloco 6 já proíbe o vocabulário VDOT/VO2máx a iniciantes — **esta regra mantém-se e prevalece sobre tudo o que está aqui** |

**Exige dados novos:**

- **Saber que relógio é** (não temos campo): o viés depende do aparelho e do
  facto de a FC ser de pulso ou de banda peitoral. Sem isso, a margem de
  segurança tem de ser a do pior caso.
- **Saber se a FC veio de banda peitoral**: mudaria o erro esperado de ~5-8
  para ~3-5 ml/kg/min. Seria um checkbox no registo, mas a evidência que o
  sustenta é secundária (#2, Confiança BAIXA) — não vale a pena o campo
  enquanto for só isso.
- **VO2máx medido em laboratório** (um campo no Perfil): permitiria calibrar
  o desvio do relógio do próprio atleta e transformar uma estimativa enviesada
  numa série útil. É o melhor retorno por esforço, mas exige um teste real que
  a maioria das pessoas nunca fará.
- **Economia de corrida**: é o que explica a diferença entre VO2máx e VDOT
  (#3) e não se estima de um print de relógio.
