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

// Global Active Sessions Map (Phone -> Socket)
if (!global.activeBotSockets) global.activeBotSockets = new Set();
if (!global.allActiveSessions) global.allActiveSessions = new Map();

let onSocketCreatedCallback = null;

/* =========================================================
   MONGODB MULTI-SESSION MODEL
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

function ensureBaseDir() {
  if (!fs.existsSync(baseSessionDir)) {
    fs.mkdirSync(baseSessionDir, { recursive: true });
  }
}

function getSessionFolder(sessionId) {
  ensureBaseDir();
  const targetDir = path.join(baseSessionDir, sessionId);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return targetDir;
}

/* =========================================================
   BACKUP SPECIFIC SESSION TO MONGODB
========================================================= */

async function backupSession(sessionId, phoneNumber) {
  try {
    const sDir = path.join(baseSessionDir, sessionId);
    if (!fs.existsSync(sDir)) return;

    const files = {};
    const allFiles = fs.readdirSync(sDir);

    for (const f of allFiles) {
      const fPath = path.join(sDir, f);
      if (fs.existsSync(fPath) && fs.statSync(fPath).isFile()) {
        const safeKey = f.replace(/\./g, "___dot___");
        files[safeKey] = fs.readFileSync(fPath, "utf8");
      }
    }

    if (Object.keys(files).length === 0) return;

    await SessionModel.findOneAndUpdate(
      { sessionId },
      { $set: { files, phoneNumber } },
      { upsert: true }
    );
  } catch (error) {
    console.error(`❌ [BACKUP ERROR: ${sessionId}]:`, error.message);
  }
}

/* =========================================================
   CREATE SOCKET FOR SPECIFIC SESSION (PARALLEL)
========================================================= */

async function createMultiSocket(sessionId, phoneNumber, isPairing = false) {
  const sDir = getSessionFolder(sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(sDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    browser: Browsers.windows("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
    defaultQueryTimeoutMs: 60000,
    emitOwnEvents: true
  });

  sock.sessionId = sessionId;
  sock.phoneNumber = phoneNumber;

  // Creds save
  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
      await backupSession(sessionId, phoneNumber);
    } catch (e) {}
  });

  // Connection Updates
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, isNewLogin } = update;

    if (connection === "open") {
      console.log(`\x1b[32m%s\x1b[0m`, `🟢 [CONNECTED]: Session ${phoneNumber} is Active & Ready!`);
      global.activeBotSockets.add(sock);
      global.allActiveSessions.set(sessionId, sock);
      await backupSession(sessionId, phoneNumber);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ [SESSION CLOSED: ${phoneNumber}] Status: ${statusCode}`);

      global.activeBotSockets.delete(sock);
      global.allActiveSessions.delete(sessionId);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log(`🚪 [LOGGED OUT]: Removing ${phoneNumber} from database.`);
        await SessionModel.deleteOne({ sessionId }).catch(() => {});
        try { fs.rmSync(sDir, { recursive: true, force: true }); } catch (e) {}
        return;
      }

      // Auto reconnect this specific session
      setTimeout(async () => {
        try {
          console.log(`🔄 [RECONNECTING]: Restoring ${phoneNumber}...`);
          await createMultiSocket(sessionId, phoneNumber, false);
        } catch (e) {}
      }, 5000);
    }
  });

  if (onSocketCreatedCallback) {
    onSocketCreatedCallback(sock);
  }

  return sock;
}

/* =========================================================
   RESTORE ALL 100+ SESSIONS AT BOT STARTUP
========================================================= */

async function restoreCredentials() {
  ensureBaseDir();
  try {
    const allSaved = await SessionModel.find({}).lean();
    if (!allSaved || allSaved.length === 0) {
      console.log("ℹ️ [SESSIONS] No saved sessions found in MongoDB.");
      return false;
    }

    console.log(`⚡ [SESSIONS] Found ${allSaved.length} saved bot sessions. Restoring all in parallel...`);

    for (const sessionDoc of allSaved) {
      try {
        const { sessionId, phoneNumber, files } = sessionDoc;
        const sDir = getSessionFolder(sessionId);

        for (const [key, content] of Object.entries(files || {})) {
          const fileName = key.replace(/___dot___/g, ".");
          const filePath = path.join(sDir, fileName);
          fs.writeFileSync(filePath, content, "utf8");
        }

        // Start this bot instance in background
        createMultiSocket(sessionId, phoneNumber, false);
      } catch (err) {
        console.error("Session restore item error:", err.message);
      }
    }

    return true;
  } catch (error) {
    console.error("❌ Multi-session restore error:", error.message);
    return false;
  }
}

/* =========================================================
   REQUEST PAIR CODE FOR A NEW USER (WITHOUT KILLING OTHERS)
========================================================= */

async function requestPairCode(phoneNumber) {
  let cleanNumber = String(phoneNumber).replace(/[^0-9]/g, "");
  if (cleanNumber.startsWith("0")) cleanNumber = "94" + cleanNumber.substring(1);

  const sessionId = `session_${cleanNumber}`;
  const sDir = getSessionFolder(sessionId);

  // පරණ මේ නම්බර් එකේම socket එකක් තිබ්බොත් close කරනවා (අනික් අයට කිසිම හානියක් නෑ)
  if (global.allActiveSessions.has(sessionId)) {
    try {
      const oldSock = global.allActiveSessions.get(sessionId);
      oldSock.end(undefined);
    } catch (e) {}
  }

  // Create fresh socket for this user
  const sock = await createMultiSocket(sessionId, cleanNumber, true);

  console.log(`📱 [NEW PAIR REQUEST] Generating code for ${cleanNumber}...`);

  return new Promise((resolve, reject) => {
    let finished = false;
    let codeRequested = false;

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error("Pairing code timeout. Please try again."));
    }, 35000);

    const requestCode = async () => {
      if (finished || codeRequested) return;
      if (sock.authState?.creds?.registered) return;
      codeRequested = true;

      try {
        const code = await sock.requestPairingCode(cleanNumber);
        if (!code) throw new Error("WhatsApp did not return a pairing code.");
        finished = true;
        clearTimeout(timeout);
        resolve({ code, socket: sock });
      } catch (error) {
        finished = true;
        clearTimeout(timeout);
        reject(error);
      }
    };

    sock.ev.on("connection.update", async (update) => {
      if (finished) return;
      const { connection, qr } = update;
      if (connection === "connecting" || !!qr) {
        await delay(1200);
        await requestCode();
      }
    });

    setTimeout(async () => {
      if (!finished && !codeRequested) await requestCode();
    }, 4000);
  });
}

// Dummy backward compatibility
async function startSavedSocket() {
  return null;
}
async function backupAllCredentials() {}

module.exports = {
  restoreCredentials,
  backupAllCredentials,
  requestPairCode,
  startSavedSocket,
  onSocketCreated: (callback) => {
    onSocketCreatedCallback = callback;
  },
  getActiveSocket: () => {
    // Return primary or first active socket
    return global.activeBotSockets.values().next().value || null;
  }
};
