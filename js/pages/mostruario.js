import { sb, getSettings, fotoUrl } from '../supabase.js';
import { el, $, brl, waLink, ocupado, toast, mensagemErro, montar, icone, NAV_CLIENTE } from '../ui.js';

const LIMITE_ITEM = 20;
const CHAVE_CARRINHO = 'ellen.carrinho.v1';

const cfg = await getSettings();
const zapLoja = cfg.whatsapp_loja;

let produtos = [];
let filtro = 'todas';
let tela = 'lista';                              // 'lista' | 'pedido'
let obs = '';
let carrinho = lerCarrinho();


function lerCarrinho() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_CARRINHO) ?? '{}');
    return bruto && typeof bruto === 'object' ? bruto : {};
  } catch { return {}; }
}
function guardar() {
  try { localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(carrinho)); } catch { /* modo privado */ }
}

async function carregarProdutos() {
  const { data, error } = await sb.from('products')
    .select('id,nome,preco_centavos,tipo,quantidade,prazo_texto,foto_path')
    .eq('ativo', true).order('criado_em', { ascending: false });
  if (error) toast('Não foi possível carregar o mostruário. Tente de novo.', 'erro');
  produtos = data ?? [];
  // Revalida o carrinho guardado: some o que saiu do ar e limita ao estoque.
  const novo = {};
  for (const p of produtos) {
    const q = Math.min(Number(carrinho[p.id]) || 0, maximo(p));
    if (q > 0) novo[p.id] = q;
  }
  carrinho = novo; guardar();
  desenhar();
}

const maximo = (p) => (p.tipo === 'exclusiva' ? Math.min(p.quantidade, LIMITE_ITEM) : LIMITE_ITEM);
const esgotado = (p) => p.tipo === 'exclusiva' && p.quantidade <= 0;
const itens = () => produtos.filter((p) => carrinho[p.id] > 0).map((p) => ({ p, q: carrinho[p.id] }));
const totalCarrinho = () => itens().reduce((a, { p, q }) => a + p.preco_centavos * q, 0);
const qtdCarrinho = () => itens().reduce((a, { q }) => a + q, 0);

function mudar(p, delta) {
  const q = Math.max(0, Math.min(maximo(p), (carrinho[p.id] || 0) + delta));
  if (q === 0) delete carrinho[p.id]; else carrinho[p.id] = q;
  guardar(); desenhar();
}

function cartaoProduto(p) {
  const q = carrinho[p.id] || 0;
  const url = fotoUrl(p.foto_path);
  const restam = p.tipo === 'exclusiva' ? p.quantidade - q : null;
  const nota = p.tipo === 'exclusiva'
    ? (esgotado(p) ? 'Todas já foram vendidas.' : (restam === 1 ? 'Última peça!' : `Restam ${restam}.`))
    : (p.prazo_texto || 'Feito sob encomenda.');
  return el('div', { class: 'prod' + (esgotado(p) ? ' esgotado' : '') },
    el('div', { class: 'foto' }, url ? el('img', { src: url, alt: p.nome, loading: 'lazy' }) : icone('foto')),
    el('div', { class: 'corpo' },
      el('span', { class: 'nome', text: p.nome }),
      el('span', { class: 'preco', text: brl(p.preco_centavos) }),
      el('span', { class: 'selo ' + (p.tipo === 'exclusiva' ? 'manteiga' : ''), text: p.tipo === 'exclusiva' ? 'Peça exclusiva' : 'Sob demanda' }),
      el('span', { class: 'muda pequeno', text: nota }),
      el('div', { class: 'acao' },
        esgotado(p) ? el('div', { class: 'selo cinza', text: 'Esgotado' })
        : q === 0 ? el('button', { class: 'btn pequeno bloco', type: 'button', text: 'Adicionar', onClick: () => mudar(p, 1) })
        : el('div', { class: 'stepper' },
            el('button', { class: 'passo', type: 'button', 'aria-label': `Tirar uma unidade de ${p.nome}`, text: '−', onClick: () => mudar(p, -1) }),
            el('span', { class: 'qtd', text: String(q) }),
            el('button', { class: 'passo cheio', type: 'button', 'aria-label': `Adicionar mais uma unidade de ${p.nome}`, text: '+', disabled: q >= maximo(p) ? true : null, onClick: () => mudar(p, 1) })))));
}

