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

## Estrutura principal

- `server.js`: backend Express, autenticacao, API e integracao com Supabase
- `public/index.html`: interface principal
- `public/app.js`: logica do frontend
- `public/styles.css`: visual responsivo
- `supabase/schema.sql`: script SQL para criar as tabelas no Supabase

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
