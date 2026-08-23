import React from 'react';
import { AlertCircle, Zap, ShieldAlert, TrendingDown, Info, ShieldCheck, Flame, Activity } from 'lucide-react';

export default function AnalysisAlert({ title, desc, severity = 'info' }) {
  const SEVERITY_CONFIG = {
    critical: { bg: 'bg-rose-100', border: 'border-rose-300', text: 'text-rose-900', icon: ShieldAlert, iconColor: 'text-rose-600' },
    warning: { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-900', icon: AlertCircle, iconColor: 'text-amber-600' },
    info: { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-900', icon: Info, iconColor: 'text-blue-600' },
    success: { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-900', icon: ShieldCheck, iconColor: 'text-emerald-600' }
  };

  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.info;
  const Icon = config.icon;

  return (
    <div className={`mt-2 p-4 rounded-2xl border backdrop-blur-md shadow-sm flex items-start gap-3 ${config.bg} ${config.border}`}>
      <div className="mt-0.5 flex-shrink-0">
        <Icon className={`w-5 h-5 ${config.iconColor}`} />
      </div>
      <div>
        <h4 className={`text-sm font-bold mb-0.5 ${config.text}`}>{title}</h4>
        <p className={`text-[13px] font-medium leading-snug opacity-90 ${config.text}`}>
          {desc}
        </p>
      </div>
    </div>
  );
}
