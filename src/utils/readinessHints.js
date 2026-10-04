/* O que falta registar para a prontidão dizer alguma coisa. Lê só os
   pilares de computeReadinessIndex (@formulas/readinessIndex.ts): um pilar
   com hasData false, ou o de carga ausente (só entra com histórico).
   Auditoria de onboarding (2026-09-27): "a calibrar" tem de dizer o que
   fazer, não só que ainda não há número. */
export function readinessMissing(pillars = []) {
  const byKey = new Map(pillars.map((p) => [p.key, p]));
  const missing = (k) => byKey.has(k) && !byKey.get(k).hasData;
  const parts = [];
  if (!byKey.has('acwr') || missing('tactic')) parts.push('corridas');
  if (missing('ea') || missing('calories')) parts.push('refeições');
  // O VDOT só precisa de corridas "a sério"; se já se pedem corridas, chega.
  if (missing('vdot') && !parts.includes('corridas')) parts.push('uma corrida rápida (prova, tempo ou intervalos)');
  return parts;
}

/** A frase por baixo do anel. null quando não falta nada. */
export function readinessHint(readiness) {
  const pillars = readiness?.pillars || [];
  const parts = readinessMissing(pillars);
  const list = parts.join(' e ');
  if (readiness?.calibrating) {
    return list
      // O cartão já diz "Prontidão a calibrar" ao lado: aqui só o que fazer.
      ? `Regista ${list} e eu digo-te como estás.`
      : 'Preciso de mais registos para te dizer como estás.';
  }
  const withData = pillars.filter((p) => p.hasData).length;
  if (withData === pillars.length) return null;
  return `Conta com ${withData} de ${pillars.length} pilares.${list ? ` Para os outros, regista ${list}.` : ''}`;
}
