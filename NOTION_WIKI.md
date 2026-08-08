# 🚀 Wiki de Engenharia & Manual Técnico-Funcional — IronHealth v2

> **Documento de Transferência de Conhecimento e Onboarding de Equipa**
> Este documento centraliza toda a informação sobre a plataforma **IronHealth v2**, mapeando a visão do produto, a arquitetura técnica, a estrutura de ficheiros no repositório `master`, as regras de negócio de cada módulo, a engine e doutrina da Inteligência Artificial do Coach e a cobertura de testes.

---

## 📋 Índice Geral

1. [Visão Geral & Filosofia do Produto](#1-visão-geral--filosofia-do-produto)
2. [Estrutura do Repositório & Ficheiros do Projeto](#2-estrutura-do-repositório--ficheiros-do-projeto)
3. [Arquitetura Técnica & Infraestrutura](#3-arquitetura-técnica--infraestrutura)
4. [Módulos Funcionais & Regras de Preenchimento](#4-módulos-funcionais--regras-de-preenchimento)
5. [Arquitetura & Doutrina da IA do Coach](#5-arquitetura--doutrina-da-ia-do-coach)
6. [Qualidade, Testes Automáticos & Ferramentas de IA](#6-qualidade-testes-automáticos--ferramentas-de-ia)

---

## 1. Visão Geral & Filosofia do Produto

O **IronHealth** é uma PWA (Progressive Web App) desenhada para corredores e atletas amadores sérios que pretendem otimizar a sua performance e saúde através da monitorização integrada de treino, nutrição e dados corporais.

### 🎯 Posicionamento e Diferenciadores
1. **Registo de Baixa Fricção (Foto/IA em 1º Lugar)**:
   Em vez da introdução manual manual de dados de consumo calórico, treinos, corridas e pesagens, o utilizador tira uma foto ou faz um upload de um print de ecrã (como a app do Strava, a balança Renpho ou uma foto do prato). A IA processa, extrai e guarda a informação estruturada. A introdução manual existe apenas como alternativa.
2. **Plataforma Unificada (Sem Silos)**:
   A maioria das aplicações foca-se num único vertical (MyFitnessPal para nutrição, Strava para corrida). O IronHealth agrega tudo num único dashboard e partilha estes dados com um Coach inteligente.
3. **Público-Alvo e Tom de Voz**:
   Atletas amadores dedicados. O tom do Coach é informal, dinâmico e focado em números concretos (evitando generalidades clínicas). O idioma oficial é estritamente o **Português de Portugal (pt-PT)**.

### 👥 Personas do Sistema
* **Mariana Silva (Maratonista / Foco em Corrida)**: Foca-se em paces de treino, agenda de provas, tapering e carbloading. Valoriza o registo rápido por prints do Garmin/Strava.
* **Tiago Mendes (Treino de Força & Recomposição)**: Foca-se na progressão do volume de carga semanal (kg), nas metas de macronutrientes (proteínas) e nas curvas de tendência de composição corporal.
* **Coach André (O Responsável de Equipa)**: A persona virtual que interage com o utilizador no chat. Ele atua como um coordenador central, recebendo pareceres dos três coaches especialistas secundários.

---

## 2. Estrutura do Repositório & Ficheiros do Projeto

O código do projeto reside na raiz `C:\Users\rpmar\IronHealth-master` (ramo `master` no repositório GitHub).

### 📂 Árvore de Ficheiros do Projeto

* `src/` — Código do cliente React (Vite SPA)
  * `src/components/` — Componentes funcionais e ecrãs da aplicação (Home, Nutrition, Gym, Body, Run, Coach, Perfil, Admin, Auth).
  * `src/components/GraphicsLibrary/` — Biblioteca de 13 componentes visuais interativos e de alta fidelidade (cards com Lock-Header, gráficos lineares e de barras, calendários, etc.).
  * `src/store/index.js` — Gestão de estado global do cliente com Zustand.
  * `src/styles/globals.css` — Estilos globais e tokens de CSS com overrides específicos.
  * `src/utils/` — Utilitários de conversão e cálculo (paces, datas, métricas corporais, experiência do atleta).
* `supabase/` — Código do backend Supabase
  * `supabase/functions/` — Edge Functions escritas em TypeScript para Deno:
    * `coach-chat/` — Gestor principal do chat, orquestração e ferramentas.
    * `suggest-goals/` — IA que avalia o perfil e gera metas corporais e nutricionais realistas.
    * `analyze-meal/`, `analyze-gym/`, `analyze-run/`, `analyze-body/` — Especialistas de leitura de prints/fotos e registo manual.
    * `save-push-subscription/`, `send-water-reminders/` — Infraestrutura de envio de lembretes Web Push.
  * `supabase/migrations/` — Ficheiros de migração SQL aplicados à base de dados.
* `specs/` — Especificações técnicas e funcionais do produto
  * `specs/PRD.md` — Documento de Requisitos do Produto (regras de caminhos, acessibilidade, assets).
  * `specs/coach-investigacao.md` — Doutrina de treino, limiares de volume e controlo de esforço.
* `public/` — Ficheiros estáticos do build (Service Worker `sw.js`, manifest, logos, previews de widgets).
* `docs-images/` — Imagens reais da aplicação capturadas diretamente das vistas reais do React por Puppeteer.
* `publish_to_notion.js` — Script automatizado de publicação e sincronização da documentação com o Notion API.

---

## 3. Arquitetura Técnica & Infraestrutura

```mermaid
graph LR
    subgraph Frontend Client (React Vite)
      A[Zustand Store] --> B[React UI Screens]
      B --> C[GraphicsLibrary / ChartJS]
    end
    subgraph Backend Server (Supabase)
      D[(Postgres Database)]
      E[Auth OAuth/Google]
      F[Storage Buckets]
      G[Edge Functions Deno]
    end
    B -->|Supabase JS SDK| E
    B -->|Supabase JS SDK| D
    B -->|HTTP API / JWT| G
    G -->|Gemini API| H[Gemini 1.5 / Flash LLM]
    G -->|Query / Write| D
```

### ⚙️ Configuração de Ambientes e Deploy
* **Ramo `master` (Produção)**: Alojado no **GitHub Pages** em `https://rpmariano.github.io/ironhealth/`. 
  * O build é automatizado via GitHub Actions (`.github/workflows/deploy-pages.yml`).
  * O `vite.config.mjs` lê a base path via `VITE_BASE=/ironhealth/`.
* **Ramo `dev` (Desenvolvimento)**: Alojado no **Netlify** sob domínio temporário com base path `/`.
* **Segurança e Regra de Caminhos de Assets**:
  * Para evitar 404 em assets da diretoria `/public/` nos diferentes caminhos de base, deve usar-se sempre o utilitário `publicUrl()` (`src/lib/utils.js`).
  * O Service Worker em `public/sw.js` is registado com o scope correto recorrendo a `import.meta.env.BASE_URL`.

### 🛡️ Gestão e Conexão de Base de Dados
* Não existe uma base de dados de desenvolvimento isolada; o backend em Supabase é partilhado.
* **Nota Importante**: O ficheiro `supabase_schema.sql` funciona como registo descritivo do modelo de dados. No entanto, a base de dados real do utilizador é a **única fonte de verdade** sobre o estado das tabelas e constrangimentos (Check Constraints e Foreign Keys). 
* Qualquer alteração de dados ou campos novos deve ser registada no diretório `supabase/migrations/` e refletida nos prompts de seleção de colunas explícitas das Edge Functions.

---

## 4. Módulos Funcionais & Regras de Preenchimento

### 🏠 Módulo 1: Início
O painel de comando do utilizador.
* **Consumo Calórico Diário**: Compara as calorias consumidas acumuladas nas refeições de hoje contra a meta configurada no perfil (`calorie_goal`).
* **Registo de Água**: Monitoriza a hidratação diária, com presets rápidos (+200ml, +250ml, +300ml, +500ml) e meta definida por `water_goal_ml` (2000ml por defeito).
* **Fórmulas de Dashboards**:
  * **Pace Médio (min/km)**:
    $$\text{Pace Médio} = \frac{\text{Duração Total em Segundos}}{\text{Distância Total em km} \times 60}$$
  * Se existirem splits reais gravados, o ecrã utiliza as parciais exatas.

### 🥗 Módulo 2: Nutrição & Lembretes de Água
* **Enum de Refeições (`meal_type`)**: Pequeno-almoço, lanche da manhã, almoço, lanche, jantar, ceia.
* **Registo Assistido**:
  * **Foto (IA)**: Upload de até 6 fotos analisadas pela Edge Function `analyze-meal`.
  * **Manual**: O utilizador escreve o nome e gramagem (opcional). O sistema efetua uma chamada única ao Gemini para estimar a tabela nutricional total (proteínas, hidratos, gorduras, calorias, sódio, etc.), guardando o resultado e o comentário analítico do Coach.
  * **Gramas opcionais**: Se o peso for omitido, a IA infere uma porção padrão baseando-se no tipo e observações da refeição.
* **Lembretes de Água via Web Push**:
  * Disparados ciclicamente via `pg_cron` e Edge Function `send-water-reminders`.
  * **Janela horária configurável**: Granularidade de 1h (por defeito das 08:00 às 22:00, hora de Lisboa).
  * **Comportamento dinâmico**: Registar água reinicia a contagem de inatividade (`water_last_activity_at`).
  * **Controlo de Ruído**: Botões para "Adiar Próximo" ou "Silenciar Hoje" (expira automaticamente no dia seguinte).

### 🏋️ Módulo 3: Ginásio
* **Diferenciação de Tipos (`kind`)**:
  1. `forca` (Musculação): O volume total da sessão é calculado com base nas séries ativas:
     $$\text{Volume de Força (kg)} = \sum (\text{Repetições} \times \text{Carga})$$
  2. `aula` (Pilates, RPM, HIIT): O volume é sempre zero. O Coach e os validadores sabem que o volume nulo é correto para aulas de grupo e não acionam avisos de erro ou falhas de progresso.

### ⚖️ Módulo 4: Corpo (Composição Corporal)
* **Extração Automática da App Renpho**:
  * A IA extrai e valida os **13 indicadores de composição corporal** (Peso, IMC, Gordura Corporal %, Músculo Esquelético %, Massa Muscular kg, Água Corporal %, Proteína %, Massa Óssea kg, BMR, Gordura Visceral, Gordura Subcutânea %, Idade Metabólica e Massa Magra kg).
  * Cada métrica é confrontada com a respetiva meta. Um recuo nos valores em comparação com a pesagem anterior gera um ponto de status de alerta no calendário.

### 🏃 Módulo 5: Corrida & Agenda de Provas
* **Registo de Atividades**: Mapeamento de treinos (longo, contínuo, limiar, séries, etc.) e recolha de métricas de splits de voltas, desnível (D+) e zonas de frequência cardíaca.
* **Agenda de Provas (`race_events`)**:
  * Os campos de distância, tempo-alvo, ritmo-alvo, local e nível são obrigatórios.
  * **Cálculos cruzados**: A edição do ritmo-alvo calcula o tempo final da prova e vice-versa, adaptando-se em tempo real conforme a distância oficial escolhida.
  * **Desnível Acumulado (D+)**: Campo exclusivo para o tipo `trail`. Na base de dados, a check constraint impede desnível superior a zero em provas de estrada.

### 👤 Módulo 6: Perfil & Regra de Salvaguarda
* **Campos Críticos**: Data de nascimento (`birth_date`), nível geral de corrida (`experience_level`) e contexto do Coach (`coach_context`).
* **Salvaguarda de Navegação**:
  * Alterações efetuadas nos formulários ativam um estado de bloqueio (`navGuard`). Mudar de separador ou tentar sair da página sem gravar ativa um diálogo com opções para **Gravar e Sair**, **Sair sem gravar** ou **Cancelar**.
  * Apenas as colunas efetivamente alteradas são enviadas no `UPDATE`, garantindo que campos alterados em background pelo servidor (como timers de água) não são sobrescritos com rascunhos desatualizados.

---

## 5. Arquitetura & Doutrina da IA do Coach

### 🧠 Janelas de Contexto e Limites
Para controlar custos e latência de processamento de tokens na API Gemini, a Edge Function injeta no prompt as seguintes janelas padrão:
* **Refeições & Água**: Últimos 7 dias completos + dia corrente.
* **Atividade Física**: Últimos 30 dias de treinos de corrida e ginásio.
* **Pesagens**: Últimas 5 avaliações corporais completas.
* **Agenda de Provas**: Todas as provas futuras calendarizadas.

Se o utilizador pedir análises fora deste espectro, o Coach utiliza **Function Calling (Tools)** para invocar:
* `get_nutrition_history(startDate, endDate)`
* `get_gym_history(startDate, endDate)`
* `get_running_history(startDate, endDate)`

### 👥 Orquestração: Equipa de 4 Coaches
O sistema está estruturado em **4 sub-agentes**:
1. **Coach André (Responsável)**: O interlocutor único. Reúne a informação, cruza com as tabelas de corpo e responde ao utilizador.
2. **Coach de Nutrição (Especialista)**: Corre no momento do registo de refeições (`analyze-meal`), devolvendo o parecer estruturado e o comentário.
3. **Coach de Corrida (Especialista)**: Analisa dados de treino cardiovascular (`analyze-run`).
4. **Coach de Força (Especialista)**: Valida sessões de musculação e cargas (`analyze-gym`).

> [!NOTE]
> Os especialistas correm estritamente **no momento da escrita (registo)**, guardando os pareceres em colunas dedicadas. O Coach André (responsável) lê estes pareceres pré-processados na chamada do chat. Esta orquestração assíncrona reduz o custo de tokens e o tempo de resposta em cerca de 75%.

### 📋 Doutrina e Regras de Prevenção (Tapering & Carbloading)
Os limiares de fadiga e regras de periodização seguem a doutrina mapeada em `specs/coach-investigacao.md`:
* **Proatividade face a Provas**:
  * **Tapering (Última semana)**: O Coach recomenda redução de 30% a 50% no volume de kms de corrida e redução de cargas no ginásio para recuperação do glicogénio e alívio do sistema nervoso central.
  * **Carbloading (Últimos 2-3 dias)**: Aconselha o aumento da meta diária de hidratos de carbono e de água (exigindo monitorização estrita das metas de hidratação).
  * **Segurança**: O Coach está proibido de sugerir défices calóricos de perda de peso num raio de 10 dias antes de provas de resistência longa (meias-maratonas e maratonas).

---

## 6. Qualidade, Testes Automáticos & Ferramentas de IA

### 🧪 Cobertura de Testes
O projeto possui suites de testes automatizadas cobrindo o cliente e as Edge Functions:
* **Testes de Frontend (React)**:
  * Suite em **Vitest** + **Testing Library**.
  * Executado via `npm run test` (ou `cmd /c "npm run test"`).
  * Composto por **96 testes unitários** focados em validadores de paces, cálculo de idade a partir da data de nascimento, processamento de dicas de hidratação e regras do calendário nutricional.
* **Testes de Backend (Deno Edge Functions)**:
  * **20 testes** de integração e validação de payloads do Gemini e Supabase executados no runtime do Deno.

### 🤖 Agentes e Processo de Revisão
* **Revisor Pré-Deploy (`pre_deploy_reviewer`)**:
  * Ficheiro de configuração em `.agents/pre_deploy_reviewer.json` e `.claude/agents/`.
  * Corre testes unitários, valida lints e compara as alterações de código locais contra a especificação funcional do PRD e o SDD antes de autorizar a publicação em produção (`master`).
* **Discovery de Customizações & Skills**:
  * O projeto utiliza o sistema de skills do Antigravity documentado em `skills-lock.json`.
  * Skills principais ativas:
    * `agy-customizations` — Definições das regras de desenvolvimento local.
    * `firebase-firestore` — Auditoria estruturada de bases de dados e regras de escrita.
    * `android-cli` — Gestão de compilação móvel e emuladores.

---
*Documento oficial de engenharia atualizado e mantido em conformidade com o código-fonte em vigor no ramo `master`.*
