# 🧪 Qualidade, Testes & Processo CI

Este documento descreve a suite de testes automatizados do IronHealth v2, a execução de validações no pipeline e a governação do código antes da publicação em produção.

---

## 📋 Conteúdo
1. [Suite de Testes de Frontend (React Vitest)](#1-suite-de-testes-de-frontend-react-vitest)
2. [Suite de Testes de Backend (Deno Edge Functions)](#2-suite-de-testes-de-backend-deno-edge-functions)
3. [Processo de Publicação & O Agente pre_deploy_reviewer](#3-processo-de-publicação--o-agente-pre_deploy_reviewer)
4. [Discovery de Skills & Customizações do Antigravity](#4-discovery-de-skills--customizações-do-antigravity)

---

## 1. Suite de Testes de Frontend (React Vitest)

A aplicação React utiliza o framework de testes **Vitest** emparelhado com o **React Testing Library** para garantir que refatores e modificações visuais não introduzem erros nas regras de negócio.

* **Execução**: `npm run test` (em sistemas Windows com restrição de script, rodar `cmd /c "npm run test"`).
* **Volume**: **96 testes unitários** focados no cliente.

### 🧪 Lista de Ficheiros de Teste
1. `src/utils/run.test.js`:
   * Testa a conversão bidirecional de ritmos (min/km com ponto decimal) e a correspondência do enum `RACE_TYPES` com os constrangimentos do banco de dados Postgres.
2. `src/utils/body.test.js`:
   * Testa o cálculo dinâmico da idade a partir de `birth_date` em hora local.
3. `src/utils/nutrition.test.js`:
   * Valida as regras de negócio de atribuição de pontos de cor no calendário diário (ponto verde, vermelho e indicador de hidratação azul).
4. `src/store/index.test.js`:
   * Testa a gestão de estado global com Zustand e a integridade de gravação de parciais na store.
5. `src/components/Perfil/Perfil.test.jsx`:
   * Valida o comportamento do formulário e o travão de navegação `navGuard` perante modificações não salvas.
6. `src/components/Run/RunRegistration.test.jsx` & `RunCard.test.jsx`:
   * Valida o comportamento do painel de registo de corrida (Manual vs Foto).
7. `src/components/Gym/GymRegistration.test.jsx` & `BodyRegistration.test.jsx` & `MealRegistration.test.jsx`:
   * Testes funcionais dos ecrãs de registo rápido para assegurar o correto preenchimento de campos obrigatórios.

---

## 2. Suite de Testes de Backend (Deno Edge Functions)

As Edge Functions correm sob o ecossistema Deno no Supabase e utilizam a suite integrada de asserções do Deno para testes.

* **Volume**: **20 testes unitários**.
* **Ficheiro principal**: `supabase/functions/coach-chat/index.test.ts`.
* **Âmbito**:
  * Garante que os payloads enviados para a API do Gemini contêm as informações estruturadas corretas.
  * Valida que as respostas no formato JSON são parseadas corretamente de acordo com os schemas esperados de `on_topic` e `suggestions`.

---

## 3. Processo de Publicação & O Agente `pre_deploy_reviewer`

Para proteger a estabilidade da branch `master` no GitHub e assegurar que as especificações do PRD e as regras de caminhos não são violadas, o repositório possui um processo de revisão automática.

* **O Agente Revisor (`pre_deploy_reviewer`)**:
  * Configurado em `.agents/pre_deploy_reviewer.json` e `.claude/agents/`.
  * É invocado localmente antes de qualquer comando de deploy ou push.
  * O revisor executa autonomamente o diff de Git contra a branch de referência, analisa as alterações efetuadas em JSX/JS e valida se foram introduzidos caminhos absolutos ilegais para a pasta `/public/` (forçando a utilização da função `publicUrl()`).

---

## 4. Discovery de Skills & Customizações do Antigravity

A governação do projeto pelo assistente de programação é apoiada pelo ecossistema de ferramentas customizadas e descoberta de skills do Antigravity.

* **Ficheiro de Contrato**: `skills-lock.json` na raiz do projeto.
* **Skills Empregadas**:
  * `agy-customizations`: Define a orquestração do ciclo de commits e governação do repositório.
  * `firebase-firestore`: Empregada em tarefas de verificação de schemas relacionais e auditoria de RLS.
  * `android-cli`: Permite o deploy e simulação em dispositivos virtuais móveis para teste da PWA e layouts táteis.
