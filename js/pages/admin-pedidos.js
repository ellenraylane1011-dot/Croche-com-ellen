import { sb } from '../supabase.js';
import { exigirAdmin, sair } from '../auth.js';
import { el, brl, dataBR, waLink, ocupado, toast, mensagemErro, montar, NAV_ADMIN } from '../ui.js';

await exigirAdmin();
let filtro = 'aguardando';

async function carregar() {
  const [pedR, perfR] = await Promise.all([
    sb.from('orders').select('id,numero,user_id,status,total_centavos,observacao,reservado_ate,criado_em,order_items(nome,quantidade,preco_centavos)').order('criado_em', { ascending: false }).limit(200),
    sb.from('profiles').select('id,nome,whatsapp').limit(1000),
  ]);
  if (pedR.error) toast('Não foi possível carregar os pedidos.', 'erro');
  desenhar(pedR.data ?? [], new Map((perfR.data ?? []).map((p) => [p.id, p])));
}

const ROTULO = { aguardando: 'Aguardando', confirmado: 'Confirmado', cancelado: 'Cancelado' };

function desenhar(pedidos, perfis) {
  const visiveis = pedidos.filter((p) => p.status === filtro);
  const cartao = (o) => {
    const cli = perfis.get(o.user_id);
    const texto = `Oi, ${(cli?.nome ?? '').split(' ')[0]}! Aqui é a Ellen. Sobre o seu pedido nº ${o.numero}:`;
    return el('div', { class: 'card' },
      el('div', { class: 'row between' }, el('strong', { text: `Pedido nº ${o.numero}` }),
        el('span', { class: 'selo' + (o.status === 'aguardando' ? ' manteiga' : o.status === 'cancelado' ? ' cinza' : ''), text: ROTULO[o.status] })),
      el('span', { class: 'muda pequeno', text: `${cli?.nome ?? 'Conta apagada'} · ${dataBR(o.criado_em)}` }),
      o.order_items.map((i) => el('div', { class: 'row between' }, el('span', { text: `${i.quantidade}× ${i.nome}` }), el('span', { class: 'valor', text: brl(i.preco_centavos * i.quantidade) }))),
      o.observacao ? el('div', { class: 'mensagem', text: `Observação: ${o.observacao}` }) : null,
      el('div', { class: 'row between' }, el('strong', { text: 'Total' }), el('strong', { text: brl(o.total_centavos) })),
      el('div', { class: 'row' },
        cli?.whatsapp ? el('a', { class: 'btn zap vazado pequeno', href: waLink(cli.whatsapp, texto), target: '_blank', rel: 'noopener', text: 'Falar no WhatsApp' }) : null,
        o.status === 'aguardando' ? el('button', { class: 'btn pequeno', type: 'button', text: 'Confirmar', onClick: (e) => agir(e.currentTarget, 'confirmar_pedido', o.id, 'Pedido confirmado e estoque atualizado.') }) : null,
        o.status !== 'cancelado' ? el('button', { class: 'btn sec pequeno', type: 'button', text: 'Cancelar', onClick: (e) => { if (confirm('Cancelar este pedido?')) agir(e.currentTarget, 'cancelar_pedido', o.id, 'Pedido cancelado.'); } }) : null));
  };

  montar({
    kicker: 'painel da Ellen', titulo: 'Pedidos', raiz: '../', nav: NAV_ADMIN, ativo: 'pedidos.html',
    acao: el('button', { class: 'btn sec pequeno', type: 'button', text: 'Sair', onClick: () => sair('../') }),
    conteudo: [
      el('p', { class: 'muda', text: 'Pedidos chegam aqui quando a cliente toca em "Enviar pelo WhatsApp". Confirme para baixar o estoque das peças exclusivas. Sem confirmar, a reserva some em 6 horas.' }),
      el('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar pedidos' },
        Object.entries(ROTULO).map(([k, t]) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(filtro === k), text: `${t} (${pedidos.filter((p) => p.status === k).length})`, onClick: () => { filtro = k; desenhar(pedidos, perfis); } }))),
      visiveis.length ? el('div', { class: 'cols' }, visiveis.map(cartao)) : el('div', { class: 'vazio', text: 'Nenhum pedido aqui.' }),
    ],
  });
}

async function agir(btn, funcao, id, ok) {
  await ocupado(btn, async () => {
    const { error } = await sb.rpc(funcao, { p_id: id });
    if (error) return toast(mensagemErro(error, 'Não foi possível concluir.'), 'erro');
    toast(ok); await carregar();
  });
}

// Só depois de todas as constantes acima existirem:
await carregar();
