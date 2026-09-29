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
let backupRunning = false;
let backupAgain = false;
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

function deleteSessionDir() {
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
}

/* =========================================================
   RESTORE & BACKUP
========================================================= */

async function restoreCredentials() {
  ensureSessionDir();
  try {
    const data = await SessionModel.findOne({ sessionId: "dark_dinu_session" }).lean();
    if (!data || !data.files) return false;

    deleteSessionDir();
    ensureSessionDir();

    const files = data.files instanceof Map ? Object.fromEntries(data.files) : data.files;
    for (const [fileName, content] of Object.entries(files)) {
      const filePath = path.join(sessionDir, fileName);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, "utf8");
    }
    return true;
  } catch (error) {
    console.error("❌ MongoDB restore error:", error);
    return false;
  }
}

async function backupCredentials() {
  if (backupRunning) {
    backupAgain = true;
    return;
  }
  backupRunning = true;

  try {
    ensureSessionDir();
    const files = {};
    const allFiles = fs.readdirSync(sessionDir);

    for (const fileName of allFiles) {
      const filePath = path.join(sessionDir, fileName);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        files[fileName] = fs.readFileSync(filePath, "utf8");
      }
    }
    if (Object.keys(files).length === 0) return;

    await SessionModel.findOneAndUpdate(
      { sessionId: "dark_dinu_session" },
      { $set: { files } },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error("❌ MongoDB backup error:", error.message);
  } finally {
    backupRunning = false;
    if (backupAgain) {
      backupAgain = false;
      setTimeout(backupCredentials, 1000);
    }
  }
}

/* =========================================================
   SOCKET CREATOR
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
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000
  });

  activeSocket = sock;

  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
      setTimeout(backupCredentials, 1000);
    } catch (e) {}
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      await backupCredentials();
    }
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
        return;
      }
      if (reconnectTimer) return;
      reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        try {
          const newSock = await createSocket(state, saveCreds);
          if (onSocketCreatedCallback) onSocketCreatedCallback(newSock);
        } catch (e) {}
      }, 5000);
    }
  });

  // index.js එකට socket එක pass කරනවා
  if (onSocketCreatedCallback) {
    onSocketCreatedCallback(sock);
  }

  return sock;
}

async function requestPairCode(phoneNumber) {
  if (activeSocket) {
    try { activeSocket.end(undefined); } catch (e) {}
    activeSocket = null;
  }

  deleteSessionDir();
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
  if (!fs.existsSync(path.join(sessionDir, "creds.json"))) return null;

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  return await createSocket(state, saveCreds);
}

module.exports = {
  restoreCredentials,
  requestPairCode,
  startSavedSocket,
  onSocketCreated: (cb) => { onSocketCreatedCallback = cb; },
  getActiveSocket: () => activeSocket
};
