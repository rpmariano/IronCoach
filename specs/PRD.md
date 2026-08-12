# Documento de Requisitos do Produto (PRD) — IronHealth

Este documento define o comportamento global, a arquitetura e os módulos da aplicação **IronHealth**, servindo como especificação base para o desenvolvimento e revisão de código.

## 1. Visão Geral
O **IronHealth** é uma PWA (Progressive Web App) criada para monitorizar e otimizar a saúde e performance de atletas.
- **Objetivo Principal**: Permitir que os atletas registem os seus dados de treino, nutrição e métricas corporais *após a realização dos mesmos*, permitindo que o seu treinador (Coach) analise e dê feedback de forma assíncrona.
- **Público-alvo**: Atletas e os seus respetivos treinadores.
- **Idioma Principal**: Português de Portugal (pt-PT).

## 2. Tecnologias & Arquitetura

- **Frontend**: React (Vite SPA).
- **Estilos**: Tailwind CSS e variáveis CSS nativas em `src/styles/globals.css`. Tema exclusivamente claro (`color-scheme: only light`).
- **Gestão de Estado**: Zustand (`src/store/index.js`).
- **Testes**: Vitest + Testing Library.
- **Backend**: Supabase (Google OAuth, Postgres, Edge Functions), partilhado por todos os ambientes — **não existe base de dados de desenvolvimento separada**.
- `index_legacy.html` é um arquivo da app anterior em JavaScript vanilla. Não é servido nem mantido; existe como referência, a par da tag `backup/master-pre-react-merge`.

### 2.3. Schema: a base de dados é a fonte de verdade, não o ficheiro
`supabase_schema.sql` é um **registo** do schema, não o que o cria. Divergiu da produção sem que nada avisasse: faltavam-lhe 18 colunas e duas tabelas inteiras (`water_logs`, `push_subscriptions`), o que levou a concluir por leitura que campos existentes estavam em falta — e quase a criá-los outra vez.
- **Antes de afirmar que um campo não existe, consultar a base de dados**, não o ficheiro.
- Alterações de schema vão para `supabase/migrations/`, idempotentes (`add column if not exists`), e o `supabase_schema.sql` é atualizado a par.
- Ao corrigir a divergência, preferir emendar o ficheiro a regenerá-lo: os comentários explicam decisões que um *dump* automático deitaria fora.

### 2.1. Dois ambientes, duas raízes
| Ramo | Host | URL | Base |
| :-- | :-- | :-- | :-- |
| `master` | GitHub Pages, via GitHub Actions | `https://rpmariano.github.io/ironhealth/` | `/ironhealth/` |
| `dev` | Netlify (ambiente de desenvolvimento) | domínio Netlify | `/` |

- O `vite.config.mjs` lê `base` de `process.env.VITE_BASE`, com `/` por omissão. O workflow do Pages define `VITE_BASE=/ironhealth/`; o Netlify não define nada e fica na raiz. **O mesmo código serve os dois.**
- O deploy do Pages é feito por `.github/workflows/deploy-pages.yml` (build + testes + publicação do `dist`). Requer **Settings → Pages → Source: GitHub Actions**; com "Deploy from a branch" o workflow corre mas não tem efeito.

### 2.2. Regra de caminhos de assets — não repetir este erro
A 2026-08-04 a produção ficou em branco porque o `index.html` do SPA foi servido sem passo de build. Depois de resolver isso, ficou o problema de raiz: **num subcaminho, todo o caminho absoluto para `public/` dá 404.**
- O Vite prefixa o `base` nos caminhos absolutos **do `index.html`**, mas **não** nos que estão dentro do JSX.
- Para assets de `public/` usar sempre `publicUrl()` (`src/lib/utils.js`), nunca `"/ficheiro.png"`.
- O service worker registra-se em `` `${import.meta.env.BASE_URL}sw.js` `` — isto também lhe dá o scope correto, o da app.
- O `public/manifest.json` usa caminhos **relativos** (`start_url: "."`, ícones sem `/` inicial), o que funciona nas duas raízes. Mantê-lo assim.
- Não é preciso fallback de 404: a navegação é estado do Zustand mais um parâmetro `?tab=`, não rotas por caminho.

### 2.4. Infraestrutura de Qualidade e Agentes
O projeto inclui um sistema de qualidade e auditoria automatizado na pasta `.agents/` e um Git hook pre-push em `.githooks/`:
- **Agentes (`.agents/agents/`)**: `quality_orchestrator`, `test_engineer`, `supabase_guardian`, `pwa_auditor`, `a11y_checker`, `docs_keeper`, `spec_writer`, `pre_deploy_reviewer`.
- **Skills (`.agents/skills/`)**: `vitest`, `supabase`, `accessibility`, `pwa-development`, `code-review`, `find-skills`.
- **Hooks do Git (`.githooks/pre-push`)**: Executado automaticamente antes de cada `git push` para rodar os testes (`vitest`) e validar o build (`vite build`), bloqueando pushes em caso de falha.
- **Regras (`.agents/rules/auto-agents.md`)**: Diretrizes para o assistente IA invocar agentes de forma proativa durante o desenvolvimento.

---

## 3. Módulos da Aplicação

### 3.1. Painel Inicial (Home)
- Três cartões fixos, sempre visíveis: **Próxima Prova**, **Nutrição** (hoje) e **Água** (hoje).
- Acesso rápido a registos através de um Menu de Ação Flutuante (FAB).
- **Plano da semana** ocupa o espaço abaixo dos três cartões fixos — ver `specs/plano-de-treino.md` para o desenho completo. Lista os itens `pendente` de `coach_plan_items` (ordenados por data), cada um com duas ações: **Concluir** (leva ao ecrã de registo de Corrida/Ginásio com os campos pré-preenchidos a partir do item) e **Cancelar**. Itens nunca expiram sozinhos — ficam `pendente` até uma das duas ações.
- **A antiga grelha personalizável de cartões foi removida** (2026-08-10) — `HOME_CARD_DEFS`, `CustomizePanel`, o botão "Personalizar" e o campo `profiles.home_layout` deixaram de ser consumidos pelo cliente. A coluna mantém-se na BD (não foi eliminada), mas está morta: nenhum código lê nem escreve nela. Se a personalização voltar a fazer sentido, é reconstruída do zero — a leitura antiga da grelha e do plano no mesmo espaço não coexistiam bem.

