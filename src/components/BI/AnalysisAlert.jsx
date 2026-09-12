import React from 'react';
import { AlertCircle, ShieldAlert, Info, ShieldCheck } from 'lucide-react';
import Warning from '../shared/Warning';

/* Ponto 3 do redesenho ("cor com significado"): o aviso era âmbar
   (bg-amber-100/text-amber-900) — o âmbar é da prova. Passa pelo Warning
   coral; o crítico é vermelho, o bom é verde e o informativo é o ciano da
   Carol (era azul genérico, que não é nenhum dos oito significados). */
const SEVERITY_TONE = {
  critical: { tone: 'danger', Icon: ShieldAlert },
  warning: { tone: 'warn', Icon: AlertCircle },
  info: { tone: 'coach', Icon: Info },
  success: { tone: 'ok', Icon: ShieldCheck },
};

export default function AnalysisAlert({ title, desc, severity = 'info' }) {
  const config = SEVERITY_TONE[severity] || SEVERITY_TONE.info;
  const { Icon } = config;

  return (
    <Warning
      tone={config.tone}
      title={title}
      icon={<Icon size={14} />}
      className="mt-2"
    >
      {desc}
    </Warning>
  );
}
