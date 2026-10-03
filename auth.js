const fs = require("fs");
const path = require("path");
const pino = require("pino");
const mongoose = require("mongoose");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason,
  delay,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

// Silent logger prevents console flood on temporary decrypt glitches
const logger = pino({ level: "silent" });
const baseSessionDir = path.join(__dirname, "sessions");

/* =========================================================
   GLOBAL STORAGE & MEMORY MANAGEMENT
========================================================= */

if (!global.activeBotSockets) {
  global.activeBotSockets = new Set();
}

if (!global.allActiveSessions) {
  global.allActiveSessions = new Map();
}

if (!global.sessionRetryCache) {
  global.sessionRetryCache = new Map();
}

const reconnectRetries = new Map();
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
  try {
    if (!fs.existsSync(baseSessionDir)) {
      fs.mkdirSync(baseSessionDir, { recursive: true });
    }
  } catch (error) {
    console.error("❌ [DIRECTORY ERROR]:", error.message);
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
  return (
    !fileName.includes("..") &&
    !fileName.includes("/") &&
    !fileName.includes("\\")
  );
}

/* =========================================================
   PHONE NUMBER NORMALIZER
========================================================= */

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

/* =========================================================
   DISCONNECT CODE HELPER
========================================================= */

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

/* =========================================================
   BACKUP SESSION TO MONGODB (DEBOUNCED)
========================================================= */

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
      } catch (error) {
        console.error(`❌ [MONGO BACKUP ERROR] ${sessionId}:`, error.message);
      }
    }, 1500)
  );
}

/* =========================================================
   REMOVE SESSION (SAFE LOGOUT)
========================================================= */

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