### 3.2. Nutrição (`Nutrition`)
- Registo diário de refeições e ingestão de água.
- Apresentação de macros consumidos vs metas (Proteínas, Hidratos de Carbono, Gorduras e Calorias totais).
- Suporte para visualização em calendário histórico.
- **Lembretes de água** (definidos no Perfil, tab Metas): notificação push periódica enquanto a meta diária não for atingida.
  - Intervalo configurável (30/60/90/120/180/240 min).
  - **Janela horária configurável** (hora de início e hora de fim, granularidade de 1h, 00:00–23:00). Por omissão, quando o utilizador não define outro valor: **08:00–22:00** (hora de Portugal, `Europe/Lisbon`).
  - Suporta janelas que atravessam a meia-noite (ex.: início=22h, fim=6h) e o caso início=fim (lembretes 24h).
  - **Entrega**: service worker em `public/sw.js` (registado em `App.jsx` a cada arranque, sem exigir sessão) e subscrição Web Push guardada pela Edge Function `save-push-subscription`. A lógica de envio vive em `send-water-reminders`, disparada por `pg_cron`. Sem service worker registado nem subscrição gravada, as definições de lembrete não produzem notificação nenhuma.
  - **Beber reinicia a contagem**: registar água atualiza `water_last_activity_at`, o campo que a Edge Function usa para decidir se o lembrete já é devido.
  - **Silenciar, sem mexer na ativação geral** (no separador Água): "Adiar próximo" (empurra `water_last_activity_at`) e "Silenciar hoje" (`water_reminder_muted_date`, que expira sozinho no dia seguinte), com opção de reativar.
  - Ativar/desativar, intervalo e janela horária estão sujeitos à **regra do botão "Guardar"** da tab Metas (ver secção 3.7): nenhuma alteração é persistida até o utilizador gravar. Ativar de novo depois de gravar reinicia `water_last_activity_at` e limpa um "silenciar hoje" anterior.
- **Calendário de Nutrição**: cada dia mostra até dois indicadores —
  - Ponto de estado nutricional: **verde** quando Calorias, Hidratos e Gordura não são excedidos **e** a Proteína é atingida ou ultrapassada; **vermelho** se qualquer uma das 3 primeiras for excedida **ou** a Proteína ficar abaixo da meta; **cinzento** sem refeições registadas nesse dia. Uma macro sem meta definida nunca conta como excedida.
  - Ponto adicional **azul-claro** (`bg-sky-400`), por baixo do anterior, nos dias em que a soma dos registos de água atinge a meta diária.
  - A lógica vive em `dayNutrientStatus()` e `dayWaterGoalMet()` (`src/utils/nutrition.js`), cobertas por testes unitários.
- **Registo de nova refeição — mesmo padrão da Corrida (3.4): um único cartão, forma de introdução à escolha**: os campos comuns (data, tipo de refeição, observações) ficam sempre visíveis; um seletor "Como queres registar?" (Foto/IA por omissão, ou Manual) decide o resto do cartão. **As duas formas passam pelo Coach** — não há caminho de registo sem análise.
  - **Foto (IA)**: 1 a 6 fotos da refeição, comprimidas e normalizadas para JPEG no cliente (`src/lib/image.js`), enviadas para `analyze-meal`. Extrai os alimentos e valores nutricionais por foto e gera a nota do Coach (`coach_notes`).
  - **Manual**: "Adicionar alimento" só acrescenta `{name, grams}` a uma lista local — não toca no servidor nem no Gemini nesse momento, e portanto não gera nenhum custo de API por alimento adicionado. Só ao premir "Analisar Refeição" é que `analyze-meal` em `mode: "manual"` recebe a lista completa, faz UMA ÚNICA chamada ao Gemini a estimar os valores nutricionais de todos os alimentos de uma vez (nunca uma chamada por alimento), grava a refeição já completa e gera o comentário do Coach a partir dela (`attachMealCoachNotes`, partilhada com o caminho de fotos). Cancelar antes de analisar não deixa nada gravado — nada existe no servidor até esse ponto.
  - **Gramas são opcionais** por alimento: o campo mostra "g (opcional)" e o botão "Adicionar alimento" só exige o nome. Sem gramas, o item aparece na lista como "Porção estimada pelo Coach"; o Gemini infere o peso típico combinando a descrição do alimento com as "Observações" da refeição, de forma consistente — "fiambre" com observação "1 fatia" tem de dar o mesmo resultado que "1 fatia de fiambre" sem observação, e o mesmo vale para qualquer outro alimento (banana, ovo, bacalhau, ...). Se o utilizador indicar gramas, esse valor exato é sempre respeitado e nunca é substituído pela estimativa (`buildManualItemsPrompt`/`analyzeManualItems` em `supabase/functions/analyze-meal/index.ts`).
  - `meal_type` é um enum fixo partilhado com `MEAL_TYPES` em `supabase/functions/analyze-meal/index.ts` (hífen: `pequeno-almoco`, `lanche-manha`, ...) — o mesmo usado por `mealTypeLabel()`/`MEAL_ICONS` no resto do módulo. Uma versão anterior do formulário usava underscore para 2 dos 6 tipos, o que a função rejeitava com 400.
  - O botão "Analisar Refeição" usa o mesmo componente `CoachAnalyzeButton` (`src/components/shared/CoachButton.jsx`) da Corrida — gradiente e insígnia do Coach iguais, esteja a analisar uma foto ou um registo manual.
  - **O cartão da refeição (`MealCard.jsx`) é só de consulta e de eliminar.** Não tem edição inline de observações nem de alimentos: qualquer alteração ao conteúdo é pelo botão "Editar", porque mexer nos alimentos ou nas observações muda a análise e tem de a regenerar — editar à mão no cartão deixava a "Análise do Coach" a descrever uma refeição que já não existe.
  - **Editar uma refeição existente** (botão "Editar" em `MealCard.jsx`, ao lado de "Eliminar") abre o mesmo cartão do registo, sem o seletor Foto/Manual. Permite alterar data/tipo/observações, o nome/gramas dos alimentos já gravados, removê-los **e acrescentar alimentos novos**. Ao guardar há dois caminhos, decididos por comparação com o estado inicial:
    - **Alimentos ou observações mudaram** → passa pelo Coach: `analyze-meal` em `mode: "manual"` com `meal_id`, que reestima os valores nutricionais de *todos* os alimentos numa só chamada, substitui a lista completa (`delete` + `insert` em `meal_items`) e regenera `coach_notes`. O botão é o `CoachAnalyzeButton` ("Guardar e Reanalisar"). É por este caminho existir que acrescentar um alimento novo ao editar passou a ser possível — a estimativa dos valores dele vem daqui.
    - **Só a data ou o tipo mudaram** → `update` direto em `meals`, sem chamada ao Gemini e sem custo de API. Botão normal ("Guardar Alterações").
    - **As observações contam como dado analítico de propósito**: entram no prompt de estimação (ver o ponto das gramas opcionais acima), por isso um "hambúrguer" com a observação "do McDonald's" não pode dar os mesmos valores que um caseiro.
    - Distingue-se do modo de **reanálise** (`meal_id` sem `mode`), que repesca as fotos guardadas — aqui a fonte são os campos que o atleta editou.

