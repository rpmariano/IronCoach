# Questionário de Investigação — Doutrina dos Coaches (IronHealth)

Documento de trabalho para a fase de revisão de literatura (NotebookLM).
Cada pergunta aqui **exige uma resposta numérica ou uma regra de decisão** — não
prosa. Uma resposta do tipo *"o aumento deve ser gradual"* é uma não-resposta:
o código não a consegue avaliar.

Ao responder, registar sempre: **valor + unidade + janela de referência + fonte**.

O output desta fase alimenta os ficheiros de doutrina em `src/coach-knowledge/`.
Este documento fica em `specs/` porque é instrumento de investigação e registo
de proveniência — não é carregado em runtime.

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

### Que já existiam (e eu tinha dado por ausentes)

| Campo | Onde |
|---|---|
| RPE do ginásio | `workout_sessions.exertion` (smallint 1-10), equivalente a `runs.effort_rpe` |
| Grupo muscular | `workout_sessions.categories` (text[]) — `Peito`, `Costas`, `Pernas`, `Ombros`, `Bíceps`, `Tríceps`, `Glúteos`… Ao nível da sessão, não do exercício |
| Métricas de sessão | `workout_sessions` tem `duration_seconds`, `calories_kcal`, `avg_hr`, `max_hr` |

### Ainda em aberto

| Lacuna | Onde | O que bloqueia |
|---|---|---|
| **Hora real da refeição** | `meals.meal_type` é um slot (`almoco`, `lanche`…), não um timestamp | Nutrição peri-treino com precisão horária |
| **Histórico de lesões / nível de experiência** | Não existe | Ajuste de limiares ao indivíduo; um novato e um veterano não partilham limiares |
| **Grupo muscular por exercício** | `categories` é da sessão inteira; `workout_session_sets.exercise_name` continua texto livre | Volume por grupo com precisão de exercício — mas o nível de sessão pode chegar |

> Nota: `runs.details` (jsonb) já guarda `elevation_gain_m`, `cadence_spm`,
> `avg_heart_rate_bpm`, `max_heart_rate_bpm`, `vo2_max` e `hr_zones` extraídos
> dos prints. Disponíveis, mas só quando o print os mostra — qualquer limiar que
> dependa deles precisa de um caminho alternativo para quando faltarem.

---

## 🟣 Corrida

Campos disponíveis: `distance_km`, `duration_seconds`, `training_type` (contínuo,
longo, tempo, recuperação, fartlek, intervalos, subidas, trail, técnico),
`effort_rpe` (1-10), `split_5k/10k/21k_seconds`, `kind` (treino/competição),
`details.elevation_gain_m`, `details.cadence_spm`, `details.avg_heart_rate_bpm`.
Da prova: `race_events.date`, `race_type`, `distance_km`, `target_time_seconds`,
`target_pace_seconds_per_km`. Do perfil: `birth_date`.

1. **Qual o aumento máximo de volume semanal antes de o risco de lesão subir?**
   Percentagem, e sobre que janela de comparação (semana anterior? média de 4 semanas?).
   Existe uma métrica de rácio agudo:crónico com faixa segura definida? Quais os limites.
   → alimenta: flag `sobrecarga`

2. **Qual a distribuição de intensidade recomendada?**
   % do volume semanal em baixa intensidade vs alta. Como classificar cada
   `training_type` nessas categorias.
   → alimenta: flag `distribuicao_intensidade`

3. **Taper: quantos dias antes da prova, e que redução?**
   Resposta por distância (10k / 21k / 42k / ultra / trail). % de corte de volume
   e o que acontece à intensidade (mantém-se? reduz?).
   → alimenta: doutrina do head coach, gatilho proativo pré-prova

4. **Trail: qual o fator de conversão entre desnível acumulado e distância plana?**
   Quantos metros de D+ equivalem a 1 km plano em custo fisiológico. Se o fator
   variar com o declive, dar a tabela.
   → alimenta: cálculo de carga em trail (hoje uma corrida de trail de 10 km conta
   como 10 km, o que subestima a carga)

5. **Qual o volume máximo que o treino longo deve representar da semana?**
   % do volume semanal total.
   → alimenta: flag `longao_desproporcionado`

6. **Que discrepância entre RPE e pace constitui sinal de fadiga acionável?**
   Ex.: RPE ≥ N com pace ≥ X% acima da média recente. Precisa de um limiar concreto.
   → alimenta: flag `fadiga`

7. **Quantos dias de recuperação após esforço máximo, por distância?**
   Tabela: após 10k em competição, após meia, após maratona, após ultra.
   → alimenta: gatilho proativo pós-prova, flag `recuperacao_insuficiente`

8. **Zonas de FC: que fórmula usar?**
   A idade já está disponível (`profiles.birth_date`). Falta decidir a fórmula, e
   se vale mais usar as `hr_zones` que o próprio relógio reporta — se o utilizador
   fez teste de esforço, essas batem melhor que qualquer fórmula.
   → alimenta: cálculo de zonas, flag `zona_errada`

