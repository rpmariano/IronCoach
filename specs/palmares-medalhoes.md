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

Encaixes: **Mês · Trimestre · Semestre · Ano**. Esmalte **ciano** — é o
volume de corrida (`--run`), não uma prova em particular. Soma de
`runs.distance_km`
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
(`completedRaces` de `utils/premios.js`) na distância **oficial**:
4,8–5,5 · 9,5–11 · 20,5–22,5 · 41,5–43,5 km. Não a categoria de
`categorizeDistance`, que é de treino e larga (a "meia" vai de 11 a 22,5 km;
uma prova de 15 km dava a medalha dos 21,1). Uma vez ganha, fica. Esmalte
âmbar — é a prova.

### 3. Os Níveis

**Renomeado a 2026-09-21** (era "Os Recordes"). O nome mentia e colidia com a
conquista `recorde_pessoal`: isto não é o recorde de ninguém, é uma **escala
de aptidão** — sobe-se de degrau sem bater tempo próprio nenhum, e um 10 km
de ouro e uma maratona de ouro valem o mesmo. O recorde pessoal (o melhor
tempo do atleta naquela categoria de distância) é outra regra e ficou onde
estava, na conquista do hub — ver "O que acontece às conquistas". A chave
passou de `'recordes'` para `'niveis'`; as linhas antigas de `medal_awards`
ficam como histórico (migração `20260921140000_medal_awards_niveis.sql`,
**escrita, por aplicar**) e o servidor lê as duas chaves
(`supabase/functions/_shared/carolMemory.ts`).

