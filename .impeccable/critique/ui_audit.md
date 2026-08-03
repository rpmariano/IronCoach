# 🎨 Relatório de Auditoria Visual Impeccable (UI Critique) — IronHealth

> **Data de Auditoria**: 2026-08-03  
> **Escopo**: Todos os módulos e componentes da interface (`src/components/`)  
> **Objetivo**: Mapear inconsistências visuais, desalinhamentos de tokens de marca, alvos táteis e lacunas de integração com o `design-system/` para fundamentar a refatoração visual.

---

## 1. Visão Geral da Auditoria

A auditoria visual foi realizada aplicando a metodologia **Impeccable UI Critique**, inspecionando detalhadamente a estrutura visual, o uso de CSS tokens, alvos táteis (touch targets ≥44px), acessibilidade e consistência de padrões de UI entre as telas de **Início**, **Nutrição**, **Ginásio**, **Corrida**, **Corpo**, **Coach**, **Perfil**, **Auth** e **Admin**.

---

## 2. Inconsistências Mapeadas por Módulo / Componente

### 2.1. Navegação Global & Estrutura (`src/components/Layout/Layout.jsx`)
* **Botão Flutuante (FAB)**:
  * ❌ *Problema*: O botão flutuante central no `nav` inferior está codificado com estilos inline e cores arbitrárias `bg-[#f3d5ab]` e `border-[#0f172a]` em vez de utilizar o token de marca Coral (`var(--accent)`).
  * ❌ *Problema*: Os botões do menu do FAB (`FabItem`) utilizam cores utilitárias do Tailwind hardcoded (`bg-[#059669]`, `bg-[#7c3aed]`, `bg-[#c026d3]`, `bg-[#2563eb]`) em vez das variáveis de módulo padronizadas (`--mod-nutricao`, `--mod-corpo`, `--mod-corrida`, `--mod-ginasio`).
* **Barra de Navegação Inferior (`VBarBtn`)**:
  * ❌ *Problema*: A indicação de aba ativa está fixada com a cor de Ginásio (`text-[var(--mod-ginasio-to)]`) para **todos** os módulos, ignorando a identidade de cor de cada módulo ou a cor primária do sistema.
  * ❌ *Problema*: Faltam atributos `aria-label` explícitos nos botões de navegação baseados em ícones + texto reduzido.

---

### 2.2. Módulo Início (`src/components/Home/Home.jsx`)
* **Cartões de Estatística & Rápidos**:
  * ⚠️ *Gradientes & Bordas*: Mistura de funções `statCardBg()` com cálculos inline `color-mix(in srgb, ...)` e `radial-gradient` que geram variações visuais entre o card de *Nutrição Hero* (`rounded-3xl`), cartões normais (`rounded-2xl`) e o card de *Próxima Prova*.
* **Botão de Personalização**:
  * ❌ *Alvo Tátil*: O botão de "Personalizar Início" utiliza a classe `tap-h-44`, contudo o seu padding vertical reduz o container interno, variando visualmente em relação ao botão de "Perfil" do cabeçalho.

---

### 2.3. Módulo Nutrição (`src/components/Nutrition/*`)
* **Visualização de Calendário & Dashboard**:
  * ⚠️ *Componente de Calendário*: `NutritionCalendar.jsx` desenha uma grelha de dias customizada com classes Tailwind avulsas, que não partilha os mesmos estados visuais nem seletores de data usados em `GymCalendar.jsx` e `RunCalendar.jsx`.
* **Formulários de Registo (`MealRegistration.jsx`)**:
  * ❌ *Botões de Controlo*: Botões de fechar (X) e botões de incremento/decremento de água/macros em `WaterTracker.jsx` variam de tamanho entre 32px e 40px, violando a regra de alvo tátil mínimo de **44px × 44px**.

---

### 2.4. Módulo Ginásio (`src/components/Gym/*`)
* **Cards de Sessão (`GymSessionCard.jsx`)**:
  * ⚠️ *Estilo de Card*: Os cartões de treino possuem cantos `rounded-2xl` com sombras customizadas que diferem do padrão de cards utilizado no módulo de Corrida (`RunCard.jsx`).
* **Botões de Ação Secundária**:
  * ❌ Botões de remoção de série ou edição de exercícios não possuem `aria-label` e apresentam superfícies escuras inconsistentes com o padrão neutro (`bg-slate-100` / `var(--surf-900)`).

