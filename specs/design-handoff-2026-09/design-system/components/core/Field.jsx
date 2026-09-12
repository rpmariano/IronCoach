import React from 'react';
/** Campo de formulário. Label por cima a 11.5px, caixa de 48px, foco na cor do contexto. */
export function Field({ label, value, placeholder, tone = 'coach', multiline = false, focused = false, hint, style, onChange }) {
  const bd = focused ? `1.5px solid var(--tint-${tone}-bd)` : value ? '1px solid rgba(255,255,255,.13)' : '1px dashed rgba(255,255,255,.16)';
  const El = multiline ? 'textarea' : 'input';
  return (
    <label style={{ display: 'block', fontFamily: 'var(--font-sans)', ...style }}>
      {label && <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-4)', marginBottom: 7 }}>{label}</div>}
      <El value={value} placeholder={placeholder} onChange={e => onChange && onChange(e.target.value)} rows={multiline ? 3 : undefined}
        style={{ width: '100%', boxSizing: 'border-box', minHeight: multiline ? 76 : 48, padding: multiline ? '13px 14px' : '0 14px', borderRadius: 'var(--radius-md)',
          background: value ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.04)', border: bd, outline: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: value ? 700 : 500,
          color: 'var(--text-1)', resize: 'none' }} />
      {hint && <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--text-placeholder)', marginTop: 8 }}>{hint}</div>}
    </label>
  );
}