### 3.3. Treino / Ginásio (`Gym`)
- Registo de sessões de ginásio realizadas.
- Cálculo de volume de treino (séries × repetições × peso em kg) semanal e histórico.
- Visualização gráfica de volume e frequência de treino.
- Calendário histórico: ponto verde nos dias com treino registado, cinzento nos restantes.
- **Registo de nova sessão — mesmo padrão da Corrida/Nutrição/Corpo: um único cartão, forma de introdução à escolha**: os campos comuns (tipo Força/Aula, data, nome, grupos musculares/modalidade, observações) ficam sempre visíveis; um seletor "Como queres registar?" (Foto/IA por omissão, ou Manual) decide o resto do cartão. **As duas formas passam pelo Coach** — não há caminho de registo sem análise.
  - **Foto (IA)**: 1 a 6 prints da app de treino (Hevy, Strong, ...), comprimidos e normalizados para JPEG no cliente (`src/lib/image.js`), enviados para `analyze-gym`. Extrai exercícios/séries/cargas (ou só métricas agregadas, numa aula) e gera a nota do Coach (`coach_notes`).
  - **Manual**: só as métricas do relógio (duração, calorias, FC média/máxima, esforço) — séries/repetições/carga NÃO fazem parte deste registo inicial; adicionam-se à sessão já criada, uma a uma, no próprio cartão do treino (`GymSessionCard.jsx`, sem IA, tal como sempre foi). Enviado para `analyze-gym` em `mode: "manual"` — sem imagens, a função grava a sessão com os números tal como vieram do formulário e gera só o comentário do Coach a partir deles (`attachGymCoachNotes`, compara com sessões anteriores DO MESMO TIPO — força vs aula não são comparáveis). Falhar a gerar o comentário nunca desfaz a sessão já gravada.
  - **O cartão da sessão (`GymSessionCard.jsx`) é só de consulta e de eliminar.** Não tem edição inline de observações, do esforço, nem eliminação de séries: qualquer alteração ao conteúdo é pelo botão "Editar", porque mexer nas séries, no esforço ou nas observações muda a análise e tem de a regenerar.
  - **Editar uma sessão existente** (botão "Editar" no cartão, ao lado de "Eliminar") abre o mesmo cartão do registo, sem o seletor Foto/Manual. É o único sítio onde se gerem exercícios e séries por completo (adicionar/remover exercícios, adicionar/remover séries, editar reps/carga). Ao gravar há dois caminhos, decididos por comparação com o estado inicial:
    - **Séries, métricas, categorias, tipo (força/aula) ou observações mudaram** → passa pelo Coach: `analyze-gym` em `mode: "manual"` com `session_id`, que substitui a lista de séries toda (`delete` + `insert`, nunca um merge) e regenera `coach_notes`. Botão `CoachAnalyzeButton` ("Guardar e Reanalisar").
    - **Só a data ou o nome mudaram** → `update` direto em `workout_sessions`, sem chamada ao Gemini. Botão normal ("Guardar Alterações").
    - **Não há ação "Reanalisar"** (repescar os prints e voltar a extrair por IA) — editar já cobre corrigir exercícios/séries à mão, ao contrário da Corrida/Refeição, onde "Reanalisar" continua a existir por ser a única forma de voltar a ler os prints.

### 3.4. Corrida (`Run`)
- Registo de treinos de corrida (Distância, Ritmo/Pace médio e Duração).
- Listagem de próximas provas agendadas e contagem decrescente de dias.
- Gráfico de distância percorrida semanalmente.
- Calendário histórico: ponto verde nos dias com corrida registada, cinzento nos restantes.
- **Registo de nova corrida — um único cartão, forma de introdução à escolha**: os campos comuns (Treino/Competição, tipo de treino ou disciplina, data, RPE, nome) ficam sempre visíveis; um seletor "Como queres registar?" (Foto/IA por omissão, ou Manual) decide o resto do cartão. **As duas formas passam pelo Coach** — não há caminho de registo sem análise.
  - **Foto (IA)**: 1 a 6 prints da app de corrida (Strava, Garmin, ...), comprimidos e normalizados para JPEG no cliente (`src/lib/image.js`), enviados para `analyze-run`. Extrai distância/duração/splits/métricas do relógio e gera a nota do Coach (`coach_notes`).
  - **Manual**: os mesmos campos de sempre (distância, duração, métricas do relógio, splits/zonas de FC, detalhe de competição), enviados para `analyze-run` em `mode: "manual"` — sem imagens, a função grava a corrida com os números tal como vieram do formulário e gera só o comentário do Coach a partir deles (`attachCoachNotes`, partilhada com o caminho de fotos). Falhar a gerar o comentário nunca desfaz a corrida já gravada.
  - **Editar uma corrida existente** é sempre pelos campos (o seletor fica escondido). Ao gravar há dois caminhos, decididos por comparação com o estado inicial:
    - **Distância, duração, RPE, tipo (treino/competição) ou métricas do relógio mudaram** → passa pelo Coach: `analyze-run` em `mode: "manual"` com `run_id`, que atualiza a corrida e regenera `coach_notes`. Botão `CoachAnalyzeButton` ("Guardar e Reanalisar").
    - **Só a data ou o nome mudaram** → `update` direto em `runs`, sem chamada ao Gemini.
    - Distingue-se de **"Reanalisar"** no cartão da corrida, que repesca as fotos guardadas (`photo_paths`) e volta a extrair por IA — continua a existir por ser a única forma de reler os prints, e devolve erro claro em corridas sem fotos.
  - `training_type` (treino) e `race_type` (competição) são enums fixos partilhados com o schema do Gemini na Edge Function — as chaves usadas no formulário têm de bater certo com `TRAINING_TYPE_KEYS`/`RACE_TYPE_KEYS` em `supabase/functions/analyze-run/index.ts`, nunca inventadas no cliente. Um valor fora do enum é descartado em silêncio pela função (grava `null`), sem erro visível.
