# Documento de Requisitos do Produto (PRD) — IronHealth

Este documento define o comportamento global, a arquitetura e os módulos da aplicação **IronHealth**, servindo como especificação base para o desenvolvimento e revisão de código.

## 1. Visão Geral
O **IronHealth** é uma PWA (Progressive Web App) criada para monitorizar e otimizar a saúde e performance de atletas.
- **Objetivo Principal**: Permitir que os atletas registem os seus dados de treino, nutrição e métricas corporais *após a realização dos mesmos*, permitindo que o seu treinador (Coach) analise e dê feedback de forma assíncrona.
- **Público-alvo**: Atletas e os seus respetivos treinadores.
- **Idioma Principal**: Português de Portugal (pt-PT).

## 2. Tecnologias & Arquitetura
- **Frontend**: React (Vite) na versão moderna; JavaScript vanilla estruturado na versão legado.
- **Estilos**: Tailwind CSS e variáveis CSS nativas em `src/styles/globals.css`.
- **Backend / Base de Dados**: Supabase (Autenticação via Google OAuth, base de dados em tempo real).
- **Gestão de Estado**: Zustand (`src/store/index.js`).

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
- **Lembretes de água** (definidos no Perfil): notificação push periódica enquanto a meta diária não for atingida.
  - Intervalo configurável (30/60/90/120/180/240 min).
  - **Janela horária configurável** (hora de início e hora de fim, granularidade de 1h, 00:00–23:00). Por omissão, quando o utilizador não define outro valor: **08:00–22:00** (hora de Portugal, `Europe/Lisbon`).
  - Suporta janelas que atravessam a meia-noite (ex.: início=22h, fim=6h) e o caso início=fim (lembretes 24h).
  - "Silenciar resto do dia" independente da ativação geral.

### 3.3. Treino / Ginásio (`Gym`)
- Registo de sessões de ginásio realizadas.
- Cálculo de volume de treino (séries × repetições × peso em kg) semanal e histórico.
- Visualização gráfica de volume e frequência de treino.

### 3.4. Corrida (`Run`)
- Registo de treinos de corrida (Distância, Ritmo/Pace médio e Duração).
- Listagem de próximas provas agendadas e contagem decrescente de dias.
- Gráfico de distância percorrida semanalmente.

### 3.5. Composição Corporal (`Body`)
- Registo de avaliações físicas (Peso, Massa Gorda, Massa Muscular).
- Gráficos históricos de evolução de peso e composição corporal.

### 3.6. Aconselhamento do Coach (`Coach`)
- Chat de interação assíncrona com um assistente virtual ou treinador real.
- Recomendações personalizadas com base nos dados registados nos restantes módulos.

---

## 4. Diretrizes de Design & Consistência Visual

### 4.1. Cores de Marca & Design Tokens
As cores devem utilizar rigorosamente as variáveis declaradas em `globals.css`:
- **Accent (Coral)**: `var(--accent)` (Hover/Active: `var(--accent-dark)`)
- **Chrome (Dourado/Bronze)**: `var(--chrome)` (Hover: `var(--chrome-dark)`)
- **Green (Verde Garrafa)**: `var(--green)`
- **Superfícies**: `var(--surf-900)` (Branco/Cards) e `var(--surf-950)` (Fundo principal da página)
- **Texto Escuro**: `var(--text-main)` (`#0f172a`) para garantir legibilidade ideal.

### 4.2. Mapeamento de Cores por Módulo
- **Nutrição**: Mapeado para `--mod-nutricao-from` / `--mod-nutricao-to`.
- **Ginásio**: Mapeado para `--mod-ginasio-from` / `--mod-ginasio-to`.
- **Corrida**: Mapeado para `--mod-corrida-from` / `--mod-corrida-to`.
- **Corpo**: Mapeado para `--mod-corpo-from` / `--mod-corpo-to`.

---

## 5. Requisitos Não Funcionais & Acessibilidade

### 5.1. Alvos de Toque (Touch Targets)
- Todos os botões e elementos interativos clicáveis devem ter um tamanho mínimo de **44px × 44px** para garantir uma boa experiência em ecrãs táteis.

### 5.2. Acessibilidade (Leitores de Ecrã)
- Mapeamento obrigatório de `aria-label` em botões que utilizem exclusivamente ícones (ex: botões de fechar, adicionar rápidos, FAB e setas de navegação).
