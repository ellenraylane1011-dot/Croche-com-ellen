// Ajudantes de tela. REGRA: dado vindo de pessoa ou do banco entra na página só por
// `el()` (textContent). Nunca innerHTML com esses dados. Os SVGs abaixo são fixos.

export const $ = (sel, root = document) => root.querySelector(sel);

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style') Object.assign(n.style, v);           // CSSOM: permitido pela CSP
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

export const brl = (centavos) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// "1.200,50" ou "65" -> centavos. Aceita só vírgula como decimal.
export function parseReais(txt) {
  const n = Number(String(txt).trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');

// Número brasileiro: sem DDI vira 55 + DDD + número.
export function whatsappBR(s) {
  let d = soDigitos(s);
  if (d.length >= 10 && d.length <= 11) d = '55' + d;
  return d;
}

export const waLink = (numero, texto) => `https://wa.me/${soDigitos(numero)}?text=${encodeURIComponent(texto)}`;

export const dataBR = (iso) => new Date(iso).toLocaleDateString('pt-BR');

export function toast(msg, tipo = 'ok') {
  let box = $('#toasts');
  if (!box) { box = el('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const t = el('div', { class: 'toast' + (tipo === 'erro' ? ' erro' : ''), role: tipo === 'erro' ? 'alert' : 'status', text: msg });
  box.append(t);
  setTimeout(() => t.remove(), 4500);
}

// Desabilita o botão enquanto roda (evita clique duplo).
export async function ocupado(btn, fn) {
  if (btn.disabled) return;
  btn.disabled = true;
  try { return await fn(); } finally { btn.disabled = false; }
}

// Erro do banco/função -> frase em português.
export function mensagemErro(err, padrao = 'Algo deu errado. Tente de novo.') {
  const m = String(err?.message ?? '');
  const mapa = [
    ['sem_estoque', 'Essa peça acabou de esgotar. Atualizamos o mostruário.'],
    ['produto_indisponivel', 'Uma das peças saiu do mostruário.'],
    ['muitos_pedidos', 'Você já tem muitos pedidos em aberto. Fale com a Ellen.'],
    ['quantidade_invalida', 'Quantidade inválida.'],
    ['peca_invalida', 'Nome da peça: de 2 a 80 letras.'],
    ['valor_invalido', 'Valor inválido.'],
    ['validade_invalida', 'Validade: de 1 a 730 dias.'],
    ['falha_geracao', 'Não foi possível gerar todos os códigos. Tente de novo.'],
    ['motivo_obrigatorio', 'Escreva o motivo.'],
    ['sem_permissao', 'Você não tem permissão para isso.'],
    ['nao_autenticado', 'Entre na sua conta.'],
    ['admin_nao_pode', 'A conta de administradora não pode ser apagada por aqui.'],
  ];
  for (const [chave, txt] of mapa) if (m.includes(chave)) return txt;
  return padrao;
}

const ICONES = {
  cartao: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/></svg>',
  loja: '<svg viewBox="0 0 24 24"><path d="M4 8l1.5-4h13L20 8M4 8v11h16V8M4 8c0 2 3 2 4 0 1 2 3 2 4 0 1 2 3 2 4 0 1 2 4 2 4 0"/></svg>',
  conta: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/></svg>',
  clientes: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-5 13-5 14 0M16 5a3.5 3.5 0 0 1 0 7M18 15c2 1 3 3 4 5"/></svg>',
  pedidos: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 9h6M9 13h6"/></svg>',
  produtos: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M5 10c5-4 11-4 15 2M5 15c4-3 10-2 14 2M10 4c3 5 2 11-2 16"/></svg>',
  codigos: '<svg viewBox="0 0 24 24"><path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3M8 9v6M12 9v6M16 9v6"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
  zap: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.7-5.4A8.4 8.4 0 1 1 21 11.5z"/></svg>',
  ok: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  foto: '<svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="24" cy="24" r="16"/><path d="M10 20c8-6 20-6 28 2M9 28c8-5 21-4 30 3M15 38c6-4 14-4 19 0M20 9c4 8 3 22-3 30"/></svg>',
};

export function icone(nome) {
  const s = el('span', { 'aria-hidden': 'true', style: { display: 'inline-flex' } });
  s.innerHTML = ICONES[nome] ?? '';                              // SVG fixo do código, sem dado de usuário
  return s;
}

// Foto com esqueleto: o brilho some quando a imagem carrega; sem foto (ou com erro) mostra o ícone.
export function foto(url, alt = '', classe = 'foto') {
  const caixa = el('div', { class: classe });
  if (!url) { caixa.append(icone('foto')); return caixa; }
  caixa.classList.add('sk');
  caixa.append(el('img', {
    src: url, alt, loading: 'lazy',
    onLoad: () => caixa.classList.remove('sk'),
    onError: () => { caixa.classList.remove('sk'); caixa.replaceChildren(icone('foto')); },
  }));
  return caixa;
}

// Tira o estado "carregando" do leitor de tela quando a página já foi desenhada.
export const pronto = () => $('#app')?.removeAttribute('aria-busy');

export const NAV_CLIENTE = [
  { href: 'cartao.html', texto: 'Cartão', icone: 'cartao' },
  { href: 'mostruario.html', texto: 'Mostruário', icone: 'loja' },
  { href: 'index.html', texto: 'Conta', icone: 'conta' },
];
export const NAV_ADMIN = [
  { href: 'index.html', texto: 'Clientes', icone: 'clientes' },
  { href: 'pedidos.html', texto: 'Pedidos', icone: 'pedidos' },
  { href: 'produtos.html', texto: 'Produtos', icone: 'produtos' },
  { href: 'codigos.html', texto: 'Códigos', icone: 'codigos' },
  { href: 'config.html', texto: 'Ajustes', icone: 'ajustes' },
];

// Monta a página: cabeçalho, conteúdo e navbar fixa embaixo.
export function montar({ kicker, titulo, nav, ativo, conteudo, extraDock = [], raiz = '', mascote = true, acao = null }) {
  const dock = nav
    ? el('div', { class: 'dock' }, extraDock,
        el('nav', { 'aria-label': 'Navegação principal' },
          nav.map((i) => el('a', { href: i.href, 'aria-current': i.href === ativo ? 'page' : null }, icone(i.icone), i.texto))))
    : null;
  pronto();
  $('#app').replaceChildren(
    el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'kicker', text: kickerTexto(kicker) }), el('h1', { text: titulo })),
      acao,
      mascote ? el('img', { class: 'mascot', src: `${raiz}img/gatinho.gif`, alt: 'Gatinho laranja brincando com uma bola de lã', width: 84, height: 73 }) : null),
    el('main', {}, conteudo),
    dock,
  );
}
const kickerTexto = (k) => k ?? 'crochê com Ellen';
