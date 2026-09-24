import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startAppUpdateWatcher, isBusy, freshUrl, fetchPublishedBuild, stripVersionParam, resumeParams, entryTabFromSearch, stripResumeParam } from './appUpdate';

/* A app recarrega-se sozinha depois de um deploy, mas só quando isso não
   deita nada fora. Aqui: quando recarrega, quando espera, e que nunca entra
   em ciclo. */

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

function setup(over = {}) {
  let t = 1_000_000;
  const reload = vi.fn();
  const opts = {
    build: 'aaa',
    storage: memoryStorage(),
    fetchBuild: vi.fn().mockResolvedValue('bbb'),
    reload,
    now: () => t,
    busy: () => false,
    ...over,
  };
  const stop = startAppUpdateWatcher(opts);
  return { stop, reload, opts, advance: (ms) => { t += ms; } };
}

const setHidden = (v) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => v });

describe('startAppUpdateWatcher', () => {
  beforeEach(() => setHidden(false));
  afterEach(() => { setHidden(false); document.body.innerHTML = ''; });

  it('ao abrir com uma versão nova publicada, recarrega para ela', async () => {
    const { stop, reload } = setup();
    await stop.ready;
    expect(reload).toHaveBeenCalledWith('bbb');
    stop();
  });

  it('com a mesma versão, não faz nada', async () => {
    const { stop, reload } = setup({ fetchBuild: vi.fn().mockResolvedValue('aaa') });
    await stop.ready;
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it('sem rede (null), não faz nada', async () => {
    const { stop, reload } = setup({ fetchBuild: vi.fn().mockResolvedValue(null) });
    await stop.ready;
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it('sem id de build (desenvolvimento), nem sequer pergunta', async () => {
    const fetchBuild = vi.fn();
    const { stop } = setup({ build: '', fetchBuild });
    await stop.ready;
    expect(fetchBuild).not.toHaveBeenCalled();
    stop();
  });

  it('com algo a meio, espera; ao voltar à app já livre, recarrega', async () => {
    let busy = true;
    const { stop, reload, advance } = setup({ busy: () => busy });
    await stop.ready;
    expect(reload).not.toHaveBeenCalled();

    busy = false;
    advance(5 * 60 * 1000);
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(reload).toHaveBeenCalledWith('bbb'));
    stop();
  });

  it('só tenta uma vez por versão — se a recarga trouxer a antiga, não entra em ciclo', async () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    await first.stop.ready;
    expect(first.reload).toHaveBeenCalledTimes(1);
    first.stop();

    // A "nova" página ainda é a antiga (CDN atrasado): mesmo storage de sessão.
    const second = setup({ storage });
    await second.stop.ready;
    expect(second.reload).not.toHaveBeenCalled();
    second.stop();
  });

  it('com a app escondida, não pergunta nem recarrega', async () => {
    setHidden(true);
    const fetchBuild = vi.fn().mockResolvedValue('bbb');
    const { stop, reload } = setup({ fetchBuild });
    await stop.ready;
    expect(fetchBuild).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    stop();
  });
});

describe('isBusy', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('uma folha ou modal aberta conta como ocupado', () => {
    document.body.innerHTML = '<div role="dialog"></div>';
    expect(isBusy(document)).toBe(true);
  });

  it('uma mensagem escrita por enviar conta como ocupado', () => {
    document.body.innerHTML = '<textarea></textarea>';
    document.querySelector('textarea').value = 'Olá Carol';
    expect(isBusy(document)).toBe(true);
  });

  it('um campo com o foco conta como ocupado', () => {
    document.body.innerHTML = '<input type="number">';
    document.querySelector('input').focus();
    expect(isBusy(document)).toBe(true);
  });

  it('o arranque a meio conta como ocupado', () => {
    document.body.innerHTML = '<div data-testid="onboarding"></div>';
    expect(isBusy(document)).toBe(true);
  });

  it('o Início parado não está ocupado', () => {
    document.body.innerHTML = '<main><button>Registar</button><textarea></textarea></main>';
    expect(isBusy(document)).toBe(false);
  });
});

describe('URLs', () => {
  it('freshUrl junta ?v= sem perder o ?tab=', () => {
    expect(freshUrl('https://x.io/IronCoach/?tab=coach', 'bbb')).toBe('https://x.io/IronCoach/?tab=coach&v=bbb');
  });

  it('stripVersionParam tira só o ?v=', () => {
    const replaceState = vi.fn();
    stripVersionParam({ location: { href: 'https://x.io/IronCoach/?tab=coach&v=bbb' }, history: { state: null, replaceState } });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/IronCoach/?tab=coach');
  });

  it('fetchPublishedBuild pede sem cache e lê o id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ build: 'bbb' }) });
    await expect(fetchPublishedBuild(fetchImpl, '/IronCoach/')).resolves.toBe('bbb');
    expect(fetchImpl.mock.calls[0][0]).toMatch(/^\/IronCoach\/version\.json\?t=\d+$/);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
  });

  it('fetchPublishedBuild devolve null num 404 ou erro de rede', async () => {
    await expect(fetchPublishedBuild(vi.fn().mockResolvedValue({ ok: false }), '/')).resolves.toBeNull();
    await expect(fetchPublishedBuild(vi.fn().mockRejectedValue(new Error('offline')), '/')).resolves.toBeNull();
  });
});

