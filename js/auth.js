import { sb } from './supabase.js';

// `raiz` = '' nas páginas da cliente e '../' nas páginas de /admin.
export async function exigirUsuario(raiz = '') {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    const alvo = location.pathname.split('/').pop();
    const volta = raiz === '' && ['cartao.html', 'mostruario.html', 'conta.html'].includes(alvo) ? `?next=${alvo}` : '';
    location.replace(`${raiz}index.html${volta}`);
    return new Promise(() => {});            // interrompe o resto da página
  }
  const { data: perfil } = await sb.from('profiles').select('id,nome,whatsapp,aceita_promocoes').eq('id', session.user.id).maybeSingle();
  return { user: session.user, perfil };
}

// Esconder o link não protege nada: quem protege são as regras do banco (eh_admin).
// Aqui só mandamos quem não é admin de volta para o cartão.
export async function exigirAdmin() {
  const ctx = await exigirUsuario('../');
  const { data: eAdmin } = await sb.rpc('eh_admin');
  if (!eAdmin) { location.replace('../cartao.html'); return new Promise(() => {}); }
  return ctx;
}

export async function sair(raiz = '') {
  await sb.auth.signOut();
  location.replace(`${raiz}index.html`);
}
