-- ============================================================================
-- race_events.web_info — informação recolhida do site oficial da prova.
--
-- Porquê: muitas provas têm um site com horários, regras por escalão,
-- recomendações de equipamento/deslocação e, por vezes, uma descrição do
-- percurso — mas hoje o campo `website` é só um link cru, o atleta tem de ir
-- ler tudo isso manualmente. Um botão em RunAgenda/RaceCard chama a Edge
-- Function enrich-race-event, que lê o site com o Gemini e grava aqui o
-- resultado estruturado.
--
-- Best-effort e opt-in (nunca automático): o atleta pede explicitamente,
-- porque isto tem custo de API e latência, e porque a extração pode falhar
-- ou vir incompleta consoante o que o site realmente publica. web_info é
-- nullable e fica null até ao primeiro pedido bem-sucedido.
--
-- Forma esperada do JSON (ver supabase/functions/enrich-race-event):
--   {
--     schedule: [{ label, when }] | null,
--     category_info: string | null,
--     gear_recommendations: string | null,
--     logistics: string | null,
--     route_summary: string | null,
--     route_segments: [{ km_marker, description, turn, elevation }] | null,
--     caveats: string | null,
--     source_url: string,
--     fetched_at: string (ISO)
--   }
-- route_segments é uma reconstrução aproximada a partir de indicações em
-- texto do site (não há GPX nem coordenadas reais) — sempre tratado no
-- cliente como esquemático, nunca como um mapa geograficamente exato.
-- ============================================================================

alter table race_events
  add column if not exists web_info jsonb;

comment on column race_events.web_info is
  'Informação estruturada extraída do site da prova (website) pela Edge Function enrich-race-event, a pedido explícito do atleta. Inclui fetched_at/source_url; ver migração para a forma completa. Null até ao primeiro pedido.';
