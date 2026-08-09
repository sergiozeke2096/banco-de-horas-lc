const path = require("path");

// Bot de ponto por WhatsApp usando uma biblioteca nao-oficial (Baileys), que
// automatiza um numero comum de WhatsApp sem passar pela API paga da Meta.
// Decisao consciente do usuario: isso roda por fora dos termos de uso do
// WhatsApp e o numero pode ser banido a qualquer momento sem aviso previo.
// Por isso esse bot e so um canal adicional de conveniencia — o app/APK
// continua sendo o caminho garantido pra bater ponto.
//
// So usa palavras-chave fixas (sem IA livre interpretando a mensagem): a
// Meta baniu bots de IA "livres" na propria plataforma em jan/2026, e pra um
// sistema que alimenta folha de pagamento, ambiguidade e pior que o beneficio.

const KEYWORD_TO_ACTION = {
  INICIO: "Entrada",
  ENTRADA: "Entrada",
  COMECAR: "Entrada",
  PARADA: "Saida para almoco",
  ALMOCO: "Saida para almoco",
  RETORNO: "Retorno do almoco",
  VOLTEI: "Retorno do almoco",
  TERMINO: "Saida",
  FIM: "Saida",
  SAIDA: "Saida",
};

// Mesmos rotulos que o funcionario ve nos botoes do app (public/app.js,
// PUNCH_LABELS) — pra confirmacao do bot usar a mesma linguagem.
const ACTION_LABELS = {
  "Entrada": "Inicio",
  "Saida para almoco": "Parada",
  "Retorno do almoco": "Retorno",
  "Saida": "Termino",
};

const HELP_TEXT =
  "Nao entendi. Responda com uma dessas palavras pra bater o ponto:\n" +
  "INICIO, PARADA, RETORNO ou TERMINO.";

const PENDING_STATE_TTL_MS = 5 * 60 * 1000;

// Estado do modulo, consultado pela rota GET /api/admin/whatsapp/status
// (server.js) pra desenhar o QR como imagem numa pagina web — o QR em ASCII
// no terminal costuma distorcer demais pra camera de celular ler.
let connectionState = { status: "disconnected", qr: null };

function getConnectionState() {
  return connectionState;
}