---

### 2.5. Módulo Corrida (`src/components/Run/*`)
* **Agenda de Provas (`RunAgenda.jsx`)**:
  * ⚠️ *Incoerência de Ficheiros*: Existe um ficheiro de cópia de segurança `RunAgenda.jsx.bak` na árvore de ficheiros que necessita de ser limpo.
* **Cards de Corrida (`RunCard.jsx`)**:
  * ❌ *Botões de Ação*: Os botões de apagar/editar corrida utilizam ícones diretos do `lucide-react` sem invólucro de botão circular de sistema (`rounded-full` 44×44px com superfície neutra).

---

### 2.6. Módulo Composição Corporal (`src/components/Body/*`)
* **Registos & Dashboard (`BodyDashboard.jsx` / `BodyRegistration.jsx`)**:
  * ⚠️ *Tipografia de Métricas*: Os valores numéricos usam classes como `text-2xl font-black`, enquanto outros módulos usam `text-3xl font-extrabold` ou `text-xl font-bold`, criando desalinhamento na hierarquia tipográfica.

---

### 2.7. Módulo Coach (`src/components/Coach/Coach.jsx`)
* **Interface de Chat**:
  * ⚠️ *Balões de Mensagem*: O balão de resposta da IA usa gradientes roxos/azuis que não correspondem aos design tokens do sistema (`var(--accent)` ou `var(--chrome)`).
* **Botão de Envio de Mensagem**:
  * ❌ O botão de envio no chat possui dimensão inferior a 44px e falta-lhe atributo `aria-label="Enviar mensagem"`.

---

### 2.8. Módulos Perfil, Auth e Admin (`src/components/Perfil`, `Auth`, `Admin`)
* **Formulários de Autenticação & Configuração**:
  * ⚠️ *Inputs e Botões*: Os botões primários nos formulários de perfil e login usam classes avulsas `bg-emerald-600` e `bg-indigo-600` em vez de reusar o componente `<Button variant="primary">` do `design-system`.

---

## 3. Matriz de Inconsistências Visuais Cruzadas

| Item de UI | Estado Atual | Regra Padrão Aprovada |
| :--- | :--- | :--- |
| **Biblioteca de UI** | Componentes inline com estilos Tailwind heterogéneos | Usar `design-system/` como **Single Source of Truth** |
| **Botões de Sistema (Fechar/Voltar)** | Botões retangulares/quadrados de 32px-38px sem `aria-label` | Circulares (`rounded-full`), superfície neutra (`var(--surf-900)`), **44×44px** |
| **Botão Flutuante (FAB)** | Cor amarela/dourada inline (`bg-[#f3d5ab]`) | Fundo Coral de marca (`var(--accent)` / `#ff6b6b`), **56×56px** com sombra elevada |
| **Indicador de Aba Ativa** | Cor de Ginásio hardcoded para todas as abas | Cor temática dinâmica por módulo ou cor primária de sistema |
| **Cartões de Módulo** | Gradientes complexos misturados com bordas assimétricas | Estrutura unificada com superfícies limpas e acento de cor do módulo |
| **Alvos Táteis (Touch Targets)** | Variação entre 28px e 40px em botões de ícone | **Mínimo obrigatório de 44px × 44px** em todos os elementos clicáveis |

---

## 4. Plano de Refatoração Visual (Execução da Fase 1)

1. **Atualização do `design-system/`**: Garantir que a biblioteca de componentes exporta os botões, cartões, badges e chips necessários com os design tokens corretos.
2. **Refatoração do `Layout.jsx`**:
   * Atualizar o FAB para Coral (`var(--accent)`).
   * Dinamizar a cor da aba ativa de acordo com o módulo.
   * Ajustar todos os botões de navegação para alvos táteis de 44px com `aria-label`.
3. **Refatoração dos Módulos Principais (`Home`, `Nutrition`, `Gym`, `Run`, `Body`, `Coach`)**:
   * Substituir botões e cards heterogéneos pelos componentes do Design System.
   * Limpar o ficheiro residual `RunAgenda.jsx.bak`.
4. **Verificação Visual**: Concomitante com a consolidação da UI.

---
*Relatório registado no repositório em `.impeccable/critique/ui_audit.md`.*
