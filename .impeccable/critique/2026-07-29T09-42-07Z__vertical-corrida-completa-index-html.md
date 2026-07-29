---
target: Vertical Corrida completa
total_score: 23
max_score: 36
na_heuristics: 10
p0_count: 1
p1_count: 2
timestamp: 2026-07-29T09-42-07Z
slug: vertical-corrida-completa-index-html
---
Method: dual-agent (A: a24098c36a580a300 · B: a97156c8ae5791615)

# Critique — Vertical Corrida completa (Dashboard/Calendário/Nova Corrida/Editar/Agenda, index.html)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibilidade do estado do sistema | 3 | Spinners e toasts bons; o cartão "Registo manual" com borda tracejada não explica o que significa |
| 2 | Correspondência com o mundo real | 4 | Terminologia e ordem fluentes para corredores a sério |
| 3 | Controlo e liberdade do utilizador | 3 | Cancelar/confirmação de eliminação sólidos; sem undo após "Guardar alterações" |
| 4 | Consistência e padrões | 2 | O fuchsia do módulo quase não aparece em elementos interativos — pílulas, RPE, CTAs usam sempre o coral genérico |
| 5 | Prevenção de erros | 2 | Ver P0 — nome fabricado em corridas antigas parece um valor real e guardável |
| 6 | Reconhecimento em vez de memorização | 2 | Data, Esforço e Nome duplicados literalmente 2x no mesmo ecrã, sem diferenciação textual |
| 7 | Flexibilidade e eficiência | 2 | Sem atalho "repetir última corrida" apesar do público repetir os mesmos treinos |
| 8 | Design estético e minimalista | 2 | Estado denso (Intervalos) empilha ~9 grupos de campos sem sub-secções |
| 9 | Recuperação de erros | 3 | Mensagens específicas em pt-PT, delete com rollback otimista |
| 10 | Ajuda e documentação | n/a | Copy orientada a tarefa substitui docs — adequado a este nível |

**Total: 23/36 (heurística 10 n/a) → 64% → Aceitável.** Melhorias significativas necessárias, concentradas nas heurísticas 4-8 ("o ecrã respeita o que já lhe disse / o que já vejo").

## Veredito de especificidade

Vocabulário genuinamente específico (RPE, Splits, Fartlek, Tempo oficial vs. pessoal, "Melhor pace aos 5/10/21km") — não é um genérico registo de fitness. A exceção: o fuchsia do módulo mal aparece como sinal de identidade (só ícone de cabeçalho, borda fina, um gauge, uma série de gráfico) — a especificidade vive quase toda na copy e taxonomia de campos, não na cor nem na composição.

## Deteção mecânica (Assessment B)
0 achados dentro das funções da vertical Corrida (runCard, renderCorridaDashboard/Calendario/Registar/Editar/Agenda, renderRunKindPills/TypeDetailFields/EffortField/NameField, tokens `--mod-corrida-*`). Os 4 achados do scan geral são todos de Ginásio/Nutrição/Água, fora de âmbito.

