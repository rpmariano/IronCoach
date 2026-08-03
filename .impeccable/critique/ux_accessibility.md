# ♿ Auditoria de Acessibilidade & Ergonomia Tátil (WCAG 2.1 AA) — IronHealth

> **Data**: 2026-08-03  
> **Norma de Referência**: WCAG 2.1 Nível AA & Diretrizes do PRODUCT.md

---

## 1. Avaliação dos Requisitos de Acessibilidade

### 1.1. Dimensão dos Alvos Táteis (Touch Targets ≥ 44px × 44px)
- **Barra de Navegação Inferior (`Layout.jsx`)**: Todos os botões de abas (`VBarBtn`) cumprem `min-h-[44px]` e `min-w-[44px]`.
- **Botão Flutuante (FAB)**: O botão principal possui **56px × 56px** (`min-w-[56px] min-h-[56px]`), superando o mínimo tátil exigido e garantindo acionamento confortável.
- **Botões de Sistema (Voltar, Fechar, Opções)**: Todos os botões circulares reutilizam o padrão `w-11 h-11` (**44px × 44px**).
- **Cartões e Atalhos Rápidos de Água**: Botões `+200ml`, `+250ml`, `+300ml` em `WaterTracker` usam a classe `tap-h-44` / `min-h-[44px]`.

---

### 1.2. Mapeamento de Leitores de Ecrã (`aria-label`)
- **Navegação Global**: `aria-label="Início"`, `aria-label="Nutrição"`, `aria-label="Ginásio"`, `aria-label="Corpo"`, `aria-label="Corrida"`, `aria-label="Coach"`.
- **FAB**: `aria-label="Registar novo item"` / `aria-label="Fechar menu de registo"`.
- **Coach Chat**: `aria-label="Enviar pergunta ao Coach"` no botão de envio com ícone `<Send />`.
- **Cards de Corrida**: `aria-label="Eliminar corrida"` no botão de eliminação com ícone `<Trash2 />`.

---

### 1.3. Contraste de Cores & Foco
- **Contraste de Texto**: O texto principal utiliza `#0f172a` (`var(--text-main)`) sobre fundos brancos/claros (`var(--surf-900)`), garantindo rácio de contraste superior a **7:1** (supera a exigência 4.5:1 da WCAG AA).
- **Indicadores de Estado Ativo**: O estado ativo das abas e botões combina mudança de cor dinâmica com peso tipográfico (`font-bold`) para não depender exclusivamente de uma pista de cor.

---
*Relatório de acessibilidade registado em `.impeccable/critique/ux_accessibility.md`.*