**Revisto a 2026-09-20** (pedido do utilizador na app: "criar badges bronze,
prata e ouro para melhor corrida de 5k, 10km, 21km e 42km, passe mais rápido
e melhor nível de VO2"). Antes era binário por distância — bateste o teu
tempo anterior, ou não. Passou a uma escala de três níveis, e ganhou os dois
encaixes que faltavam.

Encaixes: **seis** — as quatro distâncias oficiais, o **passo** e o **VO2**.

Níveis: **bronze, prata e ouro**, cada um com o seu esmalte. A cor deixa de
ser a do módulo e passa a dizer o nível; a lei da cor continua a valer nos
outros medalhões.

A régua das distâncias e do VO2 é o **VDOT** (Daniels-Gilbert,
`@formulas/racePrediction.ts`), escolhido por ser a única medida que compara
distâncias diferentes — um 10 km de ouro e uma maratona de ouro exigem a
mesma aptidão. Os limiares vivem todos em `NIVEIS`, em `utils/medalhoes.js`:

| Nível | VDOT | 5 km | 10 km | Meia | Maratona |
|---|---|---|---|---|---|
| Bronze | 35 | 27:01 | 56:06 | 2:04:22 | 4:16:24 |
| Prata | 45 | 21:50 | 45:16 | 1:40:20 | 3:28:27 |
| Ouro | 55 | 18:23 | 38:07 | 1:24:20 | 2:56:03 |

- **As quatro distâncias**: o nível vem da **melhor** prova dessa distância
  (menor tempo oficial), não da última. A distância oficial continua a ser a
  estreita de `medalhoes.js`, não a `categorizeDistance` larga — um 15 km
  rápido não conta para a meia.
- **O passo**: o esforço mais rápido de sempre em s/km, de prova ou de
  treino (`computeBestPace` nos escalões 5/10/21). Não usa VDOT porque mede
  velocidade pura; escala própria: 6:00, 5:00 e 4:15/km.
- **O VO2**: o melhor **VO2 máximo medido pelo relógio**
  (`runs.details.vo2_max`), não um VDOT calculado do tempo. Revisto a
  2026-09-20, no mesmo dia: com o VDOT, o medalhão dizia 39,2 enquanto o
  cartão da mesma corrida dizia 44,5 — dois números para a mesma coisa, à
  frente um do outro. Sem VO2 em corrida nenhuma o encaixe fica vazio; não
  há forma de o estimar sem mudar de escala.

Um registo com VDOT acima de `VDOT_MAXIMO_PLAUSIVEL` (85) é descartado: é
dado sujo, e uma medalha cunhada por ele ficava no histórico para sempre.

Cada nível cunha-se uma vez, do bronze até ao atingido, para quem chega
direto a prata levar as duas cerimónias. O nível vai em `period_key` de
`medal_awards`, que a chave única já distingue — sem migração. As linhas
antigas deste medalhão (com o id da prova em `period_key`) ficam sem
correspondência no cálculo novo e deixam de ter título; não estorvam.

Quem ainda não chega ao bronze não fica sem nada: "As Distâncias" continua
a marcar a primeira vez em cada distância. Este é o medalhão do mérito.

### 4. O Terreno

*(Substituiu A Época em 2026-09-15 — ver "Decidido em 2026-09-15" 3.)*

Encaixes: **1.ª estrada · 1.ª trail · 5 estrada · 5 trail**. Banda por
`race_events.race_type`, os dois únicos valores de `RACE_TERRAIN_TYPES`
(`utils/run.js`): `race_type === 'trail'` é trail, **tudo o resto é estrada**
(uma prova antiga sem terreno gravado conta como estrada, que é o que era).
É um eixo diferente do d'As Distâncias — 21 km em trail não é a mesma prova
que 21 km em estrada.

É a **casa da regra** do terreno desde a fusão dos motores (2026-09-21): a
conquista `primeira_trail` do hub é hoje a mesma pergunta (`provasDoTerreno`,
em `utils/premios.js`) feita a uma prova só, e não uma segunda contagem que
podia discordar desta. O medalhão estende-a aos dois terrenos e acrescenta o
marco de veterano: a 5.ª. A régua da prova é a mesma de sempre
(`completedRaces`: concluída, com corrida ligada e com o dia já passado).

**Sem esmalte** — prata. Conta ocorrências, não um tempo nem um objetivo
batido: não há cor que queira dizer "quantas".

### 5. A Sequência

*(Substituiu A Consistência em 2026-09-15 — ver "Decidido em 2026-09-15" 3.)*

Encaixes: **2 · 3 · 5 · 8** provas seguidas com a corrida registada.

- Um elo conta quando a prova está `concluida` **e** tem corrida ligada; uma
  prova que já passou sem registo **quebra** a sequência. Provas ainda por
  correr não entram nem quebram.
- O medalhão conta a **maior sequência de sempre**. O varrimento é um só
  (`varrerSequencia`, em `utils/premios.js`), do princípio para o fim com um
  máximo corrente, como O Ano em Km faz com o melhor período; de cada vez que
  a sequência em curso passa o recorde anterior e cai num marco, esse encaixe
  cunha-se **no dia da prova que o confirmou**. Como o máximo só cresce de um
  em um, cada marco cunha-se uma vez só.
- Do mesmo varrimento sai o **elo de cada prova** — o "N provas seguidas" que
  o hub mostra nessa prova (a conquista `sequencia`). Até 2026-09-21 esse
  número saía da sequência que chega a hoje, e uma prova antiga perdia-o
  quando uma prova posterior ficava por registar; hoje o elo é o que foi e
  fica, pela mesma lei da medalha.
- Quebrar a sequência nunca tira uma medalha já ganha — só a frase de
  progresso volta atrás.

**Sem esmalte** — prata, pela mesma razão d'O Terreno.

### 6. A Superação

Encaixes: **1 · 3 · 5 · 10** objetivos de prova batidos
(`verdict === 'superado' && basis === 'objetivo'`, a régua de
`raceOutcome.js`). Esmalte **verde** (`--ok`): é o mesmo tom da conquista
`objetivo_batido` no hub e na `RecordConfirmation` — objetivo batido é verde
em toda a app.

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
  medalhao text not null,     -- 'ano_km' | 'distancias' | 'niveis' | 'terreno' | 'sequencia' | 'superacao'
  slot text not null,         -- 'mes' | 'trimestre' | '5k' | '42k' | 'estrada1' | 'seq3' | 'o1' ...
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

A restrição do `medalhao` continua a aceitar `'epoca'` e `'consistencia'`
(migração `20260915180000_medal_awards_terreno_sequencia.sql`) e `'recordes'`
(migração `20260921140000_medal_awards_niveis.sql`, por aplicar): a app já não
os calcula, mas as linhas gravadas antes ficam como histórico e não se
apagam.

Fluxo:

1. `src/utils/medalhoes.js` — função pura
   `computeMedalhoes({ runs, raceEvents, coachPlans, coachPlanItems, profile, today })`
   devolve os 6 medalhões com os encaixes (`won`, `value`, `periodKey`,
   `progress`) e a lista de prémios **devidos**. Sem rede e sem relógio
   escondido: `today` é obrigatório (ver `utils/premios.js`).
2. Sempre que muda o número de medalhas devidas (gravar uma corrida, fechar
   uma prova com uma corrida que já existia, corrigir uma distância) ou muda
   o dia (O Ano em Km ganha-se no fecho de um período, e a PWA fica aberta
   dias) — nunca com dados parciais (sem corridas mas com
   provas concluídas: a query das corridas falhou): comparar os devidos com `medal_awards` e inserir os que
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
- Várias por ver: mostra a mais significativa (Níveis > Distâncias >
  Superação > Terreno > Sequência > Ano em Km — as das provas antes das do
  volume) e acrescenta "e mais 2 medalhas" ao botão. Marca `seen_at` em todas ao fechar.
- Tempos e curvas nos tokens de `tokens/motion.css` (acrescentar
  `--dur-medal-*`), como a pílula da nav.
- Frases no tom da CAROL.md: o número primeiro, sem pontos de exclamação,
  sem emojis.

### Hub da prova

A secção "Conquistas" mantém-se e passa a mostrar também as medalhas que esta
prova deu (Distâncias, Níveis, Superação, Terreno, Sequência), com o
medalhão pequeno.

Ressalva desde a revisão d'Os Níveis: aí o `raceId` aponta para a **melhor**
prova da distância, que pode não ser a que se acabou de registar, e os
encaixes do passo e do VO2 vão sem prova nenhuma (`raceId: null`).

## O que acontece às conquistas

`utils/achievements.js` fica — o hub, a `RecordConfirmation`, o cartão do dia
seguinte no Início e o balanço da Carol dependem dele. Saem do Palmarés (que
são os medalhões), mas continuam a ser a leitura DE CADA PROVA.

Desde a fusão dos motores (2026-09-21) a regra de cada uma vive uma vez só,
em `utils/premios.js`, e o medalhão e a conquista são duas perguntas à mesma
regra:

| Conquista | A mesma regra, no Palmarés |
|---|---|
| `prova_concluida` | As Distâncias e O Terreno contam por balde; a contagem bruta só existe na conquista |
| `objetivo_batido` | A Superação (`bateuObjetivo`) |
| `recorde_pessoal` | **nenhum** — regra própria (`bateuRecordePessoal`: o melhor tempo do atleta na categoria). Esta spec dizia "Os Recordes" e nunca foi verdade: aquilo é uma escala de aptidão (VDOT) e hoje chama-se Os Níveis |
| `primeira_trail` | O Terreno, encaixe `trail1` (`provasDoTerreno`) |
| `sequencia` | A Sequência (`varrerSequencia`): a conquista mostra o elo desta prova, o medalhão o máximo de sempre |
| `acima_do_treino` | **nenhum** — não tem par: mede a prova contra o que os treinos faziam esperar |

## O artwork

`src/components/shared/Medalhao.jsx`, a partir de
`specs/palmares-medalhoes-artwork.html` (renderização final, 2026-09-15):

- `<MedalhaoDefs />` — o `<svg width="0" height="0">` com os gradientes,
  filtros (`star-drop`, `inset-deep`), `star-ag`, `star-socket` e as medalhas
  com esmalte. Montado **uma vez** no `App` (os ids são globais ao documento).
  Prefixar os ids (`ic-medal-…`) para não colidir com o `RaceTrail` ou os
  gráficos.
- `<Medalhao size="lg|sm" ribbon title year footer slots={[...]} />`, com
  `slots` = `[{ state: 'won' | 'empty', enamel: 'amber' | 'cyan' | 'ok' |
  'silver', label }]`. Um esmalte sem joia em `<MedalhaoDefs />` cai na prata
  facetada, **nunca** no âmbar: era assim que o verde saía cor de laranja.
- Disco em CSS (camadas `.medal-rim/face/grain/sheen/ring/engrave`) — mover
  para um CSS de componente, não para `globals.css`.
- Posições: grande 300×300, estrelas nas diagonais (97,93) (203,93) (97,207)
  (203,207); pequeno 96×96, (32,32) (64,32) (32,64) (64,64) com a estrela
  `scale(.33)` e o encaixe `scale(.34)`. Com 1.4× e a escala .42 original as
  estrelas pequenas sobrepõem-se — verificado no browser.
- Mais de 4 encaixes: passam a um anel à volta da gravação (5–8). Hoje os
  seis medalhões têm 4, mas o disco continua a saber desenhar o anel.
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
- Níveis: primeira prova na distância não enche; a segunda mais rápida enche.
- Terreno: a 1.ª e a 5.ª de cada terreno; prova sem `race_type` conta como
  estrada; prova sem corrida ligada não conta.
- Sequência: guarda a maior de sempre (quebrar não tira o que está ganho);
  cada recorde novo enche o encaixe seguinte e nunca o mesmo duas vezes;
  prova futura não entra nem quebra, prova passada sem registo quebra.
- As cores de cada medalhão, uma a uma — é a lei "uma cor, um significado".
- Sincronização: primeira vez com histórico marca tudo como visto.

## Decidido em 2026-09-15

1. **O Ano em Km compara com o melhor de sempre**, não com o melhor do ano.
   Um ano sem recordes fica com encaixes vazios — é honesto, e a frase de
   progresso diz quanto falta.
2. **O Trail (desnível) fica de fora.** `details.elevation_gain_m` é opcional: vem dos
   prints quando o ecrã o mostra e fica muitas vezes vazio
   (`RunRegistration` põe-no na lista de métricas em falta). Um medalhão sobre
   um número que falta metade das vezes mentia.

3. **Fora A Época e A Consistência, dentro O Terreno e A Sequência.** As duas
   que saíram eram sobre o calendário e sobre o plano da Carol — não sobre
   provas, que é o que o Palmarés é. As duas que entraram trazem para cá
   conquistas de prova que já existiam e só viviam no hub (`primeira_trail` e
   `sequencia`), sem inventar dados novos. Os encaixes continuam a ser 6 × 4.
4. **As cores recalibradas** ("ainda demasiado âmbar"): O Ano em Km passou a
   ciano (é volume de corrida), A Superação a verde (o tom do
   `objetivo_batido` em toda a app). Fica em âmbar só As Distâncias — o único
   medalhão que é literalmente sobre a prova. O Terreno e A Sequência não
   levam esmalte nenhum.
