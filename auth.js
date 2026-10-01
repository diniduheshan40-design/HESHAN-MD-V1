const fs = require("fs");
const path = require("path");
const pino = require("pino");
const mongoose = require("mongoose");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason,
  delay
} = require("@whiskeysockets/baileys");

const logger = pino({ level: "silent" });
const baseSessionDir = path.join(__dirname, "sessions");

if (!global.activeBotSockets) {
  global.activeBotSockets = new Set();
}

if (!global.allActiveSessions) {
  global.allActiveSessions = new Map();
}

let onSocketCreatedCallback = null;

/* =========================================================
   MONGODB SESSION MODEL
========================================================= */

const SessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      unique: true,
      required: true
    },
    phoneNumber: {
      type: String,
      required: true
    },
    files: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

const SessionModel =
  mongoose.models.DarkDinuSession ||
  mongoose.model("DarkDinuSession", SessionSchema);

/* =========================================================
   DIRECTORY HELPERS
========================================================= */

function ensureBaseDir() {
  if (!fs.existsSync(baseSessionDir)) {
    fs.mkdirSync(baseSessionDir, { recursive: true });
  }
}

function getSessionFolder(sessionId) {
  ensureBaseDir();
  const folder = path.join(baseSessionDir, sessionId);
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  return folder;
}

/* =========================================================
   BACKUP SESSION TO MONGODB
========================================================= */

async function backupSession(sessionId, phoneNumber) {
  try {
    const sessionDir = path.join(baseSessionDir, sessionId);
    if (!fs.existsSync(sessionDir)) return;

    const files = {};
    const list = fs.readdirSync(sessionDir);

    for (const file of list) {
      const filePath = path.join(sessionDir, file);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const safeName = file.replace(/\./g, "___dot___");
        files[safeName] = fs.readFileSync(filePath, "utf8");
      }
    }

    if (!Object.keys(files).length) return;

    await SessionModel.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          files,
          phoneNumber
        }
      },
      {
        upsert: true,
        new: true
      }
    );

    console.log(`💾 [MONGO BACKUP] ${phoneNumber}`);
  } catch (error) {
    console.error(`❌ [BACKUP ERROR] ${sessionId}:`, error.message);
  }
}

/* =========================================================
   CREATE SOCKET (PARALLEL MULTI-BOT)
========================================================= */

