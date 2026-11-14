-- Disjuntor do modelo principal do Gemini, partilhado entre instâncias das
-- Edge Functions (30-10-2026: o gemini-3.8-flash sobrecarregado desde a manhã
-- — cada pedido esperava pelo principal, até 25–60 s, antes de cair no Flash
-- de recurso). Uma linha por modelo. Ver _shared/geminiCircuit.ts.
--
-- N = 3 falhas (429/5xx/sem resposta) em M = 5 min abrem o disjuntor por
-- X = 10 min: os pedidos vão direto ao recurso. Passado X, um só pedido testa
-- o principal (reserva de 90 s); se der certo fecha, se falhar reabre com o
-- dobro do tempo, até 60 min.
--
-- Só a service role lê e escreve, pelas duas funções abaixo (RLS sem políticas).

create table if not exists public.gemini_circuit (
  model        text primary key,
  failures     integer     not null default 0,
  window_start timestamptz,
  open_until   timestamptz,
  open_seconds integer     not null default 0,
  probe_until  timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.gemini_circuit enable row level security;
revoke all on public.gemini_circuit from anon, authenticated;

-- Antes de chamar o principal: 'closed' (chama), 'open' (salta) ou 'probe'
-- (este pedido é o teste do meio-aberto). Atómico: só um pedido apanha o teste.
create or replace function public.gemini_circuit_check(p_model text, p_probe_seconds integer default 90)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.gemini_circuit%rowtype;
begin
  select * into r from public.gemini_circuit where model = p_model for update;
  if not found or r.open_until is null then
    return 'closed';
  end if;
  if now() < r.open_until then
    return 'open';
  end if;
  -- Passado o tempo aberto: meio-aberto, um teste de cada vez.
  if r.probe_until is not null and now() < r.probe_until then
    return 'open';
  end if;
  update public.gemini_circuit
     set probe_until = now() + make_interval(secs => p_probe_seconds), updated_at = now()
   where model = p_model;
  return 'probe';
end;
$$;

-- Depois de uma tentativa ao principal: p_ok = respondeu (fora de 429/5xx e
-- com resposta). Devolve o estado resultante ('closed' ou 'open').
create or replace function public.gemini_circuit_record(
  p_model text,
  p_ok boolean,
  p_threshold integer default 3,
  p_window_seconds integer default 300,
  p_open_seconds integer default 600,
  p_max_open_seconds integer default 3600
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.gemini_circuit%rowtype;
  next_open integer;
begin
  insert into public.gemini_circuit (model) values (p_model) on conflict (model) do nothing;
  select * into r from public.gemini_circuit where model = p_model for update;

  if p_ok then
    update public.gemini_circuit
       set failures = 0, window_start = null, open_until = null, open_seconds = 0,
           probe_until = null, updated_at = now()
     where model = p_model;
    return 'closed';
  end if;

  -- Ainda aberto (um pedido que já ia a meio quando abriu): nada muda.
  if r.open_until is not null and now() < r.open_until then
    return 'open';
  end if;

  -- Um teste do meio-aberto que falhou: abre outra vez, com o dobro do tempo.
  if r.open_until is not null then
    next_open := least(greatest(r.open_seconds, p_open_seconds) * 2, p_max_open_seconds);
    update public.gemini_circuit
       set open_until = now() + make_interval(secs => next_open), open_seconds = next_open,
           probe_until = null, failures = 0, window_start = null, updated_at = now()
     where model = p_model;
    return 'open';
  end if;

  -- Fechado: conta a falha na janela; à N-ésima, abre.
  if r.window_start is null or now() - r.window_start > make_interval(secs => p_window_seconds) then
    r.failures := 0;
    r.window_start := now();
  end if;
  r.failures := r.failures + 1;
  if r.failures >= p_threshold then
    update public.gemini_circuit
       set open_until = now() + make_interval(secs => p_open_seconds), open_seconds = p_open_seconds,
           failures = 0, window_start = null, probe_until = null, updated_at = now()
     where model = p_model;
    return 'open';
  end if;
  update public.gemini_circuit
     set failures = r.failures, window_start = r.window_start, updated_at = now()
   where model = p_model;
  return 'closed';
end;
$$;

revoke all on function public.gemini_circuit_check(text, integer) from public, anon, authenticated;
revoke all on function public.gemini_circuit_record(text, boolean, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.gemini_circuit_check(text, integer) to service_role;
grant execute on function public.gemini_circuit_record(text, boolean, integer, integer, integer, integer) to service_role;
