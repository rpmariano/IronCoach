import React, { useEffect, useState, useCallback } from 'react';
import { ChevronRight, ChevronLeft, Trophy, RefreshCcw } from 'lucide-react';
import { listCompetitions } from '../../../utils/cupAdmin';
import EditionDetail from './EditionDetail';

/* Separador "Competições" do Admin (specs/trofeu.md §6, Fase 1b), só
   is_admin — Admin.jsx já garante isto (bug_reviewer nunca chega aqui).
   2026-09-26.

   Lista competições → edições; escolher uma edição abre EditionDetail
   (jornadas, percursos, clubes, estado). Nada aqui mexe nos ecrãs do atleta
   nem na fatia `cup` do store: as ações vivem em utils/cupAdmin.js, à parte
   de cupSlice.js (que é do atleta, e está a ser mexido por outra sessão em
   paralelo). */

const STATUS_LABEL = { por_anunciar: 'Por anunciar', aberta: 'Aberta', encerrada: 'Encerrada' };
const STATUS_STYLE = {
  por_anunciar: 'bg-[var(--surface-strong)] text-[var(--text-3)] border-[var(--border-glass)]',
  aberta: 'bg-[var(--tint-ok-bg)] text-[var(--ok-soft)] border-[var(--tint-ok-bd)]',
  encerrada: 'bg-[var(--tint-danger-bg)] text-[var(--danger)] border-[var(--tint-danger-bd)]',
};

export function StatusBadge({ status }) {
  return (
    <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded border ${STATUS_STYLE[status] || STATUS_STYLE.por_anunciar}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export default function CompetitionsTab() {
  const [competitions, setCompetitions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [selected, setSelected] = useState(null); // { edition, competition }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    const res = await listCompetitions();
    if (!res.ok) {
      setUnavailable(!!res.unavailable);
      setError(res.unavailable ? null : (res.error?.message || 'Falha ao carregar competições.'));
      setCompetitions([]);
    } else {
      setCompetitions(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Quando a edição selecionada muda de estado (publicar, fechar), refletir
  // na lista sem obrigar a sair do detalhe.
  const handleEditionChanged = (edition) => {
    setSelected((s) => (s ? { ...s, edition } : s));
    setCompetitions((cs) => (cs || []).map((c) => (
      c.id === edition.competition_id
        ? { ...c, editions: c.editions.map((e) => (e.id === edition.id ? edition : e)) }
        : c
    )));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--text-3)] text-xs gap-2">
        <div className="w-6 h-6 border-2 border-[var(--border-glass)] border-t-slate-400 rounded-full animate-spin" />
        A carregar competições...
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="card rounded-2xl p-6 text-center bg-[var(--surface-soft)] border border-[var(--border-glass)] text-[var(--text-3)] text-xs space-y-2">
        <Trophy size={24} className="mx-auto opacity-50" />
        <p>Competições por jornadas ainda não disponível — a migração da M1 não está aplicada nesta base de dados.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--tint-danger-bd)] bg-[var(--tint-danger-bg)] p-4 text-center space-y-3">
        <p className="text-xs text-[var(--danger)]">{error}</p>
        <button onClick={load} className="tap-h-44 text-[11px] text-[var(--danger)] underline">Tentar novamente</button>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="space-y-3 fade-in">
        <button
          onClick={() => setSelected(null)}
          className="tap-h-44 flex items-center gap-1 text-xs font-semibold text-[var(--text-3)] hover:text-[var(--text-2)]"
        >
          <ChevronLeft size={16} /> Competições
        </button>
        <EditionDetail
          edition={selected.edition}
          competition={selected.competition}
          onEditionChanged={handleEditionChanged}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase font-bold text-[var(--text-3)]">Competições</p>
        <button onClick={load} className="tap-h-44 flex items-center gap-1 text-[11px] text-[var(--text-3)] hover:text-[var(--text-2)]">
          <RefreshCcw size={12} /> Atualizar
        </button>
      </div>

      {competitions.length === 0 && (
        <div className="card rounded-2xl p-8 text-center bg-[var(--surface-soft)] border border-[var(--border-glass)] text-[var(--text-3)] text-xs">
          Nenhuma competição no catálogo.
        </div>
      )}

      {competitions.map((c) => (
        <div key={c.id} className="space-y-2">
          <p className="text-sm font-bold flex items-center gap-1.5">
            <Trophy size={14} className="text-[var(--race)]" /> {c.name}
          </p>
          <div className="space-y-2">
            {(c.editions || []).map((e) => (
              <button
                key={e.id}
                onClick={() => setSelected({ edition: e, competition: c })}
                className="w-full card rounded-2xl p-4 bg-[var(--surface-glass)] border border-[var(--border-glass)] flex items-center justify-between gap-2 text-left hover:border-[var(--border-glass-strong)] transition"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-1)]">
                    {c.short_name} · {e.edition_no}.ª edição
                  </p>
                  <p className="text-[11px] text-[var(--text-3)]">{e.season_label}</p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <StatusBadge status={e.status} />
                  <ChevronRight size={16} className="text-[var(--text-3)]" />
                </div>
              </button>
            ))}
            {(c.editions || []).length === 0 && (
              <p className="text-[11px] text-[var(--text-3)] px-1">Sem edições ainda.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
