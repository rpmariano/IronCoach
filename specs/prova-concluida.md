# Prova concluída — o registo do dia da prova

Decidido em 2026-09-12. Complementa `PRD.md` §3.4 (Agenda de provas) e o handoff
`design-handoff-2026-09` (mock "Hub de prova · depois da prova", CAROL.md §7).

## Porquê

O grande objetivo da app é a preparação para as provas. O dia em que a prova
é corrida e registada tem de ser um evento — e hoje não é: a corrida de
competição vive isolada da prova agendada (não há `race_id`; o hub pós-prova
só a encontra por coincidência de data), "Concluída" na agenda é um toggle
que não regista nada, e o registo de competição é o formulário de treino com
dois campos extra ("Tempo Oficial" e "Posição") enfiados entre o tipo e a
distância. Não há sítio para o diploma, a medalha, nem as fotografias.

## Decisões

1. **A corrida liga-se à prova.** `runs.race_id` (FK para `race_events`,
   `on delete set null`). Registar a prova é registar uma corrida com
   `kind = 'competicao'` e `race_id`; ao gravar, a prova passa a
   `status = 'concluida'` automaticamente. "Marcar como concluída sem
   registo" mantém-se como ação secundária na agenda (quem não quer registar
   não é obrigado).
2. **As memórias vivem na prova**, não na corrida: `race_events.diploma_path`
   (1 ficheiro, imagem ou PDF), `race_events.medal_path` (1 foto),
   `race_events.photo_paths` (até 6 fotos). Bucket privado novo
   `race-memories`, pasta por utilizador (`<uid>/<race_id>/...`), com
   `file_size_limit` de 2 MB e `allowed_mime_types` imagem + PDF. As imagens
   passam pela `compressImage` existente (JPEG, 1600px, ~300 KB).
   Custo: uma prova cheia ≤ 4,5 MB; o plano gratuito (1 GB) dá mais de 200
   provas completas antes de haver conta a fazer.
3. **Um só ecrã de registo da prova**: o `RunRegistration` em "modo prova"
   (`raceId` na entrada), reorganizado em quatro blocos, por esta ordem:
   - **A prova** — nome, data, distância, piso e o objetivo (tempo e ritmo
     alvo) pré-preenchidos a partir de `race_events`; não editáveis aqui
     (editam-se na agenda).
   - **O resultado** — tempo oficial (obrigatório), posição geral
     (opcional), e o print do relógio com a análise da Carol como hoje
     (distância/duração/splits/FC vêm da IA ou à mão). O "tempo pessoal"
     do relógio continua a ser `duration_seconds`; o oficial vai para
     `details.official_time_seconds` como já vai.
   - **Como correu** — esforço (RPE) e notas.
   - **Memórias** — diploma, medalha, fotografias da prova, com os limites
     acima e o contador "N de 6".
   Entradas para este modo: o botão "Registar a corrida da prova" do hub;
   um CTA "Registar a prova" no cartão da prova do Início e da agenda a
   partir do dia da prova (e enquanto não houver corrida ligada, até 7 dias
   depois — no Início a prova por registar mostra-se mesmo já passada); e no
   FAB "Nova corrida", ao escolher "Competição", um seletor "Qual prova?"
   com as provas agendadas a ±7 dias, mais "Prova fora da agenda" (corrida
   de competição sem `race_id`, comportamento de hoje).
4. **O dia especial.** Ao gravar: confirmação própria (`RecordConfirmation`
   em âmbar, a cor da prova, com o nome da prova), a prova fica concluída, e
   o hub pós-prova (`RaceHubView`, estado `isCompleted`) passa a encontrar a
   corrida por `race_id` e ganha a galeria: medalha em destaque, diploma,
   fotografias; tempo final ao lado do objetivo com o delta (já existe). A
   Carol reage pelo gatilho `race_after` que já existe (CAROL.md §7) — o
   botão "Falar com a Carol" do hub leva lá.
5. **Gamificação — fase seguinte, spec própria.** Conquistas calculadas dos
   dados existentes (prova concluída, objetivo batido = tempo oficial ≤
   `target_time_seconds`, recorde pessoal na distância, primeira prova de
   trail, sequência de provas). Desenho a fazer em Claude Design antes de
   implementar; nenhuma tabela nova nesta fase.

## Fora de âmbito (agora)

- Edge Functions: `analyze-run` continua a receber o print como hoje; passar
  o objetivo da prova ao comentário da Carol é um passo seguinte (toca em
  produção ao fazer push a `dev`).
- Vídeo, partilha social, ficheiros acima de 2 MB.
- Editar a prova (data, distância, objetivo) a partir do registo.

## Migração

`supabase/migrations/20260912100000_race_completion.sql` — a aplicar em
produção (dashboard SQL ou `supabase db push`) antes do merge para `master`;
o frontend em `dev` não é publicado (GitHub Pages só de `master`).
Junto com a de `onboarding_done`, que também está por aplicar.
