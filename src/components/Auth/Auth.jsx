import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { publicUrl } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

export default function Auth() {
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('Preenche o email e a palavra-passe.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      if (authMode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password
        });
        if (error) throw error;
        setInfoMsg('Conta criada! Se exigido, verifica o teu email para confirmar e depois entra.');
        setAuthMode('signin');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao efetuar autenticação.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao autenticar com o Google.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[var(--page-bg)] text-slate-800 fade-in">
      <div className="card rounded-3xl p-6 max-w-sm w-full shadow-lg border border-[var(--brd-700)] space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2 justify-center mb-1">
          <img src={publicUrl('logo.png')} alt="IronHealth" className="w-10 h-10 rounded-xl object-cover" />
          <h1 className="text-xl font-extrabold" style={{ color: 'var(--green)' }}>IronHealth</h1>
        </div>
        <p className="text-xs text-slate-500 text-center">
          {authMode === 'signin' ? 'Entra na tua conta' : 'Cria a tua conta'}
        </p>

        {/* Info & Error alerts */}
        {infoMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-xs rounded-xl p-3">
            {infoMsg}
          </div>
        )}
        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl p-3">
            {errorMsg}
          </div>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="exemplo@email.com"
              required
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Palavra-passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--accent)]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--accent)] text-slate-950 font-bold text-sm rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-50 shadow-sm"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {authMode === 'signin' ? 'Entrar' : 'Criar Conta'}
          </button>
        </form>

        {/* Divider */}
        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-slate-200"></div>
          <span className="flex-shrink mx-3 text-[10px] text-slate-400 uppercase tracking-wider">ou</span>
          <div className="flex-grow border-t border-slate-200"></div>
        </div>

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full bg-white border border-slate-200 rounded-xl py-2.5 text-xs font-semibold text-slate-700 flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-[0.98] transition shadow-xs"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Entrar com Google
        </button>

        {/* Toggle Mode */}
        <button
          type="button"
          onClick={() => {
            setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
            setErrorMsg(null);
            setInfoMsg(null);
          }}
          className="w-full text-center text-xs text-slate-500 hover:text-slate-700 transition pt-1"
        >
          {authMode === 'signin' ? 'Ainda não tens conta? Criar conta' : 'Já tens conta? Entrar'}
        </button>
      </div>
    </div>
  );
}
