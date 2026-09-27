# Spec — Competições por jornadas (o Troféu de Cascais como 1.º caso)

**Estado:** aprovado pelo dono do produto a 2026-09-26; por implementar.
Consolida as recomendações v3, v4.1 e "jornadas" (rascunhos de trabalho,
fora do repositório). Onde divergiam, valem as decisões de §2. Complementa
`PRD.md` §3.4 (Agenda de provas), `plano-vinculado-a-prova.md` (uma
principal por plano) e `prova-concluida.md` (o hub da prova). Os factos do
Troféu vêm do documento orientador de 2023/24 e ficam **prováveis** até sair
o regulamento da 34.ª.

## 1. Objetivo e âmbito

Um atleta que corre um circuito local de jornadas (11 provas curtas de
dezembro a junho, no caso de Cascais) tem de ter as jornadas no calendário,
no plano e na conversa com a Carol **sem** que elas atropelem as provas
principais dele — e quem não corre o circuito não pode notar diferença
nenhuma.

- **Genérico por construção.** Competição → edição → jornada. O código não
  sabe o que é Cascais: as regras de cada edição são colunas, o comportamento
  sai de funções puras em `@formulas` (UI e Carol usam as mesmas). Uma 2.ª
  competição entra por dados; o único código novo seria o leitor do site
  dela, se o tiver.
- **1.º caso:** 34.º Troféu de Atletismo de Cascais (2026/27). 1.ª jornada
  prevista entre 6 e 13/12/2026; inscrição em cada prova fecha na quarta
  anterior às 24h.
- **Fora de âmbito:** equipa entre contas, gestor de competição delegado,
  CRUD completo das regras (2027/28), mais de uma inscrição ativa por atleta
  (o modelo e os hooks já recebem listas; levantar o limite é uma migração).

## 2. Decisões

Aprovadas pelo dono do produto; o detalhe está na secção indicada.

1. Modelo genérico competição → edição → jornada; regras de cada edição em
   dados (§3.1).
2. Catálogo gerido só por admins, separador "Competições" (§6). `is_admin` já
   está protegido pelo trigger `guard_profile_privilege_columns`
   (`20260926072714_profiles_privilege_guard.sql`).
3. O Troféu vive no separador **Provas** — não em Metas nem num separador da
   barra — e sem inscrição nada muda na app nem na Carol (§4.1, §5).
4. Inscrição por edição; o clube fica na inscrição, não no perfil; nunca se
   assume o género (§4.2).
5. Só há `race_events` para "Vou" com data confirmada; as principais de fora
   mandam sempre (§3.5, §4.3, §5).
6. Tempo da jornada vazio até o atleta o marcar; a previsão não se grava; a
   intenção vive na participação (§3.4, §4.4).
7. Classificação oficial lida por um job (há autorização da Câmara), só com
   as linhas confirmadas dos inscritos e os totais por clube (§7).
8. Push do Troféu desligados por omissão, preferências na inscrição, máximo 3
   por jornada (§8).
9. Cada jornada corrida é uma prova como as outras; resumo da época ao fechar
   a edição; dorsal e correspondência apagam-se nesse momento (§4.6).
10. Fases 0 → 5 com as datas de §10.

## 3. Modelo de dados

Tudo numa migração **M1** (Fase 1), aplicada à mão com autorização, depois de
ensaiada numa transação revertida. A Fase 0 não tem migrações. A M1 está em
produção desde 2026-09-26 15:28 UTC
(`supabase/migrations/20260926152856_cup_competitions.sql`; ensaio 99/99).

### 3.1 Catálogo (leitura `authenticated using (true)`, escrita `is_admin()`)

| Tabela | Colunas principais |
|---|---|
| `cup_competitions` | `slug`, `name`, `short_name`, `round_label` ("Jornada"/"Etapa") |
| `cup_race_series` | `competition_id`, `slug`, `name` — **identificador estável** de uma prova entre edições ("Corrida CCD"), para comparar anos |
| `cup_editions` | `competition_id`, `edition_no`, `season_label`, `status` (`por_anunciar`/`aberta`/`encerrada`), `closed_at`, `regulation_url`, `standings_url`, `entry_url`; regras abaixo |
| `cup_rounds` | `edition_id`, `series_id`, `round_no`, `name`, `date` (anulável), `date_status` (`provavel`/`confirmada`/`adiada`/`cancelada`), `location`, `terrain`, `entry_deadline_at` (preenchido pela regra, editável), `results_url`, `team_results_url`, `source_ref jsonb` |
| `cup_round_courses` | `round_id`, `code`, `distance_m`, `distance_status` (`provisoria`/`oficial`), `start_time` |
| `cup_round_course_overrides` | `(round_id, category_code, course_code)` — exceções por escalão |
| `cup_categories` | `edition_id`, `code`, `gender`, `min_age`, `max_age`, `course_code` |
| `cup_teams` | `edition_id`, `name`, `short_name`, `kind` (`clube`/`individual`), `eligible_final`; `unique(edition_id, id)` |
| `cup_team_aliases` | nomes vistos na fonte oficial → equipa (alerta "clube novo"); na M2, **só o admin lê** (o único leitor é o backoffice) |

