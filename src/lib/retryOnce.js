import { LAZY_IMPORT_TIMEOUT_MS, withVisibleDeadline } from '../utils/bootDeadline';
import { reloadFresh, resumeParams } from './appUpdate';
import { useAppStore } from '../store';

/* Depois de um deploy do GitHub Pages os ficheiros antigos (com hash) deixam
   de existir: numa sessão que ficou aberta, o primeiro separador ainda não
   visitado falhava o import() e caía no AppErrorBoundary — um ecrã de erro
   por causa de uma atualização. Uma recarga única resolve; a marca em
   sessionStorage evita um ciclo se a recarga não resolver. Vivia no App.jsx;
   veio para aqui (2026-11-25) para os componentes lazy do Design v2 (HomeV2,
   RaceHubV2) a usarem também. */
export const CHUNK_RELOAD_KEY = 'ironcoach:chunk-reload';
export function retryOnce(load) {
  // Um import() que nunca responde (a rede pendurada) conta como falhado: senão o esqueleto do
  // ecrã ficava para sempre (bug de 2026-11-17).
  return () => withVisibleDeadline(load(), LAZY_IMPORT_TIMEOUT_MS, 'import').then((mod) => {
    try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* sem storage */ }
    return mod;
  }).catch((err) => {
    let already = false;
    try {
      already = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
      if (!already) sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    } catch { already = true; }
    if (!already && typeof window !== 'undefined') {
      // Sem passar pela cache do index.html (max-age=600 no GitHub Pages),
      // que ainda apontaria para os chunks que acabaram de desaparecer — e
      // de volta ao separador que se estava a abrir, não ao Início.
      reloadFresh(undefined, window.location, resumeParams(useAppStore.getState().activeTab));
      return new Promise(() => {});
    }
    throw err;
  });
}
