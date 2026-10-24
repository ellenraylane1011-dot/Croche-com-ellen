import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Modo demonstração: só em localhost e só com ?demo=1. Em qualquer outro endereço é ignorado.
const emLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);
const params = new URLSearchParams(location.search);
if (emLocalhost && params.get('demo') === '1') sessionStorage.setItem('ellen.demo', '1');
if (params.get('demo') === '0') sessionStorage.removeItem('ellen.demo');
export const modoDemo = emLocalhost && sessionStorage.getItem('ellen.demo') === '1';

export let sb;
if (modoDemo) {
  // js/demo/ não existe no deploy: se faltar (ou der erro), cai no Supabase de verdade.
  try {
    const { criarClienteDemo } = await import('./demo/mock.js');
    const { mostrarFaixa } = await import('./demo/faixa.js');
    sb = criarClienteDemo();
    mostrarFaixa();
  } catch { sb = undefined; }
}
if (!sb) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

export async function getSettings() {
  const { data } = await sb.from('settings').select('chave,valor');
  return Object.fromEntries((data ?? []).map((r) => [r.chave, r.valor]));
}

export function fotoUrl(path) {
  return path ? sb.storage.from('produtos').getPublicUrl(path).data.publicUrl : null;
}
