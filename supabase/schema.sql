-- =====================================================================
-- Crochê com Ellen · cartão fidelidade + mostruário
-- Rode este arquivo inteiro no SQL Editor do Supabase (pode rodar de novo).
-- Depois: README.md > "Passo 3" (virar admin). Não há Edge Functions: tudo roda aqui, no banco.
--
-- Regras de segurança aplicadas aqui:
--   * RLS ligado em TODAS as tabelas; anon e authenticated começam sem acesso a nada
--   * cliente só lê as próprias linhas; ninguém escreve direto em compras, códigos ou pedidos
--   * código: uso único, gerado e validado por funções do banco (security definer, conferem login e admin)
--   * limite de tentativas erradas de código por conta e por IP
--   * admin = linha na tabela admins (nunca user_metadata)
--   * total do cartão é calculado a partir das compras (nenhuma coluna editável)
-- =====================================================================

-- ---------- 0. Tipos ----------
do $$ begin create type public.tipo_produto   as enum ('demanda','exclusiva');                  exception when duplicate_object then null; end $$;
do $$ begin create type public.status_codigo  as enum ('ativo','usado','invalidado');           exception when duplicate_object then null; end $$;
do $$ begin create type public.status_pedido  as enum ('aguardando','confirmado','cancelado');  exception when duplicate_object then null; end $$;

-- ---------- 1. Tabelas ----------
create table if not exists public.admins (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  nome              text not null check (char_length(nome) between 2 and 80),
  whatsapp          text check (whatsapp is null or whatsapp ~ '^[0-9]{10,13}$'),
  aceita_promocoes  boolean not null default false,
  termos_aceitos_em timestamptz not null,
  termos_versao     text not null,
  criado_em         timestamptz not null default now()
);

create table if not exists public.settings (
  chave text primary key check (char_length(chave) <= 40),
  valor text not null check (char_length(valor) <= 200)
);
insert into public.settings (chave, valor) values
  ('whatsapp_loja', '558994005912'),
  ('termos_versao', '2026-10')
on conflict (chave) do nothing;

create table if not exists public.marks (
  id                    smallint generated always as identity primary key,
  ordem                 smallint not null unique,
  valor_minimo_centavos integer  not null check (valor_minimo_centavos > 0),
  premio                text     not null check (char_length(premio) between 2 and 80),
  ativo                 boolean  not null default true
);
insert into public.marks (ordem, valor_minimo_centavos, premio)
select * from (values
  (1::smallint,  5000, 'Chaveiro mini de brinde'),
  (2::smallint, 12000, '10% de desconto'),
  (3::smallint, 25000, 'Brinde surpresa'),
  (4::smallint, 40000, '20% de desconto + brinde especial')
) as v(ordem, valor, premio)
where not exists (select 1 from public.marks);

create table if not exists public.products (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (char_length(nome) between 2 and 80),
  preco_centavos integer not null check (preco_centavos between 100 and 1000000),
  tipo           public.tipo_produto not null default 'demanda',
  quantidade     integer check (quantidade between 0 and 1000),
  prazo_texto    text check (prazo_texto is null or char_length(prazo_texto) <= 80),
  foto_path      text check (foto_path is null or foto_path ~ '^[a-zA-Z0-9/_.-]{1,120}$'),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  constraint quantidade_so_exclusiva check (
    (tipo = 'exclusiva' and quantidade is not null) or (tipo = 'demanda' and quantidade is null)
  )
);

-- Códigos de etiqueta: ELN + 5 caracteres (sem I, O, 0, 1). Criados só pela função gerar_codigos (admin).
create table if not exists public.codes (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique check (codigo ~ '^ELN[A-HJ-NP-Z2-9]{1,5}$'),
  peca              text not null check (char_length(peca) between 2 and 80),
  valor_centavos    integer not null check (valor_centavos between 100 and 1000000),
  lote              uuid not null,
  status            public.status_codigo not null default 'ativo',
  validade          date,
  criado_em         timestamptz not null default now(),
  criado_por        uuid references auth.users(id) on delete set null,
  usado_em          timestamptz,
  usado_por         uuid references auth.users(id) on delete set null,
  motivo_invalidacao text check (motivo_invalidacao is null or char_length(motivo_invalidacao) <= 200)
);
create index if not exists codes_lote_idx on public.codes (lote);
create index if not exists codes_criado_idx on public.codes (criado_em desc);

