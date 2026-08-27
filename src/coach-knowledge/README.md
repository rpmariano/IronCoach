# Doutrina do Coach — src/coach-knowledge/

Conversão de [specs/coach-investigacao.md](../../specs/coach-investigacao.md)
(9 blocos, 80 perguntas, confiança ALTA na esmagadora maioria) em ficheiros
consultáveis por bloco. Cada ficheiro é **gerado a partir das respostas já
registadas e verificadas** nessa investigação — não reabre decisões, só as
torna mais fáceis de encontrar por assunto.

## Estrutura

| Ficheiro | Cobre |
|---|---|
| [00-niveis-experiencia.md](00-niveis-experiencia.md) | Critérios objetivos por nível, ponderação em conflito, questionário de onboarding |
| [01-objetivo-viabilidade.md](01-objetivo-viabilidade.md) | Semanas/volume pré-requisito por distância, ritmo de melhoria realista, `objetivo_inviavel` |
| [02-corrida-carga-progressao.md](02-corrida-carga-progressao.md) | Aumento máximo semanal, ACWR, frequência, descarga, treino longo, regresso após pausa |
| [02-corrida-intensidade.md](02-corrida-intensidade.md) | Distribuição de intensidade (80/20), zonas de FC, método caminhada/corrida |
| [02-corrida-prova.md](02-corrida-prova.md) | Taper, carga de hidratos pré-prova, pace-alvo |
| [02-corrida-tecnica-sinais.md](02-corrida-tecnica-sinais.md) | Sinais de sobretreino/lesão detetáveis nos dados |
| [03-ginasio.md](03-ginasio.md) | Papel da força por nível, séries/semana, grupos prioritários, periodização |
| [04-nutricao-base-diaria.md](04-nutricao-base-diaria.md) | Metas de proteína/hidratos/gordura por nível e objetivo |
| [04-nutricao-seguranca.md](04-nutricao-seguranca.md) | RED-S, défice máximo, piso de gordura corporal |
| [04-nutricao-treino-prova.md](04-nutricao-treino-prova.md) | Timing peri-treino, carga de hidratos, cafeína, sódio |
| [05-corpo.md](05-corpo.md) | Métricas de bioimpedância fiáveis, metas realistas, transtornos alimentares |
| [06-head-coach-arbitragem.md](06-head-coach-arbitragem.md) | Hierarquia de alarmes, comunicação por nível, o que nunca dizer |
| [07-sugestoes-alimentares.md](07-sugestoes-alimentares.md) | Macros por refeição, equivalência g/kg→alimentos, pré-prova, restrições |
| [08-nivel-por-prova-trail.md](08-nivel-por-prova-trail.md) | Nível para uma prova concreta, bandas D+/km, pré-requisitos de trail, triagem por Tempo em Pé |

## Como isto chega ao Coach, na prática

As Edge Functions (`coach-chat`, `coach-daily-summary`, `analyze-meal`) **não
importam estes ficheiros** — cada função Deno só empacota a sua própria
pasta, sem acesso ao resto do repositório (ver a nota junto de
`DIETARY_RESTRICTION_INFO` em qualquer uma delas). A doutrina chega ao
modelo de duas formas:

1. **Regras numéricas fixas** (limiares de segurança, fórmulas, tabelas
   pequenas) — copiadas para constantes TypeScript dentro de cada função que
   precisa delas, com comentário a apontar para o ficheiro de origem aqui.
   Exemplo: `MEAL_DOCTRINE` em `coach-chat/index.ts`,
   `coach-daily-summary/index.ts` e `analyze-meal/index.ts` — três cópias da
   mesma doutrina do Bloco 7, porque não há como partilhar entre funções sem
   um passo de build extra.
2. **Contexto dinâmico** (nível do atleta, restrições, histórico) — construído
   em tempo de execução a partir da base de dados, não a partir destes
   ficheiros.

## Estado de cobertura (2026-08-11)

