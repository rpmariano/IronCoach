# IronCoach — Design System

IronCoach é uma PWA de treino para corredores amadores sérios, de estrada e trail. Um coach de IA — **a Carol** — escreve o plano de treino e de alimentação, ajusta-o à semana real do atleta e diz-lhe o que fazer hoje. A app cobre cinco módulos: Corrida, Ginásio, Nutrição, Corpo e Provas, e tem um Dashboard de BI que os cruza numa métrica única, a **Prontidão**.

Este design system fixa a linguagem visual definida no redesenho de setembro de 2026 (direção "6c": vidro sobre curvas de nível, uma cor por significado, minhoca elástica) e as regras de tom da Carol. É a fonte de verdade para o Claude Code implementar o novo UI.

## Fontes

- Codebase local: pasta `IronHealth-claude/` (React + Vite + Tailwind; `src/styles/globals.css`, `src/components/**`, `src/utils/useElasticPillIndicator`)
- Repositório: rpmariano/IronCoach (ver `github.md`)
- Mocks aprovados: `IronCoach - App.dc.html` (36 ecrãs), `IronCoach - Animações.dc.html`
- Auditoria: `IronCoach - Auditoria UX-UI.dc.html`
- Personalidade da Carol: `CAROL.md`
- Estado anterior, para comparação: `IronCoach - Ecrãs atuais.dc.html`

## Fundamentos de conteúdo

- **Português europeu**, segunda pessoa do singular ("tu"). A Carol fala em primeira pessoa; a app nunca fala de si.
- **Frases curtas, afirmativas.** Sem "talvez", sem "considera". "Não gostei dos teus almoços esta semana" antes de "ingestão 12% abaixo do alvo".
- **Sem emojis. Sem exclamações** (uma por semana, no máximo). Sem elogios automáticos.
- **Etiquetas de secção** em frase, não em substantivo: "O que faço hoje", "Para onde vou", "Como estou".
- **Botões** dizem a ação e o objeto: "Registar sessão", "Marcar a próxima prova", "Falar com a Carol". Nunca "OK", "Submeter".
- **Números** com vírgula decimal e espaço de milhar: 72,4 kg · 1 980 kcal · 5:41/km.
- **Datas** curtas em minúsculas: 8 mar 2027 · domingo, 6 de setembro.
- **Avisos** dizem o que aconteceu e o que fazer, sem pedir desculpa: "Não consegui analisar a foto. Escreve o que comeste e eu calculo."
- Ver `CAROL.md` para o tom completo da Carol.

## Fundamentos visuais

**Fundo.** Escuro (`#0b1120`) mas nunca chapado: um gradiente ambiente (âmbar em cima à esquerda, azul à direita, ardósia em baixo) e curvas de nível finas em SVG — ardósia à esquerda, âmbar à direita — dão ao vidro algo para desfocar. Um fade vertical escurece topo e fundo. Vive na moldura do ecrã (`ScreenFrame`), uma vez, por baixo de tudo.

**Cartões.** Vidro a 5%, borda a 10%, raio 24, sombra `0 12px 32px rgba(0,0,0,.3)`, blur 20. **Sem moldura branca** — a borda a 80% do design anterior era o que transformava cada cartão numa ilha. Cartões principais (prova, plano do dia) levam um brilho radial na cor do significado no canto superior direito. Cartões secundários dentro de cartões: raio 18, sem sombra.

**Cor.** Oito cores, um significado cada, nunca reutilizadas: âmbar = prova (e só a prova); ciano = a Carol; ciano-elétrico = corrida; ardósia = ginásio; violeta = nutrição; rosa = corpo; verde = dentro do alvo; coral = aviso. O texto sobre a cor cheia é escuro (`--race-ink`, `--coach-ink`); o texto sobre a tinta a 16% é a própria cor. Contraste ≥ 4.5:1 em todo o lado.

**Tipografia.** Sistema (`ui-sans-serif, system-ui`) — a PWA arranca instantânea. Pesos 500/700/800/900. Piso de **11px** em telefone, sem exceções; 12,5 para corpo secundário, 13,5 para corpo. Números tabulares, peso 900, unidade a 11px apagada. Etiquetas de secção uppercase a 11px com tracking .14em.

**Espaço.** Base 4. Gap 12 entre cartões (8 no Início). Padding lateral 16. Header 85, nav 76, barra de ação a 76 do fundo. **Toque: 44px mínimo em qualquer ação**, 46 nas primárias, 52 nas heróicas.

**Raios.** 7 (badge) · 11 (botão, campo) · 14 (botão de ícone, aviso) · 18 (cartão secundário) · 20 (cartão da Carol) · 24 (cartão principal) · 28 (persiana) · 40 (moldura).

