# Bloco 4.1 — Nutrição: base diária

> Fonte: [specs/coach-investigacao.md](../../specs/coach-investigacao.md), secção "Bloco 4.1 — Nutrição: base diária (registo)".
> Este ficheiro é gerado a partir das respostas já registadas e verificadas nessa investigação — não reabre nem reavalia as decisões, só as torna consultáveis por pergunta.

Seis perguntas, fontes canónicas (ACSM/AND Position Statement, ISSN, Burke,
Jeukendrup, Mifflin, Cunningham, IOC RED-S Consensus, NATA), confiança ALTA
em todas.

## Perguntas

### #1 — Proteína (g/kg/dia)

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

### #2 — Hidratos (g/kg/dia)

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

### #3 — Mínimo de gordura e risco hormonal

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

### #4 — Estimativa calórica e validade da bioimpedância

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

### #5 — Défice calórico máximo por nível

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

### #6 — Hidratação

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

