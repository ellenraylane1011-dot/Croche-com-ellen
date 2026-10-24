import { sb, getSettings } from '../supabase.js';
import { exigirAdmin, sair } from '../auth.js';
import { el, brl, dataBR, waLink, parseReais, ocupado, toast, mensagemErro, montar, NAV_ADMIN } from '../ui.js';

const { user: eu } = await exigirAdmin();
await carregar();

async function carregar() {
  const [perfisR, comprasR, marcasR, brindesR] = await Promise.all([
    sb.from('profiles').select('id,nome,whatsapp,criado_em').order('criado_em', { ascending: false }).limit(1000),
    sb.from('purchases').select('id,user_id,descricao,valor_centavos,origem,criado_em,estornada_em,motivo').order('criado_em', { ascending: false }).limit(500),
    sb.from('marks').select('id,ordem,valor_minimo_centavos,premio').eq('ativo', true).order('valor_minimo_centavos'),
    sb.from('reward_claims').select('id,user_id,premio,criado_em,entregue_em').order('criado_em', { ascending: false }).limit(500),
  ]);
  if (perfisR.error || comprasR.error) toast('Não foi possível carregar os dados.', 'erro');
  // A própria Ellen não é cliente: fica fora da lista e das contas.
  desenhar({ perfis: (perfisR.data ?? []).filter((p) => p.id !== eu.id), compras: comprasR.data ?? [], marcas: marcasR.data ?? [], brindes: brindesR.data ?? [] });
}

