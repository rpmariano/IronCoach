import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Link2, FlaskConical, AlertTriangle, Check, Bell } from 'lucide-react';
import PremiumModal from '../../shared/PremiumModal';
import Button from '../../shared/Button';
import {
  listRounds, listTeams, listSyncState, listRoundPublication, listAliases, linkAlias,
  listSyncAlerts, markRoundPublished, updateEditionLinks, setEditionSyncMode, setEditionNotifications,
  runCupSync, runCupEnsaio, ensaioLinks, editionTodayISO,
} from '../../../utils/cupAdmin';
import { CUP_ADAPTER_URLS, cupResultsUrlError } from '@formulas/cupResults.ts';

/* O sub-separador "Classificação" da edição (specs/trofeu.md §6.4 e §7,
   Fase 4). 2026-09-27.

   1. O link da classificação geral (cup_editions.standings_url) — só no
      formato do adaptador (CUP_ADAPTER_URLS; o job re-valida).
   2. A leitura automática: Desligada / Observar / Publicar. Escolher não
      grava — "Guardar" grava; Publicar pede confirmação (é o que mostra a
      cada inscrito a linha dele). Sem a M2, fica desligada com o porquê.
   3. "Ler agora" (com Observar/Publicar) e o resumo da volta.
   4. O estado de cada jornada (cup_sync_state + cup_round_publication):
      pronta, estável, lida, ou o código da falha em português; e
      "Classificação publicada" à mão nas que já passaram sem ela.
   5. Os clubes vistos na geral, por ligar — "Ligar".
   6. Os dorsais repetidos entre inscrições (não ligados), em número.
   7. Os alertas recentes do job.
   8. O ensaio sem gravar (ex.: a 33.ª inteira): só números. Só o admin o
      corre (a função exige o JWT dele; o cron nunca), e corre sem a M2 —
      não grava nada que um atleta leia (1 registo agregado em app_logs).
   9. Fase 5 (§8): os avisos aos inscritos (notifications_enabled). Ligar
      pede confirmação (começa a mandar notificações e muda a véspera das
      jornadas a quem os escolheu); desligar grava logo.

   PRIVACIDADE. Nada aqui mostra atletas: o estado do job e os alertas só têm
   códigos e contagens (o job nunca guarda nomes, dorsais ou clubes de
   ninguém), os clubes por ligar são nomes de organizações (a coluna Equipa
   da geral), e o ensaio devolve só agregados. Numa edição encerrada, tudo
   fica só de consulta. */

const inputCls = 'w-full bg-[var(--bg-app)] border border-[var(--border-glass-strong)] rounded-xl py-2 px-3 text-xs text-[var(--text-2)] outline-none disabled:opacity-60';
const cardCls = 'card rounded-2xl p-4 bg-[var(--surface-glass)] border border-[var(--border-glass)] space-y-2.5';
const titleCls = 'text-xs font-bold text-[var(--text-1)] m-0';
const noteCls = 'text-[11px] text-[var(--text-3)] m-0';

const SYNC_MODE_OPTIONS = [
  { value: 'desligado', label: 'Desligada', hint: 'O job não lê nada desta edição.' },
  { value: 'observar', label: 'Observar', hint: 'Lê e valida; grava só o estado e os alertas — nada que os atletas vejam.' },
  { value: 'publicar', label: 'Publicar', hint: 'Grava a linha de cada inscrito com dorsal e mostra-lha ("És tu?").' },
];

/** Os códigos do job, em português (C.2, B.3 do desenho da Fase 4). */
export const SYNC_CODE_LABEL = {
  ok: 'ok',
  invariante: 'invariante',
  rede: 'sem resposta do site',
  regressao: 'regressão (em espera)',
  robots: 'robots.txt',
  sem_url: 'sem link de resultados',
  orcamento: 'tempo da volta esgotado',
  adaptador: 'adaptador desconhecido',
  bib_scope: 'dorsal por jornada (só observa)',
  pagina_erro: 'página de erro',
  titulo: 'título',
  data_da_pagina: 'data da página',
  epoca_da_pagina: 'época da página',
  sem_tabelas: 'sem tabelas',
  colunas: 'colunas',
  genero: 'género',
  posicoes: 'posições',
  marca: 'marcas ilegíveis',
  marca_parcial: 'algumas marcas ilegíveis',
  dorsal: 'dorsais ilegíveis',
  dorsal_parcial: 'alguns dorsais ilegíveis',
  escalao_desconhecido: 'escalão desconhecido',
  linhas_implausiveis: 'linhas implausíveis',
  total_soma: 'total ≠ soma',
  ranking: 'ranking',
  ano: 'ano de nascimento',
  pontos_fora_da_tabela: 'pontos fora da tabela',
  distancia: 'distância',
  dorsal_repetido_pagina: 'dorsal repetido na página',
  escalao_em_duas_tabelas: 'escalão em duas tabelas',
  nome_da_prova: 'nome da prova',
  legenda_em_falta: 'legenda em falta',
  legenda_sem_jornada: 'legenda sem jornada',
  pontos_soma_escalao: 'soma dos pontos do escalão',
  colunas_p_vs_jornadas: 'colunas P ≠ jornadas',
  url: 'link inválido',
  http: 'erro HTTP',
  tipo: 'não é HTML',
  tamanho: 'página grande demais',
  m2_por_aplicar: 'M2 por aplicar',
  a_correr: 'já há uma volta a correr',
};
const codeLabel = (c) => SYNC_CODE_LABEL[c] || String(c);

