import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

/* Auditoria de segurança (2026-11-13): o bucket unknown-app-photos passou a privado — as fotos
   são prints de apps de saúde dos atletas. O Admin mostra-as por um URL assinado de 1 h, pedido
   quando a miniatura ou o modal aparece. Guardam-se em memória até perto de expirar, para a
   grelha e o modal não pedirem o mesmo URL duas vezes. */
export const UNKNOWN_APP_BUCKET = 'unknown-app-photos';
export const SIGNED_URL_TTL_S = 3600;
const REUSE_MS = (SIGNED_URL_TTL_S - 300) * 1000;
const cache = new Map(); // path → { url, at }

export function clearSignedUrlCache() { cache.clear(); }

export function useSignedPhotoUrl(path) {
  const cached = path ? cache.get(path) : null;
  const fresh = cached && Date.now() - cached.at < REUSE_MS ? cached.url : null;
  const [state, setState] = useState(() => (fresh ? { url: fresh, status: 'ready' } : { url: null, status: path ? 'loading' : 'missing' }));

  useEffect(() => {
    if (!path) { setState({ url: null, status: 'missing' }); return undefined; }
    const hit = cache.get(path);
    if (hit && Date.now() - hit.at < REUSE_MS) { setState({ url: hit.url, status: 'ready' }); return undefined; }
    let alive = true;
    setState({ url: null, status: 'loading' });
    supabase.storage.from(UNKNOWN_APP_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_S)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data?.signedUrl) { setState({ url: null, status: 'error' }); return; }
        cache.set(path, { url: data.signedUrl, at: Date.now() });
        setState({ url: data.signedUrl, status: 'ready' });
      })
      .catch(() => { if (alive) setState({ url: null, status: 'error' }); });
    return () => { alive = false; };
  }, [path]);

  return state;
}

/** Miniatura (grelha) ou pré-visualização (modal) de um print de app desconhecida. */
export default function UnknownAppPhoto({ path, variant = 'thumb' }) {
  const { url, status } = useSignedPhotoUrl(path);
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [url]);
  const thumb = variant === 'thumb';

  if (status === 'loading') {
    return thumb ? (
      <div role="status" aria-label="A carregar a imagem" className="w-16 h-16 rounded-xl border border-[var(--border-glass-strong)] shrink-0 bg-[var(--bg-app)] flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-[var(--border-glass)] border-t-slate-400 rounded-full animate-spin" />
      </div>
    ) : (
      <p role="status" className="text-xs text-[var(--text-3)] py-8 flex items-center gap-2">
        <span className="w-4 h-4 border-2 border-[var(--border-glass)] border-t-slate-400 rounded-full animate-spin inline-block" /> A carregar a imagem…
      </p>
    );
  }
  if (status !== 'ready' || broken) {
    const msg = status === 'missing' ? 'Imagem não disponível no storage.' : 'Não foi possível carregar a imagem.';
    return thumb ? (
      <div title={msg} aria-label={msg} className="w-16 h-16 rounded-xl border border-[var(--border-glass-strong)] shrink-0 bg-[var(--bg-app)] flex items-center justify-center text-[11px] text-[var(--text-3)] text-center leading-tight px-1">
        Sem imagem
      </div>
    ) : (
      <p className="text-xs text-[var(--text-3)] py-8">{msg}</p>
    );
  }
  return thumb ? (
    <img src={url} alt="Screenshot da app" onError={() => setBroken(true)}
      className="w-16 h-16 object-cover rounded-xl border border-[var(--border-glass-strong)] shrink-0 bg-[var(--bg-app)]" />
  ) : (
    <img src={url} alt="Screenshot submetido pelo atleta" onError={() => setBroken(true)} className="max-h-68 object-contain rounded-xl" />
  );
}
