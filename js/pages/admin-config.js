import { sb, getSettings } from '../supabase.js';
import { exigirAdmin, sair } from '../auth.js';
import { el, parseReais, whatsappBR, soDigitos, ocupado, toast, mensagemErro, montar, NAV_ADMIN } from '../ui.js';

await exigirAdmin();

async function carregar() {
  const [marcasR, cfg] = await Promise.all([
    sb.from('marks').select('id,ordem,valor_minimo_centavos,premio,ativo').order('valor_minimo_centavos'),
    getSettings(),
  ]);
  if (marcasR.error) toast('Não foi possível carregar os ajustes.', 'erro');
  desenhar(marcasR.data ?? [], cfg);
}

const reais = (centavos) => (centavos / 100).toFixed(2).replace('.', ',');

// Depois de mudar marcas, quem já alcançou ganha o brinde (só adiciona, nunca tira).
async function recalcular() {
  const { data, error } = await sb.rpc('recalcular_brindes');
  if (error) return toast(mensagemErro(error, 'Marcas salvas, mas não deu para atualizar os brindes.'), 'erro');
  toast(data > 0 ? `Marcas salvas. ${data} ${data === 1 ? 'cliente ganhou' : 'clientes ganharam'} brinde novo.` : 'Marcas salvas.');
}

function desenhar(marcas, cfg) {
  const proximaOrdem = Math.max(0, ...marcas.map((m) => m.ordem)) + 1;

  const cartaoMarca = (m) => {
    const premio = el('input', { id: `m${m.id}-premio`, type: 'text', maxlength: 80, value: m.premio });
    const valor = el('input', { id: `m${m.id}-valor`, type: 'text', inputmode: 'decimal', value: reais(m.valor_minimo_centavos) });
    const ativa = el('input', { id: `m${m.id}-ativa`, type: 'checkbox', checked: m.ativo ? true : null });
    return el('form', { class: 'card', novalidate: true, onSubmit: async (e) => {
      e.preventDefault();
      const centavos = parseReais(valor.value);
      if (premio.value.trim().length < 2) return toast('Escreva o brinde ou desconto.', 'erro');
      if (!(centavos >= 100)) return toast('Valor inválido.', 'erro');
      await ocupado(e.submitter, async () => {
        const { error } = await sb.from('marks').update({ premio: premio.value.trim(), valor_minimo_centavos: centavos, ativo: ativa.checked }).eq('id', m.id);
        if (error) return toast('Não foi possível salvar.', 'erro');
        await recalcular(); await carregar();
      });
    } },
      el('div', { class: 'field' }, el('label', { for: `m${m.id}-premio`, text: 'Brinde ou desconto' }), premio),
      el('div', { class: 'field' }, el('label', { for: `m${m.id}-valor`, text: 'Quando a cliente chega em (R$)' }), valor),
      el('label', { class: 'check' }, ativa, el('span', { text: 'Marca ativa (aparece no cartão das clientes)' })),
      el('div', { class: 'row' },
        el('button', { class: 'btn pequeno', type: 'submit', text: 'Salvar' }),
        el('button', { class: 'btn sec pequeno', type: 'button', text: 'Excluir', onClick: async (e) => {
          if (!confirm(`Excluir a marca "${m.premio}"?`)) return;
          await ocupado(e.currentTarget, async () => {
            const { error } = await sb.from('marks').delete().eq('id', m.id);
            if (error) return toast('Essa marca já rendeu brindes. Desmarque "Marca ativa" em vez de excluir.', 'erro');
            toast('Marca excluída.'); await carregar();
          });
        } })));
  };

  const novaPremio = el('input', { id: 'n-premio', type: 'text', maxlength: 80, placeholder: 'Ex.: Brinde surpresa' });
  const novaValor = el('input', { id: 'n-valor', type: 'text', inputmode: 'decimal', placeholder: '250,00' });
  const nova = el('form', { class: 'card manteiga', novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    const centavos = parseReais(novaValor.value);
    if (novaPremio.value.trim().length < 2) return toast('Escreva o brinde ou desconto.', 'erro');
    if (!(centavos >= 100)) return toast('Valor inválido.', 'erro');
    await ocupado(e.submitter, async () => {
      const { error } = await sb.from('marks').insert({ ordem: proximaOrdem, valor_minimo_centavos: centavos, premio: novaPremio.value.trim() });
      if (error) return toast('Não foi possível criar a marca.', 'erro');
      await recalcular(); await carregar();
    });
  } },
    el('h2', { text: 'Nova marca' }),
    el('div', { class: 'field' }, el('label', { for: 'n-premio', text: 'Brinde ou desconto' }), novaPremio),
    el('div', { class: 'field' }, el('label', { for: 'n-valor', text: 'Quando a cliente chega em (R$)' }), novaValor),
    el('button', { class: 'btn bloco', type: 'submit', text: 'Criar marca' }));

  const zap = el('input', { id: 'zap-loja', type: 'tel', inputmode: 'tel', value: cfg.whatsapp_loja ?? '', autocomplete: 'off' });
  const formZap = el('form', { class: 'card', novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    const numero = whatsappBR(zap.value);
    if (!/^[0-9]{12,13}$/.test(numero)) return toast('Número inválido. Use DDD + número, por exemplo 89 9 9400-5912.', 'erro');
    await ocupado(e.submitter, async () => {
      const { error } = await sb.from('settings').update({ valor: numero }).eq('chave', 'whatsapp_loja');
      if (error) return toast('Não foi possível salvar o número.', 'erro');
      toast('WhatsApp da loja atualizado.'); await carregar();
    });
  } },
    el('h2', { text: 'WhatsApp da loja' }),
    el('p', { class: 'muda pequeno', text: 'É para esse número que vão os pedidos do mostruário e os pedidos de resgate de brinde. Com DDD; o 55 é opcional.' }),
    el('div', { class: 'field' }, el('label', { for: 'zap-loja', text: 'Número' }), zap),
    el('button', { class: 'btn bloco', type: 'submit', text: 'Salvar número' }));

  montar({
    kicker: 'painel da Ellen', titulo: 'Ajustes', raiz: '../', nav: NAV_ADMIN, ativo: 'config.html',
    acao: el('button', { class: 'btn sec pequeno', type: 'button', text: 'Sair', onClick: () => sair('../') }),
    conteudo: [
      el('div', { class: 'cols' },
        el('div', { class: 'stack' },
          el('h2', { text: 'Brindes e descontos' }),
          el('div', { class: 'aviso', text: 'Ao salvar, quem já passou do valor ganha o brinde na hora. Mudar valor ou desativar nunca tira um brinde que a cliente já ganhou.' }),
          marcas.length ? marcas.map(cartaoMarca) : el('div', { class: 'vazio', text: 'Nenhuma marca ainda. Crie a primeira ao lado.' })),
        el('div', { class: 'stack' }, nova, formZap)),
    ],
  });
}

// Só depois de todas as constantes acima existirem:
await carregar();
