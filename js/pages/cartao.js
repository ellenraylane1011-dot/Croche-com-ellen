import { sb, getSettings, fotoUrl } from '../supabase.js';
import { exigirUsuario, sair } from '../auth.js';
import { el, $, brl, dataBR, waLink, whatsappBR, soDigitos, ocupado, toast, mensagemErro, montar, icone, foto, NAV_CLIENTE } from '../ui.js';

const { user, perfil } = await exigirUsuario();
const cfg = await getSettings();
const zapLoja = cfg.whatsapp_loja;

const MENSAGENS_CODIGO = {
  invalido: 'Código inválido ou já usado.',
  limite: 'Muitas tentativas. Espere 10 minutos e tente de novo.',
};

await carregar();

async function carregar() {
  const [marcasR, totalR, comprasR, brindesR, pecasR] = await Promise.all([
    sb.from('marks').select('id,ordem,valor_minimo_centavos,premio').eq('ativo', true).order('valor_minimo_centavos'),
    sb.from('card_totals').select('total_centavos,pecas').eq('user_id', user.id).maybeSingle(),
    sb.from('purchases').select('id,descricao,valor_centavos,criado_em,estornada_em').eq('user_id', user.id).order('criado_em', { ascending: false }).limit(50),
    sb.from('reward_claims').select('mark_id,entregue_em').eq('user_id', user.id),
    sb.from('products').select('id,nome,preco_centavos,tipo,quantidade,foto_path').eq('ativo', true).order('criado_em', { ascending: false }).limit(10),
  ]);
  if (marcasR.error || comprasR.error) { toast('Não foi possível carregar seu cartão. Tente de novo.', 'erro'); }
  desenhar({
    marcas: marcasR.data ?? [],
    total: totalR.data?.total_centavos ?? 0,
    compras: comprasR.data ?? [],
    brindes: new Map((brindesR.data ?? []).map((b) => [b.mark_id, b])),
    pecas: pecasR.data ?? [],
  });
}

