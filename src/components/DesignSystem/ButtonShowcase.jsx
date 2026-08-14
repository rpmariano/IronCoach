import React from 'react';
import Button from '../shared/Button';

export default function ButtonShowcase() {
  return (
    <div className="min-h-screen bg-[var(--page-bg)] p-6 text-white pb-24 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Levantamento e Uniformização de Botões</h1>
          <p className="text-slate-400">
            Tabela visual das categorias de botões encontradas na aplicação, em comparação com o novo componente padronizado <code>&lt;Button&gt;</code>.
          </p>
        </div>

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
                  <div className="text-xs text-slate-500 mt-1">Usado para guardar, submeter, iniciar treino. Maior ênfase visual.</div>
                  <div className="text-xs font-mono text-slate-600 mt-2">bg-[var(--accent)] text-neutral-950 rounded-xl</div>
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
                  <div className="text-xs text-slate-500 mt-1">Usado para cancelar, voltar, fechar modais ou ações de menor importância.</div>
                  <div className="text-xs font-mono text-slate-600 mt-2">bg-neutral-800 text-slate-200 rounded-xl</div>
                </td>
                <td className="p-4 align-top space-y-3">
                  <button className="flex-1 bg-neutral-800 text-slate-300 font-bold py-3 rounded-2xl">Cancelar</button>
                  <button className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm">Fechar</button>
                </td>
                <td className="p-4 align-top space-y-3 border-l border-neutral-800/50">
                  <Button variant="secondary" size="lg" className="w-full">Cancelar</Button>
                  <Button variant="secondary" size="md">Fechar</Button>
                </td>
              </tr>

              {/* Outline */}
              <tr>
                <td className="p-4 align-top">
                  <div className="font-medium text-slate-200">Contorno (Outline)</div>
                  <div className="text-xs text-slate-500 mt-1">Usado para seleções ou alternativas menos destrutivas.</div>
                  <div className="text-xs font-mono text-slate-600 mt-2">border border-neutral-700</div>
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
                  <div className="text-xs text-slate-500 mt-1">Ações subtis como limpar filtros, "Esqueci a password" ou pequenos links.</div>
                  <div className="text-xs font-mono text-slate-600 mt-2">text-slate-400 hover:text-white</div>
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
                  <div className="text-xs text-slate-500 mt-1">Ações que removem dados (Apagar Conta, Eliminar Treino).</div>
                  <div className="text-xs font-mono text-slate-600 mt-2">bg-red-500/10 text-red-500</div>
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
                  <div className="text-xs text-slate-500 mt-1">Navegação (voltar trás), setas de calendário, edição rápida.</div>
                  <div className="text-xs font-mono text-slate-600 mt-2">w-9 h-9 rounded-full</div>
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
    </div>
  );
}