function telaLista() {
  const visiveis = produtos.filter((p) => filtro === 'todas' || (filtro === 'demanda' ? p.tipo === 'demanda' : p.tipo === 'exclusiva'));
  return [
    el('p', { class: 'muda', text: 'Escolha as peças e monte seu pedido. Ele vai pronto para o WhatsApp da Ellen, que confirma tudo com você. Nada é cobrado aqui.' }),
    el('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar peças' },
      [['todas', 'Todas'], ['demanda', 'Sob demanda'], ['exclusiva', 'Exclusivas']].map(([k, t]) =>
        el('button', { class: 'chip', type: 'button', 'aria-pressed': String(filtro === k), text: t, onClick: () => { filtro = k; desenhar(); } }))),
    visiveis.length ? el('div', { class: 'grade' }, visiveis.map(cartaoProduto)) : el('div', { class: 'vazio', text: 'Nenhuma peça por aqui ainda.' }),
  ];
}

function telaPedido() {
  const lista = itens();
  return [
    el('button', { class: 'btn sec pequeno', type: 'button', style: { alignSelf: 'flex-start' }, text: '← Voltar ao mostruário', onClick: () => { tela = 'lista'; desenhar(); } }),
    el('div', { class: 'cols' },
      el('div', { class: 'card' },
        lista.length ? null : el('p', { class: 'muda', text: 'Seu pedido está vazio. Volte ao mostruário e escolha uma peça.' }),
        lista.map(({ p, q }) => el('div', { class: 'item' },
          el('div', { class: 'info' }, el('strong', { text: p.nome }), el('span', { class: 'muda pequeno', text: `${q} × ${brl(p.preco_centavos)}` })),
          el('div', { class: 'row' }, el('span', { class: 'valor', text: brl(p.preco_centavos * q) }),
            el('button', { class: 'btn sec pequeno', type: 'button', text: 'Tirar', onClick: () => { delete carrinho[p.id]; guardar(); desenhar(); } })))),
        el('div', { class: 'row between' }, el('strong', { text: 'Total estimado' }), el('span', { style: { fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 700 }, text: brl(totalCarrinho()) }))),
      el('div', { class: 'stack' },
        el('div', { class: 'card' },
          el('div', { class: 'field' },
            el('label', { for: 'obs', text: 'Alguma observação? (cor, tamanho, prazo)' }),
            el('textarea', { id: 'obs', maxlength: 300, placeholder: 'Ex.: a boina em tom de vinho, por favor', text: obs, onInput: (e) => { obs = e.target.value; } }))),
        el('button', { class: 'btn zap bloco', type: 'button', disabled: lista.length ? null : true, onClick: (e) => enviarPedido(e.currentTarget) }, icone('zap'), 'Enviar pedido pelo WhatsApp'),
        el('div', { class: 'aviso', text: 'Valores sujeitos a confirmação. A Ellen combina pagamento e entrega com você pela conversa.' }))),
  ];
}

async function enviarPedido(btn) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.href = 'index.html?next=mostruario.html'; return; }
  await ocupado(btn, async () => {
    const entrada = itens().map(({ p, q }) => ({ produto_id: p.id, quantidade: q }));
    // O banco confere preço e estoque e devolve o pedido já com os valores reais.
    const { data: ped, error } = await sb.rpc('criar_pedido', { p_itens: entrada, p_obs: obs.trim() || null });
    if (error) {
      toast(mensagemErro(error, 'Não foi possível montar o pedido.'), 'erro');
      if (String(error.message).includes('sem_estoque') || String(error.message).includes('indisponivel')) await carregarProdutos();
      return;
    }
    const { data: eu } = await sb.from('profiles').select('nome').eq('id', session.user.id).maybeSingle();
    const linhas = ped.itens.map((i) => `• ${i.quantidade}x ${i.nome} — ${brl(i.preco_centavos * i.quantidade)}`);
    const texto = [
      `Oi, Ellen! Quero fazer o pedido nº ${ped.numero}:`, '', ...linhas, '',
      `Total: ${brl(ped.total_centavos)}`,
      obs.trim() ? `\nObservação: ${obs.trim()}` : '',
      `\nMeu nome: ${eu?.nome ?? ''}`,
    ].join('\n');
    carrinho = {}; guardar(); obs = '';
    location.href = waLink(zapLoja, texto);
  });
}

function desenhar() {
  const barra = tela === 'lista' && qtdCarrinho() > 0
    ? el('button', { class: 'barra-pedido', type: 'button', onClick: () => { tela = 'pedido'; desenhar(); } },
        el('span', { text: `${qtdCarrinho()} ${qtdCarrinho() === 1 ? 'item' : 'itens'}` }),
        el('span', { text: `${brl(totalCarrinho())} · Ver pedido →` }))
    : null;
  montar({
    titulo: tela === 'lista' ? 'Mostruário' : 'Meu pedido',
    nav: NAV_CLIENTE, ativo: 'mostruario.html', extraDock: barra,
    conteudo: tela === 'lista' ? telaLista() : telaPedido(),
  });
}

// Só depois de todas as constantes acima existirem:
await carregarProdutos();
