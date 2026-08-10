# Bloco 2.2 — Corrida: intensidade

> Fonte: [specs/coach-investigacao.md](../../specs/coach-investigacao.md), secção "Bloco 2.2 — Corrida: intensidade (registo)".
> Este ficheiro é gerado a partir das respostas já registadas e verificadas nessa investigação — não reabre nem reavalia as decisões, só as torna consultáveis por pergunta.

Cinco perguntas, fontes canónicas (Seiler, Fitzgerald, Daniels, Pfitzinger,
Hudson, Galloway, Tanaka, Karvonen, ACSM, Borg, Foster, Meeusen), confiança
ALTA em todas.

## Perguntas

### #1 — Distribuição de intensidade

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

### #2 — Ponto de introdução de trabalho de qualidade

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

### #3 — Método caminhada/corrida

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

### #4 — Fórmula de zonas de FC e precedência do relógio

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

### #5 — Discrepância RPE/pace como sinal de fadiga

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

