# Questionário de Investigação — Doutrina dos Coaches (IronHealth)

Documento de trabalho para a fase de revisão de literatura (NotebookLM).
Cada pergunta aqui **exige uma resposta numérica ou uma regra de decisão** — não
prosa. Uma resposta do tipo *"o aumento deve ser gradual"* é uma não-resposta:
o código não a consegue avaliar.

O output desta fase alimenta os ficheiros de doutrina em `src/coach-knowledge/`.
Este documento fica em `specs/` porque é instrumento de investigação e registo
de proveniência — não é carregado em runtime.

## O eixo que atravessa tudo: o nível do praticante

O objetivo é servir um corredor **iniciante, básico, médio ou avançado** com o
que ele precisa para treinar rumo ao objetivo a que se propôs. Quase nenhuma
resposta é única: o limiar que protege um iniciante trava um avançado, e o que
faz progredir um avançado lesiona um iniciante.

Por isso, **toda a pergunta marcada com 📊 exige quatro respostas**, uma por
nível. Se a literatura não diferenciar, dizê-lo explicitamente — é informação
útil, não uma falha.

As perguntas sem marca têm resposta única (limiares de segurança, fisiologia
que não varia com treino, propriedades de medição).

**Duas colunas alimentam "nível", não uma** — ambas de preenchimento do
próprio atleta, nenhuma computada a partir do histórico:

- `profiles.experience_level` — nível **geral**, no Perfil. Alimenta os blocos
  sobre treino corrente (2.1, 2.2, 2.4, 3, 4, 5, 6).
- `race_events.experience_level` — nível **autodeclarado por prova**, na
  Agenda. Alimenta os blocos sobre um objetivo concreto (1, 2.3). Existe
  precisamente para o caso em que o geral não serve: um avançado em estrada
  pode marcar-se iniciante na sua primeira prova de trail.

A literatura não precisa de saber desta distinção — "o que um iniciante
precisa antes do taper" é a mesma resposta seja o nível geral ou o da prova.
A distinção importa só do lado do código, e está registada aqui para isso.

---

## ⚠️ Antes de começar: lacunas de dados

Estado a 2026-08-07, verificado contra a base de dados de produção — não contra
`supabase_schema.sql`, que na altura divergia da realidade e gerou conclusões
erradas numa primeira versão deste documento.

### Já resolvidas

Cobertas pela migração `20260807120000_coach_data_model.sql`, já aplicada:

| Campo | Onde | Desbloqueia |
|---|---|---|
| `profiles.birth_date` | Guardamos a data, não a idade — a idade deriva-se em runtime | Zonas de FC, necessidades ajustadas à idade |
| `race_events.distance_km` | **NOT NULL** — decisão de produto | Ritmo-alvo, taper, viabilidade do objetivo |
| `race_events.target_time_seconds` | Objetivo de tempo total | Comparação com o histórico |
| `race_events.target_pace_seconds_per_km` | Objetivo de ritmo | Idem — os dados reais tinham ambas as semânticas misturadas num campo de texto |

Cobertas pela migração `20260809000000_experience_level.sql`, já aplicada:

| Campo | Onde | Desbloqueia |
|---|---|---|
| `profiles.experience_level` | Nível GERAL do atleta — iniciante/básico/médio/avançado. Editável no Perfil; futuramente sugerível a partir do onboarding | Bloco 0 — vocabulário e limiares que valem para qualquer treino, não ligados a uma prova |
| `race_events.experience_level` | Nível AUTODECLARADO do atleta **para aquela prova**, preenchido por ele ao criar/editar a prova. Não herda do nível geral | Bloco 1 e 2.3 — resolve o caso de um avançado em estrada que é iniciante na primeira prova de trail, sem precisar de um classificador automático por disciplina |

### Que já existiam (e eu tinha dado por ausentes)

| Campo | Onde |
|---|---|
| RPE do ginásio | `workout_sessions.exertion` (smallint 1-10), equivalente a `runs.effort_rpe` |
| Grupo muscular | `workout_sessions.categories` (text[]) — `Peito`, `Costas`, `Pernas`, `Ombros`, `Bíceps`, `Tríceps`, `Glúteos`… Ao nível da sessão, não do exercício |
| Métricas de sessão | `workout_sessions` tem `duration_seconds`, `calories_kcal`, `avg_hr`, `max_hr` |

### Ainda em aberto

| Lacuna | Onde | O que bloqueia |
|---|---|---|
| **Histórico de lesões** | Não existe | Ajuste de limiares a quem já se lesionou; contraindicações |
| **Hora real da refeição** | `meals.meal_type` é um slot (`almoco`, `lanche`…), não um timestamp | Nutrição peri-treino com precisão horária |
| **Grupo muscular por exercício** | `categories` é da sessão inteira; `workout_session_sets.exercise_name` continua texto livre | Volume por grupo com precisão de exercício — mas o nível de sessão pode chegar |

> Nota: `runs.details` (jsonb) já guarda `elevation_gain_m`, `cadence_spm`,
> `avg_heart_rate_bpm`, `max_heart_rate_bpm`, `vo2_max` e `hr_zones` extraídos
> dos prints. Disponíveis, mas só quando o print os mostra — qualquer limiar que
> dependa deles precisa de um caminho alternativo para quando faltarem.

---

# BLOCO 0 — O que define cada nível

**Responder a este bloco primeiro.** As respostas 📊 dos blocos seguintes
pressupõem que "iniciante", "básico", "médio" e "avançado" significam a mesma
coisa em todo o lado — este bloco fixa esse vocabulário.

O nível **não é computado automaticamente a partir do histórico.** São dois
campos de preenchimento do próprio atleta: um nível geral no Perfil (editável
a qualquer momento, e pensado para vir sugerido pelo onboarding) e um nível
autodeclarado por cada prova na Agenda — este último resolve sozinho o caso de
alguém avançado em estrada e iniciante na primeira prova de trail, sem
precisar de um classificador por disciplina.

**Estas perguntas alimentam dois sítios, não um.** O onboarding é só o mais
visível — decide que perguntas fazer para o campo `experience_level` ficar bem
preenchido. O mais importante é o segundo: os critérios daqui vão escritos por
extenso no topo de cada ficheiro de `src/coach-knowledge/`, como a definição
operacional de "avançado" que todo o resto da doutrina pressupõe. É isso que
garante que uma recomendação de hoje e uma de amanhã tratam "avançado" da
mesma forma — sem esta definição fixada em texto versionado, o modelo aplica
o critério dele em cada chamada, que pode variar de chamada para chamada e
entre versões do modelo. Ver 3.6.2 do PRD sobre onde a doutrina vive e porquê.

1. **Que critérios objetivos separam iniciante / básico / médio / avançado?**
   Dar os cortes em números: volume semanal (km), corrida mais longa já feita,
   frequência semanal, anos de prática continuada, ritmo de referência a uma
   distância. Não "corre com regularidade".
   → alimenta: as perguntas do onboarding e a descrição de cada nível no ecrã
   de Perfil

2. **Quando esses critérios se contradizem, qual pesa mais?**
   Alguém com 4 anos de histórico mas 15 km/semana é básico ou médio? Alguém
   que corre 60 km/semana há 8 meses? O onboarding precisa de uma regra de
   desempate para sugerir um nível a partir das respostas.
   → alimenta: lógica de sugestão do onboarding

3. **Que perguntas diretas são mais preditivas do nível real de um corredor?**
   As que valham a pena fazer num onboarding curto — sem exigir histórico de
   treino nenhum, porque um utilizador novo não o tem.
   → alimenta: desenho do questionário de onboarding

---

# BLOCO 1 — Objetivo e viabilidade

O propósito da app é levar o utilizador ao objetivo agendado. Antes de treinar,
o coach tem de saber se o objetivo é possível — e dizê-lo. O nível aqui é o
**da prova** (`race_events.experience_level`), autodeclarado pelo atleta para
aquele objetivo específico — não o nível geral do perfil.

1. 📊 **Tempo mínimo de preparação por distância.**
   Semanas necessárias para 5k / 10k / meia / maratona / ultra, partindo de cada
   nível. É a resposta que permite dizer *"esta maratona daqui a 10 semanas não é
   viável a partir de onde estás"*.
   → alimenta: flag `objetivo_inviavel`, o aviso mais valioso do coach

2. 📊 **Volume semanal mínimo antes de tentar cada distância.**
   Km/semana sustentados e por quantas semanas, como pré-requisito para inscrever
   cada distância.
   → alimenta: flag `base_insuficiente`

3. 📊 **Ritmo de melhoria realista por nível.**
   Quanto se pode melhorar em % ou min/km, por bloco de treino. Um iniciante
   melhora rápido, um avançado ganha segundos. Serve para o coach não prometer o
   impossível nem subvalorizar o possível.
   → alimenta: avaliação de `target_time_seconds` face ao histórico

4. **Como distinguir objetivo ambicioso de objetivo irrealista?**
   Precisa de um corte: acima de que desvio face à projeção do histórico é que o
   coach passa de "é exigente" para "não é seguro".
   → alimenta: linguagem do aviso, não só a flag

5. 📊 **Qual a progressão natural de distâncias?**
   Deve um iniciante fazer 5k antes de 10k, 10k antes de meia? Quantas semanas
   ou provas em cada degrau?
   → alimenta: recomendação proativa de objetivo seguinte

6. **Quantos objetivos em simultâneo são compatíveis?**
   Perder gordura e melhorar tempo ao mesmo tempo — em que condições, e a partir
   de que ponto se excluem.
   → alimenta: **arbitragem do head coach** (Bloco 6)

---

# BLOCO 2 — Corrida

Campos: `distance_km`, `duration_seconds`, `training_type` (contínuo, longo,
tempo, recuperação, fartlek, intervalos, subidas, trail, técnico), `effort_rpe`
(1-10), `split_5k/10k/21k_seconds`, `kind` (treino/competição),
`details.elevation_gain_m`, `details.cadence_spm`, `details.avg_heart_rate_bpm`,
`details.hr_zones`, `details.vo2_max`. Da prova: `race_events.date`,
`race_type`, `distance_km`, `target_time_seconds`,
`target_pace_seconds_per_km`. Do perfil: `birth_date`.

## 2.1 Carga e progressão

1. 📊 **Aumento máximo de volume semanal antes de o risco de lesão subir.**
   Percentagem e janela de comparação (semana anterior? média de 4 semanas?).
   Existe métrica de rácio agudo:crónico com faixa segura definida? Quais os
   limites, e se a faixa é a mesma em todos os níveis.
   → alimenta: flag `sobrecarga`

2. 📊 **Frequência semanal mínima e ótima.**
   Quantos dias por semana para progredir, por nível. E o mínimo abaixo do qual
   não há adaptação, só desgaste.
   → alimenta: flag `frequencia_insuficiente`

3. 📊 **Semanas de descarga: com que periodicidade e que redução?**
   A cada quantas semanas de carga, e corte de quantos %.
   → alimenta: gatilho proativo de descarga

4. 📊 **Volume máximo que o treino longo deve representar da semana.**
   % do volume semanal, e se há teto absoluto em km ou em tempo.
   → alimenta: flag `longao_desproporcionado`

5. 📊 **Regresso após interrupção: quanto reduzir por semanas parado?**
   Tabela: após 1, 2, 4, 8+ semanas sem correr, retomar a que % do volume
   anterior, e em quanto tempo voltar ao ponto de partida.
   → alimenta: flag `regresso_de_pausa`

## 2.2 Intensidade

6. 📊 **Distribuição de intensidade recomendada.**
   % do volume semanal em baixa vs alta intensidade, por nível — e como
   classificar cada `training_type` nessas categorias. Verificar se a
   recomendação polarizada se aplica a iniciantes ou pressupõe base construída.
   → alimenta: flag `distribuicao_intensidade`

7. 📊 **A partir de que ponto se introduz trabalho de qualidade?**
   Intervalos, tempo e subidas não servem um iniciante. Qual o pré-requisito de
   volume/semanas antes de cada tipo entrar no plano.
   → alimenta: filtro de recomendações por nível — impede o coach de sugerir
   séries a quem ainda não corre 20 minutos seguidos

