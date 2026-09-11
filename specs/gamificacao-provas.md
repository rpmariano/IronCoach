# Palmarés — gamificação das provas

Decidido em 2026-09-12, sobre o canvas "Palmarés da IronCoach"
(https://claude.ai/code/artifact/493e420d-b75a-45ea-abcb-e59d220d454f).
Depende de `prova-concluida.md` (corrida ligada à prova por `runs.race_id`,
memórias em `race_events`). Complementa `PRD.md` §3.4 e CAROL.md §7.

## Princípio

A conquista é um momento, não um bloco fixo. Aparece onde o dia a seguir à
prova se vive — o registo, o Início, a Carol — e arquiva-se num sítio só, o
Palmarés do Perfil. Nunca compete com "o que faço hoje".

## As conquistas (calculadas dos dados, sem tabelas novas)

| Chave | Nome | Regra | Cor |
|---|---|---|---|
| `prova_concluida` | Prova concluída | contagem de `race_events` com `status = 'concluida'` e corrida ligada | âmbar `--race` |
| `objetivo_batido` | Objetivo batido | `details.official_time_seconds` (ou `duration_seconds`) ≤ `target_time_seconds` da prova | verde `--ok` |
| `recorde_pessoal` | Recorde pessoal | melhor tempo do atleta na categoria de distância da prova (`categorizeDistance` das fórmulas partilhadas), entre corridas `kind = 'competicao'` | ciano `--run` |
| `primeira_trail` | Primeira de trail | primeira prova concluída com `race_type = 'trail'` | âmbar `--race` |
| `sequencia` | Sequência de provas | N provas seguidas concluídas com corrida ligada, sem nenhuma agendada que tenha passado por correr; N ≥ 2 | âmbar `--race` |

Bloqueada = vidro neutro com cadeado, sem cor, e uma frase que diz o que
falta ("Ficaste a 1:42 na Meia de Lisboa"). Desbloqueada = cor do
significado, data e a prova que a deu. Uma função pura
`src/utils/achievements.js` (`computeAchievements({ raceEvents, runs })`)
devolve a lista com `{ key, unlocked, date, raceId, detail, isNew }`;
`isNew` = desbloqueada pela prova registada há menos de 7 dias.

## Onde aparece

1. **Ao guardar a prova** — o `RecordConfirmation` em âmbar ("Prova
   concluída", nome da prova, "1:53:42 · a tua 3.ª prova"); se houver
   conquista nova, entra um cartão 300 ms depois com o ícone, "Nova
   conquista", o nome e o detalhe. Sai aos 1,6 s para o hub. Sem conquista
   nova, só o check. Movimento reduzido: tudo a 120 ms.
2. **Hub da prova (depois)** — secção "Conquistas" entre as memórias e o
   balanço: as conquistas desta prova como cartões; a que ficou por
   desbloquear numa linha ("Objetivo batido fica para a próxima: ficaste a
   1:42").
3. **Início, o dia a seguir** — o cartão "Para onde vou" passa a "Prova
   concluída · ontem" com tempo, pace, objetivo, a ordem da prova em grande
   (26px), as conquistas em chips (`Recorde pessoal`, `Previsão batida`) e
   dois botões: "Ver memórias" (hub) e "Próxima prova" (`RunAgenda`). Fica
   até marcares a próxima prova ou 7 dias, o que vier primeiro; depois o
   Início volta a olhar para a frente. A Carol chama pelo balanço no cartão
   de topo ("A Carol precisa de falar contigo · o balanço da prova"),
   ligado ao gatilho `race_after` que já existe. Sem lembrete permanente no
   Início.
4. **Carol, no chat** — o balanço `race_after` cita a conquista em texto,
   opinião primeiro, sem cartão: "1:53:42 é o teu melhor tempo na meia —
   4:04 abaixo do anterior". O prompt recebe as conquistas novas no contexto
   (é uma mudança em `coach-chat`, portanto produção: passo à parte, com o
   cuidado habitual).
5. **Perfil · Pessoal (opção B)** — cartão "Palmarés" no topo do separador:
   as conquistas em linha (44px cada, cor ou cadeado, rótulo curto) e "Ver
   tudo", que abre uma persiana (`Sheet`) com o resumo ("3 de 5 conquistas ·
   desde outubro de 2026"), a lista completa e as provas concluídas
   (nome, data, tempo, ícones das conquistas). Sem separador novo.

## Fora de âmbito

Partilha social, níveis/pontos, notificações push. Se um dia houver
conquistas que não se recalculem dos dados (ex.: "10 provas"), aí sim uma
tabela `achievements` com a data de desbloqueio — não agora.
