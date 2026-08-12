-- Adiciona meal_status à tabela coach_plan_items
-- Permite que a sugestão alimentar tenha o seu próprio estado (pendente, seguida, nao_seguida)
-- independente do estado do treino.

alter table public.coach_plan_items
  add column if not exists meal_status text not null default 'pendente'
    check (meal_status in ('pendente', 'seguida', 'nao_seguida'));