**Regras em `cup_editions`** (`null` = não sabemos, e a Carol cala esse
argumento): `points_mode`, `points_table jsonb`, `points_basis`
(`escalao`/`geral`), `team_scoring` (`soma_todos`/`melhores_n`),
`team_min_athletes`, `team_counting_n`, `counting_rule`
(`pct_minima`/`melhores_n`/`todas`), `counting_value`, `entry_mode`
(`por_jornada`/`epoca`), `bib_scope` (`epoca`/`jornada`), `age_rule`
(`data_prova`/`fim_ano_civil`/`fim_ano_epoca` — o último, da M2, é 31/12 do
2.º ano da época, tirado do `season_label`; com ele, o CHECK só aceita
épocas legíveis: "2026/27", "2026/2027" ou "2027", com o 2.º ano = 1.º + 1.
Com inscrições ativas, a M2 recusa mudar `age_rule` ou `season_label`: o
escalão e o percurso das provas "Vou" já criadas ficavam errados),
`results_source` (`nenhuma`/`manual`/`adaptador`), `results_adapter`,
`area_lat`, `area_lon`, `area_radius_km`, e os interruptores sem deploy
`sync_mode` (`desligado`/`observar`/`publicar`) e `notifications_enabled`.

Cascais 34.ª (regulamento geral da 33.ª, deslocado um ano): tabela
15-13-11-10-9-8-7-6-5-4, 11.º–20.º 3, 21.º–30.º 2, 31.º em diante 1, base
`escalao`; `soma_todos` com mínimo de 4; `pct_minima` 70; `por_jornada`;
dorsal `epoca` (o mesmo toda a época); escalões **por ano de nascimento** com
referência ao 2.º ano da época (`fim_ano_epoca`: 32 escalões de Sub-12 a
M80, seed da M2 — nenhuma das regras da M1 acerta numa jornada de
dezembro); área Cascais, 25 km; adaptador `trofeu_cascais`. Os testes levam
uma 2.ª competição fictícia com valores diferentes em todas as colunas.

### 3.2 Por atleta (RLS "own rows", **sem** "admin read all")

- **`cup_enrollments`**: `user_id`, `edition_id`, `team_id` (FK composta com a
  edição) ou `team_other`, `is_federated`, `season_goal`
  (`participar`/`premio`/`pontos_clube`/`marcas`), `bib` (texto, anulável),
  `status` (`ativa`/`saiu`/`concluida`), `joined_at`, `left_at`, e as
  preferências de aviso (§8), todas `default false`. `unique(user_id,
  edition_id)`; índice único parcial `(user_id) where status='ativa'`. CHECK:
  federado não é Individual. **Sem índice único de dorsal.**
- **`cup_enrollment_teams`**: histórico de clubes (`team_id`, `from_date`).
- **`cup_edition_dismissals`**: `(user_id, edition_id)` — o "Não me interessa".
- **`cup_participations`**: `(enrollment_id, round_id)` único, `decision`
  (`vou`/`nao_vou`/`nao_sei`/`null` = por decidir), `decision_source`
  (`atleta`/`omissao`/`colisao`), `decided_at`, `intent`
  (`atacar`/`controlar`/`trote`/`saltar`), `intent_source`
  (`sugerida`/`atleta`), `entry_done_at` ("Já me inscrevi no site").
- **`cup_results`**: a linha oficial **do próprio** — `round_id`, `position`,
  `category_code`, `category_position`, `points`, `official_time_s`,
  `match_status` (`proposta`/`confirmada`/`rejeitada`/`perdida`),
  `match_hash`; na M2, `bib_key` (hash edição:dorsal), `standings_key` (a
  chave da linha na geral, hash), `standings_alt_key` (a chave alternativa:
  1.º e último nome, escalão e clube, hash) e `points_source` (`calculado` =
  provisórios, da página da prova; `oficial` = da geral). Fica enquanto
  houver conta; o atleta pode apagá-la. A recusa ("não sou eu") vive em
  `cup_enrollments.match_refused_key` (a `bib_key` recusada).
- **`cup_standings`** (M2): a linha **do próprio** na classificação geral
  oficial (escalão, lugar, total, provas com pontos, quando foi lida) e o
  `match_status`: `confirmada` (pela chave exata, ou a alternativa que ele
  confirmou) ou `proposta` (pela alternativa, por confirmar). A recusa da
  geral ("não sou eu") vive em `cup_enrollments.standings_refused_keys`.
- **`cup_season_summaries`**: resumo final por inscrição (presenças, pontos,
  lugar no escalão, clube, fonte `app`/`oficial`), gravado ao fechar a edição.

### 3.3 Partilhado e de serviço

- **`cup_round_publication`**: `results_ready_at`, `source`
  (`manual`/`job`), `stable_at`, hash das colunas não pessoais. Leitura
  `authenticated`. Fica fora das tabelas auditadas para o job não sujar a
  auditoria.
- **`cup_team_results`**: totais por clube e jornada (dado público do
  organizador). Na M2, `points_source`: a coletiva por jornada é uma conta
  da app sobre a geral oficial (`calculado`), gravada só para clubes com
  inscritos — por isso a M2 fecha a leitura: o admin, e quem tem inscrição
  **ativa** nessa edição com esse `team_id` (a coletiva do SEU clube, a única
  que o cliente lê). Aberta a todos, a lista de clubes com linhas dizia que
  clubes têm atletas da app.
- **`cup_sync_state`** (M2): o estado do job por edição e página (hash,
  pronta/estável e o modo em que ficou estável, códigos, contagens por
  escalão, o trinco da volta). **Só agregados**; só o admin lê.
