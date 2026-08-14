import React, { useState } from 'react';
import Button from '../shared/Button';
import { buttonsData } from './buttonsData';

export default function ButtonShowcase() {
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--page-bg)] p-6 text-white pb-24 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* Section 1: Proposal */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-3">Design System: Botões</h1>
          <p className="text-slate-400 mb-6">
            Proposta de unificação para os ~140 estilos únicos de botões encontrados na aplicação.
          </p>
          
          <div className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-950/50 border-b border-neutral-800">
                  <th className="p-4 font-semibold text-slate-300">Categoria / Propósito</th>
                  <th className="p-4 font-semibold text-slate-300">Exemplos Antigos (Atuais)</th>
                  <th className="p-4 font-semibold text-[var(--accent)]">Novo &lt;Button&gt; Proposto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {/* Primary */}
                <tr>
                  <td className="p-4 align-top">
                    <div className="font-medium text-slate-200">Ação Principal (Primary)</div>
                    <div className="text-xs text-slate-500 mt-1">Guardar, submeter, iniciar treino.</div>
                  </td>
                  <td className="p-4 align-top space-y-3">
                    <button className="tap-h-44 bg-[var(--accent)] text-neutral-950 font-bold text-xs rounded-xl px-4 flex items-center justify-center">Guardar Alterações</button>
                    <button className="bg-[#c6f432] text-black font-bold py-3 rounded-2xl w-full text-center">Começar Treino</button>
                  </td>
                  <td className="p-4 align-top space-y-3 border-l border-neutral-800/50">
                    <Button variant="primary" size="md">Guardar Alterações</Button>
                    <Button variant="primary" size="lg" className="w-full">Começar Treino</Button>
                  </td>
                </tr>

                {/* Secondary */}
                <tr>
                  <td className="p-4 align-top">
                    <div className="font-medium text-slate-200">Ação Secundária (Secondary)</div>
                    <div className="text-xs text-slate-500 mt-1">Cancelar, voltar, fechar modais.</div>
                  </td>
                  <td className="p-4 align-top space-y-3">
                    <button className="flex-1 bg-neutral-800 text-slate-300 font-bold py-3 rounded-2xl px-4">Cancelar</button>
                  </td>
                  <td className="p-4 align-top space-y-3 border-l border-neutral-800/50">
                    <Button variant="secondary" size="lg" className="w-full">Cancelar</Button>
                  </td>
                </tr>

                {/* Outline */}
                <tr>
                  <td className="p-4 align-top">
                    <div className="font-medium text-slate-200">Contorno (Outline)</div>
                    <div className="text-xs text-slate-500 mt-1">Seleções ou alternativas menos destrutivas.</div>
                  </td>
                  <td className="p-4 align-top space-y-3">
                    <button className="border border-neutral-700 text-white py-3 px-4 rounded-xl">Selecionar Plano</button>
                  </td>
                  <td className="p-4 align-top space-y-3 border-l border-neutral-800/50">
                    <Button variant="outline" size="md">Selecionar Plano</Button>
                  </td>
                </tr>

                {/* Ghost / Text */}
                <tr>
                  <td className="p-4 align-top">
                    <div className="font-medium text-slate-200">Fantasma (Ghost / Text)</div>
                    <div className="text-xs text-slate-500 mt-1">Ações subtis como limpar filtros, "Esqueci a password".</div>
                  </td>
                  <td className="p-4 align-top space-y-3">
                    <button className="text-slate-400 text-sm hover:text-slate-200">Limpar tudo</button>
                  </td>
                  <td className="p-4 align-top space-y-3 border-l border-neutral-800/50">
                    <Button variant="ghost" size="sm">Limpar tudo</Button>
                  </td>
                </tr>

                {/* Danger */}
                <tr>
                  <td className="p-4 align-top">
                    <div className="font-medium text-slate-200">Destrutivo (Danger)</div>
                    <div className="text-xs text-slate-500 mt-1">Remover dados (Apagar Conta, Eliminar Treino).</div>
                  </td>
                  <td className="p-4 align-top space-y-3">
                    <button className="bg-red-500/10 text-red-500 font-bold py-3 rounded-2xl px-4">Eliminar Conta</button>
                  </td>
                  <td className="p-4 align-top space-y-3 border-l border-neutral-800/50">
                    <Button variant="danger" size="md">Eliminar Conta</Button>
                  </td>
                </tr>

                {/* Icon */}
                <tr>
                  <td className="p-4 align-top">
                    <div className="font-medium text-slate-200">Apenas Ícone (Icon)</div>
                    <div className="text-xs text-slate-500 mt-1">Navegação (voltar trás), setas de calendário.</div>
                  </td>
                  <td className="p-4 align-top flex gap-3">
                    <button className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-800 text-white">X</button>
                    <button className="tap-44 text-slate-400 hover:text-slate-200">&lt;</button>
                  </td>
                  <td className="p-4 align-top border-l border-neutral-800/50 flex gap-3">
                    <Button variant="secondary" size="icon">X</Button>
                    <Button variant="ghost" size="icon">&lt;</Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: All Extracted Buttons */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Lista Completa de Estilos Atuais ({buttonsData.length})</h2>
              <p className="text-slate-400 text-sm">Este é o levantamento integral de todos os estilos de botões que estão espalhados pela app.</p>
            </div>
          </div>

          <div className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-neutral-950 z-10 border-b border-neutral-800 shadow-sm">
                  <tr>
                    <th className="p-3 font-semibold text-slate-300">Renderização Visual</th>
                    <th className="p-3 font-semibold text-slate-300">Classes Tailwind Existentes</th>
                    <th className="p-3 font-semibold text-slate-300">Ocorrências</th>
                    <th className="p-3 font-semibold text-slate-300">Ficheiros</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {buttonsData.map((btn, idx) => (
                    <tr key={idx} className="hover:bg-neutral-800/30">
                      <td className="p-4 align-middle min-w-[200px]">
                        {/* We use standard HTML button here so it picks up the Tailwind classes directly */}
                        <button className={btn.className || ''}>
                          {btn.sampleText || 'Button'}
                        </button>
                      </td>
                      <td className="p-4 align-middle">
                        <code className="text-xs text-[var(--accent)] break-all font-mono">
                          {btn.className || '[Sem classes / Dinâmicas]'}
                        </code>
                      </td>
                      <td className="p-4 align-middle text-slate-300 font-medium text-center">
                        {btn.count}
                      </td>
                      <td className="p-4 align-middle text-xs text-slate-500 max-w-xs truncate">
                        {btn.files.map((f, i) => (
                          <div key={i} className="truncate" title={f}>{f}</div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
