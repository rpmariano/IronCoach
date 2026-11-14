-- Lock por utilizador para o coach-chat: impede duas invocações concorrentes
-- para o MESMO utilizador de gerarem efeitos duplicados (ex.: duas propostas
-- de plano de treino concorrentes quando o cliente perde a resposta a um
-- pedido lento — que pode legitimamente demorar mais de 45s com várias
-- rondas de function-calling — e a pessoa reformula a mesma pergunta
-- enquanto o pedido original ainda está em curso no servidor).
--
-- Incidente que motivou esta migração: pssmartins13@gmail.com, 2026-08-20,
-- respondeu "Prefiro um plano de 14 dias." e, após um erro de rede/timeout
-- no cliente, respondeu de novo "7 dias" à mesma pergunta em aberto; ambos
-- os pedidos terminaram no servidor a ~250ms de diferença, cada um a criar
-- o seu próprio coach_plans — a verificação existente de "já há um plano
-- proposto" fazia só um SELECT no início de CADA pedido, sem se protegerem
-- uma da outra (clássica corrida time-of-check-to-time-of-use).
alter table public.profiles
  add column if not exists coach_chat_busy_since timestamptz;

comment on column public.profiles.coach_chat_busy_since is
  'Timestamp de quando uma invocação do coach-chat para este utilizador começou a processar; NULL quando livre. Lock otimista via UPDATE condicional — ver supabase/functions/coach-chat/index.ts. Um lock com mais de 2 minutos é considerado órfão (função que morreu a meio) e pode ser reocupado.';
