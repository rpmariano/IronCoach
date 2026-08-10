# Bloco 4.3 — Nutrição: treino e prova

> Fonte: [specs/coach-investigacao.md](../../specs/coach-investigacao.md), secção "Bloco 4.3 — Nutrição: treino e prova (registo)".
> Este ficheiro é gerado a partir das respostas já registadas e verificadas nessa investigação — não reabre nem reavalia as decisões, só as torna consultáveis por pergunta.

Cinco perguntas, fontes canónicas (ACSM, Burke, Jeukendrup, Bussau, Lis,
Viribay, ISSN/Grgic, Spriet), confiança ALTA em todas. **Fecha a Nutrição por
completo (4.1, 4.2, 4.3).** Traz as duas primeiras perguntas totalmente
computáveis de todo o bloco de Nutrição — sem gaps nenhuns.

## Perguntas

### #1 — Nutrição antes e depois do treino

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

### #2 — Hidratos por hora durante a prova

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

### #3 — Carga de hidratos (carb-loading)

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

### #4 — Fibra: alvo diário e limite pré-prova

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

### #5 — Cafeína

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

