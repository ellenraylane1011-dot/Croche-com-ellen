# Crochê com Ellen · cartão fidelidade + mostruário

Site mobile-first em HTML, CSS e JS puro (sem build) com Supabase para banco, login e fotos. Não usa Edge Functions: toda a lógica de servidor (gerar e validar códigos, pedidos, ações da Ellen) são funções SQL, então não há CLI nem deploy para manter.

## Como funciona

- **Cliente:** cria conta, digita o código da etiqueta (`ELN` + 5 caracteres, uso único) e soma no cartão. Marcas dão brinde ou desconto. No mostruário monta o pedido, que sai pronto para o WhatsApp da Ellen (sem pagamento no site).
- **Ellen (admin):** vê clientes e compras, entrega brindes, confirma pedidos, cadastra produtos (sob demanda ou exclusivo com quantidade) e gera/imprime etiquetas.

## Passo 1 · Projeto Supabase

1. Crie um projeto em supabase.com.
2. **Project Settings > API:** copie a *Project URL* e a chave *anon*. Cole em `js/config.js`. Nunca use a `service_role` no site.
3. **Authentication:**
   - *Providers > Email:* **desligue** "Confirm email" (a cliente entra na hora, sem confirmar e-mail) e ponha senha mínima de **8**.
   - *URL Configuration:* **Site URL** = endereço do site; em **Redirect URLs** adicione `.../cartao.html` e `.../redefinir.html` (e `http://localhost:8080/...` para testes).
   - Configure um **SMTP próprio** só para o e-mail de "esqueci a senha" (o embutido do Supabase tem limite baixo). Sem confirmação de cadastro, é o único e-mail que o site manda.
   - Em *Bot and Abuse Protection*, se aparecerem contas falsas, ligue CAPTCHA (hCaptcha ou Cloudflare Turnstile).

## Passo 2 · Banco, segurança e storage

No **SQL Editor**, cole todo o `supabase/schema.sql` e rode. Pode rodar de novo sem problema. Ele cria:

- tabelas, regras de acesso (RLS) e permissões mínimas;
- funções do banco: `gerar_codigos` (admin) e `validar_codigo` (cliente logada, uso único, com limite de tentativas), `criar_pedido` (preço e estoque vêm do banco) e as ações da Ellen;
- o bucket `produtos` (fotos) com escrita só para admin.

## Passo 3 · Torne a Ellen admin

1. A Ellen cria a conta normalmente pelo site e confirma o e-mail.
2. No SQL Editor, rode (troque o e-mail):

```sql
insert into public.admins (user_id) select id from auth.users where email = 'EMAIL_DA_ELLEN@exemplo.com';
```

Ao entrar, ela cai direto no painel. O número do WhatsApp da loja fica na tabela `settings` (chave `whatsapp_loja`, hoje `558994005912`; se o link não abrir, tente com o nono dígito: `5589994005912`).

## Publicar na Vercel

Projeto estático: na Vercel use *Framework Preset: Other*, sem comando de build e pasta de saída na raiz. O `vercel.json` já traz os cabeçalhos de segurança.

## Rodar localmente

```bash
python3 -m http.server 8080
# abra http://localhost:8080
```

## Segurança, em resumo

| Risco | Como está fechado |
|---|---|
| Ler dados de outras clientes | RLS em todas as tabelas; cliente só vê as próprias linhas |
| Inventar valor ou peça de um código | O navegador só envia o código; o banco busca peça e valor |
| Usar o mesmo código duas vezes | `UPDATE ... WHERE status='ativo'` atômico + coluna única de compra por código |
| Chutar códigos | 5 erros/10 min por conta e 20/10 min por IP; resposta igual para inexistente, usado e vencido |
| Virar admin | Só pela tabela `admins`, sem acesso pela API; nunca por `user_metadata` |
| Alterar o próprio total | Total é calculado (`card_totals`); ninguém grava compras direto |
| Preço adulterado no pedido | `criar_pedido` usa o preço do banco e congela no pedido |
| Peça exclusiva vendida duas vezes | Reserva de 6 h por pedido aguardando; baixa de estoque só na confirmação |
| XSS | Texto de usuário só entra na tela por `textContent`; CSP em todas as páginas |
| Fotos | Bucket só aceita JPG/PNG/WebP até 2 MB; escrita só do admin |
| LGPD | Aceite com data e versão, edição de dados e exclusão de conta |

Veja o documento "Brechas e riscos" para o que ainda falta (backup, SMTP, domínio, monitoramento).

## O que NÃO foi testado

O SQL foi testado em um Postgres local simulando o Supabase (permissões, RLS, geração e resgate de código, limite por conta e por IP, pedidos, exclusão de conta). O site ainda **não** foi executado contra um projeto Supabase real, e o IP vem dos cabeçalhos que o Supabase repassa ao banco (confirme com um teste real): faça um roteiro de testes com 2 contas de cliente e 1 admin antes de lançar.