async function createMultiSocket(sessionId, phoneNumber, isPairing = false) {
  const sessionDir = getSessionFolder(sessionId);

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`🔧 [SOCKET] Initializing socket for ${phoneNumber}`);

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    browser: Browsers.ubuntu("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
    emitOwnEvents: true,
    generateHighQualityLinkPreview: false
  });

  sock.sessionId = sessionId;
  sock.phoneNumber = phoneNumber;

  // Creds Update Listener
  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
      await backupSession(sessionId, phoneNumber);
    } catch (error) {
      console.error("❌ Creds save error:", error.message);
    }
  });

  // Connection Update Listener
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, isNewLogin } = update;

    if (isNewLogin) {
      console.log(`🎉 [PAIRING SUCCESS] ${phoneNumber} Link Accepted!`);
    }

    if (connection === "open") {
      console.log(
        "\x1b[32m%s\x1b[0m",
        `🟢 [CONNECTED] ${phoneNumber} → DARK DINU ONLINE`
      );

      global.activeBotSockets.add(sock);
      global.allActiveSessions.set(sessionId, sock);
      await backupSession(sessionId, phoneNumber);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ [CLOSED] ${phoneNumber} | Status: ${statusCode}`);

      global.activeBotSockets.delete(sock);
      if (global.allActiveSessions.get(sessionId) === sock) {
        global.allActiveSessions.delete(sessionId);
      }

      // Logged out
      if (statusCode === DisconnectReason.loggedOut) {
        console.log(`🚪 [LOGGED OUT] ${phoneNumber}`);
        await SessionModel.deleteOne({ sessionId }).catch(() => {});
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch {}
        return;
      }

      // 515 restartRequired හෝ සාමාන්‍ය connection drop එකකදී Auto Reconnect වීම
      const delayMs = statusCode === DisconnectReason.restartRequired ? 1500 : 5000;
      setTimeout(async () => {
        try {
          if (global.allActiveSessions.has(sessionId)) return;
          console.log(`🔄 [RECONNECTING] ${phoneNumber}...`);
          await createMultiSocket(sessionId, phoneNumber, false);
        } catch (err) {
          console.error(`❌ Reconnect error ${phoneNumber}:`, err.message);
        }
      }, delayMs);
    }
  });

  if (onSocketCreatedCallback) {
    try {
      onSocketCreatedCallback(sock);
    } catch {}
  }

  return sock;
}

/* =========================================================
   RESTORE ALL MONGO SESSIONS
========================================================= */

async function restoreCredentials() {
  ensureBaseDir();

  try {
    const sessions = await SessionModel.find({}).lean();

    if (!sessions || sessions.length === 0) {
      console.log("ℹ️ [SESSIONS] No saved sessions in MongoDB.");
      return false;
    }

    console.log(`⚡ [SESSIONS] Restoring ${sessions.length} session(s)...`);

    for (const session of sessions) {
      try {
        const { sessionId, phoneNumber, files } = session;
        const sessionDir = getSessionFolder(sessionId);

        for (const [key, content] of Object.entries(files || {})) {
          const fileName = key.replace(/___dot___/g, ".");
          const filePath = path.join(sessionDir, fileName);
          fs.writeFileSync(filePath, content, "utf8");
        }

        console.log(`🔄 [RESTORE] Starting bot: ${phoneNumber}`);
        createMultiSocket(sessionId, phoneNumber, false).catch((err) => {
          console.error(`❌ Restore socket error ${phoneNumber}:`, err.message);
        });

        await delay(500);
      } catch (error) {
        console.error("❌ Session restore item error:", error.message);
      }
    }

    return true;
  } catch (error) {
    console.error("❌ Mongo restore error:", error.message);
    return false;
  }
}

/* =========================================================
   REQUEST PAIRING CODE (STABLE LINK DEVICE)
========================================================= */

async function requestPairCode(phoneNumber) {
  let cleanNumber = String(phoneNumber).replace(/[^0-9]/g, "");

  if (cleanNumber.startsWith("0")) {
    cleanNumber = "94" + cleanNumber.substring(1);
  }

  if (cleanNumber.length < 10) {
    throw new Error("Invalid phone number format.");
  }

  const sessionId = `session_${cleanNumber}`;
  const sessionDir = getSessionFolder(sessionId);

  // එකම නම්බර් එකෙන් පරණ socket එකක් තිබ්බොත් පමණක් close කිරීම
  const oldSocket = global.allActiveSessions.get(sessionId);
  if (oldSocket) {
    console.log(`♻️ [OLD SOCKET] Replacing session for ${cleanNumber}`);
    try { oldSocket.ev.removeAllListeners("connection.update"); } catch {}
    try { oldSocket.end(undefined); } catch {}
    global.activeBotSockets.delete(oldSocket);
    global.allActiveSessions.delete(sessionId);
    await delay(1000);
  }

  // පරණ කැඩිච්ච session files ඉවත් කර fresh session එකක් සෑදීම
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch {}
  ensureBaseDir();
  fs.mkdirSync(sessionDir, { recursive: true });

  console.log(`📱 [PAIRING] Starting socket handshake for ${cleanNumber}`);
  const sock = await createMultiSocket(sessionId, cleanNumber, true);

  return new Promise((resolve, reject) => {
    let isHandled = false;

    const timeout = setTimeout(() => {
      if (isHandled) return;
      isHandled = true;
      sock.ev.off("connection.update", onConnUpdate);
      reject(new Error("Pairing code generation timed out. Please try again."));
    }, 45000);

    const generateCode = async () => {
      if (isHandled) return;
      if (sock.authState?.creds?.registered) return;

      try {
        console.log(`🔐 [PAIRING] Requesting pairing code from WhatsApp...`);
        const rawCode = await sock.requestPairingCode(cleanNumber);

        if (!rawCode) {
          throw new Error("WhatsApp did not return a pairing code.");
        }

        const formattedCode =
          String(rawCode).length === 8
            ? `${String(rawCode).slice(0, 4)}-${String(rawCode).slice(4)}`
            : String(rawCode);

        console.log(`✅ [PAIRING CODE] ${cleanNumber}: ${formattedCode}`);

        isHandled = true;
        clearTimeout(timeout);
        sock.ev.off("connection.update", onConnUpdate);

        resolve({
          code: formattedCode,
          socket: sock
        });
      } catch (err) {
        isHandled = true;
        clearTimeout(timeout);
        sock.ev.off("connection.update", onConnUpdate);
        console.error(`❌ [CODE ERROR] ${cleanNumber}:`, err.message);
        reject(err);
      }
    };

    const onConnUpdate = async (update) => {
      if (isHandled) return;
      const { connection, qr } = update;

      // Socket එක WhatsApp engine එකට connect වූ වහාම code එක ලබා ගැනීම
      if (connection === "connecting" || qr) {
        await delay(1200);
        await generateCode();
      }
    };

    sock.ev.on("connection.update", onConnUpdate);

    // Fallback: Handshake update එක miss වුණොත් තත්පර 3 කින් code එක ඉල්ලීම
    setTimeout(async () => {
      if (!isHandled) {
        await generateCode();
      }
    }, 3500);
  });
}

/* =========================================================
   BACKWARD COMPATIBILITY & EXPORTS
========================================================= */

async function startSavedSocket() {
  return null;
}

async function backupAllCredentials() {
  try {
    const sessions = await SessionModel.find({}).lean();
    for (const session of sessions) {
      await backupSession(session.sessionId, session.phoneNumber);
    }
  } catch {}
}

function getActiveSocket() {
  return global.activeBotSockets.values().next().value || null;
}

module.exports = {
  restoreCredentials,
  backupAllCredentials,
  requestPairCode,
  startSavedSocket,
  onSocketCreated: (callback) => {
    onSocketCreatedCallback = callback;
  },
  getActiveSocket
};
