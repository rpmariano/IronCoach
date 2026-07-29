---
target: App completa IronHealth
total_score: 24
max_score: 36
na_heuristics: 10
p0_count: 1
p1_count: 2
timestamp: 2026-07-29T13-15-39Z
slug: app-completa-ironhealth-index-html
---
Method: dual-agent (A: a5608b0c64695f09c · B: ab40ac7be9386b79c)

# Critique — App completa IronHealth (index.html)

## Design Health Score

| # | Heurística | Nota | Problema-chave |
|---|-----------|-------|-----------------|
| 1 | Visibilidade do estado do sistema | 3 | Sem indicação de progresso para além do spinner em análises de IA longas (10-20s) |
| 2 | Correspondência com o mundo real | 4 | pt-PT fluente, terminologia correta em todo o lado |
| 3 | Controlo e liberdade | 3 | Escape/Tab-trap em modais aplicado de forma uniforme; sem "desfazer" após finalizar um registo manual |
| 4 | Consistência e padrões | 2 | Validação inline, asterisco de obrigatório e cartão com cor de módulo só existem na Corrida |
| 5 | Prevenção de erros | 2 | Nutrição/Ginásio/Corpo sem guardrails por campo; zero persistência de rascunho (localStorage) em toda a app |
| 6 | Reconhecimento em vez de memorização | 3 | Nav sempre com rótulos, sugestões contextuais onde existem |
| 7 | Flexibilidade e eficiência | 2 | Sem atalhos/ações em lote — mas ver nota abaixo, isto é defensável dado o posicionamento do produto |
| 8 | Design estético e minimalista | 3 | Sistema de cor disciplinado e documentado; hack frágil de `!important` a mapear classes Tailwind escuras para o tema claro |
| 9 | Recuperação de erros | 2 | Fora da Corrida, toasts genéricos que nomeiam 2 campos em vez de apontar o específico |
| 10 | Ajuda e documentação | n/a | A IA-a-ler-a-foto substitui a necessidade de documentação — decisão de produto defensável, não uma lacuna |

**Total: 24/36 (heurística 10 n/a) → 67% → Aceitável, à beira de Bom.**

## Veredito de especificidade

Reconhecidamente IronHealth nas partes que já receberam atenção — mas de forma desigual. O sistema de cor é genuinamente autoral (comentários no código com contraste medido, decisões documentadas por data). Mas os ecrãs de criação de Nutrição/Ginásio/Corpo (`renderRegistar`, `renderGymRegistar`, `renderBodyUpload`) são quase intermutáveis entre si — mesmo cartão cinzento genérico, mesmo esqueleto foto+notas+"Analisar X" — enquanto a Corrida recebeu um tratamento à parte (cartões com cor do módulo, validação por campo, sugestão de nome). Lê-se como duas eras de design a coexistir no mesmo ficheiro.

**Achado mais grave**: **Corpo não tem via manual nenhuma** — é 100% dependente de foto, contradizendo o princípio do próprio produto ("a introdução manual é sempre a alternativa, nunca a única via", PRODUCT.md). Confirmado por pesquisa de texto completo no ficheiro — não existe equivalente a `manualBodyAssessment` em lado nenhum.

## Consistência entre módulos (achado central desta ronda)

Tabela de comparação dos 4 ecrãs de criação (Assessment B, via inspeção da árvore de acessibilidade):

| Vertical | Marcação de obrigatório | Via manual | Botão Cancelar visível |
|---|---|---|---|
| Nutrição | nenhuma (implícita) | ✅ "Adicionar Refeição Manualmente" | ❌ |
| Ginásio | nenhuma (implícita) | ✅ "Adicionar Treino Manualmente" | ❌ |
| Corpo | nenhuma (implícita) | ❌ **não existe** | ❌ |
| Corrida | ✅ asterisco vermelho explícito | ✅ "Registar Corrida Manualmente" | ✅ "Cancelar" |

A Corrida é a única vertical com: marcação visível de campo obrigatório, validação por campo com borda vermelha, e botão "Cancelar" explícito. As outras três não têm nenhum destes três padrões.

