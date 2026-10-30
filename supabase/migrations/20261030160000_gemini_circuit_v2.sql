-- Disjuntor do Gemini, 2.ª versão das funções (revisão de 5612ec2d).
--
-- R1: um sucesso já não fecha um disjuntor aberto nem zera as falhas. Antes,
-- qualquer resposta boa limpava tudo — na prática era «3 falhas seguidas», e
-- com uma degradação parcial (falha, sucesso, falha…) nunca abria.
--   - Aberto (now() < open_until): o resultado de um pedido que já ia a meio
--     não muda nada.
--   - Meio-aberto (o teste): sucesso fecha e limpa; falha reabre com o dobro.
--   - Fechado: um sucesso não toca na janela — as falhas expiram com ela
--     (5 min desde a primeira).
-- R2: menos escritas. O check de um disjuntor fechado só lê (sem for update);
-- o teste do meio-aberto apanha-se com um UPDATE condicional (atómico, um só
-- pedido). O record de um sucesso com o disjuntor fechado não escreve nem
-- cria a linha.

create or replace function public.gemini_circuit_check(p_model text, p_probe_seconds integer default 90)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open_until timestamptz;
begin
  select open_until into v_open_until from public.gemini_circuit where model = p_model;
  if v_open_until is null then
    return 'closed';
  end if;
  if now() < v_open_until then
    return 'open';
  end if;
  -- Passado o tempo aberto: meio-aberto. Só o pedido que apanha a reserva testa.
  update public.gemini_circuit
     set probe_until = now() + make_interval(secs => p_probe_seconds), updated_at = now()
   where model = p_model
     and open_until is not null and now() >= open_until
     and (probe_until is null or now() >= probe_until);
  if found then
    return 'probe';
  end if;
  return 'open';
end;
$$;

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
  if p_ok then
    select * into r from public.gemini_circuit where model = p_model;
    -- Fechado (ou sem linha): um sucesso não escreve nada.
    if not found or r.open_until is null then
      return 'closed';
    end if;
    -- Aberto: um pedido que já ia a meio não fecha o disjuntor.
    if now() < r.open_until then
      return 'open';
    end if;
    -- Meio-aberto: o teste deu certo — fecha e limpa.
    update public.gemini_circuit
       set failures = 0, window_start = null, open_until = null, open_seconds = 0,
           probe_until = null, updated_at = now()
     where model = p_model;
    return 'closed';
  end if;

  insert into public.gemini_circuit (model) values (p_model) on conflict (model) do nothing;
  select * into r from public.gemini_circuit where model = p_model for update;

  -- Aberto: uma falha de um pedido que já ia a meio não muda nada.
  if r.open_until is not null and now() < r.open_until then
    return 'open';
  end if;

  -- Meio-aberto: o teste falhou — reabre com o dobro do tempo, até ao teto.
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

-- create or replace mantém os grants; repetem-se para a migration valer sozinha.
revoke all on function public.gemini_circuit_check(text, integer) from public, anon, authenticated;
revoke all on function public.gemini_circuit_record(text, boolean, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.gemini_circuit_check(text, integer) to service_role;
grant execute on function public.gemini_circuit_record(text, boolean, integer, integer, integer, integer) to service_role;
