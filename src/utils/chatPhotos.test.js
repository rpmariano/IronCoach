import { describe, it, expect } from 'vitest';
import { MAX_CHAT_PHOTOS, addChatPhotos, photoMarker, toPayloadImages } from './chatPhotos';

const img = (name = 'a.jpg') => ({ name, type: 'image/jpeg' });
const compress = async (f) => ({ dataUrl: `data:image/jpeg;base64,${f.name}`, base64: f.name });

describe('chatPhotos', () => {
  it('photoMarker: a mesma linha que o servidor grava', () => {
    expect(photoMarker(0)).toBe('');
    expect(photoMarker(1)).toBe('\n📷 1 foto enviada');
    expect(photoMarker(3)).toBe('\n📷 3 fotos enviadas');
  });

  it('toPayloadImages: JPEG em base64, no máximo 3', () => {
    const out = toPayloadImages([1, 2, 3, 4].map(n => ({ base64: `b${n}` })));
    expect(out).toEqual([1, 2, 3].map(n => ({ mime_type: 'image/jpeg', data: `b${n}` })));
  });

  it('addChatPhotos: junta até ao máximo e conta o que ficou de fora', async () => {
    const first = await addChatPhotos([], [img('1'), img('2')], compress);
    expect(first.photos).toHaveLength(2);
    expect(first.skipped).toBe(0);
    const second = await addChatPhotos(first.photos, [img('3'), img('4')], compress);
    expect(second.photos).toHaveLength(MAX_CHAT_PHOTOS);
    expect(second.skipped).toBe(1);
  });

  it('addChatPhotos: ficheiros que não são imagens e leituras falhadas contam como ignorados', async () => {
    const bad = async (f) => { if (f.name === 'x') throw new Error('x'); return compress(f); };
    const r = await addChatPhotos([], [img('ok'), img('x'), { name: 'doc.pdf', type: 'application/pdf' }], bad);
    expect(r.photos.map(p => p.base64)).toEqual(['ok']);
    expect(r.skipped).toBe(2);
  });
});
