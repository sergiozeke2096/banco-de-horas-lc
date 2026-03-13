# Sistema Profissional de Cartao de Ponto

Sistema web mobile-first com:

- login real por sessao
- cadastro de funcionarios
- usuario administrador semeado automaticamente
- banco de dados centralizado no Supabase
- registros de ponto com data, hora e geolocalizacao
- visualizacao individual para funcionario
- visao total, resumo e exportacao CSV para administrador

## Credenciais do administrador

Defina o administrador pelo arquivo `.env`:

- `ADMIN_NAME`
- `ADMIN_PASSWORD`

## Configurar no Supabase

1. Abra o projeto `Tansporte LC` no Supabase.
2. Entre no SQL Editor.
3. Execute o script em `supabase/schema.sql`.
4. Copie a `Project URL` e a `service_role key`.
5. Crie um arquivo `.env` na raiz do projeto usando `.env.example` como base.

Exemplo:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
ADMIN_NAME=Lc transporte
ADMIN_PASSWORD=troque-a-senha-do-admin
SESSION_SECRET=uma-chave-forte
PORT=3000
ALLOW_LOCAL_STORAGE_FALLBACK=true
ANDROID_APP_URL=https://seu-app.onrender.com
```

## Como rodar

1. No terminal, entre na pasta do projeto.
2. Execute:

```powershell
cmd /c npm start
```

3. Abra:

- `http://localhost:3000`

## Publicacao online no Render

O projeto ja esta preparado para deploy no Render com o arquivo `render.yaml`.

Passos:

1. Suba este projeto para um repositorio GitHub.
2. No Render, crie um novo `Web Service`.
3. Conecte o repositorio.
4. O Render deve ler o arquivo `render.yaml` automaticamente.
5. Configure estas variaveis no painel do Render:

```env
SUPABASE_URL=https://cmdjeortnocxzoovswhf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
ADMIN_NAME=Lc transporte
ADMIN_PASSWORD=troque-a-senha-do-admin
SESSION_SECRET=uma-chave-forte
```

6. Depois do deploy, abra a URL `onrender.com` gerada pelo Render.

Observacoes:

- O endpoint de health check e `/api/health`.
- O app usa `npm start` como comando de inicializacao.
- O projeto esta configurado para Node 22.
- Em producao, prefira `ALLOW_LOCAL_STORAGE_FALLBACK=false` para impedir troca silenciosa para armazenamento local.

## Deploy em VPS

O projeto agora tambem esta preparado para subir em VPS Linux com Docker Compose.

Arquivos de deploy:

- `Dockerfile`
- `compose.vps.yml`
- `deploy/nginx/lc-banco-horas.conf`

Fluxo recomendado na VPS:

1. Instale `docker`, `docker compose` e `nginx`.
2. Copie o projeto para a VPS.
3. Crie o `.env` na raiz com as variaveis reais.
4. Suba o container com:

```bash
docker compose -f compose.vps.yml up -d --build
```

5. Configure o Nginx com `deploy/nginx/lc-banco-horas.conf`.
6. Ative HTTPS com Certbot.

Variaveis importantes para VPS:

- `ALLOW_LOCAL_STORAGE_FALLBACK=false`
- `TRUST_PROXY=1`
- `COOKIE_SECURE=true` quando estiver atras de HTTPS
- `COOKIE_SECURE=false` apenas se for testar temporariamente por IP/HTTP

Se quiser expor a porta diretamente sem Nginx, troque `127.0.0.1:3000:3000` por `3000:3000` em `compose.vps.yml`, mas o ideal para login por cookie continua sendo HTTPS.

## App Android

O projeto agora inclui uma base Android em `android/` usando Capacitor.

Importante:

- O backend Node continua hospedado fora do celular.
- Nao coloque `SUPABASE_SERVICE_ROLE_KEY` dentro do app Android.
- Antes de sincronizar o app nativo, publique o sistema web e defina `ANDROID_APP_URL` com a URL HTTPS publica.

Exemplo no `.env`:

```env
ANDROID_APP_URL=https://seu-app.onrender.com
```

Fluxo recomendado:

1. Faça o deploy web no Render.
2. Atualize `ANDROID_APP_URL` no `.env`.
3. Execute `cmd /c npm run android:sync`.
4. Abra o projeto nativo com `cmd /c npm run android:open`.
5. No Android Studio, gere o `APK` ou `AAB`.

Comandos uteis:

- `cmd /c npm run android:icons` para atualizar os icones do app com `public/logo-lc.jpg`
- `cmd /c npm run android:sync` para copiar configuracoes e assets para o projeto Android

Permissoes adicionadas ao app:

- Internet
- Localizacao aproximada
- Localizacao precisa

Se `ANDROID_APP_URL` nao estiver configurada, o app Android abre com um aviso de configuracao pendente para evitar um APK apontando para um backend inexistente.

## Estrutura principal

- `server.js`: backend Express, autenticacao, API e integracao com Supabase
- `public/index.html`: interface principal
- `public/app.js`: logica do frontend
- `public/styles.css`: visual responsivo
- `supabase/schema.sql`: script SQL para criar as tabelas no Supabase
- `capacitor.config.ts`: configuracao do app Android e URL remota do WebView
- `android/`: projeto Android nativo gerado pelo Capacitor

## Fluxos

### Funcionario

1. Faz cadastro com nome, matricula e senha.
2. Entra no sistema.
3. Registra `Inicio`, `Almoco`, `Termino do almoco` e `Termino`.
4. Ve apenas os proprios registros.

### Administrador

1. Entra com as credenciais configuradas em `ADMIN_NAME` e `ADMIN_PASSWORD`.
2. Ve todos os registros do sistema.
3. Filtra por matricula, veiculo e periodo para analisar operacao e exportacoes.
4. Cadastra, edita, redefine senha e exclui funcionarios sem historico.
5. Ve resumo consolidado por dia.
6. Exporta CSV e XLSX com o mesmo recorte aplicado nos filtros.

## Observacoes

- Esta versao passa a salvar usuarios e registros no projeto Supabase.
- As sessoes HTTP continuam locais no servidor Node.
- O backend valida a sequencia das batidas por dia: a primeira deve ser `Entrada`, almoco exige retorno e uma nova `Entrada` so e aceita depois de `Saida`.
- O painel do administrador agora lista funcionarios cadastrados e permite editar nome, matricula, senha e exclusao segura sem apagar historico.
- Os filtros administrativos de matricula, veiculo e periodo afetam registros, resumo e exportacoes.
- Para producao real, o ideal e adicionar HTTPS, redefinicao de senha, auditoria de acesso e deploy em servidor/cloud.
