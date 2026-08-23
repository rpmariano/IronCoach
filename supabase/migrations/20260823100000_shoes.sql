-- ============================================================================
-- shoes — "armário" de sapatilhas do atleta (Perfil → Equipamento).
--
-- Porquê: a entressola de uma sapatilha degrada-se com os km acumulados, e
-- correr com um par gasto é um fator de risco de lesão. O atleta costuma ter
-- vários pares em rotação e não faz ideia de quantos km leva cada um.
--
-- lifespan_km é SEMPRE a vida útil de referência do modelo — a que daria a um
-- corredor de 70 kg (src/utils/shoes.js, REFERENCE_WEIGHT_KG). O ajuste ao
-- peso do atleta é feito em runtime e nunca gravado: o peso muda, e um valor
-- já ajustado ficaria a mentir a partir da avaliação corporal seguinte.
--
-- O acumulado NÃO é uma coluna: é derivado de initial_km + as corridas com
-- runs.shoe_id a apontar para este par. Guardar um contador seria mais uma
-- coisa a dessincronizar sempre que uma corrida é editada ou apagada.
-- ============================================================================

create table if not exists shoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand text not null,
  model text not null,
  -- Mês/ano em que o par entrou ao serviço. Guardado como date (dia 1) —
  -- o formulário só pede mês e ano.
  started_on date,
  -- Km que o par já tinha quando foi registado na app (pares em uso antes
  -- de existir o armário).
  initial_km numeric not null default 0 check (initial_km >= 0),
  -- Vida útil de referência (70 kg), em km. Null enquanto não houver
  -- estimativa nenhuma — nesse caso a app não mostra desgaste.
  lifespan_km integer check (lifespan_km is null or lifespan_km > 0),
  lifespan_source text check (lifespan_source is null or lifespan_source in ('carol', 'manual')),
  -- Justificação da Carol para a estimativa (categoria do modelo, tipo de
  -- espuma, etc.) — mostrada no armário para a estimativa não ser um número
  -- caído do céu.
  lifespan_notes text,
  shoe_category text,
  status text not null default 'ativa' check (status in ('ativa', 'aposentada')),
  retired_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists shoes_user_idx on shoes(user_id, status);

alter table shoes enable row level security;

drop policy if exists "own shoes" on shoes;
create policy "own shoes" on shoes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Ligação corrida → par usado ─────────────────────────────────────────
-- on delete set null: apagar um par do armário não pode apagar o histórico
-- de corridas; a corrida sobrevive, apenas deixa de ter par associado.
alter table runs
  add column if not exists shoe_id uuid references shoes(id) on delete set null;

create index if not exists runs_shoe_idx on runs(shoe_id) where shoe_id is not null;

comment on column runs.shoe_id is
  'Par de sapatilhas usado nesta corrida (opcional). Base do acumulado de km mostrado no armário — ver src/utils/shoes.js.';
