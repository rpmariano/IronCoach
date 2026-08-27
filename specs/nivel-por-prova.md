# Nível por prova — motor de triagem

Especificação do motor que determina o nível de um atleta **para uma prova
concreta**, por oposição ao nível geral do Perfil.

Doutrina: [src/coach-knowledge/08-nivel-por-prova-trail.md](../src/coach-knowledge/08-nivel-por-prova-trail.md).
Investigação: [specs/coach-investigacao.md](coach-investigacao.md), BLOCO 8.

## Porque existe

`race_events.experience_level` existe desde a migração
`20260809000000_experience_level.sql` com um propósito explícito: permitir que
o nível de uma prova divirja do geral. Mas `ExperienceLevelHelp.jsx` serve os
**mesmos critérios transversais** nos dois sítios (Perfil e Agenda), pelo que
o atleta nunca teve como responder à segunda pergunta com outro critério.

A consequência não era cosmética. O nível escolhido alimenta
`MIN_PREP_WEEKS[nível][cat]`, que define `planStartDate` em
`racePlanEngine.js`, que define em que fase do macrociclo o atleta aterra. Um
nível mal calibrado desloca o plano inteiro — e num sentido perverso:
declarar-se acima do real **encolhe** o alarme de viabilidade e **sobe** a
carga prescrita, sem nada no sistema a contradizer.

## Os dois eixos

