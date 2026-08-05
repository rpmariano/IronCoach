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

---

## 3. Módulos da Aplicação

### 3.1. Painel Inicial (Home)
- Ecrã principal com cartões de estatísticas rápidas.
- Permite visualizar o progresso da ingestão de água, calorias consumidas, treinos realizados na semana e metas em falta.
- Acesso rápido a registos através de um Menu de Ação Flutuante (FAB).

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
  - **Manual**: cria a refeição vazia (`photo_paths: []`) ao primeiro alimento adicionado, e vai acrescentando alimentos um a um — cada um estimado pelo Gemini a partir do nome + gramas (sem foto), pelo modo já existente de `analyze-meal` (`item_name`/`item_grams`). "Analisar Refeição" chama `analyze-meal` em `mode: "finalize"`, que só gera o comentário do Coach a partir dos itens já gravados (`attachMealCoachNotes`, espelha `attachCoachNotes` da Corrida). Cancelar sem ter adicionado nenhum alimento apaga a refeição vazia criada.
  - `meal_type` é um enum fixo partilhado com `MEAL_TYPES` em `supabase/functions/analyze-meal/index.ts` (hífen: `pequeno-almoco`, `lanche-manha`, ...) — o mesmo usado por `mealTypeLabel()`/`MEAL_ICONS` no resto do módulo. Uma versão anterior do formulário usava underscore para 2 dos 6 tipos, o que a função rejeitava com 400.
  - O botão "Analisar Refeição" usa o mesmo componente `CoachAnalyzeButton` (`src/components/shared/CoachButton.jsx`) da Corrida — gradiente e insígnia do Coach iguais, esteja a analisar uma foto ou um registo manual.

### 3.3. Treino / Ginásio (`Gym`)
- Registo de sessões de ginásio realizadas.
- Cálculo de volume de treino (séries × repetições × peso em kg) semanal e histórico.
- Visualização gráfica de volume e frequência de treino.
- Calendário histórico: ponto verde nos dias com treino registado, cinzento nos restantes.

### 3.4. Corrida (`Run`)
- Registo de treinos de corrida (Distância, Ritmo/Pace médio e Duração).
- Listagem de próximas provas agendadas e contagem decrescente de dias.
- Gráfico de distância percorrida semanalmente.
- Calendário histórico: ponto verde nos dias com corrida registada, cinzento nos restantes.
- **Registo de nova corrida — um único cartão, forma de introdução à escolha**: os campos comuns (Treino/Competição, tipo de treino ou disciplina, data, RPE, nome) ficam sempre visíveis; um seletor "Como queres registar?" (Foto/IA por omissão, ou Manual) decide o resto do cartão. **As duas formas passam pelo Coach** — não há caminho de registo sem análise.
  - **Foto (IA)**: 1 a 6 prints da app de corrida (Strava, Garmin, ...), comprimidos e normalizados para JPEG no cliente (`src/lib/image.js`), enviados para `analyze-run`. Extrai distância/duração/splits/métricas do relógio e gera a nota do Coach (`coach_notes`).
  - **Manual**: os mesmos campos de sempre (distância, duração, métricas do relógio, splits/zonas de FC, detalhe de competição), enviados para `analyze-run` em `mode: "manual"` — sem imagens, a função grava a corrida com os números tal como vieram do formulário e gera só o comentário do Coach a partir deles (`attachCoachNotes`, partilhada com o caminho de fotos). Falhar a gerar o comentário nunca desfaz a corrida já gravada.
  - **Editar uma corrida existente** é sempre pelos campos (o seletor fica escondido) e não passa pelo Coach — "Reanalisar" no cartão da corrida é a ação dedicada a isso, e só funciona em corridas com fotos guardadas (`photo_paths`); a Edge Function devolve um erro claro para as restantes.
  - `training_type` (treino) e `race_type` (competição) são enums fixos partilhados com o schema do Gemini na Edge Function — as chaves usadas no formulário têm de bater certo com `TRAINING_TYPE_KEYS`/`RACE_TYPE_KEYS` em `supabase/functions/analyze-run/index.ts`, nunca inventadas no cliente. Um valor fora do enum é descartado em silêncio pela função (grava `null`), sem erro visível.
