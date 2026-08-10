# Bloco 0 — Níveis de experiência

> Fonte: [specs/coach-investigacao.md](../../specs/coach-investigacao.md), secção "Bloco 0 — RESOLVIDO (terceira ronda, fontes canónicas)".
> Este ficheiro é gerado a partir das respostas já registadas e verificadas nessa investigação — não reabre nem reavalia as decisões, só as torna consultáveis por pergunta.

**As duas primeiras rondas usaram corpus genérico de treino (planos, artigos
de blog) e produziam dispersão porque agregavam corredores de 5k com
maratonistas na mesma categoria.** A terceira ronda foi à metodologia
canónica (Daniels' Running Formula, Advanced Marathoning/Faster Road Racing
de Pfitzinger, McMillan Running Standards, Lore of Running de Noakes) e
resolveu a dispersão ao **padronizar a distância-alvo e usar volume temporal
(h/semana) como métrica pace-independente**. Substitui por completo as duas
rondas anteriores nas três perguntas do Bloco 0.

**Decisão de produto confirmada**: mantêm-se os 4 níveis
(`iniciante`/`basico`/`medio`/`avancado`) — a dispersão que fazia "básico"
parecer indistinto de "iniciante" era um artefacto das fontes genéricas, não
uma realidade do domínio. Com fontes canónicas, básico tem banda própria e
clara em todos os critérios.

## Perguntas

### #1 — Critérios objetivos por nível

```
Pergunta:  Bloco 0 #1 — critérios objetivos por nível
Iniciante: Volume 15-25 km/semana (ou 1,5-3,0 h/semana), média 4-8 semanas.
           Corrida mais longa ≤5-8 km. Frequência 2-3 sessões/semana (últimos
           30 dias). Anos de prática <0,5 (sem interrupções >1 mês). Pace 5k
           ≥6:30 min/km (VDOT <30).
Básico:    Volume 25-40 km/semana (ou 3,0-4,5 h/semana), média 4-8 semanas.
           Corrida mais longa 8-12 km. Frequência 3-4 sessões/semana. Anos de
           prática 0,5-1,5. Pace 5k 5:30-6:30 min/km (VDOT 30-38).
Médio:     Volume 40-60 km/semana (ou 4,5-6,5 h/semana), média 8-12 semanas.
           Corrida mais longa 15-21,1 km. Frequência 4-5 sessões/semana.
           Anos de prática 1,5-3. Pace 5k 4:30-5:30 min/km (VDOT 38-50).
Avançado:  Volume 60-85 km/semana para foco 10k/meia (75-110 km/semana para
           maratona; ou 6,5-10,0+ h/semana), média do ciclo de pico 8-12
           semanas. Corrida mais longa ≥21,1 a ≥42,2 km. Frequência 5-7
           sessões/semana. Anos de prática >3. Pace 5k <4:30 min/km
           (VDOT >50).
Condições: Padronizado para provas de estrada 10k-Meia Maratona. Se o
           objetivo principal for Maratona, os limites inferiores de volume
           sobem 15-20 km/semana em todos os níveis a partir de Básico.
           Volume em TEMPO (h/semana) é a métrica preferível — elimina a
           distorção de um corredor lento precisar de mais tempo que um
           rápido para o mesmo volume em km.
Fonte:     Jack Daniels — Daniels' Running Formula 4th Ed (2021); Pete
           Pfitzinger & Philip Latter — Faster Road Racing (2014) / Advanced
           Marathoning 3rd Ed (2019); Greg McMillan — McMillan Running
           Standards/VDOT (2023)
Confiança: ALTA
```

### #2 — Ponderação de critérios em contradição

```
Pergunta:  Bloco 0 #2 — que critério pesa mais quando se contradizem
Valor:     Hierarquia de segurança de 3 fatores, com peso:
           - Teto de carga atual (50%): volume semanal médio (km ou h/semana,
             4-8 semanas). Capacidade metabólica/aeróbica atual.
           - Teto de tolerância estrutural (30%): anos de prática continuada.
             Densidade óssea, adaptação de tendões, resistência a lesão por
             overuse.
           - Eficiência/intensidade (20%): pace recente a distância
             conhecida (VDOT).
           Regra de decisão: quando os critérios se contradizem, a
           classificação final PARA PRESCRIÇÃO desce para o nível do
           critério mais baixo em maturidade física — nunca o mais alto.
           Exemplo dado pela fonte: 60 km/semana mas só 8 meses de prática
           → classificar como "Básico" para efeitos de progressão de carga,
           apesar de ter capacidade aeróbica de "Médio", para evitar lesão.
Condições: Para algoritmos automáticos de triagem sem treinador presencial
           — exatamente o nosso caso.
Fonte:     Jack Daniels — Daniels' Running Formula (2021); Pete Pfitzinger —
           Faster Road Racing (2014); Tim Noakes — Lore of Running 4th Ed
           (2003)
Confiança: ALTA
```

Substitui o achado qualitativo da ronda anterior (mesma direção — volume
pesa mais para capacidade, anos pesam mais para resiliência — mas agora com
pesos explícitos e regra de decisão determinística). O limiar ACWR de uma
ronda ainda anterior (aumento semanal ≤10%) mantém-se válido e continua a
pertencer a **Corrida 2.1 #1**, não a este bloco.

### #3 — Perguntas de onboarding preditivas do nível

```
Pergunta:  Bloco 0 #3 — questionário curto de perfil
Valor:     5 perguntas, ordenadas por poder preditivo, com opções JÁ
           MAPEADAS aos 4 níveis:
           1. Volume semanal: "Em média, quantos km correu por semana nos
              últimos 2 meses?" <20 / 20-35 / 35-60 / >60 km (janela 8 sem.)
           2. Frequência: "Quantos dias por semana corre habitualmente?"
              1-2 / 3 / 4-5 / 6-7 dias (janela 30 dias)
           3. Distância máxima: "Qual foi a corrida mais longa sem parar
              nos últimos 3 meses?" <5 / 5-10 / 10-21 / >21 km (janela 90 d.)
           4. Consistência temporal: "Há quanto tempo corre semanalmente sem
              interrupções >1 mês?" <6m / 6-18m / 1,5-3a / >3a
           5. Ritmo de teste/prova: "Tempo num teste/prova recente de 5 km?"
              >32:30 / 27:30-32:30 / 22:30-27:30 / <22:30 min (janela 6 m.)
Condições: Para questionário curto de onboarding em app de treino.
Fonte:     Greg McMillan — McMillan Running Standards (2023); Jack Daniels —
           Daniels' Running Formula (2021)
Confiança: ALTA
```

**O algoritmo de mapeamento que faltava está resolvido pela combinação #2+#3:**
cada pergunta bucketiza diretamente para um dos 4 níveis (0-3); combinam-se os
5 valores com os pesos de #2 (50% volume/frequência+distância como proxies de
carga atual, 30% consistência temporal, 20% ritmo); o nível final desce para
o critério de maturidade mais baixo em caso de conflito, nunca sobe. Deixa de
ser uma decisão de produto em aberto — é a regra a implementar.

**Nota de implementação, ainda válida**: as perguntas 1, 2 (aqui) e 3
correspondem a volume/frequência/corrida mais longa, computáveis a partir de
`runs` para quem já tem histórico na app — nesse caso servem para *sugerir*
um valor pré-preenchido que o utilizador confirma ou corrige, não para
perguntar do zero. A pergunta 4 (consistência) é autorrelato puro, sem
equivalente nos dados. A pergunta 5 (ritmo de teste) é computável só se
existir uma corrida de 5k no histórico ou em `race_events`.