const pad = (n) => String(n).padStart(2, '0');
/** "06/12 18:37" (ou "06/12" sem hora) na hora de Lisboa. */
export function diaHora(iso, { hora = true } = {}) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map((p) => [p.type, p.value]));
    return hora ? `${parts.day}/${parts.month} ${parts.hour}:${parts.minute}` : `${parts.day}/${parts.month}`;
  } catch {
    return hora ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  }
}
const diaDe = (date) => (typeof date === 'string' && date.length >= 10 ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : null);

/** A frase do estado de uma jornada: "J1 Padroeira · 06/12 · pronta 06/12
 *  18:37 · estável 08/12 · lida 08/12 18:37 ✓", ou com a falha. Pura. */
export function roundStateLine(round, state, publication) {
  const parts = [`J${round.round_no ?? '?'} ${round.name || ''}`.trim()];
  const dia = diaDe(round.date);
  if (dia) parts.push(dia);
  const pronta = publication?.results_ready_at || state?.ready_at || null;
  if (pronta) parts.push(`pronta ${diaHora(pronta)}${publication?.source === 'manual' ? ' (à mão)' : ''}`);
  const estavel = publication?.stable_at || state?.stable_at || null;
  if (estavel) parts.push(`estável ${diaHora(estavel, { hora: false })}`);
  if (state?.last_checked_at) parts.push(`lida ${diaHora(state.last_checked_at)}`);
  let fim = '';
  if (state?.last_status === 'ok') fim = ' ✓';
  else if (state?.last_status) {
    const codes = (state.last_codes || []).map(codeLabel);
    fim = ` · ${codeLabel(state.last_status)}${codes.length ? `: ${codes.join(', ')}` : ''}`;
  } else if (!state) fim = ' · ainda não lida';
  return `${parts.join(' · ')}${fim}`;
}

const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** Os dorsais repetidos entre inscrições (a linha 'edicao' do job). */
function dorsaisRepetidos(stateRows) {
  const ed = (stateRows || []).find((r) => r.target === 'edicao');
  const s = ed?.summary || null;
  return numero(s?.dorsais_repetidos_inscricoes ?? s?.dorsais_repetidos ?? null);
}

/* O resumo de uma volta ("Ler agora"): o que a função devolver, só números
   e códigos (o job nunca devolve conteúdo das páginas). */
function ResumoVolta({ data }) {
  if (!data) return null;
  if (data.skipped) {
    return <p className={noteCls} role="status" data-testid="cup-sync-resumo">Nada lido: {codeLabel(data.skipped)}.</p>;
  }
  const jornadas = Array.isArray(data.jornadas) ? data.jornadas : [];
  return (
    <div className="space-y-1" role="status" data-testid="cup-sync-resumo">
      {jornadas.map((j, i) => (
        <p key={j.round_id || j.url || i} className={noteCls}>
          {[j.jornada || (j.round_no != null ? `J${j.round_no}` : null) || `Página ${i + 1}`,
            j.estado ? codeLabel(j.estado) : null,
            (j.falhas || []).length ? `falhas: ${(j.falhas || []).map(codeLabel).join(', ')}` : null,
            j.linhas != null ? `${j.linhas} linhas` : null,
            j.escritas != null ? `${j.escritas} escritas` : null].filter(Boolean).join(' · ')}
        </p>
      ))}
      {data.geral && (
        <p className={noteCls}>
          {['Geral', data.geral.estado ? codeLabel(data.geral.estado) : null,
            (data.geral.falhas || []).length ? `falhas: ${data.geral.falhas.map(codeLabel).join(', ')}` : null,
            data.geral.linhas != null ? `${data.geral.linhas} linhas` : null].filter(Boolean).join(' · ')}
        </p>
      )}
      {!jornadas.length && !data.geral && <p className={noteCls}>Volta feita{data.estado ? `: ${codeLabel(data.estado)}` : ''}.</p>}
    </div>
  );
}

/* O relatório do ensaio (C.6): por página, a geral e o cruzamento por k —
   só números. */