- **Agenda de provas (`race_events`) — só o formulário de `RunAgenda.jsx` cria/edita.** `RunRegistration.jsx` chegou a ter um segundo formulário para o mesmo efeito (`mode: 'prova'`), nunca alcançável por nenhum ecrã (`initialMode` era sempre `'corrida'`) — removido nesta reorganização em vez de deixado a apodrecer a par do real.
  - **Campos e obrigatoriedade**: só "Site da prova" e "Notas" são opcionais — todos os outros (data, local, nome, tipo, distância, tempo-alvo, ritmo-alvo, nível, e D+ quando o tipo é trail) são obrigatórios no formulário; `location`, `target_time`, `target_time_seconds`, `target_pace_seconds_per_km` e `distance_km` levam isso reforçado com `NOT NULL` na BD. `experience_level` é a exceção deliberada: obrigatório no formulário para provas novas, mas nullable na BD — não há como preencher honestamente o nível autodeclarado de uma prova já registada antes deste campo existir.
  - **Nível do atleta para esta prova (`experience_level`)** — autodeclarado, **não herda** de `profiles.experience_level` (3.7). Existe precisamente para o caso em que o nível geral não serve: um avançado em estrada marca-se como iniciante na sua primeira prova de trail, e o coach usa esse valor para calibrar taper e progressão só para essa prova. Vocabulário partilhado com o do Perfil em `EXPERIENCE_LEVELS` (`src/utils/experience.js`).
  - **`race_type` passou a distinguir só o piso** (`estrada` | `trail`, `RACE_TERRAIN_TYPES` em `src/utils/run.js`) — deixou de determinar a distância. A distância é agora um campo à parte, escolhido de uma lista fixa (`RACE_DISTANCE_OPTIONS`: 5/8/10/15/21.0975/42.195/50/60/70/80/90/100 km) que também dá a etiqueta da pílula do cartão — "Meia Maratona" e "Maratona" para as duas distâncias oficiais, "X km" para as restantes (`raceDistanceLabel()`).
  - **D+ (desnível acumulado, `elevation_gain_m`)** só aparece e só é pedido quando o tipo é `trail` — trocar para `estrada` limpa o campo. A BD reforça a regra com `CHECK (race_type = 'trail' OR elevation_gain_m IS NULL)`.
  - **Objetivo de tempo total e de ritmo calculam-se um ao outro** a partir da distância escolhida: escrever num recalcula o outro (`handleTargetTimeChange`/`handleTargetPaceChange`/`updateDistance` em `RunAgenda.jsx`), e mudar a distância depois de um dos dois já preenchido recalcula o que não foi o último a ser editado à mão. Gravar exige que os dois tenham um valor válido — nunca só um.
  - **Convenção do ritmo**: apresentado **sempre com ponto** a separar minutos de segundos — `5.20` são 5min20s/km, não 5,2 minutos. Na entrada aceitam-se ponto, vírgula e dois-pontos; à saída normaliza-se para ponto (`formatPace()`/`parsePaceToSeconds()` em `src/utils/run.js`).
  - **Site da prova (`website`)** substitui o antigo campo "Equipamento" no formulário — a coluna `equipment` continua na BD (histórico preservado) mas deixou de ser editável por aqui.
  - **Alterações por gravar travam a navegação para fora da app**, tal como em `Perfil.jsx`: sair para outro módulo, fechar/recarregar o separador do browser, ou clicar "Cancelar" no formulário pergunta sempre "Gravar e sair" / "Sair sem gravar" / "Continuar a editar" (`setNavGuard` da store) enquanto houver um campo por gravar.
  - **Não espalhar o rascunho no `insert`/`update`.** O formulário tem campos que não são colunas (o ritmo em texto) e, na edição, carrega a linha inteira vinda da base de dados. O payload é montado explicitamente; enviar chaves que não são colunas faz o PostgREST rejeitar tudo.
  - **Métricas do relógio** (foto ou manual, mesmo conjunto nos dois): desnível, cadência média e máxima, calorias, FC média e máxima, VO2 máx, tempo em cada zona de FC (`hr_zones`) e splits/voltas troço a troço — tudo em `runs.details` (jsonb), nunca em colunas soltas da tabela `runs`. `RunCard.jsx` lê estes valores de `run.details.*`; ler diretamente de `run.elevation_gain_m` (ou equivalentes) nunca funciona — essas colunas não existem — e foi um bug real corrigido nesta secção (as pílulas de métricas ficavam sempre vazias, tanto em corridas por foto como manuais). Zonas de FC e splits têm blocos próprios no cartão expandido (barra por zona; tabela troço/tempo/pace por split).