- **Dívida registada — a mesma análise por IA não está ligada em Ginásio nem Corpo.** Os botões "Analisar"/"Registar com foto" desses dois módulos são placeholders (`alert(...)` ou `disabled`), e o registo manual não gera comentário do Coach nenhum (ao contrário de Corrida e Nutrição, que já geram nos dois caminhos — ver 3.2 e esta secção). As Edge Functions `analyze-gym` e `analyze-body` existem e continuam ativas, só não são chamadas por nenhum ficheiro de `src/`. Portar cada uma segue o mesmo padrão desta secção: comprimir com `compressImage`, montar o payload, invocar via `invokeEdgeFunctionWithTimeout`, confirmar o enum de campos fixos (se existir) contra a respetiva função, e considerar o mesmo modo manual (sem imagem, só comentário do Coach) se a função ainda não o tiver.

### 3.5. Composição Corporal (`Body`)
- Registo de avaliações físicas (Peso, Massa Gorda, Massa Muscular).
- Gráficos históricos de evolução de peso e composição corporal.
- Calendário histórico: ponto verde nos dias com avaliação registada, cinzento nos restantes.

### 3.6. Aconselhamento do Coach (`Coach`)
- Chat de interação assíncrona com um assistente virtual ou treinador real.
- Recomendações personalizadas com base nos dados registados nos restantes módulos.

### 3.7. Perfil (`Perfil`)
- Três sub-separadores: **Pessoal**, **Metas** e **Coach**.
- **Regra do botão "Guardar"**: todos os campos de todos os sub-separadores são editados num rascunho local. Nada é escrito na base de dados até o utilizador premir "Guardar alterações".
- **Aviso de saída sem gravar**: com alterações pendentes, qualquer uma destas quatro saídas dispara o aviso "Tens alterações por gravar", com três opções — **Gravar e sair**, **Sair sem gravar** e **Cancelar**:
  1. mudar de sub-separador;
  2. sair do Perfil pela barra de navegação;
  3. **terminar sessão** (a saída mais destrutiva: desmontaria o Perfil e levaria o rascunho consigo);
  4. fechar ou recarregar o separador do browser.
  - A navegação fica travada até o utilizador escolher. Implementado por um `navGuard` no store (consultado por `setActiveTab`, que devolve `false` quando recusa) mais um handler `beforeunload`.
  - **Grava apenas os campos alterados.** O `UPDATE` inclui só as chaves que o utilizador mexeu. Enviar a linha inteira escrevia por cima de `water_last_activity_at` e `water_reminder_muted_date`, que o cron dos lembretes e o registo de água alteram do lado do servidor — um rascunho aberto há algum tempo reporia valores antigos e provocaria um lembrete a mais.
  - **Exceção**: o pedido de permissão de notificações push ao browser acontece de imediato ao ligar o interruptor dos lembretes, antes de gravar — é uma ação do browser, não um valor de formulário. Se o utilizador sair sem gravar, a subscrição fica criada mas os lembretes não ficam ativos no perfil.

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
- **Coach André (Treinador Virtual IA)**: Assistente integrado com visão holística dos 4 módulos (*Nutrição*, *Ginásio*, *Corrida*, *Corpo*), fornecendo sugestões e respostas dinâmicas.

### 6.2. Documentação de Auditoria
- As auditorias e simulações de UX estão em `.impeccable/critique/` (`ui_audit.md`, `ux_personas.md`, `ux_accessibility.md`, `ux_simulations.md`).
- **Aviso de leitura**: o `ux_accessibility.md` de 2026-08-03 declara conformidade WCAG 2.1 AA que a verificação do código não confirmou (alvos táteis em falta, contraste das abas ativas). As secções 5.1 e 5.2 deste PRD são a especificação em vigor; os relatórios são histórico de auditoria, não certificação.
