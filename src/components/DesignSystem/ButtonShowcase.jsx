import React, { useState } from 'react';
import Button from '../shared/Button';

export default function ButtonShowcase() {
  const [activeCategory, setActiveCategory] = useState('typography');

  return (
    <div className="min-h-screen bg-[var(--page-bg)] p-6 text-slate-100 pb-24 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-white">Auditoria UI & Design System</h1>
          <p className="text-slate-400">
            Comparativo visual de todas as fontes, caixas de texto e botões encontrados na app. 
            Usa as abas abaixo para navegar e decidir quais devem ser os estilos padrão.
          </p>
        </div>

        <div className="flex gap-2 p-1.5 bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
          {['typography', 'inputs', 'buttons'].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-1 py-2.5 rounded-xl font-bold text-sm capitalize transition-all duration-300 ${
                activeCategory === cat ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {activeCategory === 'typography' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">Tipografia & Títulos (Discrepâncias Encontradas)</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
                <span className="text-[10px] text-slate-500 font-mono mb-2 block">text-3xl font-bold text-white (App.jsx, Home.jsx)</span>
                <h1 className="text-3xl font-bold text-white">Título Principal H1</h1>
              </div>
              <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
                <span className="text-[10px] text-slate-500 font-mono mb-2 block">text-2xl font-bold text-slate-800 (Dashboard.jsx)</span>
                <h2 className="text-2xl font-bold text-slate-800">Subtítulo H2 (Legado text-slate-800)</h2>
              </div>
              <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
                <span className="text-[10px] text-slate-500 font-mono mb-2 block">text-xl font-bold text-slate-800 (RunDashboard.jsx)</span>
                <h2 className="text-xl font-bold text-slate-800">Subtítulo H2 Menor</h2>
              </div>
              <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
                <span className="text-[10px] text-slate-500 font-mono mb-2 block">text-sm font-semibold text-slate-800 (Cards)</span>
                <h2 className="text-sm font-semibold text-slate-800">Cabeçalho de Cartão (text-sm)</h2>
              </div>
              <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
                <span className="text-[10px] text-slate-500 font-mono mb-2 block">text-xs font-bold text-slate-500 (Labels de Registo)</span>
                <label className="text-xs font-bold text-slate-500">Label de Formulário (text-xs)</label>
              </div>
              <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
                <span className="text-[10px] text-slate-500 font-mono mb-2 block">text-[11px] font-semibold text-slate-500 (Labels de BI)</span>
                <label className="text-[11px] font-semibold text-slate-500">Label Pequena (11px)</label>
              </div>
            </div>
            
            <div className="bg-slate-900/50 border border-slate-700 p-5 rounded-2xl mt-6">
              <h3 className="font-bold text-[var(--accent)] mb-2">Sugestão de Padronização:</h3>
              <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
                <li>H1: <code className="text-[11px] bg-black/30 px-1 rounded">text-3xl font-bold text-white</code></li>
                <li>H2 (Páginas): <code className="text-[11px] bg-black/30 px-1 rounded">text-2xl font-bold text-white</code></li>
                <li>Labels (Formulários): <code className="text-[11px] bg-black/30 px-1 rounded">text-xs font-bold text-slate-400 uppercase tracking-wider</code></li>
              </ul>
            </div>
          </div>
        )}

        {activeCategory === 'inputs' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">Caixas de Texto e Selects</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
                <span className="text-[10px] text-slate-500 font-mono mb-2 block">w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm (RunRegistration.jsx)</span>
                <input placeholder="Exemplo de Input Legado" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--mod-corrida-to)]" />
              </div>
              <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
                <span className="text-[10px] text-slate-500 font-mono mb-2 block">w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm (Coach.jsx)</span>
                <input placeholder="Input Menor (py-2 px-3)" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none" />
              </div>
              <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
                <span className="text-[10px] text-slate-500 font-mono mb-2 block">w-full bg-slate-50 border-b-2 border-slate-200 px-4 py-3 text-lg font-bold (Legacy Title Input)</span>
                <input placeholder="Input de Título sem borderRadius" className="w-full bg-slate-50 border-b-2 border-slate-200 px-4 py-3 text-lg font-bold text-slate-800 placeholder:text-slate-300 focus:outline-none" />
              </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-700 p-5 rounded-2xl mt-6">
              <h3 className="font-bold text-[var(--accent)] mb-2">Sugestão de Padronização (Dark Glass):</h3>
              <span className="text-[10px] text-slate-500 font-mono mb-2 block">w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:ring-2 focus:ring-[var(--accent)]</span>
              <input placeholder="Input Glass Premium" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
          </div>
        )}

        {activeCategory === 'buttons' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">Botões e CTAs</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
                <span className="text-[10px] text-slate-500 font-mono mb-2 block">w-full bg-[var(--mod-corrida-to)] text-white font-bold py-3 rounded-2xl (RunRegistration.jsx)</span>
                <button className="w-full bg-[var(--mod-corrida-to)] text-white font-bold py-3 rounded-2xl active:scale-95 transition-transform">Botão Primário Módulo</button>
              </div>
              <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
                <span className="text-[10px] text-slate-500 font-mono mb-2 block">flex-1 bg-white border border-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl (Modals)</span>
                <button className="w-full bg-white border border-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl active:scale-95 transition-transform">Botão Cancelar (Legado Light)</button>
              </div>
              <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
                <span className="text-[10px] text-slate-500 font-mono mb-2 block">w-full text-[13px] py-2.5 rounded-xl font-bold bg-slate-900 text-white (Modals Dark)</span>
                <button className="w-full text-[13px] py-2.5 rounded-xl font-bold bg-slate-900 text-white active:scale-95 transition-transform">Ação Secundária Dark</button>
              </div>
              <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
                <span className="text-[10px] text-slate-500 font-mono mb-2 block">text-[11px] text-slate-500 hover:text-red-500 (Legacy Delete)</span>
                <button className="text-[11px] text-slate-500 hover:text-red-500 flex items-center gap-1 transition">Eliminar Métrica</button>
              </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-700 p-5 rounded-2xl mt-6">
              <h3 className="font-bold text-[var(--accent)] mb-2">Sugestão de Padronização:</h3>
              <p className="text-sm text-slate-300 mb-4">Migrar 100% dos botões acima para usarem o componente universal <code>&lt;Button&gt;</code> que garante o <code>tap-44</code> (área tátil de 44px obrigatória) e padroniza as animações de press.</p>
              
              <div className="space-y-3">
                <Button variant="primary" className="w-full">Padrão Primário (Button variant="primary")</Button>
                <Button variant="secondary" className="w-full">Padrão Secundário (Button variant="secondary")</Button>
                <Button variant="ghost" className="w-full">Ação Ghost / Menor (Button variant="ghost")</Button>
                <Button variant="danger" className="w-full">Ação Destrutiva (Button variant="danger")</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