### 3.5. Composição Corporal (`Body`)
- Registo de avaliações físicas (Peso, Massa Gorda, Massa Muscular).
- Gráficos históricos de evolução de peso e composição corporal.
- Calendário histórico: ponto verde nos dias com avaliação registada, cinzento nos restantes.
- **Registo de nova avaliação — mesmo padrão da Corrida/Nutrição: um único cartão, forma de introdução à escolha**: os campos comuns (data, observações) ficam sempre visíveis; um seletor "Como queres registar?" (Foto/IA por omissão, ou Manual) decide o resto do cartão. **As duas formas passam pelo Coach** — não há caminho de registo sem análise.
  - **Foto (IA)**: 1 a 6 prints da app Renpho Health, comprimidos e normalizados para JPEG no cliente (`src/lib/image.js`), enviados para `analyze-body`. Extrai as métricas de composição corporal e gera o resumo do Coach (`ai_summary`) numa só chamada ao Gemini.
  - **Manual**: os 13 campos de métricas (`BODY_METRICS`), enviados para `analyze-body` em `mode: "manual"` — sem imagens, a função grava a avaliação com os valores tal como vieram do formulário e gera o mesmo resumo do Coach a partir deles, comparando com o histórico (`generateBodySummaryFromMetrics`, mesmas regras do resumo gerado no modo normal, só que sem imagem para extrair). Falhar a gerar o resumo nunca desfaz a avaliação já gravada.
  - O comentário do Coach fica em `body_assessments.ai_summary` (não `coach_notes` — nome de coluna herdado do modo foto, que já existia antes desta unificação) e é mostrado em `BodyAssessmentCard.jsx` no mesmo bloco "Análise do Coach" usado por Corrida/Nutrição.
  - **O cartão da avaliação (`BodyAssessmentCard.jsx`) é só de consulta e de eliminar.** Não tem edição inline de observações: qualquer alteração ao conteúdo é pelo botão "Editar", porque mexer nas métricas ou nas observações muda o resumo e tem de o regenerar.
  - **Editar uma avaliação existente** (botão "Editar" no cartão, ao lado de "Eliminar") abre o mesmo cartão do registo, sem o seletor Foto/Manual, com os 13 campos de métricas preenchidos. Ao gravar há dois caminhos, decididos por comparação com o estado inicial:
    - **Métricas ou observações mudaram** → passa pelo Coach: `analyze-body` em `mode: "manual"` com `assessment_id`, que atualiza a avaliação e regenera `ai_summary`. A própria avaliação em edição é excluída do histórico de comparação (`neq("id", …)`) — senão o resumo comparava-a consigo mesma. Botão `CoachAnalyzeButton` ("Guardar e Reanalisar").
    - **Só a data mudou** → `update` direto em `body_assessments`, sem chamada ao Gemini.
    - A edição é ligada em `BodyCalendar.jsx` (estado `editingAssessmentId`), mesmo padrão do `NutritionCalendar.jsx`. Até esta iteração o módulo Corpo **não tinha edição nenhuma**: a única forma de alterar seja o que fosse era a edição inline de observações no cartão, que contornava o Coach.

### 3.6. Aconselhamento do Coach (`Coach`)
- Chat de interação assíncrona com um assistente virtual ou treinador real.
- Recomendações personalizadas com base nos dados registados nos restantes módulos.
- A arquitetura de dados do Coach (janelas de histórico por módulo, extensão dinâmica por *tool calling*, comportamento no chat) está em **`sdd.md`** na raiz do projeto.
- **Ferramentas de *function calling*** (`buildTools()` em `coach-chat`): três de leitura — `get_nutrition_history`, `get_gym_history`, `get_running_history`, usadas quando a pergunta sai das janelas já no contexto — e uma **de escrita**, `propose_training_plan`, que cria um plano de treino pendente de aceitação. Ver `specs/plano-de-treino.md` §5.1. Sendo a única que escreve, valida tudo antes de gravar e faz *rollback* do plano se os itens falharem.
- **O Coach é retrospetivo por omissão** e só é prospetivo em dois casos: provas agendadas (`race_events`, que existem no futuro) e planos que ele próprio propôs e o atleta aceitou. Fora disso, corrige e educa sobre o que já aconteceu — a app regista dados *após* a realização, e o coach não pode adivinhar o treino de hoje.

#### 3.6.1. Equipa de quatro coaches — direção definida, por implementar
O Coach deixa de ser um agente único e passa a ser **uma equipa de quatro**: três especialistas (nutrição desportiva, ginásio, corrida em estrada/trail) e um **responsável de equipa** que reúne os pareceres dos outros, cruza-os com o módulo de Corpo, e é **o único que fala com o utilizador**. Os especialistas nunca dão a cara — só produzem parecer.

**Estado atual**: a estrutura já existe em embrião. As Edge Functions `analyze-meal`, `analyze-run`, `analyze-gym` e `analyze-body` são os especialistas (correm no momento do registo); `coach-chat` é o responsável. O que falta é dar-lhes doutrina, contrato entre si e regras de proatividade.

**Decisões de arquitetura já tomadas** (a respeitar em qualquer implementação):
1. **Os especialistas correm na escrita, não na leitura.** Cada um analisa quando o utilizador regista e grava o resultado. O responsável lê pareceres já calculados. Orquestração ao vivo — o responsável a chamar três sub-agentes a cada interação — é 4× o custo e a latência, e fica expressamente excluída.
2. **Parecer estruturado, não prosa.** Hoje os especialistas gravam texto livre em `coach_notes` (`ai_summary` no Corpo). Texto obriga o responsável a reinterpretar prosa vaga, que é onde nascem as invenções. Os especialistas passam a emitir *também* um veredito estruturado (veredito, confiança, flags, métricas), mantendo o texto para apresentação ao utilizador. O vocabulário de vereditos e flags vive em **TypeScript partilhado pelas funções, nunca em markdown** — um enum documentado em prosa desincroniza-se do código em semanas.
3. **A proatividade é disparada por regras determinísticas, não por um LLM.** Uma camada de gatilhos em SQL/TS decide *quando* falar (ex.: prova a menos de 7 dias sem treino longo há 10); o modelo só escreve *o quê*. Perguntar a um LLM "devo dizer alguma coisa?" a cada abertura da app é caro e imprevisível.
4. **Ginásio e corrida competem pelo mesmo orçamento de recuperação** e vão contradizer-se. O responsável precisa de uma regra de arbitragem explícita — a prioridade é do objetivo agendado mais próximo — e de uma regra de silêncio, sem a qual a proatividade vira ruído e o utilizador desliga as notificações.

