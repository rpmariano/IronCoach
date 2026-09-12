# Plano para o dia da prova

Decidido em 2026-09-12. Complementa `PRD.md` §3.4, `prova-concluida.md`,
`gamificacao-provas.md` ("A Carol no balanço") e CAROL.md §7.

## Princípio

Um plano de prova é uma tabela, não um conselho: para cada km, ou grupo de
km, o ritmo a fazer, o tempo de passagem e a instrução (controlar, ritmo,
aguentar, decidir, acelerar). Quando a Carol conhece o percurso, o plano
fala dos troços pelo nome que o site da prova lhes dá: "na subida da
Calçada da Ajuda, entre o km 6 e o 7, sobe para 5.40". Quando não conhece,
diz que não conhece, e planeia só com a distância e o desnível. Nunca
inventa um traçado.

## A régua (uma só, partilhada)

`supabase/functions/_shared/formulas/racePacing.ts`, `buildRacePacingPlan`,
lida pelo hub (via `@formulas`) e pelo coach-chat. Entradas: distância,
tipo (estrada/trail), D+, objetivo (`target_time_seconds`), previsão do
treino (`getRacePrediction`, só corridas anteriores à prova), nível, e
`race_events.web_info.route_segments` quando existir (marco de km,
descrição, sobe/desce/plano — o que o `enrich-race-event` extrai do site).

1. **Ritmo base.** O objetivo, se for realista face à previsão do treino
   (até 3% mais rápido do que ela). Se for mais ambicioso do que isso, o
   plano monta-se sobre a previsão e o objetivo fica como "dia bom":
   decide-se no ponto de decisão. Sem objetivo, a previsão; sem nenhum dos
   dois, não há plano — pede-se o objetivo.
2. **Distribuição** (negative split, por categoria de distância):
   - primeiro km: controlar, mais lento que a base (5/10 km +6 s, meia +8 s,
     maratona +10 s);
   - até 20%: controlar, +3 s;
   - 20% a 55%: ritmo, na base;
   - 55% a 70%: aguentar, na base (maratona +2 s);
   - 70%: ponto de decisão (meia ≈ km 15, maratona ≈ km 30) — se a sensação
     for boa, acelera; se não, mantém;
   - 70% a 90%: −3 s se acelerar;
   - últimos 10% (mínimo 1 km): acelerar (5/10 km −8 s, meia −5 s, maratona −3 s).
3. **Percurso.** Cada `route_segment` com marco de km e relevo ajusta o km
   em que cai: subida +8% no ritmo (trail +15%), descida −4% (trail −3%),
   com a instrução a citar a descrição do troço. Troços sem marco entram só
   como texto do `route_summary`.
4. **Trail** é por esforço, não por ritmo: o ritmo base fica como referência
   de plano, as subidas acima do que se corre a andar ("caminhada tática",
   doutrina 08), as descidas técnicas a controlar; sem zonas de FC no perfil
   fala-se em esforço.
5. **Abastecimento.** A partir da meia: água de 5 em 5 km; hidratos aos ~40
   min e depois a cada ~35 min, nunca nos últimos 10 min (doutrina 04).
6. O tempo de chegada planeado é a soma dos km; a tabela mostra os tempos
   de passagem acumulados.

## Onde aparece

1. **Hub da prova**, nos últimos 7 dias e no dia: cartão "Plano para o dia"
   com a tabela (troço, ritmo, passagem, instrução), as notas de percurso e
   o abastecimento. Sem `web_info` e com site, o botão "Buscar o percurso"
   já existente. Sem objetivo, o cartão pede-o.
2. **Carol na véspera** (`race_eve`): recebe a tabela e os troços no
   contexto e apresenta o plano na voz dela, troço a troço, com os porquês
   — não uma lista seca, mas também sem omitir números. Se o objetivo é
   ambicioso, diz-o e explica o ponto de decisão.
3. **Carol na manhã** (`race_morning`): duas frases e um único número, o
   ritmo do primeiro km.
4. **Balanço** (`race_after`): com parciais registados (`runs.details.splits`),
   o cliente manda-os no `race_outcome` e o servidor compara km a km com o
   plano — é daí que sai a causa concreta de um "aquém" ("arrancaste a 5.05
   quando o plano dizia 5.35").

## Fora de âmbito

Meteorologia, perfil altimétrico do site (só o qualitativo dos segmentos),
ajuste em tempo real durante a prova.
