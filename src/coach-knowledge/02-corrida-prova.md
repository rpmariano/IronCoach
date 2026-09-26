# Bloco 2.3 — Corrida: prova

> Fonte: [specs/coach-investigacao.md](../../specs/coach-investigacao.md), secção "Corrida 2.3 — Prova (registo)".
> Este ficheiro é gerado a partir das respostas já registadas e verificadas nessa investigação — não reabre nem reavalia as decisões, só as torna consultáveis por pergunta.

Quatro perguntas, fontes canónicas (Mujika/Padilla, Pfitzinger, Daniels,
Noakes, Galloway, ITRA, Minetti, Naismith, Riegel, Vigneron), confiança
ALTA em todas. **Fecha o bloco 2.3 por completo** — incluindo a conversão de
trail, referenciada como pendente desde Corrida 2.1 #4.

## Perguntas

### #1 — Taper: dias e redução, por nível e distância

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

### #2 — Dias de recuperação pós-esforço máximo

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

### #3 — Trail: fator de conversão D+ → distância plana

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

### #4 — Previsão de tempo entre distâncias

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


### #5 — Uma prova principal de cada vez dentro do mesmo bloco

**Decisão de produto, 2026-09-18** (specs/plano-vinculado-a-prova.md). Não é
uma pergunta de investigação: é a consequência direta do #1 deste bloco.

Um plano de treino prepara **uma** prova, e termina no dia dela. Entre o
início do plano e a prova-objetivo só pode haver uma prova marcada como
principal — a objetivo.

**Porquê**: o taper de uma prova principal são 10-21 dias de polimento (#1
acima). Duas principais dentro do mesmo bloco pedem dois polimentos que se
sobrepõem — treinar a sério para a segunda obriga a cortar o polimento da
primeira, e polir para a primeira obriga a interromper a carga que a segunda
ainda precisava. Não há plano correto para as duas: uma delas vai ser
prejudicada, e é melhor que o atleta escolha qual do que descobrir no dia.

**As provas intermédias secundárias (b) ou de treino (c) não são um
problema — são um recurso.** Marcar uma prova como b/c é o atleta a dizer
"esta é para eu usar como treino". Entram no plano como treino de qualidade,
com o taper curto de 2-4 dias que lhes corresponde, e servem de aferição a
caminho do objetivo. Nunca sugerir que sejam removidas.

**Quando o atleta pede um plano e há outra principal pelo caminho**, não
propor o plano. Pôr-lhe as duas saídas e deixá-lo escolher:
1. A intermédia passa a secundária (oferecer-se para a mudar) e entra no
   plano como treino de qualidade;
2. O plano passa a preparar a intermédia, que fica o objetivo — e a mais
   distante trata-se no plano seguinte, depois desta.

**Quando uma prova principal aparece depois do plano já existir**, o mesmo
discurso, mas por iniciativa da Carol: pedir para falar, explicar o custo,
pôr as duas saídas. Uma prova secundária nova pede só uma sugestão de
ajustar o plano para a integrar.

**Limite da insistência**: tentar uma vez, com o custo explicado. Se o atleta
quiser manter tudo como está, aceitar sem julgar e marcar a decisão como
tomada — não voltar a levantar o assunto nessa prova. O objetivo nunca foi
impor o plano certo; foi garantir que a escolha é informada.

### #6 — Jornadas de uma competição ao lado das provas principais

**Decisão de produto, 2026-09-26** (specs/trofeu.md §5, Fase 2). Não é uma
pergunta de investigação: aplica o #1, o #2 e o #5 deste bloco a um circuito
de provas curtas (11 jornadas de dezembro a junho, no 1.º caso). As janelas
mínimas e as cadências são proposta de prática, não literatura — revêem-se com
os dados da 1.ª época.

**Uma jornada é uma prova secundária (b).** Nunca manda sobre uma principal:
as principais de fora da competição mandam sempre (#5).

**Quatro papéis**, escolhidos por ele: *atacar* (esforço máximo — é a sessão
de qualidade do ciclo); *controlar* (RPE 6-7, segunda metade mais rápida;
pontua na mesma e conta como a sessão de qualidade); *trote* (Z1, só para
comparecer); *saltar* (não corre).

**À volta de cada principal P** (d = dias da jornada até P):
- dia de P, os 2 dias antes e os 4 depois: saltar;
- polimento, de P−W a P−3: controlar. W é o taper de P (#1, limite superior)
  e nunca menos de 7 dias em 5k/10k nem de 14 em meia, maratona, ultra ou
  trail;
- recuperação, de P+5 a P+R (R do #2): trote. Depois de uma maratona ou ultra,
  o iniciante e o básico saltam a primeira jornada dessa janela.

**Fora das janelas:** o médio e o avançado atacam, a não ser que a jornada caia
ainda na recuperação (#2) de uma atacada — aí controlam. O iniciante e o básico
controlam em progressão e atacam 1 em 3 (iniciante) ou 1 em 2 (básico),
contando só as controladas; nunca duas atacadas a 7 dias ou menos, nem com a
segunda ainda na recuperação (#2) da primeira; a contagem recomeça depois de
cada principal; o objetivo "melhorar marcas" encurta a cadência em uma.

**Afinação:** 3 dias fáceis antes de uma jornada atacada (dentro dos 2-4 dias
B/C do #1), 2 antes de uma controlada ou a trote — nunca menos de 2 antes de
qualquer prova.

**Resolve a tensão entre o #5 e o #2.** O #5 diz para nunca sugerir que uma b/c
seja removida; o #2 exclui nova prova na recuperação. Aqui: saltar só se propõe
no dia e nos 2 antes/4 depois de uma principal, na primeira jornada depois de
uma maratona (iniciante e básico), ou com dor, doença ou um alarme — e aí sem
discussão. Na recuperação, o trote é comparecer, não é prova.

**Sempre:** o papel é calculado, nunca de cabeça; sem data confirmada não há
papel nem data inventada; é uma sugestão — ele decide, ela explica o custo uma
vez e aceita sem julgar; os pontos nunca pesam contra um alarme (G1-G5); nunca a
equipa como pressão, nunca terceiros nem o número de atletas de que o clube
precisa.

Implementação: `supabase/functions/_shared/formulas/seriesArbitration.ts`,
com os golden das personas A-K em `seriesPersonas.golden.json`.
