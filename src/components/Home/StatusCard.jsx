import React from 'react';
import { Camera } from 'lucide-react';
import GlassCard from '../shared/GlassCard';
import { Orbit, OrbitLegend } from '../shared/Orbit';
import { useIntroAnimation } from '../../utils/introAnimations';

/* "Como estou" — a órbita de nutrição do dia, só leitura (mock "Início").
   O registo de água saiu daqui para o FAB. `empty` é o primeiro dia: anéis
   tracejados e o convite a registar a primeira refeição. */
export default function StatusCard({ rings, empty = false, onRegisterMeal }) {
  /* Ponto 9: anéis a desenharem-se e valores a contar — à primeira entrada
     da sessão e mais nenhuma (`introAnimations.js`). */
  const intro = useIntroAnimation('home-orbit');

  if (empty) {
    return (
      <div className="flex flex-col items-center text-center rounded-[24px]" style={{ background: 'rgba(255,255,255,.04)', border: '1px dashed rgba(255,255,255,.18)', padding: '22px 18px' }} data-testid="status-card-empty">
        <Orbit empty size={104} />
        <p className="text-[12.5px] leading-[1.55] mt-3.5 max-w-[250px]" style={{ color: 'var(--text-4)' }}>
          Os anéis enchem-se com o teu primeiro registo. Uma refeição chega para eu perceber como comes.
        </p>
        <button type="button" onClick={onRegisterMeal} className="inline-flex items-center gap-2 min-h-[44px] mt-3.5 px-[18px] rounded-[12px] text-[12.5px] font-extrabold" style={{ background: 'rgba(199,125,255,.14)', border: '1px solid rgba(199,125,255,.4)', color: 'var(--nutrition)' }}>
          <Camera size={15} /> Registar refeição
        </button>
      </div>
    );
  }
  return (
    <GlassCard padding="14px 16px" className="flex items-center gap-4" data-testid="status-card">
      <div className="flex items-center gap-4">
        <div className="shrink-0" style={{ width: 116, height: 116 }}><Orbit rings={rings} size={116} animate={intro} /></div>
        <OrbitLegend rings={rings} animate={intro} />
      </div>
    </GlassCard>
  );
}
