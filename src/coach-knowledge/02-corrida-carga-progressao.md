# Bloco 2.1 — Corrida: carga e progressão

> Fonte: [specs/coach-investigacao.md](../../specs/coach-investigacao.md), secção "Bloco 2.1 — Corrida: carga e progressão (registo)".
> Este ficheiro é gerado a partir das respostas já registadas e verificadas nessa investigação — não reabre nem reavalia as decisões, só as torna consultáveis por pergunta.

Cinco perguntas, fontes canónicas (Gabbett, Daniels, Pfitzinger, Friel,
McMillan, ACSM, Coyle), confiança ALTA em todas.

## Perguntas

### #1 — Aumento máximo de volume e ACWR

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

### #2 — Frequência semanal mínima e ótima

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

### #3 — Periodicidade e redução da semana de descarga

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

### #4 — Percentagem e teto do treino longo

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

### #5 — Redução e regresso após interrupção

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

