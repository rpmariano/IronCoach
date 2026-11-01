/* O id de um build pelo conteúdo: o hash do chunk de entrada (assets/index-<hash>.js), que muda
   com qualquer chunk que ele importe. Usado pelo vite.config.mjs para escrever version.json —
   ver src/lib/appUpdate.js e o bug #97. */
export function entryBuildId(bundle) {
  const entry = Object.values(bundle || {}).find((c) => c && c.type === 'chunk' && c.isEntry);
  const m = entry?.fileName?.match(/-([\w-]+)\.js$/);
  return m ? m[1] : '';
}
