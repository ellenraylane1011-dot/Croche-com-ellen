import { sb } from '../supabase.js';
import { el, $, ocupado, toast, whatsappBR, soDigitos, pronto } from '../ui.js';

const TERMOS_VERSAO = '2026-10';
const NEXT_OK = ['cartao.html', 'mostruario.html', 'conta.html'];      // lista fechada: sem redirecionamento aberto
let modo = 'entrar';

const proximo = () => {
  const n = new URLSearchParams(location.search).get('next');
  return NEXT_OK.includes(n) ? n : 'cartao.html';
};

async function depoisDoLogin() {
  const { data: eAdmin } = await sb.rpc('eh_admin');
  location.replace(eAdmin ? 'admin/index.html' : proximo());
}

const { data: { session } } = await sb.auth.getSession();
if (session) await depoisDoLogin();
else desenhar();

function campo(id, rotulo, atributos) {
  return el('div', { class: 'field' }, el('label', { for: id, text: rotulo }), el('input', { id, ...atributos }));
}

function desenhar(aviso = null) {
  const cadastro = modo === 'criar';
  const msg = el('div', { id: 'aviso', 'aria-live': 'polite' }, aviso ? el('div', { class: 'aviso' + (aviso.erro ? ' erro' : ''), text: aviso.texto }) : null);

  const form = el('form', { class: 'card', novalidate: true, onSubmit: (e) => { e.preventDefault(); enviar(e.submitter); } },
    cadastro ? campo('nome', 'Seu nome', { type: 'text', autocomplete: 'name', required: true, maxlength: 80, placeholder: 'Maria da Silva' }) : null,
    cadastro ? campo('zap', 'WhatsApp', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', required: true, placeholder: '(89) 9 0000-0000' }) : null,
    campo('email', 'E-mail', { type: 'email', autocomplete: 'email', required: true, placeholder: 'voce@email.com' }),
    campo('senha', 'Senha', { type: 'password', autocomplete: cadastro ? 'new-password' : 'current-password', required: true, minlength: 8, placeholder: 'mínimo 8 caracteres' }),
    cadastro ? el('label', { class: 'check' }, el('input', { id: 'termos', type: 'checkbox', required: true }),
      el('span', {}, 'Li e aceito a ', el('a', { href: 'termos.html', target: '_blank', rel: 'noopener', text: 'política de privacidade' }), '.')) : null,
    cadastro ? el('label', { class: 'check' }, el('input', { id: 'promo', type: 'checkbox' }),
      el('span', { text: 'Quero receber novidades e promoções no WhatsApp (opcional).' })) : null,
    el('button', { class: 'btn bloco', type: 'submit', text: cadastro ? 'Criar meu cartão' : 'Entrar no meu cartão' }),
    cadastro ? null : el('button', { class: 'btn sec bloco', type: 'button', text: 'Esqueci a senha', onClick: (e) => esqueci(e.currentTarget) }),
    msg,
  );

  pronto();
  $('#app').replaceChildren(
    el('header', { class: 'top' }, el('div', { class: 'brand' }, el('span', { class: 'kicker', text: 'crochê com' }), el('h1', { text: 'Ellen' }))),
    el('main', {},
      el('div', { class: 'center' },
        el('img', { class: 'mascot grande', src: 'img/gatinho.gif', alt: 'Gatinho laranja brincando com uma bola de lã', width: 150, height: 130 }),
        el('p', { class: 'muda', text: 'Seu cartão fidelidade, feito com amor.' })),
      el('div', { class: 'abas', role: 'group', 'aria-label': 'Entrar ou criar conta' },
        el('button', { type: 'button', 'aria-pressed': String(!cadastro), text: 'Entrar', onClick: () => { modo = 'entrar'; desenhar(); } }),
        el('button', { type: 'button', 'aria-pressed': String(cadastro), text: 'Criar conta', onClick: () => { modo = 'criar'; desenhar(); } })),
      form,
      el('p', { class: 'muda pequeno center', text: 'Usamos seus dados só para guardar seu cartão e combinar entregas. Você pode apagar sua conta quando quiser.' }),
      el('p', { class: 'center' }, el('a', { href: 'mostruario.html', text: 'Ver o mostruário sem entrar' }))),
  );
}

async function enviar(btn) {
  const email = $('#email').value.trim();
  const senha = $('#senha').value;
  await ocupado(btn, async () => {
    if (modo === 'entrar') {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) {
        return desenhar({ erro: true, texto: error.code === 'email_not_confirmed'
          ? 'Confirme seu e-mail primeiro: enviamos um link para você.' : 'E-mail ou senha incorretos.' });
      }
      return depoisDoLogin();
    }
    const nome = $('#nome').value.trim();
    const whatsapp = whatsappBR($('#zap').value);
    if (nome.length < 2) return toast('Escreva seu nome.', 'erro');
    if (soDigitos(whatsapp).length < 12) return toast('Confira o WhatsApp, com DDD.', 'erro');
    if (senha.length < 8) return toast('A senha precisa de pelo menos 8 caracteres.', 'erro');
    if (!$('#termos').checked) return toast('Aceite a política de privacidade para continuar.', 'erro');
    const { data, error } = await sb.auth.signUp({
      email, password: senha,
      options: {
        data: { nome, whatsapp, aceitou_termos: true, termos_versao: TERMOS_VERSAO, aceita_promocoes: $('#promo').checked },
        emailRedirectTo: new URL('cartao.html', location.href).href,
      },
    });
    if (error) return desenhar({ erro: true, texto: 'Não foi possível criar a conta. Confira os dados ou tente entrar.' });
    if (data.session) return depoisDoLogin();
    modo = 'entrar';
    desenhar({ texto: 'Pronto! Enviamos um e-mail para confirmar sua conta. Depois é só entrar.' });
  });
}

async function esqueci(btn) {
  const email = $('#email').value.trim();
  if (!email) return toast('Digite seu e-mail e toque de novo.', 'erro');
  await ocupado(btn, async () => {
    await sb.auth.resetPasswordForEmail(email, { redirectTo: new URL('redefinir.html', location.href).href });
    desenhar({ texto: 'Se esse e-mail tiver conta, enviamos um link para criar uma nova senha.' });
  });
}
