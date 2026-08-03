# 🧪 Simulação de Jornadas de Utilizador (UX Simulation) — IronHealth

> **Data**: 2026-08-03  
> **Escopo**: FASE 2 — Testes de usabilidade e simulação de fluxos com Personas

---

## 1. Simulação de Jornada — Persona 1: Mariana (Corredora)

### 🚀 Cenário: Registo Pós-Treino de Corrida de 15km via Print do Relógio
1. **Início da Ação**: Mariana abre a app no smartphone. O botão FAB Coral sobressai no centro da barra inferior.
2. **Abertura do Menu**: Clica no FAB `(+)`, abrindo instantaneamente a lista de atalhos. Seleciona "Nova corrida" (ícone magenta).
3. **Leitura por IA (Gemini)**: Carrega um print do ecrã do relógio Garmin. A app exibe o indicador de carregamento *skeleton/spinner*.
4. **Extração & Confirmação**: A IA preenche automaticamente:
   * Distância: `15.20 km`
   * Tempo: `01:18:45`
   * Pace Médio: `5'11"/km`
   * Desnível: `140 m`
5. **Validação**: Mariana faz o toque final em "Guardar Corrida" (botão primário de 44px).
6. **Resultado no Início**: O *NextRaceCard* atualiza os dias restantes para a próxima prova e a barra de progresso semanal de km atualiza de imediato.

---

## 2. Simulação de Jornada — Persona 2: Tiago (Ginásio & Nutrição)

### 🏋️ Cenário: Registo de Sessão de Ginásio & Verificação de Proteína
1. **Registo de Treino**: Tiago acede à aba "Ginásio", clica em "Registar Sessão", seleciona "Treino de Peito & Tríceps" e introduz as cargas (4 séries de Supino com 90kg).
2. **Confirmação de Carga**: O gráfico de volume semanal recalcula imediatamente o total acumulado em kg.
3. **Registo da Refeição Pós-Treino**: Pressiona o FAB `(+)` -> "Registar refeição", tira foto do prato de peito de frango com arroz. A IA identifica ~45g de proteína e 450 kcal.
4. **Visualização no Início**: No *NutritionHeroCard*, a contagem de proteína atualiza para `165 / 200g`, mostrando o badge com o restante em falta.

---

## 3. Simulação de Jornada — Persona 3: Coach André (Treinador IA)

### 🤖 Cenário: Consulta Assíncrona de Avaliação do Progresso
1. **Entrada no Chat**: O atleta clica na aba "Coach".
2. **Apresentação de Sugestões**: O ecrã mostra chips rápidos de pergunta: *"Como está a minha nutrição hoje?"*.
3. **Envio da Pergunta**: Clica no chip. O botão de envio (44×44px com `aria-label`) ativa o estado *loading* com animação de reticências.
4. **Resposta Contextual**: O Coach analisa os registos do dia e responde em pt-PT: *"Excelente treino de peito! Já consumiste 165g de proteína hoje. Falta apenas um snack rico em proteína ao deitar para atingires a meta de 200g."*

---
*Relatório de simulação registado em `.impeccable/critique/ux_simulations.md`.*
