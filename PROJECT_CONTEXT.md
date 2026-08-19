# Project Context

## Projeto

- Nome: Banco de Horas LC / Cartao de Ponto LC Transporte
- Stack principal: Node.js + Express + Supabase + frontend estatico em `public/`
- App Android: shell Capacitor em `android/`
- Arquivo principal do backend: [server.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/server.js)

## Regras de trabalho combinadas

- Trabalhar localmente primeiro.
- So publicar na VPS depois de validar e com autorizacao explicita.
- Evitar alterar o app online enquanto houver usuarios usando o sistema.
- Explicar antes de editar arquivos.
- Se o pedido for revisao ou investigacao, nao alterar codigo sem confirmar.

## VPS e deploy

- VPS atual: `root@212.85.13.188`
- Hostname da VPS atual: `srv1505747`
- Caminho do app na VPS: `/home/sergio/apps/lc-banco-horas`
- Service `systemd`: `lc-banco-horas.service`
- URL publica atual: `https://212.85.13.188.sslip.io`
- Healthcheck publico: `https://212.85.13.188.sslip.io/api/health`
- O link HTTP antigo em `http://212.85.13.188` agora redireciona para a URL HTTPS acima
- O nginx publica a VPS em `HTTPS` com Let's Encrypt e o app Node escuta localmente em `127.0.0.1:3100`
- O Node da VPS foi instalado em `/home/sergio/.local/node`
- O deploy atual usa `.env` proprio na VPS com `NODE_ENV=production`, `PORT=3100`, `TRUST_PROXY=1` e `COOKIE_SECURE=true`

## Admin

- O admin e configurado por ambiente.
- As credenciais ficam no `.env` local e no `.env` da VPS.
- Evitar registrar senha em documentos de contexto.
- A rotina do admin em [server.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/server.js) foi ajustada para nao sobrescrever automaticamente a senha existente do admin a cada inicializacao.
- Motivo do problema anterior de login: a senha valida e sempre a que estiver no banco (`password_hash`), nao apenas a do `.env`.

## Estado atual do web app

- O app foi publicado com sucesso na nova VPS em `http://212.85.13.188`.
- O acesso principal do app passou a usar `HTTPS` em `18/03/2026` por causa da geolocalizacao.
- O healthcheck publico da nova VPS respondeu `{"ok":true}` em `18/03/2026`.
- O login do admin na nova VPS tambem foi validado com sucesso em `18/03/2026`.
- O painel admin online foi atualizado em `18/03/2026` para esconder as listas completas de veiculos e funcionarios e usar busca antes de gerenciar/excluir.
- O painel admin online foi ajustado novamente em `18/03/2026` para manter os cadastros ocultos por padrao, mostrar sugestoes na busca de veiculos e permitir digitacao livre nos filtros de "Todos os registros".
- O resumo administrativo online foi ajustado em `18/03/2026` para mostrar por padrao as ultimas `48h` quando nao houver filtro de data.
- A geolocalizacao foi corrigida em `18/03/2026` com a ativacao de `HTTPS` em `https://212.85.13.188.sslip.io`.
- O botao/banner de atualizacao do APK foi removido da interface web.
- A versao do APK tambem foi removida da interface.
- O painel admin local agora tem acao para corrigir data/hora de registros de ponto ja lancados, com validacao de sequencia e acesso restrito ao administrador.
- A correcao administrativa de registros local tambem permite ajustar o KM do ponto e recalcula o KM atual do veiculo.
- O painel admin local agora tambem permite alterar o tipo da batida (`Inicio`, `Parada`, `Retorno` ou `Termino`) e excluir registros, sempre com validacao de sequencia antes de salvar.
- O painel admin local agora tambem permite ao administrador salvar/excluir correcao de registro mesmo quando a sequencia da jornada fica inconsistente; nesses casos o sistema mostra aviso em vez de bloquear.
- O resumo administrativo local voltou a aparecer por padrao nas ultimas `48h`, com botao para o administrador ocultar ou mostrar quando quiser.
- Os assets web publicados passaram a usar novo `cache-busting` em `21/03/2026` para evitar navegador preso em JS/CSS antigo depois do deploy.
- O app web online foi republicado em `21/03/2026` com:
  - correcao administrativa de horario e KM
  - resumo de `48h` visivel por padrao com botao para ocultar/mostrar
- O app web online foi republicado novamente em `23/03/2026` com a correcao do download da planilha XLSX no Android usando link assinado temporario para evitar falha de sessao/cookie no WebView.
- O healthcheck publico da VPS respondeu `{"ok":true}` novamente em `23/03/2026` apos a publicacao mais recente.
- O foco atual e estabilizar o APK localmente antes de qualquer novo deploy.

## Estado atual do APK

- O projeto Android usa Capacitor.
- `capacitor.config.ts` usa `appendUserAgent` para identificar o shell Android.
- Versao atual no projeto:
  - `versionCode 9`
  - `versionName 1.1.7`
- O build debug local foi gerado com sucesso em:
  - [app-debug.apk](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/android/app/build/outputs/apk/debug/app-debug.apk)
- O APK `1.1.2` foi regenerado em `18/03/2026` apontando para `https://212.85.13.188.sslip.io` via `ANDROID_APP_URL`.
- O APK `1.1.3` foi gerado e publicado em `23/03/2026` apontando para `https://212.85.13.188.sslip.io` via `ANDROID_APP_URL`.
- O APK `1.1.4` foi gerado e publicado em `31/03/2026` apontando para `https://212.85.13.188.sslip.io` via `ANDROID_APP_URL`.
- O APK `1.1.5` foi gerado e publicado em `05/08/2026` com: splash screen com a logo da LC Transportes (antes era o logo generico do Capacitor) e uma tela nativa de "sem conexao" com botao de tentar novamente (implementada em `MainActivity.java` via subclasse de `BridgeWebViewClient`).
- O link publico atual do APK e `https://212.85.13.188.sslip.io/apk/lc-transporte-1.1.5.apk`.
- **Correcao importante de tamanho do APK em `05/08/2026`**: o `capacitor.config.ts` usava `webDir: "public"`, entao todo `public/apk/*.apk` (os APKs de versoes antigas) era empacotado dentro de cada novo APK via `npx cap sync`/`cap copy`. Isso causava inflacao progressiva (1.1.4 chegou a 46MB so por isso; um build intermediario chegou a 98MB). Corrigido trocando `webDir` para uma pasta minima `capacitor-fallback/` (so usada quando o app roda sem `ANDROID_APP_URL` configurado). Os APKs antigos (`1.1.0` a `1.1.4`) foram movidos de `public/apk/` para `apk-archive/` (fora da pasta servida ao Capacitor) para nao acontecer de novo. Apos a correcao, o APK `1.1.5` ficou com `6.8MB`.
- Tambem foi necessario um `gradlew clean` antes do build final: um build incremental ficou com o `.apk` fisicamente maior (98MB) do que o conteudo real listado pelo `unzip -l` (~12MB), sinal de artefato incremental corrompido/desatualizado do Gradle.
- **APK `1.1.6` (`05/08/2026`)**: usuario relatou que o APK "baixa e fica na tela de baixar" ao tentar atualizar pelo popup interno. Suspeita: a nova tela de "sem conexao" (adicionada no `1.1.5`) pode ter capturado um erro espurio de navegacao principal quando o WebView navega para a URL do `.apk` (essa navegacao e abortada de proposito pq vira download, e isso pode dispersar `onReceivedError` em alguns WebViews). Corrigido com uma flag `suppressOfflineErrorOnce` em `MainActivity.java`: qualquer erro de carregamento da pagina principal logo apos o `DownloadListener` disparar um download (APK ou planilha) e ignorado, ja que nesse caso o "erro" e esperado e nao e falha de conexao real.
- Pendente: confirmar com o usuario apos instalar o `1.1.6` se o problema de "fica na tela de baixar" foi resolvido; a causa exata nao foi 100% confirmada em dispositivo real (nao ha emulador/celular conectado neste ambiente de desenvolvimento).

## APK: trabalho recente feito localmente

