// Guardas de regressão contra a duplicação estrutural encontrada na
// auditoria (specs/formulas-centralizacao.md §4). O projeto não tem
// linter (sem ESLint, sem script `lint`) — estas regras só existem se
// forem testes.
//
// Cada guarda aqui é uma ALLOWLIST, não uma proibição total: `todayISO`,
// `formatPace` e `formatDuration` já têm cópias locais espalhadas por
// `src/components/` (a duplicação estrutural em si, não um bug numérico —
// fica para a Fase D, specs/formulas-checklist.md). O que o teste impede é
// o número de cópias CRESCER a partir de agora: uma cópia nova, fora da
// allowlist, falha a suite — a mesma classe de erro que gerou o bug do
// P0-5 (todayISO redefinido em UTC dentro de biEngine.js) não pode voltar
// a entrar sem ninguém reparar.
//
// Quando um ficheiro da allowlist for migrado para importar do canónico
// (Fase D), remove-o da lista aqui — o teste continua verde e passa a
// exigir mais.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC_ROOT = path.resolve(__dirname, '..');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\.(js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function relPath(absPath) {
  return path.relative(SRC_ROOT, absPath).split(path.sep).join('/');
}

// Ficheiros que já redefinem cada função, hoje — capturado por leitura
// direta do código nesta sessão (Fase B). Ver P0-5 (biEngine.js já
// corrigido nesta ronda — fora da allowlist de propósito).
//
// Fase D (specs/formulas-checklist.md) migrou todas as cópias locais de
// todayISO e formatDuration para importar do canónico — as allowlists
// abaixo ficaram vazias (só o próprio ficheiro canónico). formatPace
// continua com cópias: os 3 formatos visíveis ("5.20" / "5'20\"/km" /
// "5:20/km") são divergência de UI real, não só duplicação de código — só
// mudam com uma decisão explícita sobre o formato a mostrar ao atleta.
const TODAY_ISO_ALLOWLIST = new Set([
  'lib/utils.js', // canónico
]);

const FORMAT_PACE_ALLOWLIST = new Set([
  'utils/run.js', // canónico
  'components/Run/RunDashboard.jsx',
  'components/Run/RunCard.jsx',
  'components/BI/ScatterTrendChart.jsx',
]);

const FORMAT_DURATION_ALLOWLIST = new Set([
  'utils/run.js', // canónico
]);

function findDefiners(files, name) {
  const fnPattern = new RegExp(`function\\s+${name}\\s*\\(`);
  const arrowPattern = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*\\(`);
  const hits = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (fnPattern.test(content) || arrowPattern.test(content)) {
      hits.push(relPath(file));
    }
  }
  return hits;
}

describe('guardas de regressão — cópias locais de fórmulas (Fase B)', () => {
  const files = walk(SRC_ROOT);

  it('todayISO: nenhum ficheiro novo fora da allowlist a redefinir a função', () => {
    const definers = findDefiners(files, 'todayISO');
    const unexpected = definers.filter(f => !TODAY_ISO_ALLOWLIST.has(f));
    expect(unexpected).toEqual([]);
  });

  it('formatPace: nenhum ficheiro novo fora da allowlist a redefinir a função', () => {
    const definers = findDefiners(files, 'formatPace');
    const unexpected = definers.filter(f => !FORMAT_PACE_ALLOWLIST.has(f));
    expect(unexpected).toEqual([]);
  });

  it('formatDuration: nenhum ficheiro novo fora da allowlist a redefinir a função', () => {
    const definers = findDefiners(files, 'formatDuration');
    const unexpected = definers.filter(f => !FORMAT_DURATION_ALLOWLIST.has(f));
    expect(unexpected).toEqual([]);
  });
});

describe('guardas de regressão — biConstants.js sem código morto novo (Fase B)', () => {
  // 16 das 31 constantes hoje não têm nenhum consumidor fora do próprio
  // ficheiro (ver specs/formulas-centralizacao.md §4, caso PROTEIN_TARGETS:
  // 10 linhas de comentário a descrever a correção de um bug real que, por
  // a constante nunca ser importada, nunca chegou a ser aplicada). Esta
  // guarda não corrige as 16 agora (fica para a Fase C/D, quando cada
  // constante for migrada para _shared/formulas/ ou apagada) — só impede o
  // número de CRESCER: uma constante exportada nova, sem consumidor fora
  // do ficheiro e fora desta allowlist, falha a suite.
  //
  // Quando uma destas ganhar um consumidor real (ou for apagada), remove-a
  // da lista — o teste continua verde e passa a exigir mais.
  const KNOWN_DEAD_CONSTANTS = new Set([
    'ACWR_SAFE_MIN',
    'MAX_WEEKLY_INCREASE_PCT',
    'GYM_VOLUME_ELEVATED_RISK_PCT',
    'GYM_VOLUME_HIGH_RISK_PCT',
    'EA_SUBCLINICAL_MIN',
    'TARGET_HIGH_INTENSITY_PCT',
    'BF_FLOOR_MEN',
    'BF_FLOOR_WOMEN',
    'PROTEIN_TARGETS',
    'PROTEIN_VOLUME_BONUS_PER_20KM',
    'PROTEIN_VOLUME_BONUS_FROM_KM',
    'CARB_TARGETS',
    'RHR_FATIGUE_THRESHOLD_BPM',
    'RPE_PACE_DISCREPANCY',
    'CADENCE_DEGRADATION_PCT',
  ]);

  it('nenhuma constante exportada nova fica sem consumidor fora do ficheiro', () => {
    const biConstantsPath = path.resolve(SRC_ROOT, 'utils/biConstants.js');
    const content = fs.readFileSync(biConstantsPath, 'utf8');
    const exportNames = [...content.matchAll(/export const (\w+)/g)].map(m => m[1]);

    const otherFiles = walk(SRC_ROOT).filter(f => f !== biConstantsPath);
    const otherFilesContent = otherFiles.map(f => fs.readFileSync(f, 'utf8'));

    const deadNow = exportNames.filter(name => {
      const usedElsewhere = otherFilesContent.some(c => new RegExp(`\\b${name}\\b`).test(c));
      return !usedElsewhere;
    });

    const unexpected = deadNow.filter(name => !KNOWN_DEAD_CONSTANTS.has(name));
    expect(unexpected).toEqual([]);
  });
});