- **`cup_audit_log`**: triggers `AFTER INSERT/UPDATE/DELETE` em
  `cup_editions`, `cup_rounds`, `cup_round_courses`, `cup_teams`; guarda
  `auth.uid()` e `current_user` (o SQL direto também fica registado).

### 3.4 `race_events`

- Ganha `cup_round_id` (`on delete set null`), `unique(user_id, cup_round_id)`.
  Nasce com `race_priority = 'b'` **explícito** (a omissão da BD é `'a'`); o
  corta-mato grava-se `'estrada'` (`'trail'` é tratado como ultra no taper).
- **Objetivo vazio só em jornadas:** os NOT NULL de `target_time`,
  `target_time_seconds` e `target_pace_seconds_per_km` passam a um CHECK
  `(<os três preenchidos>) or cup_round_id is not null`. O `experience_level`
  fica vazio (vale o do Perfil), como já acontece hoje.
- **Não ganha** `series_intent` nem `skipped_at`: a intenção vive na
  participação e "Não fui" apaga a prova.
- Um trigger recusa, vindo do cliente (`pg_trigger_depth() = 1`), mudanças de
  `date`, `distance_km`, `location` ou `cup_round_id` numa jornada ligada —
  são dados do organizador.

### 3.5 Sincronização (triggers `security definer`, EXECUTE revogado)

| Evento | Efeito |
|---|---|
| Participação passa a `vou` e a jornada está `confirmada` | Cria (ou liga, se já houver prova nesse dia) a `race_events` `b`, com distância e nome do percurso do escalão |
| Participação passa a `nao_vou`/`nao_fui`, ou jornada cancelada/adiada sem data | Apaga a `race_events` não concluída; o trigger do plano marca `race_lost_at` |
| `race_events` de jornada apagada pelo cliente | Grava `nao_vou` (senão a sincronização recriava-a) |
| Data da jornada muda | Upsert nas provas "Vou"; se a nova data colide com uma principal, a participação volta a `null` (`colisao`) e a prova sai |
| Mudança de escalão (aniversário, dados do perfil) | Recalcula percurso, hora e distância das jornadas futuras |
| `provavel` | Nunca gera `race_events` — data errada daria taper, véspera e push no dia errado |

Os triggers levam `WHEN` nas colunas que interessam.

### 3.6 RPCs

`enroll_cup`, `update_enrollment`, `leave_cup` (uma transação: `saiu`, apaga
as jornadas futuras e por registar sem corrida; as corridas ficam como provas
normais), `set_participation`, `preview_round_change(round_id, patch)` (só
lê, responde em bandas, `is_admin()` lá dentro), `unmatched_team_names`
(textos normalizados, sem `user_id` nem contagens), `close_edition` (na M2,
recusa sem jornadas, com a última sem data ou antes de ela passar), e na M2
`confirm_cup_result(round_id)` ("Sim, sou eu"; confirma com ela as outras
propostas do mesmo dorsal **e da mesma linha** — a mesma `standings_key`) e
`reject_cup_result(round_id)` ("Não sou eu"), e as da geral pela chave
alternativa, `confirm_cup_standing(enrollment_id)` e
`reject_cup_standing(enrollment_id)` (só a linha `proposta` da inscrição
ativa dele).
Todas `security definer` com EXECUTE a `authenticated` e a guarda dentro —
nunca EXECUTE revogado numa função usada por políticas.

## 4. Fluxos do atleta

### 4.1 Descoberta em Provas

- Cartão no **fim** do ecrã de Provas, tom `--race`. O convite só com a
  edição `aberta` e (`profiles.training_lat/lon` a ≤ `area_radius_km` da área,
  por haversine no cliente, **ou** sem local de treino) e sem dispensa para
  esta edição; quem está inscrito vê-o com a edição `aberta` ou `por_anunciar`
  (o admin pode voltar a escondê-la — §6.1), nunca `encerrada`.
- Não inscrito: "34.º Troféu de Atletismo de Cascais · 11 provas de dezembro a
  junho" + [Inscrever-me] + "Não me interessa".
- Inscrito: a próxima jornada (data, percurso, decisão) e toca para o ecrã do
  Troféu. Nada entra na barra, no FAB, no "Marcar prova" nem no onboarding.

### 4.2 Inscrição (ecrã inteiro, fora do rascunho do Perfil)

1. Edição e o que ela dá, conforme o tipo (`classifyEnrollment` em
   `@formulas`: `clube_elegivel`, `individual_elegivel`, `individual_aberto`,
   `clube_aberto`, `clube_por_confirmar`).
2. Federado? Se sim, clube da lista ou "não está na lista", nunca Individual.
3. Clube.
4. Objetivo da época (omissão: só participar).
5. Dorsal, opcional ("ainda não sei").
6. Género e data de nascimento, se faltarem no perfil (sem eles não há
   inscrição).
7. Com `entry_mode = 'por_jornada'`: "quem te inscreve em cada prova?" (eu /
   o meu clube / não sei).
8. O que a app guarda e quem o vê: nenhum ecrã, RPC ou log novo mostra a
   inscrição; nada vai para outros atletas nem para o organizador. Diz-se
   também o que o admin da BD já consegue inferir (`race_events`,
   `profiles`, `app_logs` e `privacy_consents` têm "admin read all").

Sem calendário publicado: "Avisa-me quando sair" liga só esse aviso.
Mudar de clube a meio é permitido (histórico); sair é `leave_cup`; voltar na
mesma época reativa a mesma linha.

