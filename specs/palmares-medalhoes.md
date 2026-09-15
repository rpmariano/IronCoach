# Palmarés — os medalhões

Decidido em 2026-09-14/15 sobre o canvas "IronCoach — Início e o âmbar da prova"
(https://claude.ai/artifact/NbHMkqfbCw2vBWdcPMvEea, pranchas "Palmarés — os
medalhões", "Medalhão — detalhe e regras", "O momento da medalha"). Substitui o
cartão Palmarés de `gamificacao-provas.md` §"Onde aparece" 5; as cinco
conquistas dessa spec continuam a existir, mas saem do Palmarés (ver
"O que acontece às conquistas").

Referência visual e código do artwork: `specs/palmares-medalhoes-artwork.html`.

## Porquê

O Palmarés mostrava abstrações da app ("Sequência", "1.ª trail", cadeados) —
nada de que um corredor se orgulhe. A metáfora nova vem do medalhão de
circuito (Circuito 10H · Estrelas de Portugal): um disco que existe desde o
primeiro dia, com encaixes onde as medalhas se vão pondo. **O encaixe vazio à
vista é o objetivo**; a medalha encaixada é o facto.

## Princípio

- Cada medalhão é uma **categoria** com 4 encaixes.
- Medalha ganha = estrela encaixada. Por ganhar = o buraco cunhado, sempre
  visível. Nunca cadeados, nunca medalhões escondidos.
- A primeira medalha de um encaixe ganha-se com pouco; as seguintes só
  batendo o teu melhor. Cada medalhão diz sempre quanto falta para a próxima
  ("a 86 km de voltares a ganhar a medalha do mês") — a regra "só a bater o
  melhor" cria travessias longas, e sem esta frase o medalhão parece parado.
- No máximo 6 medalhões. Mais do que isso é a feira de badges de onde viemos.

## Os medalhões

Todos se calculam de dados que já existem. Datas pelo dia local (as colunas
`date` são ISO `YYYY-MM-DD`; nunca `new Date(iso)` sem fixar a hora — ver
`diasEntre` em `Home/RaceCard.jsx`).

### 1. O Ano em Km

Encaixes: **Mês · Trimestre · Semestre · Ano**. Soma de `runs.distance_km`
(todas as corridas, não só competição) por período civil: mês; trimestre
jan–mar/abr–jun/jul–set/out–dez; semestre jan–jun/jul–dez; ano.

- **Primeira vez**: o encaixe ganha-se no **fecho** do primeiro período com
  `> 0 km` (quem correu 10 km no primeiro mês ganha a medalha do mês).
- **Depois**: ganha-se de novo no instante em que o total do período **em
  curso** ultrapassa o melhor período **fechado** — não é preciso esperar pelo
  fim do mês para receber o "Mês recorde".
- O valor gravado na estrela é o total do período que a ganhou (182 km).
- Frase de progresso: `melhor − total_em_curso` do encaixe mais perto.

### 2. As Distâncias

Encaixes: **5 · 10 · 21,1 · 42,2 km**. Uma prova concluída com corrida ligada
(`completedRaces` de `utils/achievements.js`) na distância **oficial**:
4,8–5,5 · 9,5–11 · 20,5–22,5 · 41,5–43,5 km. Não a categoria de
`categorizeDistance`, que é de treino e larga (a "meia" vai de 11 a 22,5 km;
uma prova de 15 km dava a medalha dos 21,1). Uma vez ganha, fica. Esmalte
âmbar — é a prova.

### 3. Os Recordes

Encaixes: as mesmas quatro distâncias. Ganha-se quando uma prova bate o teu
melhor anterior **dentro da mesma distância oficial** (calculado em
`medalhoes.js`, não com o `isPersonalRecord` de `utils/raceOutcome.js`, que
compara pela categoria larga — um 15 km rápido tirava o recorde à meia) —
a primeira prova numa distância enche "As Distâncias", não "Os Recordes"
(é a mesma regra da conquista `recorde_pessoal`: precisa de duas provas). A
estrela leva o tempo gravado e é **re-cunhada** a cada PB novo (o momento
toca de novo; o histórico guarda todos). Esmalte ciano.

### 4. A Época

Uma estrela de prata por prova concluída no ano civil. Encaixes =
`max(4, provas do ano marcadas)`: um encaixe vazio é uma prova marcada por
correr — o medalhão da época mostra o calendário do ano. Renova a 1 de
janeiro; o do ano anterior fica arquivado no histórico.

### 5. A Consistência

Encaixes: **4 · 12 · 26 · 52** semanas seguidas de plano cumprido.

- Semana = segunda a domingo, fechada.
- Cumprida = todos os itens `corrida`/`ginasio` com `planned_date` na semana
  estão `status = 'concluido'` (`cancelado` e `descanso` não contam).
- Semana **sem** itens de plano aceite: não conta nem quebra.
- Semana com um item que ficou `pendente` depois de fechada: quebra.
- Atenção à lição de `planDivergence.js`: ajustar um plano aceite não cria
  plano novo — os itens passados ficam `pendente`. Aplicar a mesma fronteira
  (`created_at` mais recente dos itens do plano) para uma reescrita não
  apagar semanas que o atleta não podia ter cumprido.

Esmalte ciano (o plano é da Carol).

### 6. A Superação

Encaixes: **1 · 3 · 5 · 10** objetivos de prova batidos
(`verdict === 'superado' && basis === 'objetivo'`, a régua de
`raceOutcome.js`). Esmalte âmbar.

### (7. Opcional) O Trail

Desnível acumulado em prova: 500 · 1000 · 2500 · 5000 m D+. Só se os
registos tiverem desnível fiável por corrida — verificar o campo antes de
prometer; fica fora da primeira entrega.

## Dados

As regras 1–6 recalculam-se, mas três coisas não: **quando** se ganhou, as
**re-cunhagens** ("Mês ganho 2×", os PB anteriores) e se o atleta **já viu** o
momento. Tabela nova:

```sql
create table medal_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  medalhao text not null,     -- 'ano_km' | 'distancias' | 'recordes' | 'epoca' | 'consistencia' | 'superacao'
  slot text not null,         -- 'mes' | 'trimestre' | '5k' | '42k' | '4' | 'r1' ...
  period_key text not null,   -- '2026-08' | '2026-Q3' | '2026-H2' | '2026' | race_id | ''
  value numeric,              -- 182 (km), 3107 (s), 12 (semanas)
  race_id uuid references race_events(id) on delete set null,
  awarded_at timestamptz not null default now(),
  seen_at timestamptz,
  unique (user_id, medalhao, slot, period_key)
);
```

RLS por `user_id` (select/insert/update do próprio). A migração é produção:
**só se aplica com pedido explícito**.

Fluxo:

1. `src/utils/medalhoes.js` — função pura
   `computeMedalhoes({ runs, raceEvents, coachPlans, coachPlanItems, profile, today })`
   devolve os 6 medalhões com os encaixes (`won`, `value`, `periodKey`,
   `progress`) e a lista de prémios **devidos**. Sem rede, testável como
   `achievements.js`.
2. No arranque (depois de `loadInitialData`) e depois de gravar uma corrida ou
   fechar uma prova: comparar os devidos com `medal_awards` e inserir os que
   faltam (`upsert` com `onConflict` na chave única — idempotente, dois
   dispositivos não duplicam).
3. **Primeira sincronização de um atleta com histórico**: insere com
   `seen_at = now()` o que foi ganho há mais de 7 dias. Sem isto, quem já tem
   meses de corridas abria a app com uma tempestade de 15 animações. O que é
   desta semana fica por ver — senão um atleta novo nunca via a sua primeira
   medalha.

Para ver o momento sem ganhar uma medalha: `?demo=true&medalha=1` (mostra as
medalhas que os dados de demonstração dão, sem tocar em `medal_awards`).

## Onde aparece

### Separador Provas — o cartão Palmarés

Substitui `Perfil/PalmaresCard.jsx` (o nome do ficheiro pode ficar, o conteúdo
é outro).

- **Medalhão herói** (300px, com fita): o que está mais perto da próxima
  medalha — maior `progress` entre os encaixes por ganhar; em empate, O Ano em
  Km. Por baixo, a legenda dos 4 encaixes (ganhos em tinta âmbar, por ganhar
  neutros) e a frase de progresso, que abre a persiana.
- **Coleção**: os outros 5 em grelha 2×2 (+1), medalhão 96px sem fita, nome e
  "2 de 4 · falta 21,1 e 42,2". Toque abre a persiana desse medalhão.
- "As provas e as medalhas de cada uma" abre a lista de provas concluídas
  (a persiana que hoje é "Ver tudo").

### Persiana do medalhão (`Sheet`)

Título "O Ano em Km · 2026", a regra do jogo numa frase, e um cartão por
encaixe: ganho (estrela, valor, quando, "para repetir: mais de 182 km num
mês") ou por ganhar (encaixe vazio, barra de progresso, o que falta). Em
baixo, "Histórico do medalhão" com as re-cunhagens e os anos arquivados.

### O momento da medalha

Ecrã inteiro quando há `medal_awards` com `seen_at is null`.

- **Quando**: ao abrir a app ou voltar ao Início, **nunca** com um formulário
  aberto — a mesma regra de `shouldReloadOnVisible` em `utils/authEvents.js`
  (`navGuard`, `openCreationMode`, `editingRaceId`, `editingRunId`,
  onboarding). Depois de guardar uma prova, espera que a `RecordConfirmation`
  saia.
- **Coreografia (2,6 s)**:
  1. 0,0–0,9 s — o fundo escurece; o medalhão entra a rodar em Y (540° →
     0°, de `scale .45` a `1.02` a `1`) e trava; tique tátil.
  2. 0,9–1,7 s — a estrela nova entra em arco do canto superior direito, a
     rodar (−560°) e grande (1.9×), e encolhe até ao encaixe.
  3. 1,7–2,0 s — encaixa: clarão radial no encaixe, 5 fagulhas, o medalhão dá
     um salto de 5%; háptico forte.
  4. 2,0–2,6 s — sobem o nome ("Mês recorde") e a frase ("182 km em agosto —
     o teu melhor mês de sempre."); botão "Ver no Palmarés".
- Toque em qualquer sítio salta para o estado final; segundo toque fecha.
- `prefers-reduced-motion`: estado final parado, sem clarão nem fagulhas.
- Várias por ver: mostra a mais significativa (Recordes > Distâncias >
  Superação > Ano em Km > Consistência > Época) e acrescenta "e mais 2
  medalhas" ao botão. Marca `seen_at` em todas ao fechar.
- Tempos e curvas nos tokens de `tokens/motion.css` (acrescentar
  `--dur-medal-*`), como a pílula da nav.
- Frases no tom da CAROL.md: o número primeiro, sem pontos de exclamação,
  sem emojis.

### Hub da prova

A secção "Conquistas" mantém-se e passa a mostrar também as medalhas que esta
prova deu (Distâncias, Recordes, Superação, Época), com o medalhão pequeno.

## O que acontece às conquistas

`utils/achievements.js` fica — o hub, a `RecordConfirmation`, o cartão do dia
seguinte no Início e o balanço da Carol dependem dele. Saem só do Palmarés:

| Conquista | Passa a viver em |
|---|---|
| `prova_concluida` | A Época |
| `objetivo_batido` | A Superação |
| `recorde_pessoal` | Os Recordes |
| `primeira_trail` | só no hub |
| `sequencia` | só no hub |

## O artwork

`src/components/shared/Medalhao.jsx`, a partir de
`specs/palmares-medalhoes-artwork.html` (renderização final, 2026-09-15):

- `<MedalhaoDefs />` — o `<svg width="0" height="0">` com os gradientes,
  filtros (`star-drop`, `inset-deep`), `star-ag`, `star-socket` e as medalhas
  com esmalte. Montado **uma vez** no `App` (os ids são globais ao documento).
  Prefixar os ids (`ic-medal-…`) para não colidir com o `RaceTrail` ou os
  gráficos.
- `<Medalhao size="lg|sm" ribbon title year footer slots={[...]} />`, com
  `slots` = `[{ state: 'won' | 'empty', enamel: 'amber' | 'cyan' | 'silver',
  label }]`.
- Disco em CSS (camadas `.medal-rim/face/grain/sheen/ring/engrave`) — mover
  para um CSS de componente, não para `globals.css`.
- Posições: grande 300×300, estrelas nas diagonais (97,93) (203,93) (97,207)
  (203,207); pequeno 96×96, (32,32) (64,32) (32,64) (64,64) com a estrela
  `scale(.33)` e o encaixe `scale(.34)`. Com 1.4× e a escala .42 original as
  estrelas pequenas sobrepõem-se — verificado no browser.
- A Época com mais de 4 provas: os encaixes passam a um anel à volta da
  gravação (5–8) — desenhar antes de implementar, não improvisar.
- Desempenho: `feDropShadow` e `mix-blend-mode` em 6 medalhões num Android
  modesto — medir; se custar, rasterizar o disco grande para PNG no build
  (`@resvg/resvg-js` já foi usado para os ícones da PWA) e manter as estrelas
  em SVG.
- Acessibilidade: `role="img"` com `aria-label` ("O Ano em Km: 2 de 4
  medalhas, mês 182 km, trimestre 410 km"); o momento é um `Dialog` com foco
  no botão.

## Ordem de trabalho

1. `inicio-e-ambar.md` — só UI.
2. `Medalhao.jsx` + `utils/medalhoes.js` + o novo cartão Palmarés e a
   persiana, **sem tabela**: encaixes calculados, sem histórico, sem momento.
   Já entrega o valor visual e dá para validar as regras com dados reais.
3. Migração `medal_awards` (pedido explícito), sincronização, o momento, o
   histórico da persiana, as medalhas no hub.

## Testes (`utils/medalhoes.test.js`)

- Primeiro mês com 10 km ganha no fecho; segundo mês com 8 km não ganha;
  terceiro mês ganha no dia em que passa os 10 km, não no fecho.
- Fronteiras de trimestre/semestre/ano, e datas ISO no último dia do mês.
- Corridas sem `distance_km` ignoradas.
- Distâncias: 21,1 concluída enche o encaixe; prova sem corrida ligada não.
- Recordes: primeira prova na distância não enche; a segunda mais rápida enche.
- Consistência: semana sem plano não quebra; item pendente depois do fecho
  quebra; plano reescrito não conta os dias antes da reescrita.
- Época: encaixes = provas marcadas no ano, mínimo 4.
- Sincronização: primeira vez com histórico marca tudo como visto.

## Decidido em 2026-09-15

1. **O Ano em Km compara com o melhor de sempre**, não com o melhor do ano.
   Um ano sem recordes fica com encaixes vazios — é honesto, e a frase de
   progresso diz quanto falta.
2. **O Trail fica de fora.** `details.elevation_gain_m` é opcional: vem dos
   prints quando o ecrã o mostra e fica muitas vezes vazio
   (`RunRegistration` põe-no na lista de métricas em falta). Um medalhão sobre
   um número que falta metade das vezes mentia.
