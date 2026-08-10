# Walkthrough: Biblioteca de Grafismos & Componentes Reutilizáveis (IronHealth)

Este documento descreve as implementações concluídas para o novo **Design System de Alta Fidelidade** da IronHealth. Todos os componentes foram modelados com foco em estética premium, glassmorphism, sombras suaves e responsividade, e estão organizados para fácil migração e reutilização no repositório master (React).

---

## 📂 Estrutura do Repositório
Todos os novos ficheiros visuais residem na pasta:
* [`src/components/GraphicsLibrary/`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary)

Eles estão divididos em 13 pares de componentes (`.jsx` + `.css`):

### 1. Home Page Widgets (Tela Principal)
* [`NextRaceCard.jsx`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/NextRaceCard.jsx) & [`.css`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/NextRaceCard.css):
  * **Descrição**: Painel dourado de contagem regressiva para a próxima corrida com barra de progresso horizontal e um mini-corredor interativo animado.
* [`HydrationSqueezeCard.jsx`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/HydrationSqueezeCard.jsx) & [`.css`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/HydrationSqueezeCard.css):
  * **Descrição**: Anel de progresso circular de água com garrafa dinâmica interativa e controle rápido de volume (+200ml / +250ml).
* [`NutritionMacroCard.jsx`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/NutritionMacroCard.jsx) & [`.css`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/NutritionMacroCard.css):
  * **Descrição**: Gráfico circular principal (Calorias Restantes) emparelhado com barras dinâmicas em pílula para proteínas, hidratos e gorduras.

### 2. Cards de Detalhe (Colapsados & Expandidos)
Estes componentes seguem o padrão **Seamless Lock-Header** (o cabeçalho colapsado e o cabeçalho expandido têm exatamente as mesmas dimensões, tipos de letra, ícones e alinhamentos, permitindo uma transição visual perfeita na expansão sem saltos na interface).

* #### 🟢 Nutrição ([`TimelineCard.jsx`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/TimelineCard.jsx) & [`.css`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/TimelineCard.css))
  * **Colapsado**: Exibe o título **Jantar**, hora/categoria (`20:00 • Jantar`), três mini-pílulas com os macros resumidos (P, C, G) e o total em calorias (`555 kcal`).
  * **Expandido**: Revela a grelha de 4 macro-pílulas (calorias, proteína, hidratos, gordura), um espaço reservado para **Fotos** da refeição (miniaturas arredondadas), observações estáticas (sem botão de adicionar/editar), a lista de alimentos ("Bola De Berlin") com indicação de peso, e botões lado a lado no rodapé: **"Editar refeição"** e **"Eliminar refeição"**.

* #### 🟣 Corrida ([`RunningCard.jsx`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/RunningCard.jsx) & [`.css`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/RunningCard.css))
  * **Colapsado**: Exibe o título **Treino da tarde**, pílula de tipo de treino (`Contínuo`), macros resumidos (tempo e ritmo), a distância total (`11.32 km`) e o ícone de ténis de corrida.
  * **Expandido**: Inclui a grelha de 3 pílulas principais (distância, tempo total, ritmo médio), a secção de **Prints** para capturas do treino, barra interativa de **Esforço (1-10)** segmentada em 10 blocos (com 4 ativos), a caixa de **Análise do Coach** estruturada em verde com ícone de marcador, e botões de ação final lado a lado: **"Editar treino"** (destaque magenta) e **"Eliminar treino"** (em vermelho).

* #### 🔵 Corpo ([`BodyCard.jsx`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/BodyCard.jsx) & [`.css`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/BodyCard.css))
  * **Ajuste Técnico**: O título **"Avaliação Corporal"** foi diminuído para `0.95rem` com a regra `white-space: nowrap;` aplicada ao título e ao peso (**`79.25 kg`**), evitando qualquer quebra de linha em ecrãs estreitos.
  * **Colapsado**: Exibe o título, data (`03/08/2026`), ícone personalizado de "Body Scan", e três pílulas (Fat, Musc, IMC).
  * **Expandido**: Apresenta as 4 pílulas resumidas no topo (Peso, Gordura, Músculo, IMC), observações estáticas (sem botões de alteração), a grelha completa **"Todas as métricas"** disposta em duas colunas com 13 indicadores de avaliação detalhados (água, idade metabólica, gordura subcutânea/visceral, etc.) com marcadores circulares coloridos individuais, e botões de ação final lado a lado: **"Editar avaliação"** (destaque roxo) e **"Eliminar avaliação"** (em vermelho).

