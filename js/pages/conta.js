import { sb } from '../supabase.js';
import { exigirUsuario, sair } from '../auth.js';
import { el, whatsappBR, soDigitos, ocupado, toast, mensagemErro, montar, NAV_CLIENTE } from '../ui.js';

const { user, perfil } = await exigirUsuario();

function desenhar() {
  const nome = el('input', { id: 'c-nome', type: 'text', value: perfil?.nome ?? '', maxlength: 80, autocomplete: 'name' });
  const zap = el('input', { id: 'c-zap', type: 'tel', inputmode: 'tel', value: perfil?.whatsapp ?? '', autocomplete: 'tel' });
  const promo = el('input', { id: 'c-promo', type: 'checkbox', checked: perfil?.aceita_promocoes ? true : null });
  const senha = el('input', { id: 'c-senha', type: 'password', autocomplete: 'new-password', minlength: 8, placeholder: 'mínimo 8 caracteres' });

  const dados = el('form', { class: 'card', novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    const novos = { nome: nome.value.trim(), whatsapp: whatsappBR(zap.value) || null, aceita_promocoes: promo.checked };
    if (novos.nome.length < 2) return toast('Escreva seu nome.', 'erro');
    if (novos.whatsapp && soDigitos(novos.whatsapp).length < 12) return toast('Confira o WhatsApp, com DDD.', 'erro');
    await ocupado(e.submitter, async () => {
      const { error } = await sb.from('profiles').update(novos).eq('id', user.id);
      toast(error ? 'Não foi possível salvar.' : 'Dados salvos!', error ? 'erro' : 'ok');
    });
  } },
    el('h2', { text: 'Meus dados' }),
    el('div', { class: 'field' }, el('span', { class: 'rotulo', text: 'E-mail' }), el('span', { class: 'muda', id: 'c-email', text: user.email })),
    el('div', { class: 'field' }, el('label', { for: 'c-nome', text: 'Nome' }), nome),
    el('div', { class: 'field' }, el('label', { for: 'c-zap', text: 'WhatsApp' }), zap),
    el('label', { class: 'check' }, promo, el('span', { text: 'Receber novidades e promoções no WhatsApp' })),
    el('button', { class: 'btn bloco', type: 'submit', text: 'Salvar meus dados' }));

  const trocaSenha = el('form', { class: 'card', novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    if (senha.value.length < 8) return toast('A senha precisa de pelo menos 8 caracteres.', 'erro');
    await ocupado(e.submitter, async () => {
      const { error } = await sb.auth.updateUser({ password: senha.value });
      if (error) return toast('Não foi possível trocar a senha. Tente de novo.', 'erro');
      senha.value = ''; toast('Senha trocada!');
    });
  } },
    el('h2', { text: 'Trocar senha' }),
    el('div', { class: 'field' }, el('label', { for: 'c-senha', text: 'Nova senha' }), senha),
    el('button', { class: 'btn sec bloco', type: 'submit', text: 'Trocar senha' }));

  const privacidade = el('div', { class: 'card' },
    el('h2', { text: 'Privacidade' }),
    el('p', { class: 'muda pequeno' }, 'Leia a ', el('a', { href: 'termos.html', text: 'política de privacidade' }), '. Você pode apagar sua conta quando quiser.'),
    el('button', { class: 'btn sec bloco', type: 'button', text: 'Excluir minha conta', onClick: async (e) => {
      if (!confirm('Excluir sua conta apaga seu cartão e seus dados pessoais. Isso não pode ser desfeito. Continuar?')) return;
      await ocupado(e.currentTarget, async () => {
        const { error } = await sb.rpc('excluir_minha_conta');
        if (error) return toast(mensagemErro(error, 'Não foi possível excluir agora.'), 'erro');
        await sb.auth.signOut();
        location.replace('index.html');
      });
    } }));

  montar({
    kicker: 'crochê com Ellen', titulo: 'Minha conta',
    nav: NAV_CLIENTE, ativo: 'conta.html',
    conteudo: [
      el('div', { class: 'cols' }, el('div', { class: 'stack' }, dados), el('div', { class: 'stack' }, trocaSenha, privacidade)),
      el('button', { class: 'btn sec bloco', type: 'button', text: 'Sair da conta', onClick: () => sair() }),
    ],
  });
}

desenhar();
