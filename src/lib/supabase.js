import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://roxfzsiciizkevopgpnl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJveGZ6c2ljaWl6a2V2b3BncG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNjg0NDksImV4cCI6MjA5ODg0NDQ0OX0.bS7FyzDIqj4Aov18OXw6SsJrx1hT1DxYQfzmeHHH7bw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Regista um evento em app_logs para auditoria e cálculo de custos de tokens
 */
export async function logAppEvent(level, event, message = null, meta = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;
    await supabase.from('app_logs').insert({
      user_id: userId,
      level,
      event,
      message,
      meta,
    });
  } catch (err) {
    console.warn('[logAppEvent] Falha ao registar log:', err);
  }
}

/**
 * Invoca uma Edge Function do Supabase garantindo um tempo limite (timeoutMs)
 */
export async function invokeEdgeFunctionWithTimeout(fnName, options = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const invokeOptions = {
      ...options,
      signal: controller.signal
    };
    const { data, error } = await supabase.functions.invoke(fnName, invokeOptions);
    clearTimeout(timer);
    
    if (error) {
      let detailedMsg = error.message;
      if (error.context && typeof error.context.json === 'function') {
        try {
          const bodyJson = await error.context.json();
          if (bodyJson?.error) detailedMsg = bodyJson.error;
        } catch (_) {}
      }
      console.error(`[EdgeFunction:${fnName}] Erro na execução:`, detailedMsg, error);
      logAppEvent('error', fnName, detailedMsg || 'Erro na execução', { fnName });
      return { data: null, error: detailedMsg || 'Erro ao processar o pedido no servidor.' };
    }

    if (data?.usage) {
      logAppEvent('success', fnName, null, data.usage);
    }

    return { data, error: null };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      console.warn(`[EdgeFunction:${fnName}] Tempo limite excedido (${timeoutMs}ms).`);
      logAppEvent('error', fnName, 'Timeout excedido', { timeoutMs });
      return { data: null, error: 'A operação demorou demasiado tempo a responder (timeout). Por favor, tente novamente.' };
    }
    console.error(`[EdgeFunction:${fnName}] Exceção não tratada:`, err);
    logAppEvent('error', fnName, err.message || 'Exceção não tratada', { error: String(err) });
    return { data: null, error: err.message || 'Falha de rede ou de comunicação com o servidor.' };
  }
}