#### 3.6.2. Doutrina — onde vive e o que é
A **doutrina** é o conjunto de regras da casa que define como *este* coach se comporta, e é o que o distingue de uma conversa genérica com um LLM. Tem duas camadas: regras de comportamento (ex.: "cada afirmação ancorada num número", "sem louvor genérico") e **limiares de domínio** (ex.: percentagem máxima de aumento de volume semanal). Os modelos já sabem ciência do desporto — alimentá-los com manuais custa tokens e muda pouco; o que muda comportamento são regras curtas, opinativas e específicas.

- **Local (Pendente de Implementação)**: `src/coach-knowledge/` — estrutura planeada para suportar um ficheiro `_comum.md` mais um por especialista e um para o responsável. A pasta e os ficheiros ainda não estão criados no codebase atual. Cada agente receberá apenas a sua doutrina e a comum.
- **Não vai para o `sdd.md` nem para este PRD.** A doutrina é carregada em runtime e paga-se em tokens a cada chamada; documentos de arquitetura não podem ser injetados no prompt. Os ciclos de vida também diferem: a arquitetura muda raramente e por decisão, os limiares mudam sempre que a revisão de literatura os afinar.
- As regras que hoje estão embutidas em strings dentro de `analyze-run/index.ts` são doutrina, e devem migrar para estes ficheiros — as genéricas para `_comum.md`, para valerem nos quatro.
- **Fase de investigação**: os limiares saem da literatura, não de arbítrio. As perguntas a responder — todas exigindo valor numérico e fonte — estão em `specs/coach-investigacao.md`, que regista também que dados a app capta e quais faltam. O NotebookLM é ferramenta de **autoria** dessa destilação, não fonte em runtime: não tem API e nenhuma Edge Function o consegue consultar.
- **O nível do atleta já está resolvido do lado dos dados** (`profiles.experience_level` e `race_events.experience_level`, ver 3.4 e 3.7) — a maioria das respostas à investigação vem marcada `[POR NÍVEL]` e precisa de quatro valores, um por nível, em vez de um só.
- Cada limiar traz um grau de **confiança**: os de consenso forte geram linguagem categórica na doutrina, os de estudo isolado geram linguagem suave. É o que impede o coach de afirmar com igual segurança coisas que não a merecem.

#### 3.6.3. Avaliação
Com quatro agentes, mexer no prompt de um pode partir o comportamento de outro sem se dar por isso. É necessário um conjunto de cenários com comportamento esperado (ex.: *utilizador com prova em 5 dias regista treino intenso → o coach trava, não elogia*), corrido antes de cada publicação. Sem isto, a afinação de prompts passa a ser às cegas.

### 3.7. Perfil (`Perfil`)
- Três sub-separadores: **Pessoal**, **Metas** e **Coach**.
- **Data de nascimento** (tab Pessoal): guarda-se `profiles.birth_date`, **nunca a idade**. Uma coluna com a idade fica silenciosamente errada no primeiro aniversário; a idade deriva-se em runtime com `ageFromBirthDate()` (`src/utils/body.js`). O ecrã mostra a idade calculada ao lado do rótulo, como confirmação de que a data está certa.
  - É o que desbloqueia as zonas de frequência cardíaca — todas as fórmulas dependem da idade — e o ajuste de necessidades nutricionais. `body_assessments.metabolic_age` **não** serve para isto: é uma estimativa da balança sobre o estado metabólico, não a idade real; o seu valor está justamente em ser comparada com a idade verdadeira.
  - A função está duplicada em três runtimes (cliente, `coach-chat`, `suggest-goals`) porque não partilham módulos. Os três têm comentário cruzado: mexer num obriga a mexer nos outros.
  - **Uma coluna que nenhuma função selecione é uma coluna morta.** As Edge Functions escolhem colunas do perfil por lista explícita; acrescentar um campo ao Perfil sem o acrescentar a essas listas faz com que o Coach nunca o veja, por mais que o utilizador o preencha.
- **Nível como corredor** (tab Pessoal): `profiles.experience_level` — iniciante / básico / médio / avançado (`EXPERIENCE_LEVELS` em `src/utils/experience.js`). Editável a qualquer momento; pensado para também vir sugerido a partir de um onboarding futuro, ainda por construir.
  - É o nível **geral**, e só esse — calibra o que é comum a todo o treino (linguagem do Coach, limiares de aumento de volume, distribuição de intensidade), nunca ligado a uma prova específica.
  - **Não é o mesmo campo que o nível de cada prova.** `race_events.experience_level` existe à parte, na Agenda de provas (3.4), porque o nível geral não se transfere entre disciplinas: um corredor avançado em estrada pode ser iniciante na primeira prova de trail. É por isso que há dois campos e não um — em vez de tentar computar automaticamente "prontidão por disciplina" a partir do histórico, o produto decidiu deixar as duas declarações ao critério do próprio atleta.
  - Ver `specs/coach-investigacao.md` (Bloco 0) para a doutrina que consome este campo.
- **Regra do botão "Guardar"**: todos os campos de todos os sub-separadores são editados num rascunho local. Nada é escrito na base de dados até o utilizador premir "Guardar alterações".
- **Aviso de saída sem gravar**: com alterações pendentes, qualquer uma destas quatro saídas dispara o aviso "Tens alterações por gravar", com três opções — **Gravar e sair**, **Sair sem gravar** e **Cancelar**:
  1. mudar de sub-separador;
  2. sair do Perfil pela barra de navegação;
  3. **terminar sessão** (a saída mais destrutiva: desmontaria o Perfil e levaria o rascunho consigo);
  4. fechar ou recarregar o separador do browser.
  - A navegação fica travada até o utilizador escolher. Implementado por um `navGuard` no store (consultado por `setActiveTab`, que devolve `false` quando recusa) mais um handler `beforeunload`.
  - **Grava apenas os campos alterados.** O `UPDATE` inclui só as chaves que o utilizador mexeu. Enviar a linha inteira escrevia por cima de `water_last_activity_at` e `water_reminder_muted_date`, que o cron dos lembretes e o registo de água alteram do lado do servidor — um rascunho aberto há algum tempo reporia valores antigos e provocaria um lembrete a mais.
  - **Exceção**: o pedido de permissão de notificações push ao browser acontece de imediato ao ligar o interruptor dos lembretes, antes de gravar — é uma ação do browser, não um valor de formulário. Se o utilizador sair sem gravar, a subscrição fica criada mas os lembretes não ficam ativos no perfil.