/* =========================================================
   CREATE BAILEYS SOCKET (FIXED FOR BAD MAC / DESYNC)
========================================================= */

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

  // Socket-specific retry cache prevents Bad MAC deadlocks
  if (!global.sessionRetryCache.has(sessionId)) {
    global.sessionRetryCache.set(sessionId, new Map());
  }
  const msgRetryCounterCache = global.sessionRetryCache.get(sessionId);

  const socketConfig = {
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    version: cachedVersion,
    browser: Browsers.ubuntu("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    emitOwnEvents: true,
    generateHighQualityLinkPreview: false,
    msgRetryCounterCache,
    retryRequestDelayMs: 2500,
    maxMsgRetryCount: 5,
    // Safely bypass broken messages without killing session
    getMessage: async (key) => {
      return { conversation: "" };
    }
  };

  const sock = makeWASocket(socketConfig);

  if (sock.ev && typeof sock.ev.setMaxListeners === "function") {
    sock.ev.setMaxListeners(0);
  }

  sock.sessionId = sessionId;
  sock.phoneNumber = phoneNumber;
  sock.darkDinuAuthState = state;

  global.allActiveSessions.set(sessionId, sock);

  /* =======================================================
     CREDS UPDATE
  ======================================================= */

  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
      await backupSession(sessionId, phoneNumber);
    } catch (error) {}
  });

  /* =======================================================
     CONNECTION UPDATE
  ======================================================= */

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
          await backupSession(sessionId, phoneNumber);
        } catch (e) {}
        return;
      }

      if (connection === "close") {
        const statusCode = getDisconnectCode(lastDisconnect);
        global.activeBotSockets.delete(sock);

        // Actual logged out check (prevent accidental deletions)
        if (statusCode === DisconnectReason.loggedOut) {
          const retries = reconnectRetries.get(sessionId) || 0;
          if (retries < 2) {
            reconnectRetries.set(sessionId, retries + 1);
            console.log(`⚠️ [VERIFYING 401] +${phoneNumber} - Retry verification: ${retries + 1}`);
            setTimeout(() => {
              createMultiSocket(sessionId, phoneNumber).catch(() => {});
            }, 3000);
            return;
          }

          console.log(`🚪 [CONFIRMED LOGOUT] +${phoneNumber} Removed.`);
          reconnectRetries.delete(sessionId);
          global.allActiveSessions.delete(sessionId);
          await removeSession(sessionId, sessionDir);
          return;
        }

        // WhatsApp 515 Restart Request
        if (statusCode === DisconnectReason.restartRequired) {
          try {
            await saveCreds();
            await backupSession(sessionId, phoneNumber);
          } catch (e) {}

          if (global.allActiveSessions.get(sessionId) === sock) {
            global.allActiveSessions.delete(sessionId);
          }

          setTimeout(() => {
            createMultiSocket(sessionId, phoneNumber).catch(() => {});
          }, 2000);
          return;
        }

        // Auto reconnect for server wakeups / network switches
        if (global.allActiveSessions.get(sessionId) === sock) {
          global.allActiveSessions.delete(sessionId);
        }

        setTimeout(() => {
          const current = global.allActiveSessions.get(sessionId);
          if (current && current !== sock) return;

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

/* =========================================================
   RESTORE ALL MONGO SESSIONS AT STARTUP
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
          try {
            const fileName = key.replace(/___dot___/g, ".");
            if (!isSafeSessionFile(fileName)) continue;

            const filePath = path.join(sessionDir, fileName);
            fs.writeFileSync(filePath, content, "utf8");
          } catch (fileError) {}
        }

        createMultiSocket(sessionId, phoneNumber).catch(() => {});
        await delay(1200);
      } catch (error) {}
    }

    return true;
  } catch (error) {
    console.error("❌ [MONGO RESTORE ERROR]:", error.message);
    return false;
  }
}

/* =========================================================
   REQUEST PAIRING CODE
========================================================= */

async function requestPairCodeInternal(sock, cleanNumber) {
  let requestStarted = false;

  return new Promise((resolve, reject) => {
    let finished = false;
    let pairingTimer = null;
    let hardTimeout = null;

    const cleanup = () => {
      try {
        sock.ev.off("connection.update", onUpdate);
      } catch (e) {}
      if (pairingTimer) clearTimeout(pairingTimer);
      if (hardTimeout) clearTimeout(hardTimeout);
    };

    const fail = (error) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(error);
    };

    const generateCode = async () => {
      if (finished || requestStarted) return;
      if (sock.darkDinuAuthState?.creds?.registered) return;

      requestStarted = true;

      try {
        const rawCode = await sock.requestPairingCode(cleanNumber);
        if (!rawCode) throw new Error("WhatsApp did not return a pairing code.");

        const code = String(rawCode);
        const formattedCode =
          code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

        if (finished) return;
        finished = true;
        cleanup();

        resolve({ code: formattedCode, socket: sock });
      } catch (error) {
        requestStarted = false;
        fail(error);
      }
    };

    const onUpdate = async (update) => {
      try {
        const { connection, qr } = update;
        if (qr) {
          await generateCode();
          return;
        }

        if (connection === "connecting") {
          if (!pairingTimer && !requestStarted) {
            pairingTimer = setTimeout(async () => {
              pairingTimer = null;
              await generateCode();
            }, 3000);
          }
        }
      } catch (error) {
        fail(error);
      }
    };

    sock.ev.on("connection.update", onUpdate);

    hardTimeout = setTimeout(() => {
      fail(new Error("Pairing code timeout. Please try again."));
    }, 60000);
  });
}

/* =========================================================
   REQUEST PAIRING CODE - PUBLIC
========================================================= */

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
  return await requestPairCodeInternal(sock, cleanNumber);
}

async function backupAllCredentials() {
  try {
    const sessions = await SessionModel.find({}).lean();
    for (const session of sessions) {
      await backupSession(session.sessionId, session.phoneNumber);
    }
  } catch (error) {}
}

async function startSavedSocket() {
  return null;
}

function getActiveSocket() {
  return global.activeBotSockets.values().next().value || null;
}

module.exports = {
  restoreCredentials,
  backupAllCredentials,
  requestPairCode,
  requestPairingCode: requestPairCode,
  startSavedSocket,
  onSocketCreated: (callback) => {
    onSocketCreatedCallback = callback;
  },
  getActiveSocket
};
