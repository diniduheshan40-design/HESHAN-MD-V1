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
    sessionId: { type: String, unique: true, required: true },
    phoneNumber: { type: String, required: true },
    files: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

const SessionModel =
  mongoose.models.DarkDinuSession ||
  mongoose.model("DarkDinuSession", SessionSchema);

/* =========================================================
   DIRECTORY HELPERS
========================================================= */

function ensureBaseDir() {
  try {
    if (!fs.existsSync(baseSessionDir)) {
      fs.mkdirSync(baseSessionDir, { recursive: true });
    }
  } catch (error) {
    console.error("❌ Base session directory error:", error.message);
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

function isSafeSessionFile(fileName) {
  if (!fileName) return false;
  return !fileName.includes("..") && !fileName.includes("/") && !fileName.includes("\\");
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
      try {
        const filePath = path.join(sessionDir, file);
        if (!fs.existsSync(filePath)) continue;

        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;

        const safeName = file.replace(/\./g, "___dot___");
        files[safeName] = fs.readFileSync(filePath, "utf8");
      } catch (fileError) {}
    }

    if (!Object.keys(files).length) return;

    await SessionModel.findOneAndUpdate(
      { sessionId },
      { $set: { files, phoneNumber } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`💾 [MONGO BACKUP] +${phoneNumber} synced!`);
  } catch (error) {
    console.error(`❌ [MONGO BACKUP ERROR] ${sessionId}:`, error.message);
  }
}

/* =========================================================
   REMOVE SESSION
========================================================= */

async function removeSession(sessionId, sessionDir) {
  try {
    await SessionModel.deleteOne({ sessionId });
  } catch (e) {}

  try {
    if (sessionDir && fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch (e) {}
}

/* =========================================================
   CREATE SOCKET (PARALLEL MULTI-BOT)
========================================================= */

async function createMultiSocket(sessionId, phoneNumber, isPairing = false) {
  const sessionDir = getSessionFolder(sessionId);

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  let version = [2, 3000, 1015901307];
  try {
    const vInfo = await fetchLatestBaileysVersion();
    if (vInfo && vInfo.version) version = vInfo.version;
  } catch (e) {}

  console.log(`🔧 [SOCKET] Initializing Baileys for +${phoneNumber}`);

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
    markOnlineOnConnect: false, // Fix: Pairing timeout වීම වළක්වයි
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    emitOwnEvents: true,
    generateHighQualityLinkPreview: false,
    retryRequestDelayMs: 500,
    maxMsgRetryCount: 5
  });

  sock.sessionId = sessionId;
  sock.phoneNumber = phoneNumber;

  global.allActiveSessions.set(sessionId, sock);

  /* =======================================================
     CREDS UPDATE
  ======================================================= */

  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
      await backupSession(sessionId, phoneNumber);
    } catch (error) {
      console.error(`❌ [CREDS SAVE ERROR] +${phoneNumber}:`, error.message);
    }
  });

  /* =======================================================
     CONNECTION UPDATE
  ======================================================= */

  sock.ev.on("connection.update", async (update) => {
    try {
      const { connection, lastDisconnect, isNewLogin } = update;

      if (isNewLogin) {
        console.log(`🎉 [LINK ACCEPTED] +${phoneNumber} Successfully Linked!`);
      }

      if (connection === "open") {
        console.log(
          "\x1b[32m%s\x1b[0m",
          `🟢 [CONNECTED] +${phoneNumber} → DARK DINU ONLINE & ACTIVE`
        );

        global.activeBotSockets.add(sock);
        global.allActiveSessions.set(sessionId, sock);
        await backupSession(sessionId, phoneNumber);
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`⚠️ [CLOSED] +${phoneNumber} | Status Code: ${statusCode}`);

        global.activeBotSockets.delete(sock);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log(`🚪 [LOGGED OUT] +${phoneNumber}`);
          global.allActiveSessions.delete(sessionId);
          await removeSession(sessionId, sessionDir);
          return;
        }

        if (statusCode === DisconnectReason.badSession) {
          console.log(`🗑️ [BAD SESSION] Corrupted session for +${phoneNumber}`);
          global.allActiveSessions.delete(sessionId);
          await removeSession(sessionId, sessionDir);
          return;
        }

        // Fix: 515 (restartRequired) එකෙන් පසු phone handshake timeout නොවී ක්ෂණිකව reconnect වීම
        if (statusCode === DisconnectReason.restartRequired || isPairing) {
          console.log(`⚡ [INSTANT RECONNECT] Finalizing link for +${phoneNumber}...`);
          setTimeout(async () => {
            try {
              await createMultiSocket(sessionId, phoneNumber, false);
            } catch (err) {
              console.error(`❌ Restart error +${phoneNumber}:`, err.message);
            }
          }, 500);
          return;
        }

        setTimeout(async () => {
          try {
            if (global.allActiveSessions.get(sessionId)?.user) return;
            console.log(`🔄 [AUTO RECONNECT] Reconnecting +${phoneNumber}...`);
            await createMultiSocket(sessionId, phoneNumber, false);
          } catch (error) {
            console.error(`❌ [RECONNECT ERROR] +${phoneNumber}:`, error.message);
          }
        }, 5000);
      }
    } catch (error) {
      console.error(`❌ [CONNECTION ERROR] +${phoneNumber}:`, error.message);
    }
  });

  if (onSocketCreatedCallback) {
    try {
      onSocketCreatedCallback(sock);
    } catch (error) {}
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

    console.log(`⚡ [SESSIONS] Restoring ${sessions.length} saved session(s)...`);

    for (const session of sessions) {
      try {
        const { sessionId, phoneNumber, files } = session;
        if (!sessionId || !phoneNumber) continue;

        const sessionDir = getSessionFolder(sessionId);

        for (const [key, content] of Object.entries(files || {})) {
          const fileName = key.replace(/___dot___/g, ".");
          if (!isSafeSessionFile(fileName)) continue;

          const filePath = path.join(sessionDir, fileName);
          fs.writeFileSync(filePath, content, "utf8");
        }

        console.log(`🔄 [RESTORING BOT]: +${phoneNumber}`);
        createMultiSocket(sessionId, phoneNumber, false).catch(() => {});
        await delay(400);
      } catch (err) {
        console.error("❌ Session restore item error:", err.message);
      }
    }

    return true;
  } catch (error) {
    console.error("❌ Mongo restore error:", error.message);
    return false;
  }
}