### 3.8. Biblioteca de Gráficos & Componentes Estruturais
- **GraphicsLibrary (`src/components/GraphicsLibrary/`)**: Biblioteca interna contendo widgets gráficos reutilizáveis para dashboards (BarChart, DetailedLineChart, PremiumCalendar, RunningCard, ExerciseCard, HydrationSqueezeCard, etc.). Consumida ativamente pela aplicação (ao contrário do `design-system/`).
- **Componentes do Sistema**:
  - `Layout/Layout.jsx`: Gestão de navegação, cabeçalho e posicionamento de ecrãs.
  - `Auth/Auth.jsx`: Ecrã e fluxo de autenticação via Google OAuth.
  - `Admin/`: Painel para monitorização de custos de API (`app_logs`).

---

## 4. Diretrizes de Design & Consistência Visual

### 4.1. Cores de Marca & Design Tokens
As cores devem utilizar rigorosamente as variáveis declaradas em `globals.css`:
- **Accent (Coral)**: `var(--accent)` (Hover/Active: `var(--accent-dark)`)
- **Chrome (Dourado/Bronze)**: `var(--chrome)` (Hover: `var(--chrome-dark)`)
- **Green (Verde Garrafa)**: `var(--green)`
- **Superfícies**: `var(--surf-900)` (Branco/Cards) e `var(--surf-950)` (Fundo principal da página)
- **Superfícies de detalhe**: `var(--surf-detail)` nos cartões expansíveis (refeição, corrida, treino, avaliação) e `var(--surf-success-soft)` nos painéis de destaque verde.
- **Texto Escuro**: `var(--text-main)` (`#0f172a`) para garantir legibilidade ideal.
- **Não usar valores hexadecimais soltos** em componentes para superfícies ou cores de marca. Exceções legítimas: paletas de dados (`BODY_METRICS`, macros), configuração de gráficos e logótipos de terceiros.
- **`text-white` não produz branco.** `globals.css` tem um bloco "Overrides de cor — portados do legado" que repinta classes inteiras de texto para o tema claro; `[class~="text-white"] { color:#0f172a !important; }` é uma delas, e por ser `!important` nem um `style` inline a vence enquanto a classe `text-white` estiver presente. Sempre que o fundo real for escuro ou colorido (badges de gradiente, pills ativos, botões sobre `var(--mod-X-to)`), usar `style={{ color: '#fff' }}` e **não** incluir `text-white` no `className` — não há forma de o branco genuíno coexistir com essa classe. O mesmo bloco tem entradas equivalentes para `text-slate-200` a `text-slate-600`, essas por design (repintam o cinzento do tema escuro legado para tons legíveis no claro).

### 4.2. Mapeamento de Cores por Módulo
- **Nutrição**: Mapeado para `--mod-nutricao-from` / `--mod-nutricao-to`.
- **Ginásio**: Mapeado para `--mod-ginasio-from` / `--mod-ginasio-to`.
- **Corrida**: Mapeado para `--mod-corrida-from` / `--mod-corrida-to`.
- **Corpo**: Mapeado para `--mod-corpo-from` / `--mod-corpo-to`.
- **Coach**: Mapeado para `--mod-coach-from` / `--mod-coach-to`.
- **Círculos de ícone com glifo branco** (ex.: itens do menu FAB, cabeçalhos dos dashboards) usam o **gradiente** `linear-gradient(135deg, var(--mod-X-from), var(--mod-X-to))`. O tom `-to` isolado é demasiado claro para o glifo branco atingir os 3:1 exigidos a componentes de interface.

### 4.3. Biblioteca de Componentes (`design-system/`)
- A diretoria `design-system/` contém um catálogo de componentes (Button, Card, Badge, Chip, NavIconButton, ProgressBar, TabButton) com Storybook.
- **Estado atual: não é consumida pela aplicação.** Nenhum ficheiro de `src/` a importa; os componentes de `src/components/` são independentes. Alterações ao `design-system/` não têm efeito no produto.
- **Dívida técnica registada**, a resolver em trabalho próprio e não durante um cutover:
  1. `design-system/package.json` declara `react ^18.3.1` e `lucide-react ^0.462.0`; a aplicação usa `react ^19.2.8` e `lucide-react ^1.28.0`. Instalá-la como dependência traria uma segunda cópia do React e quebraria os hooks. O alinhamento de versões vem primeiro.
  2. A migração abrange ~127 utilizações de `<button>` e ~36 de `card` em 29 ficheiros, sem testes de render que apanhem regressões visuais. Deve ser feita módulo a módulo, com testes a acompanhar.
- Até essa migração, a fonte de verdade dos componentes é `src/components/`, e a consistência é garantida pelos tokens da secção 4.1 e pelos padrões da 4.4.

### 4.4. Padrão Visual para Botões de Sistema
- **Botões Circulares de Ícone (Fechar, Voltar, Opções, Expandir)**: superfície neutra, formato circular (`rounded-full`), dimensão mínima tátil de 44×44px (classe `tap-44`) e efeito visual suave no foco/hover.
- **Botão Flutuante Principal (FAB)**: **fundo creme** `var(--fab-bg)` (`#f3d5ab`) com anel escuro, sombra elevada, ícone centralizado e dimensão de **56×56px**. O creme é uma **decisão de marca deliberada** — o FAB não usa `var(--accent)`.
- Quando o alvo tátil de 44px inflaria demasiado o elemento visível (ex.: remover uma miniatura de fotografia), o alvo é expandido com `tap-44` no `<button>` e o badge visível fica num `<span>` interior mais pequeno.

### 4.5. Consistência dos Calendários Históricos
- Todos os calendários (Nutrição, Ginásio, Corrida, Corpo) usam o mesmo tom para dias sem registo, através do token único `CALENDAR_NO_DATA_DOT` (`src/lib/utils.js`).
- **Não apresentam legenda para o estado "sem registo"** — só se listam na legenda os estados com significado (ex.: "Treino registado", "Objetivos cumpridos", "Objetivo de água atingido").
- Exceção documentada: no calendário de Corrida o dia selecionado tem fundo Coral, onde o cinzento não lê bem; nesse estado o ponto usa `bg-white/30`.

