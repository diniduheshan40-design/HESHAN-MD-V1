const fs = require("fs");
const path = require("path");
const pino = require("pino");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason,
  delay
} = require("@whiskeysockets/baileys");

const mongoose = require("mongoose");

const logger = pino({ level: "silent" });
const sessionDir = path.join(__dirname, "session");

let activeSocket = null;
let reconnectTimer = null;
let isReconnecting = false;
let onSocketCreatedCallback = null;

/* =========================================================
   MONGODB SESSION MODEL
========================================================= */

const SessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, unique: true, required: true },
    files: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

const SessionModel =
  mongoose.models.DarkDinuSession ||
  mongoose.model("DarkDinuSession", SessionSchema);

function ensureSessionDir() {
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
}

function deleteSessionDir() {
  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

/* =========================================================
   RESTORE FROM MONGODB
========================================================= */

async function restoreCredentials() {
  ensureSessionDir();
  try {
    const data = await SessionModel.findOne({ sessionId: "dark_dinu_session" }).lean();
    if (!data || !data.files || Object.keys(data.files).length === 0) {
      console.log("ℹ️ [SESSION] No saved session found in MongoDB.");
      return false;
    }

    deleteSessionDir();
    ensureSessionDir();

    let count = 0;
    for (const [key, content] of Object.entries(data.files)) {
      const fileName = key.replace(/___dot___/g, ".");
      const filePath = path.join(sessionDir, fileName);
      const dir = path.dirname(filePath);

      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, "utf8");
      count++;
    }

    console.log(`✅ [SESSION] Restored ${count} session files from MongoDB.`);
    return true;
  } catch (error) {
    console.error("❌ MongoDB restore error:", error.message);
    return false;
  }
}

/* =========================================================
   BACKUP ALL CREDENTIALS TO MONGODB (DEBOUNCED)
========================================================= */

let backupTimeout = null;
async function backupAllCredentials() {
  if (backupTimeout) clearTimeout(backupTimeout);

  backupTimeout = setTimeout(async () => {
    try {
      ensureSessionDir();
      const files = {};
      const allFiles = fs.readdirSync(sessionDir);

      for (const fileName of allFiles) {
        const filePath = path.join(sessionDir, fileName);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const safeKey = fileName.replace(/\./g, "___dot___");
          files[safeKey] = fs.readFileSync(filePath, "utf8");
        }
      }

      if (Object.keys(files).length === 0) return;

      await SessionModel.findOneAndUpdate(
        { sessionId: "dark_dinu_session" },
        { $set: { files } },
        { upsert: true }
      );
      console.log("⚡ [SESSION] Synced with MongoDB Atlas!");
    } catch (err) {
      console.error("❌ Backup error:", err.message);
    }
  }, 1000);
}

/* =========================================================
   CREATE SOCKET ENGINE
========================================================= */

async function createSocket(isPairing = false) {
  ensureSessionDir();
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  if (activeSocket) {
    try {
      activeSocket.ev.removeAllListeners();
      activeSocket.end(undefined);
    } catch (e) {}
    activeSocket = null;
  }

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    // Ubuntu Chrome Signature for bypassing Cloud/Render IP block
    browser: Browsers.ubuntu("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
    defaultQueryTimeoutMs: 0
  });

  activeSocket = sock;

  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
      await backupAllCredentials();
    } catch (e) {}
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      isReconnecting = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      console.log("\x1b[32m%s\x1b[0m", "🟢 [SOCKET] WhatsApp Stream Stabilized & Paired!");
      await backupAllCredentials();
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Connection closed. Status Code: ${statusCode}`);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log("🚪 Logged out from WhatsApp. Clearing session...");
        await SessionModel.deleteOne({ sessionId: "dark_dinu_session" }).catch(() => {});
        deleteSessionDir();
        return;
      }

      if (!isReconnecting && !isPairing) {
        isReconnecting = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);

        const delayMs = statusCode === DisconnectReason.restartRequired ? 2000 : 5000;
        console.log(`🔄 Reconnecting automatically in ${delayMs / 1000}s...`);

        reconnectTimer = setTimeout(async () => {
          try {
            await createSocket(false);
          } catch (e) {
            console.error("Auto-reconnect error:", e.message);
          } finally {
            isReconnecting = false;
          }
        }, delayMs);
      }
    }
  });

  if (onSocketCreatedCallback) {
    onSocketCreatedCallback(sock);
  }

  return sock;
}

/* =========================================================
   REQUEST PAIR CODE (FIXED: WAITS FOR HANDSHAKE READY)
========================================================= */

async function requestPairCode(phoneNumber) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  isReconnecting = true;

  deleteSessionDir();
  ensureSessionDir();

  const sock = await createSocket(true);
  const cleanNumber = String(phoneNumber).replace(/[^0-9]/g, "");

  return new Promise((resolve, reject) => {
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        isReconnecting = false;
        reject(new Error("Pairing code timed out. WhatsApp server not responding."));
      }
    }, 25000);

    const checkAndRequest = async (update) => {
      // Socket එක handshake ready වූ පසු පමණක් code එක request කිරීම
      if (update.qr || (!sock.authState.creds.registered && update.connection !== "close")) {
        sock.ev.off("connection.update", checkAndRequest);
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          try {
            await delay(2000);
            const code = await sock.requestPairingCode(cleanNumber);
            isReconnecting = false;
            resolve({ code, socket: sock });
          } catch (err) {
            isReconnecting = false;
            reject(err);
          }
        }
      }
    };

    sock.ev.on("connection.update", checkAndRequest);
  });
}

/* =========================================================
   START SAVED SOCKET
========================================================= */

async function startSavedSocket() {
  ensureSessionDir();
  const credsFile = path.join(sessionDir, "creds.json");
  if (!fs.existsSync(credsFile)) return null;

  return await createSocket(false);
}

module.exports = {
  restoreCredentials,
  backupAllCredentials,
  requestPairCode,
  startSavedSocket,
  onSocketCreated: (cb) => { onSocketCreatedCallback = cb; },
  getActiveSocket: () => activeSocket
};