- O fluxo de download da planilha foi ajustado localmente para o Android usar o `DownloadManager`.
- O fluxo de download da planilha no frontend local foi ajustado novamente em `23/03/2026` para o Android pedir um link assinado temporario em `/api/admin/export.xlsx/link` e abrir `/api/admin/export.xlsx/direct`, evitando depender da sessao/cookie no download do WebView.
- O frontend agora dispara download direto para o shell Android em [public/app.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/public/app.js).
- O Android tenta abrir automaticamente arquivos XLSX baixados em [MainActivity.java](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/android/app/src/main/java/com/lctransporte/bancodehoras/MainActivity.java).
- O frontend do APK voltou a verificar `public/apk/latest.json` e agora abre automaticamente um popup de atualizacao quando detecta versao nova do app no shell Android.
- O popup de atualizacao do APK foi preparado localmente para reaparecer em novas versoes e rechecado periodicamente durante a sessao.
- A versao `1.1.3` do APK e o manifesto `public/apk/latest.json` foram publicados na VPS em `23/03/2026`.
- O APK `1.1.4` e o manifesto `public/apk/latest.json` foram publicados na VPS em `31/03/2026`.
- O fluxo local do funcionario agora permite trocar de veiculo no meio da jornada sem encerrar o ponto.
- A troca de veiculo foi separada das batidas normais e precisa manter resumo e horas do dia corretos mesmo quando houver mais de um veiculo na mesma jornada.
- Veiculos em uso por um funcionario com jornada ativa nao devem aparecer como disponiveis para outros funcionarios, e o backend precisa bloquear essa selecao mesmo com tela desatualizada.
- O fluxo local do funcionario foi ajustado em `30/03/2026` para pedir veiculo e KM apenas no `Inicio` e no `Termino`; `Parada` e `Retorno` reaproveitam automaticamente o veiculo ativo e o KM atual da jornada.
- O frontend local do funcionario agora esconde visualmente os campos e a exibicao de KM no fluxo de login/registro de ponto, mas continua preenchendo esse dado automaticamente com o KM atual salvo do veiculo para facilitar uma futura reativacao.
- O resumo local e a exportacao XLSX agora reconhecem a carga horaria personalizada de `09:18` do funcionario Everton Ricardo tambem pelo nome, sem depender apenas da matricula.
- Essa alteracao de interface do funcionario foi publicada na VPS em `04/05/2026` com troca de `public/index.html` e `public/app.js`, mantendo backup remoto em `/home/sergio/apps/lc-banco-horas/backups/20260504-115454/public/`.
- Depois desse deploy de `04/05/2026`, os healthchecks local (`127.0.0.1:3100/api/health`) e publico (`https://212.85.13.188.sslip.io/api/health`) responderam `{\"ok\":true}` e o HTML publico passou a apontar para `app.js?v=20260504-01`.
- Essas mudancas locais receberam autorizacao e foram publicadas na VPS em `30/03/2026`.
- O app web online foi republicado em `30/03/2026` com o ajuste de veiculo/KM apenas no `Inicio` e no `Termino`; `Parada` e `Retorno` agora reaproveitam o veiculo ativo e o KM atual.
- O healthcheck local da VPS (`127.0.0.1:3100/api/health`) e o publico (`https://212.85.13.188.sslip.io/api/health`) responderam `{\"ok\":true}` em `30/03/2026` apos a publicacao.
- O backend online foi atualizado em `31/03/2026` apenas no `server.js` para o login do admin aceitar tambem aliases comuns como `admin` e `adm`, alem de busca sem diferenca entre maiusculas/minusculas no identificador.
- O deploy de `31/03/2026` teve backup remoto de `server.js` antes da troca e o service `lc-banco-horas.service` voltou `active`.
- O healthcheck local da VPS (`127.0.0.1:3100/api/health`) respondeu `{\"ok\":true}` novamente em `31/03/2026` apos esse deploy.
- O app web online foi republicado novamente em `31/03/2026` com a ampliacao do painel admin para editar qualquer registro de ponto, incluindo tipo da batida (`Inicio`, `Parada`, `Retorno`, `Termino`), horario, KM e exclusao com validacao de sequencia.
- O deploy online de `31/03/2026` teve novo backup remoto de `server.js` em `/home/sergio/apps/lc-banco-horas/backups/20260331-211355/server.js`, restart do service `lc-banco-horas.service` e healthchecks local/public respondendo `{\"ok\":true}`.
- O app web online foi republicado de novo em `31/03/2026` para o admin conseguir salvar/excluir correcao de ponto mesmo quando a sequencia da jornada fica inconsistente; nesses casos a interface agora mostra aviso em vez de bloquear.
- Esse deploy online de `31/03/2026` teve backup remoto de `server.js` em `/home/sergio/apps/lc-banco-horas/backups/20260401-012429/server.js`, restart do `lc-banco-horas.service` e healthchecks local/public respondendo `{\"ok\":true}`.
- A validacao remota de login do admin em `31/03/2026` continuou retornando `Credenciais invalidas.` mesmo usando `ADMIN_NAME`, `admin` e a `ADMIN_PASSWORD` do `.env` da propria VPS; isso reforca que a senha valida do admin no ambiente online segue sendo a gravada no banco (`password_hash`).
- A senha do admin online foi sincronizada diretamente no banco em `31/03/2026` para voltar a bater com a `ADMIN_PASSWORD` do `.env` da VPS.
- Depois dessa sincronizacao em `31/03/2026`, o login publico do admin voltou a responder com sucesso tanto por `ADMIN_NAME` quanto pelo alias `admin`.
- A validacao publica do manifesto `https://212.85.13.188.sslip.io/apk/latest.json` e do download do APK `1.1.4` respondeu com sucesso em `31/03/2026`.
- O backend local foi ajustado em `02/04/2026` para o login do admin aceitar a `ADMIN_PASSWORD` atual do `.env` mesmo se o `password_hash` salvo estiver desatualizado; ao entrar, o sistema resincroniza automaticamente o hash do admin para evitar novo erro de `Credenciais invalidas.` no APK.
- Esse ajuste do login do admin foi publicado na VPS em `02/04/2026` apenas com troca do [server.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/server.js), mantendo backup remoto em `/home/sergio/apps/lc-banco-horas/backups/20260402-113938/server.js`.
- Depois do deploy de `02/04/2026`, o service `lc-banco-horas.service` voltou `active`, os healthchecks local (`127.0.0.1:3100/api/health`) e publico (`https://212.85.13.188.sslip.io/api/health`) responderam `{\"ok\":true}`, e o login do admin na propria VPS respondeu `200` tanto por `ADMIN_NAME` quanto pelo alias `admin`.
- O backend online foi atualizado em `07/05/2026` com a troca de `lib/timecard-workbook.js` para o resumo/exportacao reconhecer a carga horaria de `09:18` do Everton Ricardo tambem pelo nome, sem depender apenas da matricula.
- Esse deploy online de `07/05/2026` teve backup remoto de `lib/timecard-workbook.js` em `/home/sergio/apps/lc-banco-horas/backups/20260507-011438/lib/timecard-workbook.js`, restart do `lc-banco-horas.service` e healthchecks local/public respondendo `{\"ok\":true}`.
- O backend online foi atualizado em `02/07/2026` com a troca de `server.js` para buscar registros do Supabase em paginas de `1000` linhas, corrigindo o corte da exportacao XLSX que parava por volta dos dias `20/21`.
- Esse deploy online de `02/07/2026` teve backup remoto de `server.js` em `/home/sergio/apps/lc-banco-horas/backups/20260702-094710/server.js`, restart do `lc-banco-horas.service` e healthchecks local/public respondendo `{\"ok\":true}`.
- **Bug corrigido em `05/08/2026`**: o resumo administrativo sem filtro de data (janela padrao de 48h) cortava os registros brutos para as ultimas 48h *antes* de calcular as horas. Se a Entrada de um turno ficasse fora dessa janela mas a Saida dentro (comum em jornada noturna/madrugada), a Entrada era descartada e o turno aparecia com `00:00` trabalhado. Corrigido calculando o resumo sempre com o historico completo e filtrando por recencia (`lastEventAt`) so depois, em cima do resumo ja fechado — em `lib/timecard-workbook.js` (`computeSummary`) e `server.js` (rota `/api/admin/summary`). Teste de regressao adicionado em `test/server.test.js`. Suite completa: `41/41` passando.
- Esse deploy online de `05/08/2026` teve backup remoto de `server.js` e `lib/timecard-workbook.js` em `/home/sergio/apps/lc-banco-horas/backups/20260805-040609/`, restart do `lc-banco-horas.service` e healthchecks local/public respondendo `{\"ok\":true}`.
- **Importante para deploys futuros**: o usuario `sergio` (alias SSH `sergi-vps-future-apps-2026-03-12`) NAO consegue rodar `systemctl restart lc-banco-horas.service` (pede senha de sudo interativa, falha em modo nao interativo). Para reiniciar o servico via SSH sem senha, usar `root@212.85.13.188` diretamente (mesma chave `~/.ssh/id_ed25519` autentica como root e nao pede senha).

## Melhorias implementadas em 05/08/2026 (fila offline, release assinado, dashboard)

Trabalho feito **apenas localmente** ainda, sem publicar na VPS nem no APK publico. Ver `C:\Users\sergi\.claude\plans\nested-skipping-lark.md` para o plano completo aprovado.

- **Fila offline de ponto**: se a rede falhar ao bater ponto, o registro fica salvo no `localStorage` do celular (`public/app.js`, funcoes `enqueuePendingPunch`/`trySyncQueue`/`renderPendingPunchUI`) e reenviado automaticamente quando a internet voltar (evento `online`, checagem periodica a cada 30s, e ao voltar o app pro primeiro plano). Erros reais de validacao (409, veiculo invalido, etc.) ficam visiveis com opcao de "Tentar novamente"/"Descartar", nunca sao silenciosamente perdidos nem re-tentados para sempre.
  - Novo campo `client_request_id` (unique, nullable) em `time_records` — usado para deduplicar reenvios. **Requer rodar manualmente no SQL editor do Supabase**: `alter table public.time_records add column if not exists client_request_id text unique;` (ja documentado em `supabase/schema.sql`, mas o Supabase de producao precisa receber esse comando manualmente antes de qualquer deploy do `server.js` novo, senao o insert de registros vai falhar por causa da coluna inexistente).