function RelatorioEnsaio({ data }) {
  if (!data) return null;
  const jornadas = Array.isArray(data.jornadas) ? data.jornadas : [];
  const cruz = Array.isArray(data.cruzamento) ? data.cruzamento : [];
  const pct = (a, b) => (numero(b) ? `${Math.round((numero(a) / numero(b)) * 100)}%` : '—');
  const sim = (v) => (v === true ? 'sim' : v === false ? 'não' : '—');
  const th = 'text-left font-semibold text-[var(--text-3)] pr-2 py-1';
  const td = 'pr-2 py-1 align-top text-[var(--text-2)]';
  return (
    <div className="space-y-3 overflow-x-auto" data-testid="cup-ensaio-relatorio">
      {/* Só o aviso de que chegou é anunciado; as tabelas lêem-se ao navegar. */}
      <p role="status" className="sr-only">Relatório do ensaio pronto.</p>
      <table className="w-full text-[11px]">
        <caption className="text-left text-[11px] font-bold text-[var(--text-1)] pb-1">Por página</caption>
        <thead><tr><th className={th}>Prova</th><th className={th}>Estado</th><th className={th}>Data</th><th className={th}>k</th><th className={th}>Tabelas</th><th className={th}>Linhas</th><th className={th}>Falhas</th></tr></thead>
        <tbody>
          {jornadas.map((j, i) => (
            <tr key={j.url || i}>
              <td className={td}>{String(j.url || '').replace(/^https?:\/\/(www\.)?/, '') || `Página ${i + 1}`}</td>
              <td className={td}>{codeLabel(j.estado || '—')}</td>
              <td className={td}>{diaDe(j.data) || '—'}</td>
              <td className={td}>{j.k ?? '—'}</td>
              <td className={td}>{Array.isArray(j.tabelas) ? j.tabelas.length : (j.tabelas ?? '—')}</td>
              <td className={td}>{j.linhas ?? '—'}</td>
              <td className={td}>{[...(j.falhas || []), ...(j.avisos || [])].map(codeLabel).join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.geral && (
        <table className="w-full text-[11px]">
          <caption className="text-left text-[11px] font-bold text-[var(--text-1)] pb-1">Geral</caption>
          <tbody>
            <tr><th className={th}>Estado</th><td className={td}>{codeLabel(data.geral.estado || '—')}{(data.geral.falhas || []).length ? ` (${data.geral.falhas.map(codeLabel).join(', ')})` : ''}</td></tr>
            <tr><th className={th}>Tabelas · linhas</th><td className={td}>{data.geral.tabelas ?? '—'} · {data.geral.linhas ?? '—'}</td></tr>
            <tr><th className={th}>Colunas P</th><td className={td}>{data.geral.colunas_p ?? '—'}</td></tr>
            <tr><th className={th}>Total = soma</th><td className={td}>{data.geral.total_igual_soma ?? '—'} de {data.geral.linhas ?? '—'}</td></tr>
            <tr><th className={th}>Ranking certo</th><td className={td}>{data.geral.ranking_ok ?? '—'} de {data.geral.tabelas ?? '—'} tabelas</td></tr>
            <tr><th className={th}>Equipas por ligar</th><td className={td}>{data.geral.equipas_por_ligar ?? '—'}</td></tr>
          </tbody>
        </table>
      )}
      {cruz.length > 0 && (
        <table className="w-full text-[11px]">
          <caption className="text-left text-[11px] font-bold text-[var(--text-1)] pb-1">Cruzamento (pontos da geral × página da prova)</caption>
          <thead><tr><th className={th}>k</th><th className={th}>Escalões que batem (só com pontos / todos)</th><th className={th}>Base</th><th className={th}>Os de fora ocupam lugar</th><th className={th}>Chave da geral</th><th className={th}>Coletiva (elegíveis)</th></tr></thead>
          <tbody>
            {cruz.map((c, i) => (
              <tr key={c.k ?? i}>
                <td className={td}>{c.k ?? '—'}</td>
                <td className={td}>{c.escaloes_que_batem_so_com_pontos ?? '—'} / {c.escaloes_que_batem_todos ?? '—'}{c.escaloes != null ? ` de ${c.escaloes}` : ''}</td>
                <td className={td}>{c.base_provavel || '—'}</td>
                <td className={td}>{sim(c.fora_ocupam_lugar)}</td>
                <td className={td} data-testid="cup-ensaio-chave-geral">
                  {pct(c.chave_da_geral?.com_par_unico_na_pagina, c.chave_da_geral?.linhas_com_pontos)}
                  {c.chave_da_geral?.ligam_exata != null && (
                    <>
                      {' · '}ligam pela exata {c.chave_da_geral.ligam_exata}, pela alternativa {c.chave_da_geral.ligam_alternativa ?? 0}
                      {' (por confirmar)'}, não ligam {c.chave_da_geral.nao_ligam ?? 0}
                    </>
                  )}
                </td>
                <td className={td}>{c.coletiva?.equipas_elegiveis ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function ClassificationPanel({ edition, readOnly = false, onEditionChanged }) {
  // O formato dos links é o do adaptador, só quando a edição lê por ele (o
  // mesmo critério do RoundForm).
  const adapter = edition.results_source === 'adaptador' ? edition.results_adapter || null : null;
  const exemploGeral = adapter ? CUP_ADAPTER_URLS[adapter]?.exemploGeral || null : null;
  const exemploJornada = adapter ? CUP_ADAPTER_URLS[adapter]?.exemploJornada || null : null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [teams, setTeams] = useState([]);
  const [stateRows, setStateRows] = useState([]);
  const [m2Missing, setM2Missing] = useState(false);
  const [publication, setPublication] = useState({});
  const [aliases, setAliases] = useState([]);
  const [alerts, setAlerts] = useState([]);

  const [standingsUrl, setStandingsUrl] = useState(edition.standings_url || '');
  const [urlError, setUrlError] = useState(null);
  const [savingUrl, setSavingUrl] = useState(false);
  const [urlSaved, setUrlSaved] = useState(false);

  const savedMode = edition.sync_mode || 'desligado';
  const [mode, setMode] = useState(savedMode);
  const [confirmPublicar, setConfirmPublicar] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [modeError, setModeError] = useState(null);

  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState(null);

  const [publishing, setPublishing] = useState(null); // round id
  const [publishError, setPublishError] = useState(null);
  const [aliasChoice, setAliasChoice] = useState({}); // alias id → team id
  const [linking, setLinking] = useState(null);
  const [linkError, setLinkError] = useState(null);

  const [ensaioJornadas, setEnsaioJornadas] = useState('');
  const [ensaioGeral, setEnsaioGeral] = useState('');
  const [ensaioError, setEnsaioError] = useState(null);
  const [ensaioRunning, setEnsaioRunning] = useState(false);
  const [ensaioResult, setEnsaioResult] = useState(null);

  const avisosOn = edition.notifications_enabled === true;
  const [confirmAvisos, setConfirmAvisos] = useState(false);
  const [savingAvisos, setSavingAvisos] = useState(false);
  const [avisosError, setAvisosError] = useState(null);

  useEffect(() => { setStandingsUrl(edition.standings_url || ''); }, [edition.standings_url]);
  useEffect(() => { setMode(edition.sync_mode || 'desligado'); }, [edition.sync_mode]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [roundsRes, teamsRes, stateRes, aliasesRes, alertsRes] = await Promise.all([
      listRounds(edition.id), listTeams(edition.id), listSyncState(edition.id), listAliases(edition.id), listSyncAlerts(),
    ]);
    if (!roundsRes.ok) { setLoadError(roundsRes.error?.message || 'Falha ao carregar as jornadas.'); setLoading(false); return; }
    const rs = roundsRes.data || [];
    setRounds(rs);
    setTeams(teamsRes.ok ? teamsRes.data : []);
    setM2Missing(!stateRes.ok && !!stateRes.m2Missing);
    setStateRows(stateRes.ok ? stateRes.data : []);
    setAliases(aliasesRes.ok ? aliasesRes.data : []);
    // Só os alertas desta edição.
    setAlerts((alertsRes.ok ? alertsRes.data : []).filter((a) => !a?.meta?.edition_id || a.meta.edition_id === edition.id));
    const pubRes = await listRoundPublication(rs.map((r) => r.id));
    const pub = {};
    for (const p of (pubRes.ok ? pubRes.data : [])) pub[p.round_id] = p;
    setPublication(pub);
    setLoading(false);
  }, [edition.id]);

  useEffect(() => { load(); }, [load]);

  // ── 1. O link da geral
  const checkUrl = () => {
    const err = cupResultsUrlError(adapter, 'geral', standingsUrl);
    setUrlError(err);
    return err;
  };
  const saveUrl = async () => {
    setUrlSaved(false);
    if (checkUrl()) return;
    setSavingUrl(true);
    const res = await updateEditionLinks(edition.id, { standings_url: standingsUrl }, { adapter });
    setSavingUrl(false);
    if (!res.ok) { setUrlError(res.error?.message || 'Falha ao guardar o link.'); return; }
    setUrlSaved(true);
    onEditionChanged?.({ ...edition, ...res.data });
  };

  // ── 2. O modo
  const gravarModo = async () => {
    setSavingMode(true);
    setModeError(null);
    const res = await setEditionSyncMode(edition.id, mode);
    setSavingMode(false);
    setConfirmPublicar(false);
    if (!res.ok) { setModeError(res.error?.message || 'Falha ao gravar o modo.'); return; }
    onEditionChanged?.({ ...edition, ...res.data });
  };
  const guardarModo = () => {
    if (mode === savedMode) return;
    if (mode === 'publicar') { setConfirmPublicar(true); return; }
    gravarModo();
  };

  // ── 9. Os avisos aos inscritos (Fase 5)
  const gravarAvisos = async (on) => {
    setSavingAvisos(true);
    setAvisosError(null);
    const res = await setEditionNotifications(edition.id, on);
    setSavingAvisos(false);
    setConfirmAvisos(false);
    if (!res.ok) { setAvisosError(res.error?.message || 'Falha ao gravar os avisos.'); return; }
    onEditionChanged?.({ ...edition, ...res.data });
  };
  const mudarAvisos = (on) => {
    if (on === avisosOn) return;
    if (on) { setAvisosError(null); setConfirmAvisos(true); return; }
    gravarAvisos(false);
  };

  // ── 3. Ler agora
  const lerAgora = async () => {
    setRunning(true);
    setRunError(null);
    setRunResult(null);
    const res = await runCupSync(edition.id);
    setRunning(false);
    if (!res.ok) { setRunError(res.error?.message || 'A leitura falhou.'); return; }
    setRunResult(res.data || {});
    load();
  };

  // ── 4. Classificação publicada (à mão)
  const publicar = async (roundId) => {
    setPublishing(roundId);
    setPublishError(null);
    const res = await markRoundPublished(roundId);
    setPublishing(null);
    if (!res.ok) { setPublishError(res.error?.message || 'Falha ao marcar a classificação.'); return; }
    setPublication((p) => ({ ...p, [roundId]: res.data }));
  };

  // ── 5. Ligar um clube visto
  const ligar = async (alias) => {
    const teamId = aliasChoice[alias.id];
    if (!teamId) return;
    setLinking(alias.id);
    setLinkError(null);
    const res = await linkAlias(alias.id, teamId);
    setLinking(null);
    if (!res.ok) { setLinkError(res.error?.message || 'Falha ao ligar o clube.'); return; }
    setAliases((as) => as.map((a) => (a.id === alias.id ? { ...a, ...res.data } : a)));
  };

  // ── 8. Ensaio
  const correrEnsaio = async () => {
    setEnsaioResult(null);
    const v = ensaioLinks({ jornadas: ensaioJornadas, geral: ensaioGeral }, adapter || 'trofeu_cascais');
    if (v.erro) { setEnsaioError(v.erro); return; }
    setEnsaioError(null);
    setEnsaioRunning(true);
    const table = Array.isArray(edition.points_table) && edition.points_table.length ? edition.points_table : null;
    const res = await runCupEnsaio({ jornadas: v.jornadas, geral: v.geral, pointsTable: table, adapter: adapter || 'trofeu_cascais' });
    setEnsaioRunning(false);
    if (!res.ok) { setEnsaioError(res.error?.message || 'O ensaio falhou.'); return; }
    setEnsaioResult(res.data || {});
  };

  if (loading && !rounds.length && !loadError) {
    return <p className="text-xs text-[var(--text-3)] text-center py-8" role="status">A carregar a classificação...</p>;
  }
  if (loadError) return <p role="alert" className="text-xs text-[var(--danger)] text-center py-8">{loadError}</p>;

  const today = editionTodayISO(edition.time_zone);
  const stateOf = (roundId) => stateRows.find((r) => r.target === `jornada:${roundId}` || r.round_id === roundId) || null;
  const geralState = stateRows.find((r) => r.target === 'geral') || null;
  const porLigar = aliases.filter((a) => !a.team_id);
  const repetidos = dorsaisRepetidos(stateRows);
  const semAdaptador = edition.results_source !== 'adaptador' || !adapter;
  const podeLer = !readOnly && !m2Missing && savedMode !== 'desligado';
  // Todos os clubes da edição (o "Individual" incluído: "Individual" na
  // coluna Equipa liga a ele).
  const clubes = teams;

  return (
    <div className="space-y-3 fade-in" data-testid="cup-classification-panel" aria-busy={loading || undefined}>
      {/* 1. O link da geral */}
      <section className={cardCls} aria-labelledby="cup-class-link-titulo">
        <h3 id="cup-class-link-titulo" className={titleCls}>Link da classificação geral</h3>
        <p className={noteCls}>É a página que o job lê para a geral (sem dorsal): cola o link da época, tal como está no site.</p>
        <div className="flex gap-2">
          <input
            aria-label="Link da classificação geral"
            data-testid="cup-standings-url"
            className={inputCls}
            value={standingsUrl}
            onChange={(e) => { setStandingsUrl(e.target.value); setUrlSaved(false); if (urlError) setUrlError(null); }}
            onBlur={checkUrl}
            disabled={readOnly}
            placeholder={exemploGeral ? `Ex.: ${exemploGeral}` : 'https://…'}
            aria-invalid={urlError ? true : undefined}
            aria-describedby={urlError ? 'cup-standings-url-erro' : undefined}
          />
          {!readOnly && (
            <Button variant="module" moduleColor="var(--grad-race)" size="sm" onClick={saveUrl} disabled={savingUrl} data-testid="cup-standings-url-guardar">
              {savingUrl ? 'A guardar…' : 'Guardar'}
            </Button>
          )}
        </div>
        {urlError && <p id="cup-standings-url-erro" role="alert" className="text-[11px] text-[var(--danger)] m-0">{urlError}</p>}
        {urlSaved && <p role="status" className="text-[11px] text-[var(--ok-soft)] m-0">Link guardado.</p>}
      </section>

      {/* 2. O modo */}
      <section className={cardCls} aria-labelledby="cup-class-modo-titulo">
        <h3 id="cup-class-modo-titulo" className={titleCls}>Leitura automática</h3>
        {m2Missing && (
          <p className="text-[11px] text-[var(--warn)] m-0 flex items-center gap-1" id="cup-sync-m2" data-testid="cup-sync-m2">
            <AlertTriangle size={12} aria-hidden="true" /> Precisa da migração M2 (por aplicar).
          </p>
        )}
        {semAdaptador && !m2Missing && (
          <p className={noteCls}>Esta edição não tem um adaptador de resultados: a leitura automática não faz nada.</p>
        )}
        <div role="radiogroup" aria-label="Modo da leitura automática" aria-describedby={m2Missing ? 'cup-sync-m2' : undefined} className="space-y-1.5">
          {SYNC_MODE_OPTIONS.map((o) => (
            <label key={o.value} htmlFor={`cup-sync-${o.value}`} className="flex items-start gap-2 min-h-[44px] cursor-pointer">
              <input
                id={`cup-sync-${o.value}`}
                data-testid={`cup-sync-${o.value}`}
                type="radio"
                name={`cup-sync-${edition.id}`}
                value={o.value}
                checked={mode === o.value}
                onChange={() => setMode(o.value)}
                disabled={readOnly || m2Missing}
                style={{ width: 18, height: 18, marginTop: 1, accentColor: 'var(--race)' }}
              />
              <span>
                <span className="block text-xs font-semibold text-[var(--text-1)]">{o.label}{o.value === savedMode ? ' (atual)' : ''}</span>
                <span className="block text-[11px] text-[var(--text-3)]">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {!readOnly && !m2Missing && mode !== savedMode && (
          <Button variant="module" moduleColor="var(--grad-race)" size="sm" onClick={guardarModo} disabled={savingMode} data-testid="cup-sync-guardar">
            {savingMode ? 'A gravar…' : `Guardar: ${SYNC_MODE_OPTIONS.find((o) => o.value === mode)?.label}`}
          </Button>
        )}
        {modeError && <p role="alert" className="text-[11px] text-[var(--danger)] m-0">{modeError}</p>}

        {/* 3. Ler agora */}
        {podeLer && (
          <div className="pt-1 space-y-1.5">
            <Button variant="light" size="sm" onClick={lerAgora} disabled={running} data-testid="cup-sync-ler-agora"
              icon={running ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <RefreshCw size={14} />}>
              {running ? 'A ler…' : 'Ler agora'}
            </Button>
            {runError && <p role="alert" className="text-[11px] text-[var(--danger)] m-0">{runError}</p>}
            <ResumoVolta data={runResult} />
          </div>
        )}
      </section>

      {/* 9. Os avisos aos inscritos (Fase 5, §8) */}
      <section className={cardCls} aria-labelledby="cup-class-avisos-titulo" data-testid="cup-avisos">
        <h3 id="cup-class-avisos-titulo" className={titleCls}>Avisos aos inscritos</h3>
        <p className={noteCls} id="cup-avisos-nota">
          Liga as notificações da competição (calendário, mudanças de data, prazo de inscrição, classificação) a quem as
          escolheu no Perfil. Com os avisos ligados, a véspera das jornadas deixa de ser notificada a esses atletas, nada
          lhes chega das jornadas em trote ou a saltar, e cada jornada tem no máximo 3 notificações. Precisa da M3
          aplicada e do tick novo em produção.
        </p>
        <label htmlFor={`cup-avisos-${edition.id}`} className="flex items-center gap-2 min-h-[44px] cursor-pointer">
          <input
            id={`cup-avisos-${edition.id}`}
            data-testid="cup-avisos-toggle"
            type="checkbox"
            role="switch"
            checked={avisosOn}
            onChange={(e) => mudarAvisos(e.target.checked)}
            disabled={readOnly || savingAvisos}
            aria-describedby="cup-avisos-nota"
            aria-busy={savingAvisos || undefined}
            style={{ width: 18, height: 18, accentColor: 'var(--race)' }}
          />
          <span className="text-xs font-semibold text-[var(--text-1)]">
            Enviar os avisos desta edição{savingAvisos ? ' (a gravar…)' : ''}
          </span>
        </label>
        {avisosError && <p role="alert" className="text-[11px] text-[var(--danger)] m-0">{avisosError}</p>}
      </section>

      {/* 4. Estado por jornada */}
      <section className={cardCls} aria-labelledby="cup-class-estado-titulo">
        <h3 id="cup-class-estado-titulo" className={titleCls}>Estado por jornada</h3>
        {rounds.length === 0 && <p className={noteCls}>Sem jornadas ainda.</p>}
        <ul className="space-y-1.5 m-0 p-0 list-none">
          {rounds.map((r) => {
            const pub = publication[r.id] || null;
            const day = typeof r.date === 'string' ? r.date.slice(0, 10) : null;
            const passou = !!day && day < today && r.date_status !== 'cancelada';
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2" data-testid={`cup-class-jornada-${r.id}`}>
                <span className="text-[11px] text-[var(--text-2)] min-w-0">{roundStateLine(r, stateOf(r.id), pub)}</span>
                {!readOnly && passou && !pub?.results_ready_at && (
                  <Button variant="light" size="sm" onClick={() => publicar(r.id)} disabled={publishing === r.id} data-testid={`cup-class-publicada-${r.id}`}
                    aria-label={`Classificação publicada: jornada ${r.round_no ?? ''}`}>
                    {publishing === r.id ? 'A marcar…' : 'Classificação publicada'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {geralState && (
          <p className={noteCls} data-testid="cup-class-geral">
            Geral: {[geralState.last_checked_at ? `lida ${diaHora(geralState.last_checked_at)}` : 'ainda não lida',
              geralState.last_status ? codeLabel(geralState.last_status) : null,
              (geralState.last_codes || []).length ? geralState.last_codes.map(codeLabel).join(', ') : null].filter(Boolean).join(' · ')}
          </p>
        )}
        {publishError && <p role="alert" className="text-[11px] text-[var(--danger)] m-0">{publishError}</p>}
        {/* 6. Dorsais repetidos */}
        {repetidos != null && (
          <p className={noteCls} data-testid="cup-class-repetidos">Dorsais repetidos entre inscrições (não ligados): {repetidos}</p>
        )}
      </section>

      {/* 5. Clubes por ligar */}
      <section className={cardCls} aria-labelledby="cup-class-clubes-titulo">
        <h3 id="cup-class-clubes-titulo" className={titleCls}>Clubes vistos na classificação, por ligar</h3>
        {porLigar.length === 0 ? (
          <p className={noteCls}>Nenhum por ligar.</p>
        ) : (
          <ul className="space-y-2 m-0 p-0 list-none">
            {porLigar.map((a) => (
              <li key={a.id} className="space-y-1" data-testid={`cup-alias-${a.id}`}>
                <p className="text-[11px] font-semibold text-[var(--text-1)] m-0">{a.alias_norm}</p>
                <div className="flex gap-2">
                  <select
                    aria-label={`Clube para "${a.alias_norm}"`}
                    className={inputCls}
                    value={aliasChoice[a.id] || ''}
                    onChange={(e) => setAliasChoice((c) => ({ ...c, [a.id]: e.target.value }))}
                    disabled={readOnly}
                  >
                    <option value="">— escolhe o clube —</option>
                    {clubes.map((t) => <option key={t.id} value={t.id}>{t.short_name ? `${t.short_name} — ${t.name}` : t.name}</option>)}
                  </select>
                  {!readOnly && (
                    <Button variant="light" size="sm" onClick={() => ligar(a)} disabled={!aliasChoice[a.id] || linking === a.id} data-testid={`cup-alias-ligar-${a.id}`}
                      icon={<Link2 size={14} />}>
                      {linking === a.id ? 'A ligar…' : 'Ligar'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {linkError && <p role="alert" className="text-[11px] text-[var(--danger)] m-0">{linkError}</p>}
      </section>

      {/* 7. Alertas */}
      <section className={cardCls} aria-labelledby="cup-class-alertas-titulo">
        <h3 id="cup-class-alertas-titulo" className={titleCls}>Alertas recentes</h3>
        {alerts.length === 0 ? (
          <p className={noteCls}>Sem alertas.</p>
        ) : (
          <ul className="space-y-1 m-0 p-0 list-none">
            {alerts.map((a) => {
              const r = a.meta?.round_id ? rounds.find((x) => x.id === a.meta.round_id) : null;
              const codes = Array.isArray(a.meta?.codigos) ? a.meta.codigos.map(codeLabel).join(', ') : null;
              return (
                <li key={a.id} className="text-[11px] text-[var(--text-2)]" data-testid="cup-class-alerta">
                  {a.level === 'error' ? <AlertTriangle size={11} className="inline mr-1 text-[var(--warn)]" aria-hidden="true" /> : <Check size={11} className="inline mr-1" aria-hidden="true" />}
                  {[diaHora(a.created_at), codeLabel(a.message), r ? `J${r.round_no}` : (a.meta?.alvo || null), codes].filter(Boolean).join(' · ')}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 8. Ensaio sem gravar */}
      {!readOnly && (
        <section className={cardCls} aria-labelledby="cup-class-ensaio-titulo">
          <h3 id="cup-class-ensaio-titulo" className={titleCls}>Ensaio sem gravar</h3>
          <p className={noteCls} data-testid="cup-ensaio-dica">
            Lê e valida as páginas de uma época inteira (ex.: a 33.ª) e devolve só números: se o adaptador bate com os
            totais oficiais, a base dos pontos e se os atletas de fora ocupam lugar. Não grava nada que os atletas vejam
            (só um registo agregado, para ti) e por isso corre mesmo sem a migração M2.
          </p>
          <label htmlFor="cup-ensaio-jornadas" className="text-[11px] font-semibold text-[var(--text-3)] block">Links das provas (um por linha)</label>
          <textarea
            id="cup-ensaio-jornadas"
            data-testid="cup-ensaio-jornadas"
            className={`${inputCls} min-h-[96px]`}
            value={ensaioJornadas}
            onChange={(e) => { setEnsaioJornadas(e.target.value); setEnsaioError(null); }}
            placeholder={exemploJornada ? `Ex.: ${exemploJornada}` : 'https://…'}
            aria-invalid={ensaioError ? true : undefined}
            aria-describedby={ensaioError ? 'cup-ensaio-erro' : undefined}
          />
          <label htmlFor="cup-ensaio-geral" className="text-[11px] font-semibold text-[var(--text-3)] block">Link da geral</label>
          <input
            id="cup-ensaio-geral"
            data-testid="cup-ensaio-geral"
            className={inputCls}
            value={ensaioGeral}
            onChange={(e) => { setEnsaioGeral(e.target.value); setEnsaioError(null); }}
            placeholder={exemploGeral ? `Ex.: ${exemploGeral}` : 'https://…'}
          />
          {ensaioError && <p id="cup-ensaio-erro" role="alert" className="text-[11px] text-[var(--danger)] m-0">{ensaioError}</p>}
          <Button variant="light" size="sm" onClick={correrEnsaio} disabled={ensaioRunning} data-testid="cup-ensaio-correr"
            icon={ensaioRunning ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <FlaskConical size={14} />}>
            {ensaioRunning ? 'A ler as páginas…' : 'Correr o ensaio'}
          </Button>
          <RelatorioEnsaio data={ensaioResult} />
        </section>
      )}

      {confirmAvisos && (
        <PremiumModal
          isOpen={confirmAvisos}
          onClose={() => !savingAvisos && setConfirmAvisos(false)}
          title="Ligar os avisos?"
          subtitle={`${edition.edition_no}.ª edição · ${edition.season_label || ''}`}
          icon={Bell}
          theme="warning"
          variant="dialog"
          maxWidth="max-w-sm"
        >
          <div className="p-6 space-y-4 bg-[var(--bg-sheet)] text-[var(--text-2)]" data-testid="cup-avisos-ligar-dialog">
            <p className="text-xs leading-relaxed">
              Os inscritos com avisos ligados começam a recebê-los a partir da próxima hora. Só depois de a M3 estar aplicada.
            </p>
            <div className="flex gap-2 pt-1">
              <Button variant="light" className="flex-1" onClick={() => setConfirmAvisos(false)} disabled={savingAvisos}>Cancelar</Button>
              <Button variant="module" moduleColor="var(--grad-race)" className="flex-1" onClick={() => gravarAvisos(true)} disabled={savingAvisos} data-testid="cup-avisos-ligar-confirmar">
                {savingAvisos ? 'A gravar…' : 'Ligar'}
              </Button>
            </div>
          </div>
        </PremiumModal>
      )}

      {confirmPublicar && (
        <PremiumModal
          isOpen={confirmPublicar}
          onClose={() => !savingMode && setConfirmPublicar(false)}
          title="Passar a Publicar?"
          subtitle={`${edition.edition_no}.ª edição · ${edition.season_label || ''}`}
          icon={AlertTriangle}
          theme="warning"
          variant="dialog"
          maxWidth="max-w-sm"
        >
          <div className="p-6 space-y-4 bg-[var(--bg-sheet)] text-[var(--text-2)]" data-testid="cup-sync-publicar-dialog">
            <p className="text-xs leading-relaxed">
              Publicar grava a linha de cada inscrito com dorsal e mostra-lha. Só com a autorização da DPAF e depois
              de o ensaio da 33.ª bater certo.
            </p>
            <p className="text-xs leading-relaxed" data-testid="cup-sync-publicar-releitura">
              As jornadas já lidas em Observar voltam a ser lidas nas próximas voltas: se a página não mudou, publicam-se
              logo; se mudou, quando estiver pronta (igual em duas leituras com 6 h).
            </p>
            <div className="flex gap-2 pt-1">
              <Button variant="light" className="flex-1" onClick={() => setConfirmPublicar(false)} disabled={savingMode}>Cancelar</Button>
              <Button variant="module" moduleColor="var(--grad-race)" className="flex-1" onClick={gravarModo} disabled={savingMode} data-testid="cup-sync-publicar-confirmar">
                {savingMode ? 'A gravar…' : 'Publicar'}
              </Button>
            </div>
          </div>
        </PremiumModal>
      )}
    </div>
  );
}