## Discrepância de contraste verificada
O comentário no código afirmava 6.48:1 para texto quase-preto (#09090b) sobre o fuchsia ativo (#d946ef); o cálculo independente da Assessment B (e a minha reverificação) dá **5,75:1** — ainda acima do mínimo AA de 4,5:1, mas o número no comentário estava incorreto (erro de aritmética na sessão anterior). A corrigir só o comentário, sem impacto funcional.

## Prioridades

**P0 — Editar uma corrida antiga sem nome fabrica um nome e deixa-o gravável sem aviso**
`openEditRun` define `runNameDraft = r.name || suggestedRunName()` mas também `runNameAutoSuggested = false` — o oposto do que deveria: por ficar `false`, a re-sugestão ao vivo desliga-se e o campo passa a parecer um valor real e deliberadamente escolhido. Testado ao vivo: abrir Editar numa corrida sem nome pré-encheu "Treino Contínuo matinal" (calculado pela hora atual de edição, não pela hora real da corrida) sem qualquer indicação de que é um palpite. Um utilizador que vá direto a "Guardar alterações" grava dados fabricados como se fossem seus — grave para um público que valoriza registos precisos.
Fix: manter `runNameAutoSuggested = true` quando `r.name` estiver vazio (comporta-se como a sugestão ao vivo da criação) e/ou marcar visualmente o campo como sugestão até o utilizador escrever.

**P1 — Data, Nível de esforço e Nome da corrida duplicados literalmente 2x no mesmo ecrã**
Confirmado na árvore de acessibilidade ao vivo: dois campos "Data da corrida", dois grupos "Nível de esforço" idênticos (10 botões cada), dois "Nome da corrida *" — indistinguíveis por nome acessível, só pelo cartão em que estão. Maior motor da falha de carga cognitiva (6 de 8 itens falhados no estado denso).
Fix: içar Data/Esforço/Nome para um bloco partilhado único acima de ambos os caminhos (foto/manual), já que ambos leem/escrevem o mesmo estado global — mudança de layout, não de modelo de dados.

**P1 — Estado denso (Intervalos/Subidas) empilha ~9 grupos de campos sem sub-secções**
Testado ao vivo com Intervalos + 2 splits: Tipo de treino, Aquecimento, Recuperação, splits, Distância/Duração totais, Esforço, Nome — tudo num só cartão plano, só separado por espaço em branco.
Fix: agrupar aquecimento+recuperação+splits numa sub-secção rotulada ("Estrutura da sessão"), separada dos totais/esforço/nome.

**P2 — Fuchsia quase ausente dos elementos interativos, apesar de ser a cor do módulo**
Pílulas Treino/Competição, botões RPE, CTAs — todos usam o coral genérico (`--accent`), não o fuchsia. O fuchsia aparece só em 2 pontos decorativos por ecrã. Ao mesmo tempo, fuchsia (#d946ef) e o roxo do Corpo (#a855f7) ficam a ~21° de distância de matiz — perceptíveis lado a lado mas próximos.
Fix: ou aprofundar o uso do fuchsia em elementos interativos da própria vertical (para a escolha "compensar"), ou aceitar que é só uma camada decorativa e não investir mais nela.

**P2 — Barra de progresso "Melhor pace de sempre" fica abaixo do mínimo WCAG de 3:1 para elementos gráficos**
Fuchsia (#d946ef) sobre o fundo claro do cartão (`--surf-800` #e9edf3) dá 2,94:1 — abaixo do 3:1 exigido pelo WCAG 1.4.11 para elementos gráficos informativos. O texto sobre fuchsia foi verificado a 4,5:1+, mas este uso em barra de progresso sobre fundo claro não.
Fix: escurecer o preenchimento nesta barra especificamente (ex.: usar `--mod-corrida-from` #86198f, que dá >3:1 contra o fundo claro).

## Carga cognitiva (ecrã Nova Corrida, estado denso)
6 de 8 itens falham → carga cognitiva alta (correção crítica). Únicos a passar: agrupamento ao nível dos 2 cartões, e memória de trabalho (tudo visível no próprio ecrã).

## Jornada emocional
- Pico real: toast de sucesso da análise por IA ("a IA leu os dados do print" + "Ver no Calendário") — fecha o ciclo bem.
- Atrito #1: aterrar em Nova Corrida e ver as mesmas 3 perguntas duas vezes antes de fazer seja o que for.
- Atrito #2: abrir Editar numa corrida antiga preenche silenciosamente um nome fabricado, sem indicação visual.
- Assimetria de recompensa: "Melhor pace de sempre" é um bom gancho, mas os buckets vazios ("Sem dados") não têm copy de incentivo junto dos preenchidos.

## O que já funciona bem
1. Copy do estado vazio da IA é específica e bem calibrada ("A IA lê a distância, duração, tipo de treino e splits automaticamente").
2. `runCard` degrada bem para corridas antigas sem nome (usa a data como título, sem "null" a aparecer).
3. Fluxo de eliminação (confirmação + irreversibilidade + rollback otimista) é um padrão exemplar, aplicado de forma consistente.

## Red flags de persona
**Alex (utilizador experiente/impaciente)**: sem atalho "repetir última corrida" apesar de o público repetir treinos; 20 botões de RPE no total (2x10) para um campo opcional; caminho manual (usado precisamente quando está com pressa, sem foto) é o mais lento e repetitivo do ecrã.
**Sam (dependente de acessibilidade)**: dois campos com o mesmo nome acessível "Data da corrida" e dois "Nome da corrida *" no mesmo ecrã — sem forma de os distinguir só pelo nome anunciado; contraste da barra de progresso (2,94:1) afeta utilizadores com baixa visão.
**Riley (testador de stress)**: reproduziu exatamente o P0 (nome fabricado em corrida antiga); a sugestão de nome depende da hora de edição, não da hora real da corrida — inconsistência entre o que o campo implica (facto sobre a corrida) e o que codifica (facto sobre agora).

## Observações menores
- Botões "Nova Corrida" (Calendário) e "Nova Prova" (Agenda) são visualmente quase idênticos (mesma pílula coral), só o ícone muda.
- A fila de RPE "(opcional)" tem o mesmo peso visual do campo obrigatório "Nome" logo abaixo — só o asterisco vermelho distingue.
- `runKindLabel` devolve `null` para corridas antigas gravadas como 'simples' (categoria removida) — sem badge, ao lado de cartões mais recentes com badge.
- Input de upload de foto e o botão de expandir/colapsar o cartão de corrida não têm nome acessível.
- `renderCorridaEditar` reutiliza ids genéricos (`runDate`/`runDistance`/`runDuration`) enquanto `renderCorridaRegistar` usa sufixos (`runDateAi`/`runDateManual`) — inconsistência de convenção entre funções próximas (sem colisão real, os ecrãs são mutuamente exclusivos).

## Perguntas para refletir
- Se o cartão de IA e o manual já partilham 3 campos com o mesmo estado global, faz sentido continuar a apresentá-los como dois formulários separados em vez de um bloco partilhado + duas ações de submissão alternativas?
- Dado o público ser corredores que repetem treinos, um atalho "repetir a última configuração" traria mais retenção do que qualquer polimento visual atual?
- O fuchsia paga um custo mensurável de contraste (barra de progresso) e uma proximidade real com o roxo do Corpo, para aparecer em só 2 pontos decorativos por ecrã — vale a pena aprofundar o seu uso, ou é mais honesto assumi-lo como camada puramente decorativa?
