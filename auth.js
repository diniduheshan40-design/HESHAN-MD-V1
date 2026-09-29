const fs = require("fs");
const path = require("path");
const pino = require("pino");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const mongoose = require("mongoose");

const logger = pino({ level: "silent" });
const sessionDir = path.join(__dirname, "session");

let activeSocket = null;
let reconnectTimer = null;
let isReconnecting = false;
let onSocketCreatedCallback = null;

/* =========================================================
   MONGODB SESSION MODEL (Mixed for Safe JSON Storage)
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
    fs.rmSync(sessionDir, { recursive: true, force: true });
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
    } catch (err) {
      console.error("❌ Backup error:", err.message);
    }
  }, 2000);
}

/* =========================================================
   CREATE SOCKET ENGINE
========================================================= */

async function createSocket() {
  ensureSessionDir();
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

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
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    defaultQueryTimeoutMs: 60000
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
      await backupAllCredentials();
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Connection closed. Status Code: ${statusCode}`);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log("🚪 Logged out from WhatsApp.");
        await SessionModel.deleteOne({ sessionId: "dark_dinu_session" }).catch(() => {});
        deleteSessionDir();
        return;
      }

      if (!isReconnecting) {
        isReconnecting = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);

        reconnectTimer = setTimeout(async () => {
          console.log("🔄 Reconnecting WhatsApp Socket safely...");
          try {
            if (activeSocket) {
              try { activeSocket.end(undefined); } catch (e) {}
            }
            await createSocket();
          } catch (e) {
            console.error("Auto-reconnect error:", e.message);
            isReconnecting = false;
          }
        }, 3000);
      }
    }
  });

  if (onSocketCreatedCallback) {
    onSocketCreatedCallback(sock);
  }

  return sock;
}

/* =========================================================
   REQUEST PAIR CODE
========================================================= */

async function requestPairCode(phoneNumber) {
  if (activeSocket) {
    try { activeSocket.end(undefined); } catch (e) {}
    activeSocket = null;
  }

  deleteSessionDir();
  ensureSessionDir();

  const sock = await createSocket();

  await new Promise((r) => setTimeout(r, 3000));
  const cleanNumber = String(phoneNumber).replace(/[^0-9]/g, "");
  const code = await sock.requestPairingCode(cleanNumber);

  return { code, socket: sock };
}

/* =========================================================
   START SAVED SOCKET
========================================================= */

async function startSavedSocket() {
  ensureSessionDir();
  const credsFile = path.join(sessionDir, "creds.json");
  if (!fs.existsSync(credsFile)) return null;

  return await createSocket();
}

module.exports = {
  restoreCredentials,
  backupAllCredentials,
  requestPairCode,
  startSavedSocket,
  onSocketCreated: (cb) => { onSocketCreatedCallback = cb; },
  getActiveSocket: () => activeSocket
};