### 4.3 Jornadas

Logo a seguir à inscrição (e sempre que sai o calendário) o atleta vê a
lista de jornadas pré-marcadas e **só "Confirmar" grava**:

```
AS TUAS JORNADAS        70%: 8 de 11
06 dez  Padroeira ~7 km (provável)   ●Vou ○Não ○?
24 jan  CCD 7,4 km, 9h30             ●Vou ○Não ○?
21 fev  Monte Real                   ○Vou ●Não ○?
        ⚠ dia da tua Meia (principal)
[Confirmar: 10 vou, 1 não vou]    Decidir depois
```

- "Vou" com data `provavel` espera; vira prova quando a data é confirmada.
- Jornada nova ou colisão nova fica "por decidir" na linha do Troféu, sem push.
- Promover a principal: ação no ecrã do Troféu com o custo dito antes ("taper
  de 10–21 dias; as jornadas da janela passam a controlar ou saltar") e o
  guião do `race_conflict` invertido quando a outra é uma principal de fora.

**Ecrã do Troféu:** cabeçalho (clube, escalão, percurso, [Regulamento ↗],
[Gerir inscrição] — clube, dorsal, sair); contador face à `counting_rule` só
com objetivo prémio ("feitas 2 · ainda podes faltar a 2"); calendário com
estado sempre em texto e ícone (✓ ▸ ✕ ⋯, nunca só cor), `aria-label` por
linha, alvos de 44/56 px; classificação (a linha do próprio, a coletiva do
clube, links oficiais), sem nomes de terceiros.

**Lista de Provas (bloco fixo por edição):** "Próximas" mostra o cabeçalho
da edição, a próxima jornada e "+N no calendário ›"; "Por registar" até 2
jornadas com [Registar] e [Não fui], mais "+N ›"; "Concluídas" com chip Jn
dentro do limite existente. "Para onde vou" tira as jornadas futuras do carrossel (a do
próprio dia fica, com o "Registar a prova") e
mostra uma linha "Troféu · próxima jornada" (conteúdo do cartão se não houver
outras provas). Sem inscrição, `groupRaces` dá a saída de hoje.

### 4.4 Semana da jornada

- Hub e cartão diário: "Domingo, CCD, 7,4 km às 9h30. Pelas contas:
  controlar, 36:40." O tempo é a **previsão** (VDOT para a distância do
  percurso), com ícone de cálculo, não gravada; o atleta aceita a intenção,
  muda-a, marca um objetivo de tempo ou passa a "Não vou".
- **Prazo de inscrição:** com `entry_mode = 'por_jornada'`, "Vou" e sem
  `entry_done_at`, o cartão diário da semana mostra "A inscrição fecha quarta
  às 24h" com [Inscrever-me ↗] e [Já me inscrevi]. Aparece na app sempre; o
  push só com o aviso ligado (§8). Não aparece a quem respondeu "o meu clube".
- Mudanças de data aparecem na linha da jornada ("mudou de 17 para 24 jan").

### 4.5 Depois da prova

- `RunRegistration` liga a corrida à `race_events` da jornada em vez de criar
  uma prova `a` duplicada.
- O hub da prova ganha o bloco Troféu: migalha "J3 de 11", tempo oficial,
  lugar no escalão, pontos, link oficial. Sem linha oficial: o lugar que o
  próprio registou (diploma, `bib_number`/`age_group_position` em `run.js`).
- [Não fui] numa jornada passada grava `nao_fui` e apaga a prova.

### 4.6 Histórico

- Cada jornada corrida é uma prova normal: badges, Palmarés, "A Superação"
  (que só conta objetivos **gravados** — por isso a previsão não se grava).
- Ecrã da época: presenças, pontos, evolução por `cup_race_series` face às
  edições anteriores (VDOT entre jornadas comparáveis: estrada, distância
  ±2%; corta-mato e milha ficam fora do progresso).
- Ao fechar a edição grava-se `cup_season_summaries`; atualiza-se quando sair
  a classificação final oficial.
- "Épocas anteriores" em modo consulta.
- Retenção: os resultados do próprio ficam enquanto houver conta
  (apagáveis); `bib`, `match_hash` e os dados de correspondência (`bib_key`,
  `standings_key`, `standings_alt_key`, `match_refused_key`,
  `standings_refused_keys`, `key_hash` da geral, as linhas nunca confirmadas
  e a geral por confirmar) apagam-se no `close_edition`; o resumo só usa a
  geral confirmada; de terceiros nunca se guardou nada.

## 5. A Carol

**Sem inscrição:** zero linhas, zero ferramentas, zero candidatos proativos
(testes de invariância byte a byte em `buildSystemInstruction`). **Saiu há
≤30 dias:** uma linha "saiu do Troféu a DD, decisão dele; não o empurres a
voltar".

