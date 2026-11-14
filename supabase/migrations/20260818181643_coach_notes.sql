-- ============================================================================
-- Tabela coach_notes — Memória de longo prazo da Carol.
--
-- Porquê: o histórico de conversa que vai ao modelo são só as últimas N
-- mensagens. Um facto dito há três semanas ("tenho epicondilite", "não posso
-- treinar de manhã") desaparece dessa janela e a Carol volta a propor coisas
-- que já sabia estarem erradas. Alargar a janela não resolve — só enche o
-- prompt de conversa irrelevante e baralha mais.
--
-- Estas notas são o oposto do histórico: poucas, curadas, sempre injetadas no
-- prompt. Guardam-se factos DURADOUROS (preferências, limitações, contexto de
-- vida), nunca o que já está estruturado noutras tabelas (metas, treinos,
-- avaliações) nem o que é transitório.
-- ============================================================================

create table if not exists coach_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- Agrupa a nota no prompt e permite ao modelo substituir a nota certa.
  category   text not null check (category in (
    'preferencia_alimentar', 'limitacao_fisica', 'disponibilidade',
    'objetivo_pessoal', 'preferencia_treino', 'contexto_vida', 'outro'
  )),
  note       text not null check (char_length(trim(note)) between 3 and 500),
  -- Quem originou o facto. A Carol regista o que o atleta lhe disse, mas o
  -- atleta também pode vir a editar/apagar as notas no perfil.
  source     text not null default 'coach' check (source in ('coach', 'atleta')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma nota por categoria+texto: evita a Carol acumular duplicados quase iguais
-- a cada vez que o mesmo assunto volta à conversa.
create unique index if not exists coach_notes_unique_idx
  on coach_notes(user_id, category, lower(trim(note)));

create index if not exists coach_notes_user_idx on coach_notes(user_id, updated_at desc);

alter table coach_notes enable row level security;

drop policy if exists "own rows" on coach_notes;
create policy "own rows" on coach_notes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "admin read all" on coach_notes;
create policy "admin read all" on coach_notes for select using (public.is_admin());
