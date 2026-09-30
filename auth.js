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

/* =========================================================
   SESSION DIRECTORY
========================================================= */

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
    const data = await SessionModel.findOne({
      sessionId: "dark_dinu_session"
    }).lean();

    if (
      !data ||
      !data.files ||
      Object.keys(data.files).length === 0
    ) {
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

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, content, "utf8");
      count++;
    }

    console.log(
      `✅ [SESSION] Restored ${count} session files from MongoDB.`
    );

    return true;
  } catch (error) {
    console.error(
      "❌ MongoDB restore error:",
      error.message
    );

    return false;
  }
}

/* =========================================================
   BACKUP ALL CREDENTIALS TO MONGODB
========================================================= */

let backupTimeout = null;

async function backupAllCredentials() {
  if (backupTimeout) {
    clearTimeout(backupTimeout);
  }

  backupTimeout = setTimeout(async () => {
    try {
      ensureSessionDir();

      const files = {};
      const allFiles = fs.readdirSync(sessionDir);

      for (const fileName of allFiles) {
        const filePath = path.join(sessionDir, fileName);

        if (
          fs.existsSync(filePath) &&
          fs.statSync(filePath).isFile()
        ) {
          const safeKey = fileName.replace(
            /\./g,
            "___dot___"
          );

          files[safeKey] = fs.readFileSync(
            filePath,
            "utf8"
          );
        }
      }

      if (Object.keys(files).length === 0) {
        return;
      }

      await SessionModel.findOneAndUpdate(
        { sessionId: "dark_dinu_session" },
        { $set: { files } },
        {
          upsert: true,
          new: true
        }
      );

      console.log(
        "⚡ [SESSION] Synced with MongoDB Atlas!"
      );
    } catch (err) {
      console.error(
        "❌ Backup error:",
        err.message
      );
    }
  }, 1000);
}

/* =========================================================
   CREATE SOCKET ENGINE
========================================================= */

async function createSocket(isPairing = false) {
  ensureSessionDir();

  const { state, saveCreds } =
    await useMultiFileAuthState(sessionDir);

  const { version } =
    await fetchLatestBaileysVersion();

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
      keys: makeCacheableSignalKeyStore(
        state.keys,
        logger
      )
    },

    browser: Browsers.ubuntu("Chrome"),

    printQRInTerminal: false,

    syncFullHistory: false,

    markOnlineOnConnect: false,

    connectTimeoutMs: 60000,

    keepAliveIntervalMs: 15000,

    defaultQueryTimeoutMs: 0
  });

  activeSocket = sock;

  /* =======================================================
     SAVE CREDENTIALS
  ======================================================= */

  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
      await backupAllCredentials();
    } catch (e) {}
  });

  /* =======================================================
     CONNECTION EVENTS
  ======================================================= */

  sock.ev.on(
    "connection.update",
    async (update) => {
      const {
        connection,
        lastDisconnect
      } = update;

      /* ---------------------------------------------------
         CONNECTED
      --------------------------------------------------- */

      if (connection === "open") {
        isReconnecting = false;

        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }

        console.log(
          "\x1b[32m%s\x1b[0m",
          "🟢 [SOCKET] WhatsApp Stream Stabilized & Paired!"
        );

        await backupAllCredentials();
      }

      /* ---------------------------------------------------
         CLOSED
      --------------------------------------------------- */

      if (connection === "close") {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        console.log(
          `⚠️ Connection closed. Status Code: ${statusCode}`
        );

        /* LOGGED OUT */

        if (
          statusCode === DisconnectReason.loggedOut
        ) {
          console.log(
            "🚪 Logged out from WhatsApp. Clearing session..."
          );

          await SessionModel.deleteOne({
            sessionId: "dark_dinu_session"
          }).catch(() => {});

          deleteSessionDir();

          activeSocket = null;

          return;
        }

        /* -------------------------------------------------
           PAIRING SOCKET
           Don't automatically restart it here.
        ------------------------------------------------- */

        if (isPairing) {
          console.log(
            "⚠️ [PAIRING] Pairing socket closed."
          );
          return;
        }

        /* -------------------------------------------------
           NORMAL RECONNECT
        ------------------------------------------------- */

        if (!isReconnecting) {
          isReconnecting = true;

          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
          }

          const delayMs =
            statusCode ===
            DisconnectReason.restartRequired
              ? 2000
              : 5000;

          console.log(
            `🔄 Reconnecting automatically in ${
              delayMs / 1000
            }s...`
          );

          reconnectTimer = setTimeout(
            async () => {
              try {
                await createSocket(false);
              } catch (e) {
                console.error(
                  "Auto-reconnect error:",
                  e.message
                );
              } finally {
                isReconnecting = false;
              }
            },
            delayMs
          );
        }
      }
    }
  );

  if (onSocketCreatedCallback) {
    onSocketCreatedCallback(sock);
  }

  return sock;
}

