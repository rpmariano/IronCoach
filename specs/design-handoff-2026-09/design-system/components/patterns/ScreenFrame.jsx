import React from 'react';
/** A moldura de todos os ecrãs: fundo, curvas de nível, gradiente ambiente, fade, header e scroll com os paddings certos. */
export function ScreenFrame({ header, children, footer, overlay, scrollPadBottom = 112, ambient = 'default', width = 390, height = 844, radius = 40 }) {
  const amb = { default: 'var(--grad-ambient)', coach: 'radial-gradient(120% 60% at 50% 8%, rgba(34,211,238,.24) 0%, transparent 60%), radial-gradient(130% 55% at 50% 104%, rgba(217,119,6,.16) 0%, transparent 62%)', race: 'radial-gradient(115% 50% at 12% 0%, rgba(217,119,6,.22) 0%, transparent 58%), radial-gradient(130% 60% at 50% 104%, rgba(90,143,163,.16) 0%, transparent 62%)' }[ambient];
  return (
    <div style={{ position: 'relative', width, height, borderRadius: radius, overflow: 'hidden', background: 'var(--bg-app)', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 24px 60px -20px rgba(0,0,0,.7)', fontFamily: 'var(--font-sans)', color: 'var(--text-1)' }}>
      <div style={{ position: 'absolute', inset: 0, background: amb }} />
      <svg viewBox="0 0 390 844" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <g fill="none" stroke="#9ec3d2" strokeOpacity=".14" strokeWidth="1.1"><path d="M20 205 C60 190 110 215 118 255 C126 295 95 325 55 322 C15 319 -8 285 -2 250 C4 222 -8 216 20 205 Z" /><path d="M5 180 C60 158 140 195 148 255 C156 315 105 355 50 350 C-5 345 -35 300 -28 250 C-22 208 -30 195 5 180 Z" /><path d="M-12 155 C55 125 170 175 178 255 C186 335 115 385 45 378 C-25 371 -62 315 -55 250 C-49 195 -50 172 -12 155 Z" /><path d="M-30 128 C50 92 200 155 208 255 C216 355 125 415 40 406 C-45 397 -90 330 -82 250 C-75 182 -72 148 -30 128 Z" /></g>
        <g fill="none" stroke="#fbbf24" strokeOpacity=".13" strokeWidth="1.1"><path d="M320 560 C355 548 392 570 396 600 C400 630 375 652 345 650 C315 648 298 622 302 598 C306 578 296 570 320 560 Z" /><path d="M305 535 C355 515 415 550 420 600 C425 650 385 682 340 678 C295 674 268 636 274 595 C279 560 275 550 305 535 Z" /><path d="M288 508 C352 482 438 528 444 600 C450 672 392 712 335 706 C278 700 240 650 247 592 C253 542 250 528 288 508 Z" /><path d="M270 480 C350 448 462 505 468 600 C474 695 400 745 330 737 C260 729 212 665 220 588 C227 522 224 506 270 480 Z" /></g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--grad-fade)', pointerEvents: 'none' }} />
      {header && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 }}>{header}</div>}
      <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', scrollbarWidth: 'none', padding: `${header ? 85 : 74}px 16px ${scrollPadBottom}px`, display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box' }}>{children}</div>
      {overlay}
      {footer}
    </div>
  );
}
/** Header padrão: logo + wordmark + data, botão Perfil. Duplo clique no logo abre o admin (só isAdmin). */
export function AppHeader({ date = 'domingo, 6 de setembro', onProfile, onLogoDoubleClick }) {
  return (
    <div style={{ background: 'var(--bg-header)', backdropFilter: 'blur(var(--blur-chrome))', WebkitBackdropFilter: 'blur(var(--blur-chrome))', borderBottom: '1px solid var(--border-glass-strong)', boxShadow: '0 6px 18px rgba(0,0,0,.45)', padding: '16px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font-sans)' }}>
      <div onDoubleClick={onLogoDoubleClick} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-cream)' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" /></svg></div>
        <div><div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1, color: 'var(--brand)' }}>IronCoach</div><div style={{ fontSize: 11, lineHeight: 1, color: '#b9c3d1', marginTop: 4 }}>{date}</div></div>
      </div>
      <button onClick={onProfile} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, padding: '0 16px', borderRadius: 9999, background: 'var(--grad-race)', color: 'var(--race-ink)', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> Perfil</button>
    </div>
  );
}
/** Header contextual dos registos e sub-ecrãs: voltar/fechar, eyebrow na cor do módulo, título, ação à direita. */
export function ContextHeader({ eyebrow, title, tone = 'run', onBack, close = false, action }) {
  return (
    <div style={{ background: 'var(--bg-header)', backdropFilter: 'blur(var(--blur-chrome))', borderBottom: '1px solid var(--border-glass-strong)', padding: '16px 16px 12px', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-sans)' }}>
      <button onClick={onBack} aria-label={close ? 'Fechar' : 'Voltar'} style={{ width: 44, height: 44, borderRadius: 14, border: '1px solid var(--border-glass-strong)', background: 'rgba(255,255,255,.06)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>{close ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>}</button>
      <div style={{ flex: 1 }}>{eyebrow && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: `var(--${tone})` }}>{eyebrow}</div>}<div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text-1)', marginTop: eyebrow ? 2 : 0 }}>{title}</div></div>
      {action}
    </div>
  );
}