function desenhar({ marcas, total, compras, brindes, pecas }) {
  const atingidas = marcas.filter((m) => total >= m.valor_minimo_centavos);
  const proxima = marcas.find((m) => total < m.valor_minimo_centavos);
  const maximo = marcas.length ? marcas[marcas.length - 1].valor_minimo_centavos : 1;
  const pendente = atingidas.filter((m) => !brindes.get(m.id)?.entregue_em);
  const nome = (perfil?.nome ?? '').split(' ')[0];

  const mensagemResgate = pendente.length
    ? `Oi, Ellen! Sou ${perfil?.nome ?? ''} e meu cartão fidelidade já está em ${brl(total)}. Quero resgatar: ${pendente[pendente.length - 1].premio}.`
    : `Oi, Ellen! Sou ${perfil?.nome ?? ''} e tenho uma dúvida sobre o cartão fidelidade.`;

  const progresso = el('div', { class: 'card' },
    el('div', { class: 'row between' },
      el('div', { class: 'stack' }, el('span', { class: 'rotulo muda', text: 'TOTAL EM COMPRAS' }), el('div', { style: { fontFamily: 'var(--serif)', fontSize: '40px', fontWeight: '700', lineHeight: '1.1' }, text: brl(total) })),
      el('span', { class: 'selo', text: `${atingidas.length} de ${marcas.length} marcas` })),
    el('div', { class: 'barra', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': maximo, 'aria-valuenow': Math.min(total, maximo), 'aria-label': 'Progresso até a última marca' },
      el('div', { style: { width: `${Math.min(100, (total / maximo) * 100)}%` } })),
    el('p', { style: { margin: 0, fontWeight: 600 }, text: proxima ? `Faltam ${brl(proxima.valor_minimo_centavos - total)} para: ${proxima.premio}.` : (marcas.length ? 'Você chegou na última marca!' : 'Em breve as marcas aparecem aqui.') }),
    el('a', { class: 'btn zap bloco', href: waLink(zapLoja, mensagemResgate), target: '_blank', rel: 'noopener' }, icone('zap'), pendente.length ? 'Resgatar no WhatsApp' : 'Falar com a Ellen'),
    el('div', { class: 'stack' }, marcas.map((m) => {
      const ok = total >= m.valor_minimo_centavos;
      const entregue = brindes.get(m.id)?.entregue_em;
      return el('div', { class: 'marca' + (ok ? ' ok' : '') },
        el('div', { class: 'bola' }, ok ? icone('ok') : null),
        el('div', { class: 'txt' }, el('strong', { text: m.premio }), el('span', { class: 'muda pequeno', text: `a partir de ${brl(m.valor_minimo_centavos)}` })),
        ok ? el('span', { class: 'selo' + (entregue ? '' : ' manteiga'), text: entregue ? 'Entregue' : 'Para combinar' }) : null);
    })),
  );

  const campoCodigo = el('input', { id: 'codigo', class: 'codigo-input', type: 'text', placeholder: 'ELN7K2M9', maxlength: 12, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
  const retorno = el('div', { 'aria-live': 'polite' });
  const formCodigo = el('form', { class: 'card rosa', novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    const codigo = campoCodigo.value.trim();
    if (!codigo) return toast('Digite o código da etiqueta.', 'erro');
    await ocupado(e.submitter, async () => {
      const { data, error } = await sb.rpc('validar_codigo', { p_codigo: codigo });
      const falha = error ? 'Não foi possível validar agora. Tente de novo.' : (!data?.ok ? MENSAGENS_CODIGO[data?.erro] ?? MENSAGENS_CODIGO.invalido : null);
      if (falha) { retorno.replaceChildren(el('div', { class: 'aviso erro', text: falha })); return; }
      retorno.replaceChildren();
      campoCodigo.value = '';
      toast(`${data.peca} entrou no seu cartão!`);
      await carregar();
    });
  } },
    el('h2', { text: 'Tem uma peça nova?' }),
    el('p', { style: { margin: 0, fontSize: '14px', fontWeight: 600 }, text: 'Digite o código da etiqueta que veio com ela. Cada código vale uma vez só.' }),
    el('label', { for: 'codigo', class: 'rotulo', text: 'Código da peça' }),
    campoCodigo,
    el('button', { class: 'btn manteiga bloco', type: 'submit', text: 'Adicionar ao cartão' }),
    retorno);

  const historico = el('div', { class: 'stack' },
    el('h2', { text: 'Minhas peças' }),
    compras.length
      ? compras.map((c) => el('div', { class: 'item' },
          el('div', { class: 'info' + (c.estornada_em ? ' estornada' : '') }, el('strong', { text: c.descricao }), el('span', { class: 'muda pequeno', text: dataBR(c.criado_em) + (c.estornada_em ? ' · estornada' : '') })),
          el('span', { class: 'valor' + (c.estornada_em ? ' estornada' : ''), text: brl(c.valor_centavos) })))
      : el('div', { class: 'vazio', text: 'Quando você usar seu primeiro código, a peça aparece aqui.' }));

  montar({
    titulo: nome ? `Oi, ${nome}!` : 'Meu cartão',
    nav: NAV_CLIENTE, ativo: 'cartao.html',
    acao: el('button', { class: 'btn sec pequeno', type: 'button', text: 'Sair', onClick: () => sair() }),
    conteudo: [
      carrossel(pecas),
      el('div', { class: 'cols' }, el('div', { class: 'stack' }, progresso), el('div', { class: 'stack' }, formCodigo, historico)),
      meusDados(),
    ],
  });
}

function meusDados() {
  const nome = el('input', { id: 'm-nome', type: 'text', value: perfil?.nome ?? '', maxlength: 80, autocomplete: 'name' });
  const zap = el('input', { id: 'm-zap', type: 'tel', inputmode: 'tel', value: perfil?.whatsapp ?? '', autocomplete: 'tel' });
  const promo = el('input', { id: 'm-promo', type: 'checkbox', checked: perfil?.aceita_promocoes ? true : null });
  return el('details', { class: 'card' },
    el('summary', { style: { fontWeight: 800, cursor: 'pointer', minHeight: '44px', display: 'flex', alignItems: 'center' }, text: 'Meus dados e privacidade' }),
    el('form', { class: 'stack', novalidate: true, onSubmit: async (e) => {
      e.preventDefault();
      await ocupado(e.submitter, async () => {
        const dados = { nome: nome.value.trim(), whatsapp: whatsappBR(zap.value) || null, aceita_promocoes: promo.checked };
        if (dados.nome.length < 2) return toast('Escreva seu nome.', 'erro');
        if (dados.whatsapp && soDigitos(dados.whatsapp).length < 12) return toast('Confira o WhatsApp, com DDD.', 'erro');
        const { error } = await sb.from('profiles').update(dados).eq('id', user.id);
        toast(error ? 'Não foi possível salvar.' : 'Dados salvos!', error ? 'erro' : 'ok');
      });
    } },
      el('div', { class: 'field' }, el('label', { for: 'm-nome', text: 'Nome' }), nome),
      el('div', { class: 'field' }, el('label', { for: 'm-zap', text: 'WhatsApp' }), zap),
      el('label', { class: 'check' }, promo, el('span', { text: 'Receber novidades e promoções no WhatsApp' })),
      el('button', { class: 'btn bloco', type: 'submit', text: 'Salvar meus dados' })),
    el('p', { class: 'muda pequeno' }, 'Leia a ', el('a', { href: 'termos.html', text: 'política de privacidade' }), '.'),
    el('button', { class: 'btn sec bloco', type: 'button', text: 'Excluir minha conta', onClick: async (e) => {
      if (!confirm('Excluir sua conta apaga seu cartão e seus dados pessoais. Isso não pode ser desfeito. Continuar?')) return;
      await ocupado(e.currentTarget, async () => {
        const { error } = await sb.rpc('excluir_minha_conta');
        if (error) return toast(mensagemErro(error, 'Não foi possível excluir agora.'), 'erro');
        await sb.auth.signOut();
        location.replace('index.html');
      });
    } }));
}

// Carrossel das peças do mostruário: rolagem com "snap", setas para quem prefere botões.
function carrossel(pecas) {
  if (!pecas.length) return null;
  const faixa = el('div', { class: 'carrossel', tabindex: 0, role: 'region', 'aria-label': 'Peças do mostruário' },
    pecas.map((p) => {
      const url = fotoUrl(p.foto_path);
      const exclusiva = p.tipo === 'exclusiva';
      return el('a', { class: 'slide', href: 'mostruario.html', 'aria-label': `${p.nome}, ${brl(p.preco_centavos)}. Ver no mostruário` },
        foto(url, ''),
        el('strong', { class: 'nome', text: p.nome }),
        el('span', { class: 'preco', text: brl(p.preco_centavos) }),
        el('span', { class: 'selo' + (exclusiva ? ' manteiga' : ''), text: exclusiva ? (p.quantidade > 0 ? `Exclusiva · restam ${p.quantidade}` : 'Esgotada') : 'Sob demanda' }));
    }));
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rolar = (dir) => faixa.scrollBy({ left: dir * faixa.clientWidth * 0.8, behavior: reduz ? 'auto' : 'smooth' });
  return el('section', { class: 'stack', 'aria-labelledby': 'tit-carrossel' },
    el('div', { class: 'row between' },
      el('h2', { id: 'tit-carrossel', text: 'Do mostruário' }),
      el('div', { class: 'row' },
        el('button', { class: 'passo', type: 'button', 'aria-label': 'Peças anteriores', text: '‹', onClick: () => rolar(-1) }),
        el('button', { class: 'passo cheio', type: 'button', 'aria-label': 'Próximas peças', text: '›', onClick: () => rolar(1) }),
        el('a', { class: 'btn sec pequeno', href: 'mostruario.html', text: 'Ver tudo' }))),
    faixa);
}
