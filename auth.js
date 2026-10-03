const fs = require("fs");
const path = require("path");
const pino = require("pino");
const mongoose = require("mongoose");

// Bad MAC error spam එක process console එකෙන්ම filter කර server freeze වීම වැළැක්වීම
const originalConsoleError = console.error;
console.error = (...args) => {
  const msg = args.join(" ");
  if (msg.includes("Bad MAC") || msg.includes("Session error:Error: Bad MAC") || msg.includes("Failed to decrypt message")) {
    return;
  }
  originalConsoleError.apply(console, args);
};

const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason,
  delay,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const logger = pino({ level: "silent" });
const baseSessionDir = path.join(__dirname, "sessions");

if (!global.activeBotSockets) global.activeBotSockets = new Set();
if (!global.allActiveSessions) global.allActiveSessions = new Map();
if (!global.sessionRetryCache) global.sessionRetryCache = new Map();

class SimpleCache {
  constructor(ttlSeconds = 60) {
    this.ttl = ttlSeconds * 1000;
    this.cache = new Map();
  }
  get(key) {
    const item = this.cache.get(key);
    if (!item) return undefined;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    return item.value;
  }
  set(key, value) {
    this.cache.set(key, { value, expiry: Date.now() + this.ttl });
  }
  del(key) {
    this.cache.delete(key);
  }
}

const reconnectRetries = new Map();
let onSocketCreatedCallback = null;

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
  try {
    if (!fs.existsSync(baseSessionDir)) {
      fs.mkdirSync(baseSessionDir, { recursive: true });
    }
  } catch (error) {}
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

function normalizePhoneNumber(phoneNumber) {
  let number = String(phoneNumber || "").replace(/[^0-9]/g, "");
  if (number.startsWith("0")) {
    number = "94" + number.substring(1);
  }
  if (!number.startsWith("94") || number.length !== 11) {
    throw new Error("Invalid Sri Lankan phone number. Example: 0771234567");
  }
  return number;
}

function getDisconnectCode(lastDisconnect) {
  try {
    return (
      lastDisconnect?.error?.output?.statusCode ||
      lastDisconnect?.error?.data?.statusCode ||
      lastDisconnect?.error?.statusCode ||
      null
    );
  } catch (error) {
    return null;
  }
}

const backupDebounce = new Map();

async function backupSession(sessionId, phoneNumber) {
  if (backupDebounce.has(sessionId)) {
    clearTimeout(backupDebounce.get(sessionId));
  }

  backupDebounce.set(
    sessionId,
    setTimeout(async () => {
      backupDebounce.delete(sessionId);
      try {
        const sessionDir = path.join(baseSessionDir, sessionId);
        if (!fs.existsSync(sessionDir)) return;

        const files = {};
        const list = fs.readdirSync(sessionDir);

        for (const file of list) {
          try {
            if (!isSafeSessionFile(file)) continue;
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
      } catch (error) {}
    }, 2000)
  );
}

async function removeSession(sessionId, sessionDir) {
  try {
    await SessionModel.deleteOne({ sessionId });
  } catch (error) {}

  try {
    if (sessionDir && fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch (error) {}
}

let cachedVersion = null;

async function createMultiSocket(sessionId, phoneNumber) {
  const sessionDir = getSessionFolder(sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  if (!cachedVersion) {
    try {
      const latest = await fetchLatestBaileysVersion();
      if (latest?.version) cachedVersion = latest.version;
    } catch (error) {
      cachedVersion = [2, 3000, 1015901307];
    }
  }

  if (!global.sessionRetryCache.has(sessionId)) {
    global.sessionRetryCache.set(sessionId, new SimpleCache(60));
  }
  const msgRetryCounterCache = global.sessionRetryCache.get(sessionId);

  const socketConfig = {
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    version: cachedVersion,
    browser: Browsers.macOS("Desktop"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    emitOwnEvents: false,
    generateHighQualityLinkPreview: false,
    msgRetryCounterCache,
    retryRequestDelayMs: 3000,
    maxMsgRetryCount: 1,
    getMessage: async () => ({ conversation: "" })
  };

  const sock = makeWASocket(socketConfig);

  if (sock.ev && typeof sock.ev.setMaxListeners === "function") {
    sock.ev.setMaxListeners(0);
  }

  sock.sessionId = sessionId;
  sock.phoneNumber = phoneNumber;
  sock.darkDinuAuthState = state;

  global.allActiveSessions.set(sessionId, sock);

  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
      backupSession(sessionId, phoneNumber);
    } catch (error) {}
  });

  sock.ev.on("connection.update", async (update) => {
    try {
      const { connection, lastDisconnect, isNewLogin } = update;

      if (isNewLogin) {
        console.log(`🎉 [LINK ACCEPTED] +${phoneNumber} Logged in!`);
      }

      if (connection === "open") {
        console.log(`🟢 [CONNECTED] +${phoneNumber} Active 24/7`);
        reconnectRetries.delete(sessionId);
        global.activeBotSockets.add(sock);
        global.allActiveSessions.set(sessionId, sock);

        try {
          await saveCreds();
          backupSession(sessionId, phoneNumber);
        } catch (e) {}
        return;
      }

      if (connection === "close") {
        const statusCode = getDisconnectCode(lastDisconnect);
        global.activeBotSockets.delete(sock);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log(`🚪 [LOGGED OUT] +${phoneNumber} Removed.`);
          reconnectRetries.delete(sessionId);
          global.allActiveSessions.delete(sessionId);
          await removeSession(sessionId, sessionDir);
          return;
        }

        if (statusCode === DisconnectReason.restartRequired) {
          try {
            await saveCreds();
            backupSession(sessionId, phoneNumber);
          } catch (e) {}

          setTimeout(() => {
            createMultiSocket(sessionId, phoneNumber).catch(() => {});
          }, 2000);
          return;
        }

        setTimeout(() => {
          createMultiSocket(sessionId, phoneNumber).catch(() => {});
        }, 5000);
      }
    } catch (error) {}
  });

  if (onSocketCreatedCallback) {
    try {
      onSocketCreatedCallback(sock);
    } catch (error) {}
  }

  return sock;
}

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
          try {
            const fileName = key.replace(/___dot___/g, ".");
            if (!isSafeSessionFile(fileName)) continue;

            const filePath = path.join(sessionDir, fileName);
            fs.writeFileSync(filePath, content, "utf8");
          } catch (fileError) {}
        }

        createMultiSocket(sessionId, phoneNumber).catch(() => {});
        await delay(1500);
      } catch (error) {}
    }

    return true;
  } catch (error) {
    console.error("❌ [MONGO RESTORE ERROR]:", error.message);
    return false;
  }
}

