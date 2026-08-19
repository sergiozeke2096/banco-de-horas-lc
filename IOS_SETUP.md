# Publicar o app iOS na App Store

Este arquivo documenta o que falta pra publicar o app iOS na App Store. A parte que dava pra
preparar sem Mac (projeto `ios/`, config, icones, splash, texto de permissao de localizacao,
politica de privacidade) ja foi feita — ver `git log` na branch de trabalho. O que resta abaixo
so pode ser feito com acesso a um Mac.

## 1. Conta Apple Developer

- Inscrever-se no [Apple Developer Program](https://developer.apple.com/programs/) — US$ 99/ano.
- Decidir entre conta **Individual** (mais rapida de aprovar) ou **Organization** em nome da
  LC Transporte (exige D-U-N-S number, verificacao mais demorada, mas o app aparece publicado
  em nome da empresa, nao de uma pessoa).

## 2. Politica de privacidade

- Revisar o texto em [public/privacy.html](public/privacy.html) — foi escrito por mim como
  rascunho, **precisa da sua aprovacao antes de submeter**.
- E-mail de contato ja atualizado pra `sergiozeke2096@gmail.com`.
- Depois de revisado, a URL publica vai ser `https://212.85.13.188.sslip.io/privacy.html` (ou o
  dominio proprio, se vocês configurarem um) — essa URL e obrigatoria no cadastro do app na
  App Store Connect.

## 3. Abrir o projeto no Xcode (precisa de Mac)

```
npm install
npx cap sync ios
npm run ios:open   # abre ios/App/App.xcworkspace no Xcode
```

- No Xcode, em "Signing & Capabilities", selecionar o Team da sua conta Apple Developer.
- Rodar num simulador primeiro pra conferir: login, bater ponto (a permissao de localizacao
  precisa aparecer com o texto certo), navegar pelo painel admin/gestor.
- Depois rodar num iPhone real, se possivel, principalmente pra testar a permissao de
  localizacao de verdade (simulador as vezes simula posicao fixa).

## 4. App Store Connect

- Criar o registro do app em [appstoreconnect.apple.com](https://appstoreconnect.apple.com):
  - Nome: LC Transporte (ou o nome que preferir)
  - Bundle ID: `com.lctransporte.bancodehoras` (mesmo do Android, sem conflito)
  - Categoria: provavelmente "Negocios" (Business)
  - Classificacao etaria: sem conteudo sensivel, deve ficar livre (4+)
  - URL da politica de privacidade: a do passo 2
  - Screenshots: precisa tirar prints do app rodando num simulador/device (Xcode tem uma
    ferramenta pra isso)
  - Descricao curta explicando que e um app interno de ponto/gestao de frota da LC Transporte

## 5. Archive e envio

- No Xcode: Product → Archive.
- Enviar pro App Store Connect (botao "Distribute App" depois do archive).
- Preencher as perguntas de privacidade da Apple ("App Privacy") — como o app coleta
  localizacao vinculada ao usuario (nao anonima), a resposta correta e algo como
  "Localizacao vinculada a identidade do usuario, usada para funcionalidade do app,
  nao usada para rastreamento nem compartilhada com terceiros".
- Submeter pra revisao. A Apple normalmente responde em 1 a 3 dias uteis.

## O que NAO fazer

- Nao adicionar nenhum mecanismo de auto-update dentro do app pro iOS (baixar/instalar update
  fora da App Store) — isso e proibido pelas regras da Apple e pode causar rejeicao ou remocao
  do app. O app Android tem esse mecanismo (`checkForApkUpdate` em `public/app.js`), mas ele so
  dispara quando `isAndroidShell()` e verdadeiro — nao mexer nisso pro lado do iOS.