| Bloco | Wired em código? |
|---|---|
| 0 — Níveis | ✅ `src/utils/experience.js`, `ExperienceLevelHelp.jsx`, `coach-chat` (bio) |
| 1 — Objetivo/viabilidade | ✅ `src/utils/raceViability.js` (32 testes); `RunAgenda.jsx` mostra ⚠ por prova; `coach-chat` inclui flags `OBJETIVO_INVIAVEL` no contexto de provas; duplicado em TypeScript em `coach-chat/index.ts` (sem acesso a `src/`) |
| 2.1 — Carga/progressão | ✅ Doutrina no prompt (tabela de % por nível, ACWR, descarga, treino longo, regresso após pausa); ACWR calculado em tempo real de `recentRuns` e incluído no contexto |
| 2.2 — Intensidade | ✅ Distribuição 80/20 por nível no prompt; quando introduzir qualidade por nível; sinal RPE/pace; zonas FC Tanaka+Karvonen calculadas de `birth_date`+`resting_hr_bpm` |
| 2.3 — Prova | ✅ Taper por prioridade (`race_priority`) no `coach-chat` |
| 2.4 — Técnica/sinais | ⚠️ Parcial — cadência <155 spm flagged por run (⚠ no contexto); doutrina "nunca 180 spm" no prompt; `avg_heart_rate_bpm` por run agora incluído no contexto (sinal de deriva/fadiga Bloco 2.4 #2). FC repouso trend, HRV, GCT balance, cadência intra-sessão: não capturáveis sem integração wearable |
| 3 — Ginásio | ✅ Doutrina completa no prompt (papel por nível, grupos prioritários, séries/sem, faixas reps, progressão, interferência, manutenção, pliometria, falha); `computeGymMetrics` deteta spike volume-carga pernas (#6), intervalo <48h (#7) e séries ≥15 reps (#10); `highRepSets` tracking em `summariseSessions` |
| 4.1/4.2/4.3 — Nutrição | ✅ Doutrina completa no prompt (tabelas proteína/hidratos/gordura, TMB/GETD Mifflin-St Jeor, défice máximo, hidratação, RED-S, ferro, ritmo de perda de peso, pré/pós-treino, carb-loading, fibra, cafeína); `buildNutritionTargets` calcula TMB+GETD+proteína+hidratação em tempo real com dados do perfil e volume semanal; flag RED-S se FC repouso <40 bpm; 22 testes novos (total 120) |
| 5 — Corpo | ✅ Doutrina completa no prompt (BIA fiável vs. não fiável, variação de peso, médias móveis, gordura corporal faixas + piso RED-S, peso de prova proibido em iniciante/básico, tabela de ganho muscular por nível, visceral fat Renpho, água corporal, sinais de sobretreino #1-#4); `computeBodyMetrics` deteta queda de peso >1,5% em 72h (#11), gordura abaixo do piso RED-S (#6), visceral fat ≥10/≥15 (#8), exclui `muscle_mass_kg` (não fiável); fetch de `body_assessments` (30 dias) injetado no contexto; 21 testes novos (total 141) |
| 6 — Head Coach | ✅ Doutrina completa no prompt: conflito composição/prova (défice a zero a 21-28d de prova A), hierarquia G1-G5 com ações explícitas (G1→clearance médico, G2→ortopedia, G3→multidisciplinar, G4→repouso, G5→sem impacto), vocabulário por nível (1-2 recs/iniciante → 4-5+/avançado; VDOT/HRV/RIR proibidos em iniciante), temas contraindicados por nível, frequência de ajuste 7-14 dias com razão fisiológica (Issurin/Verkhoshansky); 7 testes novos (total 148) |
| 7 — Sugestões alimentares | ✅ `MEAL_DOCTRINE` em `coach-chat`, `coach-daily-summary`, `analyze-meal`; restrições alimentares em `src/utils/diet.js` |
| 8 — Nível por prova / trail | ⚠️ Parcial — `categorizeElevationRatio()` (bandas D+/km) e a invalidação do nível ao mudar tipo/distância/D+ em `RunAgenda.jsx` (silenciosa a criar, aviso a reconfirmar a editar) implementadas e testadas; `ExperienceLevelHelp.jsx` ainda serve critérios transversais nos dois sítios (falta a tabela por categoria); motor de triagem por Tempo em Pé (dois eixos + `min`) por implementar — ver [specs/nivel-por-prova.md](../../specs/nivel-por-prova.md) |

Esta tabela é o mapa de gaps — cada `⚠️`/`❌` é candidato a próxima
iteração. Atualizar sempre que uma peça passar a estar wired.