## Detetor mecânico (Assessment B) — todos os 4 achados, agora em âmbito
- `index.html:6678` — `gray-on-color`, botão "Concluir Refeição" (Nutrição)
- `index.html:5965` — `gray-on-color`, botão "Terminar sessão" (Ginásio) — mesmo padrão do de cima, replicado
- `index.html:224` — `dark-glow`, `.water-glass` (exceção já documentada no código)
- `index.html:230` — `layout-transition`, `.water-glass-fill` (exceção já documentada no código)

As 2 primeiras (gray-on-color em botões "Concluir/Terminar") são um achado real e novo, não triado antes — o mesmo componente replicado em 2 verticais com o mesmo problema de contraste.

## Cores de módulo — proximidade de matiz (Assessment B)
`--blue` (200°), `--green` (196°), `--mod-coach-from/to` (194°/189°) e `--mod-ginasio-to` (213°) ficam todos dentro de uma banda de 189°-226° — 4 tokens distintos a lerem-se como "a mesma família de azul/ciano". `--mod-corpo-to` (271°) e `--mod-corrida-to` (292°) ficam a 21° um do outro — colisão secundária, mais fraca. Isto é um achado novo desta ronda (não coberto pelas críticas anteriores, que só olharam para Corrida vs. Perfil/Coach).

## Prioridades

**P0 — Corpo não tem via de introdução manual**
O único caminho é 100% dependente da IA. Quebra a promessa central do próprio produto. Corrigir: formulário manual espelhando as outras verticais (reutilizar a lista `BODY_METRICS` já usada em Metas), atrás de um botão "Registar Manualmente".

**P1 — Validação inline só existe na Corrida**
Nutrição/Ginásio/Corpo continuam com toasts genéricos pós-submissão que nomeiam 2 campos em vez de apontar o específico. Fix: extrair o padrão `runFieldErrors`/`runFieldBorderClass`/`runFieldErrorMsg` da Corrida para um helper partilhado, aplicar aos 3 formulários manuais em falta.

**P1 — Zero persistência de rascunho em toda a app**
Nenhuma chamada a `localStorage` no ficheiro inteiro. Fotos e notas de um registo a meio perdem-se silenciosamente ao recarregar/interromper — precisamente o cenário mais comum para o público-alvo (a treinar, entre séries, a meio de uma corrida). Fix: guardar rascunho (fotos em data URL + notas + campos) por vertical, com prompt "Continuar rascunho?" ao reabrir.

**P2 — Identidade visual das telas de criação diverge por vertical**
Só a Corrida usa cartões com cor do módulo (`statCardBg`); as outras 3 usam cartão cinzento genérico. Fix: aplicar o mesmo tratamento às 3 verticais em falta.

**P2 — Botões "Concluir/Terminar" com contraste insuficiente**
2 achados do detetor, mesmo componente replicado (Nutrição + Ginásio).

## O que já funciona bem
1. Sistema de cor com contraste medido e documentado no próprio código — raro num projeto de um só ficheiro.
2. Padrão foto+IA-primeiro com manual sempre disponível, bem executado em Nutrição/Ginásio/Corrida (exceto Corpo).
3. A Corrida já é a fasquia de qualidade certa — o resto da app só precisa de ser puxado até ela.

## Personas
**Riley**: perde fotos e notas silenciosamente ao recarregar a meio de qualquer registo, em todas as verticais; sem forma de corrigir manualmente uma leitura errada da IA em Corpo.
**Casey**: exatamente o utilizador que a app mais interrompe (treino, corrida) é quem mais perde trabalho por falta de rascunho persistente.
**Alex**: sem ações em lote — aceitável dado o posicionamento (IA é o próprio atalho), mas "Reanalisar" (já existe na Corrida) falta em Corpo, onde seria mais útil (fotos de báscula são as mais difíceis de ler).

