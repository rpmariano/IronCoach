import { createHash } from 'node:crypto';

/* Auditoria de segurança M5 (2026-11-14): Content-Security-Policy por <meta>, só no build
   (vite.config.mjs, plugin ironcoach-csp). Em desenvolvimento o Vite e o plugin do React injetam
   scripts inline (o preâmbulo do fast refresh), que uma CSP sem 'unsafe-inline' bloquearia.

   Sem 'unsafe-inline' em script-src: o único script inline (a rede de segurança do logo de
   arranque, no index.html) entra pelo seu hash sha256, calculado aqui sobre o HTML final — se
   alguém o mudar, o hash acompanha.

   style-src leva 'unsafe-inline': o React escreve style={{…}} pelo CSSOM (que a CSP não
   bloqueia), mas as cenas da Carol (CarolCena.jsx) entram por innerHTML com style="--i:N"
   nos caminhos (o atraso de cada traço), e o <style> do logo de arranque vive no index.html.
   Estilos não executam código; o risco é baixo.

   Origens externas que a app usa:
   - o Supabase do projeto (REST, Auth, Storage, Edge Functions) e o seu Realtime (wss);
   - o open-meteo (geocoding e altitude do sítio onde treinas, utils/trainingPlace.js).
   O login Google é uma navegação (redirect), não precisa de entrada.
   data: e blob: só nas imagens e media — as fotos comprimidas (dataUrl), as pré-visualizações e
   o mural (blob:). Nenhum fetch() da app lê data: nem blob: (a foto passa a bytes por atob, em
   raceMemories.js; os únicos fetch são o Supabase, o open-meteo e SVG da própria app), por isso
   connect-src não os leva. */

export const SUPABASE_ORIGIN = 'https://roxfzsiciizkevopgpnl.supabase.co';
const SUPABASE_WS = SUPABASE_ORIGIN.replace(/^https:/, 'wss:');
const OPEN_METEO = ['https://geocoding-api.open-meteo.com', 'https://api.open-meteo.com'];

/* O parser de HTML normaliza as quebras de linha (CRLF e CR passam a LF) antes de o browser
   calcular o hash do script: com um index.html em CRLF (checkout no Windows), o hash dos bytes
   não batia certo e o script era bloqueado (visto no teste do build, 2026-11-14). */
const sha256 = (text) => `'sha256-${createHash('sha256').update(text.replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`;

/** Os hashes dos <script> e <style> inline (sem src) do HTML. */
export function inlineHashes(html) {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1]).filter((body) => body.trim()).map(sha256);
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => sha256(m[1]));
  return { scripts, styles };
}

export function cspFor(html) {
  const { scripts } = inlineHashes(html);
  const directives = [
    ["default-src", "'self'"],
    ["script-src", "'self'", ...scripts],
    // Sem hashes de <style>: com um hash na lista, o browser ignora o 'unsafe-inline'.
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", 'data:', 'blob:', SUPABASE_ORIGIN],
    ["media-src", "'self'", 'data:', 'blob:', SUPABASE_ORIGIN],
    ["font-src", "'self'", 'data:'],
    ["connect-src", "'self'", SUPABASE_ORIGIN, SUPABASE_WS, ...OPEN_METEO],
    ["worker-src", "'self'"],
    ["manifest-src", "'self'"],
    ["frame-src", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
  ];
  return directives.map((d) => d.join(' ')).join('; ');
}

/** O HTML com a <meta http-equiv="Content-Security-Policy"> logo a seguir ao charset. */
export function injectCsp(html) {
  if (/http-equiv=["']Content-Security-Policy["']/i.test(html)) return html;
  const meta = `<meta http-equiv="Content-Security-Policy" content="${cspFor(html)}">`;
  return html.replace(/(<meta charset=[^>]*>)/i, `$1\n  ${meta}`);
}
