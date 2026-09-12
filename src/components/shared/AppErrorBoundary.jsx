import React, { Component } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

/**
 * Rede de segurança de última instância. Antes disto, um erro de render não
 * apanhado em NENHUM sítio da app desmontava a árvore de React inteira —
 * com o fundo escuro da app por trás, isso aparecia ao atleta como um ecrã
 * completamente preto, sem qualquer UI (nem sequer um botão), obrigando a
 * fechar e reabrir a aplicação. Foi assim que se manifestou um bug real
 * (CreatedRecordModal a usar uma variável do store sem a desestruturar —
 * ReferenceError no render, logo a seguir a registar peso/refeição por
 * foto) — ver commit que corrige esse bug.
 *
 * Isto não substitui corrigir a causa: é o que evita que a PRÓXIMA causa
 * ainda não descoberta tenha o mesmo efeito catastrófico. Um erro aqui
 * apanhado mostra um ecrã com a opção de recarregar, em vez de nada.
 */
export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[AppErrorBoundary] Erro não apanhado no render:', error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6" style={{ background: 'var(--bg-app)' }}>
        {/* Ponto 3: erro é vermelho (--danger) do princípio ao fim. O botão
            "Recarregar" estava no gradiente âmbar da prova, com texto branco
            por cima (nem a cor nem o contraste estavam certos). */}
        <div
          className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4"
          style={{ background: 'var(--tint-danger-bg)', border: '1px solid var(--tint-danger-bd)' }}
        >
          <AlertTriangle className="w-7 h-7" style={{ color: 'var(--danger)' }} />
        </div>
        <h1 className="text-base font-bold text-white mb-1">Algo correu mal</h1>
        <p className="text-xs text-[var(--text-3)] max-w-xs leading-relaxed mb-5">
          A app encontrou um erro inesperado. O que já tinhas gravado não é afetado — só é
          preciso recarregar.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="tap-44 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold active:scale-95 transition"
          style={{ background: 'var(--danger)', color: 'var(--danger-ink)' }}
        >
          <RefreshCw size={16} /> Recarregar
        </button>
      </div>
    );
  }
}
