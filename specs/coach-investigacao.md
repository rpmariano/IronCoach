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

## Respostas registadas

### Bloco 0 #1 — Critérios objetivos de separação de níveis

```
Pergunta:  Bloco 0 #1 — critérios objetivos por nível
Iniciante: Frequência ≥3-4 sessões/semana. Ritmo de maratona (quando existir
           histórico de prova) >4:30h. VO2max de referência ~54/50 ml/kg/min
           (H/M) — sinal secundário, não pedido no onboarding.
Básico:    Ritmo de maratona 3:45h-4:30h. VO2max ~62/56 ml/kg/min (H/M).
           Sem dado de volume/frequência/anos próprio deste nível.
Médio:     Ritmo de maratona 3:00h-3:45h. VO2max ~71/62 ml/kg/min (H/M).
           Sem dado de volume/frequência/anos próprio deste nível.
Avançado:  ≥2 anos de prática consistente. Ritmo de maratona <3:00h.
           VO2max ~75/67 ml/kg/min (H/M).
Condições: Ritmos de maratona assumem prova plana de estrada. VO2max medido
           em teste incremental a 14 km/h em passadeira — não comparável a
           estimativas de relógio sem ajuste. NENHUM valor de volume semanal,
           corrida mais longa, frequência (fora do iniciante) ou anos de
           prática (fora do avançado) foi encontrado com corte por nível —
           o corpus é de planos de treino, não de classificação de corredores.
Fonte:     Running economy (Wikipedia); Treino para Maratona — Performance
           Running; Periodização para ultramaratona (Cristiano Fetter);
           VO2 Max Chart by Age & Gender (ACSM + 15K Powertests)
Confiança: MÉDIA nos números que existem (ritmo de maratona, VO2max);
           SEM DADO nos critérios que o onboarding mais precisava
           (volume, frequência fora do iniciante, anos, corrida mais longa)
```

**Veredito**: insuficiente para desenhar o onboarding sozinho. Ritmo de maratona
não serve de pergunta de onboarding — a maioria dos iniciantes nunca correu
uma maratona, e são precisamente quem mais precisa de ser classificado. VO2max
não é pedível a um utilizador (exige teste de laboratório); fica como sinal
secundário para quando `runs.details.vo2_max` já existir no histórico (relógio),
nunca como pergunta direta. Ver proposta de produto mais abaixo.

### Bloco 0 #2 — Ponderação de critérios em contradição

```
Pergunta:  Bloco 0 #2 — que critério pesa mais quando se contradizem
Valor:     NÃO ENCONTRADO para uma regra de desempate de classificação.
Condições: A fonte não resolve a pergunta feita, mas responde a uma pergunta
           adjacente e mais valiosa: o risco de lesão é guiado pela TAXA de
           aumento de carga, não pelo volume absoluto nem pelos anos de
           prática. Rácio de carga aguda:crónica (ACWR) seguro exige que o
           aumento semanal de quilometragem não exceda 10% face à semana
           anterior, independentemente do nível de partida.
Fonte:     How to Prevent Running Injuries: The Evidence-Based Guide
           (Runners Connect); Periodização para ultramaratona (C. Fetter)
Confiança: BAIXA para a pergunta original (não encontrada); MÉDIA para o
           achado adjacente do ACWR.
```

**Redireciona para Corrida 2.1 #1** ("aumento máximo de volume semanal antes
de o risco de lesão subir") — é aí que este valor pertence, não no Bloco 0. O
limiar de 10%/semana é um primeiro dado real para essa pergunta; falta ainda
saber se difere por nível (a fonte não distingue).

### Bloco 0 #3 — Perguntas de onboarding preditivas do nível

```
Pergunta:  Bloco 0 #3 — questionário curto de perfil
Valor:     NÃO ENCONTRADO. O corpus não contém nenhum questionário de
           autoclassificação de nível — só protocolos adjacentes sem uso
           aqui (check-in de periodização, taxa de sudorese, teste de VO2max
           laboratorial).
Confiança: — (pergunta de produto, não de literatura; ver proposta abaixo)
```

**Isto não é uma lacuna a preencher com mais pesquisa — é uma decisão de
produto.** Nenhuma literatura vai desenhar o formulário de onboarding por nós;
isso é UX de app de fitness, não ciência do desporto. Proposta a validar:

| Pergunta ao utilizador | Aponta para |
|---|---|
| Há quanto tempo corres com regularidade? (nunca / <6 meses / 6m-2 anos / >2 anos) | avançado exige ≥2 anos (único corte que a literatura deu) |
| Quantos treinos de corrida fazes por semana, tipicamente? (0-1 / 2-3 / 4-5 / 6+) | iniciante ≈3-4/semana (único corte que a literatura deu) |
| Já correste alguma prova oficial? Se sim, qual foi o teu tempo? (campo livre, opcional) | cruza com as faixas de ritmo de maratona quando existir, sem penalizar quem nunca correu |
| Consegues correr 30 minutos seguidos sem parar? (sim / não / às vezes) | corte prático para "iniciante" que nenhuma fonte deu, mas que qualquer treinador recreativo usa — sinaliza quem ainda está no método caminhada/corrida |

As duas últimas são preenchimento de bom senso de treino, não de uma fonte —
marcadas como tal para não se confundirem com as respostas da investigação.
**Por validar contigo antes de implementar**: a lógica de mapear respostas a
um nível (ex.: quantas destas quatro precisam de bater para "avançado") ainda
não está decidida.

O campo **Confiança** não é decorativo: limiares de confiança baixa devem gerar
linguagem mais suave na doutrina ("considera", "pode valer a pena") em vez de
afirmações categóricas.

**Quando a literatura não diferenciar por nível, registá-lo** — "sem
diferenciação encontrada" é uma resposta válida e evita que se invente uma.
