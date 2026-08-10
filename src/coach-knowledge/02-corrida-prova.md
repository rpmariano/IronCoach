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