8. **Método caminhada/corrida para iniciantes: quais os rácios e a progressão?**
   Se é a abordagem recomendada para quem começa, precisa dos intervalos
   concretos e do critério para passar a corrida contínua.
   → alimenta: doutrina do nível iniciante

9. **Zonas de FC: que fórmula usar?**
   A idade já está disponível (`birth_date`). Falta decidir a fórmula, e se vale
   mais usar as `hr_zones` que o próprio relógio reporta — se o utilizador fez
   teste de esforço, essas batem melhor que qualquer fórmula.
   → alimenta: cálculo de zonas, flag `zona_errada`

10. **Que discrepância entre RPE e pace constitui sinal de fadiga acionável?**
    Ex.: RPE ≥ N com pace ≥ X% acima da média recente. Precisa de limiar concreto.
    → alimenta: flag `fadiga`

## 2.3 Prova

11. 📊 **Taper: quantos dias antes, e que redução?**
    Por distância (10k / meia / maratona / ultra / trail) e por nível. % de corte
    de volume e o que acontece à intensidade.
    → alimenta: gatilho proativo pré-prova

12. 📊 **Dias de recuperação após esforço máximo, por distância.**
    Após 10k em competição, meia, maratona, ultra — e quanto o nível altera isso.
    → alimenta: gatilho pós-prova, flag `recuperacao_insuficiente`

13. **Trail: fator de conversão entre desnível acumulado e distância plana.**
    Quantos metros de D+ equivalem a 1 km plano em custo fisiológico. Se variar
    com o declive, dar a tabela.
    → alimenta: cálculo de carga em trail — hoje 10 km de trail contam como
    10 km, o que subestima a carga

14. **Ritmo-alvo: como derivá-lo do histórico para uma distância nunca feita?**
    Existe relação defensável entre tempo a uma distância e previsão noutra?
    → alimenta: viabilidade do `target_time_seconds`, sugestão de alvo

## 2.4 Técnica e sinais

15. **Cadência: existe faixa alvo defensável, ou é individual?**
    Se for individual, dizê-lo explicitamente — para o coach não comentar
    cadência com base num número universal que não existe.
    → alimenta: decidir se a cadência é sequer comentável

16. **Que sinais nos dados precedem uma lesão por sobreuso?**
    Combinações observáveis com os campos existentes: subida de FC em repouso,
    queda de cadência ao longo da corrida, RPE a subir com pace constante.
    → alimenta: flag `risco_lesao` — o alerta de maior valor para o utilizador

---

# BLOCO 3 — Ginásio ao serviço da corrida

Campos: por série `exercise_name` (texto livre), `reps`, `weight`, `set_index`;
por sessão `categories` (grupos musculares / tipo de aula), `kind`
(`forca`/`aula`), `exertion` (RPE 1-10), `duration_seconds`, `calories_kcal`,
`avg_hr`, `max_hr`.

> O volume por grupo muscular é computável ao nível da **sessão** (via
> `categories`), não do exercício. Responder nessa granularidade — se a resposta
> exigir precisão por exercício, dizê-lo, porque implica mapear `exercise_name`.

1. 📊 **Qual o papel da força em cada nível?**
   Prevenção de lesão, economia de corrida, potência — a prioridade muda. É o
   que decide o que o coach recomenda a quem.
   → alimenta: doutrina de recomendação por nível

2. 📊 **Volume semanal por grupo muscular: quantas séries?**
   Para um corredor, não para um praticante de musculação. Manutenção vs
   desenvolvimento, e como muda em bloco de prova.
   → alimenta: flags `volume_insuficiente` / `volume_excessivo`

3. **Que grupos musculares importam mais a um corredor?**
   Se `categories` regista `Pernas`, `Glúteos`, `Core`, etc., quais é que o
   coach deve vigiar e quais são secundários.
   → alimenta: interpretação de `categories`

4. **Interferência: intervalo mínimo entre treino de pernas e treino de
   qualidade de corrida.**
   A pergunta mais importante do módulo — é a que resolve o conflito entre dois
   especialistas. Precisa de número em horas.
   → alimenta: **arbitragem do head coach**

5. 📊 **Progressão de carga: que incremento e com que frequência?**
   % ou kg absolutos, e o critério para progredir (completou todas as reps? RPE
   abaixo de X?).
   → alimenta: a recomendação acionável mais útil deste especialista

6. **Que aumento de volume-carga semanal (Σ reps × peso) sinaliza risco?**
   %/semana. É a única métrica de carga computável com os campos atuais.
   → alimenta: flag `sobrecarga_ginasio`

7. **Intervalo mínimo entre sessões do mesmo grupo muscular.**
   Horas ou dias, e se varia com o volume da sessão.
   → alimenta: flag `recuperacao_insuficiente`

8. 📊 **Volume mínimo para preservar força durante um bloco de prova.**
   Quando a corrida manda, quanto do ginásio se pode cortar sem perder o ganho.
   → alimenta: doutrina do head coach na fase de taper

9. 📊 **Pliometria: a partir de que nível e com que pré-requisitos?**
   É eficaz para economia de corrida mas tem custo de recuperação e risco.
   → alimenta: filtro de recomendação por nível

10. **Faixas de repetições por objetivo (força / hipertrofia / resistência).**
    → alimenta: interpretação do que o utilizador está a fazer sem lho perguntar

11. **Treino até à falha: que proporção das séries, e qual o custo de recuperação?**
    Relevante porque essa fadiga compete com a corrida.
    → alimenta: doutrina

---

# BLOCO 4 — Nutrição

Campos, por 100g e por refeição: `calories`, `protein`, `carbs`, `fat`, `fiber`,
`sugar`, `sodium`, `iron_mg`, `calcium_mg`, `vitamin_c_mg`, `potassium_mg`.
Metas em `profiles`: `calorie_goal`, `protein_goal`, `carbs_goal`, `fat_goal`,
`water_goal_ml`. Registos de água em `water_logs`.

## 4.1 Base diária

1. 📊 **Proteína: g/kg de peso corporal.**
   Por objetivo (perda de gordura / manutenção / ganho muscular) **e** por
   volume de corrida — as necessidades sobem com o volume, não só com o objetivo.
   → alimenta: cálculo da meta, flag `proteina_insuficiente`

2. 📊 **Hidratos: g/kg em dia de treino vs dia de descanso.**
   Escalado ao volume semanal, que é o que distingue os níveis.
   → alimenta: flag `hidratos_insuficientes`

3. **Gordura: mínimo abaixo do qual há risco hormonal.**
   g/kg ou % das calorias. Limiar de segurança, não de otimização.
   → alimenta: flag `gordura_abaixo_do_minimo` (alarme, não sugestão)

4. **Necessidade calórica: como estimá-la com os campos que temos?**
   `bmr_kcal` da balança, ou fórmula a partir de peso/altura/idade/sexo, mais o
   gasto do treino. Qual a combinação defensável.
   → alimenta: base de todo o cálculo calórico

5. 📊 **Défice calórico máximo sem perda de massa magra nem quebra de performance.**
   Em kcal/dia e em % da manutenção, e como se altera em semanas de volume alto.
   → alimenta: flag `defice_excessivo`

6. **Hidratação: ml/kg base + reposição por hora de treino.**
   → alimenta: cálculo de `water_goal_ml`

## 4.2 Segurança

7. **Baixa disponibilidade energética (RED-S): quais os sinais detetáveis nos
   nossos dados, e qual o limiar?**
   kcal por kg de massa magra abaixo do qual há risco. É a falha nutricional
   mais séria num corredor e a app tem os dados para a suspeitar — ingestão,
   volume de treino e composição corporal.
   → alimenta: **alarme de topo da hierarquia** (Bloco 6)

8. **Ferro: limiar de ingestão de preocupação, com valor separado por sexo.**
   A corrida de longa distância tem impacto conhecido no estado do ferro.
   → alimenta: flag `ferro_baixo`

9. **Ritmo máximo de perda de peso sem prejudicar performance.**
   %/semana do peso corporal. Cruzar com o Bloco 5 — devem dar o mesmo número.
   → alimenta: flag `perda_rapida_demais`

10. **Sódio: reposição por hora de treino, e como concilia com o limite de saúde
    geral.** mg/hora em treino longo/calor vs mg/dia recomendado. Explicar como
    resolver o conflito, que é real.
    → alimenta: doutrina de arbitragem interna

## 4.3 Treino e prova

11. **Nutrição peri-treino: o que e quanto, antes e depois?**
    ⚠️ Só existe granularidade de slot (`almoco`, `lanche`), não hora exata.
    Responder em termos de "refeição anterior/seguinte ao treino".
    → alimenta: doutrina; possivelmente decisão de schema

12. **Ingestão durante a prova: g de hidratos por hora, por duração.**
    Muda com a duração do esforço e é a diferença entre acabar e não acabar uma
    prova longa. Incluir o limite de absorção.
    → alimenta: recomendação pré-prova, gatilho por `race_events.distance_km`

13. **Carga de hidratos: quantos dias antes, que quantidade, e a partir de que
    distância vale a pena?**
    → alimenta: gatilho pré-prova

14. **Fibra: alvo diário, e limite nas 24-48h pré-prova.**
    São dois números opostos — ambos necessários.
    → alimenta: flag `fibra_baixa`, gatilho pré-prova

15. **Cafeína: dose por kg, momento, e contraindicações.**
    → alimenta: doutrina pré-prova

---

# BLOCO 5 — Corpo

Campos (Renpho, todos opcionais): `weight_kg`, `bmi`, `body_fat_pct`,
`skeletal_muscle_pct`, `muscle_mass_kg`, `body_water_pct`, `protein_pct`,
`bone_mass_kg`, `bmr_kcal`, `visceral_fat`, `subcutaneous_fat_pct`,
`metabolic_age`, `lean_body_mass_kg` + `classifications` (jsonb).

1. **Quais destas 13 métricas são fiáveis por bioimpedância e quais são
   estimativa fraca?**
   A **pergunta mais importante do módulo**. Uma balança de bioimpedância mede
   impedância e infere o resto por fórmula proprietária. Se `protein_pct` ou
   `metabolic_age` forem essencialmente ruído, o coach não pode construir
   recomendações sobre eles — e neste momento nada o impede.
   → alimenta: lista de métricas que o coach pode citar vs ignorar

2. **Variação de peso: que % em quantos dias é sinal real e não flutuação de água?**
   → alimenta: flag `tendencia_peso`, filtro de ruído

3. **Quantos dias de média móvel para uma tendência de peso fiável?**
   → alimenta: como calcular a tendência antes de a comentar

4. **Perda de gordura: ritmo saudável em %/semana.**
   Cruzar com Nutrição #9 — devem dar o mesmo número.
   → alimenta: flag `perda_rapida_demais`

5. 📊 **Ganho de massa muscular: ritmo realista por nível de experiência.**
   kg/mês. Serve sobretudo para o coach não prometer o impossível.
   → alimenta: calibração de expectativas

6. **% de gordura corporal: faixas por sexo, faixa de atleta de endurance, e
   **piso de risco**.**
   As faixas de população geral não servem, e há um limite inferior abaixo do
   qual há risco de saúde.
   → alimenta: flags `gordura_elevada` / `gordura_baixa_demais`

7. **"Peso de prova" é um conceito a promover ou a evitar?**
   Existe relação defensável entre peso e performance, mas promovê-la numa app
   de consumo tem risco conhecido de induzir comportamento alimentar
   desordenado. Precisa de posição explícita — e de qualificação por nível.
   → alimenta: **decisão de produto**, não só doutrina

8. **Gordura visceral: limiares de risco.**
   A escala Renpho é própria — perceber a que corresponde clinicamente.
   → alimenta: flag `visceral_elevada` (alarme de saúde)

9. **Água corporal %: faixa normal e o que uma queda súbita indica.**
   → alimenta: flag `hidratacao`, e filtro para não ler flutuação de água como
   perda de gordura

10. **BMR da balança vs fórmula: qual usar quando divergem?**
    → alimenta: base do cálculo calórico — impacto em toda a Nutrição

