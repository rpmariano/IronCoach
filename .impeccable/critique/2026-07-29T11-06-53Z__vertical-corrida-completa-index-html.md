---
target: Vertical Corrida completa
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-07-29T11-06-53Z
slug: vertical-corrida-completa-index-html
---
Method: dual-agent (A: ae39c92d4829d7ed9 · B: a99f499b35c8a8e11)

# Critique — Vertical Corrida completa (2ª execução, após correções P0-P2 anteriores)

## Design Health Score

| # | Heurística | Nota | Problema-chave |
|---|-----------|-------|-----------------|
| 1 | Visibilidade do estado do sistema | 3 | Toasts de validação não dizem qual campo está errado |
| 2 | Correspondência com o mundo real | 4 | Vocabulário fluente para corredores a sério |
| 3 | Controlo e liberdade do utilizador | 2 | Sem reset explícito ao sair de Nova Corrida — ver P0 |
| 4 | Consistência e padrões | 2 | Ordem de campos diferente entre Nova Corrida e Editar Corrida |
| 5 | Prevenção de erros | 1 | P0 confirmado: rascunho antigo (Competição, distância, splits) sobrevive a sair e voltar a entrar |
| 6 | Reconhecimento em vez de memorização | 4 | aria-labels consistentes, sugestão de nome, defaults sensatos |
| 7 | Flexibilidade e eficiência | 2 | Sem "repetir última corrida" para treinos estruturados repetidos |
| 8 | Design estético e minimalista | 2 | Três cartões sempre totalmente expandidos ao mesmo tempo |
| 9 | Recuperação de erros | 2 | Erro genérico sem destaque no campo nem foco automático |
| 10 | Ajuda e documentação | 2 | Sem centro de ajuda, mas microcopy funciona como orientação leve |

**Total: 24/40 → 60% → Aceitável.** (Nota: a 1ª execução tinha a heurística 10 marcada n/a, 23/36=64%; esta execução pontuou-a em 2, por isso os totais não são diretamente comparáveis número a número — ver secção de tendência.)

## Veredito de especificidade
Vocabulário genuinamente de corredor (Fartlek, Contínuo, RPE explicado, splits reais, Agenda de provas). O sistema de sugestão de nome é um toque específico do produto. Mas a identidade de cor mal sobrevive ao contacto com a superfície interativa: `--mod-corrida-to` só aparece no ícone de cabeçalho, no separador do sub-nav, nas pílulas Treino/Competição ativas, nas barras de gauge e no gráfico — todos os CTAs reais ("Nova Corrida", "Analisar Corrida", "Registar/Guardar", RPE selecionado, dia selecionado no calendário) usam sempre o coral partilhado `--accent`. Não é necessariamente um erro — pode ser intencional (accent = cor de ação universal, cor de módulo = só identidade) — mas fica por decidir.

## Confirmação das correções da ronda anterior
- ✅ Data/Esforço/Nome já só aparecem uma vez no ecrã Nova Corrida (confirmado na ordem do DOM).
- ✅ Pílula "Treino" ativa renderiza a fuchsia real (`#d946ef`), não o coral.
- ✅ Barra "Melhor pace de sempre" recalculada: 7,28:1 de contraste (antes 2,94:1) — corrigido com folga.
- ✅ Editar uma corrida sem nome mostra agora a nota "Sugestão automática — muda se quiseres" — mas essa nota é o ÚNICO sinal (10px, cinzento) que distingue um nome inventado de um confirmado; sem ícone, borda ou destaque adicional.
- ⚠️ Encontrado comentário desatualizado: `renderRunNameField` ainda diz "o mesmo campo aparece em dois cartões no ecrã de criação" — já não é verdade (Nome só aparece uma vez); o comentário confunde as duas telas diferentes (Nova Corrida vs. Editar) com dois cartões da mesma tela.

## Prioridades

