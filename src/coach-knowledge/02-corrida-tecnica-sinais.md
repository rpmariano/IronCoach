# Bloco 2.4 — Corrida: técnica e sinais de alerta

> Fonte: [specs/coach-investigacao.md](../../specs/coach-investigacao.md), secção "Corrida 2.4 — Técnica e sinais de alerta (registo)".
> Este ficheiro é gerado a partir das respostas já registadas e verificadas nessa investigação — não reabre nem reavalia as decisões, só as torna consultáveis por pergunta.

Duas perguntas da investigação original (#1 e #2), confiança ALTA nas duas.
Mas é o registo com maior distância entre o que a literatura sabe e o que a
app consegue medir — ver avaliação de implementabilidade abaixo.

**Acrescentada em 2026-09-22 a pergunta #3** — a régua da cadência por
velocidade, estatura, idade e género. Não vem de `specs/coach-investigacao.md`:
é investigação nova, pedida pelo atleta depois de o #1 ter ficado só pelo
"é individual". Não revoga nada do #1; dá-lhe a régua que lhe faltava.

## Perguntas

### #1 — Cadência: faixa-alvo ou individual?

```
Pergunta:  Corrida 2.4 #1 — existe faixa defensável ou é individual?
Valor:     INDIVIDUAL — depende de estatura/comprimento dos membros, massa
           corporal, velocidade e nível de treino. O mito dos "180 spm para
           todos" é rejeitado pela biomecânica moderna.
           MAS existem dois números defensáveis:
           - Faixa fisiológica funcional: 160-180 spm em ritmo aeróbico.
           - Sinal vermelho: cadência cronicamente <155 spm associa-se a
             sobrepassada (overstriding) e a +15-20% de força de impacto
             no joelho e anca.
           Correção, quando indicada: aumentar +5-10% sobre a cadência
           autosselecionada do próprio corredor — nunca impor um valor
           absoluto.
Condições: Para corrida contínua aeróbica (Z1-Z3). A cadência sobe
           naturalmente com a velocidade — 180-200+ spm em ritmos de Z4/Z5
           é normal, não é sinal de nada.
Fonte:     Effects of Step Rate Manipulation on Foot Strike Mechanics
           (Heiderscheit, MSSE 2011); Daniels' Running Formula 4th Ed
           (2021); Is There a Pathomechanical Association Between Running
           Kinematics and Lower Limb Injuries? (Bramah, AJSM 2018);
           Influence of step rate in biomechanics of running (Schubert, 2014)
Confiança: ALTA
```

**Resolve a pergunta original de forma acionável.** A pergunta era "existe
faixa alvo ou é individual — se for individual, dizê-lo para o coach não
recomendar um número universal". A resposta é as duas coisas: é individual
(logo, **nunca recomendar 180 spm**), mas o piso de 155 spm é um sinal real
e verificável. Implementável já: `runs.details.cadence_spm` existe.

**Regra de doutrina proposta**: comentar cadência apenas quando <155 spm
sustentado, e mesmo aí sugerir "+5-10% sobre a tua cadência atual", nunca um
valor absoluto. Fora disso, não comentar — é ruído.

### #2 — Sinais mensuráveis que precedem lesão por sobreuso

```
Pergunta:  Corrida 2.4 #2 — que sinais precedem lesão por sobreuso
Valor:     1. FC em repouso (FCR): +≥5-7 bpm acima da média móvel de 7-14
              dias, mantido ≥2-3 dias consecutivos.
           2. HRV (rMSSD): queda >1,5 desvios-padrão abaixo da média basal
              de 7 dias, ≥2-3 dias consecutivos.
           3. Degradação de cadência intra-sessão: queda >3-5% (ou >5 spm)
              entre a 1ª e a 2ª metade da mesma corrida, em plano, a ritmo
              e FC constantes.
           4. Deriva cardíaca / discrepância RPE-ritmo: FC +5-8% a ritmo
              constante, OU +≥2 pontos Borg CR10 para o mesmo pace, ≥2
              sessões consecutivas.
           5. Assimetria de tempo de contacto com o solo (GCT balance):
              desvio E/D >2,5-3,0% (pior que 51,5/48,5) em piso plano.
Condições: Em condições normais de saúde e temperatura. Alteração isolada
           num único dia (desidratação, álcool, jet lag, calor) NÃO
           confirma sobreuso.
Fonte:     ECSS/ACSM Consensus on overtraining (Meeusen, 2013); Training
           adaptation and heart rate variability in elite endurance
           athletes (Plews, 2013); Is There a Standardized Footstrike
           Pattern and Cadence for Optimal Running Economy? (Moore, Sports
           Med 2016); Monitoring training (Foster, 1998); Firstbeat/Garmin
           Biomechanical Metrics Standard (2023)
Confiança: ALTA
```

⚠️ **Avaliação de implementabilidade: 1 de 5 sinais é detetável hoje.**

| Sinal | Detetável? | Porquê |
|---|---|---|
| 1. FC em repouso | ❌ | Não capturamos FC de repouso em lado nenhum. **Mesma lacuna já identificada em 2.2 #4** (Karvonen precisa dela) — dois usos independentes a pedir o mesmo campo. |
| 2. HRV (rMSSD) | ❌ | Não capturado, e não aparece em prints de corrida — viria de app de wearable (Garmin Connect, Whoop), não de um screenshot de treino. |
| 3. Degradação de cadência intra-sessão | ❌ | Só temos `cadence_spm` **média** da corrida inteira. Os splits guardam apenas `distance_km` e `time_seconds` — sem cadência nem FC por troço, não dá para comparar 1ª vs. 2ª metade. |
| 4. Deriva cardíaca / RPE-ritmo | ⚠️ metade | A deriva cardíaca precisa de FC ao longo do tempo (só temos média) — **não detetável**. A parte RPE-vs-ritmo **é** detetável e já está registada em 2.2 #5, com os mesmos limiares. |
| 5. Assimetria GCT | ❌ | Não capturado. Métrica de relógio topo de gama, raramente visível num print. |

**Consequência para o produto**: a flag `risco_lesao` — que identifiquei como
"o alerta de maior valor para o utilizador" quando escrevi esta pergunta — é
hoje largamente **não implementável** como a literatura a descreve. O que
sobra é a metade RPE/ritmo (já coberta) e o piso de cadência de #1.

**Três caminhos possíveis, nenhum decidido aqui**:
1. **Aceitar a cobertura parcial** — implementar só o que dá (RPE/ritmo +
   cadência <155), e assumir que a deteção de lesão é fraca por agora.
2. **Capturar FC de repouso** — um campo no Perfil ou um registo diário
   rápido. Desbloqueia o sinal #1 *e* a fórmula de Karvonen (2.2 #4). É o
   melhor retorno por esforço dos três.
3. **Integração com wearable** (Garmin Connect/Strava API) em vez de prints
   — desbloquearia #2, #3 e #5 de uma vez, mas é um projeto próprio, muito
   maior do que acrescentar um campo.

### #3 — A régua da cadência: velocidade, estatura, idade e género

> **Investigação nova, 2026-09-22** — não vem de `specs/coach-investigacao.md`.
> Fica aqui, e não num bloco novo, porque é a **mesma pergunta do #1 levada
> mais longe**: o #1 respondeu "é individual, nunca dizer 180" e parou aí; o
> atleta contestou, com razão, que dizer "é individual" não é o mesmo que
> dizer "não há régua nenhuma". Separá-las em ficheiros diferentes era
> garantir que alguém lia uma sem a outra.

```
Pergunta:  Corrida 2.4 #3 — que régua defensável existe para a cadência, e
           de que é que ela depende (velocidade, estatura, nível, idade,
           género)
Régua base: cadência esperada (spm) ≈ 150 + 6,0 × v (m/s), com dispersão
           individual de ±8 spm (1 desvio-padrão).
           Deriva de van Oeveren (2017): SF = 75,01 + 3,006 × V em
           passadas/min, que a 2 passos por passada dá 150,0 + 6,01 × v.
           Validada contra observação independente: 164 spm de média em 860
           corredores recreativos à velocidade preferida (Malisoux, 2023);
           165 ± 8 spm a 3,04 m/s (de Ruiter, 2019); 169,2 spm a 2,68 m/s a
           subir até 177,9 spm a 3,83 m/s em corredores experientes
           (IJSPT, 2025).
Iniciante: ritmo aeróbico típico 7:30-8:30 min/km (1,96-2,22 m/s) →
           esperado ~162 spm, banda normal 154-170 spm
Básico:    6:30-7:30 min/km (2,22-2,56 m/s) → esperado ~164 spm, banda
           156-172 spm
Médio:     5:30-6:30 min/km (2,56-3,03 m/s) → esperado ~166-168 spm, banda
           158-176 spm
Avançado:  4:30-5:30 min/km (3,03-3,70 m/s) → esperado ~168-172 spm, banda
           160-180 spm
Correção de estatura: −0,7 spm por cada cm ACIMA de 175 cm, +0,7 spm por
           cada cm abaixo (ver conflito de fontes mais abaixo).
Idade:     SEM correção. Ver #3.2.
Género:    SEM correção. Ver #3.3.
Condições: Para corrida contínua em plano, Z1-Z3, com a velocidade média da
           sessão. NÃO se aplica a: intervalos (a cadência da média mistura
           esforço e recuperação e não quer dizer nada), trail/subida
           (a cadência sobe na subida sem que a mecânica seja pior), e
           qualquer sessão em que só exista `cadence_spm` médio de uma
           corrida com variação grande de ritmo.
           As bandas por nível SOBREPÕEM-SE quase todas de propósito: o
           nível quase não determina a cadência — determina a velocidade, e
           é a velocidade que puxa a cadência. Em 256 corredores com 16 128 h
           de dados de relógio, experiência, desempenho e historial de lesão
           NÃO estavam relacionados com a frequência de passada (van Oeveren,
           2019).
Fonte:     Optimal stride frequencies in running at different speeds
           (van Oeveren, de Ruiter, Beek & van Dieën, PLOS ONE, 2017);
           Individual optimal step frequency during outdoor running
           (de Ruiter et al., European Journal of Sport Science, 2019);
           Reference Values and Determinants of Spatiotemporal and Kinetic
           Variables in Recreational Runners (Malisoux, Napier, Gette,
           Delattre & Theisen, Orthopaedic Journal of Sports Medicine, 2023 —
           860 corredores, valores de referência por sexo e por velocidade
           de 7 a 15 km/h); The Effect of Running Speed on Cadence and
           Running Kinetics (International Journal of Sports Physical
           Therapy, 2025); Inter-individual differences in stride frequencies
           during running obtained from wearable data (van Oeveren et al.,
           Journal of Sports Sciences, 2019)
Confiança: MÉDIA-ALTA na régua por velocidade (três fontes independentes
           convergem dentro de poucos spm). MÉDIA na correção de estatura
           (fontes em conflito, ver abaixo). Ver as ressalvas de método no
           fim deste bloco.
```

#### #3.1 — A origem real dos "180 spm", e o que ela não autoriza

O número não vem de um estudo. Vem de **Jack Daniels a contar passos na
bancada dos Jogos Olímpicos de Los Angeles, em 1984**: dos 46 fundistas de
elite que observou (em prova, a ritmo de competição), só um corria abaixo de
180 spm — 176. Daniels acrescentou que, em 20 anos a treinar universitários,
nunca tinha visto um principiante acima de 180.

Ou seja: era o **mínimo observado num grupo de elite, em prova**. Passou a
circular como se fosse o **alvo de toda a gente, em treino**. É uma norma
descritiva de uma população extrema transformada em prescrição universal —
exatamente o erro que a doutrina proíbe no Bloco 6 (não confundir o que é
típico com o que se deve procurar).

**Consequência prática, que confirma e não revoga a regra do #1**: continua
proibido dizer "180 spm" a um atleta. O que o #3 acrescenta é que também não
é honesto dizer "não há régua" — há, e é a de cima: ela depende da
velocidade a que se corre e da estatura de quem corre, não de um número
gravado em 1984.

```
Fonte:     Daniels' Running Formula 4th Ed (Jack Daniels, 2021), relato da
           observação de 1984 (46 atletas, 1 abaixo de 180 spm, a 176)
Confiança: ALTA quanto à origem; ALTA quanto a não ser generalizável.
```

#### #3.2 — Idade: sem correção na régua

```
Pergunta:  Corrida 2.4 #3.2 — a cadência esperada muda com a idade?
Valor:     À MESMA velocidade absoluta, corredores mais velhos tendem a
           correr com cadência mais alta e passada mais curta que os mais
           novos — é compensação de potência muscular perdida, não melhor
           técnica.
           MAS ao MESMO esforço relativo (ex.: 30 min a 70% do VO2máx), a
           frequência de passada de veteranos e jovens é SEMELHANTE; o que
           difere é o comprimento da passada, o ângulo do joelho no contacto
           e a rigidez do joelho.
Decisão:   NÃO aplicar correção de idade à régua. Como a régua já é indexada
           à VELOCIDADE (e um atleta mais velho corre o seu Z2 mais devagar),
           o efeito da idade entra por essa porta e corrigi-lo outra vez
           seria contá-lo duas vezes.
Condições: Não encontrei tabela normativa de cadência por escalão etário
           para corredores recreativos — só comparações entre grupos
           (jovens vs. masters). Se alguém quiser uma banda "para os 50
           anos", a resposta honesta é que ela não existe publicada.
Fonte:     Spatiotemporal and kinematic adjustments in master runners may be
           associated with the relative physiological effort during running
           (2023); revisão de biomecânica do envelhecimento na corrida
           (Run3D, síntese de literatura)
Confiança: MÉDIA — a direção do efeito está bem estabelecida; a ausência de
           uma norma por escalão etário é uma LACUNA, não um resultado.
```

#### #3.3 — Género: sem correção, e a razão importa

```
Pergunta:  Corrida 2.4 #3.3 — há diferença de cadência entre homens e
           mulheres que justifique réguas separadas?
Valor:     NÃO, à mesma velocidade de corrida. Em corredores adultos medidos
           com IMU a velocidades emparelhadas, a frequência de passo foi
           SEMELHANTE entre sexos — o que difere nos homens é o comprimento
           da passada, o tempo de voo e o ângulo de passada; nas mulheres, o
           tempo de contacto.
           Onde aparecem diferenças brutas (sobretudo na marcha: 100,8 vs.
           94,4 passos/min), elas são explicadas pelo COMPRIMENTO DO MEMBRO
           INFERIOR, não pelo sexo: normalizando para a altura ou para o
           comprimento de perna, a diferença desaparece em larga medida.
           Confirmação por duas vias independentes:
           - Em 138 jovens fundistas, os modelos de regressão da cadência
             ficam-se por comprimento de perna + velocidade; o sexo não
             entra como preditor (os modelos separados por sexo têm
             coeficientes quase iguais: −1,251 vs. −1,190 spm por cm de
             perna).
           - Em ultramaratonistas de elite, a frequência de passo associa-se
             à ESTATURA (−123,1 spm por metro) e NÃO ao sexo, peso, idade ou
             anos de experiência.
Decisão:   Nenhum termo de género na régua. O que a régua usa é ALTURA, que
           é a variável fisiológica real e que a app já tem
           (`profiles.height_cm`). Uma régua com termo de género estaria a
           penalizar ou a desculpar alguém por uma coisa que, medida a
           direito, é comprimento de perna.
Fonte:     Sex Differences in Speed-Related Running Mechanics Using IMU in
           Runners (2026); Cadence in youth long-distance runners is
           predicted by leg length and running speed (Taylor-Haas, Garcia,
           Rauh, Peel, Paterno, Bazett-Jones & Long, Journal of Science and
           Medicine in Sport, 2022); Step frequency patterns of elite
           ultramarathon runners during a 100-km road race (Journal of
           Applied Physiology, 2018); Faster stepping cadence partially
           explains the higher metabolic cost of walking among females versus
           males (Journal of Applied Physiology, 2024)
Confiança: MÉDIA-ALTA
```

**Conflito de fontes na correção de estatura — resolvido pelo mais
conservador.** As duas fontes que quantificam o efeito não dão o mesmo
declive:

| Fonte | Variável | Declive | Convertido para cm de ESTATURA |
|---|---|---|---|
| Taylor-Haas (2022), 138 jovens fundistas | comprimento de perna | −1,25 spm/cm | ≈ **−0,66 spm/cm** (perna ≈ 53% da estatura) |
| Ultramaratonistas de elite (J Appl Physiol, 2018) | estatura | −1,23 spm/cm | **−1,23 spm/cm** |

Quase o dobro de diferença. Seguindo a regra da casa (Bloco 0 #2, Bloco 2.3
#2: em conflito, escolhe-se o valor mais conservador), a doutrina adota
**−0,7 spm/cm**, o declive mais pequeno — porque é o que dá MENOS desconto a
um corredor alto e portanto o que menos arrisca desculpar uma cadência
genuinamente baixa. O ponto de referência de 175 cm é convenção nossa, não
das fontes: nenhuma publica a estatura-âncora da sua equação. Se o efeito
verdadeiro for o maior dos dois, estamos a exigir de mais a quem é alto —
erro no sentido seguro, mas erro à mesma. **Não usar esta correção para
elogiar nem para repreender; usar só para decidir se vale a pena falar do
assunto.**

#### #3.4 — Cadência e lesão: o que a evidência sustenta

```
Pergunta:  Corrida 2.4 #3.4 — aumentar a cadência reduz carga e lesão?
Valor:     CARGA (mecânica, bem estabelecido): subir a cadência +5% sobre a
           autosselecionada reduz ~20% a energia absorvida no JOELHO; +10%
           reduz ~34% no joelho e também reduz na anca. Baixar 10% aumenta a
           absorção em todas as articulações. Sobem também: menos
           comprimento de passada, menos oscilação vertical do centro de
           massa, menos impulso de travagem, menos adução da anca.
     ASSOCIAÇÃO COM LESÃO (prospetiva, mais fraca): cadência mais baixa
           previu síndrome de stress tibial medial e dor anterior do joelho
           em 68 corredores de secundário seguidos durante uma época
           (Luedke, 2016). Em >800 corredores recreativos seguidos num ensaio
           aleatorizado (Malisoux, AJSM 2022) as características
           espácio-temporais e de força de reação ao solo foram analisadas
           como fatores de risco — sobrepassada e cadência baixa aparecem
           associadas a mais carga, mas a força da associação com lesão é
           modesta e depende do tipo de lesão e da definição usada.
     TRATAMENTO (evidência de melhor qualidade que a de prevenção): um
           ensaio aleatorizado mostrou melhoria de dor femoropatelar com
           aumento de 7,5-10% da cadência, mantida a 6 meses.
Condições: A intervenção é sempre RELATIVA (+5 a +10% sobre a cadência
           própria) e progressiva. Não há evidência de que impor um valor
           absoluto a um corredor sem sintomas previna lesão; o que há é
           redução de carga articular e melhoria de sintomas em quem já tem
           dor.
Fonte:     Effects of Step Rate Manipulation on Joint Mechanics during
           Running (Heiderscheit, Chumanov et al., Medicine & Science in
           Sports & Exercise, 2011 — 45 corredores, ±5% e ±10%); Influence
           of Step Rate on Shin Injury and Anterior Knee Pain in High School
           Runners (Luedke et al., MSSE, 2016); Spatiotemporal and
           Ground-Reaction Force Characteristics as Risk Factors for
           Running-Related Injury (Malisoux, Gette, Delattre, Urhausen &
           Theisen, American Journal of Sports Medicine, 2022); The Influence
           of Running Cadence on Biomechanics and Injury Prevention: A
           Systematic Review (Cureus, 2025)
Confiança: ALTA na redução de carga articular; MÉDIA na prevenção de lesão
           em corredores assintomáticos (não há ensaio que o demonstre).
```

#### Ressalva de método desta entrada (2026-09-22)

A investigação foi feita **só com pesquisa web**: o proxy de rede desta
sessão bloqueou o acesso direto às páginas dos artigos (PubMed, PMC,
ScienceDirect, journals.physiology.org, MDPI, Frontiers, Mayo Clinic
Proceedings e outros deram `EGRESS_BLOCKED`). Os números acima vêm de
resumos de resultados de pesquisa de fontes primárias identificadas, não da
leitura do texto integral. Consequências assumidas:

- Os **valores centrais** (equação de van Oeveren, médias de Malisoux e de
  Ruiter, percentagens de Heiderscheit, coeficientes de Taylor-Haas) foram
  confirmados por mais do que uma pesquisa independente — é por isso que a
  confiança é MÉDIA-ALTA e não BAIXA.
- Os **desvios-padrão, intervalos de confiança e tabelas completas por
  velocidade e sexo de Malisoux (2023)** não foram lidos. Quem quiser afinar
  as bandas acima deve ir buscar essa tabela: é a melhor referência
  publicada para corredores recreativos e substituiria com vantagem a
  aproximação ±8 spm.
- Nenhum número foi escrito de memória.

#### O que é implementável já, e o que exige dados novos

**Implementável hoje**, com `runs.details.cadence_spm`, `distance_km`,
`time_seconds` (dá a velocidade média) e `profiles.height_cm`:

```
esperado_spm = 150 + 6,0 × v_média_m_s − 0,7 × (height_cm − 175)
desvio       = cadence_spm − esperado_spm
```

- `desvio ≥ −8 spm` → normal, **não comentar** (mantém-se a regra do #1: fora
  do sinal vermelho, falar de cadência é ruído).
- `desvio < −8 spm` de forma **sustentada** (≥3 corridas contínuas em plano
  nos últimos 30 dias) → é o caso em que vale a pena sugerir +5-10% sobre a
  cadência própria.
- `cadence_spm < 155` sustentado → sinal vermelho do #1, mantém-se tal e
  qual, independentemente do desvio.
- `height_cm` em falta → usar a régua sem o termo de estatura e **descer a
  exigência**: só comentar abaixo dos 155 spm.

**Exige dados novos:**

- **Comprimento de perna** (não existe no perfil): é a variável real; a
  altura é o seu substituto. Um campo opcional no Perfil resolveria o
  conflito de declives da tabela acima.
- **Cadência por troço/split** (`splits` só guarda `distance_km` e
  `time_seconds`): sem ela não há #2.3 (degradação intra-sessão) nem forma de
  excluir da média os troços de subida.
- **Desnível negativo e declive por troço**: a régua não se aplica em subida,
  e hoje não conseguimos excluir automaticamente uma corrida de trail —
  só sabemos o `elevation_gain_m` total.
- **`max_cadence_spm`** existe mas **não serve para esta régua**: é um pico
  instantâneo (tipicamente de um sprint ou de uma descida) e não tem norma
  publicada. Não usar.
