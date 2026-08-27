# Bloco 8 — Nível específico por prova, e trail

> Fonte: [specs/coach-investigacao.md](../../specs/coach-investigacao.md), secção "BLOCO 8 — Nível específico por prova, e trail".
> Este ficheiro é gerado a partir das respostas já registadas e verificadas nessa investigação — não reabre nem reavalia as decisões, só as torna consultáveis por pergunta.

O Bloco 0 definiu os níveis com critérios **transversais**; o Bloco 1 indexou
pré-requisitos por **distância**. Este bloco cobre o eixo que faltava: o nível
**para uma prova concreta**, que pode divergir do geral, e o trail, cujo eixo
de exigência não é a distância.

**A regra que reorienta tudo o resto**: no trail, a métrica de planeamento de
carga é o **Tempo em Pé**, não a quilometragem equivalente. A conversão
"100 m D+ ≈ 1 km plano" continua válida para prever tempo de prova e
nutrição, e é inválida para dimensionar treino (#4).

## Perguntas

### #1 e #2 — Eixo de exigência e bandas de terreno

O eixo é o **rácio D+/km**, não o D+ absoluto nem a distância.

| Banda | Rácio | Exemplo | Caracterização |
|---|---|---|---|
| 1 — Rolante | < 25 m/km | 20 km / 400 m | Ritmo aeróbico; transição fácil da estrada |
| 2 — Ondulado | 25-50 m/km | 30 km / 1000 m | Caminhada tática nas subidas; corre-se a maior parte |
| 3 — Montanha | 50-80 m/km | 40 km / 2500 m | Forte exigência excêntrica; bastões frequentes |
| 4 — Alta montanha | > 80 m/km | 20 km / 2000 m | Progressão lenta, técnico, corrida só em secções |

> Fonte: UESCA Trail Running Certification; ITRA Technical Guidelines · Confiança: ALTA

### #3 — Pré-requisitos semanais, por nível

**Relativos à prova alvo, não absolutos.** Pressupõem o microciclo de pico,
3-4 semanas antes da prova.

| Nível | Tempo em Pé semanal | D+ semanal |
|---|---|---|
| Iniciante | 70-80% do tempo previsto | 30-50% do D+ da prova |
| Básico | 90-100% | 50-70% |
| Médio | 110-130% | 80-100% |
| Avançado | > 140% | 100-150% + sessões de downhill |

Cap em ultra (>50 km): o tempo semanal estabiliza em 10-14 h/semana.

> Fonte: Koop, *Training Essentials for Ultrarunning*; UESCA Manual; norma CTS · Confiança: ALTA

**Bandas efetivas (decisão de projeto — ver #Decisões)**: as faixas acima
deixam buracos. Cada banda estende-se para cima até ao piso da seguinte:

| Nível | Tempo em Pé | D+ |
|---|---|---|
| *abaixo de Iniciante* | < 70% | < 30% |
| Iniciante | 70-90% | 30-50% |
| Básico | 90-110% | 50-80% |
| Médio | 110-140% | 80-100% |
| Avançado | ≥ 140% | ≥ 100% |

Intervalos fechados em baixo, abertos em cima. Acima de 150% de D+ não há
nível superior — passa a sinal de sobrecarga (ACWR), não a classificação.

### #4 — Validade da conversão trail → plano

| Uso | Válido? |
|---|---|
| Prever tempo de prova (pacing) | ✅ |
| Gasto calórico / nutrição | ✅ |
| Dimensionar volume semanal | ❌ |
| Dimensionar semanas de preparação | ❌ |
| Calcular volume pré-requisito | ❌ |

A omissão que a invalida para treino é o **tempo de impacto**. Para
planeamento, converter o esforço da prova em horas e dimensionar por Tempo em
Pé, emparelhado com o rácio D+/km.

> Fonte: ITRA (fórmula de esforço/pontos UTMB); Millet, *Ultramarathon Safety and Performance* · Confiança: ALTA

### #5 — Vetores exclusivos do trail

1. **Carga excêntrica** — quadríceps suportam 5-7× o peso corporal em descida.
   Quebra muscular nas descidas é a causa n.º 1 de DNF.
2. **Terreno e agilidade** — lama, raízes, pedra solta. VO2máx de elite na
   estrada não impede ser lento na montanha por travagem constante.
3. **Tática de caminhada** — power hiking é marcha engrenada, não descanso.
   Eficiência em subidas >10%.
4. **Equipamento e autonomia** — mochila 1,5-2,5 kg, bastões, autossuficiência
   entre abastecimentos.

> Fonte: Millet et al. (fadiga neuromuscular excêntrica); Koop (custo da caminhada >10%) · Confiança: ALTA

### #6 — Histórico de prova, por nível

| Nível | Histórico |
|---|---|
| Iniciante | 0 provas na distância/banda. Tempo-alvo é o cut-off |
| Básico | 1-2 provas em banda ou distância **inferior**, últimos 12 meses. Sem estratégia |
| Médio | 3+ provas na mesma distância/banda. Métricas e nutrição documentada (g/h de HC) |
| Avançado | Provas similares há <6 meses, divisões de ritmo documentadas. Preditor: **desacoplamento aeróbico** na última prova |

> Fonte: Friel, *The Ultra Trail Runner's Bible*; triagem UESCA · Confiança: ALTA

### #7 — Triagem rápida para uma prova concreta

Nível divergente é **estritamente legítimo**: a base cardiovascular é
transferível, a adaptação biomecânica local não é (princípio da
Especificidade).

Três perguntas, uma por variável inegociável:

1. Treino mais longo (horas) nas últimas 4 semanas em terreno semelhante
   (rácio D+/km) → **carga aguda**
2. D+ médio semanal no último mês → **tolerância mecânica**
3. Prova concluída nos últimos 6 meses dentro de 20% em distância **e**
   desnível → **especificidade tática**

> Fonte: princípio da Especificidade (ACSM); onboarding CTS · Confiança: ALTA

**As três são computáveis a partir dos dados já guardados** — não têm de ser
perguntadas. Ver [specs/nivel-por-prova.md](../../specs/nivel-por-prova.md).

## Índice de Cobertura Excêntrica (ICE)

Mitiga o caso mais perigoso: motor cardiovascular alto, D+ semanal nulo.

```
ICE = D+_treino_semanal / D+_prova
```

Exemplo: maratonista de 3 h, 70 km/semana mas 300 m D+/semana, num trail de
30 km com 1500 m D+ → `ICE = 0,20`. O perfil "Avançado" não transita: para
esta prova é Iniciante de trail, sem pacing agressivo e com power hiking
prescrito.

No motor, o ICE **é o cálculo do eixo D+** da #3 — não uma escala paralela.
Ver a decisão 3 abaixo.

## Decisões de projeto sobre estas respostas

Não vêm das fontes. Registadas em separado de propósito.

1. **Extensão das bandas** até ao piso da seguinte (fecha os buracos da #3).
   Deriva de `EXPERIENCE_TIEBREAK_HINT` e da convenção de `taper.ts`.
2. **2.ª semana mais alta das últimas 4** como leitura de pico — mantém a
   comparação pico-a-pico e exclui rajadas isoladas por construção.
3. **Bandas da #3 prevalecem sobre os limiares originais do ICE** (0,80/0,40),
   por terem fonte citada. Abandonado o "cortar um grau": cortar um grau pode
   aterrar num nível cujo pré-requisito também não se cumpre.

## Como isto se compõe

```
nível_tempo = banda(tempo_em_pé_semanal / tempo_previsto_prova)
nível_dplus = banda(D+_semanal / D+_prova)              ← o ICE

nível_medido = min(nível_tempo, nível_dplus)            ← Bloco 0 #2
```

O mínimo não é escolha nova — é o desempate do Bloco 0 #2 ("desce para o
nível do critério mais baixo, nunca sobe") aplicado aos dois eixos do trail.
