-- ============================================================================
-- Prova concluída — o registo do dia da prova (specs/prova-concluida.md).
--
-- Porquê: o grande objetivo da app é preparar provas, mas o dia em que a
-- prova é corrida não era um evento no modelo de dados. A corrida de
-- competição vivia isolada da prova agendada — o hub pós-prova só a
-- encontrava por coincidência de data (runs.date === race_events.date), o que
-- falha em qualquer registo feito no dia seguinte, e "Concluída" na agenda era
-- um toggle que não guardava nada. Não havia sítio nenhum para o diploma, a
-- medalha nem as fotografias do dia.
--
-- Três peças, todas aditivas (nada aqui parte registos antigos):
--   1. runs.race_id — a corrida passa a apontar para a prova que cumpriu.
--   2. race_events.diploma_path / medal_path / photo_paths — as memórias
--      vivem na PROVA, não na corrida: são do dia, não do registo desportivo,
--      e sobrevivem a apagar/reanalisar a corrida.
--   3. bucket privado race-memories, pasta por utilizador e por prova.
-- ============================================================================

-- ── 1. A corrida liga-se à prova ────────────────────────────────────────────
-- `on delete set null` (e não cascade): apagar a prova da agenda nunca pode
-- apagar a corrida que o atleta correu — o registo desportivo é dele, a
-- ligação é que deixa de fazer sentido. Mesmo critério de runs.shoe_id.
alter table public.runs
  add column if not exists race_id uuid references public.race_events(id) on delete set null;

comment on column public.runs.race_id is
  'Prova (race_events) que esta corrida cumpriu. Só em corridas com kind = ''competicao''; null numa competição fora da agenda. Ver specs/prova-concluida.md.';

-- O hub da prova procura a corrida por race_id a cada abertura; sem índice
-- seria um scan da tabela de corridas inteira.
create index if not exists runs_race_idx on public.runs(race_id);

-- ── 2. As memórias vivem na prova ───────────────────────────────────────────
-- Caminhos dentro do bucket race-memories (não URLs): o bucket é privado e a
-- app assina-os na hora, como já faz com runs.photo_paths.
alter table public.race_events
  add column if not exists diploma_path text,
  add column if not exists medal_path text,
  add column if not exists photo_paths text[] not null default '{}';

-- `add constraint if not exists` não existe em Postgres — dropar primeiro
-- torna esta migração repetível sem erro (mesmo padrão das policies abaixo).
alter table public.race_events
  drop constraint if exists race_events_photo_paths_max;
alter table public.race_events
  add constraint race_events_photo_paths_max check (cardinality(photo_paths) <= 6);

comment on column public.race_events.diploma_path is
  'Diploma da prova — um único ficheiro, imagem ou PDF, no bucket race-memories.';
comment on column public.race_events.medal_path is
  'Fotografia da medalha — uma só, no bucket race-memories.';
comment on column public.race_events.photo_paths is
  'Fotografias do dia da prova (máx. 6), no bucket race-memories.';

-- ── 3. storage: memórias da prova (bucket privado) ──────────────────────────
-- 2 MB por ficheiro (2097152 bytes): as imagens passam antes pela
-- compressImage do cliente (JPEG 1600px, ~300 KB) e o limite existe para o
-- PDF do diploma, que segue sem compressão. Uma prova cheia (diploma +
-- medalha + 6 fotos) fica abaixo de 4,5 MB — o plano gratuito (1 GB) chega
-- para mais de 200 provas completas.
--
-- `on conflict do update` nestes dois campos (e não `do nothing`): se o
-- bucket já existir de uma tentativa anterior, é o limite e os tipos aceites
-- que têm de ficar corretos — criar o bucket é a parte fácil.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'race-memories',
  'race-memories',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- As quatro policies "own folder" dos outros buckets privados (run-photos,
-- meal-photos, gym-photos, body-photos): o primeiro segmento do caminho é o
-- id do utilizador, e ninguém lê nem escreve fora da sua pasta. Aqui o
-- caminho é <uid>/<race_id>/<ficheiro>.
drop policy if exists "race memories own folder select" on storage.objects;
drop policy if exists "race memories own folder insert" on storage.objects;
drop policy if exists "race memories own folder update" on storage.objects;
drop policy if exists "race memories own folder delete" on storage.objects;

create policy "race memories own folder select" on storage.objects for select
  using (bucket_id = 'race-memories' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "race memories own folder insert" on storage.objects for insert
  with check (bucket_id = 'race-memories' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "race memories own folder update" on storage.objects for update
  using (bucket_id = 'race-memories' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "race memories own folder delete" on storage.objects for delete
  using (bucket_id = 'race-memories' and (storage.foldername(name))[1] = auth.uid()::text);