Ambos relativos à prova alvo (doutrina #3), nunca absolutos.

```
nível_tempo = banda_tempo(tempo_em_pé_semanal / tempo_previsto_prova)
nível_dplus = banda_dplus(D+_semanal / D+_prova)            ← ICE
nível_medido = min(nível_tempo, nível_dplus)                ← Bloco 0 #2
```

| Nível | Tempo em Pé | D+ |
|---|---|---|
| *abaixo de Iniciante* | < 70% | < 30% |
| Iniciante | 70-90% | 30-50% |
| Básico | 90-110% | 50-80% |
| Médio | 110-140% | 80-100% |
| Avançado | ≥ 140% | ≥ 100% |

Fechados em baixo, abertos em cima (`≥ inferior`, `< superior`).

`tempo_previsto_prova` vem de `getRacePrediction` → `predictRaceTime`, que já
usa `calculateEquivalentFlatKm`. **É o uso sancionado** da conversão
(doutrina #4): previsão de tempo, nunca dimensionamento de carga.

## Leitura das últimas 4 semanas

**2.ª semana mais alta**, não a média nem o máximo.

| D+ nas 4 semanas | 2.ª mais alta | Leitura |
|---|---|---|
| `[1500, 210, 180, 200]` | 210 | rajada isolada não creditada |
| `[1400, 1350, 1200, 900]` | 1350 | carga sustentada creditada |

Menos de 3 semanas com dados → **não avaliável**, assumir o nível mais baixo.

## Bandas de terreno (rácio D+/km)

Servem dois fins: caracterizar a prova, e definir "terreno semelhante" na
triagem (doutrina #7.1).

| Banda | Rácio |
|---|---|
| Rolante | < 25 m/km |
| Ondulado | 25-50 m/km |
| Montanha | 50-80 m/km |
| Alta montanha | > 80 m/km |

Dão também o `categorizeElevation()` que faltava para a regra de invalidação
(ver abaixo).

## Dados de origem

Todos já existentes — nada a acrescentar ao schema para a v1.

| Necessário | Origem | Cobertura medida (2026-08-27) |
|---|---|---|
| Tempo em Pé | `runs.duration_seconds` | 62/62 |
| D+ por treino | `runs.details.elevation_gain_m` | 59/62 · 7/7 nos últimos 30 d |
| Distância | `runs.distance_km` | — |
| Histórico de prova | `race_events` com `status='concluida'` | — |

**Treino sem D+ registado conta como 0.** Conservador, alinhado com o
"pecar por defeito" do resto do projeto.

## Interação com a auto-declaração

O motor **propõe**, o atleta **confirma ou justifica um override**. Não
substitui a auto-declaração: o atleta sabe coisas que os dados não mostram
(lesão recente, mudança de vida, treino não registado).

O que muda é que passa a existir uma medição independente para contradizer
uma auto-avaliação inflacionada — que é exatamente o buraco que originou este
trabalho.

Apresentação sugerida: mostrar a evidência, não só o veredicto.
> *"Pelos teus últimos 30 dias — longo de 1h40 a 38 m/km, 620 m D+/semana, sem
> prova nesta banda — para esta prova classificas como Básico. Concordas?"*

## Invalidação do nível declarado

O nível responde a uma pergunta definida por **três** antecessores: tipo,
distância e (em trail) D+. Se algum muda de categoria, a pergunta mudou.

| Antecessor | Invalida quando |
|---|---|
| `race_type` | muda estrada ↔ trail |
| `distance_km` | muda de `categorizeDistance()` |
| `elevation_gain_m` | muda de banda D+/km |

Mudanças dentro da mesma categoria não invalidam (10 → 10,5 km não muda
nada). Na criação, limpar o campo; **na edição, destacar para reconfirmação**
em vez de limpar em silêncio.

## Passadeira — não é uma limitação deste sistema

As fontes (BLOCO 8, "Sugestão de otimização") propunham penalizar a 50% o D+
obtido em passadeira, por eliminar a componente de descida (logo o dano
excêntrico). **Decisão (2026-08-27, esclarecida pelo utilizador): não se
aplica, por desenho do produto, não por limitação de dados.**

`runs` é exclusivamente para corridas reais — `RunRegistration.jsx` só
oferece piso `estrada` ou `trail` (nunca `passadeira`); é daí que
`runs.details.elevation_gain_m` vem sempre. Um treino de passadeira, quando
existe, é registado como treino de GINÁSIO (`workout_sessions`, via
`GymRegistration.jsx`) — ex.: "treinei pernas, 20 min de passadeira a
inclinação X" no campo `notes` (texto livre, nunca estruturado). Esse
`notes` nunca alimenta `elevation_gain_m` nem entra no cálculo do motor de
triagem, que só lê `runs`.

Ou seja: `elevation_gain_m` de uma corrida É SEMPRE D+ real, por construção
— não porque o validemos, mas porque não existe caminho no produto para lá
chegar de outra forma. Não há campo a acrescentar nem penalização a
implementar; a limitação não existe.

## Limitações conhecidas

Documentadas, não resolvidas. Erram para o lado seguro.

**1. D− não é guardado.** A simetria D+ ≈ D− não é simplificação escolhida, é
imposta pelos dados. Provas ponto-a-ponto predominantemente descendentes ficam
sub-avaliadas — o pior caso para dano excêntrico.

**2. Desacoplamento aeróbico (doutrina #6, Avançado)** exige FC e splits da
última prova. Existem em `details` (`avg_heart_rate_bpm` 60/62, `splits`
11/62) mas só com importação de relógio. Tem de degradar com elegância.

**3. Cap de ultra em gama.** A doutrina dá 10-14 h/semana para >50 km. O
projeto usa o limite superior por convenção (`taper.ts`), mas aqui o superior
é o **menos** conservador. Recomendado: 10 h.

## Âmbito

O eixo D+ (ICE) só se aplica a trail — em estrada `D+_prova ≈ 0` e a divisão
degenera. Guarda: aplicar só com `race_type = 'trail'` ou acima de um piso de
D+.

**A estrada mantém-se em km** (`MIN_VOLUME_KM`), que continua válido em
plano. Migrar a estrada para Tempo em Pé seria defensável (Koop argumenta-o)
mas não é exigido por esta doutrina — fica fora de âmbito.

## Ordem de implementação sugerida

1. ✅ **Feito** (2026-08-27) — `categorizeElevationRatio()` em
   `supabase/functions/_shared/formulas/vocabulary.ts` (com testes duplos,
   Deno e Vite) + regra de invalidação em `RunAgenda.jsx`: muda em silêncio a
   criar (`applyExperienceLevelInvalidation`), destaca para reconfirmação a
   editar (`experienceLevelStale`) — nunca apaga uma resposta já gravada.
2. ✅ **Feito** (2026-08-27) — `assessRaceLevelTriage` em
   `supabase/functions/_shared/formulas/raceLevelTriage.ts`: os dois eixos
   (`bandTimeOnFeet`, `bandElevation`), a leitura de pico
   (`secondHighestOfLast4Weeks`, 2.ª semana mais alta das últimas 4) e a
   composição por `minLevel`. Vetor dourado (`raceLevelTriage.golden.json`)
   com os cenários-chave, incluindo o caso motivador do bloco (motor
   cardiovascular alto + D+ semanal quase nulo → `sub_iniciante`) e a
   exclusão de rajada isolada. **Ainda não está ligado a nada** — puro,
   sem consumidor no coach-chat nem na UI (é o próximo passo, #3).
3. ✅ **Feito** (2026-08-27) — `RaceLevelSuggestion.jsx`, ligado ao campo
   de nível em `RunAgenda.jsx`. Consome `getRacePrediction` (mesma
   resolução de nível que RaceHubView/RunDashboard já usam, para não
   voltar a divergir entre ecrãs) e `assessRaceLevelTriage`, e mostra a
   evidência antes do veredicto: "pelos teus últimos treinos (longo de
   1h40, 620 m D+/semana), classificas-te como Médio". Três estados —
   propõe com botão "Usar nível" quando diverge do declarado, confirma sem
   ação quando bate certo, avisa com firmeza (sem oferecer um nível de um
   clique) quando `sub_iniciante`. Continua proposta, nunca substituição —
   a auto-declaração decide sempre.
4. ✅ **Feito** (2026-08-27) — `ExperienceLevelHelp.jsx` ganhou
   `context` (`'geral'` por omissão, inalterado, usado no Perfil;
   `'prova'` em `RunAgenda.jsx`). Em `'prova'`, a tabela já não é a
   transversal do Bloco 0 — é lida das MESMAS tabelas que classificam:
   `MIN_PREP_WEEKS`/`MIN_VOLUME_KM` por categoria de distância em estrada,
   `TIME_ON_FEET_FLOORS_PCT`/`ELEVATION_FLOORS_PCT` (agora exportadas de
   `raceLevelTriage.ts`) em trail — com a banda de terreno da própria
   prova (`categorizeElevationRatio`) mostrada como contexto. Nunca uma
   cópia que possa divergir do que o motor de triagem realmente usa.
5. ~~Campo de passadeira no registo de corrida~~ — **descartado**
   (2026-08-27): não corrige limitação nenhuma, ver "Passadeira — não é
   uma limitação deste sistema" acima. `runs` não tem, nem deve ganhar,
   opção de piso "passadeira" — treinos de passadeira são de ginásio.
6. ✅ **Feito** (2026-08-27) — `buildRaceEventsContext` (`coach-chat/index.ts`)
   calcula o NÍVEL MEDIDO por prova (mesmo `assessRaceLevelTriage`, com
   `getRacePrediction` para o tempo previsto, sobre a janela de 30 dias que
   `recentRuns` já carrega — cobre as 4 semanas rolantes do motor sem query
   extra). Só entra no contexto quando avaliável; três frases fixas —
   "bate certo com o declarado", "diverge do declarado (X)" com ⚠, ou "o
   atleta ainda não declarou nível" — nunca o resultado bruto do motor.
   Doutrina nova, "## Nível Medido pelo Histórico de Treino": não interromper
   por confirmação, trazer a divergência quando fizer sentido no fluxo,
   tratar `sub_iniciante` com o mesmo peso de ACWR em perigo, e nunca
   "corrigir" o nível sozinha — só o atleta muda esse campo.

   Bug apanhado ANTES de fechar (não em produção): a primeira versão do
   `flattenedRuns` não incluía `distance_km`, que `getRacePrediction`
   precisa para achar a corrida mais rápida — sem isso a previsão falhava
   sempre (`predictedSeconds=0`) e a linha nunca aparecia. Só se detetou a
   correr o código real antes de escrever os testes; nenhum valor foi
   calculado à mão.

   Nota honesta de divergência: `RaceLevelSuggestion.jsx` (formulário) usa o
   histórico COMPLETO de corridas para a previsão de tempo (já carregado no
   store); aqui usa-se só a janela de 30 dias que o resto do contexto já
   carrega, para não acrescentar uma query pesada a TODAS as invocações do
   `coach-chat`. Num atleta com o recorde relevante fora dessa janela, os
   dois números podem divergir — aceite conscientemente, documentado, não
   escondido.

   Sem testes Vitest (é ficheiro Deno, fora do `include` de `vite.config.mjs`
   de propósito — `jsr:` e `Deno.test` não compilam sob Vitest). 8 testes
   Deno novos em `index.test.ts`, com os valores confirmados a correr
   `getRacePrediction`/`assessRaceLevelTriage` reais antes de fixar — não
   corridos neste ambiente (sem Deno instalado), mesma limitação já
   registada nos commits anteriores desta sessão.