- **Build de release Android assinado**: keystore gerada em `C:\Users\sergi\keystores\lc-transporte-release.jks` (RSA 2048, valida ate 2051, alias `lc-transporte`). Senha da keystore salva em `android/key.properties` (gitignored, NAO commitado) — o usuario tambem guardou uma copia por conta propria. `android/app/build.gradle` agora tem `signingConfigs.release` lendo esse arquivo. Novo script `npm run android:build:release`.
  - Fingerprints do certificado (uteis para configurar Firebase/push no futuro, nao sao segredo): `SHA1: 77:0B:55:C7:A3:2B:C9:E4:EC:A0:21:EC:9B:63:8C:B6:AE:F6:44:0C`, `SHA256: DA:70:E3:B5:7F:CF:26:24:68:CA:F7:2C:99:D3:1F:FB:EB:96:65:54:45:E2:AA:2B:99:C1:07:F5:AA:8C:77:F1`.
  - Primeiro APK de release assinado (`versionCode 9` / `1.1.7`) gerado e validado localmente: `4.95MB`, assinatura verificada (`apksigner verify` OK), `zipalign` OK, NAO debuggable.
  - **Atencao**: qualquer celular que ja tenha o APK debug/anterior instalado vai precisar desinstalar antes de instalar esse primeiro release assinado (Android bloqueia instalar um APK assinado diferente por cima do existente). E uma migracao unica.
- **Dashboard administrativo com agregacoes**: `/api/admin/summary` agora tambem retorna `aggregates` (total de horas/horas extras/KM por funcionario no periodo filtrado) e `companyTotals` (soma geral da empresa), calculados por `aggregateSummaryByEmployee()` em `lib/timecard-workbook.js`. Nova secao "Totais por funcionario" na tela admin (`public/index.html`/`app.js`), colapsavel como o resumo existente.
- **Melhoria de layout em `05/08/2026`**: botoes de registrar ponto (Inicio/Parada/Retorno/Termino) ganharam icones SVG e a cor do "Retorno" mudou de dourado (igual ao "Parada") para azul, pra ficar visualmente distinto. Painel admin ganhou uma fileira de "stat tiles" (Funcionarios/Total de horas/Horas extras/Total de KM) no topo, acima do resumo detalhado, substituindo a antiga linha de totais dentro da tabela. Verificado visualmente com Playwright (screenshot local, mobile e desktop, sem erros de console) antes de considerar pronto.
- **Notificacoes push**: adiado. O usuario vai criar uma conta Google/Firebase dedicada da empresa antes de implementar. Quando isso existir, usar o fingerprint SHA acima para registrar o app no Firebase (por isso o build assinado veio antes).
- Suite de testes: `44/44` passando localmente apos essas 3 mudancas (`npm test`).

## Melhorias implementadas em 05/08/2026 (auto-update silencioso + cache offline de leitura)

Trabalho feito **apenas localmente** ainda, sem publicar na VPS. Sao mudancas so no frontend (`public/app.js`, `public/index.html`, `public/styles.css`), sem tocar `server.js` nem gerar novo APK — quem ja tem o app instalado recebe assim que o `app.js` for publicado na VPS, porque o WebView carrega o JS ao vivo do servidor.

- **Auto-update silencioso**: `checkForApkUpdate()` agora dispara o download em segundo plano (`startBackgroundApkDownload`, reaproveitando a navegacao dupla `openSameWindow` ja usada e comprovada) assim que detecta uma versao nova, sem esperar o usuario clicar em "Atualizar agora". Cada versao so dispara o download automatico uma vez (guardado em `localStorage` na chave `lc.apk_update_autodownloaded_version`). O popup bloqueante (`apkUpdateDialog`) so abre agora para atualizacao **obrigatoria** (`requiredBelow`); atualizacao opcional nunca mais forca o popup — o aviso de "pronto para instalar" passa a ser a propria tela nativa do Android que aparece quando o `DownloadManager` termina o download (mecanismo que ja existia em `MainActivity.java`, nao precisou mudar nada nativo). Efeito colateral: os helpers `getDismissedApkUpdateVersion`/`setDismissedApkUpdateVersion`/`apkUpdateDismissButton` ficaram sem caminho de codigo alcancavel para atualizacao opcional (o dialogo dela nunca mais abre); nao foram removidos ainda, ficou pendente uma limpeza futura se quiser.
- **Cache offline de leitura**: depois de todo `loadRecords()`/`loadVehicleContext()` bem-sucedido de um funcionario, o app salva um snapshot (`{ user, records, vehicleContext, cachedAt }`) em `localStorage` (`lc.offline_snapshot`) via `persistOfflineSnapshot()`. Se `loadSession()` falhar por erro de rede no boot do app (`/api/auth/session` sem conexao), o app restaura esse snapshot em vez de mostrar tela de erro em branco, mostrando o resumo/registros de hoje do funcionario com um banner "Sem conexao. Mostrando dados salvos de HH:MM." (`#offlineCacheBanner`). O status do veiculo atual tambem usa o dado salvo nesse modo, com o texto deixando claro que e "dado salvo" e desabilitando a troca de veiculo (que exige rede). Quando a conexao volta (evento `online` ou app voltando ao primeiro plano), `refreshSessionIfOffline()` refaz `loadSession()` do zero e sai do modo offline automaticamente. O snapshot e limpo no logout (`clearOfflineSnapshot()`).
  - Limitacao conhecida: se o mesmo aparelho for usado por mais de um funcionario, o snapshot offline mostraria os dados do ultimo funcionario que usou o app ate a conexao voltar (o cookie de sessao real continua sendo a fonte de verdade assim que a rede volta). Aceitavel para o caso de uso atual (1 funcionario por aparelho/veiculo), mas vale lembrar se isso mudar.
- Validacao feita: `npm test` `44/44` passando, `node --check public/app.js` sem erro de sintaxe, servidor local (`node server.js`) validado com `curl` (`/api/health` e HTML servindo o novo elemento `#offlineCacheBanner`). **Nao foi possivel fazer verificacao visual num navegador real** (Playwright/`chromium-cli` nao disponiveis neste ambiente sem instalar dependencia nova) — recomendo um teste manual rapido no navegador/APK antes de publicar.

## Deploy de 05/08/2026 (fila offline + dashboard + auto-update silencioso + cache offline + APK assinado 1.1.7)

- Antes do deploy, confirmado direto pela API REST do Supabase (leitura, sem alterar nada) que a tabela `vehicle_transfers` ja existia em producao, mas a coluna `client_request_id` em `time_records` nao existia (erro `42703`). O usuario rodou manualmente no SQL Editor: `alter table public.time_records add column if not exists client_request_id text unique;`. Confirmado depois pela mesma API que a coluna passou a existir antes de publicar o `server.js` novo.
- Deploy do backend+frontend feito com sucesso: backup remoto em `/home/sergio/apps/lc-banco-horas/backups/20260805-142946/` (`server.js`, `lib/timecard-workbook.js`, `public/app.js`, `public/index.html`, `public/styles.css`), arquivos novos copiados, servico `lc-banco-horas.service` reiniciado via `root@212.85.13.188` (usuario `sergio` nao tem sudo nao-interativo), healthcheck local e publico `{"ok":true}`, login do admin testado com sucesso em producao.
- **APK assinado `1.1.7` (`versionCode 9`) publicado em `public/apk/lc-transporte-1.1.7.apk`** na VPS, assinatura verificada com `apksigner verify` batendo com o fingerprint SHA-256 documentado (`DA:70:E3:B5:...:77:F1`), checksum do arquivo baixado publicamente conferido igual ao local.
  - Como essa versao trocou a chave de assinatura (de debug para release), o `latest.json` **nao foi atualizado na hora** para nao disparar o auto-update silencioso tentando instalar por cima de apps com assinatura antiga (isso falharia silenciosamente/sem explicacao pro funcionario). O link direto do APK foi passado ao usuario para distribuir manualmente pela equipe, com instrucao de desinstalar o app atual antes de instalar o novo.
  - Depois que o usuario confirmou que toda a equipe ja tinha baixado e instalado o `1.1.7` manualmente, o `public/apk/latest.json` foi atualizado para apontar pra essa versao (`versionCode 9`, `versionName "1.1.7"`), liberando o auto-update automatico normal para as proximas versoes (que a partir de agora serao todas assinadas com a mesma chave release, entao nao devem mais ter esse problema).
- Pendencia resolvida: nao ha mais mudancas pendentes de publicar desta leva (fila offline, dashboard, release assinado, auto-update silencioso, cache offline de leitura) — tudo em producao.

## Automacao de pendencias implementada em 05/08/2026 (somente local)

