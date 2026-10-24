import { sb, fotoUrl } from '../supabase.js';
import { exigirAdmin, sair } from '../auth.js';
import { el, brl, parseReais, ocupado, toast, montar, icone, foto, NAV_ADMIN } from '../ui.js';

await exigirAdmin();
let tipo = 'demanda';

async function carregar() {
  const { data, error } = await sb.from('products').select('id,nome,preco_centavos,tipo,quantidade,prazo_texto,foto_path,ativo').order('criado_em', { ascending: false });
  if (error) toast('Não foi possível carregar os produtos.', 'erro');
  desenhar(data ?? []);
}

// Foto de celular tem vários MB: reduz para no máximo 1000px em JPEG antes de subir.
async function comprimir(arquivo) {
  const bmp = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
}

async function subirFoto(blob) {
  const caminho = `${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from('produtos').upload(caminho, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return caminho;
}

const lerComoDataUrl = (blob) => new Promise((ok, falha) => {
  const r = new FileReader();
  r.onload = () => ok(r.result); r.onerror = falha;
  r.readAsDataURL(blob);
});

// Campo de foto: tirar na hora (câmera) ou escolher da galeria. Devolve o elemento e um leitor do arquivo escolhido.
function campoFoto() {
  let blob = null;
  const previa = el('div', { 'aria-live': 'polite' });
  const botoes = el('div', { class: 'row' });
  const entrada = (capture) => el('input', {
    type: 'file', accept: 'image/*', capture: capture ? 'environment' : null,
    class: 'sr-only', tabindex: -1, 'aria-hidden': 'true',
    onChange: async (e) => {
      const arquivo = e.target.files[0];
      e.target.value = '';                                   // permite escolher a mesma foto de novo
      if (!arquivo) return;
      try { blob = await comprimir(arquivo); pintar(await lerComoDataUrl(blob)); }
      catch { toast('Não foi possível abrir essa foto. Tente outra.', 'erro'); }
    },
  });
  const camera = entrada(true);
  const galeria = entrada(false);

  function pintar(dataUrl) {
    previa.replaceChildren(dataUrl
      ? el('img', { class: 'previa', src: dataUrl, alt: 'Prévia da foto escolhida' })
      : el('div', { class: 'previa-vazia', text: 'Nenhuma foto escolhida' }));
    botoes.replaceChildren(
      el('button', { class: 'btn sec pequeno', type: 'button', onClick: () => camera.click() }, 'Tirar foto'),
      el('button', { class: 'btn sec pequeno', type: 'button', onClick: () => galeria.click() }, 'Escolher da galeria'),
      dataUrl ? el('button', { class: 'btn sec pequeno', type: 'button', text: 'Remover', onClick: () => { blob = null; pintar(null); } }) : null);
  }
  pintar(null);

  return {
    elemento: el('div', { class: 'field' }, el('span', { class: 'rotulo', text: 'Foto da peça' }), previa, botoes, camera, galeria),
    obter: () => blob,
  };
}

function desenhar(produtos) {
  const nome = el('input', { id: 'p-nome', type: 'text', maxlength: 80, required: true, placeholder: 'Ex.: Chaveiro de abacaxi' });
  const preco = el('input', { id: 'p-preco', type: 'text', inputmode: 'decimal', required: true, placeholder: '25,00' });
  const qtd = el('input', { id: 'p-qtd', type: 'number', inputmode: 'numeric', min: 1, max: 1000, value: 1 });
  const prazo = el('input', { id: 'p-prazo', type: 'text', maxlength: 80, placeholder: 'Ex.: Feito em cerca de 3 dias' });
  const campoQtd = el('div', { class: 'field', hidden: tipo === 'demanda' ? true : null }, el('label', { for: 'p-qtd', text: 'Quantidade disponível' }), qtd);
  const ajuda = el('span', { class: 'muda pequeno' });
  const abas = el('div', { class: 'abas', role: 'group', 'aria-label': 'Tipo da peça' });
  const fotoCampo = campoFoto();
  const pintarTipo = () => {
    abas.replaceChildren(
      el('button', { type: 'button', 'aria-pressed': String(tipo === 'demanda'), text: 'Sob demanda', onClick: () => { tipo = 'demanda'; pintarTipo(); } }),
      el('button', { type: 'button', 'aria-pressed': String(tipo === 'exclusiva'), text: 'Peça exclusiva', onClick: () => { tipo = 'exclusiva'; pintarTipo(); } }));
    campoQtd.hidden = tipo === 'demanda';
    ajuda.textContent = tipo === 'exclusiva'
      ? 'Aparece com a quantidade que sobrou e some do pedido quando esgota.'
      : 'Sem limite de quantidade: a Ellen faz depois que o pedido chega.';
  };
  pintarTipo();

  const form = el('form', { class: 'card', novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    const centavos = parseReais(preco.value);
    if (nome.value.trim().length < 2) return toast('Escreva o nome da peça.', 'erro');
    if (!(centavos >= 100)) return toast('Preço inválido.', 'erro');
    const quantidade = Number(qtd.value);
    if (tipo === 'exclusiva' && !(Number.isInteger(quantidade) && quantidade >= 1)) return toast('Informe a quantidade disponível.', 'erro');
    await ocupado(e.submitter, async () => {
      try {
        const escolhida = fotoCampo.obter();
        const foto_path = escolhida ? await subirFoto(escolhida) : null;
        const { error } = await sb.from('products').insert({
          nome: nome.value.trim(), preco_centavos: centavos, tipo,
          quantidade: tipo === 'exclusiva' ? quantidade : null,
          prazo_texto: prazo.value.trim() || null, foto_path,
        });
        if (error) throw error;
        toast('Peça salva e já aparece no mostruário.'); await carregar();
      } catch { toast('Não foi possível salvar a peça.', 'erro'); }
    });
  } },
    el('h2', { text: 'Cadastrar peça' }),
    el('div', { class: 'field' }, el('label', { for: 'p-nome', text: 'Nome da peça' }), nome),
    fotoCampo.elemento,
    el('div', { class: 'field' }, el('label', { for: 'p-preco', text: 'Preço (R$)' }), preco),
    el('div', { class: 'field' }, el('span', { class: 'rotulo', text: 'Tipo' }), abas, ajuda),
    campoQtd,
    el('div', { class: 'field' }, el('label', { for: 'p-prazo', text: 'Prazo (opcional)' }), prazo),
    el('button', { class: 'btn bloco', type: 'submit', text: 'Salvar no mostruário' }));

  const mudar = (id, campos, ok) => async (e) => ocupado(e.currentTarget, async () => {
    const { error } = await sb.from('products').update(campos).eq('id', id);
    if (error) return toast('Não foi possível atualizar.', 'erro');
    if (ok) toast(ok); await carregar();
  });

  // Trocar a foto de uma peça que já existe: no celular o sistema oferece câmera ou galeria.
  const trocarFoto = (p) => {
    const entrada = el('input', {
      type: 'file', accept: 'image/*', class: 'sr-only', tabindex: -1, 'aria-hidden': 'true',
      onChange: async (e) => {
        const arquivo = e.target.files[0];
        if (!arquivo) return;
        try {
          const novo = await subirFoto(await comprimir(arquivo));
          const { error } = await sb.from('products').update({ foto_path: novo }).eq('id', p.id);
          if (error) throw error;
          if (p.foto_path) await sb.storage.from('produtos').remove([p.foto_path]);   // apaga a foto antiga
          toast('Foto atualizada.'); await carregar();
        } catch { toast('Não foi possível trocar a foto.', 'erro'); }
      },
    });
    return el('span', {}, entrada, el('button', { class: 'btn sec pequeno', type: 'button', text: p.foto_path ? 'Trocar foto' : 'Adicionar foto', onClick: () => entrada.click() }));
  };

  const lista = el('div', { class: 'stack' },
    el('h2', { text: `No mostruário (${produtos.length})` }),
    produtos.length ? produtos.map((p) => {
      const url = fotoUrl(p.foto_path);
      return el('div', { class: 'item coluna' },
        el('div', { class: 'row between' },
          el('div', { class: 'row' }, foto(url, '', 'thumb'), el('strong', { text: p.nome })),
          el('strong', { text: brl(p.preco_centavos) })),
        el('div', { class: 'row between' },
          el('span', { class: 'selo' + (p.tipo === 'exclusiva' ? ' manteiga' : ''), text: p.tipo === 'exclusiva' ? 'Peça exclusiva' : 'Sob demanda' }),
          p.ativo ? null : el('span', { class: 'selo cinza', text: 'Escondida' }),
          p.tipo === 'exclusiva' ? el('div', { class: 'row' },
            el('button', { class: 'passo', type: 'button', 'aria-label': `Diminuir estoque de ${p.nome}`, text: '−', disabled: p.quantidade <= 0 ? true : null, onClick: mudar(p.id, { quantidade: p.quantidade - 1 }) }),
            el('span', { style: { fontWeight: 800, minWidth: '72px', textAlign: 'center' }, text: p.quantidade === 0 ? 'Esgotado' : `${p.quantidade} ${p.quantidade === 1 ? 'peça' : 'peças'}` }),
            el('button', { class: 'passo cheio', type: 'button', 'aria-label': `Aumentar estoque de ${p.nome}`, text: '+', onClick: mudar(p.id, { quantidade: p.quantidade + 1 }) })) : null),
        el('div', { class: 'row' },
          trocarFoto(p),
          el('button', { class: 'btn sec pequeno', type: 'button', text: p.ativo ? 'Esconder do mostruário' : 'Mostrar no mostruário', onClick: mudar(p.id, { ativo: !p.ativo }) }),
          el('button', { class: 'btn sec pequeno', type: 'button', text: 'Excluir', onClick: async (e) => {
            if (!confirm(`Excluir "${p.nome}" do mostruário?`)) return;
            await ocupado(e.currentTarget, async () => {
              const { error } = await sb.from('products').delete().eq('id', p.id);
              if (error) return toast('Não foi possível excluir.', 'erro');
              if (p.foto_path) await sb.storage.from('produtos').remove([p.foto_path]);
              toast('Peça excluída.'); await carregar();
            });
          } })));
    }) : el('div', { class: 'vazio', text: 'Cadastre a primeira peça ao lado.' }));

  montar({
    kicker: 'painel da Ellen', titulo: 'Produtos', raiz: '../', nav: NAV_ADMIN, ativo: 'produtos.html',
    acao: el('button', { class: 'btn sec pequeno', type: 'button', text: 'Sair', onClick: () => sair('../') }),
    conteudo: [el('div', { class: 'cols' }, form, lista)],
  });
}

// Só depois de todas as funções acima existirem:
await carregar();
