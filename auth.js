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
      { $set: { files, phoneNumber } },
      { upsert: true, new: true }
    );

    console.log(`💾 [MONGO BACKUP] ${phoneNumber}`);
  } catch (error) {
    console.error(`❌ [BACKUP ERROR] ${sessionId}:`, error.message);
  }
}

/* =========================================================
   CREATE SOCKET (MULTI-DEVICE PARALLEL)
========================================================= */

async function createMultiSocket(sessionId, phoneNumber, isPairing = false) {
  const sessionDir = getSessionFolder(sessionId);

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`🔧 [SOCKET] Initializing Baileys v${version.join(".")} (Latest: ${isLatest}) for ${phoneNumber}`);

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    // WA Business සහ Standard WhatsApp වලට 100% Accept වන Mac/Desktop Web signature එක
    browser: Browsers.macOS("Desktop"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
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

  // Creds save
  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
      await backupSession(sessionId, phoneNumber);
    } catch (error) {
      console.error("❌ Creds save error:", error.message);
    }
  });

  // Connection update
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, isNewLogin } = update;

    if (isNewLogin) {
      console.log(`🎉 [LINK ACCEPTED] ${phoneNumber} Successfully Linked!`);
    }

    if (connection === "open") {
      console.log(
        "\x1b[32m%s\x1b[0m",
        `🟢 [CONNECTED] ${phoneNumber} → DARK DINU ONLINE & ACTIVE`
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

      // User actively logged out
      if (statusCode === DisconnectReason.loggedOut) {
        console.log(`🚪 [LOGGED OUT] ${phoneNumber}`);
        await SessionModel.deleteOne({ sessionId }).catch(() => {});
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch {}
        return;
      }

      // Status 515 (restartRequired) - Pairing code එකෙන් login වූ පසු WhatsApp දෙන auto restart එක
      if (statusCode === DisconnectReason.restartRequired || isPairing) {
        console.log(`🔄 [PAIRING RESTART] Handling post-pair restart for ${phoneNumber}...`);
        setTimeout(async () => {
          try {
            await createMultiSocket(sessionId, phoneNumber, false);
          } catch (e) {
            console.error("Post-pair reconnect error:", e.message);
          }
        }, 1500);
        return;
      }

      // General auto reconnect
      setTimeout(async () => {
        try {
          if (global.allActiveSessions.has(sessionId)) return;
          console.log(`🔄 [AUTO RECONNECT] Restoring ${phoneNumber}...`);
          await createMultiSocket(sessionId, phoneNumber, false);
        } catch (err) {
          console.error(`❌ Reconnect error ${phoneNumber}:`, err.message);
        }
      }, 5000);
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
   RESTORE ALL MONGO SESSIONS AT SERVER START
========================================================= */

async function restoreCredentials() {
  ensureBaseDir();

  try {
    const sessions = await SessionModel.find({}).lean();

    if (!sessions || sessions.length === 0) {
      console.log("ℹ️ [SESSIONS] No saved sessions in MongoDB.");
      return false;
    }

    console.log(`⚡ [SESSIONS] Restoring ${sessions.length} session(s) in parallel...`);

    for (const session of sessions) {
      try {
        const { sessionId, phoneNumber, files } = session;
        const sessionDir = getSessionFolder(sessionId);

        for (const [key, content] of Object.entries(files || {})) {
          const fileName = key.replace(/___dot___/g, ".");
          const filePath = path.join(sessionDir, fileName);
          fs.writeFileSync(filePath, content, "utf8");
        }

        console.log(`🔄 [STARTING SESSION]: +${phoneNumber}`);
        createMultiSocket(sessionId, phoneNumber, false).catch((err) => {
          console.error(`❌ Socket error ${phoneNumber}:`, err.message);
        });

        await delay(400); // Parallel startup rate-limiting
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
   REQUEST PAIRING CODE (100% STABLE LINK DEVICE)
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

  // Close existing temporary socket if already opened
  const oldSocket = global.allActiveSessions.get(sessionId);
  if (oldSocket) {
    try { oldSocket.ev.removeAllListeners("connection.update"); } catch {}
    try { oldSocket.end(undefined); } catch {}
    global.activeBotSockets.delete(oldSocket);
    global.allActiveSessions.delete(sessionId);
    await delay(500);
  }

  // Clear broken session cache for this specific number only
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch {}
  ensureBaseDir();
  fs.mkdirSync(sessionDir, { recursive: true });

  console.log(`📱 [PAIRING] Starting socket for ${cleanNumber}...`);
  const sock = await createMultiSocket(sessionId, cleanNumber, true);

  return new Promise((resolve, reject) => {
    let resolved = false;

    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      reject(new Error("Pairing code timeout. Please refresh and request a new code."));
    }, 40000);

    const requestCode = async () => {
      if (resolved) return;
      if (sock.authState?.creds?.registered) return;

      try {
        // WhatsApp socket handshake එක නිසි පරිදි සම්පූර්ණ වීමට තත්පර 1.5ක් ලබාදීම
        await delay(1500);

        console.log(`🔐 [PAIRING] Requesting Pairing Code from WhatsApp for ${cleanNumber}...`);
        const rawCode = await sock.requestPairingCode(cleanNumber);

        if (!rawCode) {
          throw new Error("WhatsApp did not return a valid pairing code.");
        }

        const formattedCode =
          String(rawCode).length === 8
            ? `${String(rawCode).slice(0, 4)}-${String(rawCode).slice(4)}`
            : String(rawCode);

        console.log(`✅ [PAIRING CODE GENERATED] ${cleanNumber}: ${formattedCode}`);

        resolved = true;
        clearTimeout(timeout);
        resolve({ code: formattedCode, socket: sock });
      } catch (err) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.error(`❌ [PAIRING ERROR] ${cleanNumber}:`, err.message);
          reject(err);
        }
      }
    };

    // Socket status එක 'connecting' තත්ත්වයට පත් වූ විගස code එක generate කිරීම
    sock.ev.on("connection.update", async (update) => {
      const { connection, qr } = update;
      if (connection === "connecting" || qr) {
        await requestCode();
      }
    });

    // Fallback trigger
    setTimeout(async () => {
      if (!resolved) {
        await requestCode();
      }
    }, 2500);
  });
}

/* =========================================================
   EXPORTS
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