- Motor de regras puro em [lib/pending-alerts.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/lib/pending-alerts.js), sem I/O e sem dependencia externa.
- Endpoint `GET /api/admin/alerts` (restrito ao admin) devolve `alerts`, `counts` e os limites usados.
- Painel admin ganhou a secao `Pendencias` acima do resumo, colapsavel, com cartoes por severidade.
- O painel recarrega as pendencias sozinho a cada `5 min`, ao voltar pro app (`visibilitychange`) e sempre que o admin edita/exclui registro ou troca filtro.
- Regras e limites padrao:
  - `jornada_aberta` (alta): `Entrada` sem `Saida` ha mais de `14h`.
  - `almoco_sem_retorno` (alta): `Saida para almoco` sem retorno ha mais de `3h`.
  - `jornada_longa` (media): turno ja fechado acima de `12h`.
  - `sem_intervalo` (media): turno fechado de `6h` ou mais sem nenhum almoco.
  - `sequencia_inconsistente` (media): jornada quebrada por edicao/exclusao do admin.
  - `sem_batida` (baixa): dias uteis sem nenhum registro nos ultimos `7` dias; ignora o dia do cadastro e quem nunca bateu ponto.
- Janela geral de analise: `15` dias. Os limites ficam em `DEFAULT_ALERT_THRESHOLDS` no topo do modulo.
- As pendencias so respeitam o filtro de matricula. Filtro de periodo e de veiculo sao ignorados de proposito: recortar por eles esconderia a `Entrada` ou a `Saida` da jornada e geraria alerta falso.
- Nada disso foi publicado na VPS nem entrou no APK; esta tudo local aguardando pedido do usuario.

## Layout da tela do funcionario refeito em 05/08/2026 (somente local)

- Card `Jornada de hoje` no topo do painel do funcionario: estado (`nao iniciada` / `trabalhando` / `em parada` / `encerrada`), tempo trabalhado e tempo de parada, ambos contando ao vivo (atualizados pelo tick de 1s do relogio).
- Os quatro botoes de ponto passaram a respeitar a sequencia: so a acao valida fica clicavel, as demais ficam apagadas e desabilitadas, e a proxima acao ganha realce. A regra e espelhada de `getAllowedNextActions` do backend e considera tambem a fila offline ainda nao sincronizada.
- `Meus registros` do funcionario virou linha do tempo compacta (hora + acao + placa + pin do mapa), no lugar dos cartoes que repetiam nome e matricula em cada linha. Tres registros que ocupavam cerca de `630px` passaram a ocupar cerca de `140px`.
- O vocabulario da tela do funcionario foi unificado no dos botoes (`Inicio`, `Parada`, `Retorno`, `Termino`) via `formatPunchLabel`. O painel do admin continua com os nomes tecnicos (`Entrada`, `Saida`).
- O painel do admin nao foi alterado nessa rodada.

## Destaque da logo em 05/08/2026

- A logo ganhou anel em `conic-gradient` com as cores LC (azul -> verde -> dourado) no lugar do contorno azul chapado, com sombra mais presente.
- Tamanhos: topbar `92px -> 112px` no desktop e `72px -> 96px` no mobile; hero do login `190px -> 210px` no desktop e `130px -> 160px` no mobile.
- O usuario avaliou uma proposta de tema futurista (fundo escuro, neon ciano) em `05/08/2026` e **decidiu manter a identidade LC atual**. Nao repropor tema escuro sem pedido: o app e usado na rua, e tema escuro perde legibilidade no sol.

## Painel do admin reorganizado em abas + marca d'agua em 06/08/2026

- O usuario recebeu duas propostas de reorganizacao do painel do admin (abas no topo vs. pendencias fixas com cadastros em gaveta) e **escolheu a opcao de abas**.
- `#adminPanel` agora tem navegacao em 3 abas: `Visao geral` (totais + pendencias + resumo + agregados), `Registros` (filtros + lista + exportar) e `Cadastros` (cadastrar/gerenciar funcionario e veiculo). A aba `Visao geral` ganha uma bolinha vermelha quando `state.alertCounts.total > 0`.
- A secao "Registros" continua compartilhada com a tela do funcionario (mesmo markup, `id="recordsSection"`) e fica **fora** do `#adminPanel` no DOM. Para o funcionario ela e sempre visivel; para o admin, `renderAdminTabs()` em [public/app.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/public/app.js) mostra/esconde ela conforme a aba ativa (`state.adminTab`, default `"overview"`, resetado no login e no logout).
- Logo ganhou marca d'agua: `<img class="watermark-logo">` fixo no canto inferior direito do `body`, opacidade `0.05`, `pointer-events:none`, atras do `.shell` (`z-index:0` vs `z-index:1`). Substituiu o antigo watermark de texto "LC TRANSPORTES" (`body::before`) que fazia a mesma funcao de forma mais pobre.
- Validado no navegador local (porta `3111`) nos dois tamanhos: as 3 abas trocam de conteudo corretamente, a tela do funcionario nao foi afetada (registros seguem sempre visiveis, abas do admin ficam escondidas), e a marca d'agua aparece discreta atras do card de login.
- `npm test` segue `63/63` (mudanca so de frontend, suite de backend nao foi afetada).

## Hero da tela de login redesenhado em 06/08/2026

- O usuario mandou print reclamando que a logo ficava espremida num canto (grid de 2 colunas: texto a esquerda, logo pequena a direita), e pediu visual melhor que valorizasse a logo.
- `.auth-card-head` deixou de ser grid de 2 colunas (texto | logo) e virou hero vertical centralizado: logo grande com o anel LC primeiro, depois eyebrow + titulo + relogio, tudo centralizado, em [public/index.html](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/public/index.html) e [public/styles.css](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/public/styles.css).
- `.hero-brand-circle` cresceu de `210px -> 250px` no desktop e `160px -> 190px` no mobile.
- Removida a `<p class="lead auth-lead">` e a `<p class="brand-caption">`: as duas eram tags vazias sem conteudo (nunca preenchidas por JS), ficaram para tras de uma versao anterior da tela.
- Validado em navegador local nos dois tamanhos; `npm test` 63/63.
- **Combinado com o usuario em 06/08/2026: as mudancas vao se acumulando localmente nesta branch, e o deploy (VPS + APK) so acontece quando o usuario disser que esta tudo pronto para subir.** Nao subir nada por conta propria antes disso.

## Resumo semanal e indicador de hora extra para o funcionario em 06/08/2026

- O usuario achou a tela do funcionario simples demais e pediu mais informacao util. Escolheu duas das opcoes oferecidas: resumo da semana e indicador de hora extra do dia (descartou historico de dias anteriores e "manter simples").
- Novo endpoint `GET /api/me/summary` (qualquer usuario autenticado; funcionario recebe dados reais, admin recebe zeros) em [server.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/server.js): soma os ultimos 7 dias corridos (`local_date`, fuso America/Sao_Paulo) do proprio funcionario, reaproveitando `computeSummary` + `aggregateSummaryByEmployee` de [lib/timecard-workbook.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/lib/timecard-workbook.js) — os mesmos que o admin usa, para os numeros nunca divergirem entre as duas telas. Retorna `daysWorked`, `workedHours`, `overtimeHours`, `windowDays` e `dailyWorkloadMinutes` (a carga horaria real do funcionario, incluindo a excecao de `9:18` da matricula `2`/Everton Ricardo).
- `getDailyWorkloadMinutes` foi exportado de `lib/timecard-workbook.js` (antes so uso interno) para o endpoint poder devolver a carga horaria correta ao frontend.
- Tela do funcionario ganhou:
  - Tag "Hora extra" no card de jornada, comparando o tempo trabalhado hoje (calculado ao vivo no cliente) contra `dailyWorkloadMinutes` vindo do backend — nao usa mais 8h fixo, respeita a excecao por funcionario.
  - Card "Essa semana" (dias, horas trabalhadas, horas extras) logo abaixo do card de jornada, carregado via `loadWeekSummary()`/`renderWeekSummary()` em [public/app.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/public/app.js). Atualiza apos cada registro de ponto e apos sincronizar a fila offline.
- 4 testes novos de integracao para `/api/me/summary` (zerado sem registros, soma jornada fechada e ignora fora da janela de 7 dias, admin recebe zerado, carga horaria de 9:18 pra matricula 2). Suite: `67/67`.
- **Nota operacional para sessoes futuras**: nesta sessao, um processo de teste local antigo (de uma conversa anterior) ficou vivo na porta `3111` sem ser encerrado corretamente e continuou respondendo com codigo desatualizado, causando um falso bug (`/api/me/summary` parecia nao existir). Antes de testar qualquer rota nova no servidor local, confirmar com `Get-NetTCPConnection -LocalPort 3111` que o processo respondendo e o que acabou de ser iniciado (comparar `StartTime` do processo com o horario atual), nao um processo esquecido de uma sessao anterior.

## "Meus registros" ganhou destaque de evento em andamento em 06/08/2026

