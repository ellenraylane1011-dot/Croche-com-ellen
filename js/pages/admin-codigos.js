import { sb } from '../supabase.js';
import { exigirAdmin, sair } from '../auth.js';
import { el, brl, dataBR, parseReais, ocupado, toast, mensagemErro, montar, NAV_ADMIN } from '../ui.js';

await exigirAdmin();
let ultimoLote = null;                          // { peca, valor_centavos, codigos[] }

async function carregar() {
  const [codigosR, produtosR] = await Promise.all([
    sb.from('codes').select('codigo,peca,valor_centavos,status,validade,criado_em,usado_em').order('criado_em', { ascending: false }).limit(100),
    sb.from('products').select('id,nome,preco_centavos').order('nome'),
  ]);
  if (codigosR.error) toast('Não foi possível carregar os códigos.', 'erro');
  desenhar(codigosR.data ?? [], produtosR.data ?? []);
}

const reais = (centavos) => (centavos / 100).toFixed(2).replace('.', ',');

const ROTULO = { ativo: 'Ativo', usado: 'Usado', invalidado: 'Invalidado' };

function desenhar(codigos, produtos) {
  // Escolher uma peça já cadastrada (preenche nome e valor) ou digitar uma peça nova.
  const campoPeca = el('input', { id: 'g-peca', name: 'peca', type: 'text', maxlength: 80, required: true, placeholder: 'Ex.: Chaveiro morango' });
  const campoValor = el('input', { id: 'g-valor', name: 'valor', type: 'text', inputmode: 'decimal', required: true, placeholder: '18,00' });
  const escolha = el('select', { id: 'g-prod', name: 'produto', onChange: (e) => {
    const p = produtos.find((x) => x.id === e.target.value);
    campoPeca.value = p ? p.nome : '';
    campoValor.value = p ? reais(p.preco_centavos) : '';
    (p ? campoValor : campoPeca).focus();
  } },
    el('option', { value: '', text: 'Digitar outra peça' }),
    produtos.map((p) => el('option', { value: p.id, text: `${p.nome} · ${reais(p.preco_centavos)}` })));

  const form = el('form', { class: 'card nao-imprimir', novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const valor = parseReais(f.valor.value);
    const quantidade = Number(f.quantidade.value);
    if (f.peca.value.trim().length < 2) return toast('Escreva o nome da peça.', 'erro');
    if (!(valor >= 100)) return toast('Valor inválido.', 'erro');
    if (!(Number.isInteger(quantidade) && quantidade >= 1 && quantidade <= 200)) return toast('Quantidade: de 1 a 200.', 'erro');
    await ocupado(e.submitter, async () => {
      const { data, error } = await sb.rpc('gerar_codigos', {
        p_peca: f.peca.value.trim(), p_valor: valor, p_quantidade: quantidade,
        p_validade_dias: f.validade.value ? Number(f.validade.value) : null,
      });
      if (error) return toast(mensagemErro(error, 'Não foi possível gerar os códigos.'), 'erro');
      ultimoLote = data;
      toast(`${data.codigos.length} códigos gerados.`);
      await carregar();
    });
  } },
    el('h2', { text: 'Gerar códigos' }),
    el('p', { class: 'muda pequeno', text: 'Cada etiqueta recebe um código único (ELN + 5 caracteres) que vale uma vez só.' }),
    el('div', { class: 'field' }, el('label', { for: 'g-prod', text: 'Peça' }), escolha),
    el('div', { class: 'field' }, el('label', { for: 'g-peca', text: 'Nome da peça' }), campoPeca),
    el('div', { class: 'field' }, el('label', { for: 'g-valor', text: 'Valor da peça (R$)' }), campoValor),
    el('div', { class: 'field' }, el('label', { for: 'g-qtd', text: 'Quantas etiquetas' }), el('input', { id: 'g-qtd', name: 'quantidade', type: 'number', inputmode: 'numeric', min: 1, max: 200, value: 10, required: true })),
    el('div', { class: 'field' }, el('label', { for: 'g-val', text: 'Validade em dias (opcional)' }), el('input', { id: 'g-val', name: 'validade', type: 'number', inputmode: 'numeric', min: 1, max: 730, placeholder: 'Ex.: 90' })),
    el('button', { class: 'btn bloco', type: 'submit', text: 'Gerar códigos' }));

  const etiquetas = ultimoLote ? el('div', { class: 'card' },
    el('div', { class: 'row between nao-imprimir' }, el('h2', { text: 'Etiquetas geradas' }), el('button', { class: 'btn pequeno', type: 'button', text: 'Imprimir', onClick: () => window.print() })),
    el('p', { class: 'muda pequeno nao-imprimir', text: `${ultimoLote.peca} · ${brl(ultimoLote.valor_centavos)}` }),
    el('div', { class: 'etiquetas' }, ultimoLote.codigos.map((c) => el('div', { class: 'etiqueta' }, el('div', { class: 'mar', text: 'crochê com Ellen' }), el('div', { class: 'cod', text: c }))))) : null;

  const lista = el('div', { class: 'stack nao-imprimir' },
    el('h2', { text: 'Últimos códigos' }),
    codigos.length ? codigos.map((c) => el('div', { class: 'item' },
      el('div', { class: 'info' }, el('strong', { style: { fontFamily: 'ui-monospace,Menlo,monospace', letterSpacing: '.08em' }, text: c.codigo }),
        el('span', { class: 'muda pequeno', text: `${c.peca} · ${brl(c.valor_centavos)} · ${dataBR(c.criado_em)}${c.validade ? ` · vale até ${dataBR(c.validade)}` : ''}` })),
      el('div', { class: 'row' },
        el('span', { class: 'selo' + (c.status === 'ativo' ? ' manteiga' : c.status === 'usado' ? '' : ' cinza'), text: ROTULO[c.status] }),
        c.status === 'ativo' ? el('button', { class: 'btn sec pequeno', type: 'button', text: 'Invalidar', onClick: async (e) => {
          const motivo = prompt('Motivo (ex.: etiqueta perdida):');
          if (!motivo) return;
          await ocupado(e.currentTarget, async () => {
            const { error } = await sb.rpc('invalidar_codigo', { p_codigo: c.codigo, p_motivo: motivo });
            if (error) return toast(mensagemErro(error, 'Não foi possível invalidar.'), 'erro');
            toast('Código invalidado.'); await carregar();
          });
        } }) : null)))
      : el('div', { class: 'vazio', text: 'Nenhum código ainda.' }));

  montar({
    kicker: 'painel da Ellen', titulo: 'Códigos', raiz: '../', nav: NAV_ADMIN, ativo: 'codigos.html',
    acao: el('button', { class: 'btn sec pequeno', type: 'button', text: 'Sair', onClick: () => sair('../') }),
    conteudo: [el('div', { class: 'cols' }, el('div', { class: 'stack' }, form, etiquetas), lista)],
  });
}

// Só depois de todas as constantes acima existirem:
await carregar();