* #### 🔵 Ginásio ([`ExerciseCard.jsx`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/ExerciseCard.jsx) & [`.css`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/ExerciseCard.css))
  * **Ajuste Técnico**: O título **"Treino funcional"** e a duração (**`45 min`**) têm a regra `white-space: nowrap;` aplicada, impedindo a quebra de linha. A hipótese de adicionar exercícios a partir do painel expandido foi removida deliberadamente (uma vez que essa operação será disponibilizada apenas dentro do ecrã de edição).
  * **Colapsado**: Exibe o título, tag `Treino` (pílula laranja), contadores de exercícios/séries, peso total e destaque da duração (`45 min`).
  * **Expandido**: Mostra as 4 pílulas (duração, calorias, batimentos cardíacos médios e máximos), bloco de feedback de **Esforço (1-10)** com indicador estático (`—`), galeria de **Prints do treino**, caixa de observações estática, e botões de ação final lado a lado: **"Editar treino"** (destaque azul) e **"Eliminar treino"** (em vermelho).

### 3. Gráficos & Estatísticas
* [`CompactCircularChart.jsx`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/CompactCircularChart.jsx) & [`.css`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/CompactCircularChart.css):
  * **Descrição**: Gráfico de progresso circular compacto (meia-largura, ~170px) para exibir conquistas individuais de macro-nutrientes lado a lado numa grelha.
* [`LineChart.jsx`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/LineChart.jsx) & [`.css`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/LineChart.css):
  * **Descrição**: Gráfico de linha vetorial SVG simples com curva Bezier e área de gradiente sombreada, atualizado com o tema vermelho/rosa (sólido e gradiente).
* [`DetailedLineChart.jsx`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/DetailedLineChart.jsx) & [`.css`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/DetailedLineChart.css):
  * **Descrição**: Gráfico de linha detalhado com eixos X e Y completos, marcas de escala (ticks), linhas de grelha horizontais, legenda superior ("Calorias" e "Meta") e curva de spline vermelha com área de gradiente semitransparente.
* [`BarChart.jsx`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/BarChart.jsx) & [`.css`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/BarChart.css):
  * **Descrição**: Histograma semanal com barras em cápsula 3D, destacando automaticamente o dia de pico com cores do módulo.
* [`MuscleAnatomy2D.jsx`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/MuscleAnatomy2D.jsx) & [`.css`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/MuscleAnatomy2D.css):
  * **Descrição**: Mapa vetorial dinâmico (2D Flat) do corpo humano suportando **visão Frontal (Anterior) e Traseira (Posterior)** importado via `react-body-highlighter`. Permite receber um array de músculos ativados via props (ex: `activeMuscles={['chest', 'abs']}`) e a prop `type="anterior" | "posterior"`, preenchendo os músculos com o vermelho da IronHealth. Os SVGs e CSS foram personalizados para remover fundos genéricos e adotar o tom cinza-neutro da interface (slate-200).

### 4. Calendários & Botões Interativos
* [`PremiumCalendar.jsx`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/PremiumCalendar.jsx) & [`.css`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/PremiumCalendar.css):
  * **Descrição**: O calendário especial **B2 Capsule Split**. Suporta navegação mensal e exibe micro-pílulas horizontais coloridas de status na base de cada dia (ex: se bateu meta de água, nutrição ou excedeu).
* [`PremiumButtons.jsx`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/PremiumButtons.jsx) & [`.css`](file:///c:/Users/rpmar/IronHealth/src/components/GraphicsLibrary/PremiumButtons.css):
  * **Descrição**: Biblioteca de botões com gradiente premium, botões glassmorphism de contorno fino, botões flutuantes (FAB) e botões temáticos dos módulos.

---

## 🛠️ Instruções para Integração (Handover para Claude Code)
Quando solicitar ao Claude Code para aplicar estes elementos na versão Master (React), ele deve seguir estas orientações:

1. **Migração Física**:
   * Copiar a pasta `src/components/GraphicsLibrary/` inteira para a mesma localização no projeto Master.
2. **Substituição de Estado e Props**:
   * Abrir os ecrãs de detalhe reais (como `Body.jsx`, `Nutrition.jsx`, `Running.jsx` ou os respetivos ficheiros de calendário locais).
   * Substituir os componentes estáticos ou antigos pelas importações da `GraphicsLibrary`.
   * Mapear os dados vindos de bases de dados (Supabase, Firebase, etc.) para os parâmetros (`props`) expostos em cada componente.
3. **Estilos Globais**:
   * Garantir que as fontes globais (como Inter, Outfit ou Roboto) estão carregadas para que a tipografia renderize com a elegância especificada.
4. **Verificação no Styleguide**:
   * Aceder a [`public/all_widgets_preview.html`](file:///c:/Users/rpmar/IronHealth/public/all_widgets_preview.html) no browser para verificar a coerência visual antes de fazer commits na ramificação principal.
5. **Regras e Arquitetura do Coach de IA**:
   * O fluxo de dados unificado do Coach (cruzando dados de Nutrição, Corrida, Ginásio e Corpo) e as respetivas janelas de histórico analisadas estão inteiramente documentados em [**`sdd.md`**](file:///c:/Users/rpmar/IronHealth/sdd.md) na raiz do projeto. O Claude Code deve seguir este documento para garantir que o Coach mantenha a inteligência contextual em todos os módulos.
