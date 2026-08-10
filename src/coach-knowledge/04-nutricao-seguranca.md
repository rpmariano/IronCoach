# Bloco 4.2 — Nutrição: segurança

> Fonte: [specs/coach-investigacao.md](../../specs/coach-investigacao.md), secção "Bloco 4.2 — Nutrição: segurança (registo)".
> Este ficheiro é gerado a partir das respostas já registadas e verificadas nessa investigação — não reabre nem reavalia as decisões, só as torna consultáveis por pergunta.

Quatro perguntas, fontes canónicas (IOC Consensus RED-S, Loucks, Peeling, Sim,
Garthe, Hew-Butler, ACSM, OMS), confiança ALTA em todas. **É o registo com
maior distância entre o que a literatura sabe e o que a app consegue medir —
pior até do que Corrida 2.4 #2.**

## Perguntas

### #1 — RED-S: limiar, sinais, consequências

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

### #2 — Ferro

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

### #3 — Ritmo de perda de peso

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

### #4 — Sódio: treino/calor vs. limite diário

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