**P0 — Rascunho de "Nova Corrida" sobrevive a sair e voltar a entrar, mesmo sem gravar**
Reproduzido ao vivo: preencher Competição + distância/duração + detalhes, sair para o Calendário sem submeter, voltar a abrir "Nova Corrida" (botão ou FAB) — tudo continua preenchido. Nem `goToCorridaRegistarForDate` nem `switchCorridaTab`/`fabCreateRun` repõem `runKind`, `runTrainingType`, `runDetailsDraft`, `runDistanceDraft`, `runDurationDraft`, `runSplitsDraft`, `runEffortDraft` ou `runPhotos`. Mesmo uma análise por IA bem-sucedida só limpa fotos/nome/esforço, não os campos do cartão manual. Um utilizador pode submeter sem querer a próxima corrida com a classificação/números de uma anterior.
Fix: aplicar o mesmo bloco de reset que já existe em `cancelEditRun()`/sucesso de `submitNewRun()` também a `goToCorridaRegistarForDate()`.

**P1 — Dois caminhos de entrada sempre totalmente expandidos + fila de 10 botões de RPE**
5 de 8 itens da checklist de carga cognitiva falham. O cartão de IA e o cartão manual estão sempre ambos completamente visíveis e interativos. Botões de RPE medem ~27×28px, abaixo do mínimo de toque recomendado (44×44), 10 num só grupo.
Fix: mantido em aberto — resolver exigiria um redesenho maior (disclosure progressivo); não incluído nesta ronda de correções rápidas.

**P1 — Mensagens de validação genéricas, sem destaque no campo**
`submitNewRun()` junta várias falhas possíveis numa só frase, sem realce nem foco automático no campo problemático — precisamente no estado mais denso (Intervalos), onde é mais difícil voltar a encontrar o erro.
Fix: mantido em aberto — mudança maior de padrão de validação em toda a app, fora do âmbito de uma correção pontual.

**P2 — Ordem dos campos diferente entre Nova Corrida e Editar Corrida**
Nova Corrida: Kind→Data→Esforço→Nome→(foto/manual). Editar: Kind→Data→Tipo→Distância→Duração→Esforço→Nome.
Fix: unificar a sequência.

**P2 — Identidade fuchsia confinada à decoração**
Mesma observação da ronda anterior, agora reformulada como pergunta em aberto em vez de bug.

## Achados adicionais (Assessment B)
- 0 achados do detetor mecânico dentro das funções da vertical Corrida.
- Comentário desatualizado em `renderRunNameField` (ver acima).
- Cor da barra do gráfico de distância continua *hardcoded* como `#d946ef` em JS em vez de ler `--mod-corrida-to` — risco de manutenção se a cor mudar outra vez, sem impacto visual atual.
- Sem erros de consola, sem pedidos de rede falhados.

## Personas
**Alex**: sem atalho para repetir um treino estruturado; o bug do rascunho (P0) trabalha contra a expectativa de "voltar dá uma folha limpa"; ordem de campos diferente entre ecrãs quebra a memória muscular.
**Riley**: reproduziu o P0 exatamente; sem verificação de "tens alterações por gravar" ao sair de Nova Corrida (o padrão já existe em Perfil via `isPerfilDirty()`, mas não foi aplicado aqui).
**Sam**: alvos de toque do RPE abaixo do mínimo recomendado; foco de teclado nos inputs é só uma mudança subtil de cor de borda, sem anel/sombra.

## O que já funciona bem
1. Sistema de sugestão de nome bem projetado — nunca sobrepõe o que o utilizador já escreveu, e sinaliza-se corretamente como sugestão.
2. Padrão "nav-elsewhere" (opacidade 60%) aplicado de forma consistente em toda a app.
3. Disciplina de nomes acessíveis — todos os controlos só-ícone têm aria-label.

## Perguntas para refletir
- Faz sentido dois caminhos completos e sempre visíveis para registar uma corrida, ou um formulário adaptativo (revela manual só quando não há foto) reduziria a sobrecarga?
- O fuchsia devia entrar nos CTAs/seleções da própria vertical, ou é aceitável ficar só como identidade decorativa (ícone, gráfico, gauge)?
- Um "repetir a última configuração estruturada" traria mais valor a corredores que repetem treinos do que qualquer polimento visual atual?
