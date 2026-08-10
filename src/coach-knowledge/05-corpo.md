# Bloco 5 — Corpo

> Fonte: [specs/coach-investigacao.md](../../specs/coach-investigacao.md), secção "Bloco 5 — Corpo (registo)".
> Este ficheiro é gerado a partir das respostas já registadas e verificadas nessa investigação — não reabre nem reavalia as decisões, só as torna consultáveis por pergunta.

Onze perguntas, fontes canónicas (ACSM, Dehghan & Merchant, Fosbøl & Zerahn,
Levitsky, Garthe, Aragon & Schoenfeld, McDonald, Mountjoy/IOC, WHO,
Jeukendrup, Meeusen, Plews, Noakes), confiança ALTA em todas. Cruza fortemente
com blocos anteriores — mais do que qualquer ronda até agora.

## Perguntas

### #1 — Fiabilidade das métricas por bioimpedância

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

### #2 — Variação de peso: real vs. água

```
Valor:     Oscilação >1,0-1,5 kg em 24-48h = só água/glicogénio/conteúdo
           gastrointestinal. Alteração mantida >0,5-1,0 kg ao longo de
           14-21 dias (comparando médias semanais) = tecido real.
Fonte:     Racing Weight (Fitzgerald, 2012); ACSM Position Stand (2016);
           Monitoring body weight daily (Levitsky, 2006)
Confiança: ALTA
```

### #3 — Média móvel para tendência fiável

```
Valor:     7-14 dias (7 mínimo, para anular ciclo de treino e retenção
           hídrica). Em mulheres, 14-28 dias — para anular a fase lútea do
           ciclo menstrual.
Fonte:     Monitoring body weight daily (Levitsky, 2006); Racing Weight
           (Fitzgerald, 2012)
Confiança: ALTA
```

### #4 — Ritmo de perda de gordura

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

### #5 — Ritmo de ganho de massa muscular, por nível

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

### #6 — % de gordura corporal: faixas e piso

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

### #7 — "Peso de prova" em amadores

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

### #8 — Gordura visceral: limiares e correspondência clínica

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

### #9 — Água corporal: faixa e queda súbita

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

### #10 — Precedência: TMB da balança vs. fórmula

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

### #11 — Sinais de sobretreino em métricas corporais

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