/* =========================================================
   REQUEST PAIRING CODE
========================================================= */

async function requestPairCode(phoneNumber) {
  let cleanNumber = String(phoneNumber).replace(/[^0-9]/g, "");

  if (cleanNumber.startsWith("0")) {
    cleanNumber = "94" + cleanNumber.substring(1);
  }

  if (!cleanNumber.startsWith("94") || cleanNumber.length !== 11) {
    throw new Error("Invalid Sri Lankan phone number. Example: 0771234567");
  }

  const sessionId = `session_${cleanNumber}`;
  const sessionDir = getSessionFolder(sessionId);

  const oldSocket = global.allActiveSessions.get(sessionId);
  if (oldSocket) {
    console.log(`♻️ [PAIRING] Resetting previous connection for +${cleanNumber}`);
    try { oldSocket.ev.removeAllListeners("connection.update"); } catch {}
    try { oldSocket.end(undefined); } catch {}
    global.activeBotSockets.delete(oldSocket);
    global.allActiveSessions.delete(sessionId);
    await delay(600);
  }

  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch (e) {}

  ensureBaseDir();
  fs.mkdirSync(sessionDir, { recursive: true });

  try {
    await SessionModel.deleteOne({ sessionId });
  } catch (e) {}

  console.log(`📱 [PAIRING] Creating clean socket for +${cleanNumber}...`);
  const sock = await createMultiSocket(sessionId, cleanNumber, true);

  return new Promise((resolve, reject) => {
    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error("Pairing code timeout. Please refresh and request a new code."));
    }, 45000);

    const generateCode = async () => {
      if (finished) return;
      if (sock.authState?.creds?.registered) return;

      try {
        await delay(2000); // Handshake complete වීමට අවශ්‍ය කාලය

        console.log(`🔐 [PAIRING] Generating official code for +${cleanNumber}...`);
        const rawCode = await sock.requestPairingCode(cleanNumber);

        if (!rawCode) throw new Error("WhatsApp did not return a pairing code.");

        const code = String(rawCode);
        const formattedCode =
          code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

        console.log(`✅ [PAIRING CODE READY] +${cleanNumber}: ${formattedCode}`);

        finished = true;
        clearTimeout(timeout);
        resolve({ code: formattedCode, socket: sock });
      } catch (err) {
        if (!finished) {
          finished = true;
          clearTimeout(timeout);
          console.error(`❌ [PAIRING ERROR] +${cleanNumber}:`, err.message);
          reject(err);
        }
      }
    };

    sock.ev.on("connection.update", async (update) => {
      const { connection, qr } = update;
      if (connection === "connecting" || qr) {
        await generateCode();
      }
    });

    setTimeout(async () => {
      if (!finished) await generateCode();
    }, 3000);
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
  } catch (e) {}
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