- O usuario achou a lista "Meus registros" simples demais e recebeu 3 opcoes (duracao entre pontos, linha conectando os eventos, destaque no evento em andamento). Escolheu so o destaque.
- `renderEmployeeTimeline()` em [public/app.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/public/app.js) agora chama `computeJourneyState()` e marca o **ultimo** registro do dia com a classe `punch-active` + badge "Em andamento" (bolinha verde pulsando) sempre que a jornada ainda esta aberta (status `working` ou `break`). Jornada fechada (`done`) ou sem registros hoje: nenhum item ganha o badge.
- Validado com dois funcionarios: um com jornada aberta (badge aparece no ultimo evento) e um com jornada fechada (`activeCount: 0` confirmado via DOM). `npm test` segue `67/67` (mudanca so de frontend).

## Marca d'agua virou logo grande cobrindo a tela em 06/08/2026

- O usuario pediu para a logo aparecer como marca d'agua espalhada pela tela toda (nao so um detalhe de canto), valendo para login, admin e funcionario. Como `.watermark-logo` ja e um unico `<img>` fixo direto no `<body>` (fora dos paineis), a mesma regra ja vale automaticamente para as tres telas.
- `.watermark-logo` em [public/styles.css](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/public/styles.css) deixou de ser um circulo pequeno no canto inferior direito e virou uma marca grande centralizada (`min(80vw, 760px)`, `92vw` no mobile), opacidade `0.16`.
- O usuario pediu para testar a marca **na frente** do card (`z-index:5`) e nao gostou do resultado ("ficou feio") — **revertido para atras do card (`z-index:0`)**, que e o estado atual aprovado. Nao repropor a marca na frente do conteudo sem pedido explicito.
- `pointer-events:none` garante que a marca nunca bloqueia clique em botao/campo, em nenhum dos dois z-index testados.
- `npm test` segue `67/67` (mudanca so de CSS).

## Nova funcionalidade: Rotas por cidade em 06/08/2026 (somente admin)

- O usuario pediu uma 4a aba no painel do admin ("Rotas") para organizar rotas de entrega. Ele vai mandar fotos/PDFs com enderecos e cidades; cada PDF vira uma rota.
- Decisoes fechadas com o usuario antes de implementar:
  - **Uma cidade pode ter varias rotas** (cada PDF novo cria uma rota nova com nome proprio; nada substitui rota antiga automaticamente).
  - **Endereco e so texto livre** por enquanto (sem campos separados de destinatario/telefone/observacao — pode evoluir depois se pedirem).
- Schema novo em [supabase/schema.sql](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/supabase/schema.sql): tabelas `routes` (id, city, name, created_at) e `route_stops` (id, route_id, address, stop_order, created_at), com indices por cidade e por rota. **Ainda nao rodado na VPS** — precisa executar o schema atualizado no Supabase antes do proximo deploy, senao o backend vai falhar a validacao de schema no boot.
- Backend em [server.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/server.js) (tudo `requireAdmin`):
  - `GET /api/admin/routes/cities` — cidades com pelo menos uma rota, com contagem, para a busca com sugestao.
  - `GET /api/admin/routes?city=X` — rotas daquela cidade (nome, quantidade de enderecos, data). 400 se a cidade nao for informada.
  - `GET /api/admin/routes/:routeId` — detalhe de uma rota com os enderecos ordenados.
  - `POST /api/admin/routes` — cria rota + enderecos numa tacada (`{ city, name, addresses: [] }`).
  - `DELETE /api/admin/routes/:routeId` — remove a rota e os enderecos dela.
  - Segue o mesmo padrao dual-mode (Supabase / memoria local) do resto do arquivo — `localRoutes`/`localRouteStops` resetados em `resetInMemoryState`.
- Frontend: 4a aba "Rotas" dentro de `#adminPanel` em [public/index.html](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/public/index.html), com formulario de cadastro (cidade, nome da rota, textarea de enderecos um por linha — pensado para colar direto do que vier do PDF/print) e busca por cidade com sugestao automatica (datalist). Cada rota encontrada vira um card com "Ver enderecos" (carrega sob demanda e cacheia em `state.routeStopsById`) e "Excluir" (com confirmacao).
- `.route-card-head` entra na regra responsiva que empilha cabecalhos em telas estreitas (nome da rota longo nao espreme mais os botoes de acao no celular).
- 6 testes novos de integracao (cadastro+busca+detalhe, multiplas rotas por cidade, validacao de cidade obrigatoria e cidade sem rota, validacao de campos obrigatorios no cadastro, exclusao, bloqueio para funcionario). Suite: `73/73`.
- Validado end-to-end no navegador local (mobile e desktop): cadastro de 2 rotas em cidades diferentes, busca isolando por cidade, expansao de enderecos numerados, exclusao removendo a rota da busca e da lista de sugestao de cidades.

## Rotas: redesenho para dados reais em 07/08/2026 (endereco por parada, nao por rota)

- O usuario mandou prints reais de planilhas de rota (colunas: Operacao, Motorista, Cidade de origem, Cliente, Endereco de coleta, Contato Cliente, Hora Chegada, Hora Fim). Ficou claro que **um mesmo PDF/rota mistura varias cidades** (ex.: uma rota do Leandro tem paradas em Blumenau e Benedito Novo na mesma folha) — isso invalidava o desenho anterior (`routes.city` fixo por rota).
- Redesenho confirmado com o usuario antes de implementar: a cidade passou para o nivel da **parada** (`route_stops`), nao da rota. A rota (`routes`) representa o PDF inteiro e so tem `name`. Cada parada guarda `operation`, `city`, `client`, `address`, `contact`.
- Busca por cidade agora devolve uma lista plana de **enderecos** (nao rotas inteiras) juntando todas as rotas que tiverem pelo menos uma parada naquela cidade — cada resultado mostra badge de operacao, cliente, cidade+endereco, contato e "Rota: <nome>" para rastrear de qual PDF veio.
- `GET /api/admin/routes` sem `?city` agora lista todas as rotas cadastradas (para gerenciar/excluir); com `?city=X` devolve as paradas daquela cidade. `GET /api/admin/routes/cities` conta por cidade a partir das paradas, nao das rotas.
- Cadastro na UI virou uma unica caixa de texto onde se cola direto do Excel/Google Sheets: uma parada por linha, campos separados por **Tab** (o que sai ao copiar celulas) ou por `|` (para digitar a mao) na ordem Operacao, Cidade, Cliente, Endereco, Contato. So Cidade e Endereco sao obrigatorios; o resto pode ficar em branco. `parseRouteStopsInput` em [public/app.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/public/app.js) faz esse parse no cliente.
- Nova secao "Rotas cadastradas" (colapsavel, carregada sob demanda) para ver/excluir rotas inteiras (o PDF completo), separada da busca por cidade.
- Schema do Supabase reescrito (o app ainda nao tinha sido deployado com a versao anterior de Rotas, entao foi troca direta, nao migracao aditiva): `routes` perdeu a coluna `city`; `route_stops` ganhou `operation`, `city` (not null), `client`, `contact`.
- Testes de integracao reescritos para o novo contrato (6 testes, incluindo o caso real de uma rota com paradas em cidades diferentes e paradas invalidas sendo descartadas sem derrubar o cadastro). Suite: `73/73`.
- Validado no navegador com dados reais das planilhas que o usuario mandou (Leandro - Blumenau/Benedito Novo, Leandro - Jaragua do Sul com uma parada em Schroeder misturada): cadastro via paste TSV, busca por Jaraguau do Sul trazendo so as 4 paradas certas (excluindo Schroeder), busca por Blumenau juntando paradas de duas rotas diferentes, contagem por cidade no datalist batendo, exclusao de rota limpando a cidade da lista de sugestoes.

## Rotas: dados reais cadastrados e secao "Rotas cadastradas" removida em 07/08/2026

- O usuario mandou todos os prints reais de rota (18 tabelas ao todo: Leandro, Ernandes LC, e as rotas nomeadas "Brusque x Hub Blumenau - Direto 1/2", "Indaial x Hub Blumenau - Direto", "Itajai x Hub Blumenau - Direto"). Cada tabela separada virou uma rota (seguindo a regra original do usuario: "cada PDF vira uma rota"). Resultado: **18 rotas, 67 paradas, 17 cidades**, cadastradas no servidor local via script (`seed-real-routes.js` no scratchpad da sessao, nao versionado no repo).
- Duas pendencias sinalizadas ao usuario e ainda nao resolvidas:
  - Uma linha do print de Brusque ("Sieri Textil") nao tinha endereco nenhum, foi descartada.
  - "VITA COMERCIO DE SUPLEMENTOS LTDA" (Blumenau) e "MONPET BRASIL" (Itajai) apareciam duplicados nos proprios prints do usuario (uma vez na rota do Leandro, outra numa lista destacada em amarelo). Foram cadastrados como vieram, sem deduplicar.
  - Pedido explicito ao usuario para conferir numeros de telefone e enderecos, ja que os dados vieram de imagens (risco de erro de leitura).