describe('recarga técnica — volta ao separador onde se estava', () => {
  // Relatado 2026-09-24: "a app reinicia quando mudamos de menu" — a recarga
  // caía sempre no Início. Com ?resume=, não ?tab=: esse é o da notificação,
  // e saltava as boas-vindas da Carol (revisão pré-deploy de 639c495).
  it('freshUrl põe o ?resume= e tira o ?tab= e o ?carol= de uma notificação antiga', () => {
    expect(freshUrl('https://x.io/IronCoach/', 'bbb', resumeParams('coach', true, true))).toBe('https://x.io/IronCoach/?resume=coach&v=bbb');
    expect(freshUrl('https://x.io/IronCoach/?tab=coach&carol=k1&demo=true', 'bbb', resumeParams('home', true, true)))
      .toBe('https://x.io/IronCoach/?demo=true&resume=home&v=bbb');
  });

  it('antes de as boas-vindas estarem decididas, o ?tab= da notificação fica (e continua a saltá-las)', () => {
    // A app abriu a frio por uma notificação; o ecrã do Coach falhou a
    // carregar antes de as boas-vindas se decidirem.
    expect(resumeParams('coach', true, false)).toEqual({ resume: 'coach' });
    expect(freshUrl('https://x.io/IronCoach/?tab=coach', 'bbb', resumeParams('coach', true, false)))
      .toBe('https://x.io/IronCoach/?tab=coach&resume=coach&v=bbb');
  });

  it('antes de o App aplicar o separador de entrada, o URL fica como está', () => {
    // O vigia pode recarregar logo no arranque, com a store ainda em 'home'.
    expect(resumeParams('home', false)).toEqual({});
    expect(freshUrl('https://x.io/IronCoach/?tab=coach&carol=k1', 'bbb', resumeParams('home', false)))
      .toBe('https://x.io/IronCoach/?tab=coach&carol=k1&v=bbb');
  });

  it('resumeParams: todos os separadores, o Início incluído; as bancadas não', () => {
    expect(resumeParams('provas', true, true)).toEqual({ resume: 'provas', tab: null, carol: null });
    expect(resumeParams('home', true, true)).toEqual({ resume: 'home', tab: null, carol: null });
    expect(resumeParams('design-system', true, true)).toEqual({});
    expect(resumeParams(null, true, true)).toEqual({});
  });

  it('entryTabFromSearch: a recarga técnica ganha ao ?tab= antigo; sem nada, null', () => {
    expect(entryTabFromSearch('?resume=perfil')).toBe('perfil');
    expect(entryTabFromSearch('?tab=coach&resume=perfil')).toBe('perfil');
    expect(entryTabFromSearch('?tab=coach')).toBe('coach');
    expect(entryTabFromSearch('?demo=true')).toBeNull();
  });

  it('stripResumeParam tira só o ?resume=', () => {
    const replaceState = vi.fn();
    const win = { location: { href: 'https://x.io/IronCoach/?demo=true&resume=coach' }, history: { state: null, replaceState } };
    stripResumeParam(win);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/IronCoach/?demo=true');
  });
});