async function requestPairCode(phoneNumber) {
  const cleanNumber = normalizePhoneNumber(phoneNumber);
  const sessionId = `session_${cleanNumber}`;
  const sessionDir = getSessionFolder(sessionId);

  const oldSocket = global.allActiveSessions.get(sessionId);
  if (oldSocket) {
    try { global.activeBotSockets.delete(oldSocket); } catch (e) {}
    try {
      if (oldSocket.ev && typeof oldSocket.ev.removeAllListeners === "function") {
        oldSocket.ev.removeAllListeners("connection.update");
      }
    } catch (e) {}
    try { oldSocket.end(undefined); } catch (e) {}
    global.allActiveSessions.delete(sessionId);
    await delay(1000);
  }

  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch (error) {}

  ensureBaseDir();
  fs.mkdirSync(sessionDir, { recursive: true });

  try {
    await SessionModel.deleteOne({ sessionId });
  } catch (error) {}

  const sock = await createMultiSocket(sessionId, cleanNumber);

  return new Promise((resolve, reject) => {
    let completed = false;

    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        reject(new Error("Pairing code request timed out. Please try again."));
      }
    }, 45000);

    const checkAndRequest = async () => {
      try {
        await delay(2500);
        if (completed) return;

        if (sock.darkDinuAuthState?.creds?.registered) {
          completed = true;
          clearTimeout(timeout);
          return reject(new Error("Device is already registered."));
        }

        const rawCode = await sock.requestPairingCode(cleanNumber);
        if (!rawCode) throw new Error("No pairing code received from WhatsApp");

        const codeStr = String(rawCode);
        const formattedCode =
          codeStr.length === 8 ? `${codeStr.slice(0, 4)}-${codeStr.slice(4)}` : codeStr;

        completed = true;
        clearTimeout(timeout);
        resolve({ code: formattedCode });
      } catch (err) {
        if (!completed) {
          completed = true;
          clearTimeout(timeout);
          reject(err);
        }
      }
    };

    checkAndRequest();
  });
}

async function logoutAllBots() {
  console.log("🛑 [SYSTEM WIPE] Starting complete bot wipe & logout...");

  if (global.allActiveSessions && global.allActiveSessions.size > 0) {
    for (const [sessionId, sock] of global.allActiveSessions.entries()) {
      try {
        if (sock.logout) await sock.logout();
        if (sock.end) sock.end(undefined);
      } catch (err) {}
    }
    global.allActiveSessions.clear();
  }

  if (global.activeBotSockets) {
    global.activeBotSockets.clear();
  }

  try {
    await SessionModel.deleteMany({});
    console.log("🗑️ MongoDB DarkDinuSession cleared.");
  } catch (err) {}

  try {
    if (fs.existsSync(baseSessionDir)) {
      fs.rmSync(baseSessionDir, { recursive: true, force: true });
      fs.mkdirSync(baseSessionDir, { recursive: true });
      console.log("📁 Local session folders wiped.");
    }
  } catch (err) {}

  return true;
}

module.exports = {
  restoreCredentials,
  requestPairCode,
  logoutAllBots,
  onSocketCreated: (callback) => {
    onSocketCreatedCallback = callback;
  }
};