function desenhar({ perfis, compras, marcas, brindes }) {
  const porId = new Map(perfis.map((p) => [p.id, p]));
  const ativas = compras.filter((c) => !c.estornada_em);
  const total = ativas.reduce((a, c) => a + c.valor_centavos, 0);
  const totalDe = (id) => ativas.filter((c) => c.user_id === id).reduce((a, c) => a + c.valor_centavos, 0);
  const aEntregar = brindes.filter((b) => !b.entregue_em);
  let busca = '';
  const listaClientes = el('div', { class: 'stack' });

  const pintarClientes = () => {
    const q = busca.trim().toLowerCase();
    const lista = perfis.filter((p) => !q || p.nome.toLowerCase().includes(q));
    listaClientes.replaceChildren(...(lista.length ? lista.map(cartaoCliente) : [el('div', { class: 'vazio', text: 'Nenhuma cliente encontrada.' })]));
  };

  function cartaoCliente(p) {
    const t = totalDe(p.id);
    const alcancadas = marcas.filter((m) => t >= m.valor_minimo_centavos);
    const ultima = alcancadas[alcancadas.length - 1];
    const maximo = marcas.length ? marcas[marcas.length - 1].valor_minimo_centavos : 1;
    const texto = `Oi, ${p.nome.split(' ')[0]}! Aqui é a Ellen, do Crochê com Ellen.` +
      (ultima ? ` Você atingiu a marca "${ultima.premio}". Quer combinar a entrega?` : ' Passando para agradecer a compra!');
    return el('div', { class: 'item coluna' },
      el('div', { class: 'row between' }, el('strong', { text: p.nome }), el('strong', { text: brl(t) })),
      el('span', { class: 'muda pequeno', text: `Cadastro em ${dataBR(p.criado_em)}` }),
      el('div', { class: 'barra' }, el('div', { style: { width: `${Math.min(100, (t / maximo) * 100)}%` } })),
      el('div', { class: 'row between' },
        el('span', { class: 'selo' + (ultima ? '' : ' cinza'), text: ultima ? ultima.premio : 'Ainda sem marca' }),
        p.whatsapp ? el('a', { class: 'btn zap vazado pequeno', href: waLink(p.whatsapp, texto), target: '_blank', rel: 'noopener', text: 'Chamar no WhatsApp' }) : null));
  }

  const blocoBrindes = el('div', { class: 'card manteiga' },
    el('h2', { text: 'Brindes para entregar' }),
    aEntregar.length ? aEntregar.map((b) => {
      const p = porId.get(b.user_id);
      return el('div', { class: 'row between' },
        el('div', { class: 'stack' }, el('strong', { text: p?.nome ?? 'Cliente' }), el('span', { class: 'pequeno', text: b.premio })),
        el('button', { class: 'btn pequeno', type: 'button', text: 'Marcar entregue', onClick: (e) => ocupado(e.currentTarget, async () => {
          const { error } = await sb.rpc('entregar_brinde', { p_id: b.id });
          if (error) return toast(mensagemErro(error), 'erro');
          toast('Brinde marcado como entregue.'); await carregar();
        }) }));
    }) : el('p', { class: 'pequeno', text: 'Nenhum brinde pendente.' }));

  const selCliente = el('select', { id: 'lc-cliente', required: true }, el('option', { value: '', text: 'Escolha a cliente' }), perfis.map((p) => el('option', { value: p.id, text: p.nome })));
  const lancar = el('details', { class: 'card' },
    el('summary', { style: { fontWeight: 800, cursor: 'pointer', minHeight: '44px', display: 'flex', alignItems: 'center' }, text: 'Lançar compra sem etiqueta' }),
    el('form', { class: 'stack', novalidate: true, onSubmit: async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      const valor = parseReais(f.valor.value);
      if (!selCliente.value) return toast('Escolha a cliente.', 'erro');
      if (!(valor >= 100)) return toast('Valor inválido.', 'erro');
      await ocupado(e.submitter, async () => {
        const { error } = await sb.rpc('lancar_compra_manual', { p_user: selCliente.value, p_desc: f.desc.value, p_valor: valor, p_motivo: f.motivo.value });
        if (error) return toast(mensagemErro(error, 'Não foi possível lançar.'), 'erro');
        toast('Compra lançada.'); await carregar();
      });
    } },
      el('div', { class: 'field' }, el('label', { for: 'lc-cliente', text: 'Cliente' }), selCliente),
      el('div', { class: 'field' }, el('label', { for: 'lc-desc', text: 'Peça' }), el('input', { id: 'lc-desc', name: 'desc', type: 'text', maxlength: 80, required: true })),
      el('div', { class: 'field' }, el('label', { for: 'lc-valor', text: 'Valor (R$)' }), el('input', { id: 'lc-valor', name: 'valor', type: 'text', inputmode: 'decimal', placeholder: '65,00', required: true })),
      el('div', { class: 'field' }, el('label', { for: 'lc-motivo', text: 'Motivo (fica no histórico)' }), el('input', { id: 'lc-motivo', name: 'motivo', type: 'text', maxlength: 200, placeholder: 'Ex.: compra antes das etiquetas', required: true })),
      el('button', { class: 'btn bloco', type: 'submit', text: 'Lançar compra' })));

  const recentes = el('div', { class: 'stack' },
    el('h2', { text: 'Compras recentes' }),
    compras.length ? compras.slice(0, 30).map((c) => el('div', { class: 'item' },
      el('div', { class: 'info' + (c.estornada_em ? ' estornada' : '') },
        el('strong', { text: c.descricao }),
        el('span', { class: 'muda pequeno', text: `${porId.get(c.user_id)?.nome ?? 'Conta apagada'} · ${dataBR(c.criado_em)}${c.origem === 'manual' ? ' · manual' : ''}` })),
      el('div', { class: 'row' },
        el('span', { class: 'valor' + (c.estornada_em ? ' estornada' : ''), text: brl(c.valor_centavos) }),
        c.estornada_em ? null : el('button', { class: 'btn sec pequeno', type: 'button', text: 'Estornar', onClick: (e) => ocupado(e.currentTarget, async () => {
          const motivo = prompt('Motivo do estorno (fica no histórico):');
          if (!motivo) return;
          const { error } = await sb.rpc('estornar_compra', { p_id: c.id, p_motivo: motivo });
          if (error) return toast(mensagemErro(error), 'erro');
          toast('Compra estornada.'); await carregar();
        }) }))))
      : el('div', { class: 'vazio', text: 'Nenhuma compra ainda.' }));

  const campoBusca = el('input', { id: 'busca', type: 'search', placeholder: 'Buscar cliente', onInput: (e) => { busca = e.target.value; pintarClientes(); } });
  pintarClientes();

  montar({
    kicker: 'painel da Ellen', titulo: 'Clientes', raiz: '../', nav: NAV_ADMIN, ativo: 'index.html',
    acao: el('button', { class: 'btn sec pequeno', type: 'button', text: 'Sair', onClick: () => sair('../') }),
    conteudo: [
      el('div', { class: 'stats' },
        stat('Clientes', String(perfis.length)), stat('Peças registradas', String(ativas.length)),
        stat('Valor registrado', brl(total)), stat('Brindes a entregar', String(aEntregar.length), true)),
      el('div', { class: 'cols' },
        el('div', { class: 'stack' }, blocoBrindes, el('h2', { text: 'Clientes' }),
          el('div', { class: 'field' }, el('label', { for: 'busca', class: 'sr-only', text: 'Buscar cliente' }), campoBusca), listaClientes),
        el('div', { class: 'stack' }, lancar, recentes)),
    ],
  });
}

function stat(rotulo, valor, destaque = false) {
  return el('div', { class: 'stat' + (destaque ? ' manteiga' : '') }, el('span', { class: 'l', text: rotulo }), el('span', { class: 'n', text: valor }));
}