11. **Que sinais de sobretreino ou fadiga acumulada aparecem nas métricas
    corporais?** Peso, água, FC em repouso — antes de o desempenho cair.
    → alimenta: flag `sobretreino`, cruzada com Corrida #16

---

# BLOCO 6 — Head Coach: arbitragem e comunicação

Não são perguntas de literatura pura; são decisões de produto que a literatura
informa. Mas têm de estar escritas antes de o head coach existir.

1. **Quando os objetivos entram em conflito, qual manda?**
   Cenário típico: perder gordura exige défice; a prova daqui a 3 semanas exige
   hidratos e recuperação. Precisa de regra explícita, não de bom senso.

2. **Quantos dias antes da prova a nutrição deixa de servir a composição
   corporal?** Um número. A partir daí o coach de Corpo perde precedência.

3. **Hierarquia de alarmes: o que interrompe tudo o resto?**
   Candidatos: baixa disponibilidade energética, gordura abaixo do mínimo
   hormonal, visceral elevada, perda de peso rápida demais, sinais de lesão.
   Estes calam as recomendações de otimização.

4. 📊 **Quanta informação dar, por nível?**
   Um iniciante afogado em métricas desiste; um avançado com conselhos genéricos
   desinstala. Quantas recomendações por vez, com que profundidade técnica, e
   que vocabulário é aceitável em cada nível.
   → alimenta: doutrina de comunicação — determina se a app é usável

5. 📊 **O que NÃO dizer a cada nível?**
   Temas contraindicados: peso de prova a um iniciante, séries de velocidade a
   quem ainda constrói base, jejum a quem treina em volume.
   → alimenta: lista de exclusão por nível

6. **Com que frequência o plano pode mudar?**
   Um coach que muda de opinião a cada registo é inútil. Definir o intervalo
   mínimo entre mudanças de direção.

7. **Quando é que o coach não diz nada?**
   Regra de silêncio. Sem isto, a proatividade transforma-se em ruído e o
   utilizador desliga as notificações.

