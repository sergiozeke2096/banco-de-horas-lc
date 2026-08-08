# Bater ponto por WhatsApp

## Aviso de risco (leia antes de ativar)

Esse bot usa a biblioteca **Baileys**, que automatiza um numero comum de WhatsApp sem passar
pela API oficial paga da Meta. Isso **viola os termos de uso do WhatsApp** — o numero usado pode
ser banido a qualquer momento, sem aviso previo, geralmente entre 2 e 8 semanas de uso segundo o
que foi levantado na pesquisa que fizemos. Essa foi uma decisao consciente do usuario pra evitar
custo (a API oficial passa a cobrar por mensagem a partir de 01/10/2026).

**Por isso**: o WhatsApp e um canal adicional de conveniencia, nunca o unico jeito de bater
ponto. O app/APK continua funcionando normalmente e e o caminho garantido.

## Como funciona

- Funcionario manda uma palavra-chave pro numero do bot: `INICIO`, `PARADA`, `RETORNO` ou
  `TERMINO` (aceita variacoes tipo `ENTRADA`, `ALMOCO`, `VOLTEI`, `FIM`, `SAIDA` — ver
  `KEYWORD_TO_ACTION` em [lib/whatsapp-bot.js](lib/whatsapp-bot.js)).
- Se for `INICIO` (ou qualquer acao sem veiculo em uso ativo), o bot pergunta a placa e o KM.
- Em seguida pede pra compartilhar a localizacao atual (recurso nativo do WhatsApp:
  anexo → Localizacao).
- Ao receber a localizacao, o ponto e registrado usando exatamente as mesmas regras de validacao
  do app (`createPunchRecord` em [server.js](server.js)).
- Numero que mandar mensagem sem estar vinculado a nenhum funcionario recebe um aviso pra pedir
  o cadastro ao administrador.

**Nao usa IA livre pra interpretar a mensagem** — so essas palavras-chave fixas. Isso e proposital:
alem de reduzir ambiguidade num sistema que alimenta folha de pagamento, a Meta baniu bots de IA
"livres" na propria plataforma em janeiro/2026.

## Como ativar (precisa ser feito manualmente, uma vez)

1. **Rodar a migracao no Supabase** (SQL Editor, mesmo processo ja feito antes):
   ```sql
   alter table public.users add column if not exists phone text;
   create index if not exists idx_users_phone on public.users (phone);
   ```
2. **Cadastrar o telefone dos funcionarios** que vao usar o bot — campo "Telefone (WhatsApp)" no
   cadastro/edicao de funcionario (aba Cadastros do painel admin/gestor). So digitos, com DDD
   (ex.: `47999998888`); o codigo do pais e adicionado automaticamente na comparacao.
3. **Adicionar `WHATSAPP_ENABLED=true` no `.env` da VPS** (por padrao vem desligado, pra nao
   tentar conectar em ambiente de teste/local).
4. **Reiniciar o servico** (`systemctl restart lc-banco-horas.service`) e acompanhar o log:
   ```
   journalctl -u lc-banco-horas.service -f
   ```
   Vai aparecer um **QR code em texto** no terminal.
5. **Escanear o QR code** com o WhatsApp do numero que vai atender os funcionarios (celular →
   Configuracoes → Aparelhos conectados → Conectar um aparelho). Esse numero precisa ter o
   WhatsApp app instalado normalmente (nao precisa ficar com o celular ligado o tempo todo depois
   de conectado, funciona como o WhatsApp Web).
6. A sessao fica salva na pasta `.whatsapp-auth/` (na raiz do projeto, na VPS) — **nao apagar
   nem versionar essa pasta** (esta no `.gitignore`; contem a credencial da sessao conectada). Se
   for apagada, precisa escanear o QR de novo.

## Se o numero for banido

Se o WhatsApp bloquear o numero, o bot para de funcionar (o log vai mostrar erro de conexao
repetido). Nesse caso: o app/APK continua funcionando normalmente — nao ha impacto no sistema
principal. Pra voltar a ter o canal de WhatsApp, seria necessario um numero novo (repetir os
passos 4-5) ou migrar pra API oficial da Meta (mudanca de arquitetura, nao coberta aqui).