9. **Regresso após interrupção: quanto reduzir por semanas parado?**
   Regra: após N semanas sem correr, retomar a X% do volume anterior.
   → alimenta: flag `regresso_de_pausa`

10. **Cadência: existe faixa alvo defensável, ou é individual?**
    Se for individual, dizê-lo explicitamente — para o coach não comentar cadência
    com base num número universal que não existe.
    → alimenta: decidir se a cadência é sequer comentável

---

## 🟢 Nutrição

Campos disponíveis, por 100g e por refeição: `calories`, `protein`, `carbs`, `fat`,
`fiber`, `sugar`, `sodium`, `iron_mg`, `calcium_mg`, `vitamin_c_mg`, `potassium_mg`.
Metas em `profiles`: `calorie_goal`, `protein_goal`, `carbs_goal`, `fat_goal`.

1. **Proteína: g/kg de peso corporal, por objetivo.**
   Valores separados para: perda de gordura, manutenção, hipertrofia — e o ajuste
   para quem faz volume de endurance em simultâneo.
   → alimenta: cálculo da meta, flag `proteina_insuficiente`

2. **Qual o défice calórico máximo sem perda de massa magra nem quebra de performance?**
   Em kcal/dia e em % da manutenção. Como se altera em semanas de treino intenso.
   → alimenta: flag `defice_excessivo`

3. **Hidratos: g/kg em dia de treino vs dia de descanso.**
   E o protocolo de carga pré-prova: quantos dias antes, que quantidade.
   → alimenta: flag `hidratos_insuficientes`, gatilho pré-prova

4. **Gordura: qual o mínimo abaixo do qual há risco hormonal?**
   g/kg ou % das calorias. Este é um limiar de segurança, não de otimização.
   → alimenta: flag `gordura_abaixo_do_minimo` (alarme, não sugestão)

5. **Nutrição peri-treino: o que e quanto, antes e depois?**
   ⚠️ Só existe granularidade de slot (`almoco`, `lanche`), não hora exata.
   Dar a resposta em termos de "refeição anterior/seguinte ao treino".
   → alimenta: doutrina; possivelmente decisão de schema

6. **Fibra: alvo diário, e limite nas 24-48h pré-prova.**
   São dois números diferentes e opostos — ambos necessários.
   → alimenta: flag `fibra_baixa`, gatilho pré-prova

7. **Sódio: reposição por hora de treino, e como concilia com o limite de saúde geral.**
   mg/hora em treino longo/calor vs mg/dia recomendado. Explicar como resolver o conflito.
   → alimenta: doutrina de arbitragem interna

8. **Ferro: limiar de ingestão de preocupação para corredores.**
   mg/dia, com valor separado por sexo. Corrida de longa distância tem impacto conhecido.
   → alimenta: flag `ferro_baixo`

9. **Ritmo máximo de perda de peso sem prejudicar performance.**
   %/semana do peso corporal.
   → alimenta: partilhado com o coach de Corpo — flag `perda_rapida_demais`

10. **Hidratação: ml/kg base + reposição por hora de treino.**
    → alimenta: metas de água (já existe `water_logs`)

---

## 🟡 Ginásio

Campos disponíveis: por série `exercise_name` (texto livre), `reps`, `weight`,
`set_index`; por sessão `categories` (grupos musculares / tipo de aula), `kind`
(`forca`/`aula`), `exertion` (RPE 1-10), `duration_seconds`, `calories_kcal`,
`avg_hr`, `max_hr`.

> O volume por grupo muscular é computável ao nível da **sessão** (via
> `categories`), não do exercício. As perguntas abaixo devem ser respondidas
> nessa granularidade — se a resposta exigir precisão por exercício, dizê-lo,
> porque implica mapear `exercise_name` para grupo.

1. **Volume semanal por grupo muscular: quantas séries para hipertrofia, e quantas para manutenção?**
   Os dois números são muito diferentes e o segundo é o que interessa durante um
   bloco de preparação de prova.
   → alimenta: flag `volume_insuficiente` / `volume_excessivo`

2. **Progressão de carga: que incremento e com que frequência?**
   % ou kg absolutos, e o critério para progredir (completou todas as reps? RPE abaixo de X?).
   → alimenta: recomendação acionável — a peça mais útil deste especialista

3. **Intervalo mínimo entre sessões do mesmo grupo muscular.**
   Horas ou dias, e se varia com o volume da sessão.
   → alimenta: flag `recuperacao_insuficiente`

4. **Interferência: qual o intervalo mínimo entre treino de pernas e treino de qualidade de corrida?**
   Esta é a pergunta mais importante do módulo — é a que resolve o conflito entre
   os dois especialistas. Precisa de número em horas.
   → alimenta: **arbitragem do head coach**

5. **Que aumento de volume-carga semanal (Σ reps × peso) sinaliza risco?**
   %/semana. É a única métrica de carga computável com os campos atuais.
   → alimenta: flag `sobrecarga`