**Sombras.** Cartão `0 12px 32px rgba(0,0,0,.3)`; persiana `0 -14px 40px rgba(0,0,0,.6)`; popup `0 24px 60px rgba(0,0,0,.6)`; FAB `0 4px 20px rgba(251,191,36,.35)`; pílula da nav `0 0 9px rgba(34,211,238,.55)`. Nenhuma sombra interior.

**Transparência e blur.** Header 92% + blur 40; nav 72% + blur 40; barra de ação 90% + blur 30; scrim 62% + blur 3; cartões 5% + blur 20. Persiana e popup são opacos (`#111a26`).

**Estados.** Toque: scale .98 em 120ms. Selecionado: borda 1,5px na cor cheia + tinta a 16%. Desativado: opacidade .45. Foco de teclado: anel de 2px na cor do contexto (a implementar — ausente nos mocks). Sem hover — é touch-first.

**Movimento.** O movimento explica o dado, nunca o decora. Oito animações (ver `IronCoach - Animações.dc.html` e `tokens/motion.css`): anéis desenham-se (1100ms), números contam (1400ms), trilho avança (1600ms), barras crescem (550ms), persiana sobe (340/240ms), confirmação de registo (spring 420ms), a Carol respira quando tem assunto (2600ms, três ciclos), conteúdo segue a pílula (280ms). **A minhoca** — pílula que estica a cobrir o trajeto e contrai com overshoot — é a assinatura: 420+130·distância ms na nav (teto 950), 320ms nos subnavs. Anima uma vez por sessão; `prefers-reduced-motion` leva tudo a 120ms ou zero. Fundo, vidro e avisos nunca mexem.

**Layout.** Um ecrã = moldura 390×844 com header fixo, scroll com padding-top 85 e padding-bottom 112 (168 com barra de ação), nav fixa. Persianas e popups montam-se dentro da moldura. Um único elemento organiza o ecrã: a etiqueta de secção.

**Imagens.** Nenhuma. A app não usa fotografia nem ilustração, exceto as fotos de refeição do atleta (miniaturas 62×62, raio 14) e — por fazer — o retrato da Carol.

## Iconografia

- **Lucide** (`lucide-react` no código; `unpkg.com/lucide@0.451.0` nos mocks). Traço 2px, 20px na nav, 15–18px em cartões e botões, 13–14px em etiquetas.
- O glifo do logo é `activity` em `--brand-cream` sobre `--grad-brand`. Não há logótipo gráfico no repositório; o wordmark é texto.
- Avatar da Carol: `message-circle` sobre `--grad-coach` — **provisório**, a substituir por retrato ilustrado com três expressões (CAROL.md §4).
- Sem emoji, sem caracteres unicode como ícones. Os pilares do dashboard antigo usavam emoji (🏃 🥗) — removidos.

## Componentes

| Grupo | Componente | Para |
|---|---|---|
| core | `Button` | ações, 8 tons × 4 variantes × 3 tamanhos |
| core | `IconButton` | voltar, fechar, setas — 44×44 |
| core | `Chip` | seletor (44px) ou badge (24px) |
| core | `Field` | campo de texto com label, hint, foco por contexto |
| core | `GlassCard` | o cartão de vidro, com brilho opcional |
| core | `SectionLabel` | etiqueta uppercase de secção |
| navigation | `ElasticPill` + `useElasticPill` | a minhoca |
| navigation | `BottomNav` | nav inferior com FAB da prova |
| navigation | `SubNav` | subnav do Dashboard e do Perfil |
| navigation | `ActionBar` | barra fixa de Guardar / Continuar |
| feedback | `Warning` | aviso coral (ou ok / danger) |
| feedback | `CoachNote`, `ChatBubble`, `CoachAvatar` | a voz e o rosto da Carol |
| feedback | `Sheet`, `Dialog` | persiana e popup |
| patterns | `ScreenFrame`, `AppHeader`, `ContextHeader` | a moldura de qualquer ecrã |
| patterns | `Orbit`, `OrbitLegend` | os três anéis de nutrição |
| patterns | `RaceTrail` | o trilho do macrociclo |

Intencionalmente ausentes: Toast (a app confirma com o check do registo), Tabs genéricas (o SubNav é o único padrão), Avatar genérico (só a Carol tem rosto), Tooltip (touch-first).

## Índice

- `styles.css` → `tokens/colors.css`, `typography.css`, `spacing.css`, `motion.css`
- `guidelines/*.card.html` — 15 cartões de fundamentos (Colors, Type, Spacing, Motion, Brand)
- `components/{core,navigation,feedback,patterns}/` — `.jsx` + `.d.ts` + `.prompt.md` + um `.card.html` por grupo
- `CAROL.md` — personalidade e comportamento do coach
- `SKILL.md` — para usar este sistema no Claude Code
- `IronCoach - App.dc.html` — os 36 ecrãs de referência
- `IronCoach - Auditoria UX-UI.dc.html` — os 12 achados e o que já foi corrigido