function normalizeKeyword(text) {
  return String(text || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function extractMessageText(message) {
  return (
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    ""
  );
}

function createPendingStateStore() {
  const byPhone = new Map();

  return {
    get(phone) {
      const entry = byPhone.get(phone);
      if (!entry) {
        return null;
      }
      if (entry.expiresAt < Date.now()) {
        byPhone.delete(phone);
        return null;
      }
      return entry;
    },
    set(phone, data) {
      byPhone.set(phone, { ...data, expiresAt: Date.now() + PENDING_STATE_TTL_MS });
    },
    clear(phone) {
      byPhone.delete(phone);
    },
  };
}

async function handleIncomingMessage(sock, message, deps, pendingStore) {
  const { createPunchRecord, getUserByPhone, buildVehicleContextForUser, canReuseCurrentVehicleForAction } = deps;

  if (message.key.fromMe || !message.message) {
    return;
  }

  const remoteJid = message.key.remoteJid;
  if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") {
    return;
  }

  const phone = remoteJid.split("@")[0];
  const reply = (text) => sock.sendMessage(remoteJid, { text });

  const user = await getUserByPhone(phone);
  if (!user) {
    await reply(
      "Esse numero nao esta cadastrado no sistema de ponto. Peca pro administrador vincular seu WhatsApp no cadastro do seu usuario."
    );
    return;
  }

  const locationMessage = message.message.locationMessage;
  const pending = pendingStore.get(phone);

  if (locationMessage) {
    if (!pending?.action) {
      await reply("Manda primeiro a palavra-chave (INICIO, PARADA, RETORNO ou TERMINO) antes de compartilhar a localizacao.");
      return;
    }

    const result = await createPunchRecord(user, {
      action: pending.action,
      latitude: locationMessage.degreesLatitude,
      longitude: locationMessage.degreesLongitude,
      locationLabel: "Compartilhado via WhatsApp",
      vehiclePlate: pending.vehiclePlate,
      vehicleKm: pending.vehicleKm,
      clientRequestId: `whatsapp-${message.key.id}`,
    });

    pendingStore.clear(phone);

    if (result.status >= 200 && result.status < 300) {
      await reply(`Ponto registrado: ${ACTION_LABELS[pending.action] || pending.action}.`);
    } else {
      await reply(`Nao consegui registrar o ponto: ${result.body.error}`);
    }
    return;
  }

  const text = extractMessageText(message).trim();

  if (pending?.step === "awaiting_plate") {
    if (!text) {
      await reply("Manda a placa do veiculo (ex.: ABC1D23).");
      return;
    }
    pendingStore.set(phone, { ...pending, vehiclePlate: text.toUpperCase(), step: "awaiting_km" });
    await reply("Qual o KM atual do veiculo?");
    return;
  }

  if (pending?.step === "awaiting_km") {
    const km = Number(String(text).replace(",", "."));
    if (!text || Number.isNaN(km)) {
      await reply("KM invalido. Manda so o numero, por exemplo: 125430");
      return;
    }
    pendingStore.set(phone, { ...pending, vehicleKm: km, step: "awaiting_location" });
    await reply("Agora manda sua localizacao atual (toque no clipe/anexo -> Localizacao).");
    return;
  }

  const action = KEYWORD_TO_ACTION[normalizeKeyword(text)];
  if (!action) {
    await reply(HELP_TEXT);
    return;
  }

  const vehicleContext = await buildVehicleContextForUser(user.id);
  const canReuseVehicle =
    canReuseCurrentVehicleForAction(action) && vehicleContext.activeJourney && Boolean(vehicleContext.currentVehicle?.plate);

  if (!canReuseVehicle) {
    pendingStore.set(phone, { step: "awaiting_plate", action });
    await reply(`Ok, ${ACTION_LABELS[action] || action}. Qual a placa do veiculo?`);
    return;
  }

  pendingStore.set(phone, { step: "awaiting_location", action });
  await reply(`Ok, ${ACTION_LABELS[action] || action}. Agora manda sua localizacao atual (toque no clipe/anexo -> Localizacao).`);
}

async function startWhatsAppBot(deps) {
  // Require aqui dentro (nao no topo do arquivo) pra os pacotes so precisarem
  // estar instalados/carregados quando WHATSAPP_ENABLED=true de verdade tenta
  // ligar o bot.
  const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
  // printQRInTerminal foi descontinuado pelo Baileys (so avisa e nao desenha
  // mais nada) — desenhamos o QR na mao com qrcode-terminal a partir do
  // evento connection.update.
  const qrcodeTerminal = require("qrcode-terminal");

  const authFolder = path.join(__dirname, "..", ".whatsapp-auth");
  const pendingStore = createPendingStateStore();

  async function connect() {
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const sock = makeWASocket({ auth: state });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      if (update.qr) {
        console.log("[whatsapp-bot] QR code novo gerado. Acesse /api/admin/whatsapp/status (painel admin) pra escanear.");
        qrcodeTerminal.generate(update.qr, { small: true });
        connectionState = { status: "qr", qr: update.qr };
      }

      if (update.connection === "close") {
        const statusCode = update.lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.warn(
          "[whatsapp-bot] Conexao encerrada.",
          shouldReconnect ? "Tentando reconectar..." : "Sessao desconectada — apague .whatsapp-auth e escaneie o QR de novo."
        );
        connectionState = { status: "disconnected", qr: null };
        if (shouldReconnect) {
          connect().catch((error) => console.error("[whatsapp-bot] Falha ao reconectar:", error.message));
        }
      } else if (update.connection === "open") {
        console.log("[whatsapp-bot] Conectado ao WhatsApp.");
        connectionState = { status: "connected", qr: null };
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      for (const message of messages) {
        try {
          await handleIncomingMessage(sock, message, deps, pendingStore);
        } catch (error) {
          console.error("[whatsapp-bot] Erro ao processar mensagem:", error.message);
        }
      }
    });
  }

  await connect();
}

module.exports = { startWhatsAppBot, getConnectionState };