6. **Faixas de repetições por objetivo (força / hipertrofia / resistência).**
   → alimenta: interpretação do que o utilizador está a fazer sem lho perguntar

7. **Volume mínimo para preservar força durante um bloco de prova.**
   Quando a corrida manda, quanto do ginásio se pode cortar sem perder o ganho.
   → alimenta: doutrina do head coach na fase de taper

8. **Treino até à falha: que proporção das séries, e qual o custo de recuperação?**
   → alimenta: doutrina

---

## 🔵 Corpo

Campos disponíveis (Renpho, todos opcionais): `weight_kg`, `bmi`, `body_fat_pct`,
`skeletal_muscle_pct`, `muscle_mass_kg`, `body_water_pct`, `protein_pct`,
`bone_mass_kg`, `bmr_kcal`, `visceral_fat`, `subcutaneous_fat_pct`,
`metabolic_age`, `lean_body_mass_kg` + `classifications` (jsonb).

1. **Quais destas 13 métricas são fiáveis por bioimpedância e quais são estimativa fraca?**
   Esta é a **pergunta mais importante do módulo**. Uma balança de bioimpedância
   mede impedância e infere o resto por fórmula proprietária. Se `protein_pct` ou
   `metabolic_age` forem essencialmente ruído, o coach não pode construir
   recomendações sobre eles — e neste momento nada o impede.
   → alimenta: lista de métricas que o coach pode citar vs ignorar

2. **Variação de peso: que % em quantos dias é sinal real e não flutuação de água?**
   → alimenta: flag `tendencia_peso`, filtro de ruído

3. **Quantos dias de média móvel são precisos para uma tendência de peso fiável?**
   → alimenta: como calcular a tendência antes de a comentar

4. **Perda de gordura: ritmo saudável em %/semana.**
   Cruzar com a pergunta 9 da Nutrição — devem dar o mesmo número.
   → alimenta: flag `perda_rapida_demais`

5. **Ganho de massa muscular: ritmo realista por nível de experiência.**
   kg/mês. Serve sobretudo para o coach não prometer o impossível.
   → alimenta: calibração de expectativas nas recomendações

6. **Gordura visceral: limiares de risco.**
   A escala Renpho é própria — perceber a que corresponde clinicamente.
   → alimenta: flag `visceral_elevada` (alarme de saúde)

7. **% de gordura corporal: faixas por sexo, e faixa específica para atletas de endurance.**
   As faixas "saudáveis" de população geral não servem — e há um limite inferior
   abaixo do qual há risco.
   → alimenta: flags `gordura_elevada` / `gordura_baixa_demais`

8. **Água corporal %: faixa normal e o que uma queda súbita indica.**
   → alimenta: flag `hidratacao`, e filtro para não ler flutuação de água como perda de gordura

9. **BMR da balança vs fórmula (Mifflin-St Jeor, etc.): qual usar?**
   Se divergirem, qual tem precedência.
   → alimenta: base do cálculo calórico — decisão com impacto em toda a Nutrição

---

## ⚫ Head Coach — arbitragem

Estas não são perguntas de literatura pura; são decisões de produto que a
literatura informa. Mas têm de estar escritas antes de o head coach existir.

1. **Quando os objetivos entram em conflito, qual manda?**
   Cenário típico: perder gordura exige défice; a prova daqui a 3 semanas exige
   hidratos e recuperação. Precisa de uma regra explícita, não de bom senso.

2. **Quantos dias antes da prova a nutrição deixa de servir a composição corporal?**
   Um número. A partir daí o coach de Corpo perde precedência.

3. **Hierarquia de alarmes: o que interrompe tudo o resto?**
   Ex.: gordura abaixo do mínimo hormonal, visceral elevada, perda de peso rápida
   demais. Estes têm de calar as recomendações de otimização.

4. **Com que frequência o plano pode mudar?**
   Um coach que muda de opinião a cada registo é inútil. Definir o intervalo mínimo
   entre mudanças de direção.

5. **Quando é que o coach não diz nada?**
   Regra de silêncio. Sem isto, a proatividade transforma-se em ruído e o utilizador
   desliga as notificações.

---

## Formato de registo das respostas

Ao trazer as respostas, usar esta estrutura por item — é o que se converte
diretamente em linha de doutrina:

```
Pergunta:  Corrida #1 — aumento máximo de volume semanal
Valor:     ≤ 10% face à média das 4 semanas anteriores
Faixas:    10-20% = vigiar | > 20% = sinalizar
Condições: aplica-se a partir de 4 semanas de histórico; abaixo disso não avaliar
Fonte:     <referência>
Confiança: alta / média / baixa (consenso ou estudo isolado?)
```

O campo **Confiança** não é decorativo: limiares de confiança baixa devem gerar
linguagem mais suave na doutrina ("considera", "pode valer a pena") em vez de
afirmações categóricas.