create table if not exists public.purchases (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete set null,  -- conta apagada: a venda fica anônima
  code_id        uuid unique references public.codes(id),
  descricao      text not null check (char_length(descricao) between 2 and 80),
  valor_centavos integer not null check (valor_centavos between 100 and 1000000),
  origem         text not null default 'codigo' check (origem in ('codigo','manual')),
  motivo         text check (motivo is null or char_length(motivo) <= 200),
  criado_em      timestamptz not null default now(),
  criado_por     uuid references auth.users(id) on delete set null,
  estornada_em   timestamptz,
  motivo_estorno text check (motivo_estorno is null or char_length(motivo_estorno) <= 200)
);
create index if not exists purchases_user_idx on public.purchases (user_id);

create table if not exists public.reward_claims (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  mark_id               smallint not null references public.marks(id),
  premio                text not null,
  valor_minimo_centavos integer not null,
  criado_em             timestamptz not null default now(),
  entregue_em           timestamptz,
  entregue_por          uuid references auth.users(id) on delete set null,
  unique (user_id, mark_id)                       -- cada marca só rende um brinde por cliente
);

create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  numero         integer generated always as identity unique,
  user_id        uuid references auth.users(id) on delete set null,
  status         public.status_pedido not null default 'aguardando',
  total_centavos integer not null check (total_centavos >= 0),
  observacao     text check (observacao is null or char_length(observacao) <= 300),
  reservado_ate  timestamptz,
  criado_em      timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders (user_id, criado_em desc);

create table if not exists public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  product_id     uuid references public.products(id) on delete set null,
  nome           text not null,
  preco_centavos integer not null check (preco_centavos > 0),   -- preço congelado no pedido
  quantidade     integer not null check (quantidade between 1 and 20)
);
create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.code_attempts (
  id        bigint generated always as identity primary key,
  user_id   uuid,
  ip        text,
  ok        boolean not null,
  criado_em timestamptz not null default now()
);
create index if not exists attempts_user_idx on public.code_attempts (user_id, criado_em desc);
create index if not exists attempts_ip_idx   on public.code_attempts (ip, criado_em desc);

-- Total do cartão: sempre calculado, nunca gravado.
create or replace view public.card_totals with (security_invoker = true) as
  select user_id, sum(valor_centavos)::int as total_centavos, count(*)::int as pecas
  from public.purchases
  where estornada_em is null and user_id is not null
  group by user_id;

