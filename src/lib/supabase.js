import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://roxfzsiciizkevopgpnl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJveGZ6c2ljaWl6a2V2b3BncG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNjg0NDksImV4cCI6MjA5ODg0NDQ0OX0.bS7FyzDIqj4Aov18OXw6SsJrx1hT1DxYQfzmeHHH7bw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
      console.error(`[EdgeFunction:${fnName}] Erro na execução:`, error);
      return { data: null, error: error.message || 'Erro ao processar o pedido no servidor.' };
    }
    return { data, error: null };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      console.warn(`[EdgeFunction:${fnName}] Tempo limite excedido (${timeoutMs}ms).`);
      return { data: null, error: 'A operação demorou demasiado tempo a responder (timeout). Por favor, tente novamente.' };
    }
    console.error(`[EdgeFunction:${fnName}] Exceção não tratada:`, err);
    return { data: null, error: err.message || 'Falha de rede ou de comunicação com o servidor.' };
  }
}
