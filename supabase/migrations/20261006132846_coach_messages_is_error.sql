-- Quando a Carol não consegue responder (o Gemini não respondeu a tempo, um
-- erro do servidor), o coach-chat grava a frase de falha dela no histórico,
-- para não se perder ao recarregar a app nem noutro dispositivo (incidente de
-- 2026-10-06: "Não preciso de folga" ficou sem resposta e o aviso de demora
-- desapareceu do ecrã ao voltar à app). Estas mensagens ficam marcadas e não
-- entram no histórico que se manda ao Gemini, na deteção de pedidos repetidos
-- nem nos "quando falou ela pela última vez".
alter table public.coach_messages
  add column if not exists is_error boolean not null default false;