- O usuario pediu para remover a secao "Rotas cadastradas" (lista de gerenciamento/exclusao de rota inteira, com o botao "Ver todas as rotas") do painel. Removida por completo: HTML, CSS (`.route-manage-head`, `.routes-manage-list`, `.route-card-actions`) e todo o JS relacionado (`renderRouteManageList`, `loadRouteManageList`, `handleToggleRouteManage`, `handleRouteManageListClick`, estado `showRouteManageList`/`routeManageRoutes`, refs e bindEvent).
- **Consequencia importante**: o endpoint `DELETE /api/admin/routes/:routeId` continua existindo no backend (ainda testado, ainda funciona), mas agora **nao ha mais nenhum jeito de excluir uma rota pela interface**. Se o usuario precisar excluir uma rota, por enquanto so via API/script ou pedindo para uma sessao futura reativar algum jeito de fazer isso na UI.
- `npm test` segue `73/73` (mudanca so de frontend).

## Rotas: campo de motorista + edicao completa em 07/08/2026

- O usuario pediu tres coisas: (1) poder editar qualquer rota cadastrada, (2) separar/organizar rotas por motorista com busca propria por motorista, (3) todos os textos editaveis.
- `routes` ganhou coluna `driver` (opcional — nem toda rota tem motorista conhecido, ex.: as 4 rotas nomeadas por hub tipo "Brusque x Hub Blumenau - Direto 1" nao tinham motorista preenchido nos prints originais).
- Novos endpoints: `GET /api/admin/routes/drivers` (motoristas com contagem de rotas, mesmo padrao de `/cities`), `GET /api/admin/routes?driver=X` (devolve as rotas **inteiras** daquele motorista, cada uma com a lista completa de paradas — diferente da busca por cidade, que e stop-flat), `PUT /api/admin/routes/:routeId` (substitui nome, motorista e **todas** as paradas de uma vez, mesma validacao do POST; se a validacao falhar, nao mexe nos dados antigos).
- UI ganhou: campo "Motorista" no formulario de cadastro; segunda busca "Buscar rotas por motorista" (resultado agrupado por rota, com lista de paradas aninhada, ja que aqui faz sentido ver a rota inteira de uma vez); botao "Editar" em cada rota da busca por motorista e botao "Editar rota" em cada endereco da busca por cidade — os dois abrem o mesmo formulario de cadastro, mas pre-preenchido (nome, motorista, e o textarea reconstruido no mesmo formato de colagem `Operacao | Cidade | Cliente | Endereco | Contato`) e trocam para modo edicao (titulo "Editar rota", botao "Salvar edicao", PUT em vez de POST).
- Editar e simplesmente reabrir o texto e deixar o admin corrigir/adicionar/remover linhas livremente antes de salvar — nao existe edicao campo-a-campo por parada. Isso cobre "todos os textos editaveis" sem precisar de um formulario por parada.
- Bug pego e corrigido durante o teste manual: a mensagem de sucesso ("Rota atualizada...") estava sendo apagada na hora pelo refresh automatico da busca (que tambem seta a mensagem). Corrigido movendo o `setRouteManagerMessage` de sucesso para depois de todos os refreshes.
- 4 testes novos de integracao (motorista + busca, edicao completa, 404/edicao invalida preserva dados antigos, funcionario sem acesso). Suite: `77/77`.
- Dados reais re-seedados com motorista: rotas com nome "Leandro - X" / "Ernandes LC - X" tiveram o motorista extraido do prefixo (script atualizado em `seed-real-routes.js` no scratchpad, nao versionado). As 4 rotas de hub e a "Coletas destacadas" ficaram sem motorista, como nos prints originais.

## Bug grave corrigido em 07/08/2026: edicao de rota apagava enderecos de outras cidades

- O usuario relatou que editar a "rota de Guabiruba" (encontrada pela busca por cidade) apagou paradas de outras cidades sem querer. Causa raiz confirmada lendo o codigo: o botao "Editar rota" carregava a rota inteira (`GET /api/admin/routes/:routeId`, todas as paradas, todas as cidades misturadas) num textarea unico; salvar fazia um `PUT` que **substituia todas as paradas da rota**. Como uma rota pode ter paradas de mais de uma cidade (ex.: a rota "Leandro - Guabiruba" tem uma parada em Brusque misturada), editar via a busca filtrada por Guabiruba escondia essa parada de Brusque do usuario, mas ela ainda fazia parte do payload de substituicao — se o texto colado de volta nao incluisse aquela linha, ela sumia.
- Correcao: edicao agora e **por parada individual**, nunca por rota inteira.
  - Novos endpoints: `PUT /api/admin/routes/:routeId/stops/:stopId` (edita so essa parada; exige cidade+endereco; 404 se a parada nao pertencer aquela rota) e `DELETE /api/admin/routes/:routeId/stops/:stopId` (exclui so essa parada).
  - O antigo `PUT /api/admin/routes/:routeId` (substituir rota inteira) continua existindo no backend e testado, mas **nao tem mais nenhum caminho na UI que o chame** — nao e mais possivel disparar esse comportamento perigoso pela tela.
  - Novo modal `#routeStopEditDialog` em [public/index.html](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/public/index.html): campos empilhados Operacao/Cidade/Cliente/Endereco/Contato de uma unica parada, com link "Ver no Google Maps" (`https://www.google.com/maps/search/?api=1&query=ENDERECO_URLENCODED`, atualizado ao vivo conforme o endereco e digitado) e botao "Excluir parada" (so essa, com confirmacao).
  - O botao "Editar" tanto na busca por cidade (endereco avulso) quanto na busca por motorista (dentro da lista de cada rota, agora com um botao por linha) abre esse modal focado. O formulario de "Cadastrar rota" (paste em lote) voltou a ser so para criar rotas novas.
- 5 testes novos de integracao confirmando que editar/excluir uma parada nao mexe nas outras da mesma rota, validacao de campos obrigatorios, 404 para parada de outra rota, e bloqueio para funcionario. Suite: `82/82`.
- Validado no navegador reproduzindo o cenario exato do bug: busca por Guabiruba (5 enderecos, sem a parada de Brusque misturada), edicao de um deles, e confirmacao de que os outros 4 de Guabiruba **e** a parada de Brusque da mesma rota continuam intactos depois de salvar.

## Validacoes locais recentes

- `npm test` passou com `63/63` em `05/08/2026` apos a automacao de pendencias (`16` testes novos de regra + `3` de endpoint).
- Cenarios de pendencia validados em navegador real em `05/08/2026`, com servidor local em modo `local storage` na porta `3111`, sem tocar no Supabase nem no app online.
- `npm test` passou com `44/44` em `05/08/2026` apos fila offline + dashboard agregado.
- `npm test` passou com `39/39` em `02/07/2026` apos a correcao da exportacao paginada do Supabase.
- `android\\gradlew.bat assembleDebug` e `assembleRelease` compilaram com sucesso em `05/08/2026`.
- Para compilar Android neste Windows foi necessario usar:
  - `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`
  - `ANDROID_HOME=C:\Users\sergi\AppData\Local\Android\Sdk`

## Arquivos importantes

- Backend: [server.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/server.js)
- Frontend: [public/app.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/public/app.js)
- HTML principal: [public/index.html](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/public/index.html)
- Estilos: [public/styles.css](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/public/styles.css)
- Android activity: [MainActivity.java](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/android/app/src/main/java/com/lctransporte/bancodehoras/MainActivity.java)
- Config do shell Android: [capacitor.config.ts](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/capacitor.config.ts)
- Regras de pendencia: [lib/pending-alerts.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/lib/pending-alerts.js)

## Pendencia atual

- **09/08/2026**: entre a sessao anterior e esta, o usuario publicou por conta propria na VPS tudo que estava pendente (rotas, gestor por area, carga horaria configuravel, bot de WhatsApp — confirmado por md5sum idêntico entre `server.js`/`public/app.js`/`public/index.html` locais no commit `9b0f65a` e os arquivos rodando na VPS). `WHATSAPP_ENABLED=true` ja esta ativo em producao.
- Nesta sessao foi implementado e publicado o **assistente de chat com Claude** (`POST /api/chat`, ferramentas de leitura escaladas por permissao — ver secao propria abaixo). Deploy completo: backend na VPS + APK `1.1.8` assinado e publicado, `latest.json` atualizado.
- **Falta o usuario colocar a `ANTHROPIC_API_KEY` real no `.env` da VPS** (`/home/sergio/apps/lc-banco-horas/.env`, linha ja existe vazia) — sem isso o chat responde com erro amigavel em vez de conversar. Local tambem precisa da key em `.env` pra testar.
- **Bot de WhatsApp precisa de novo QR code**: o restart do `lc-banco-horas.service` durante o deploy do chat derrubou a sessao pareada do Baileys; o log mostrou "not logged in, attempting registration...". Alguem precisa escanear o QR de novo em `/api/admin/whatsapp/status` (painel admin) antes do bot voltar a funcionar.
- **10/08/2026**: sessao grande de melhorias de design + 4 features novas (ver secao propria abaixo) implementadas, testadas e **publicadas** (VPS + APK `1.1.9`). Detalhes do deploy:
  - Migracao rodada manualmente pelo usuario no SQL Editor do Supabase de producao (colunas `photo_data`/`requires_vehicle`, tabela `vehicle_maintenance`); confirmada por leitura via API REST antes de seguir com o deploy.
  - Backend+frontend: backup em `backups/20260810-deploy/` na VPS, `server.js`/`public/app.js`/`public/index.html`/`public/styles.css` copiados, checksum confirmado, servico reiniciado, healthcheck local/publico `{"ok":true}`, login do admin e endpoints novos (`/api/vehicles`, `/api/admin/frota/.../maintenance`) testados direto em producao com dados reais.
  - **APK `1.1.9` (`versionCode 11`)**: build local falhou 2x por ambiente (faltava `android/local.properties` com `sdk.dir`, depois `JAVA_HOME` apontando pra JDK 17 quando o projeto precisa de JDK 21 — resolvido usando o JBR embutido do Android Studio em `C:\Program Files\Android\Android Studio\jbr`). Assinatura confirmada com o mesmo fingerprint SHA-256 de sempre (`DA:70:E3:B5:...:77:F1`), zipalign OK, checksum publico confirmado igual ao local.
  - Bot de WhatsApp continua com sessao perdida (nao foi tocado nesta sessao) — ainda precisa de QR novo.
