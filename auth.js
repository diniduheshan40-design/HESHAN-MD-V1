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
let onSocketCreatedCallback = null;

/* =========================================================
   MONGODB SESSION MODEL
========================================================= */

const SessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, unique: true, required: true },
    files: { type: Map, of: String, default: {} }
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

/* =========================================================
   RESTORE FROM MONGODB (STARTUP)
========================================================= */

async function restoreCredentials() {
  ensureSessionDir();
  try {
    const data = await SessionModel.findOne({ sessionId: "dark_dinu_session" }).lean();
    if (!data || !data.files) {
      console.log("ℹ️ [SESSION] No saved session found in MongoDB.");
      return false;
    }

    const files = data.files instanceof Map ? Object.fromEntries(data.files) : data.files;
    let count = 0;

    for (const [fileName, content] of Object.entries(files)) {
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
   IMMEDIATE BACKUP TO MONGODB (SAFE & CRASH PROOF)
========================================================= */

async function backupSingleFile(fileName, content) {
  try {
    await SessionModel.findOneAndUpdate(
      { sessionId: "dark_dinu_session" },
      { $set: { [`files.${fileName.replace(/\./g, "_")}`]: content } },
      { upsert: true }
    );
  } catch (e) {}
}

async function backupAllCredentials() {
  try {
    ensureSessionDir();
    const files = {};
    const allFiles = fs.readdirSync(sessionDir);

    for (const fileName of allFiles) {
      const filePath = path.join(sessionDir, fileName);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        // Mongo keys can't have dots in some versions
        files[fileName.replace(/\./g, "_")] = fs.readFileSync(filePath, "utf8");
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
}

/* =========================================================
   CREATE SOCKET
========================================================= */

async function createSocket(state, saveCreds) {
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    browser: Browsers.macOS("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
    defaultQueryTimeoutMs: 60000
  });

  activeSocket = sock;

  // Credential එකක් ආපු ගමන් එසැනින් MongoDB backup වෙනවා
  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
      await backupAllCredentials();
    } catch (e) {}
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("✅ [WHATSAPP] Session is LIVE and Active!");
      await backupAllCredentials();
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Connection closed. Status Code: ${statusCode}`);

      // Logged out උනොත් විතරක් session delete කරනවා
      if (statusCode === DisconnectReason.loggedOut) {
        console.log("🚪 Logged out from WhatsApp.");
        await SessionModel.deleteOne({ sessionId: "dark_dinu_session" }).catch(()=>{});
        return;
      }

      // Render Deploy / Network drop එකකදී Auto Reconnect වීම
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(async () => {
          reconnectTimer = null;
          console.log("🔄 Reconnecting automatically...");
          try {
            const newSock = await createSocket(state, saveCreds);
            if (onSocketCreatedCallback) onSocketCreatedCallback(newSock);
          } catch (e) {
            console.error("Auto-reconnect error:", e.message);
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
   PAIR CODE & SAVED SOCKET
========================================================= */

async function requestPairCode(phoneNumber) {
  if (activeSocket) {
    try { activeSocket.end(undefined); } catch (e) {}
    activeSocket = null;
  }

  ensureSessionDir();

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const sock = await createSocket(state, saveCreds);

  await new Promise(r => setTimeout(r, 3000));
  const cleanNumber = String(phoneNumber).replace(/[^0-9]/g, "");
  const code = await sock.requestPairingCode(cleanNumber);

  return { code, socket: sock };
}

async function startSavedSocket() {
  ensureSessionDir();

  // MongoDB එකෙන් Restore කරපු creds file එක බලනවා
  const credsFile = path.join(sessionDir, "creds.json");
  if (!fs.existsSync(credsFile)) return null;

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  return await createSocket(state, saveCreds);
}

module.exports = {
  restoreCredentials,
  backupAllCredentials,
  requestPairCode,
  startSavedSocket,
  onSocketCreated: (cb) => { onSocketCreatedCallback = cb; },
  getActiveSocket: () => activeSocket
};
