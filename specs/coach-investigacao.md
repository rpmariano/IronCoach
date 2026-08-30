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

✅ **DECISÃO E1 — RESOLVIDA (2026-08-10): não acrescentar hora; aplicar a
regra ao PROPOR, não ao detetar.**

A regra de interferência (#4) distingue dois cenários com recomendações
opostas: corrida de qualidade de manhã + ginásio à noite (**6-9 h chegam**),
ou ginásio primeiro (**24 h** até à corrida de qualidade).

O problema registado era que `workout_sessions.date` e `runs.date` são `DATE`,
sem hora — só se detetava "os dois no mesmo dia", nunca o intervalo nem a
ordem. As opções em cima da mesa eram acrescentar hora, acrescentar ordem, ou
aceitar um aviso genérico.

**O plano de treino (specs/plano-de-treino.md) abriu um quarto caminho, que é
melhor que os três.** O coach passou a ser quem *propõe* os treinos — logo
controla a ordem e o espaçamento **antes** de acontecerem:

- Ao propor, nunca coloca corrida de qualidade e ginásio de pernas em
  conflito: ou os separa por ≥24 h, ou põe a corrida de manhã e o ginásio ao
  fim do dia no mesmo item de plano, com a nota explícita.
- Retrospetivamente, mantém-se o aviso genérico da *Opção 3* — quando o
  atleta treinou por fora do plano e os dois caíram no mesmo dia.

**Porque é a melhor resolução**: prevenir custa zero atrito ao utilizador
(nenhum campo novo em dois formulários), e é mais útil do que detetar — um
aviso depois do treino feito não desfaz a interferência. A deteção
retrospetiva fica como rede, não como mecanismo principal.

→ **A doutrina de `corrida.md` e `ginasio.md` tem de conter esta regra na
forma prescritiva** ("ao propor, separar X"), não só na descritiva ("se
aconteceram juntos, avisar").

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

✅ **DECISÃO N1 — RESOLVIDA (2026-08-10): metas de perfil são a LINHA DE
BASE; a variação diária vive na análise, não na meta.**

`profiles` guarda `calorie_goal`, `protein_goal`, `carbs_goal`, `fat_goal` e
`water_goal_ml` como valores fixos. A doutrina calcula-os a partir de peso,
altura, idade, sexo, nível e volume — e no caso dos hidratos, **muda de dia
para dia** (5 vs. 10 g/kg entre descanso e longão, num avançado).

A tensão resolveu-se ao perceber que a app é **retrospetiva por desenho**
(PRD 3.6): não pode saber o treino de hoje antes de ele acontecer, logo não
pode definir prospetivamente a meta de hoje. A pergunta *"quanto devo comer
hoje?"* é prospetiva e não tem resposta possível; *"a alimentação de ontem
foi adequada ao treino que fiz?"* é retrospetiva e responde-se bem.

**Resolução em três camadas:**

1. **Metas estáveis** (proteína, gordura) — o coach pode escrevê-las no
   perfil, com o *toggle* de autorização e a cor do módulo Coach a marcar a
   origem. Mudam com o peso e o nível, não com o dia.
2. **Metas variáveis** (calorias, hidratos, água) — a coluna guarda a **linha
   de base** (dia sem treino). O acréscimo do treino do dia vive na análise
   do coach, nunca na meta gravada.
3. **Exceção prospetiva: quando existe plano aceite.** Aí o coach *sabe* o
   treino de amanhã, porque foi ele que o propôs — e o `dayNutrientStatus`
   ajusta o dia a partir dos itens do plano (`planAffectsDay()` em
   `src/utils/nutrition.js`). Nunca gravado: calculado, para uma mudança de
   data corrigir os dois dias sozinha.

**Estado**: a camada 3 está implementada (heurístico mínimo — só isenta
calorias/hidratos no dia de um longo do plano). As camadas 1 e 2 dependem do
*toggle* de autorização no Perfil, ainda por construir.

### Bloco 4.2 — Nutrição: segurança (registo)

Quatro perguntas, fontes canónicas (IOC Consensus RED-S, Loucks, Peeling, Sim,
Garthe, Hew-Butler, ACSM, OMS), confiança ALTA em todas. **É o registo com
maior distância entre o que a literatura sabe e o que a app consegue medir —
pior até do que Corrida 2.4 #2.**

#### #1 — RED-S: limiar, sinais, consequências

```
Valor:     Disponibilidade energética (EA) = (ingestão − gasto do exercício)
           / massa magra em kg. Ótima ≥45 kcal/kg FFM/dia · subclínica
           30-45 · limiar RED-S <30 (média mantida ≥5-7 dias).
           Sinais: ingestão desproporcionalmente baixa face ao gasto (EA
           <30); perda rápida/involuntária de peso com gordura corporal no
           piso fisiológico (<6-8% homens, <14-16% mulheres); amenorreia/
           oligomenorreia ≥3 meses (mulheres); queda de testosterona livre/
           líbido/ereções matinais (homens); FC de repouso <40 bpm (fora de
           adaptação de elite); histórico recorrente de fraturas de stress.
Consequên.: Supressão tiroideia (T3 livre) e do eixo LH/FSH; redução do pico
           de massa óssea, osteopenia/osteoporose precoce; TMB reduzida;
           imunossupressão; disfunção endotelial; menos síntese proteica e
           queda de performance.
Fonte:     IOC Consensus Statement on RED-S (Mountjoy, 2018/2023); Low
           energy availability, not physiological stress, suppresses LH
           pulsatility in exercising women (Loucks, 2004); ACSM Position
           Stand (2016)
Confiança: ALTA
```

⚠️ **Avaliação de implementabilidade — a mais severa de todo o documento.**

| Sinal | Implementável? | Nota |
|---|---|---|
| EA <30 kcal/kg FFM | ⚠️ com reserva | Ingestão: computável de `meals`. Gasto do exercício: ≈1 kcal/kg/km (Nutrição 4.1 #4), computável. Massa magra: só temos `lean_body_mass_kg` por BIA — a mesma fonte que a #4 de 4.1 já desaconselhou para cálculo de precisão. O numerador é bom, o denominador é fraco. |
| Gordura no piso fisiológico | ✅ | `body_assessments.body_fat_pct` vs. limiares já registados em 4.1 #3 e Bloco 1 #6. |
| FC de repouso <40 bpm | ✅ **novo** | `profiles.resting_hr_bpm` foi acrescentado entretanto (outra frente de trabalho) — este sinal passou de não capturável a capturável. |
| Amenorreia/testosterona/líbido | ❌ | Não há campo, nem é razoável pedir — dados clínicos sensíveis, fora do âmbito de registo casual numa app de treino. |
| Histórico de fraturas de stress | ❌ | Mesma lacuna "histórico de lesões" já listada no topo do documento. |

**Consequência honesta**: o EA calculado é uma **estimativa fraca de uma
estimativa fraca** (BIA para massa magra, aproximação para gasto de
exercício) — não deve gerar um alarme automático sozinho. O que pode: gordura
no piso + perda rápida + (agora) FC de repouso elevada, três sinais
independentes e mais fiáveis, a apontar na mesma direção. É esse conjunto,
não o EA isolado, que deveria disparar o alarme de RED-S na doutrina.

#### #2 — Ferro

```
Valor:     RDA geral: homens 8 mg/dia, mulheres (idade fértil) 18 mg/dia.
           Corredores de resistência precisam de +30-50% — 11-14 mg/dia
           (homens). Limiar de preocupação: ferritina sérica <30 µg/L
           (fase 1 de défice); alvo ótimo para transporte de O2 ≥50 µg/L.
Mecanismo: (1) hemólise por impacto plantar — destrói glóbulos vermelhos a
           cada passada; (2) hepcidina elevada pós-esforço (pico 3-6h,
           via IL-6) bloqueia a absorção intestinal de ferro por algumas
           horas; (3) perdas gastrointestinais (isquemia esplâncnica) e
           0,5-1,0 mg de ferro por litro de suor.
Condições: Suplementação oral só com ferritina confirmada <30 µg/L e
           orientação médica — risco de hemocromatose por sobrecarga.
Fonte:     Iron status and the endurance athlete (Peeling, 2008/2014); Iron
           considerations for the athlete (Sim, 2019); IOC/ACSM Joint
           Position Statement (2016)
Confiança: ALTA
```

✅ **Parcialmente implementável, e é uma boa notícia**: `meal_items.iron_mg_per_100g`
existe — a ingestão diária de ferro já é computável e comparável ao limiar de
11-14 mg/dia do corredor (não à RDA geral de 8, que subestimaria o risco).
❌ A ferritina sérica — o marcador realmente diagnóstico — não é capturável;
é um valor de análise ao sangue, fora do que uma app de registo casual pode
pedir. O alarme fica limitado a "ingestão baixa", nunca a "défice confirmado".

#### #3 — Ritmo de perda de peso

```
Valor:     ≤0,5-0,7% da massa corporal/semana (0,25-0,50 kg/semana para
           70 kg), défice de 250-500 kcal/dia. Acima de 1,0%/semana ou
           défice >500 kcal/dia: perda de massa magra, depleção de
           glicogénio, RPE mais alto, queda de rendimento em prova.
Fonte:     Racing Weight (Fitzgerald, 2012); Effect of two different
           weight-loss rates on body composition and strength-related
           performance in elite athletes (Garthe, 2011); ACSM Position
           Stand (2016)
Confiança: ALTA
```

**Terceira confirmação independente do mesmo número — não é achado novo, é
convergência.** Bloco 1 #6 e Nutrição 4.1 #5 já tinham chegado exatamente ao
mesmo intervalo (0,5-0,7%/semana, 250-500 kcal/dia), com fontes diferentes de
cada vez. As três batem certo ao dígito. Não requer reconciliação nenhuma —
é o tipo de convergência que sobe a confiança do número, mesmo sem subir a
etiqueta de "ALTA" que já tinha.

#### #4 — Sódio: treino/calor vs. limite diário

```
Valor:     Durante treino longo (>75-90 min) ou calor (>25°C): 300-600 mg
           sódio/hora (até 600-1000+ mg/h em "salty sweaters"). Limite geral
           de saúde (OMS/DGS): <2000 mg/dia. Resolução: o sódio consumido
           durante o exercício não se soma ao limite diário de repouso —
           repõe défice agudo do compartimento extracelular, prevenindo
           hiponatremia associada ao exercício (EAH). Fora do treino, vale
           o limite de 2000 mg/dia; durante treino longo/calor, repor
           50-80% das perdas estimadas por sudação.
Condições: Aplica-se a treinos >90 min ou ambiente quente/húmido. Não se
           aplica a treinos <60 min.
Fonte:     ACSM Position Statement — Exercise and Fluid Replacement (2007);
           3rd International EAH Consensus (Hew-Butler, 2015); OMS; Sports
           Nutrition 3rd Ed (Jeukendrup, 2018)
Confiança: ALTA
```

**Resolve a pergunta de conciliação do questionário original** ("como
concilia com o limite de saúde geral") — a resposta não é um número único, é
uma regra de contabilização em dois compartimentos (repouso vs. exercício).

⚠️ **Implementável em metade**: `meal_items.sodium_per_100g` existe — o
orçamento diário de repouso é computável. A necessidade de reposição durante
o treino depende de duração (temos, `runs.duration_seconds`) e temperatura
ambiente (não temos — mesma lacuna já registada em Corrida 2.2 #5). Sem
temperatura, o coach pode aplicar o mínimo do intervalo (300 mg/h) para
treinos longos, mas não distinguir um dia fresco de um dia de calor extremo.

### Bloco 4.3 — Nutrição: treino e prova (registo)

Cinco perguntas, fontes canónicas (ACSM, Burke, Jeukendrup, Bussau, Lis,
Viribay, ISSN/Grgic, Spriet), confiança ALTA em todas. **Fecha a Nutrição por
completo (4.1, 4.2, 4.3).** Traz as duas primeiras perguntas totalmente
computáveis de todo o bloco de Nutrição — sem gaps nenhuns.

#### #1 — Nutrição antes e depois do treino

```
Valor:     Antes: hidratos 1,0-4,0 g/kg, escalado ao tempo de digestão
           disponível (3-4h antes: 2,0-4,0 g/kg refeição sólida; 1h antes:
           1,0 g/kg snack leve). Proteína 0,3-0,4 g/kg (20-30g). Gordura e
           fibra baixas-moderadas, para não atrasar o esvaziamento gástrico.
           Depois: hidratos 1,0-1,2 g/kg/hora nas primeiras 2-4h se a
           sessão seguinte for em <24h; ou 1,0 g/kg na primeira refeição
           em rotina normal de 24h de descanso. Proteína 0,3-0,5 g/kg
           (20-40g) com ≥2,5-3,0g de leucina, nas 0-2h após o treino.
Condições: Para treino Z3-Z5 ou sessões >60 min. Rodagens curtas em Z1
           (<45 min) dispensam ingestão prévia e seguem o padrão alimentar
           habitual.
Fonte:     ACSM Position Stand (2016); Clinical Sports Nutrition 6th Ed
           (Burke, 2021); A Step Towards Personalized Sports Nutrition
           (Jeukendrup, Sports Med 2014)
Confiança: ALTA
```

⚠️ **Mesma lacuna já registada no topo do documento**: `meals.meal_type` é
um slot (`almoco`, `lanche`...), não uma hora exata — não dá para verificar
"comeu nas 0-2h após o treino", só "comeu no mesmo dia, num slot plausível".
A doutrina fica ao nível de "refeição anterior/seguinte ao treino", como já
estava previsto.

#### #2 — Hidratos por hora durante a prova

```
Valor:     <45 min: nenhum. 45-75 min: bochecho ou até 30 g/h. 1,0-2,5h
           (10k intenso a meia): 30-60 g/h (glicose/maltodextrina).
           >2,5-3,0h (maratona/ultra): 60-90 g/h, fonte múltipla
           (glicose:frutose 2:1 ou 1:0,8). >4-6h (ultra-resistência):
           até 90-120 g/h, com treino intestinal prévio.
           Limite de absorção: fonte única (SGLT1) ~60 g/h; fontes
           múltiplas (SGLT1+GLUT5) ~90-120 g/h, requer 4-6 semanas de
           habituação intestinal.
Condições: Ingerir 100-150 ml de água por cada 15-20g de hidratos, para
           evitar hiperosmolaridade gastrointestinal.
Fonte:     A Step Towards Personalized Sports Nutrition (Jeukendrup, Sports
           Med 2014); Effects of 120 g/h of Carbohydrates during a Mountain
           Marathon (Viribay, Nutrients 2020); ACSM Position Stand (2016)
Confiança: ALTA
```

⚠️ **Só serve para aconselhar, não para verificar.** A duração da prova é
computável (`race_events`/`runs`), por isso o coach pode dizer *"para 3h de
maratona, precisas de 60-90 g/h"* — mas não há forma de registar o que o
atleta realmente ingeriu durante a corrida (géis, bebida isotónica). Fica
recomendação prévia, nunca comparação com o que aconteceu.

#### #3 — Carga de hidratos (carb-loading)

```
Valor:     Indicada para provas >90 min contínuos — meia para corredores
           mais lentos, obrigatória para maratona/ultra. Em 5k/10k
           (<60-75 min) não melhora e só traz peso indesejado (~3g de água
           por cada 1g de glicogénio armazenado). Duração: 24-48h antes.
           Quantidade: 10-12 g/kg/dia. Acompanhar de fibra <10-15 g/dia e
           gordura <15-20% das calorias, para conforto intestinal.
Fonte:     Carbohydrate loading in human muscle: an improved 1-day protocol
           (Bussau, Eur J Appl Physiol 2002); Carbohydrates for training
           and competition (Burke, 2011); ACSM Position Stand (2016)
Confiança: ALTA
```

✅ **Totalmente computável, sem gaps.** `race_events.distance_km` decide se a
prova qualifica (>90 min de esforço estimado); `race_events.date` dá a
contagem decrescente para acionar o gatilho nas 24-48h antes;
`profiles.weight_kg` dá o alvo em gramas; `meals`/`meal_items` dão a
ingestão real de hidratos e fibra para comparar. É a primeira pergunta de
todo o bloco de Nutrição a não ter nenhuma reserva.

#### #4 — Fibra: alvo diário e limite pré-prova

```
Valor:     Alvo diário: 25 g/dia (mulheres) a 38 g/dia (homens), ou
           ~14g/1000 kcal. Nas 24-48h antes da prova: reduzir para
           <10-15 g/dia.
Condições: A restrição pré-prova esvazia o resíduo fecal acumulado,
           reduzindo peso e o risco de diarreia induzida pelo exercício
           ("runner's trots") ou cólicas durante a prova.
Fonte:     ACSM Position Stand (2016); Clinical Sports Nutrition 6th Ed
           (Burke, 2021); Gastrointestinal Complaints During Exercise (Lis,
           2018)
Confiança: ALTA
```

✅ **Também totalmente computável.** `meal_items.fiber_per_100g` existe —
alvo diário e restrição pré-prova são ambos verificáveis com o que já
temos, cruzado com `race_events.date` para saber quando entra a janela de
restrição.

#### #5 — Cafeína

```
Valor:     Dose ergogénica: 3-6 mg/kg (210-420 mg para 70 kg). Doses
           adicionais de 1-2 mg/kg nas fases finais de maratonas/ultras.
           Acima de 9 mg/kg não traz ganho extra e piora efeitos
           colaterais. Momento: 60 min antes do início.
           Contraindicações: arritmias/taquicardia de repouso, hipertensão
           não controlada, ansiedade aguda, insónia, úlcera péptica,
           gravidez (limite 200 mg/dia), medicação simpaticomimética.
Condições: Testar sempre em treino antes de usar em prova. O protocolo de
           "desabituação" 7 dias antes não mostra vantagem clara sobre
           manter o hábito normal.
Fonte:     ISSN Position Stand — Caffeine and Exercise Performance (Guest,
           JISSN 2021); ACSM Position Stand (2016); Exercise and Sport
           Performance with Low Doses of Caffeine (Spriet, Sports Med 2014)
Confiança: ALTA
```

❌ **Não implementável — gap novo, não registado antes.** Cafeína não é um
nutriente capturado em `meal_items` (a lista para — calorias, proteína,
hidratos, gordura, fibra, açúcar, sódio, ferro, cálcio, vitamina C,
potássio). E as contraindicações são informação clínica/pessoal (arritmia,
hipertensão, gravidez), da mesma categoria dos sinais de RED-S em 4.2 #1 —
fora do que é razoável pedir num registo casual. A doutrina pode recomendar
a dose e o momento; não pode verificar nada.

**Nutrição está fechada.** Dois blocos totalmente resolvidos (#3, #4), um
parcial mas com boa cobertura (#1, #2), um gap novo e genuíno (#5, cafeína)
que se junta ao já conhecido de RED-S (4.2 #1) na categoria "informação
clínica que a app não deve tentar capturar".

### Bloco 5 — Corpo (registo)

Onze perguntas, fontes canónicas (ACSM, Dehghan & Merchant, Fosbøl & Zerahn,
Levitsky, Garthe, Aragon & Schoenfeld, McDonald, Mountjoy/IOC, WHO,
Jeukendrup, Meeusen, Plews, Noakes), confiança ALTA em todas. Cruza fortemente
com blocos anteriores — mais do que qualquer ronda até agora.

#### #1 — Fiabilidade das métricas por bioimpedância

```
Fiáveis:   Peso corporal (±0,1-0,2 kg). Média móvel de longo prazo (nunca
           valor absoluto de um dia) de % de gordura e massa magra — só
           para tendência direcional.
Não fiável: Massa muscular esquelética, proteína, massa óssea, idade
           metabólica, gordura visceral (escala própria), água corporal em
           valor diário absoluto, TMB. Erro de ±10-25% vs. DEXA/4-compartimentos
           — equações proprietárias hiper-sensíveis a hidratação, glicogénio
           e conteúdo gastrointestinal.
Condições: Tendência exige padronização rígida — medição matinal, em jejum,
           pós-micção, sem líquidos nem exercício nas 12h anteriores.
Fonte:     ACSM Guidelines 11th Ed (2021); Is bioelectrical impedance
           accurate for clinical studies? (Dehghan & Merchant, 2008);
           Contemporary methods of body composition assessment (Fosbøl &
           Zerahn, 2015)
Confiança: ALTA
```

⚠️ **Ambiguidade de mapeamento aos nossos 13 campos.** A resposta nomeia
"massa magra" (fiável em tendência) e "massa muscular esquelética" (não
fiável) — mas `body_assessments` tem **três** campos de músculo distintos:
`skeletal_muscle_pct` (bate certo com "esquelética" → não fiável),
`lean_body_mass_kg` (bate certo com "massa magra" → fiável em tendência), e
`muscle_mass_kg`, que a resposta **não nomeia diretamente**.

✅ **DECIDIDO (2026-08-10): `muscle_mass_kg` trata-se como NÃO FIÁVEL.** Está
conceptualmente mais próximo de "massa muscular esquelética" (explicitamente
não fiável) do que de "massa magra" — e a regra de segurança que temos usado
em todo o documento manda escolher o lado conservador quando a fonte não
desambigua. Consequência prática: dos três campos de músculo, **só
`lean_body_mass_kg` pode ser citado pelo coach, e mesmo assim apenas como
tendência de longo prazo**, nunca como valor absoluto de um dia.

**Confirma o que já sabíamos**: `bmr_kcal` não fiável — mesma conclusão de
Nutrição 4.1 #4. `visceral_fat` só serve com a tabela de correspondência
clínica — ver #8 abaixo.

#### #2 — Variação de peso: real vs. água

```
Valor:     Oscilação >1,0-1,5 kg em 24-48h = só água/glicogénio/conteúdo
           gastrointestinal. Alteração mantida >0,5-1,0 kg ao longo de
           14-21 dias (comparando médias semanais) = tecido real.
Fonte:     Racing Weight (Fitzgerald, 2012); ACSM Position Stand (2016);
           Monitoring body weight daily (Levitsky, 2006)
Confiança: ALTA
```

#### #3 — Média móvel para tendência fiável

```
Valor:     7-14 dias (7 mínimo, para anular ciclo de treino e retenção
           hídrica). Em mulheres, 14-28 dias — para anular a fase lútea do
           ciclo menstrual.
Fonte:     Monitoring body weight daily (Levitsky, 2006); Racing Weight
           (Fitzgerald, 2012)
Confiança: ALTA
```

#### #4 — Ritmo de perda de gordura

```
Valor:     0,5-1,0% da massa corporal/semana (0,35-0,70 kg para 70 kg).
           Com gordura corporal já baixa, reduz para ≤0,5%/semana.
Condições: Exige proteína 1,8-2,4 g/kg/dia e treino de força, para
           preservar massa magra.
Fonte:     Effect of two different weight-loss rates on body composition
           (Garthe, 2011); ACSM Position Stand (2016); Racing Weight
           (Fitzgerald, 2012)
Confiança: ALTA
```

⚠️ **Discrepância pequena com três rondas anteriores.** Bloco 1 #6, Nutrição
4.1 #5 e Nutrição 4.2 #3 convergiram exatamente em 0,5-0,7%/semana; esta dá
0,5-1,0%. O piso (0,5%) bate certo nas quatro — só o teto diverge (0,7% vs.
1,0%). Segue a mesma regra de segurança já usada quando as fontes discordam:
fica o valor mais conservador, **0,7%/semana**, como teto por omissão — 1,0%
só quando a resposta #7 permitir explicitamente (nível médio/avançado, com
suporte especializado).

#### #5 — Ritmo de ganho de massa muscular, por nível

```
Iniciante: 1,0-1,5 kg/mês homens (0,5-0,75 mulheres), 0-6 meses de treino
Básico:    0,5-1,0 kg/mês homens (0,25-0,5 mulheres), 6-18 meses
Médio:     0,25-0,5 kg/mês homens (0,12-0,25 mulheres), 1,5-3 anos
Avançado:  0,1-0,25 kg/mês homens (<0,1 mulheres) ou teto genético, >3 anos
Condições: Exige treino de força hipertrófico + superavit ligeiro
           (+200-300 kcal/dia). NÃO se aplica em défice calórico nem em
           volume de corrida >60 km/semana (efeito de interferência).
Fonte:     Gaining Muscle Mass Model (Aragon & Schoenfeld, 2013/2020);
           Model for Genetic Muscular Potential (McDonald, 2009)
Confiança: ALTA
```

**Liga a Ginásio #1** (papel da força por nível) e à interferência corrida↔
ginásio já registada em Bloco 3 #4 — mais um ponto de contacto entre módulos
sobre a mesma ideia: alto volume de corrida compete com hipertrofia.

#### #6 — % de gordura corporal: faixas e piso

```
Geral:     10-20% homens · 18-28% mulheres
Endurance: 6-12% homens · 14-20% mulheres
Piso RED-S: <5-6% homens · <12-14% mulheres
Fonte:     ACSM Guidelines 11th Ed (2021); IOC RED-S Consensus (2018/2023);
           Physiology of Sport and Exercise (Wilmore & Costill)
Confiança: ALTA
```

⚠️ **Discrepância pequena com Nutrição 4.2 #1.** Aquela resposta (RED-S) deu
o piso em 6-8% homens/14-16% mulheres; esta dá 5-6%/12-14%. Diferença de
1-2 pontos percentuais, provavelmente por serem fontes independentes a
arredondar o mesmo intervalo real de forma diferente. Mesma regra: fica o
**mais alto** (mais cedo a soar o alarme) — 6-8% homens, 14-16% mulheres —
como já estava.

#### #7 — "Peso de prova" em amadores

```
Valor:     Perder só gordura melhora VO2máx relativo em ~1,0% por cada 1,0%
           de gordura perdida — ~1,4-2,0 seg/km por kg de gordura.
           MAS: 15-30% de prevalência de comportamento alimentar
           desordenado (EAT-26) em corredores recreativos incentivados a
           atingir "peso ideal de corrida".
           Iniciante/Básico: NÃO promover — foco 100% em regularidade e
           hábitos. Médio/Avançado: só com suporte nutricional
           especializado, base de treino estável, e disponibilidade
           energética ≥45 kcal/kg LBM/dia mantida.
Fonte:     Racing Weight (Fitzgerald, 2012); IOC Consensus on Eating
           Disorders in Sport (2018); Female Athlete Triad/RED-S Coalition
           (Joy, 2014)
Confiança: ALTA
```

**Resolve a pergunta que tinha ficado marcada como "decisão de produto, não
só doutrina".** Já não é preciso decidir às cegas — há dado epidemiológico
real (15-30% de prevalência de comportamento desordenado) a apontar a
resposta: nunca promover a iniciante/básico, e mesmo em médio/avançado só
com salvaguardas explícitas.

#### #8 — Gordura visceral: limiares e correspondência clínica

```
Escala Renpho (1-59): 1-9 saudável (<100 cm² área visceral) · 10-14 alerta
           (100-130 cm²) · ≥15 risco elevado (>130 cm²)
Clínico:   Perímetro de cintura ≥94 cm homens/≥80 cm mulheres (risco);
           ≥102/≥88 cm (risco muito alto). Rácio cintura/anca >0,90 homens/
           >0,85 mulheres.
Condições: A escala da balança é só rastreio; o perímetro tem precedência
           médica para avaliação real de risco cardiovascular.
Fonte:     WHO Waist Circumference and Waist-Hip Ratio Report (2011);
           Renpho BIA Technical Standards; NCEP-ATP III Criteria
Confiança: ALTA
```

✅ **Implementável já, com reserva.** `body_assessments.visceral_fat` existe
e a escala 1-59 tem agora bandas de ação claras (≥15 = risco elevado). O
padrão-ouro clínico (perímetro de cintura, rácio cintura/anca) não é
capturável — não há campos para isso — mas não é preciso: a escala Renpho
sozinha já dá um sinal acionável.

#### #9 — Água corporal: faixa e queda súbita

```
Valor:     Faixa normal: 50-65% homens (mais massa muscular = limite
           superior), 45-60% mulheres.
           Queda súbita: >1,5-2,0% em 24-48h (ou >1,5 kg de massa hídrica)
           = desidratação aguda ou depleção de glicogénio (1g glicogénio
           retém ~3g água) — degrada 3-5% da capacidade aeróbica de
           imediato.
Fonte:     ACSM Position Stand — Exercise and Fluid Replacement (2007);
           Sports Nutrition 3rd Ed (Jeukendrup, 2018)
Confiança: ALTA
```

#### #10 — Precedência: TMB da balança vs. fórmula

```
Valor:     Fórmula (Mifflin-St Jeor ou Cunningham) tem PRECEDÊNCIA ABSOLUTA
           sobre o TMB da balança. Erro da balança: 15-25% (±250-400
           kcal/dia) — não mede VO2 basal nem usa calorimetria indireta.
Fonte:     Mifflin (Am J Clin Nutr, 1990); Dehghan & Merchant (2008); ACSM
           Guidelines (2021)
Confiança: ALTA
```

**Confirma Nutrição 4.1 #4 ao dígito — não é achado novo.** Mesma pergunta,
mesma resposta, fonte em comum (Dehghan & Merchant, ACSM). Não requer ação
adicional; já estava decidido.

#### #11 — Sinais de sobretreino em métricas corporais

```
Valor:     1. Queda súbita de peso >1,5-2,0% em 48-72h sem défice
              voluntário (depleção de glicogénio + catabolismo).
           2. Queda de água corporal >1,0-1,5% ao longo de 3-5 dias.
           3. FC de repouso +≥5-7 bpm acima da média de 7 dias, ≥3 dias.
           4. HRV (rMSSD): queda >1,5 DP da linha de base, ≥3 dias.
Condições: Medido ao acordar, em repouso absoluto, antes de cafeína/líquidos.
Fonte:     ECSS/ACSM Consensus on overtraining (Meeusen, 2013); Training
           adaptation and heart rate variability (Plews, 2013); Lore of
           Running 4th Ed (Noakes, 2003)
Confiança: ALTA
```

**Estende Corrida 2.4 #2, não duplica.** Os sinais #3 e #4 (FC repouso, HRV)
são exatamente os mesmos já registados ali — mesmos limiares, fontes em
comum (Meeusen, Plews). Os sinais #1 e #2 (queda de peso, queda de água) são
**novos**, específicos de métricas corporais. Junto com o `resting_hr_bpm`
já disponível, ficam 3 dos 4 sinais parcialmente ao alcance: peso e água
vêm de `body_assessments`, FC de repouso do perfil. Só o HRV continua fora
de alcance (exige wearable, não um print).

---

**Bloco 5 fechado.** Restam duas discrepâncias pequenas registadas (#4 e #6,
ambas resolvidas pela regra do valor mais conservador) e uma ambiguidade de
mapeamento (#1, `muscle_mass_kg`). Falta só o Bloco 6 (Head Coach) para a
investigação estar completa.

### Bloco 6 — Head Coach: arbitragem e comunicação (registo)

Cinco perguntas, fontes canónicas (Fitzgerald, Burke, ACSM, IOC REDs CAT,
Meeusen, Magill & Anderson, Wulf, NSCA, Daniels, Blagrove, Issurin,
Verkhoshansky & Siff, Bompa), confiança ALTA em todas.

**Este bloco vinha marcado no questionário como "parcialmente de produto, não
de literatura pura" — e essa reserva revelou-se desnecessária.** As cinco
perguntas voltaram com fontes canónicas e números concretos, incluindo as de
comunicação, que assentam em literatura de aprendizagem motora (Magill,
Wulf). Não é preciso decidir nada por intuição.

#### #1 — Conflito entre composição corporal e prova

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

#### #2 — Hierarquia de alarmes

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

#### #3 — Quantidade de informação e vocabulário, por nível

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

#### #4 — Temas contraindicados por nível

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

#### #5 — Frequência de ajuste do plano

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

---

## 🏁 Investigação completa

Todos os blocos estão fechados: **0** (níveis), **1** (viabilidade), **2**
(corrida: 2.1-2.4), **3** (ginásio), **4** (nutrição: 4.1-4.3), **5**
(corpo), **6** (head coach). ~70 perguntas, esmagadora maioria com confiança
ALTA e fontes canónicas.

### O que fazer a seguir

1. **Converter em `src/coach-knowledge/`** — `_comum.md` (Bloco 6 #3 e #4 dão
   quase por inteiro as regras de comunicação e a lista de exclusão), mais um
   ficheiro por especialista.
2. **Fechar as três decisões pendentes** listadas ao longo do documento:
   E1 (hora do dia em treinos, para a regra de interferência do Ginásio #4),
   N1 (metas fixas vs. derivadas — parcialmente resolvida pela discussão do
   plano de treino), e a ambiguidade de `muscle_mass_kg` no Bloco 5 #1.
3. **Definir o vocabulário de vereditos** (PRD 3.6.1) — as flags que os
   especialistas emitem. Os blocos registados já nomeiam candidatas ao longo
   do texto (`sobrecarga`, `objetivo_inviavel`, `defice_excessivo`,
   `risco_lesao`, ...).

### Padrões que emergiram da recolha

- **Convergência entre fontes independentes**: o ritmo de perda de peso
  apareceu quatro vezes, por caminhos diferentes, sempre no mesmo intervalo.
  O mesmo com o limiar de 10%/semana de aumento de volume (Gabbett, em
  corrida e ginásio). Quando isso acontece, a confiança no número é maior do
  que a etiqueta "ALTA" sozinha sugere.
- **A literatura sabe muito mais do que a app consegue medir.** Vários
  achados de alto valor — HRV, assimetria de passada, ferritina, sintomas
  clínicos — exigem dados que não capturamos, e em vários casos **não
  devemos** capturar (informação clínica sensível). A doutrina deve incluí-los
  na mesma, para o coach saber reagir quando o atleta os mencionar no chat.
- **Duas lacunas de dados repetiram-se em perguntas independentes**: FC de
  repouso (pedida por Karvonen e por sobretreino — entretanto resolvida) e
  temperatura ambiente (pedida pelo sódio e pelo filtro de falso-positivo de
  fadiga — continua em aberto).

---

# BLOCO 7 — Sugestões alimentares

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

## Respostas

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

## Balanço do Bloco 7

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

---

# BLOCO 8 — Nível específico por prova, e trail

## Porque existe este bloco

O Bloco 0 definiu os níveis com critérios **transversais** (volume semanal,
anos de prática, ritmo aos 5 km). O Bloco 1 indexou semanas e volume
pré-requisito por **distância**. Faltava o eixo que o produto sempre
pressupôs mas nunca investigou: o nível **para uma prova concreta**, que pode
divergir do geral — o exemplo estava escrito no contexto do próprio Bloco 1
("avançado em estrada, iniciante na primeira prova de trail"), mas nenhuma
pergunta o cobria.

A consequência em produção foi visível: `ExperienceLevelHelp.jsx` serve os
MESMOS critérios transversais nos dois sítios onde o atleta declara o nível
(Perfil e Agenda de Provas). O atleta não tinha como responder à segunda
pergunta com outro critério que não o da primeira.

## Desafio crítico que reorientou o bloco (2026-08-27)

A primeira formulação das perguntas pedia pré-requisitos de trail por **banda
de distância**. As fontes rejeitaram a premissa:

> A regra "100 m D+ ≈ 1 km plano" é perigosa se for usada para estruturar o
> volume de treino semanal ou semanas de preparação. Se a utilizares para
> ditar volume, vais prescrever cargas cardiovasculares irrealistas e ignorar
> o dano neuromuscular (excêntrico). No trail, a métrica soberana para
> planear carga de treino é o Tempo em Pé (Time on Feet), não a quilometragem
> equivalente.

Isto valida — por uma razão mais funda — a decisão já tomada em
`src/utils/racePlanEngine.js`, que evita o equivalente ITRA para semanas de
preparação. Mas condena o fallback escolhido: usar distância em bruto também
não é a resposta certa. O estado anterior era "acidentalmente não-errado, e
ainda assim não certo".

## Respostas

### #1 e #2 — Eixo de exigência e bandas qualitativas

```
Pergunta:  Bloco 8 #1/#2 — eixo de exigência do trail e bandas
Valor:     O eixo mais robusto para separar treinos/provas independentemente
           da distância é o RÁCIO DE DESNÍVEL (metros de D+ por quilómetro).
           Pontos ITRA servem para categorizar o esforço global (volume + D+),
           mas falham na tipologia do terreno.
           - Banda 1 — Rolante/Rápido ("estradão"): <25 m/km (ex.: 20 km com
             400 m D+). Foco no ritmo aeróbico; transição fácil da estrada.
           - Banda 2 — Ondulado/Trail médio: 25-50 m/km (ex.: 30 km com
             1000 m D+). Exige caminhada tática nas subidas mais íngremes;
             corre-se a maior parte.
           - Banda 3 — Montanha: 50-80 m/km (ex.: 40 km com 2500 m D+).
             Alternância constante; forte exigência excêntrica nas descidas;
             uso frequente de bastões.
           - Banda 4 — Alta montanha/Skyrunning: >80 m/km (ex.: 20 km com
             2000 m D+). Progressão lenta, terreno altamente técnico, corrida
             apenas em secções limitadas.
Condições: Limiares aplicados à altimetria geral da prova.
Fonte:     UESCA Trail Running Certification; ITRA (International Trail
           Running Association) Technical Guidelines
Confiança: ALTA
```

### #3 — Pré-requisitos de volume e D+ semanal, por nível

```
Pergunta:  Bloco 8 #3 — volume e D+ semanal pré-requisito [POR NÍVEL]
Iniciante: Volume semanal equivalente a 70-80% do TEMPO projetado da prova.
           D+ semanal acumulado igual a 30-50% do D+ da prova.
Básico:    Volume semanal 90-100% do tempo projetado. D+ semanal 50-70% do
           D+ da prova.
Médio:     Volume semanal 110-130% do tempo projetado. D+ semanal 80-100% do
           D+ da prova.
Avançado:  Volume semanal >140% do tempo projetado. D+ semanal 100-150% do
           D+ da prova, com sessões específicas de downhill (dano excêntrico).
Condições: Pressupõe o MICROCICLO DE PICO, 3-4 semanas antes da prova. Os
           valores são RELATIVOS à prova alvo, não absolutos. Em provas de
           ultra-distância (>50 km) o tempo semanal exigido estabiliza
           (cap 10-14 h/semana) para evitar burnout.
Fonte:     Jason Koop — Training Essentials for Ultrarunning (planeamento de
           volume); UESCA Trail Running Certification Manual (prescrição de
           carga); norma CTS (Carmichael Training Systems)
Confiança: ALTA
```

### #4 — A equivalência "100 m de D+ ≈ 1 km plano"

```
Pergunta:  Bloco 8 #4 — validade da conversão de trail para plano
Valor:     ADEQUADA apenas para estimar tempo de prova (pacing) e gasto
           calórico/nutrição. Ex.: a 5:00/km no plano, uma prova de 20 km com
           1000 m D+ calcula-se como 30 km de esforço plano (~2h30).
           FALHA GRAVEMENTE para dimensionar plano de treinos, volume semanal
           ou semanas de preparação — a carga biomecânica de subir e descer
           montanha não é simulável a correr quilómetros planos.
           FORMULAÇÃO CORRETA para o motor de planeamento: converter o esforço
           da prova em HORAS estimadas e dimensionar semanas de preparação e
           treinos longos com base no TEMPO EM PÉ, emparelhado com o
           cumprimento do rácio D+/km (#1).
Condições: A omissão que a torna inválida para treino é a variável do tempo
           de impacto.
Fonte:     ITRA (fórmula original de esforço de prova / pontos UTMB);
           Guillaume Millet — Ultramarathon Safety and Performance (crítica à
           transposição direta para volume de treino)
Confiança: ALTA
```

### #5 — Critérios objetivos exclusivos do trail

```
Pergunta:  Bloco 8 #5 — vetores que não existem na estrada
Valor:     1. CARGA EXCÊNTRICA (capacidade de descida): os quadríceps
              suportam 5-7x o peso corporal em declives acentuados. A quebra
              muscular nas descidas é a causa n.º 1 de DNF.
           2. TERRENO E AGILIDADE (propriocepção): lama, raízes, pedra solta.
              Um atleta pode ter VO2máx de elite na estrada e ser lento na
              montanha por travagem constante.
           3. TÁTICA DE CAMINHADA (power hiking): no trail caminhar é uma
              marcha engrenada, não descanso. Eficiência biomecânica do power
              hike em subidas >10% de inclinação.
           4. EQUIPAMENTO E AUTONOMIA: mochila de 1,5-2,5 kg, uso eficiente de
              bastões (timing bípede vs. alternado), autossuficiência
              hídrica/alimentar entre abastecimentos.
Fonte:     Guillaume Millet et al. (fadiga neuromuscular e dano por contrações
           excêntricas prolongadas); Jason Koop (eficiência metabólica da
           caminhada em inclinações >10%)
Confiança: ALTA
```

### #6 — Histórico de prova preditivo, por nível

```
Pergunta:  Bloco 8 #6 — histórico de PROVA preditivo [POR NÍVEL]
Iniciante: 0 provas na distância/banda de D+. O tempo-alvo é o cut-off.
Básico:    1-2 provas concluídas em banda de D+ ou distância INFERIOR nos
           últimos 12 meses. Sem estratégia de prova; correu por sensações.
Médio:     3+ provas concluídas na mesma distância/banda de D+. Tem métricas
           do tempo passado, posição no terço superior (top 30-50%) e
           nutrição documentada (g/hora de HC).
Avançado:  Histórico recente (<6 meses) em provas similares. Divisões de
           ritmo documentadas (geriu esforço no primeiro terço, negative
           split). O fator preditivo não é o volume concluído, mas o
           DESACOPLAMENTO AERÓBICO durante a última prova.
Fonte:     Joe Friel — The Ultra Trail Runner's Bible; princípios de triagem
           de atletas da UESCA
Confiança: ALTA
```

### #7 — Nível divergente por prova, e triagem rápida

```
Pergunta:  Bloco 8 #7 — legitimidade do nível por prova e questionário curto
Valor:     ESTRITAMENTE LEGÍTIMO. O princípio da Especificidade dita que a
           base cardiovascular é transferível, mas a adaptação biomecânica
           local (tendões, ligamentos, resistência à fadiga periférica) NÃO é.
           Três perguntas de triagem, que cruzam as três variáveis
           inegociáveis:
           1. "Qual foi o teu treino mais longo (em horas) nas últimas 4
              semanas em terreno semelhante (rácio D+/km)?"
              → valida o Tempo em Pé recente (carga aguda).
           2. "Quantos metros de D+ acumulaste, em média, por semana no
              último mês?"
              → valida a tolerância mecânica (excêntrica e concêntrica).
           3. "Nos últimos 6 meses concluíste alguma prova com distância E
              desnível dentro de 20% desta prova alvo?"
              → valida a experiência direta (especificidade tática).
Condições: Cruzando as três, o algoritmo classifica se, PARA AQUELA PROVA, o
           atleta tem infraestrutura de Avançado ou volta a Iniciante.
Fonte:     Princípio fisiológico da Especificidade (ACSM); diretrizes de
           onboarding de atletas da CTS (Carmichael Training Systems)
Confiança: ALTA
```

## Índice de Cobertura Excêntrica (ICE) — métrica derivada

Proposta pelas fontes como mitigação do caso mais perigoso: o corredor de
estrada com motor cardiovascular alto e D+ semanal quase nulo, que transita
para trail. O VO2máx dele não o protege da rutura muscular nas descidas.

```
ICE = D+_treino_semanal / D+_prova
```

Exemplo das fontes: maratonista de 3 h (Avançado), 70 km/semana mas só 300 m
D+/semana, inscreve trail de 30 km com 1500 m D+. `ICE = 300/1500 = 0,20` →
o sistema impede a importação do perfil "Avançado" e trata-o como Iniciante
de trail, bloqueando pacing agressivo e prescrevendo power hiking.

**Penalização de passadeira** (proposta pelas fontes): D+ obtido em passadeira
inclinada deveria contar a 50%, porque elimina a componente de descida —
prepara os pulmões e deixa os quadríceps vulneráveis. **Não se aplica a este
produto** (esclarecido pelo utilizador, 2026-08-27): `runs` só regista piso
estrada/trail — nunca passadeira; um treino de passadeira é registado como
treino de GINÁSIO, em texto livre, e nunca alimenta `elevation_gain_m`. O
D+ de uma corrida é sempre D+ real, por construção. Ver "Passadeira — não é
uma limitação deste sistema" em [specs/nivel-por-prova.md](nivel-por-prova.md).

## Decisões tomadas sobre as respostas (2026-08-27)

Três lacunas nas respostas obrigaram a decisões nossas. Ficam registadas
como DECISÃO DE PROJETO, não como doutrina citada — a distinção importa para
quem ler o código depois.

**1. Bandas com buracos.** As percentagens da #3 deixam intervalos por
cobrir: no eixo D+ falta 70-80%; no eixo tempo faltam 80-90%, 100-110% e
130-140%. Regra adotada: **cada banda estende-se para cima até ao piso da
banda seguinte**, o que faz o atleta cair sempre no nível MAIS BAIXO dos dois
candidatos. Deriva do princípio de segurança que o projeto já aplica em
`EXPERIENCE_TIEBREAK_HINT` ("escolhe o mais baixo") e em `taper.ts` ("limite
superior da gama, mais conservador"). Não vem das fontes.

**2. Pico vs. média.** A #3 é explicitamente do microciclo de PICO, mas a
triagem mede as últimas 4 semanas. Comparar média contra alvo de pico
sub-avalia sistematicamente. Regra adotada: usar a **2.ª semana mais alta das
últimas 4** — mantém a leitura orientada ao pico e exclui por construção uma
rajada isolada (uma semana isolada nunca é a segunda mais alta). Com menos de
3 semanas de dados, tratar como não avaliável e assumir o nível mais baixo.
Decisão de engenharia, não vem das fontes.

**3. Limiares do ICE vs. bandas da #3.** Os limiares propostos para o ICE
(0,80 / 0,40) não coincidem exactamente com as bandas de D+ da #3 (80% /
30%). Adotadas as **bandas da #3**, que são a resposta com fonte citada; o
ICE fica como o cálculo do eixo D+, não como escala própria. Pela mesma
razão, abandonou-se o mecanismo de "cortar um grau": cortar um grau pode
aterrar o atleta num nível cujo pré-requisito também não cumpre (um Avançado
com ICE 0,75 cai para Médio, que exige 80-100%). Atribui-se diretamente o
nível da banda ocupada.

## Balanço do Bloco 8

Fecha a lacuna que o Bloco 0 deixou em aberto e que o Bloco 1 pressupôs sem
resolver. Sete perguntas, todas com fonte e confiança ALTA.

O achado com maior consequência de produto não é doutrinário mas de dados: as
três perguntas de triagem da #7 são **computáveis a partir do que já está
guardado** (`runs.duration_seconds` 62/62, `runs.details.elevation_gain_m`
59/62, `race_events` com `status='concluida'`). O nível por prova deixa de ter
de ser adivinhado pelo atleta — passa a ser medido e proposto, com a evidência
à vista, ficando a auto-declaração como confirmação ou override justificado.

Isto resolve de caminho o incentivo perverso identificado na análise que
originou o bloco: declarar-se acima do nível real encolhia o alarme de
viabilidade e subia a carga prescrita, sem nada no sistema que o
contradissesse.

Especificação do motor: [specs/nivel-por-prova.md](nivel-por-prova.md).