---

## 5. Requisitos Não Funcionais & Acessibilidade

### 5.1. Alvos de Toque (Touch Targets)
- Todos os botões e elementos interativos clicáveis devem ter um tamanho mínimo de **44px × 44px** (FAB em **56px × 56px**). Usar as classes `tap-44` (largura e altura) ou `tap-h-44` (só altura), ou dimensões explícitas equivalentes (`Coach.jsx` usa `min-w-[44px] min-h-[44px]`, igualmente válido).
- **Estado da verificação (2026-08-03)**: confirmado por medição no browser em Layout, os quatro calendários, os quatro cartões expansíveis, WaterTracker, MealRegistration, RunAgenda, RunRegistration e Perfil. **Não** foi feita uma varredura exaustiva de todos os botões dos 29 ficheiros de `src/components/` — os módulos Admin, Auth e os dashboards não foram medidos um a um. Novos botões devem cumprir a regra; a varredura completa fica como trabalho pendente.

### 5.2. Acessibilidade (Leitores de Ecrã e Contraste)
- **`aria-label` obrigatório** em botões que utilizem exclusivamente ícones (fechar, adicionar rápidos, FAB, setas de navegação, eliminar, editar).
- **`aria-expanded`** em qualquer controlo que expanda ou recolha conteúdo, com o `aria-label` a refletir a ação seguinte (ex.: "Ver detalhes da refeição" ↔ "Fechar detalhes da refeição").
- **`aria-current="page"`** na aba ativa da barra de navegação.
- Quando uma linha inteira é clicável por conveniência, o controlo semântico (botão com `aria-label` e `aria-expanded`) tem de existir e funcionar por teclado — um `<div onClick>` sozinho não é acessível.
- **Contraste**: o texto principal usa `var(--text-main)` (`#0f172a`) sobre superfícies claras, acima de 7:1.
- **Exceção conhecida — cores de aba ativa**: as cores de módulo usadas no rótulo de 10px da barra de navegação ficam entre **2,54:1 e 3,96:1** sobre branco, abaixo dos 4,5:1 da WCAG AA para texto pequeno. A decisão foi manter as cores de módulo e **não** fazer o estado ativo depender apenas da cor: a aba ativa tem também uma barra indicadora acima do ícone e peso tipográfico distinto, cumprindo a WCAG 1.4.1. Esta exceção é deliberada e deve ser reavaliada se a paleta de módulos mudar.
- **Estado da verificação**: o `aria-label` foi auditado por varredura automática de botões cujo conteúdo é só um ícone. A varredura tem falsos positivos conhecidos (botões cujo texto vive dentro de uma expressão JSX) e já deixou passar pelo menos um caso real, por isso não substitui revisão.

### 5.3. Escalas de Data (UTC vs Lisboa)
- A **hora** da janela de lembretes é avaliada em hora de Lisboa (`currentLisbonHour`), porque é uma decisão do utilizador sobre o dia dele.
- A **data** de `water_reminder_muted_date` usa a **data de Lisboa nas duas pontas**: `lisbonTodayISO()` no cliente (`src/lib/utils.js`) e `currentLisbonDate()` na Edge Function. O que importa é serem a mesma escala — comparar numa e gravar noutra faz o silenciamento não ter efeito nenhum na hora em que divergem (00:00–01:00 no horário de verão).
- **Ao mudar uma ponta, mudar a outra e voltar a publicar a Edge Function.** Isto já falhou duas vezes num só dia, nas duas direções, durante a transição de frontend.
- **Conhecido e não alterado**: `water_logs.date` e as datas de refeição são gravadas em UTC, e a Edge Function consulta `water_logs` em UTC precisamente para bater com isso. Nessa hora de divergência, um registo entra no dia anterior. Unificar todas as datas em Lisboa é transversal e exigiria migrar dados já gravados, pelo que fica fora de âmbito.

### 5.4. Carregamento de Dados (dívida registada)
- `loadInitialData` (`src/store/index.js`) busca `meals` e `water_logs` **sem limite de datas**. O PostgREST limita o número de linhas por omissão (1000 no Supabase), ordenadas por data descendente.
- **Consequência**: a partir desse volume, recuar o suficiente no calendário mostra dias a cinzento ("sem registo") que na verdade têm registos — dados errados em silêncio, não um erro visível.
- A versão vanilla evitava isto carregando cada mês a pedido (`calendarCache` / `waterCalendarCache`, água limitada a 14 dias). Esse carregamento por mês **não foi portado** e deve ser reposto antes de o histórico de qualquer utilizador se aproximar do limite.

---

## 6. Padrões de UX & Personas

### 6.1. Personas do Sistema
- **Mariana Silva (Corredora de Maratonas / Foco em Pace)**: Foco em registo por print de relógio via Gemini IA, acompanhamento da próxima prova e atalhos táteis amplos.
- **Tiago Mendes (Ginásio & Recomposição Corporal)**: Foco em acompanhamento de volume semanal de treino, curvas de tendência corporal e metas diárias de macros.
- **Coach André (Treinador Virtual IA)**: Assistente integrado com visão holística dos 4 módulos (*Nutrição*, *Ginásio*, *Corrida*, *Corpo*), fornecendo sugestões e respostas dinâmicas. Com a equipa de quatro coaches (3.6.1), o André passa a ser o **responsável de equipa** — a única voz que o utilizador ouve; os três especialistas produzem parecer e não têm persona própria.

### 6.2. Documentação de Auditoria
- As auditorias e simulações de UX estão em `.impeccable/critique/` (`ui_audit.md`, `ux_personas.md`, `ux_accessibility.md`, `ux_simulations.md`).
- **Aviso de leitura**: o `ux_accessibility.md` de 2026-08-03 declara conformidade WCAG 2.1 AA que a verificação do código não confirmou (alvos táteis em falta, contraste das abas ativas). As secções 5.1 e 5.2 deste PRD são a especificação em vigor; os relatórios são histórico de auditoria, não certificação.