- **Segundo deploy no mesmo dia (10/08/2026, madrugada)**: depois do primeiro deploy, usuario pediu mais ajustes (ver pedidos abaixo) que tambem foram publicados:
  - Correcao: texto "Rota: ..." removido da busca de endereco do motorista (era so pra visao do admin).
  - Novo endpoint `PATCH /api/admin/vehicles/:vehicleId` (usa colunas que ja existiam, sem migracao) + botao "Editar" na tabela de veiculos cadastrados (Cadastros), com validacao de placa duplicada.
  - Botao "Adicionar a rota" removido da busca "por motorista" em Rotas (so faz sentido na busca por cidade, que ja tinha).
  - Aba Frota: lista "Ja feito" agora comeca oculta (botao "Mostrar historico"/"Ocultar historico"); selecao de veiculo trocou de `<select>` pra busca por placa com autocomplete (mesmo padrao da busca de veiculo em Cadastros).
  - Backup em `backups/20260810-deploy2/` na VPS. Testado em producao: login OK, `PATCH /api/admin/vehicles/:id` confirmado via ID inexistente (404 do proprio app, sem alterar dados reais).
  - **APK `1.1.10` (`versionCode 12`)**: mesma chave de assinatura, zipalign OK, checksum publico confirmado. Essa rodada era so codigo web (nada nativo novo) — o usuario pediu gerar APK novo mesmo assim.
- **Ajuste do icone iOS (10/08/2026, mesmo dia)**: publicadas as tags `apple-touch-icon`/`apple-mobile-web-app-*`/`theme-color` no `<head>` do `public/index.html`, so pra deixar certinho o "Adicionar a Tela de Inicio" no Safari. Como e so `index.html` (servido sem cache), nao precisou reiniciar o servico.
- **Terceiro deploy no mesmo dia (10/08/2026)**: usuario pediu que a manutencao pendente aparecesse direto na caixa principal da aba Frota, sem precisar buscar por placa primeiro (so devendo ficar oculta apos o "ok").
  - Novo endpoint `GET /api/admin/frota/maintenance/pending` (`server.js`) — junta `vehicle_maintenance` pendente com `vehicles` em memoria (sem depender de relacionamento FK do Supabase), devolve `vehiclePlate`/`vehicleDescription` junto de cada item.
  - `public/index.html`/`public/app.js`: nova caixa "Manutencoes pendentes" no topo da aba Frota, carregada automaticamente ao abrir a aba (e no refresh geral de sessao do admin/gestor); a busca por placa continua existindo, mas agora serve so pra adicionar nova pendencia ou ver historico de um veiculo especifico. Marcar como feito/excluir funciona direto dessa caixa nova tambem.
  - **Bug corrigido no mesmo deploy**: cookie de sessao antigo (de um periodo em que o app rodava em modo local com IDs numericos) travava toda a aplicacao com erro cru do Postgres (`22P02 invalid input syntax for type uuid`) quando o servidor estava em modo Supabase — reproduzido localmente ao testar o login. Adicionada `looksLikeUuid()` no middleware de refresh de sessao (`server.js`): sessao com ID que nao e UUID valido agora e tratada como deslogada, em vez de derrubar a requisicao.
  - Deploy: backup em `backups/20260810-frota-overview/` na VPS (`server.js`, `public/index.html`, `public/app.js`), checksum confirmado, servico reiniciado, healthcheck local/publico `{"ok":true}`, login e o endpoint novo testados direto em producao com dados reais (retornou manutencao pendente real com placa "QJP7A53").
  - **APK `1.1.11` (`versionCode 13`)**: mesma chave de assinatura (`DA:70:E3:B5:...:77:F1`), zipalign OK, checksum publico confirmado, publicado em `public/apk/lc-transporte-1.1.11.apk` com `latest.json` atualizado.

## Suporte a iOS (08/08/2026)

- Adicionada a plataforma iOS via Capacitor (`ios/`, `npm install @capacitor/ios`, `npx cap add ios`), seguindo o mesmo padrao ja usado no Android (`android/`) — o app iOS tambem so carrega a URL de producao numa WebView, sem empacotar HTML/JS/CSS localmente.
- [capacitor.config.ts](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/capacitor.config.ts): `appendUserAgent` movido pra dentro dos blocos `android`/`ios` (cada plataforma com o seu: `LCAndroidShell/1.1.7` e `LCiOSShell/1.0.0`). Nova env var opcional `IOS_APP_URL` (default = mesmo valor de `ANDROID_APP_URL`).
- `public/app.js`: `isIOSShell()`/`isUnconfiguredIOSShell()`/`showIOSShellNotice()` adicionados espelhando o padrao Android — **usados so pra mensagem de "app nao configurado"**, nunca ligados ao fluxo de auto-update (`checkForApkUpdate`/`startBackgroundApkDownload` continuam gatilhados exclusivamente por `isAndroidShell()`, porque a Apple proibe apps se auto-atualizarem fora da App Store).
- Icones e splash gerados via `@capacitor/assets` (`npm run ios:assets`) a partir de `public/logo-lc.jpg` (fonte em baixa resolucao, 640x640 — recomendo trocar por uma logo em pelo menos 1024x1024 quando tiver uma, pra ficar mais nitido no icone da App Store).
- `ios/App/App/Info.plist` ganhou `NSLocationWhenInUseUsageDescription` (unica permissao necessaria — o app so pede localizacao pontual ao bater ponto, sem rastreamento em segundo plano nem uso de camera).
- Criada [public/privacy.html](public/privacy.html) (politica de privacidade, exigida pela App Store) — **rascunho meu, precisa da sua revisao e troca do e-mail de contato placeholder antes de submeter**.
- Checklist completo do que falta (exige Mac + conta Apple Developer) documentado em [IOS_SETUP.md](IOS_SETUP.md).
- Nada disso foi publicado na VPS ainda — os arquivos novos (`ios/`, `assets/`, `public/privacy.html`, scripts `ios:*`) sao so de preparacao/build local, nao precisam ir pro `server.js` da VPS. A unica mudanca que *tocaria* produção seria publicar `public/privacy.html` la quando for submeter o app (pra URL da politica de privacidade funcionar publicamente).

## Bot de ponto por WhatsApp (08/08/2026)

- Ideia do usuario: bater ponto mandando mensagem de WhatsApp. Pesquisei custo da API oficial da Meta (gratis ate 01/10/2026, depois passa a cobrar por mensagem) vs biblioteca nao-oficial Baileys (gratis, mas viola termos de uso do WhatsApp, risco real de ban do numero sem aviso). Usuario decidiu conscientemente ir pelo caminho gratuito/nao-oficial.
- Refatoracao chave em [server.js](C:/Users/sergi/OneDrive/Área%20de%20Trabalho/trabalhos%20sistemas/Banco%20De%20Horas%20LC%20-%20app/server.js): extraida `createPunchRecord(user, payload)` de dentro do handler `POST /api/me/records` — agora e a fonte unica de validacao de ponto, reaproveitada tanto pela rota HTTP quanto pelo bot.
- Novo modulo [lib/whatsapp-bot.js](lib/whatsapp-bot.js) (Baileys) com state machine por numero de telefone: palavra-chave fixa (Inicio/Parada/Retorno/Termino, sem IA livre) → placa+KM se precisar → localizacao compartilhada nativamente pelo WhatsApp → chama `createPunchRecord`.
- Nova coluna `phone` em `users` ([supabase/schema.sql](supabase/schema.sql)) — **precisa rodar manualmente no Supabase antes de ativar** (mesmo processo das migracoes anteriores). Campo "Telefone (WhatsApp)" adicionado no cadastro/edicao de funcionario.
- So liga com `WHATSAPP_ENABLED=true` no `.env` (desligado por padrao). Sessao autenticada fica em `.whatsapp-auth/` (gitignored, nunca versionar).
- Checklist completo de ativacao (rodar migracao, cadastrar telefones, escanear QR code na VPS) em [WHATSAPP_SETUP.md](WHATSAPP_SETUP.md).
- Nada disso foi ativado na VPS ainda — codigo pronto localmente, mas `WHATSAPP_ENABLED` continua `false`/ausente ate o usuario decidir ligar.

