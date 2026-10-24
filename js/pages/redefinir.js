import { sb } from '../supabase.js';
import { el, $, ocupado, toast } from '../ui.js';

// O link do e-mail traz a sessão de recuperação na URL (detectSessionInUrl).
const form = el('form', { class: 'card', novalidate: true, onSubmit: async (e) => {
  e.preventDefault();
  const senha = $('#nova').value;
  if (senha.length < 8) return toast('A senha precisa de pelo menos 8 caracteres.', 'erro');
  await ocupado(e.submitter, async () => {
    const { error } = await sb.auth.updateUser({ password: senha });
    if (error) return toast('Esse link venceu. Peça outro em "Esqueci a senha".', 'erro');
    toast('Senha trocada!');
    setTimeout(() => location.replace('cartao.html'), 900);
  });
} },
  el('div', { class: 'field' },
    el('label', { for: 'nova', text: 'Nova senha' }),
    el('input', { id: 'nova', type: 'password', autocomplete: 'new-password', required: true, minlength: 8, placeholder: 'mínimo 8 caracteres' })),
  el('button', { class: 'btn bloco', type: 'submit', text: 'Salvar nova senha' }));

$('#app').replaceChildren(
  el('header', { class: 'top' }, el('div', { class: 'brand' }, el('span', { class: 'kicker', text: 'crochê com Ellen' }), el('h1', { text: 'Nova senha' }))),
  el('main', {}, form, el('p', { class: 'center' }, el('a', { href: 'index.html', text: 'Voltar' }))),
);