8. **Como reconciliar pareceres contraditórios dos especialistas?**
   Além da regra de prioridade (#1): o que fazer quando dois especialistas
   emitem vereditos com confiança diferente sobre o mesmo período.

---

## Formato de registo das respostas

Ao trazer as respostas, usar esta estrutura por item — é o que se converte
diretamente em linha de doutrina:

```
Pergunta:  Corrida 2.1 #1 — aumento máximo de volume semanal
Iniciante: ≤ 5% face à média das 4 semanas anteriores
Básico:    ≤ 10%
Médio:     ≤ 10%, com semana de descarga a cada 3
Avançado:  ≤ 10-15% conforme a fase
Faixas:    acima do limite = vigiar | > 2× o limite = sinalizar
Condições: aplica-se a partir de 4 semanas de histórico; abaixo disso não avaliar
Fonte:     <referência>
Confiança: alta / média / baixa (consenso ou estudo isolado?)
```

Nas perguntas **sem** 📊, colapsar as quatro linhas de nível numa só (`Valor:`).

---

## ✅ Decisões dos Blocos 0, 1 e 2 — TODAS FECHADAS (2026-08-09)

As nove pendências acumuladas nos três blocos, todas decididas. **Os blocos 0,
1 e 2 estão prontos para converter em doutrina.**

### A. Schema — campos acrescentados

**A1. ✅ Frequência cardíaca em repouso → `profiles.resting_hr_bpm`**
Pedida de forma independente por **dois** usos não relacionados: a fórmula de
Karvonen (2.2 #4, a mais defensável para zonas de FC) e o sinal #1 de sobreuso
(2.4 #2).
**Decisão**: campo no Perfil (tab Pessoal), a par de `birth_date`, `gender` e
`experience_level` — não registo diário. Nullable: quando faltar, as zonas de
FC caem para %FCmáx simples, sem reserva.

**A2. ✅ Prioridade da prova → `race_events.race_priority`**
O taper muda radicalmente: 10-21 dias para prova principal vs. 2-4 dias para
prova secundária (2.3 #1).
**Decisão**: acrescentar, com omissão `a` (prova principal) — o caso mais
comum e o mais seguro se o utilizador não pensar no assunto.

### B. Conflitos entre fontes

**B1. ✅ Teto do treino longo, avançado (2.1 #4)** — resolvido por contexto
Daniels 30-32 km/150 min é a regra geral; Pfitzinger 35-38 km/180 min é
específico de preparação de maratona. Não é ruído, é âmbito diferente.
**Decisão**: aplicar Pfitzinger quando a prova-alvo mais próxima for
maratona/ultra, Daniels no resto.

**B2. ✅ Recuperação pós-maratona, avançado (2.3 #2)** — mostrar a faixa
Pfitzinger/Canova 10-14 dias vs. Daniels/Galloway 26 dias, sem contexto que
explique a diferença.
**Decisão**: **não arbitrar — apresentar a faixa 10-26 dias ao utilizador**,
explicando que depende de como correu a prova e de como se sente. É a decisão
mais honesta: o atleta tem informação que a app não tem (dor residual,
qualidade do sono, se a prova foi a fundo ou controlada), e fingir um número
único seria inventar precisão que as fontes não dão.
- *Implicação para a doutrina*: o coach explica o intervalo e os fatores, não
  emite um número. É o único ponto destes três blocos onde a doutrina
  deliberadamente **não** dá uma resposta determinística.

### C. Doutrina — posição por omissão

**C1. ✅ Ultra para iniciante (Bloco 1 #1 vs #2)**
Inconsistência interna da fonte: #1 diz "não recomendado", #2 dá números na
mesma.
**Decisão**: o aviso da #1 prevalece. A doutrina desaconselha fortemente; os
números da #2 servem só para medir a que distância o atleta está desse
patamar, nunca para o habilitar.

**C2. ✅ Precedência das zonas de FC do relógio (2.2 #4)**
A literatura diz que as zonas do relógio só mandam se calibradas por teste —
mas um print não diz qual é.
**Decisão**: preferir sempre o cálculo próprio (Tanaka + Karvonen quando
houver `resting_hr_bpm`; %FCmáx quando não houver) sobre as zonas extraídas do
print. Perguntar ao utilizador se calibrou fica para quando existir um ecrã de
definições de treino.

**C3. ✅ Regra de comentário sobre cadência (2.4 #1)**
**Decisão**: comentar cadência **apenas** quando <155 spm sustentado, e mesmo
aí sugerir "+5-10% sobre a tua cadência atual" — nunca um valor absoluto, e
nunca "180 spm". Fora disso, não comentar: é ruído.

### D. Âmbito

**D1. ✅ Cobertura da deteção de lesão (2.4 #2)**
**Decisão**: A1 primeiro (desbloqueia o sinal de FC em repouso, passando de 1
para 2 sinais detetáveis de 5). Integração com wearable (Garmin/Strava), que
desbloquearia HRV, degradação de cadência intra-sessão e assimetria de
passada, fica como projeto próprio e futuro — não é âmbito desta fase.

**D2. ✅ Volume em km ou em horas**
A fonte (Bloco 0 #1) diz que horas/semana é a métrica preferível, por ser
independente do ritmo.
**Decisão**: usar **horas internamente** na doutrina e nos cálculos; **mostrar
km ao utilizador**, que é o que lhe é familiar. Ambos deriváveis de `runs`
(`distance_km` e `duration_seconds`).

**D3. ✅ Banda de volume depende da distância-alvo**
Bloco 0 #1: os limites sobem 15-20 km/semana a partir de básico se o objetivo
for maratona.
**Decisão**: usar a prova mais próxima em `race_events` para escolher a banda.
O dado já existe — é só usá-lo.

---

## Respostas registadas

### Bloco 0 — RESOLVIDO (terceira ronda, fontes canónicas)

**As duas primeiras rondas usaram corpus genérico de treino (planos, artigos
de blog) e produziam dispersão porque agregavam corredores de 5k com
maratonistas na mesma categoria.** A terceira ronda foi à metodologia
canónica (Daniels' Running Formula, Advanced Marathoning/Faster Road Racing
de Pfitzinger, McMillan Running Standards, Lore of Running de Noakes) e
resolveu a dispersão ao **padronizar a distância-alvo e usar volume temporal
(h/semana) como métrica pace-independente**. Substitui por completo as duas
rondas anteriores nas três perguntas do Bloco 0.

**Decisão de produto confirmada**: mantêm-se os 4 níveis
(`iniciante`/`basico`/`medio`/`avancado`) — a dispersão que fazia "básico"
parecer indistinto de "iniciante" era um artefacto das fontes genéricas, não
uma realidade do domínio. Com fontes canónicas, básico tem banda própria e
clara em todos os critérios.

#### #1 — Critérios objetivos por nível

```
Pergunta:  Bloco 0 #1 — critérios objetivos por nível
Iniciante: Volume 15-25 km/semana (ou 1,5-3,0 h/semana), média 4-8 semanas.
           Corrida mais longa ≤5-8 km. Frequência 2-3 sessões/semana (últimos
           30 dias). Anos de prática <0,5 (sem interrupções >1 mês). Pace 5k
           ≥6:30 min/km (VDOT <30).
Básico:    Volume 25-40 km/semana (ou 3,0-4,5 h/semana), média 4-8 semanas.
           Corrida mais longa 8-12 km. Frequência 3-4 sessões/semana. Anos de
           prática 0,5-1,5. Pace 5k 5:30-6:30 min/km (VDOT 30-38).
Médio:     Volume 40-60 km/semana (ou 4,5-6,5 h/semana), média 8-12 semanas.
           Corrida mais longa 15-21,1 km. Frequência 4-5 sessões/semana.
           Anos de prática 1,5-3. Pace 5k 4:30-5:30 min/km (VDOT 38-50).
Avançado:  Volume 60-85 km/semana para foco 10k/meia (75-110 km/semana para
           maratona; ou 6,5-10,0+ h/semana), média do ciclo de pico 8-12
           semanas. Corrida mais longa ≥21,1 a ≥42,2 km. Frequência 5-7
           sessões/semana. Anos de prática >3. Pace 5k <4:30 min/km
           (VDOT >50).
Condições: Padronizado para provas de estrada 10k-Meia Maratona. Se o
           objetivo principal for Maratona, os limites inferiores de volume
           sobem 15-20 km/semana em todos os níveis a partir de Básico.
           Volume em TEMPO (h/semana) é a métrica preferível — elimina a
           distorção de um corredor lento precisar de mais tempo que um
           rápido para o mesmo volume em km.
Fonte:     Jack Daniels — Daniels' Running Formula 4th Ed (2021); Pete
           Pfitzinger & Philip Latter — Faster Road Racing (2014) / Advanced
           Marathoning 3rd Ed (2019); Greg McMillan — McMillan Running
           Standards/VDOT (2023)
Confiança: ALTA
```

#### #2 — Ponderação de critérios em contradição

```
Pergunta:  Bloco 0 #2 — que critério pesa mais quando se contradizem
Valor:     Hierarquia de segurança de 3 fatores, com peso:
           - Teto de carga atual (50%): volume semanal médio (km ou h/semana,
             4-8 semanas). Capacidade metabólica/aeróbica atual.
           - Teto de tolerância estrutural (30%): anos de prática continuada.
             Densidade óssea, adaptação de tendões, resistência a lesão por
             overuse.
           - Eficiência/intensidade (20%): pace recente a distância
             conhecida (VDOT).
           Regra de decisão: quando os critérios se contradizem, a
           classificação final PARA PRESCRIÇÃO desce para o nível do
           critério mais baixo em maturidade física — nunca o mais alto.
           Exemplo dado pela fonte: 60 km/semana mas só 8 meses de prática
           → classificar como "Básico" para efeitos de progressão de carga,
           apesar de ter capacidade aeróbica de "Médio", para evitar lesão.
Condições: Para algoritmos automáticos de triagem sem treinador presencial
           — exatamente o nosso caso.
Fonte:     Jack Daniels — Daniels' Running Formula (2021); Pete Pfitzinger —
           Faster Road Racing (2014); Tim Noakes — Lore of Running 4th Ed
           (2003)
Confiança: ALTA
```

Substitui o achado qualitativo da ronda anterior (mesma direção — volume
pesa mais para capacidade, anos pesam mais para resiliência — mas agora com
pesos explícitos e regra de decisão determinística). O limiar ACWR de uma
ronda ainda anterior (aumento semanal ≤10%) mantém-se válido e continua a
pertencer a **Corrida 2.1 #1**, não a este bloco.

#### #3 — Perguntas de onboarding preditivas do nível

```
Pergunta:  Bloco 0 #3 — questionário curto de perfil
Valor:     5 perguntas, ordenadas por poder preditivo, com opções JÁ
           MAPEADAS aos 4 níveis:
           1. Volume semanal: "Em média, quantos km correu por semana nos
              últimos 2 meses?" <20 / 20-35 / 35-60 / >60 km (janela 8 sem.)
           2. Frequência: "Quantos dias por semana corre habitualmente?"
              1-2 / 3 / 4-5 / 6-7 dias (janela 30 dias)
           3. Distância máxima: "Qual foi a corrida mais longa sem parar
              nos últimos 3 meses?" <5 / 5-10 / 10-21 / >21 km (janela 90 d.)
           4. Consistência temporal: "Há quanto tempo corre semanalmente sem
              interrupções >1 mês?" <6m / 6-18m / 1,5-3a / >3a
           5. Ritmo de teste/prova: "Tempo num teste/prova recente de 5 km?"
              >32:30 / 27:30-32:30 / 22:30-27:30 / <22:30 min (janela 6 m.)
Condições: Para questionário curto de onboarding em app de treino.
Fonte:     Greg McMillan — McMillan Running Standards (2023); Jack Daniels —
           Daniels' Running Formula (2021)
Confiança: ALTA
```

**O algoritmo de mapeamento que faltava está resolvido pela combinação #2+#3:**
cada pergunta bucketiza diretamente para um dos 4 níveis (0-3); combinam-se os
5 valores com os pesos de #2 (50% volume/frequência+distância como proxies de
carga atual, 30% consistência temporal, 20% ritmo); o nível final desce para
o critério de maturidade mais baixo em caso de conflito, nunca sobe. Deixa de
ser uma decisão de produto em aberto — é a regra a implementar.

**Nota de implementação, ainda válida**: as perguntas 1, 2 (aqui) e 3
correspondem a volume/frequência/corrida mais longa, computáveis a partir de
`runs` para quem já tem histórico na app — nesse caso servem para *sugerir*
um valor pré-preenchido que o utilizador confirma ou corrige, não para
perguntar do zero. A pergunta 4 (consistência) é autorrelato puro, sem
equivalente nos dados. A pergunta 5 (ritmo de teste) é computável só se
existir uma corrida de 5k no histórico ou em `race_events`.

### Bloco 1 — Objetivo e viabilidade (registo)

**Resposta forte, fontes canónicas (Daniels, Pfitzinger, Higdon, Koop, McMillan,
Noakes, Fitzgerald), confiança ALTA em tudo.** É o suficiente para implementar
a flag `objetivo_inviavel` a sério — o aviso de maior valor do coach.

#### #1 — Semanas mínimas de preparação por distância

```
Pergunta:  Bloco 1 #1 — semanas de bloco de treino por distância, por nível
Iniciante: 5k 6-10 sem · 10k 10-14 sem · Meia 16-20 sem · Maratona 24-30 sem
           (desaconselhada sem base sólida) · Ultra não recomendado (>30 sem
           se tentado)
Básico:    5k 6-8 sem · 10k 8-12 sem · Meia 12-16 sem · Maratona 18-24 sem ·
           Ultra 24-30 sem
Médio:     5k 4-6 sem · 10k 6-8 sem · Meia 10-12 sem · Maratona 14-18 sem ·
           Ultra 18-24 sem
Avançado:  5k 4-6 sem · 10k 4-6 sem · Meia 8-10 sem · Maratona 12-16 sem ·
           Ultra 14-18 sem
Condições: Pressupõe o volume semanal pré-requisito (#2) já cumprido ANTES da
           primeira semana deste bloco — os dois números somam-se, não se
           substituem. Não se aplica a atletas em recuperação de lesão
           ortopédica nem com interrupção >3 semanas no último mês.
Fonte:     Daniels' Running Formula 4th Ed (2021); Faster Road Racing (2014)
           / Advanced Marathoning 3rd Ed (2019); Hal Higdon Training
           Programs (2021); Training Essentials for Ultrarunning 2nd Ed
           (Koop, 2021)
Confiança: ALTA
```

#### #2 — Volume semanal pré-requisito por distância

```
Pergunta:  Bloco 1 #2 — volume de base exigido antes do bloco, por nível
Iniciante: 5k 10-15 km/sem ≥4 sem · 10k 15-25 ≥6 sem · Meia 25-30 ≥8 sem ·
           Maratona 35-40 ≥12 sem · Ultra 45-50 ≥16 sem
Básico:    5k 15-20 ≥4 sem · 10k 25-30 ≥4 sem · Meia 35-40 ≥6 sem ·
           Maratona 45-55 ≥8 sem · Ultra 55-65 ≥12 sem
Médio:     5k 25-30 ≥3 sem · 10k 35-40 ≥4 sem · Meia 45-55 ≥6 sem ·
           Maratona 60-70 ≥8 sem · Ultra 70-85 ≥10 sem
Avançado:  5k 35-45 ≥3 sem · 10k 45-60 ≥4 sem · Meia 60-75 ≥4 sem ·
           Maratona 75-95 ≥6 sem · Ultra 90-110+ ≥8 sem
Condições: ≥80% do volume pré-requisito em Zona 1/2, sem variações >10%/
           semana durante a janela — a mesma regra ACWR já registada em
           Bloco 0 #2 / Corrida 2.1 #1.
Fonte:     Faster Road Racing (2014) & Advanced Marathoning (2019),
           Pfitzinger; Daniels' Running Formula (2021); Training Essentials
           for Ultrarunning (Koop, 2021)
Confiança: ALTA
```

**Nota**: este pré-requisito é *por distância-alvo*, não o volume geral do
nível (Bloco 0 #1) — por desenho, é sempre ≤ ao volume geral desse nível,
exceto no topo (maratona/ultra em avançado, onde pode exceder a banda geral,
porque é volume de pico específico do ciclo, não volume sustentado o ano
todo). Não é contradição, são perguntas diferentes.

⚠️ **Inconsistência interna da própria fonte, a resolver na doutrina**: a #1
diz que ultra "não é recomendado" para iniciante, mas a #2 dá-lhe números na
mesma (45-50 km/semana, ≥16 semanas). Proposta: o aviso da #1 prevalece — a
doutrina bloqueia/desaconselha fortemente ultra para iniciante, e os números
da #2 servem só para medir *a que distância está* desse patamar, nunca para
o habilitar.

#### #3 — Ritmo de melhoria realista por bloco de treino

```
Pergunta:  Bloco 1 #3 — melhoria esperada no tempo de prova, por nível
Iniciante: 5-15% de redução (≈15-45 seg/km), bloco de 8-12 semanas
Básico:    3-5% (≈10-20 seg/km, +1 a +2 VDOT), bloco de 8-12 semanas
Médio:     1,5-3% (≈5-10 seg/km, +1 VDOT), bloco de 10-16 semanas
Avançado:  0,5-1,5% (≈2-5 seg/km, +0,5 a +1 VDOT), bloco de 12-16 semanas
Condições: Sem alteração drástica de peso/saúde durante o ciclo. O limite
           superior da faixa aplica-se a quem faz o primeiro programa
           estruturado de intervalado dentro do respetivo nível.
Fonte:     Daniels' Running Formula 4th Ed (2021); McMillan Running
           Standards (2023); Lore of Running 4th Ed (Noakes, 2003)
Confiança: ALTA
```

#### #4 — Objetivo ambicioso vs. irrealista

```
Pergunta:  Bloco 1 #4 — corte entre exigente e desaconselhável
Valor:     Ambicioso mas alcançável: 1,0-3,0% de melhoria (+1 VDOT) face ao
           desempenho testado nos últimos 30-60 dias, num bloco de 8-12
           semanas. Irrealista/desaconselhável: >5,0% de melhoria (+2 VDOT)
           no mesmo ciclo, sem alteração substancial de composição corporal.
Condições: Assume composição corporal estável. NÃO SE APLICA a iniciantes
           nos primeiros 6 meses — aí, melhorias >5% são adaptação
           neuromuscular normal, não sinal de objetivo arriscado. Ver #3:
           a faixa de iniciante (5-15%) já reflete isto: a regra geral desta
           pergunta e a faixa por nível da #3 não se contradizem, só se
           aplicam a públicos diferentes — manter as duas juntas na doutrina,
           nunca só a regra geral sem a exceção.
Fonte:     Daniels' Running Formula (2021); McMillan Running Standards
           (2023); 80/20 Running (Fitzgerald, 2014)
Confiança: ALTA
```

#### #5 — Progressão natural de distâncias

```
Pergunta:  Bloco 1 #5 — sequência de distâncias e permanência mínima por nível
Iniciante: 5k → 10k → Meia (maratona/ultra desaconselhados). ≥12-16 sem em
           5k com ≥2-3 provas antes de subir a 10k; ≥16-24 sem em 10k com
           ≥2 provas antes de subir a Meia.
Básico:    5k/10k → Meia → Maratona. ≥8-12 sem por degrau, ≥1-2 provas
           oficiais concluídas antes de transitar.
Médio:     10k → Meia → Maratona/Ultra, sequência flexível. ≥1 ciclo
           específico completo (10-16 sem) e ≥1 prova na distância inferior
           nos últimos 6 meses.
Avançado:  Livre — qualquer distância-alvo sem progressão linear obrigatória.
           Só exige 1 ciclo específico de 12-18 semanas para a distância.
Condições: Prevenção de lesão por sobrecarga óssea/tendinosa. Saltar a
           permanência mínima correlaciona-se com mais lesões por overuse.
Fonte:     Faster Road Racing (Pfitzinger, 2014); Daniels' Running Formula
           (2021); Run Fast (Higdon, 2016)
Confiança: ALTA
```

#### #6 — Compatibilidade entre perda de gordura e melhoria de performance

```
Pergunta:  Bloco 1 #6 — perda de gordura e performance em simultâneo
Valor:     Compatíveis sob défice moderado: 200-500 kcal/dia (≤15% do GETD),
           perda de 0,25-0,50 kg/semana (≤0,7% da massa corporal/semana),
           proteína mantida em 1,6-2,2 g/kg/dia. Incompatíveis quando: défice
           >500 kcal/dia (>20% GETD), perda >1,0% da massa/semana, gordura
           corporal no piso fisiológico essencial (6-8% homens, 14-16%
           mulheres), ou durante taper (últimas 3-4 semanas pré-prova).
Condições: Aplica-se em fases de base/volume moderado. Não se aplica em
           blocos de alta intensidade metabólica (VO2máx/capacidade
           anaeróbica) nem no taper.
Fonte:     Racing Weight (Fitzgerald, 2012); Sports Nutrition 3rd Ed
           (Jeukendrup, 2018); Clinical Sports Nutrition 6th Ed (Burke, 2021)
Confiança: ALTA
```

**Liga diretamente a Nutrição 4.1 #5 e 4.2** (défice calórico máximo, ritmo de
perda de peso, piso de gordura) — mesma pergunta, respostas devem bater
certo. Quando essas perguntas forem respondidas, cruzar os números: se
divergirem das faixas daqui, é a mesma pergunta com respostas diferentes e
precisa de reconciliação, não de duas respostas independentes na doutrina.

### Bloco 2.1 — Corrida: carga e progressão (registo)

Cinco perguntas, fontes canónicas (Gabbett, Daniels, Pfitzinger, Friel,
McMillan, ACSM, Coyle), confiança ALTA em todas.

#### #1 — Aumento máximo de volume e ACWR

```
Pergunta:  Corrida 2.1 #1 — aumento máximo semanal, por nível + ACWR
Iniciante: ≤5-10%/semana (ou +2-3 km/semana absoluto), média 4 semanas
Básico:    ≤10%/semana (ou +3-5 km/semana absoluto)
Médio:     ≤10%/semana (ou +5-8 km/semana absoluto)
Avançado:  ≤10%/semana (ou +8-10 km/semana absoluto, validado por ACWR)
ACWR:      SEM DIFERENCIAÇÃO POR NÍVEL — fórmula e faixas de risco uniformes.
           Carga aguda = últimos 7 dias; carga crónica = média móvel de 28
           dias. Faixa segura 0,80-1,30 · risco acrescido 1,31-1,49 ·
           perigo (risco exponencial) ≥1,50.
Condições: Para volume com intensidade constante. Não se aplica quando
           volume E intensidade (Z3-Z5) sobem na mesma semana.
Fonte:     The training-injury prevention paradox (Gabbett, 2016); Daniels'
           Running Formula (2021); Faster Road Racing (Pfitzinger, 2014)
Confiança: ALTA
```

**Fecha o ciclo do Bloco 0 #2**: aquele registo tinha ficado com "falta saber
se o limiar de 10%/semana difere por nível" — resposta: o teto percentual não
difere (todos ≤10%, só o iniciante mais apertado a 5-10%), mas o teto
**absoluto em km** difere muito (de +2-3 até +8-10 km/semana). Implementação
real: usar os dois — o percentual como regra simples, o ACWR (aguda:crónica)
como validação mais rigorosa quando há 4 semanas de histórico.

#### #2 — Frequência semanal mínima e ótima

```
Pergunta:  Corrida 2.1 #2 — frequência de treino, por nível
Iniciante: mínima 2-3 sessões/semana · ótima 3
Básico:    mínima 3 · ótima 3-4
Médio:     mínima 3-4 · ótima 4-5
Avançado:  mínima 4-5 · ótima 5-7 (podendo incluir 1-2 dias bidiários)
Condições: "Sessão" = corrida contínua/fracionada ≥20-30 min. Não conta
           força nem treino cruzado.
Fonte:     Daniels' Running Formula (2021); Advanced Marathoning 3rd Ed
           (Pfitzinger, 2019); ACSM Guidelines 11th Ed (2021)
Confiança: ALTA
```

Reforça, não contradiz, os números de frequência já registados em Bloco 0
#1 — fonte independente a confirmar o mesmo intervalo.

#### #3 — Periodicidade e redução da semana de descarga

```
Pergunta:  Corrida 2.1 #3 — descarga: de quanto em quanto tempo, que corte
Iniciante: a cada 2-3 semanas · corte de 20-30% face ao pico anterior
Básico:    a cada 3 semanas · corte de 20-25%
Médio:     a cada 3-4 semanas · corte de 20-25%
Avançado:  a cada 3-4 semanas (ciclos 3:1 ou 4:1) · corte de 15-20%
           (mantendo intensidade dos treinos-chave)
Condições: Corte aplica-se ao volume; intensidade dos treinos qualitativos
           (Z3-Z5) mantém-se — reduz-se repetições/treino longo, não a
           intensidade.
Fonte:     The Triathlete's Training Bible 5th Ed (Friel, 2020); Faster
           Road Racing (Pfitzinger, 2014); Daniels' Running Formula (2021)
Confiança: ALTA
```

#### #4 — Percentagem e teto do treino longo

```
Pergunta:  Corrida 2.1 #4 — treino longo: % do volume semanal e teto absoluto
Iniciante: 25-33% do volume · teto ≤10-12 km OU ≤75-90 min (o que vier primeiro)
Básico:    25-30% · teto ≤16-18 km OU ≤105-120 min
Médio:     25-30% · teto ≤25-28 km OU ≤150 min
Avançado:  20-25% (raramente >30%) · teto 30-32 km/150 min (Daniels, regra
           geral) OU 35-38 km/180 min (Pfitzinger, específico de preparação
           de maratona)
Condições: Para longos em estrada/plano. Em trail com D+ significativo, o
           teto deve ser regulado por TEMPO, não por distância.
Fonte:     Daniels' Running Formula 4th Ed (2021); Advanced Marathoning 3rd
           Ed (Pfitzinger, 2019); McMillan Running Standards (2023)
Confiança: ALTA
```

**O "conflito" do avançado não é ruído, é contexto**: Daniels dá a regra
geral, Pfitzinger dá o número específico para quem prepara maratona. Proposta:
usar o teto de Pfitzinger quando `race_events` mais próxima for maratona, o
de Daniels caso contrário — não uma escolha arbitrária entre os dois.

**Liga a Corrida 2.3 #13** (fator de conversão D+↔distância plana, ainda em
aberto) — é essa resposta que vai permitir aplicar esta regra do treino longo
a corridas de trail, hoje só coberta para estrada/plano.

#### #5 — Redução e regresso após interrupção

```
Pergunta:  Corrida 2.1 #5 — quanto reduzir e quanto tempo para regressar
Valor:     SEM DIFERENÇA POR NÍVEL — as tabelas de destreino assentam no
           tempo cronológico parado, transversal a todos os níveis.
           1 semana parado:  0% de corte, retoma a 100%; 1ª semana só Z1/Z2;
                              regresso ao ponto anterior em 1 semana.
           2 semanas parado: corte de 25% (retoma a 75%); perda de VO2max
                              ~2-3%; regresso em 1-2 semanas.
           4 semanas parado: corte de 50% na 1ª sem. (retoma 50%), 25% na
                              2ª (retoma 75%); perda de VO2max ~4-6%;
                              regresso em 3-4 semanas.
           8+ semanas:       corte de 50-67% (retoma 33-50%), progressão
                              +10%/semana; perda de VO2max ~8-16%; regresso
                              em 6-12 semanas — regra prática do rácio 1:1
                              entre tempo parado e tempo de reconstrução.
Condições: Para paragens não associadas a lesão musculoesquelética grave
           (férias, doença ligeira, compromissos). Regresso PÓS-LESÃO exige
           escala de dor (EVA) ≤2/10 — condição adicional que a app não
           consegue verificar sozinha (ver lacuna "histórico de lesões" no
           topo deste documento).
Fonte:     Daniels' Running Formula 4th Ed (2021, cap. Layoff & Detraining);
           Advanced Marathoning (Pfitzinger, 2019); Detraining and Retention
           of Training-Induced Adaptations (Coyle, 1986)
Confiança: ALTA
```

### Bloco 2.2 — Corrida: intensidade (registo)

Cinco perguntas, fontes canónicas (Seiler, Fitzgerald, Daniels, Pfitzinger,
Hudson, Galloway, Tanaka, Karvonen, ACSM, Borg, Foster, Meeusen), confiança
ALTA em todas.

#### #1 — Distribuição de intensidade

```
Pergunta:  Corrida 2.2 #1 — % LIT vs. MIT/HIT, por nível
Iniciante: 90-100% Z1/Z2 · 0-10% Z3. Modelo 80/20 estrito NÃO se aplica —
           exige base prévia de 6-12 semanas contínuas sem lesão e
           ≥20-25 km/semana já construídos.
Básico:    85-90% Z1/Z2 · 10-15% Z3/Z4
Médio:     80% Z1/Z2 · 20% Z3/Z5 (modelo 80/20 clássico, Fitzgerald/Seiler)
Avançado:  75-80% Z1/Z2 · 20-25% Z3/Z5 (polarizado ou piramidal, conforme
           fase do macrociclo)
Condições: Medir por tempo em zona (min/semana) ou distância, não por
           contagem de sessões. Não se aplica a treino de sprint puro/força
           explosiva.
Fonte:     What is Best Practice for Training Intensity Distribution?
           (Seiler, 2010); 80/20 Running (Fitzgerald, 2014); Daniels'
           Running Formula 4th Ed (2021)
Confiança: ALTA
```

#### #2 — Ponto de introdução de trabalho de qualidade

```
Pergunta:  Corrida 2.2 #2 — quando introduzir cada tipo de treino, por nível
Iniciante: Limiar/intervalos desaconselhados nas primeiras 6-12 semanas.
           Subidas curtas/fartlek suave: após ≥4-6 semanas contínuas,
           15-20 km/semana ≥4 semanas.
Básico:    Subidas/fartlek desde a semana 1. Limiar após ≥4 semanas de base
           (25-30 km/semana ≥4 sem). Intervalos após ≥6-8 semanas
           (30-35 km/semana ≥6 sem).
Médio:     Subidas/fartlek/limiar desde semanas 1-2 do ciclo específico
           (35-40 km/semana ≥4 sem). Intervalos na fase específica, semanas
           3-4 (40-45 km/semana ≥4 sem).
Avançado:  Todos os tipos desde a semana 1 da preparação específica, com
           ≥50-60 km/semana sustentados na fase de base/transição.
Condições: "Trabalho de qualidade" = sessão estruturada ≥limiar
           aeróbico/VT1 (Z3-Z5).
Fonte:     Daniels' Running Formula 4th Ed (2021); Faster Road Racing
           (Pfitzinger, 2014); Run Faster from the 5K to the Marathon
           (Hudson, 2008)
Confiança: ALTA
```

**Relacionado com Bloco 1 #2, não duplicado**: aqui o pré-requisito é para
introduzir um TIPO de treino (limiar, intervalos); em Bloco 1 #2 é para
começar um bloco de preparação de PROVA inteiro. Números parecidos,
perguntas diferentes — mantêm-se registados em separado.

#### #3 — Método caminhada/corrida

```
Pergunta:  Corrida 2.2 #3 — rácios, progressão, critério para corrida contínua
Valor:     4 fases em 8 semanas, sessões de 20-30 min:
           Fase 1 (sem. 1-2): 1 min corrida / 1,5-2 min caminhada, 6-8x
           Fase 2 (sem. 3-4): 2-3 min corrida / 1-2 min caminhada, 5-6x
           Fase 3 (sem. 5-6): 5-8 min corrida / 1-2 min caminhada, 3-4x
           Fase 4 (sem. 7-8): 10-15 min corrida / 1 min caminhada, 2-3x
           Critério para passar a corrida contínua: completar 30 min
           acumulados no rácio da Fase 4, com RPE ≤4/10 (Borg CR10) e
           FC <80% FCmáx, durante 2-3 sessões consecutivas, sem dor
           articular/muscular residual no dia seguinte.
Condições: Só para sedentários/iniciantes de nível zero. NÃO se aplica a
           quem regressa de pausa com histórico prévio consolidado — esse
           caso é o de Corrida 2.1 #5 (regresso após interrupção), não este.
Fonte:     Galloway's Book on Running (2002); Couch to 5K/NHS (2023);
           Daniels' Running Formula (2021)
Confiança: ALTA
```

#### #4 — Fórmula de zonas de FC e precedência do relógio

```
Pergunta:  Corrida 2.2 #4 — que fórmula usar, quando o relógio manda
Valor:     FCmáx: Tanaka et al. (2001) — 208 - (0,7 × idade), erro
           ±7-11 bpm. Aplicada via Karvonen (FC de reserva): FCalvo =
           FCrepouso + % × (FCmáx - FCrepouso).
           Precedência do relógio: as zonas automáticas NÃO têm precedência
           se vierem da estimativa genérica de fábrica (220-idade). TÊM
           precedência absoluta se calibradas por teste laboratorial
           (ergospirometria) ou teste de campo validado com cinta ECG.
Condições: Adultos saudáveis 20-70 anos. Não se aplica sob medicação que
           altera resposta cardíaca (betabloqueadores) nem com arritmia
           diagnosticada.
Fonte:     Age-predicted maximal heart rate revisited (Tanaka, JACC 2001);
           The effects of training on heart rate (Karvonen, 1957); ACSM
           Guidelines 11th Ed (2021)
Confiança: ALTA
```

⚠️ **Duas lacunas de dados reais, encontradas por esta resposta**:

1. **Karvonen exige FC de repouso — a app não a captura em lado nenhum.**
   Sem ela, não dá para aplicar a fórmula preferida. Ou se acrescenta o
   campo (ao Perfil, como `birth_date`/`experience_level`), ou o cálculo cai
   para uma fórmula mais simples (% de FCmáx, sem reserva) quando faltar.
2. **A regra de precedência não é verificável com os dados que temos.**
   `runs.details.hr_zones` vem extraído de um print — não há como saber se
   as zonas do relógio no print foram calibradas por teste ou são a
   estimativa genérica de fábrica. Sem uma pergunta direta ao utilizador
   ("as tuas zonas foram calibradas?"), a doutrina não consegue aplicar
   esta regra como está escrita — só pode assumir uma posição por omissão
   (ex.: preferir sempre o cálculo próprio, Tanaka+Karvonen, sobre as
   zonas extraídas).

#### #5 — Discrepância RPE/pace como sinal de fadiga

```
Pergunta:  Corrida 2.2 #5 — que discrepância é sinal acionável
Valor:     Aumento ≥2 pontos na escala RPE Borg CR10 para manter o mesmo
           pace, OU queda de pace ≥5-8% (≥15-20 seg/km) para o mesmo RPE.
           Confirmação: persistir ≥2-3 sessões consecutivas.
           Ação: cortar 50% do volume do dia, ou cancelar a sessão de
           intensidade agendada e substituir por Z1/descanso total.
Condições: Em condições ambientais normais. NÃO se aplica isoladamente com
           variação térmica >8-10°C no dia, desidratação aguda, ou treino
           com D+ invulgarmente elevado — a app não captura temperatura,
           por isso este filtro de falso-positivo não é automatizável por
           agora; fica como nota para não sinalizar fadiga em dias que só
           foram mais quentes ou mais montanhosos que o habitual.
Fonte:     Borg's Perceived Exertion and Pain Scales (1998); Monitoring
           training in athletes with reference to overtraining syndrome
           (Foster, 1998); ECSS/ACSM Consensus on overtraining (Meeusen,
           2013)
Confiança: ALTA
```

**Resolve Corrida 2.2 #10 do questionário original** (a pergunta genérica
"que discrepância é sinal de fadiga") com números concretos e acionáveis —
era uma das perguntas sem 📊, agora tem resposta única e completa.

### Corrida 2.3 — Prova (registo)

Quatro perguntas, fontes canónicas (Mujika/Padilla, Pfitzinger, Daniels,
Noakes, Galloway, ITRA, Minetti, Naismith, Riegel, Vigneron), confiança
ALTA em todas. **Fecha o bloco 2.3 por completo** — incluindo a conversão de
trail, referenciada como pendente desde Corrida 2.1 #4.

#### #1 — Taper: dias e redução, por nível e distância

```
Pergunta:  Corrida 2.3 #1 — taper: quantos dias antes, que corte de volume
Iniciante: 10k 5-7 dias (-20-30%) · Meia 7-10 dias (-30-40%) · Maratona
           10-14 dias (-40-50%) · Ultra/Trail 14 dias (-40-50%). Intensidade:
           mantém-se integral nas poucas sessões residuais, só a duração corta.
Básico:    10k 7 dias (-30%) · Meia 10-12 dias (-35-45%) · Maratona 14-21
           dias (-40-50%) · Ultra/Trail 14-21 dias (-45-50%). Ritmo de prova
           a 100% nas sessões-chave, repetições/minutos cortados 40-50%.
Médio:     10k 7-10 dias (-30-40%) · Meia 10-14 dias (-40-50%) · Maratona
           14-21 dias (-50-60%) · Ultra/Trail 14-21 dias (-50-60%).
           Intensidade Z3-Z5 mantida a 100%; frequência reduzida ≤20%.
Avançado:  10k 7-10 dias (-30-40%) · Meia 10-14 dias (-40-50%) · Maratona
           21 dias com redução exponencial (sem. -3: -20%, -2: -40%,
           -1: -60%) · Ultra/Trail 21 dias (-50-60%). Intensidade-alvo a
           100% até 3-4 dias antes do evento.
Condições: Para prova de objetivo principal (A-race). Provas secundárias
           (B/C-race) levam taper de só 2-4 dias, corte de 20-30%.
Fonte:     Scientific Bases for Precompetition Tapering Strategies (Mujika
           & Padilla, 2003); Advanced Marathoning 3rd Ed (Pfitzinger, 2019);
           Daniels' Running Formula 4th Ed (2021)
Confiança: ALTA
```

✅ **Gap de dados RESOLVIDO** (entretanto implementado): a distinção A/B/C
existe agora em `race_events.race_priority` — `RACE_PRIORITIES` em
`src/utils/run.js` (`a` Principal / `b` Secundária / `c` Treino), com omissão
`a`. A doutrina já consegue escolher entre o taper longo (A-race, valores da
tabela acima) e o curto (B/C-race, 2-4 dias, -20-30%).

#### #2 — Dias de recuperação pós-esforço máximo

```
Pergunta:  Corrida 2.3 #2 — quantos dias sem intensidade após cada distância
Iniciante: 5k/10k 5-7 dias · Meia 14-21 dias · Maratona 28-35 dias ·
           Ultra 35-42+ dias
Básico:    5k/10k 4-6 dias · Meia 10-14 dias · Maratona 21-28 dias ·
           Ultra 28-35 dias
Médio:     5k/10k 3-5 dias · Meia 7-10 dias · Maratona 14-21 dias ·
           Ultra 21-28 dias
Avançado:  5k/10k 2-3 dias (só Z1 regenerativo) · Meia 5-7 dias · Maratona
           EM CONFLITO — 10-14 dias (Pfitzinger/Canova) vs. 26 dias, regra
           "1 dia por milha em esforço máximo" (Daniels/Galloway) ·
           Ultra 14-21 dias
Condições: Para provas a 100% do limite fisiológico. Define o período antes
           do qual não se deve fazer treino de alta intensidade (Z4/Z5) ou
           nova prova — não proíbe corrida leve (Z1) após 2-4 dias de
           repouso total.
Fonte:     Daniels' Running Formula 4th Ed (2021); Advanced Marathoning 3rd
           Ed (Pfitzinger, 2019); Lore of Running 4th Ed (Noakes, 2003);
           Galloway's Book on Running (2002)
Confiança: ALTA
```

**Conflito não resolvido, proposta**: 10-14 vs. 26 dias é uma discrepância
grande para o único ponto avançado+maratona. Seguindo a mesma lógica de
segurança já usada no Bloco 0 #2 (em conflito, desce para o mais
conservador), proponho adotar os 26 dias como omissão — mas fica por
confirmar contigo antes de ir para doutrina.

#### #3 — Trail: fator de conversão D+ → distância plana

```
Pergunta:  Corrida 2.3 #3 — quantos metros de D+ equivalem a 1 km plano
Valor:     Fator padrão (ITRA/Naismith): 100 m D+ = 1,0 km plano.
           Tabela por declive (Minetti et al., 2002):
             0-5% (suave):    100 m D+ = 0,8-1,0 km
             6-15% (moderado): 100 m D+ = 1,0-1,2 km
             16-25% (acentuado): 100 m D+ = 1,2-1,5 km
             >25% (muito íngreme/power hiking): 100 m D+ = 1,5-2,0 km
           Descida: declive -5% a -10% reduz custo ~10-20%; declive
           >-15% aumenta dano muscular (contração excêntrica), anulando
           o ganho metabólico.
Condições: Para trilho de característica técnica regular. Piso muito
           técnico (pedra solta, lama, neve) soma +10-20% ao tempo estimado.
Fonte:     ITRA Evaluation Criteria; Energy cost of walking and running at
           extreme uphill and downhill slopes (Minetti, J Appl Physiol,
           2002); Naismith's Rule (1892)
Confiança: ALTA
```

**Implementável já com os dados existentes, em dois níveis:**
- **MVP, imediato**: fator fixo 1:100 (Naismith) sobre `elevation_gain_m` —
  `distância_equivalente_km = distance_km + (elevation_gain_m / 100)`.
  Aplica-se a `runs.details.elevation_gain_m` e a `race_events.elevation_gain_m`.
- **Refinamento, requer mais dados**: a tabela por declive precisa do
  declive médio (`elevation_gain_m / distance_km` é só uma aproximação
  grosseira — não capta subidas/descidas dentro da mesma corrida). O ajuste
  de descida e a penalização de piso técnico não são aplicáveis de todo —
  a app não captura desnível negativo (D-) nem technicidade do terreno.

#### #4 — Previsão de tempo entre distâncias

```
Pergunta:  Corrida 2.3 #4 — relação defensável e margem de erro
Valor:     Fórmula de Riegel: T2 = T1 × (D2/D1)^b
           b = 1,06 (Riegel original, 1977) para atletas com boa base
           aeróbica. b = 1,07-1,10 (Vigneron et al., 2020) — ajuste para
           amadores (iniciante/básico), por terem menos volume de treino.
           Margem de erro: ±2-4% entre distâncias adjacentes (5k→10k,
           10k→meia); ±6-12% em extrapolação longa (5k→maratona) — tende
           a subestimar o tempo se faltar o volume de treino específico
           da distância-alvo.
           Alternativa: tabelas VDOT (Daniels), ±2-3% de erro, MAS só válida
           se o atleta já tiver cumprido o volume de treino específico
           exigido pela distância-alvo.
Condições: Para prova em asfalto/plano, 10-15°C, nível de treino estável.
           NÃO se aplica a trail com desnível — aí usa-se a #3.
Fonte:     Athletic Records and Efficiency Performance (Riegel, American
           Scientist, 1981); Daniels' Running Formula 4th Ed (2021);
           Predicting marathon finish time using Riegel's formula
           (Vigneron, 2020)
Confiança: ALTA
```

**Regra de implementação por nível**: usar b=1,07-1,10 para iniciante/básico,
b=1,06 para médio/avançado — o próprio nível (Bloco 0) decide qual expoente
aplicar. **Liga a Bloco 1 #2**: a condição "só válida com o volume de treino
específico já cumprido" é exatamente o pré-requisito de volume por distância
já registado ali — sem esse volume, a previsão de tempo não é fiável e a
margem de erro sobe para os 6-12%.

### Corrida 2.4 — Técnica e sinais de alerta (registo)

Duas perguntas, confiança ALTA nas duas. **Fecha o Bloco 2 (Corrida) por
completo.** Mas é o registo com maior distância entre o que a literatura sabe
e o que a app consegue medir — ver avaliação de implementabilidade abaixo.

#### #1 — Cadência: faixa-alvo ou individual?

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

#### #2 — Sinais mensuráveis que precedem lesão por sobreuso

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

### Bloco 3 — Ginásio ao serviço da corrida (registo)

Onze perguntas, fontes canónicas (Blagrove, Rønnestad/Mujika, ACSM, NSCA,
Schoenfeld, Beattie, Verkhoshansky, Gabbett, Doma, Izquierdo), confiança ALTA
em todas.

#### #1 — Papel da força por nível

```
Iniciante: 80% coordenação intermuscular/aprendizagem motora/resiliência
           tecidual · 20% economia de corrida · 0% potência (desaconselhada)
Básico:    60% prevenção de lesão e reforço articular/tendinoso · 30%
           economia via adaptações neurais · 10% potência inicial
Médio:     45% economia de corrida e pico de força máxima · 35% prevenção e
           estabilidade pélvica/core · 20% potência e RFD
Avançado:  40% economia e recrutamento de unidades motoras de limiar
           elevado · 40% potência, RFD e rigidez do tendão de Aquiles ·
           20% prevenção e manutenção estrutural
Condições: A transição de prioridades pressupõe padrões fundamentais já
           consolidados (agachamento, dobradiça da anca, afundo, elevação
           pélvica).
Fonte:     Strength and Conditioning for Endurance Running (Blagrove, 2015);
           Optimizing strength training for running and cycling performance
           (Rønnestad & Mujika, 2014); ACSM Progression Models (2009)
Confiança: ALTA
```

#### #2 — Séries semanais por grupo muscular

```
Iniciante: desenvolvimento 4-6 séries/grupo/semana · manutenção 2-3 (-50%)
Básico:    desenvolvimento 6-8 · manutenção 3-4 (-50%)
Médio:     desenvolvimento 8-10 · manutenção 3-5 (-50-60% nas últimas 4-6
           semanas pré-prova)
Avançado:  desenvolvimento 8-12 (cargas ≥80% 1RM) · manutenção 4-6
           (-50-60%, mantendo a carga em kg)
Condições: Séries de trabalho efetivas (RIR 2-3) dos grupos principais dos
           membros inferiores. Não conta aquecimento.
Fonte:     Science and Development of Muscle Hypertrophy 2nd Ed
           (Schoenfeld, 2020); Blagrove (2015); Beattie et al. (2014)
Confiança: ALTA
```

#### #3 — Grupos musculares prioritários

```
Primários: 1. Tricípite sural (solear + gémeos) — absorção de impacto até
              6-8× o peso corporal, restituição de energia elástica
           2. Quadríceps — atenuação de carga no apoio, propulsão em subida
           3. Isquiotibiais + glúteo máximo — extensão da anca, travagem
              excêntrica no fim da oscilação
           4. Glúteo médio e mínimo — estabilização pélvica no plano frontal
              (previne valgo dinâmico e queda pélvica)
Secundár.: core/eretores, flexores da anca, tibial anterior, adutores,
           estabilizadores escapulares
Fonte:     Blagrove (2015); The biomechanics of running (Novacheck, 1998);
           Muscular strategy shift in human running (Dorn, 2012)
Confiança: ALTA
```

#### #4 — Interferência: intervalo entre pernas e corrida de qualidade

```
Valor:     Corrida de qualidade PRIMEIRO (manhã), ginásio ao fim do dia:
           6-9 horas de separação no mesmo dia.
           Ginásio PRIMEIRO: 24 horas até corrida de alta intensidade ou
           treino longo — ressíntese de glicogénio e recuperação da fadiga
           neuromuscular excêntrica.
Condições: Para força de membros inferiores com cargas ≥70% 1RM. Não se
           aplica a sessões só de membros superiores ou mobilidade leve.
Fonte:     The effects of strength training on the physiological
           determinants of running performance (Doma & Deakin, 2013);
           Rønnestad & Mujika (2014); Interference Effect Protocol
           (Baar, 2014)
Confiança: ALTA
```

**Era a pergunta que resolvia o conflito entre dois especialistas** — e a
resposta é boa, mas ver a lacuna crítica abaixo: **não temos hora do dia**.

#### #5 — Progressão de carga

```
Iniciante: +2,5-5,0 kg (+5-10%) a cada 1-2 semanas. Critério: completar o
           topo das repetições prescritas em todas as séries com RPE ≤7
           (RIR ≥3) e técnica perfeita.
Básico:    +2,5-5,0 kg (+2,5-5%) a cada 2-3 semanas. Critério: regra das 2
           repetições — conseguir +2 reps além do alvo na última série, em
           2 treinos consecutivos, com RIR ≥2.
Médio:     +1,25-2,5 kg (+2-3%) a cada 3-4 semanas ou na transição de bloco.
           Critério: manter RIR 2 sem degradação da velocidade concêntrica.
Avançado:  +1,0-2,5 kg (+1-2%) a cada 4-6 semanas, periodização ondulatória.
           Critério: perda de velocidade intrassérie <10-15% (VBT) ou
           reavaliação periódica de 1RM.
Fonte:     ACSM Progression Models (2009); NSCA Essentials 4th Ed (Baechle
           & Earle, 2016); Developing Explosive Power Through VBT (Mann, 2016)
Confiança: ALTA
```

#### #6 — Volume-carga semanal que sinaliza risco

```
Valor:     >10-15% de aumento do volume-carga semanal (Σ séries × reps ×
           kg), face à média móvel das 4 semanas anteriores = risco
           acrescido. >20% num único microciclo = risco elevado de lesão
           miotendinosa, sobretudo combinado com a carga de corrida.
Condições: Somatório dos membros inferiores. Não se aplica ao arranque de
           um programa do zero (fase de habituação neuromuscular).
Fonte:     The training-injury prevention paradox (Gabbett, 2016);
           Schoenfeld (2020)
Confiança: ALTA
```

**Coerente com Corrida 2.1 #1** — mesmo autor (Gabbett), mesma lógica de
ACWR, limiar quase igual (10% corrida, 10-15% ginásio). Bom sinal de
consistência entre os dois módulos.

#### #7 — Intervalo entre sessões do mesmo grupo

```
Valor:     48-72 h entre sessões do mesmo grupo de membros inferiores.
           Baixo volume/manutenção (2-4 séries, RIR ≥3): 48 h.
           Alto volume/desenvolvimento (6-10 séries, RIR 1-2): 72 h.
Condições: Estímulos ≥70% 1RM.
Fonte:     ACSM Guidelines 11th Ed (2021); How many times per week should a
           muscle be trained? (Schoenfeld, Sports Med 2016)
Confiança: ALTA
```

#### #8 — Volume mínimo de manutenção em bloco de prova

```
Iniciante: 1 sessão/semana, 20-30 min, 2-3 séries/grupo (33-50% do volume
           de desenvolvimento)
Básico:    1 sessão/semana, 30 min, 2-3 séries/grupo, mantendo a carga em kg
Médio:     1-2 sessões/semana, 20-30 min, 3-4 séries/grupo (33%), com
           intenção de velocidade máxima concêntrica e cargas ≥80% 1RM
Avançado:  1-2 sessões/semana, 20 min, 3-4 séries/grupo (30-40%), foco em
           pico de força (1-5 reps ≥85% 1RM), repetições ao mínimo para
           eliminar fadiga metabólica
Condições: A manutenção exige manter a CARGA (kg ou %1RM); corta-se séries
           e repetições, nunca o peso.
Fonte:     Exercise dosage needed to maintain muscle mass and strength
           (Bickel, MSSE 2011); In-season strength maintenance training in
           endurance athletes (Rønnestad, 2010/2015)
Confiança: ALTA
```

#### #9 — Pliometria

```
Iniciante: desaconselhada (0 contactos de alta intensidade). Baixo impacto
           (skipping, corda) só após ≥12 semanas de força de base.
Básico:    baixa-moderada (corda, box jumps baixos, saltos bipodais).
           40-60 contactos/sessão, 1×/semana. Pré-requisito: ≥6 meses de
           força continuada + agachamento com peso corporal estável.
           Recuperação: 48 h.
Médio:     moderada-elevada (bounding, saltos unipodais, drop jumps baixos).
           60-80 contactos/sessão, 1-2×/semana. Pré-requisito: ≥1 ano de
           força + agachamento ≥1,2-1,5× peso corporal. Recuperação: 48-72 h.
Avançado:  alta intensidade/choque (depth jumps, hurdle jumps unipodais).
           80-120 contactos/sessão, 1-2×/semana. Pré-requisito: ≥2 anos de
           força pesada + agachamento ≥1,5-1,8× peso corporal.
           Recuperação: 72 h.
Condições: Medido por contactos do pé com o solo. Exige superfície com
           absorção (relva, pista, tapete) — desaconselhado em asfalto/betão.
Fonte:     Supertraining (Verkhoshansky, 2009); NSCA Essentials (Baechle &
           Earle, 2016); Effects of plyometric training on endurance runners
           (Ramirez-Campillo, 2014)
Confiança: ALTA
```

#### #10 — Faixas de repetições

```
Valor:     Força máxima/adaptação neural: 1-5 reps (≥85% 1RM), descanso 2-5 min
           Hipertrofia: 6-12 reps (65-80% 1RM), descanso 60-90 s
           Resistência muscular local: 15-25+ reps (<60% 1RM), descanso 30-60 s
Nota:      A literatura especializada DESACONSELHA a faixa de resistência
           muscular (15-25+) para corredores de fundo — essa qualidade já é
           desenvolvida pela própria corrida. Recomenda 3-6 reps com ≥80% 1RM,
           para maximizar economia de corrida e rigidez tendinosa sem
           hipertrofia desnecessária.
Fonte:     ACSM Progression Models (2009); Blagrove (2015); Beattie (2014)
Confiança: ALTA
```

**Regra de doutrina forte**: quando um corredor faz séries longas (15+ reps)
no ginásio, o coach deve sinalizá-lo — não é "treino a mais", é treino do
tipo errado para o objetivo dele.

#### #11 — Treino até à falha

```
Valor:     0% das séries de membros inferiores para corredor em ciclo ativo.
           Todas as séries de pernas devem terminar com RIR 2-4 (RPE 6-8).
           Falha concêntrica (RIR 0) limitada a ≤5% de séries secundárias
           de membros superiores/core.
Custo:     Recuperação neuromuscular sobe de 48 h para 72-96 h. Marcadores
           de dano muscular (CK) +30-50%. Esgota glicogénio local. Reduz
           economia de corrida e produção de força durante 3-4 dias.
Condições: Para quem corre em simultâneo a média/elevada intensidade.
Fonte:     Differential effects of strength training leading to failure
           versus not to failure (Izquierdo, 2006); Physiological responses
           to resistance exercise taken to failure vs. non-failure (2016);
           Does Training to Failure Maximize Muscle Hypertrophy?
           (Schoenfeld & Grgic, 2019)
Confiança: ALTA
```

---

⚠️ **Avaliação de implementabilidade — Bloco 3**

Dados disponíveis: `workout_sessions.categories` (grupos ao nível da SESSÃO),
`kind`, `exertion` (RPE da sessão), `duration_seconds`, `avg_hr`/`max_hr`;
`workout_session_sets.exercise_name` (texto livre), `reps`, `weight`,
`set_index`.

| Pergunta | Implementável? | Nota |
|---|---|---|
| #6 volume-carga semanal | ✅ **Totalmente** | Σ reps × weight é computável exatamente. A métrica mais limpa de todo o bloco. |
| #7 intervalo entre sessões | ✅ | Via `categories` + `date`. |
| #10 faixas de repetições | ✅ | `reps` por série. Permite sinalizar séries longas demais para corredor. |
| #5 progressão de carga | ⚠️ parcial | Peso/reps ao longo do tempo: sim. Critérios de RIR por série: não — só temos `exertion` da sessão inteira. |
| #2 séries por grupo | ⚠️ aproximado | `categories` é da SESSÃO, não da série. Numa sessão com `['Pernas','Glúteos']` e 12 séries, não sabemos a divisão. Só dá para aproximar (ex.: dividir por igual). |
| #8 volume de manutenção | ⚠️ aproximado | Mesma limitação de #2. |
| #1 papel da força | ⚠️ doutrina só | Não é métrica, é orientação de linguagem — aplicável sem dados. |
| #3 grupos prioritários | ❌ granularidade | A literatura fala de solear, gémeos, quadríceps, glúteo médio. Temos `Pernas` e `Glúteos`. Não dá para distinguir. |
| #4 interferência | ❌ **falta a hora** | Ver abaixo — é a lacuna mais séria. |
| #9 pliometria | ❌ | Contactos do pé com o solo não são capturados. O rácio agachamento/peso corporal seria computável por `exercise_name` + `profiles.weight_kg`, mas depende de texto livre. |
| #11 falha/RIR | ⚠️ parcial | `exertion` é da sessão, não por série. Dá para sinalizar sessões de RPE muito alto, não séries individuais até à falha. |

🔲 **DECISÃO PENDENTE E1 — hora do dia em treinos e corridas**

A regra de interferência (#4) é **a pergunta que resolve o conflito entre o
especialista de ginásio e o de corrida** — e distingue dois cenários que
levam a recomendações opostas:
- Corrida de qualidade de manhã + ginásio à noite: **6-9 h chegam**.
- Ginásio primeiro: **24 h** até à corrida de qualidade.

**`workout_sessions.date` e `runs.date` são `DATE` — sem hora.** O
`created_at` não serve: é quando o registo foi criado (pode ser dias depois,
ao carregar o print), não quando o treino aconteceu.

Consequência: só conseguimos detetar "ginásio e corrida no mesmo dia", sem
saber se respeitaram as 6-9 h nem qual veio primeiro. A doutrina fica
limitada a um aviso genérico em vez da regra real.

- *Opção 1*: acrescentar hora (opcional) a `workout_sessions` e `runs`.
  Implementa a regra a sério, mas é mais um campo em dois formulários.
- *Opção 2*: acrescentar só a ordem ("o que fizeste primeiro hoje?") quando
  há os dois no mesmo dia. Mais leve, resolve metade (qual veio primeiro),
  não resolve o intervalo.
- *Opção 3*: aceitar o aviso genérico — "fizeste ginásio de pernas e corrida
  de qualidade no mesmo dia, atenção ao intervalo entre eles".
- **Sem recomendação forte**: depende de quanto valorizas esta regra face ao
  atrito de mais campos. A #4 foi identificada como "a pergunta mais
  importante do módulo" quando o questionário foi escrito.

### Bloco 4.1 — Nutrição: base diária (registo)

Seis perguntas, fontes canónicas (ACSM/AND Position Statement, ISSN, Burke,
Jeukendrup, Mifflin, Cunningham, IOC RED-S Consensus, NATA), confiança ALTA
em todas.

#### #1 — Proteína (g/kg/dia)

```
Iniciante: manutenção 1,2-1,4 · perda de gordura 1,6-1,8 · ganho 1,6-2,0
Básico:    manutenção 1,4-1,6 · perda de gordura 1,8-2,0 · ganho 1,6-2,0
Médio:     manutenção 1,6-1,8 · perda de gordura 2,0-2,2 · ganho 1,8-2,2
Avançado:  manutenção 1,6-2,0 · perda de gordura 2,0-2,4 · ganho 1,8-2,2
Escala:    +0,1-0,2 g/kg/dia por cada +20 km/semana acima dos 30 km/semana
           (oxidação de aminoácidos como fonte energética em longos)
Condições: Distribuir em doses de 0,3-0,4 g/kg por refeição, a cada 3-4 h
           (3-5 refeições/dia).
Fonte:     ACSM/AND Joint Position Statement — Nutrition and Athletic
           Performance (2016); ISSN Position Stand — Protein and Exercise
           (Jäger, 2017); Clinical Sports Nutrition 6th Ed (Burke, 2021)
Confiança: ALTA
```

**Totalmente implementável**: `profiles.weight_kg` × fator do nível, mais o
escalamento por volume semanal (computável de `runs`). A meta deixa de ser um
número fixo em `profiles.protein_goal` e passa a ser derivada.

#### #2 — Hidratos (g/kg/dia)

```
Iniciante: descanso/leve 3,0-5,0 · treino moderado (~1h) 4,0-5,0
Básico:    descanso 3,0-4,0 · treino (1h moderado/intenso) 5,0-7,0
Médio:     descanso 4,0-5,0 · treino (1-2h, qualidade ou longo) 6,0-8,0
Avançado:  descanso/rodagem leve 5,0-6,0 · treino intenso ou longo (2-3h)
           8,0-10,0 (até 10-12 nas 36-48h de carga pré-maratona)
Condições: Periodizar dia a dia conforme duração e intensidade da sessão
           agendada — "fuel for the work required", não um valor fixo.
Fonte:     Carbohydrates for training and competition (Burke, J Sports Sci
           2011); ACSM Position Statement (2016); Sports Nutrition 3rd Ed
           (Jeukendrup, 2018)
Confiança: ALTA
```

⚠️ **Implica meta variável, não fixa.** Hoje `profiles.carbs_goal` é um valor
único. A doutrina exige que a meta de hidratos mude conforme o treino do dia
— dia de descanso e dia de treino longo pedem valores muito diferentes (num
avançado, 5 vs. 10 g/kg = o dobro). Ou a meta passa a ser calculada por dia,
ou o coach avalia contra a faixa certa sem alterar a meta guardada.

#### #3 — Mínimo de gordura e risco hormonal

```
Valor:     Mínimo: 20-25% do GETD OU 0,8-1,0 g/kg/dia.
           Risco (RED-S): <20% das calorias ou <0,5-0,7 g/kg/dia
           cronicamente → supressão do eixo hipotálamo-hipófise-gonadal:
           queda de testosterona (H), perturbações menstruais/amenorreia e
           queda de estrogénio (M), redução da densidade mineral óssea,
           má absorção de vitaminas lipossolúveis (A, D, E, K).
Condições: Pode descer a 15-20% temporariamente nas 24-48h de carga de
           hidratos pré-maratona, para evitar lentidão gástrica.
Fonte:     IOC Consensus Statement on RED-S (Mountjoy, 2018/2023); ISSN
           Position Stand — Diets and Body Composition (Aragon, 2017);
           Clinical Sports Nutrition 6th Ed (Burke, 2021)
Confiança: ALTA
```

#### #4 — Estimativa calórica e validade da bioimpedância

```
Valor:     TMB, por ordem de preferência:
           1. Cunningham (1980), se massa magra conhecida por DXA:
              TMB = 500 + (22 × massa magra kg)
           2. Mifflin-St Jeor (1990), se % de gordura desconhecida:
              H: (10×peso) + (6,25×altura cm) − (5×idade) + 5
              M: (10×peso) + (6,25×altura cm) − (5×idade) − 161
           GETD = (TMB × fator de atividade não-treino 1,2-1,4) + custo do
           treino. Custo da corrida ≈ 1,0 kcal/kg/km.
           BIA: o TMB de balança doméstica NÃO é recomendado para cálculo
           de precisão — erro de ±10-20% (±200-400 kcal/dia), por
           sensibilidade a hidratação, temperatura da pele, conteúdo
           gastrointestinal e hora da medição.
           Disponibilidade energética (EA) = (GETD − custo do treino) /
           kg de massa magra. Manter ≥45 kcal/kg LBM/dia; nunca <30.
Fonte:     A new predictive equation for resting energy expenditure
           (Mifflin, Am J Clin Nutr 1990); A reevaluation of the basal
           metabolic rate submodel (Cunningham, 1980); ACSM Position Stand
           (2016); Is bioelectrical impedance accurate? (Dehghan &
           Merchant, 2008)
Confiança: ALTA
```

✅ **Responde por antecipação a Bloco 5 #10** ("BMR da balança vs. fórmula:
qual usar quando divergem?"). Resposta: **a fórmula ganha sempre**. O
`body_assessments.bmr_kcal` do Renpho tem erro de ±200-400 kcal/dia — não
serve de base a cálculo calórico. Fica como valor informativo apenas.

✅ **Mifflin-St Jeor é computável hoje**: precisa de peso, altura, idade e
sexo — temos os quatro (`weight_kg`, `height_cm`, `birth_date`, `gender`).
Foi exatamente para isto que o `birth_date` foi acrescentado.

⚠️ **Cunningham não é utilizável**: exige massa magra por DXA. Temos
`lean_body_mass_kg`, mas vem da mesma bioimpedância que esta resposta
desaconselha — usá-la seria contornar o próprio aviso da fonte.

#### #5 — Défice calórico máximo por nível

```
Iniciante: 300-500 kcal/dia (15-20% do GETD) · perda 0,5 kg/semana (≤0,7%)
Básico:    300-500 kcal/dia (15-20%) · perda 0,5 kg/semana (≤0,7%)
Médio:     250-400 kcal/dia (10-15%) · perda 0,25-0,4 kg/semana (≤0,5%)
Avançado:  200-300 kcal/dia (5-10%) · perda 0,2-0,3 kg/semana (≤0,3-0,4%)
Alto vol.: DÉFICE A ZERO — manutenção estrita em semanas de pico de volume,
           blocos de alta intensidade e taper. Manter défice nessas fases
           eleva exponencialmente o risco de perda de massa magra,
           supressão imunitária e overreaching não funcional.
Condições: Proteína no limite superior do nível (1,8-2,4 g/kg/dia) durante
           as fases de défice.
Fonte:     Racing Weight (Fitzgerald, 2012); Clinical Sports Nutrition 6th
           Ed (Burke, 2021); Evidence-based recommendations for natural
           bodybuilding contest preparation (Helms, 2014)
Confiança: ALTA
```

✅ **Reconciliação com Bloco 1 #6 — confirmada, sem contradição.** Aquele
registo deu o envelope geral (200-500 kcal/dia, ≤0,7%/semana, proteína
1,6-2,2 g/kg); este decompõe-no por nível dentro do mesmo envelope. Os
extremos batem certo: o topo (500 kcal, 0,7%) é de iniciante/básico, o fundo
(200 kcal, 0,3%) é de avançado. A única extensão é a proteína até 2,4 g/kg
em avançado sob défice — coerente com #1. **Podem ir as duas para a doutrina
sem reconciliação adicional.**

#### #6 — Hidratação

```
Valor:     Base diária (fora do treino): 30-40 ml/kg/dia.
           Durante o treino: 400-800 ml/h, ajustado à taxa de sudação e ao
           clima.
           Pós-treino (padrão de referência): pesar antes e depois; repor
           1,2-1,5 L por cada 1,0 kg perdido (120-150% do défice) nas 2-4 h
           seguintes, com 500-700 mg de sódio por litro.
Condições: Valores para clima temperado (15-25°C). Acima de 30°C a sudação
           pode passar de 1,5-2,0 L/h, exigindo 300-600 mg/h de sódio
           planeado para evitar hiponatremia.
Fonte:     NATA Position Statement — Fluid Replacement for Athletes (2017);
           ACSM Position Stand — Exercise and Fluid Replacement (2007);
           Sports Nutrition 3rd Ed (Jeukendrup, 2018)
Confiança: ALTA
```

✅ **`profiles.water_goal_ml` deixa de precisar de ser fixo** (hoje 2000 por
omissão): 30-40 ml/kg × `weight_kg` dá a base, e o treino do dia acrescenta
400-800 ml/h. Um corredor de 70 kg passa de "2000 ml" genérico para
2,1-2,8 L base + reposição.

---

⚠️ **Avaliação de implementabilidade — Bloco 4.1**

| Pergunta | Implementável? | Nota |
|---|---|---|
| #1 proteína | ✅ | `weight_kg` × nível + escalamento por volume de `runs` |
| #4 TMB/GETD | ✅ | Mifflin-St Jeor com os 4 campos que já temos; custo da corrida = 1 kcal/kg/km sobre `distance_km` |
| #5 défice | ✅ | Derivado do GETD + peso; a regra de "défice zero em pico" exige saber a fase do plano |
| #6 hidratação base | ✅ | 30-40 ml/kg sobre `weight_kg` |
| #3 gordura mínima | ✅ | `fat` das refeições vs. 0,8-1,0 g/kg — alarme de RED-S computável |
| #2 hidratos | ⚠️ meta variável | Precisa de meta por dia, não fixa — ver aviso acima |
| #6 reposição pós-treino | ❌ | Exige pesagem antes/depois do treino; não capturamos peso associado a uma corrida |
| #4 Cunningham | ❌ | Exige massa magra por DXA; a nossa vem de BIA, desaconselhada pela própria fonte |

🔲 **DECISÃO PENDENTE N1 — metas fixas vs. derivadas**

`profiles` guarda `calorie_goal`, `protein_goal`, `carbs_goal`, `fat_goal` e
`water_goal_ml` como **valores fixos**, definidos à mão. A doutrina desta
secção calcula todos eles a partir de peso, altura, idade, sexo, nível e
volume de treino — e no caso dos hidratos, **muda de dia para dia**.

- *Opção 1*: o coach passa a calcular e a sugerir as metas, e o utilizador
  aceita ou substitui. As colunas mantêm-se, mas ganham um valor sugerido.
- *Opção 2*: as metas passam a ser sempre derivadas; as colunas viram
  override opcional (null = usar o cálculo).
- *Opção 3*: nada muda no schema; o coach compara a ingestão com a faixa
  correta internamente e comenta, sem tocar nas metas do utilizador.
- **Recomendação**: opção 3 para já (zero risco, zero migração), evoluindo
  para a 1 quando houver confiança nos cálculos. A 2 é a mais correta a
  prazo mas mexe no que o utilizador já configurou.

O campo **Confiança** não é decorativo: limiares de confiança baixa devem gerar
linguagem mais suave na doutrina ("considera", "pode valer a pena") em vez de
afirmações categóricas.

**Quando a literatura não diferenciar por nível, registá-lo** — "sem
diferenciação encontrada" é uma resposta válida e evita que se invente uma.