## Perguntas para refletir
- Se a Corrida é a fasquia pretendida, porque é que o Corpo — a vertical onde a IA mais erra (fotos de báscula) — ficou com a rede de segurança mais fraca?
- A perda de rascunho é invisível até acontecer — vale a pena investir nisso antes do próximo impulso de utilizadores ativos?
- Dado que o "Ajuda" foi deliberadamente substituído pela IA, faz mais sentido investir em recuperação (rascunhos, correção manual) do que em qualquer forma de documentação?

---

## Como chegar ao máximo da pontuação

### Mudança mínima por heurística abaixo de 4

| # | Heurística | Nota atual | Mudança mínima para chegar a 4 |
|---|-----------|---|---|
| 1 | Visibilidade do estado | 3 | Linha secundária "ainda a processar..." sob o spinner de IA quando a chamada passa de 5s |
| 3 | Controlo e liberdade | 3 | "Desfazer" (toast, 5-10s) depois de finalizar um registo manual, à semelhança do rigor já aplicado nos modais de eliminação |
| 4 | Consistência | 2 | Aplicar o padrão de validação + cartão com cor de módulo da Corrida às outras 3 verticais |
| 5 | Prevenção de erros | 2 | Mesmo fix de cima + autosave de rascunho em localStorage |
| 7 | Flexibilidade | 2 | Estruturalmente difícil de chegar a 4 sem contradizer o posicionamento do produto — ver nota abaixo. Um 3 defensável: estender "Reanalisar" (já existe na Corrida) a Corpo e Ginásio |
| 8 | Estética | 3 | Substituir o hack de `!important` que mapeia classes Tailwind escuras para o tema claro por tokens reais — risco de manutenção silencioso, não visível hoje |
| 9 | Recuperação de erros | 2 | Mesmo fix de validação por campo — mensagens específicas por campo em vez de "preenche X e Y" |

### As mudanças de maior alavancagem (por ordem de impacto estimado)

1. **Extrair o padrão de validação por campo da Corrida para um helper partilhado, aplicar às 3 verticais em falta.** Sobe simultaneamente as heurísticas 5, 9 e 4 — é a mesma causa-raiz por trás das 3 notas baixas. Maior impacto isolado.
2. **Persistência de rascunho (localStorage) nas 4 verticais de criação, com "Continuar rascunho?" ao reabrir.** Sobe a heurística 5 mais, e a 1 (confirmação de rascunho recuperado) — e neutraliza diretamente o cenário mais realista de perda de dados para este público (interrupção a meio do treino/corrida).
3. **Dar ao Corpo uma via manual + "Reanalisar".** Fecha o P0, torna verdadeira em todo o lado a promessa "manual é sempre alternativa" que hoje só é verdade em copy, não em código.
4. **Aplicar `statCardBg` (cartões com cor do módulo) às 3 verticais sem ela.** Menor impacto funcional, mas fecha a lacuna estética mais visível — mudança maioritariamente de template/CSS, retorno de polish desproporcional ao custo.

### O que é estruturalmente difícil de maximizar — e porque não faz mal

- **Heurística 10 (Ajuda e documentação)**: corretamente n/a. A IA a ler a foto É o sistema de ajuda deste produto — construir tooltips/documentação tradicional resolveria um problema que o produto já resolveu de outra forma.
- **Heurística 7 (Flexibilidade e eficiência)**: um 4 aqui (atalhos de teclado, personalização, ações em lote) não encaixa num PWA mobile de uma coluna cujo valor central é "aponta a câmara, deixa a IA estruturar". Perseguir isto contradiria o próprio princípio de mínima fricção do produto. Um 3 sólido (via a extensão do "Reanalisar") é o teto realista sem trair o briefing.

**Nota honesta**: um 40/40 "genuinamente excelente" em todas as 10 heurísticas simultaneamente não é realista nem desejável aqui — duas delas (7 e 10) têm um teto mais baixo por desenho, não por descuido. Um objetivo mais correto é **~34-36/36 aplicável** (excluindo a 10), o que corresponderia a "Bom" sólido a roçar "Excelente" em tudo o que realmente importa para este produto.