## Assistente de chat com Claude (09/08/2026)

- Pedido do usuario: um chat dentro do app (funcionario e admin/gestor) usando a API da Anthropic. Esclarecido antes de implementar que isso exige uma **API key da Anthropic** (console.anthropic.com, cobranca por uso), diferente da assinatura do Claude.ai.
- Novo endpoint `POST /api/chat` (`requireAuth`) em [server.js](server.js): loop manual de tool-use com `@anthropic-ai/sdk` (`client.messages.create`, modelo `claude-opus-5`, `output_config.effort: "low"`), maximo `CHAT_MAX_TURNS = 6` iteracoes por pergunta.
- **So ferramentas de leitura**, nunca escreve nada: `get_my_week_summary` e `get_my_recent_records` (funcionario/gestor, reaproveitando a mesma logica de `/api/me/summary`), `get_company_hours_summary` e `get_pending_alerts` (quem tem acesso a secao `overview`), `search_routes_by_city` (quem tem acesso a secao `rotas`). `canAccessSection(user, section)` foi extraida de dentro do `requireAdminSection` pra ficar reaproveitavel fora de rota Express.
- Sem `ANTHROPIC_API_KEY` configurada, `getAnthropicClient()` devolve `null` e a rota responde `503` com mensagem clara, sem quebrar o resto do app.
- Frontend: botao flutuante (`#chatFab`) so aparece logado; abre um painel simples (`#chatPanel`) com historico em memoria (nao persiste em localStorage, some no logout). **Bug corrigido durante o teste**: `.chat-fab`/`.chat-panel` tinham `display: flex` no CSS, e por virem depois de `.hidden` no arquivo (mesma especificidade, empate resolvido pela ordem), o painel aparecia aberto mesmo antes do login. Corrigido com `.chat-fab.hidden, .chat-panel.hidden { display: none; }`.
- 3 testes novos (chat exige login, erro sem API key, mensagem vazia rejeitada). Suite: `85/85`.
- Deploy: commit `9fdef74`. VPS atualizada (backup em `backups/20260809-205645/`, `npm install` do `@anthropic-ai/sdk`, restart do servico, healthcheck local/publico OK, login e chat testados em producao). APK `1.1.8` (`versionCode 10`) gerado com a mesma chave de assinatura do `1.1.7`, publicado em `public/apk/lc-transporte-1.1.8.apk`, `latest.json` atualizado (update normal via auto-update, mesma chave de assinatura, sem o problema do `1.1.6→1.1.7`).
- `ANDROID_APP_URL` estava ausente do `.env` local (por isso builds anteriores devem ter passado essa variavel so na hora de buildar) — adicionada permanentemente como `https://212.85.13.188.sslip.io` pra builds futuras nao esquecerem.
- **09/08/2026 (mesmo dia, sessao seguinte)**: usuario perguntou se dava pra usar a assinatura pessoal do Claude (Claude.ai/Claude Code) na VPS pra responder o chat sem precisar de API key. Resposta: nao, sao produtos diferentes — a assinatura pessoal e so pra uso individual (ToS da Anthropic proibe usar como backend de servico pra terceiros); o `ANTHROPIC_API_KEY` pre-pago continua sendo o unico jeito suportado. Pra baratear, trocamos `CHAT_MODEL` de `claude-opus-5` para `claude-haiku-4-5` (suficiente pra perguntas objetivas sobre horas/rotas com as tools ja definidas). Suite local voltou a passar (69/69 nesse arquivo de teste). Alteracao publicada na VPS: backup em `backups/20260809-184418-chat-model/server.js.bak` (raiz, nao dentro de subpasta), `server.js` copiado, checksum confirmado, `chown sergio:sergio`, servico reiniciado, healthcheck local e publico `{"ok":true}`. **Segue faltando a `ANTHROPIC_API_KEY` real no `.env` da VPS** pro chat responder de verdade.

## Ponto com foto, busca de endereco, funcionario administrativo e frota (10/08/2026)

- **Design**: barra de progresso semanal no card "Essa semana" da tela do funcionario (meta = carga horaria diaria x 5, com segmento de hora extra e marcador da meta), microanimacoes no chat (abrir/fechar) e nas abas do admin (troca de cor suave + fade no conteudo). So frontend (`public/index.html`, `app.js`, `styles.css`).
- **Ponto com foto**: fluxo completo implementado (camera via `<input capture>`, dialogo de confirmar/tirar outra, compressao pra JPEG ~480px/60%, `POST /api/me/records` aceita campo `photo` opcional, coluna `photo_data` em `time_records`, thumbnail clicavel + lightbox no painel admin). **Fica inativo por pedido do usuario** — flag `const PUNCH_PHOTO_ENABLED = false;` no topo de [public/app.js](public/app.js). Pra reativar, so trocar pra `true`; todo o resto (backend, schema, UI do admin) ja fica pronto e funcionando independente da flag. Permissao `CAMERA` ja adicionada no `AndroidManifest.xml` (so entra em vigor com APK novo).
- **Busca de endereco pro motorista**: novo endpoint `GET /api/me/routes?city=` (`requireAuth`, sem exigir permissao de secao "rotas") em [server.js](server.js), reaproveitando a mesma logica de busca por cidade do admin. Campo de busca + botao "Abrir no Google Maps" na tela do funcionario (`public/index.html`/`app.js`). Testado que um motorista sem nenhuma permissao de admin consegue buscar mas continua recebendo `403` em `/api/admin/routes`.
- **Funcionario administrativo (nao dirige)**: novo campo `requires_vehicle` (boolean, default `true`) na tabela `users`. Checkbox "Este funcionario dirige veiculo" no cadastro e na edicao de funcionario. Quando `false`, `createPunchRecord` em [server.js](server.js) pula toda a validacao/conflito de veiculo, e o frontend (`actionRequiresVehiclePrompt`/`getVehicleInfoForAction` em `app.js`) nao abre a tela de escolher veiculo/KM — o ponto vira so horario + localizacao. Testado via curl (funcionario com `requiresVehicle:false` bate ponto sem placa/KM).
- **Aba "Frota" no admin**: nova secao `frota` em `ADMIN_SECTIONS` (server.js e app.js) — pode ser liberada pra um gestor especifico sem dar acesso a Cadastros. Tabela `vehicle_maintenance` com **fluxo de pendencia**: `status` (`pending`/`done`), `due_at` (data prevista, so quando pendente), `performed_at`/`km`/`cost` (preenchidos so quando concluida). `POST /api/admin/frota/vehicles/:vehicleId/maintenance` sempre cria como `pending`; `POST /api/admin/frota/maintenance/:entryId/complete` e o "admin da o ok" que move pra `done` preenchendo data/KM/custo reais; `DELETE /api/admin/frota/maintenance/:entryId` funciona nos dois estados. UI: seletor de veiculo (reaproveita `state.vehicles`, que ja vem de `GET /api/vehicles` sem exigir permissao de secao) + form "Adicionar a fazer" + duas listas (`frotaMaintenancePendingResults`/`frotaMaintenanceDoneResults`) + dialogo `frotaCompleteDialog` pra confirmar a conclusao. Testado via curl o ciclo completo pending→done, e que um gestor so com permissao "frota" acessa a manutencao mas recebe `403` em `/api/admin/vehicles`.
- Suite de testes (`test/server.test.js`) continua em `69/69` depois de todas essas mudancas — nenhum teste novo foi escrito pras 4 features (ficou so validacao manual via curl documentada acima).
- **Publicado em 10/08/2026**: VPS (backend+frontend) e APK `1.1.9`/`versionCode 11`. Detalhes completos do deploy na secao "Pendencia atual" acima.
- Depois desse deploy, o formulario de manutencao evoluiu de "so historico" pra **fluxo pendente→feito**: `POST /api/admin/frota/vehicles/:vehicleId/maintenance` sempre cria como `pending` (so descricao + data/KM previstos); `POST /api/admin/frota/maintenance/:entryId/complete` e o "admin da o ok" que move pra `done` com data/KM/custo reais. Isso foi pedido e implementado **depois** do primeiro rascunho da aba Frota, mas **antes** do deploy acima — ou seja, o que esta publicado ja e a versao com esse fluxo.

## Observacao para futuras sessoes

- Se o usuario pedir para "subir", confirmar primeiro se e para VPS ou para APK.
- Se o usuario pedir para "ver o que mudou", priorizar explicacao e diff, sem alterar codigo.
- Manter o foco em nao atrapalhar usuarios ativos no sistema online.