**Inscrito:** bloco TROFÉU na cauda do prompt (nunca no prefixo estável),
via `fetchSeriesBlock` (null num erro das leituras de que os papéis dependem;
resultados, épocas anteriores e notas ficam vazios), no chat, no cartão
diário e no `analyze-run`. Traz o tipo de inscrição, o objetivo da época,
as próximas jornadas com decisão e intenção, o contador (só com prémio),
a faixa de pontos e, só com inscrição ativa, uma linha por época anterior.
`SERIES_TOOLS` só entram no `buildTools` com inscrição:
`set_cup_participation` (decisão e papel de uma jornada; "saltar" escolhido
por ele grava também "não vai", e a prova sai do calendário) e
`set_cup_season_goal` (a resposta à pergunta do prémio — o "Gerir
inscrição" não muda o objetivo). Correm com o JWT do próprio pedido, pelas
RPCs da M1.

**Arbitragem com as principais** (`seriesArbitration.ts` em `@formulas`, só
com datas confirmadas):

- As principais de fora mandam sempre; as guardas do servidor já o impõem
  (plano `b` sobre plano `a` recusado, `race_conflict` só olha `a`).
- O dia de uma principal é `saltar`; os 2 dias antes e os 4 depois também.
  Antes (P−7, P−14 conforme a distância) `controlar`; depois `trote`, e numa
  maratona o iniciante e o básico saltam a seguinte. A tabela completa vive
  nos golden tests, com as personas.
- Pares de jornadas a 6–7 dias: iniciante e básico atacam só uma.
- Iniciante e básico: controlar em progressão, atacar ~1 em 2–3. Médio e
  avançado: atacar as que ficam fora das janelas.
- O taper de uma jornada lê a intenção (3/2 dias atacada/controlada) —
  `getTaperDays` muda na Fase 2; ficam sempre 2 dias fáceis antes de qualquer
  prova.
- A intenção proposta é sugestão; o atleta decide e a Carol explica uma vez e
  aceita sem julgar.

**Pontos (`pointsBand`):** só com `points_mode` e `points_basis` conhecidos;
senão a faixa é `desconhecida` e a Carol não fala de pontos. "Comparecer vale
mais do que atacar" só com `team_scoring = 'soma_todos'` e `clube_elegivel`.
A posição de referência é a mediana das últimas 3 do próprio; nunca dados de
terceiros.

**Perguntas, uma vez por edição:** o prémio (a quem é elegível e disse "não
sei"), o treino com o clube (aos tipos `clube_*`, grava em `coach_notes`
'disponibilidade', fora da cápsula), e a confirmação das principais `a` que
caem na época (a omissão da BD é `a`).

**Momentos:** mapa da época no Início (canal `coachIntent`, sem push) ao
inscrever ou quando sai o calendário — com plano aceite, o ajuste propõe-se
aí, numa só conversa, e silencia-se o `prova_sem_item` das jornadas; o
balanço de cada jornada fecha com o papel da seguinte; sem calendário, a
Carol não inventa datas nem calcula papéis.

**Nunca:** "a equipa precisa de ti"; o limiar de atletas da coletiva;
terceiros ou a classificação de outros; o dorsal (nem na Carol, nem em logs,
nem em notificações); pontos contra um alarme G1–G5; discutir um "salto" por
dor ou doença; a classificação de cabeça — o papel responde-se sempre
calculado.

## 6. Backoffice ("Competições", só `is_admin`)

`bug_reviewer` não vê o separador.

1. **Edições:** estado, "Publicar edição" e "Voltar a 'por anunciar'" (alternam
   quantas vezes for preciso; esconder fecha as inscrições novas e o convite, e
   quem já está inscrito mantém tudo), **"Fechar edição"** (`close_edition`:
   `encerrada`, inscrições a `concluida`, grava os resumos — com a geral
   oficial quando há —, apaga dorsais e dados de correspondência). Recusa,
   no cliente e no servidor, sem jornadas ou antes de passar a última
   (decisão do dono, 2026-09-27). As regras da edição ficam por SQL em
   2026/27.
2. **Jornadas:** data e `date_status`, local, terreno, percursos com metros e
   hora, exceções por escalão, prazo, links, `source_ref`, `series_id`.
   "Confirmar jornada" é um botão à parte e **pede sempre** a
   pré-visualização (`preview_round_change`: "move a jornada de 20+ atletas e
   ajusta 1–19 planos" — bandas, nunca contagens exatas pequenas).
3. **Clubes:** criar/editar, `eligible_final`, "Clubes por confirmar" (textos
   sem `user_id`), "Ligar a…" (atualiza as inscrições no servidor e avisa o
   atleta uma vez), alertas "clube novo" do job.
4. **Classificação:** estado de cada jornada (pronta/estável), "Correr agora",
   "Classificação publicada" manual como recurso, interruptores `sync_mode` e
   `notifications_enabled`, alertas do job (consulta própria a `app_logs`,
   `event='cup-standings-sync'`), dorsais repetidos por edição (não ligados).
5. **Auditoria:** leitura de `cup_audit_log`.

## 7. Job da classificação e privacidade

`cup-standings-sync` (Edge Function), por `pg_cron` (criado à mão depois da
M2, com `x-cron-secret` verificado dentro da função; `verify_jwt = false` no
`config.toml` **no mesmo commit**) ou por POST de admin. O cron e o "Ler
agora" ficam inertes sem a M2 (sonda das tabelas novas → nenhum pedido ao
site, nenhuma escrita) e com a edição `desligado`. A exceção é o **ensaio**
(abaixo): só o admin o corre (JWT de admin; o cron nunca) e corre sem a M2,
porque não lê nem grava nada que um atleta leia.

- **Fonte:** o admin cola o link de cada prova (`/Resultados/{id}`) em
  `cup_rounds.results_url` e o da geral (`/Trofeu/{id}`) em
  `cup_editions.standings_url`; só se aceitam os formatos do adaptador
  (`CUP_ADAPTER_URLS`). **Só GET**, nunca postbacks.
- **Plano:** edições com `results_source = 'adaptador'`, `sync_mode <>
  'desligado'` e não encerradas; jornadas confirmadas em [D, D+10] ainda não
  estáveis (D e D+1 a cada volta, depois 1×/dia) e, em `publicar`, com algum
  inscrito "Vou" ou com corrida ligada. A geral lê-se com as jornadas. A
  marca de estável guarda o modo em que foi obtida
  (`cup_sync_state.stable_mode`) e a de `observar` não conta em `publicar`:
  ao passar a publicar, as jornadas já lidas voltam ao plano e publicam-se
  logo se a página não mudou; depois de D+10 relêem-se de 6 em 6 h até
  ficarem prontas (48 h a falhar, ou sem interessados, fecham). Nenhuma
  jornada fica presa sem uma leitura em `publicar`.
- **Leitura:** `adapters/trofeuCascais.ts` é o único ficheiro que conhece o
  site. User-Agent identificado, `robots.txt` respeitado, timeout, limite de
  tamanho e de páginas por volta, sem Gemini. O HTML e as linhas de
  terceiros vivem só em memória (as linhas canónicas nem se serializam).
- **Validação** (`@formulas/cupResults.ts`): página de erro, data da página
  ≠ data da jornada (apanha o link de outra prova), época da geral,
  colunas por nome, posições em ranking, marcas e dorsais legíveis, escalões
  conhecidos, Total = Σ P, pontos da tabela, linhas plausíveis, regressão
  (−20% de linhas, escalão que desaparece) → **não escreve nada dessa
  página** e alerta. **Pronta** = mesmo hash (só colunas não pessoais) em 2
  voltas com ≥6 h; **estável** = 48 h sem mudanças ou fim de D+10. Só se
  escreve com a página pronta.
- **Modos:** `observar` escreve só o estado do job (`cup_sync_state`), os
  alertas agregados (`app_logs`) e os nomes da coluna Equipa da geral
  (`cup_team_aliases` — a lista oficial de coletividades; só o admin a lê);
  **nada que um atleta leia**. O clube de uma página de prova só entra nos
  aliases (em `publicar`) quando a linha já é **dele** — o dorsal, o nome
  como o site o escreve e o escalão de uma linha que ele confirmou; antes
  disso, a linha achada pelo dorsal pode ser de outra pessoa. `publicar` escreve `cup_round_publication`, as linhas
  próprias (`cup_results`, `cup_standings`) e a coletiva dos clubes com
  inscritos. **Ensaio** (POST do admin com os links de uma época inteira, ex.
  a 33.ª; só com o JWT de um admin — o cron nunca o corre): lê e valida sem
  gravar nada que um atleta leia (na BD, só 1 linha agregada em `app_logs`)
  e devolve só números — valida o adaptador contra os totais oficiais e
  responde à base dos pontos e a "os de fora ocupam lugar?". Por isso corre
  mesmo sem a M2.
- **Escreve** (em `publicar`), para cada inscrição ativa **com dorsal**, a
  linha desse dorsal se o escalão bater com o calculado para a jornada e o
  clube com o da inscrição nessa data. **Pontos:** os calculados da página
  são um mínimo (os atletas de fora não ocupam lugar na classificação de
  Cascais) e mostram-se "provisórios"; os **oficiais** da geral
  substituem-nos nas linhas confirmadas — só quando a coluna Pk já saiu
  (alguma linha da geral com pontos; a legenda pode chegar antes) e a célula
  dele tem um número: uma célula vazia nunca vira 0 oficial. **Coletiva:** o
  site não a dá por GET — é uma conta da app sobre a geral oficial (≥
  `team_min_athletes`, desempate por mais 1.ºs lugares, 2.ºs, …), gravada só
  para clubes com inscritos, só nas colunas que já saíram, e dita "conta da
  app".
- **Correspondência:**
  - a 1.ª linha de cada edição e dorsal fica `proposta` e pergunta-se ao
    atleta ("És tu? 41.º M40, 36:12"); as seguintes (e as outras propostas do
    mesmo dorsal) confirmam-se sozinhas enquanto o nome como o site o
    escreve, o escalão e o clube baterem com uma linha que ele confirmou (a
    `standings_key`) — o dorsal sozinho não chega: se o organizador trocar
    os dorsais de duas colegas, a linha da outra fica `proposta`;
  - "não sou eu" apaga as não confirmadas e guarda a recusa **do dorsal**
    nessa edição (`match_refused_key`): nunca volta; só mudar de dorsal
    desbloqueia. O job relê a recusa antes de cada jornada e, 1× por volta,
    apaga as não confirmadas com a chave recusada em toda a edição;
  - dorsal repetido entre inscrições da mesma edição, ou em duas linhas da
    página: nenhuma se liga, o admin vê a contagem; as confirmadas ficam como
    estavam (outra inscrição com o mesmo dorsal não apaga o que ele já
    confirmou);
  - nunca se procura pelo nome, nunca se propõe outro dorsal (o vizinho do
    mesmo escalão e clube tende a ser colega de equipa — só conta em
    agregado);
  - todas as falhas dão a mesma frase: "Não consegui confirmar. Revê o dorsal
    ou fala com o suporte.";
  - se a identidade da linha muda (escalão, clube, nome como o site o
    escreve) numa volta seguinte, passa a `perdida` e pergunta-se de novo;
    uma correção de lugar ou marca atualiza sem perguntar; presente numa
    jornada "Não vou", conta.
- **Geral** (sem dorsal): a linha do próprio liga-se só pela chave tirada da
  **sua** linha confirmada de uma jornada (nome como o site o escreve +
  escalão + clube) **e** pelo ano de nascimento do perfil; zero → fica o que
  havia; duas, ou ano diferente → não liga.
  - **Chave alternativa** (decisão do dono, 2026-09-27: a exata só dá linha
    única em 94,5% dos casos na 33.ª, e 22 das 24 falhas são nomes do meio
    diferentes entre a página da prova e a geral). Só se tenta quando a
    exata não acha **nenhuma** linha — com 2 ou mais (homónimos), ou com o
    ano diferente, não liga, como sempre. É o 1.º e o último nome
    (normalizados) da mesma linha confirmada + escalão + clube, com o ano do
    perfil igual ao "Ano" da geral; só vale com **exatamente 1** linha na
    página inteira (0 ou 2+ não liga).
  - Nunca fica confirmada sozinha: grava-se `proposta` em `cup_standings` e
    pergunta-se "És tu? 12.º M40 na geral · 43 pontos" (sem nomes; a mesma
    acessibilidade do "És tu?" das jornadas). "Sim" confirma-a
    (`confirm_cup_standing`); "Não sou eu" (`reject_cup_standing`) apaga-a e
    guarda a recusa dessa chave, que nunca mais volta a ser proposta. Até ao
    "sim", os pontos oficiais dessa geral não substituem os provisórios nas
    jornadas e o resumo do fecho não a usa. A chave exata fica como está.
  - O ensaio diz, por prova, quantas linhas da geral ligariam pela exata,
    quantas pela alternativa e quantas não ligam — só números.
- **Sem consentimento novo:** o dorsal é opcional e dado por ele, a 1.ª linha
  só fica com o "sim" dele e "não sou eu" nunca volta; o texto da inscrição
  explica-o.
- **Teste de fuga:** falha se algum nome, dorsal ou clube de terceiros da
  fixture aparecer na consola, em `app_logs`, nas escritas ou na resposta do
  job (nem o nome e o dorsal do próprio — só hashes). Fixtures
  **sintéticas**, escritas à mão (nomes, dorsais e clubes inventados); as
  páginas reais nunca entram no git.

## 8. Avisos

**Preferências** em `cup_enrollments`: `notify_calendar` ("Avisa-me quando
sair"), `notify_date_changes`, `notify_entry_deadline`, `notify_results` —
todas `false`. Interruptores em Perfil › Carol, só visíveis a inscritos; o
interruptor geral `carol_push_enabled`, a janela e o máximo diário valem por
cima. A migração **M3** alarga só `coach_proactive_log_trigger_check` e
`coach_proactive_pushes_trigger_check`; `profiles_carol_push_types_check`, a
bio e os chips do Perfil não mudam (a BD recusa `cup_*` em
`carol_push_types` — é assim que se garante que o array nunca os religa).

| Tipo | Quando | Frase / destino |
|---|---|---|
| `cup_calendar` | Edição passa a ter jornadas confirmadas | "Saiu o calendário do {competição}." → ecrã do Troféu via Início |
| `cup_date_change` | Data de uma jornada "Vou" muda | "A {prova} mudou para {dia}." → Início |
| `cup_entry_deadline` | 48 h antes do prazo, "Vou", sem "Já me inscrevi", não inscrito pelo clube | "A inscrição na {prova} fecha {dia} às {hora}." → Início |
| `race_morning` | Manhã de jornada `atacar`/`controlar` | Com a hora do percurso do atleta |
| `cup_results` | Correu, `results_ready_at` existe, antes de +14 d e da véspera da seguinte | "Saiu a classificação da {prova}. Vem ver comigo." → chat; sem posição, pontos nem clube |

- **Máximo 3 por jornada**, contando os `race_*`. Sem push de véspera em
  jornadas (fica no chat e no cartão). Nada em `saltar`, "Não vou" ou "Não
  fui"; em `trote` só o prazo de inscrição (quem vai a trote também tem de se
  inscrever — decisão do dono, 2026-09-27). A intenção é a gravada ou, sem
  ela, a sugerida (`cupRoundRoles`, a mesma da app e da Carol).
- `cup_results` junta-se ao balanço (`race_after`) se ainda não foi entregue
  e `ready_at` ≤ hora do balanço; se a classificação sair depois, o aviso
  sai (é informação nova).
- A leitura das tabelas `cup_*` no tick é em lote; se falhar, o candidato
  fica `null` — nunca o `continue` que calaria todos os momentos do atleta.
- Sem aviso por correções, acumulado, posição do clube nem a quem não correu.

## 9. Riscos e ordem de deploy sem staging

**Um push a `dev` que toque `supabase/functions/**` é produção** e publica
todas as funções do ramo. `dev` e `master` nunca divergem num ficheiro de
função.

1. **M1 à mão, com autorização:** catálogo, inscrição, participações,
   resultados, resumos, colunas e CHECK em `race_events`, publicação,
   auditoria, RPCs, políticas. Seed: 34.ª `por_anunciar`, clubes conhecidos,
   sem jornadas (o calendário nunca vai por migração).
2. Funções tolerantes a tabelas/colunas em falta; o select do tick com
   `cup_round_id` só depois da M1.
3. **M3** (2 CHECKs) antes de qualquer código que conheça tipos `cup_*`.
4. Cliente em `master` só com pedido fresco; tick e chat com os tipos `cup_*`
   iguais em `dev` e `master`, inofensivos com `notifications_enabled=false`.
5. Admin liga `notifications_enabled`; depois `sync_mode='observar'` com uma
   execução sobre a 33.ª (valida o adaptador contra os totais oficiais e
   responde, em agregado, à base dos pontos); só depois `publicar`, com o
   `pre-deploy-reviewer`.

**Riscos principais:** a jornada tomar o lugar da principal nas escolhas por
data (Fase 0 fecha-o); uma data provável errada disparar taper e push
(`provavel` não gera provas); o admin mover uma jornada de muitos atletas
(pré-visualização obrigatória e auditoria); o site oficial mudar de markup
(invariantes, não se escreve nada); um dorsal errado ligar a linha de outro
(escalão + clube, 1.ª confirmada, repetidos não ligam); avisos a mais
(desligados por omissão, teto por jornada).

## 10. Fases e critérios de aceitação

| Fase | Até | Conteúdo | Aceita-se quando |
|---|---|---|---|
| **0. Correções neutras** | 16/10 | Próxima principal em vez de próxima por data (chat, cartão diário, `RaceReadinessCard`, "Reta Final", `terrainForAthlete`, `hasUpcomingRace`); véspera e manhã preferem a principal no mesmo dia; `RunRegistration` liga à prova do dia; `update_race_event` pelo nome exato; falso recorde (distância equivalente, com a folga do GPS para corridas sem prova e provas criadas pelo registo); distância livre no formulário de prova (pílulas de atalho); provas criadas pelo registo gravadas como secundárias ('b'); o balanço de uma prova já entregue deixa de tapar o balanço da semana. **Adiado de propósito:** o nível e o género por omissão ficam como no servidor ('medio' e o limiar masculino) — mudar exige mudar os três sítios ao mesmo tempo. Sem migrações. **Deploy:** `dev` e `master` seguidos (o tick novo e o cliente antigo divergem no balanço da semana e na prova do dia) | Testes existentes verdes; testes novos das escolhas; para quem tem só provas principais, as escolhas são as de antes |
| **1. Dados e inscrição** | 13/11 | M1 (**em produção** a 26/09, com o 1b), `classifyEnrollment`, fixtures (personas + circuito fictício), `useCup()`, cartão em Provas, inscrição, jornadas, gerir/sair | Invariância sem inscrição: `buildSystemInstruction` igual byte a byte, `buildTools` sem ferramentas, zero candidatos proativos, snapshots de Provas/Perfil iguais; "Vou" confirmada cria `b`; "Não vou" e apagar no Calendário convergem |
| **1b. Backoffice** | 13/11 | Separador "Competições" (§6) | Não-admin recebe erro da RLS; confirmar jornada exige pré-visualização; toda a escrita auditada |
| **2. Carol e prioridades** | 27/11 | (**em produção** a 26/09, sem migração) `seriesArbitration.ts` com golden tests, `pointsBand`, contador, `getTaperDays` por intenção, `fetchSeriesBlock`, `SERIES_TOOLS`, mapa da época, 3 perguntas, doutrina #6 em `02-corrida-prova.md` | Golden tests das personas A–K; a Carol cala pontos com base `null`; nenhuma frase proibida de §5 nos testes |
| **3. Ecrã do Troféu e lista** | 27/11 | (**em produção** a 27/09, sem migração) Ecrã do Troféu, bloco fixo na lista, "Para onde vou", hub com bloco Troféu, prazo no cartão diário | `groupRaces` sem `cup_round_id` igual a hoje; acessibilidade de §4.3 |
| **4. Job da classificação** | antes da J2 | M2 (`20260927200000_cup_results.sql`, **aplicada em produção a 2026-09-27**: idade pela época, correspondência, `cup_standings`, `cup_sync_state`, guarda do fecho), adaptador, `cupResults.ts`, cron, correspondência, 33.ª em ensaio/`observar` | Teste de fuga verde; invariantes param a escrita; repetidos não ligam |
| **5. Avisos** | antes da J2 | M3, tipos `cup_*`, preferências em Perfil › Carol, teto por jornada | Omissão tudo desligado; `carol_push_types` recusa `cup_*`; máximo 3 por jornada em teste |

**Não pode cair:** a RPC de impacto antes de sair o calendário e as guardas
da Fase 2. **Se atrasar, cai por esta ordem:** avisos para a J3, ecrã do
Troféu reduzido a calendário e links.

## 11. Decisões em aberto

1. **Idade mínima:** inscrição só a partir dos 18 anos, enquanto a doutrina
   for para adultos (recomendado).
2. **Pontos:** a Carol cala os pontos até o regulamento da 34.ª dizer a base
   (escalão ou geral) e o critério de "individual" (recomendado).
3. **Por confirmar com a Câmara:** regulamento e equipas da 34.ª, distâncias
   por escalão das outras provas. O regulamento geral da 33.ª já responde às
   idades (por ano de nascimento, referência no 2.º ano da época), ao dorsal
   (o mesmo toda a época) e à base dos pontos (escalão). **Os atletas de
   clubes de fora não ocupam lugar** — provável pela J1 da 33.ª, em agregado
   (a soma oficial de cada escalão bate com a tabela aplicada só aos de
   Cascais em 32/32); o ensaio das 11 provas confirma.
4. **Omissões aprendidas:** duas escolhas seguidas contra a intenção proposta
   passam a ser a omissão, dentro das guardas (proposta, não decidida).
