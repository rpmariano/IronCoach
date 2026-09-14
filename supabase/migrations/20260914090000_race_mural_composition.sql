-- A composição do mural (pedido 2026-09-14): o estúdio guarda o que o
-- atleta montou — modelo, formato, fotos em cada espaço com o enquadramento
-- (arrastar e ampliar: fx/fy/zoom) e os grafismos ligados, a cor e o canto
-- da marca — para voltar a mexer sem começar do zero, e para o mesmo mural
-- aparecer em qualquer dispositivo onde a prova se abra.
--
-- JSON livre: a validação vive no cliente (utils/muralStudio.js,
-- sanitizeComposition), não aqui. Null até o atleta montar um mural.

alter table public.race_events
  add column if not exists mural_composition jsonb;
comment on column public.race_events.mural_composition is
  'A composição do mural montada no estúdio (modelo, fotos, enquadramento, grafismos). Null até o atleta montar um.';
