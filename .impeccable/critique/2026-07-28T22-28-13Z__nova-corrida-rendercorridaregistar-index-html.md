---
p0: 0
p1: 3
p2: 1
p3: 1
scope: scoped-screen
timestamp: 2026-07-28T22-28-13Z
slug: nova-corrida-rendercorridaregistar-index-html
---
# Critique — Nova Corrida (renderCorridaRegistar, index.html)

Scoped critique per pedido do utilizador: posicionamento de campos, hierarquia de informação, ordem de introdução de dados, e necessidade de separação visual manual/upload.

## Veredito de especificidade
Ambas as avaliações (A: revisão de design isolada; B: detector mecânico + evidência de browser/DOM) convergem de forma independente no mesmo diagnóstico central: a ordem do ecrã inverte o que o utilizador tem em mãos (dados/foto de uma corrida) com classificação prévia (tipo de treino) que a maioria das corridas não precisa. Isto corrobora diretamente a perceção do utilizador ("parece confuso").

## Detector mecânico (Assessment B)
0 achados dentro de `renderRunKindFields` (3557–3641) ou `renderCorridaRegistar` (3845–3923). Os 4 achados do detector são todos fora de âmbito (CSS global preexistente / outros ecrãs).

## Prioridades

**P1 — Ambiguidade: campos manuais parecem obrigatórios mas são opcionais em treinos por repetição**
`submitNewRun()` dispensa Distância/Duração quando o tipo é Intervalos/Subidas, mas o formulário não o comunica — os campos continuam com aspeto de obrigatórios.
Fix: em tipos de repetição, mudar para "Distância total (opcional)" / "Duração total (opcional)" + microcópia explicativa.

**P1 — Ordem de introdução invertida: classificação antes da captura**
Pills (Treino/Competição) + dropdown de tipo + campos condicionais aparecem ANTES da zona de foto e dos campos manuais — mesmo sendo o próprio código a assumir que a maioria das corridas é "Contínuo" (default). Verificado ao vivo: com Intervalos + 4 splits, a zona de foto desce ~184px e o botão final fica a ~1125px de altura de página.
Fix: reordenar para foto → data → Analisar/manual → e mover tipo/detalhes de treino para uma secção "Detalhes do treino (opcional)" colapsável, entre a data e a zona de finalização.

**P1 — Padrão placeholder-como-label perde identidade do campo após preenchimento**
Aquecimento, Recuperação, e cada split (distância/tempo) usam apenas `placeholder`, sem `<label>` visível. Depois de preenchido, o valor fica sem contexto (ex: "10" sem indicar se é minutos de aquecimento ou segundos de recuperação).
Fix: adicionar labels persistentes pequenas acima/ao lado de cada campo, como já acontece em "Tipo de treino"/"Disciplina".

**P2 — Divisor "— ou introduz manualmente —" é enganador**
Implica um ramo alternativo completo, mas tipo/treino/data são partilhados por ambos os caminhos (AI e manual) — só Distância/Duração/Notas são exclusivos do manual. `analyzeRun()` e `submitNewRun()` leem os mesmos campos partilhados.
Fix: reformular o texto ("Sem foto? Introduz os totais abaixo") ou separar estruturalmente secção partilhada de secção exclusiva.

**P3 — Dropdown de tipo de treino com 9 opções sem agrupamento**
Excede o limite de ~4 itens por ponto de decisão recomendado para baixa carga cognitiva; nenhuma pista visual assinala que "Contínuo" é o caso comum.
Fix: `<optgroup>` (Corrida solta / Estruturado / Trilho) ou texto de apoio.

## Carga cognitiva (checklist de 8 itens)
6 de 8 falham → carga cognitiva alta (correção crítica recomendada pela própria régua do checklist). Único ponto realmente bem resolvido: divulgação progressiva dos campos de treino por repetição (aquecimento/recuperação/splits só aparecem quando o tipo exige).

## O que já funciona bem
- Divulgação progressiva dos campos de splits/aquecimento/recuperação está corretamente implementada — só aparece quando necessário.
- Default inteligente: `selectRunKind` volta sempre a "Contínuo", poupando uma decisão na maioria dos casos — a intenção é boa, só a posição no ecrã a desvaloriza.

## Separação manual vs. upload — recomendação
Não separar em tabs/cartões distintos — a maior parte dos campos (tipo, detalhes de treino, data) é genuinamente partilhada pelos dois caminhos, e separar forçaria duplicação ou uma escolha prematura. Em vez disso: reordenar (foto→data→ações) e isolar a classificação numa secção "Detalhes do treino (opcional)" que sirva ambos os caminhos por igual, tornando claro o que é partilhado, o que é só-IA e o que é só-manual.

## Achados adicionais de Assessment B (evidência estrutural)
- Placeholder duplicado "Distância (km)" aparece em 3 campos distintos (split 1, split 2, total manual) sem rótulo a distinguir.
- Campo de data usa `<div>` como legenda em vez de `<label for>` (tem `aria-label`, mas a legenda visível não está associada).
- Zona de foto e botão "Registar Corrida Manualmente" partilham o mesmo estilo tracejado (`border-dashed border-neutral-700`) apesar de ações não relacionadas.
- Sem separação estrutural (borda/fundo/cabeçalho) entre a zona de IA e a zona manual — só a legenda de 10px as distingue.

Sem erros de consola nem pedidos de rede falhados.