/* =========================================================
   REQUEST PAIR CODE
   FIXED PAIRING HANDSHAKE
========================================================= */

async function requestPairCode(phoneNumber) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  isReconnecting = true;

  /* -------------------------------------------------------
     IMPORTANT:
     Remove old local credentials before new pairing.
  ------------------------------------------------------- */

  deleteSessionDir();
  ensureSessionDir();

  const cleanNumber = String(phoneNumber)
    .replace(/[^0-9]/g, "");

  if (!cleanNumber) {
    isReconnecting = false;
    throw new Error("Invalid phone number.");
  }

  console.log(
    `📱 [PAIRING] Starting pairing for +${cleanNumber}`
  );

  const sock = await createSocket(true);

  return new Promise((resolve, reject) => {
    let finished = false;
    let pairingStarted = false;

    /* -------------------------------------------------------
       Cleanup
    ------------------------------------------------------- */

    const cleanup = () => {
      try {
        sock.ev.off(
          "connection.update",
          connectionHandler
        );
      } catch (e) {}
    };

    /* -------------------------------------------------------
       FAIL
    ------------------------------------------------------- */

    const fail = (error) => {
      if (finished) return;

      finished = true;

      cleanup();

      isReconnecting = false;

      reject(error);
    };

    /* -------------------------------------------------------
       SUCCESS
    ------------------------------------------------------- */

    const success = (code) => {
      if (finished) return;

      finished = true;

      cleanup();

      isReconnecting = false;

      console.log(
        `✅ [PAIRING] Pair code generated: ${code}`
      );

      resolve({
        code,
        socket: sock
      });
    };

    /* -------------------------------------------------------
       TIMEOUT
    ------------------------------------------------------- */

    const timeout = setTimeout(() => {
      fail(
        new Error(
          "Pairing code timed out. WhatsApp server did not respond."
        )
      );
    }, 60000);

    /* -------------------------------------------------------
       CONNECTION UPDATE HANDLER
    ------------------------------------------------------- */

    const connectionHandler = async (update) => {
      if (finished) return;

      const {
        connection,
        lastDisconnect
      } = update;

      /* -----------------------------------------------
         If socket closes before pairing
      ----------------------------------------------- */

      if (connection === "close") {
        clearTimeout(timeout);

        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        fail(
          new Error(
            `WhatsApp pairing connection closed${
              statusCode
                ? ` (${statusCode})`
                : ""
            }. Please try again.`
          )
        );

        return;
      }

      /* -----------------------------------------------
         REQUEST CODE

         The important fix is:
         Do NOT wait for QR.
         Do NOT wait for connection === open.

         For pairing-code authentication, requestPairingCode
         should be called once the socket has initialized.
      ----------------------------------------------- */

      if (
        !pairingStarted &&
        !sock.authState?.creds?.registered
      ) {
        pairingStarted = true;

        try {
          console.log(
            "⏳ [PAIRING] Waiting briefly for WhatsApp handshake..."
          );

          await delay(1500);

          if (finished) return;

          console.log(
            "📲 [PAIRING] Requesting WhatsApp pairing code..."
          );

          const code =
            await sock.requestPairingCode(
              cleanNumber
            );

          clearTimeout(timeout);

          success(code);
        } catch (err) {
          clearTimeout(timeout);

          console.error(
            "❌ [PAIRING] Code request error:",
            err.message
          );

          fail(err);
        }
      }
    };

    sock.ev.on(
      "connection.update",
      connectionHandler
    );

    /* -------------------------------------------------------
       FALLBACK
       
       Sometimes Baileys does not emit the exact update we
       expect immediately. Give the socket a short startup
       window and request the code anyway.
    ------------------------------------------------------- */

    setTimeout(async () => {
      if (finished || pairingStarted) return;

      if (
        sock.authState?.creds?.registered
      ) {
        return;
      }

      pairingStarted = true;

      try {
        console.log(
          "📲 [PAIRING] Fallback: Requesting pairing code..."
        );

        const code =
          await sock.requestPairingCode(
            cleanNumber
          );

        clearTimeout(timeout);

        success(code);
      } catch (err) {
        clearTimeout(timeout);

        console.error(
          "❌ [PAIRING] Fallback error:",
          err.message
        );

        fail(err);
      }
    }, 3500);
  });
}

/* =========================================================
   START SAVED SOCKET
========================================================= */

async function startSavedSocket() {
  ensureSessionDir();

  const credsFile = path.join(
    sessionDir,
    "creds.json"
  );

  if (!fs.existsSync(credsFile)) {
    return null;
  }

  return await createSocket(false);
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  restoreCredentials,
  backupAllCredentials,
  requestPairCode,
  startSavedSocket,

  onSocketCreated: (cb) => {
    onSocketCreatedCallback = cb;
  },

  getActiveSocket: () => activeSocket
};

 