-- ---------- 2. Funções de apoio ----------
create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- Cria o perfil quando a conta nasce. Exige aceite dos termos.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if coalesce(m->>'aceitou_termos', '') <> 'true' then
    raise exception 'termos_nao_aceitos';
  end if;
  insert into public.profiles (id, nome, whatsapp, aceita_promocoes, termos_aceitos_em, termos_versao)
  values (
    new.id,
    left(trim(coalesce(m->>'nome', '')), 80),
    nullif(regexp_replace(coalesce(m->>'whatsapp', ''), '\D', '', 'g'), ''),
    coalesce(m->>'aceita_promocoes', '') = 'true',
    now(),
    left(coalesce(m->>'termos_versao', '1'), 20)
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Ao entrar uma compra, cria (uma única vez) o brinde de cada marca alcançada.
create or replace function public.trg_purchase_claims()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t integer;
begin
  if new.user_id is null then return new; end if;
  select coalesce(sum(valor_centavos), 0) into t
    from public.purchases where user_id = new.user_id and estornada_em is null;
  insert into public.reward_claims (user_id, mark_id, premio, valor_minimo_centavos)
  select new.user_id, m.id, m.premio, m.valor_minimo_centavos
    from public.marks m where m.ativo and m.valor_minimo_centavos <= t
  on conflict (user_id, mark_id) do nothing;
  return new;
end $$;

drop trigger if exists purchases_claims on public.purchases;
create trigger purchases_claims after insert on public.purchases
  for each row execute function public.trg_purchase_claims();

-- ---------- 3. Códigos de etiqueta: gerar (admin) e validar (cliente) ----------
-- Funções antigas de versões anteriores deste arquivo:
drop function if exists public.redeem_code(text, uuid, text);

-- Gera um lote: ELN + 5 caracteres aleatórios (32 símbolos, sem I, O, 0, 1).
-- A aleatoriedade vem de gen_random_uuid() (fonte criptográfica do Postgres): usamos os 5
-- primeiros bytes, que são todos aleatórios (os bits fixos do UUID ficam nos bytes 6 e 8).
create or replace function public.gerar_codigos(p_peca text, p_valor integer, p_quantidade integer, p_validade_dias integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  peca text := trim(coalesce(p_peca, ''));
  lote uuid := gen_random_uuid();
  validade date;
  b bytea; cod text; i int; criados text[] := '{}'; tentativas int := 0; inseridos int;
begin
  if not public.eh_admin() then raise exception 'sem_permissao'; end if;
  if char_length(peca) < 2 or char_length(peca) > 80 then raise exception 'peca_invalida'; end if;
  if p_valor is null or p_valor < 100 or p_valor > 1000000 then raise exception 'valor_invalido'; end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 200 then raise exception 'quantidade_invalida'; end if;
  if p_validade_dias is not null and (p_validade_dias < 1 or p_validade_dias > 730) then raise exception 'validade_invalida'; end if;
  validade := case when p_validade_dias is null then null else current_date + p_validade_dias end;

  -- Se o código sorteado já existir, a coluna única descarta e sorteamos outro.
  while coalesce(array_length(criados, 1), 0) < p_quantidade and tentativas < p_quantidade * 5 + 20 loop
    tentativas := tentativas + 1;
    b := uuid_send(gen_random_uuid());
    cod := 'ELN';
    for i in 0..4 loop
      cod := cod || substr(alfabeto, (get_byte(b, i) & 31) + 1, 1);
    end loop;
    insert into public.codes (codigo, peca, valor_centavos, lote, validade, criado_por)
    values (cod, peca, p_valor, lote, validade, (select auth.uid()))
    on conflict (codigo) do nothing;
    get diagnostics inseridos = row_count;
    if inseridos = 1 then criados := criados || cod; end if;
  end loop;

  if coalesce(array_length(criados, 1), 0) < p_quantidade then raise exception 'falha_geracao'; end if;  -- desfaz tudo
  return jsonb_build_object('lote', lote, 'peca', peca, 'valor_centavos', p_valor, 'validade', validade, 'codigos', to_jsonb(criados));
end $$;

-- Valida e resgata um código (uso único). O navegador só envia o código;
-- peça e valor vêm da tabela, e a conta vem do login (auth.uid()), nunca do pedido.
create or replace function public.validar_codigo(p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cod text; meu_ip text; cabecalhos json; xff text; c public.codes%rowtype;
  falhas_user int; falhas_ip int; total int;
begin
  if uid is null then raise exception 'nao_autenticado'; end if;

  cod := upper(regexp_replace(coalesce(p_codigo, ''), '[\s-]', '', 'g'));
  if char_length(cod) < 4 or char_length(cod) > 8 then
    return jsonb_build_object('ok', false, 'erro', 'invalido');       -- tamanho absurdo nem consulta
  end if;

  -- IP de quem chamou, repassado pelo Supabase nos cabeçalhos da requisição.
  begin
    cabecalhos := current_setting('request.headers', true)::json;
    xff := cabecalhos->>'x-forwarded-for';
    meu_ip := coalesce(cabecalhos->>'cf-connecting-ip',
                   trim((string_to_array(coalesce(xff, ''), ','))[array_length(string_to_array(coalesce(xff, ''), ','), 1)]));
    meu_ip := left(nullif(meu_ip, ''), 45);
  exception when others then meu_ip := null;
  end;

  select count(*) into falhas_user from public.code_attempts
    where user_id = uid and not ok and criado_em > now() - interval '10 minutes';
  select count(*) into falhas_ip from public.code_attempts
    where code_attempts.ip is not null and code_attempts.ip = meu_ip and not ok and criado_em > now() - interval '10 minutes';
  if falhas_user >= 5 or falhas_ip >= 20 then
    return jsonb_build_object('ok', false, 'erro', 'limite');
  end if;

  -- Uma única instrução atômica: duas abas ao mesmo tempo, só uma vence.
  update public.codes
     set status = 'usado', usado_em = now(), usado_por = uid
   where codigo = cod and status = 'ativo'
     and (validade is null or validade >= current_date)
  returning * into c;

  if not found then
    insert into public.code_attempts (user_id, ip, ok) values (uid, meu_ip, false);
    return jsonb_build_object('ok', false, 'erro', 'invalido');   -- igual para inexistente, usado e vencido
  end if;

  insert into public.purchases (user_id, code_id, descricao, valor_centavos, origem)
  values (uid, c.id, c.peca, c.valor_centavos, 'codigo');
  insert into public.code_attempts (user_id, ip, ok) values (uid, meu_ip, true);

  select total_centavos into total from public.card_totals where user_id = uid;
  return jsonb_build_object('ok', true, 'peca', c.peca, 'valor_centavos', c.valor_centavos,
                            'total_centavos', coalesce(total, 0));
end $$;

-- ---------- 4. Pedido do mostruário (preço e estoque sempre vêm do banco) ----------
create or replace function public.criar_pedido(p_itens jsonb, p_obs text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  it jsonb; pid uuid; qtd int; prod public.products%rowtype;
  reservado int; total int := 0; oid uuid; num int; itens jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'nao_autenticado'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) < 1 or jsonb_array_length(p_itens) > 15 then
    raise exception 'itens_invalidos';
  end if;
  if (select count(*) from public.orders
        where user_id = uid and status = 'aguardando' and criado_em > now() - interval '1 day') >= 10 then
    raise exception 'muitos_pedidos';
  end if;

  insert into public.orders (user_id, total_centavos, observacao, reservado_ate)
  values (uid, 0, left(nullif(trim(p_obs), ''), 300), now() + interval '6 hours')
  returning id, numero into oid, num;

  for it in select * from jsonb_array_elements(p_itens) loop
    pid := (it->>'produto_id')::uuid;
    qtd := (it->>'quantidade')::int;
    if qtd is null or qtd < 1 or qtd > 20 then raise exception 'quantidade_invalida'; end if;

    select * into prod from public.products where id = pid and ativo for update;
    if not found then raise exception 'produto_indisponivel'; end if;

    if prod.tipo = 'exclusiva' then
      -- peças já reservadas em outros pedidos aguardando (e neste, se o item repetir)
      select coalesce(sum(oi.quantidade), 0) into reservado
        from public.order_items oi join public.orders o on o.id = oi.order_id
       where oi.product_id = pid and o.status = 'aguardando' and o.reservado_ate > now();
      if qtd > prod.quantidade - reservado then
        raise exception 'sem_estoque:%', prod.nome;
      end if;
    end if;

    insert into public.order_items (order_id, product_id, nome, preco_centavos, quantidade)
    values (oid, pid, prod.nome, prod.preco_centavos, qtd);
    total := total + prod.preco_centavos * qtd;
    itens := itens || jsonb_build_object('nome', prod.nome, 'quantidade', qtd, 'preco_centavos', prod.preco_centavos);
  end loop;

  update public.orders set total_centavos = total where id = oid;
  return jsonb_build_object('id', oid, 'numero', num, 'total_centavos', total, 'itens', itens);
end $$;

-- ---------- 5. Funções do painel da Ellen (cada uma confere se é admin) ----------
create or replace function public.confirmar_pedido(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; i record;
begin
  if not public.eh_admin() then raise exception 'sem_permissao'; end if;
  select * into o from public.orders where id = p_id for update;
  if not found or o.status <> 'aguardando' then raise exception 'pedido_nao_aguardando'; end if;
  for i in select oi.product_id, oi.quantidade, p.tipo
             from public.order_items oi join public.products p on p.id = oi.product_id
            where oi.order_id = p_id loop
    if i.tipo = 'exclusiva' then
      update public.products set quantidade = quantidade - i.quantidade
       where id = i.product_id and quantidade >= i.quantidade;
      if not found then raise exception 'sem_estoque'; end if;
    end if;
  end loop;
  update public.orders set status = 'confirmado', reservado_ate = null where id = p_id;
end $$;

create or replace function public.cancelar_pedido(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; i record;
begin
  if not public.eh_admin() then raise exception 'sem_permissao'; end if;
  select * into o from public.orders where id = p_id for update;
  if not found or o.status = 'cancelado' then raise exception 'pedido_nao_encontrado'; end if;
  if o.status = 'confirmado' then       -- devolve o estoque das peças exclusivas
    for i in select oi.product_id, oi.quantidade
               from public.order_items oi join public.products p on p.id = oi.product_id
              where oi.order_id = p_id and p.tipo = 'exclusiva' loop
      update public.products set quantidade = quantidade + i.quantidade where id = i.product_id;
    end loop;
  end if;
  update public.orders set status = 'cancelado', reservado_ate = null where id = p_id;
end $$;

create or replace function public.entregar_brinde(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'sem_permissao'; end if;
  update public.reward_claims set entregue_em = now(), entregue_por = (select auth.uid())
   where id = p_id and entregue_em is null;
  if not found then raise exception 'brinde_nao_encontrado'; end if;
end $$;

-- Depois que a Ellen cria ou muda marcas, quem já alcançou ganha o brinde (só adiciona, nunca tira).
create or replace function public.recalcular_brindes()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.eh_admin() then raise exception 'sem_permissao'; end if;
  with totais as (
    select user_id, sum(valor_centavos) as t from public.purchases
     where estornada_em is null and user_id is not null group by user_id
  ), novos as (
    insert into public.reward_claims (user_id, mark_id, premio, valor_minimo_centavos)
    select t.user_id, m.id, m.premio, m.valor_minimo_centavos
      from totais t join public.marks m on m.ativo and m.valor_minimo_centavos <= t.t
    on conflict (user_id, mark_id) do nothing
    returning 1
  )
  select count(*) into n from novos;
  return n;
end $$;

create or replace function public.lancar_compra_manual(p_user uuid, p_desc text, p_valor int, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'sem_permissao'; end if;
  if p_motivo is null or char_length(trim(p_motivo)) < 3 then raise exception 'motivo_obrigatorio'; end if;
  insert into public.purchases (user_id, descricao, valor_centavos, origem, motivo, criado_por)
  values (p_user, left(trim(p_desc), 80), p_valor, 'manual', left(trim(p_motivo), 200), (select auth.uid()));
end $$;

create or replace function public.estornar_compra(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid; t int;
begin
  if not public.eh_admin() then raise exception 'sem_permissao'; end if;
  if p_motivo is null or char_length(trim(p_motivo)) < 3 then raise exception 'motivo_obrigatorio'; end if;
  update public.purchases set estornada_em = now(), motivo_estorno = left(trim(p_motivo), 200)
   where id = p_id and estornada_em is null returning user_id into uid;
  if not found then raise exception 'compra_nao_encontrada'; end if;
  if uid is not null then
    select coalesce(sum(valor_centavos), 0) into t
      from public.purchases where user_id = uid and estornada_em is null;
    -- brinde ainda não entregue some se o total caiu abaixo da marca; entregue fica
    delete from public.reward_claims
     where user_id = uid and entregue_em is null and valor_minimo_centavos > t;
  end if;
end $$;

create or replace function public.invalidar_codigo(p_codigo text, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'sem_permissao'; end if;
  update public.codes set status = 'invalidado', motivo_invalidacao = left(trim(p_motivo), 200)
   where codigo = upper(trim(p_codigo)) and status = 'ativo';
  if not found then raise exception 'codigo_nao_ativo'; end if;
end $$;

-- LGPD: a cliente apaga a própria conta. Vendas ficam anônimas (user_id vira nulo).
create or replace function public.excluir_minha_conta()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'nao_autenticado'; end if;
  if exists (select 1 from public.admins where user_id = uid) then raise exception 'admin_nao_pode'; end if;
  delete from public.code_attempts where user_id = uid;
  delete from auth.users where id = uid;
end $$;

-- ---------- 6. Permissões (tudo fechado, depois abre o mínimo) ----------
alter table public.admins        enable row level security;
alter table public.profiles      enable row level security;
alter table public.settings      enable row level security;
alter table public.marks         enable row level security;
alter table public.products      enable row level security;
alter table public.codes         enable row level security;
alter table public.purchases     enable row level security;
alter table public.reward_claims enable row level security;
alter table public.orders        enable row level security;
alter table public.order_items   enable row level security;
alter table public.code_attempts enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- leitura
grant select on public.products, public.settings to anon;
grant select on public.products, public.settings, public.marks, public.profiles, public.codes,
                public.purchases, public.reward_claims, public.orders, public.order_items,
                public.card_totals to authenticated;
-- escrita direta (todas limitadas por RLS a admin, exceto o próprio perfil)
grant insert, update, delete on public.products, public.marks to authenticated;
grant update, insert on public.settings to authenticated;
grant update (nome, whatsapp, aceita_promocoes) on public.profiles to authenticated;
-- funções
grant execute on function public.eh_admin()                              to anon, authenticated;
grant execute on function public.criar_pedido(jsonb, text)               to authenticated;
grant execute on function public.confirmar_pedido(uuid)                  to authenticated;
grant execute on function public.cancelar_pedido(uuid)                   to authenticated;
grant execute on function public.entregar_brinde(uuid)                   to authenticated;
grant execute on function public.lancar_compra_manual(uuid, text, int, text) to authenticated;
grant execute on function public.recalcular_brindes()                    to authenticated;
grant execute on function public.estornar_compra(uuid, text)             to authenticated;
grant execute on function public.invalidar_codigo(text, text)            to authenticated;
grant execute on function public.excluir_minha_conta()                   to authenticated;
grant execute on function public.gerar_codigos(text, int, int, int)      to authenticated;
grant execute on function public.validar_codigo(text)                    to authenticated;

-- ---------- 7. Políticas de linha (RLS) ----------
drop policy if exists "settings_leitura"  on public.settings;
drop policy if exists "settings_admin_w"  on public.settings;
drop policy if exists "settings_admin_u"  on public.settings;
create policy "settings_leitura" on public.settings for select to anon, authenticated using (true);
create policy "settings_admin_w" on public.settings for insert to authenticated
  with check (public.eh_admin() and (chave <> 'whatsapp_loja' or valor ~ '^[0-9]{12,13}$'));
create policy "settings_admin_u" on public.settings for update to authenticated
  using (public.eh_admin())
  with check (public.eh_admin() and (chave <> 'whatsapp_loja' or valor ~ '^[0-9]{12,13}$'));

drop policy if exists "marks_leitura" on public.marks;
drop policy if exists "marks_admin"   on public.marks;
create policy "marks_leitura" on public.marks for select to authenticated using (ativo or public.eh_admin());
create policy "marks_admin"   on public.marks for all    to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists "products_leitura" on public.products;
drop policy if exists "products_admin"   on public.products;
create policy "products_leitura" on public.products for select to anon, authenticated using (ativo or public.eh_admin());
create policy "products_admin"   on public.products for all    to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists "profiles_ver"    on public.profiles;
drop policy if exists "profiles_editar" on public.profiles;
create policy "profiles_ver"    on public.profiles for select to authenticated using (id = (select auth.uid()) or public.eh_admin());
create policy "profiles_editar" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "codes_admin_ver" on public.codes;
create policy "codes_admin_ver" on public.codes for select to authenticated using (public.eh_admin());

drop policy if exists "purchases_ver" on public.purchases;
create policy "purchases_ver" on public.purchases for select to authenticated using (user_id = (select auth.uid()) or public.eh_admin());

drop policy if exists "claims_ver" on public.reward_claims;
create policy "claims_ver" on public.reward_claims for select to authenticated using (user_id = (select auth.uid()) or public.eh_admin());

drop policy if exists "orders_ver" on public.orders;
create policy "orders_ver" on public.orders for select to authenticated using (user_id = (select auth.uid()) or public.eh_admin());

drop policy if exists "order_items_ver" on public.order_items;
create policy "order_items_ver" on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o
           where o.id = order_id and (o.user_id = (select auth.uid()) or public.eh_admin()))
);
-- admins e code_attempts: RLS ligado e nenhuma política = ninguém acessa pela API.

-- ---------- 8. Storage: fotos dos produtos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "produtos_admin_insert" on storage.objects;
drop policy if exists "produtos_admin_update" on storage.objects;
drop policy if exists "produtos_admin_delete" on storage.objects;
create policy "produtos_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and public.eh_admin());
create policy "produtos_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'produtos' and public.eh_admin()) with check (bucket_id = 'produtos' and public.eh_admin());
create policy "produtos_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and public.eh_admin());
-- Leitura: o bucket é público (URL direta da foto); não há política de listagem.

-- ---------- 9. Opcional: limpar tentativas antigas (precisa da extensão pg_cron) ----------
-- select cron.schedule('limpa-tentativas', '0 4 * * *',
--   $$ delete from public.code_attempts where criado_em < now() - interval '7 days' $$);

-- ---------- 10. Torne a Ellen admin (rode UMA vez, depois que ela criar a conta) ----------
-- insert into public.admins (user_id) select id from auth.users where email = 'EMAIL_DA_ELLEN@exemplo.com';
