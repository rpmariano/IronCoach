import React from 'react';
import { ExternalLink } from 'lucide-react';
import GlassCard from '../shared/GlassCard';
import SectionLabel from '../shared/SectionLabel';
import { formatDuration } from '../../utils/run';

/* A classificação no ecrã do Troféu (specs/trofeu.md §4.3, Fase 3).
   2026-09-27.

   PRIVACIDADE (§7). Só duas coisas saem da BD para aqui: a linha oficial
   confirmada do PRÓPRIO (cup_results, RLS "own rows") e o total do SEU clube
   (cup_team_results) — nunca nomes, lugares ou totais de outros atletas nem
   de outros clubes. O resto da classificação está no site oficial, e é para
   lá que os links levam. A linha "proposta" ("És tu? 41.º M40…") é da
   Fase 4: aqui só entram as confirmadas (useCup.js já as filtra). */

/** O clube dele, como a inscrição o diz (o da lista, ou o que escreveu). */
export function clubeLabel(enrollment, teams) {
  if (!enrollment) return '';
  if (enrollment.team_other) return enrollment.team_other;
  const team = (teams || []).find((t) => t.id === enrollment.team_id);
  return team?.short_name || team?.name || 'Clube por confirmar';
}

/** Tem clube (da lista, que não o "Individual", ou escrito por ele)? */
export function temClube(enrollment, teams) {
  if (!enrollment) return false;
  if (enrollment.team_other) return true;
  const team = (teams || []).find((t) => t.id === enrollment.team_id);
  return !!team && team.kind !== 'individual';
}

const positivo = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };
const numero = (v) => { const x = Number(v); return v != null && Number.isFinite(x) ? x : null; };

/** "5 pontos" / "1 ponto". null sem pontos. */
export function pontosLabel(points) {
  const p = numero(points);
  if (p == null) return null;
  return `${String(p).replace('.', ',')} ${p === 1 ? 'ponto' : 'pontos'}`;
}

/** As partes da linha oficial de uma jornada: "Tempo oficial 36:12", "29.º
 *  M45" (ou "29.º no escalão M45" com `escalao`), "5 pontos". Cada parte só
 *  existe se a linha a tiver. Nunca o dorsal. */
export function resultadoOficialPartes(result, { escalao = false } = {}) {
  if (!result) return [];
  const parts = [];
  const t = positivo(result.official_time_s);
  if (t) parts.push(`Tempo oficial ${formatDuration(Math.round(t))}`);
  const cat = positivo(result.category_position);
  const pos = positivo(result.position);
  if (cat) {
    const code = result.category_code ? String(result.category_code) : null;
    parts.push(escalao ? `${cat}.º no escalão${code ? ` ${code}` : ''}` : `${cat}.º ${code || 'no escalão'}`);
  } else if (pos) {
    parts.push(`${pos}.º na geral`);
  }
  const pts = pontosLabel(result.points);
  if (pts) parts.push(pts);
  return parts;
}

/** Um link para o site oficial: 44 px, abre noutra janela, e o leitor de
 *  ecrã ouve que sai da app (`srLabel` quando o texto visível é curto de
 *  mais para se perceber fora do contexto). */
export function CupLink({ href, label, srLabel, testId, className = '' }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      aria-label={`${srLabel || label} (abre o site oficial)`}
      className={`inline-flex items-center gap-1 text-[12px] font-extrabold ${className}`}
      style={{ minHeight: 44, padding: '0 4px', color: 'var(--race)', textDecoration: 'none' }}
    >
      {label} <ExternalLink size={12} aria-hidden="true" />
    </a>
  );
}

const porOrdemDescendente = (a, b) =>
  String(b.date || '').localeCompare(String(a.date || '')) || (b.round_no ?? 0) - (a.round_no ?? 0);

/** O que a secção mostra, a partir da vista (pura, para os testes). null
 *  quando não há nada: sem resultados, sem a coletiva do clube e sem links. */
