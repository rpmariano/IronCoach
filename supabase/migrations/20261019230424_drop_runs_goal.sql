-- A corrida não tem campo de objetivo (decisão de 2026-10-20): a coluna criada na F0a
-- (20261017233601) nunca foi usada — 0 de 88 corridas a tinham preenchida, sem vistas
-- nem funções a depender dela. Aplicada à mão em produção (o workflow não corre migrations).
alter table public.runs drop column if exists goal;
