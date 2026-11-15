import { describe, it, expect } from 'vitest';
import { storageRefusalText, storageRefusalError, STORAGE_TOO_LARGE_TEXT, STORAGE_BAD_TYPE_TEXT } from './storageErrors';
import { isNoRetryError } from './saveFailure';

describe('storageErrors — o bucket a recusar tamanho ou tipo', () => {
  it('passa a recusa do Storage a uma frase', () => {
    expect(storageRefusalText({ statusCode: '413', message: 'The object exceeded the maximum allowed size' })).toBe(STORAGE_TOO_LARGE_TEXT);
    expect(storageRefusalText({ message: 'The object exceeded the maximum allowed size' })).toBe(STORAGE_TOO_LARGE_TEXT);
    expect(storageRefusalText({ statusCode: '415', message: 'mime type application/pdf is not supported' })).toBe(STORAGE_BAD_TYPE_TEXT);
    expect(storageRefusalText({ message: 'new row violates row-level security policy' })).toBeNull();
    expect(storageRefusalText(null)).toBeNull();
  });

  it('o erro lançado leva a frase e é final (sem «Tentar de novo»); outro erro passa como veio', () => {
    const err = storageRefusalError({ statusCode: '413', message: 'Payload too large' });
    expect(err.message).toBe(STORAGE_TOO_LARGE_TEXT);
    expect(isNoRetryError(err)).toBe(true);
    const other = { message: 'RLS' };
    expect(storageRefusalError(other)).toBe(other);
  });
});