export function classificacaoDe(view) {
  if (!view?.enrollment) return null;
  const { enrollment, edition, teams } = view;
  const rounds = view.rounds || [];
  const today = view.today || '';
  const results = view.results || { status: 'idle', summary: { count: 0, points: null } };
  const summary = results.summary || { count: 0, points: null };
  const clube = temClube(enrollment, teams);

  const rotulo = String(view.roundLabel || 'Jornada').toLowerCase();
  let tua = null;
  if (summary.count > 0) {
    const n = summary.count;
    const pts = pontosLabel(summary.points);
    tua = `${n} ${n === 1 ? rotulo : `${rotulo}s`} com resultado oficial${pts ? ` · ${pts}` : ''}`;
  } else if (results.status === 'erro') {
    tua = 'Não consegui ler a tua classificação agora.';
  } else {
    tua = 'Ainda não há resultados oficiais teus confirmados.';
  }

  // A coletiva: só o total do clube dele, na última jornada com linha.
  let coletiva = null;
  if (enrollment.team_id && clube) {
    const r = rounds.filter((x) => x.teamResult).sort((a, b) => (b.round_no ?? 0) - (a.round_no ?? 0))[0];
    if (r) {
      const pos = positivo(r.teamResult.position);
      const nome = clubeLabel(enrollment, teams);
      const cabeca = pos ? `${nome} ficou em ${pos}.º na ${r.chip}` : `${nome} na ${r.chip}`;
      coletiva = [cabeca, pontosLabel(r.teamResult.points)].filter(Boolean).join(' · ');
    }
  }

  // Os links oficiais: a geral da edição e, da última jornada que já passou
  // com link, os resultados e a coletiva.
  const passadas = rounds.filter((r) => r.date && String(r.date).slice(0, 10) < today && r.date_status !== 'cancelada').sort(porOrdemDescendente);
  const comResultados = passadas.find((r) => r.results_url) || null;
  const comColetiva = clube ? passadas.find((r) => r.team_results_url) || null : null;
  const links = [
    edition?.standings_url ? { key: 'geral', href: edition.standings_url, label: 'Classificação geral' } : null,
    comResultados ? { key: 'jornada', href: comResultados.results_url, label: `Resultados da ${comResultados.chip}` } : null,
    comColetiva ? { key: 'coletiva', href: comColetiva.team_results_url, label: `Coletiva da ${comColetiva.chip}` } : null,
  ].filter(Boolean);

  if (summary.count === 0 && results.status !== 'erro' && !coletiva && links.length === 0) return null;
  return { tua, coletiva, links };
}

export default function CupClassificacao({ view }) {
  const c = classificacaoDe(view);
  if (!c) return null;
  return (
    <>
      <SectionLabel style={{ margin: '10px 2px 0' }}>Classificação</SectionLabel>
      <GlassCard radius={20} padding={14} data-testid="cup-trofeu-classificacao">
        <p className="m-0 text-[12.5px]" data-testid="cup-classificacao-tua" style={{ color: 'var(--text-2)', lineHeight: 'var(--leading-normal)' }}>
          <span className="font-extrabold" style={{ color: 'var(--text-1)' }}>A tua:</span> {c.tua}
        </p>
        {c.coletiva && (
          <p className="m-0 text-[12.5px] mt-1.5" data-testid="cup-classificacao-coletiva" style={{ color: 'var(--text-2)', lineHeight: 'var(--leading-normal)' }}>
            <span className="font-extrabold" style={{ color: 'var(--text-1)' }}>Coletiva:</span> {c.coletiva}
          </p>
        )}
        {c.links.length > 0 && (
          <div className="flex flex-wrap gap-x-3 mt-1.5">
            {c.links.map((l) => <CupLink key={l.key} href={l.href} label={l.label} testId={`cup-classificacao-link-${l.key}`} />)}
          </div>
        )}
        <p className="m-0 text-[11px] mt-1.5" style={{ color: 'var(--text-4)', lineHeight: 'var(--leading-normal)' }}>
          Só mostramos a tua linha e o total do teu clube — nunca nomes nem lugares de outros atletas.
        </p>
      </GlassCard>
    </>
  );
}
