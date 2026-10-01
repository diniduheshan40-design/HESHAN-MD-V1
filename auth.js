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
  if (!fs.existsSync(baseSessionDir)) {
    fs.mkdirSync(baseSessionDir, {
      recursive: true
    });
  }
}

function getSessionFolder(sessionId) {
  ensureBaseDir();

  const folder = path.join(
    baseSessionDir,
    sessionId
  );

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, {
      recursive: true
    });
  }

  return folder;
}

/* =========================================================
   BACKUP SESSION TO MONGODB
========================================================= */

async function backupSession(sessionId, phoneNumber) {
  try {
    const sessionDir = path.join(
      baseSessionDir,
      sessionId
    );

    if (!fs.existsSync(sessionDir)) {
      return;
    }

    const files = {};

    const list = fs.readdirSync(sessionDir);

    for (const file of list) {
      const filePath = path.join(
        sessionDir,
        file
      );

      if (
        fs.existsSync(filePath) &&
        fs.statSync(filePath).isFile()
      ) {
        const safeName = file.replace(
          /\./g,
          "___dot___"
        );

        files[safeName] =
          fs.readFileSync(filePath, "utf8");
      }
    }

    if (!Object.keys(files).length) {
      return;
    }

    await SessionModel.findOneAndUpdate(
      {
        sessionId
      },
      {
        $set: {
          files,
          phoneNumber
        }
      },
      {
        upsert: true,
        new: true
      }
    );

    console.log(
      `💾 [MONGO BACKUP] ${phoneNumber}`
    );
  } catch (error) {
    console.error(
      `❌ [BACKUP ERROR] ${sessionId}:`,
      error.message
    );
  }
}

/* =========================================================
   CREATE SOCKET
========================================================= */

async function createMultiSocket(
  sessionId,
  phoneNumber,
  isPairing = false
) {
  const sessionDir =
    getSessionFolder(sessionId);

  const {
    state,
    saveCreds
  } = await useMultiFileAuthState(
    sessionDir
  );

  const {
    version
  } = await fetchLatestBaileysVersion();

  console.log(
    `🔧 [SOCKET] Creating socket for ${phoneNumber}`
  );

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

    browser: Browsers.ubuntu(
      "Chrome"
    ),

    printQRInTerminal: false,

    syncFullHistory: false,

    markOnlineOnConnect: false,

    connectTimeoutMs: 60000,

    defaultQueryTimeoutMs: 60000,

    keepAliveIntervalMs: 15000,

    emitOwnEvents: true,

    generateHighQualityLinkPreview: false,

    retryRequestDelayMs: 250,

    maxMsgRetryCount: 5
  });

  sock.sessionId = sessionId;
  sock.phoneNumber = phoneNumber;

  /* =======================================================
     SAVE CREDENTIALS
  ======================================================= */

  sock.ev.on(
    "creds.update",
    async () => {
      try {
        await saveCreds();

        await backupSession(
          sessionId,
          phoneNumber
        );
      } catch (error) {
        console.error(
          "❌ Creds save error:",
          error.message
        );
      }
    }
  );

  /* =======================================================
     CONNECTION UPDATE
  ======================================================= */

  sock.ev.on(
    "connection.update",
    async (update) => {
      const {
        connection,
        lastDisconnect
      } = update;

      /* ================================================
         CONNECTED
      ================================================ */

      if (connection === "open") {
        console.log(
          "\x1b[32m%s\x1b[0m",
          `🟢 [CONNECTED] ${phoneNumber} → DARK DINU ONLINE`
        );

        global.activeBotSockets.add(
          sock
        );

        global.allActiveSessions.set(
          sessionId,
          sock
        );

        await backupSession(
          sessionId,
          phoneNumber
        );
      }

      /* ================================================
         CLOSED
      ================================================ */

      if (connection === "close") {
        const statusCode =
          lastDisconnect?.error?.output
            ?.statusCode;

        console.log(
          `⚠️ [CLOSED] ${phoneNumber} | Status: ${statusCode}`
        );

        global.activeBotSockets.delete(
          sock
        );

        if (
          global.allActiveSessions.get(
            sessionId
          ) === sock
        ) {
          global.allActiveSessions.delete(
            sessionId
          );
        }

        /* ==============================================
           LOGGED OUT
        ============================================== */

        if (
          statusCode ===
          DisconnectReason.loggedOut
        ) {
          console.log(
            `🚪 [LOGGED OUT] ${phoneNumber}`
          );

          await SessionModel.deleteOne({
            sessionId
          }).catch(() => {});

          try {
            fs.rmSync(
              sessionDir,
              {
                recursive: true,
                force: true
              }
            );
          } catch {}

          return;
        }

        /* ==============================================
           BAD SESSION
        ============================================== */

        if (
          statusCode ===
          DisconnectReason.badSession
        ) {
          console.log(
            `🗑️ [BAD SESSION] ${phoneNumber}`
          );

          await SessionModel.deleteOne({
            sessionId
          }).catch(() => {});

          try {
            fs.rmSync(
              sessionDir,
              {
                recursive: true,
                force: true
              }
            );
          } catch {}

          return;
        }

        /* ==============================================
           RECONNECT
        ============================================== */

        setTimeout(
          async () => {
            try {
              if (
                global.allActiveSessions.has(
                  sessionId
                )
              ) {
                return;
              }

              console.log(
                `🔄 [RECONNECT] ${phoneNumber}`
              );

              await createMultiSocket(
                sessionId,
                phoneNumber,
                false
              );
            } catch (error) {
              console.error(
                `❌ Reconnect error ${phoneNumber}:`,
                error.message
              );
            }
          },
          5000
        );
      }
    }
  );

  /* =======================================================
     CALLBACK
  ======================================================= */

  if (
    onSocketCreatedCallback
  ) {
    try {
      onSocketCreatedCallback(
        sock
      );
    } catch {}
  }

  return sock;
}

/* =========================================================
   RESTORE ALL MONGO SESSIONS
========================================================= */

async function restoreCredentials() {
  ensureBaseDir();

  try {
    const sessions =
      await SessionModel.find({}).lean();

    if (
      !sessions ||
      sessions.length === 0
    ) {
      console.log(
        "ℹ️ [SESSIONS] No saved sessions."
      );

      return false;
    }

    console.log(
      `⚡ [SESSIONS] Restoring ${sessions.length} session(s)...`
    );

    for (
      const session of sessions
    ) {
      try {
        const {
          sessionId,
          phoneNumber,
          files
        } = session;

        const sessionDir =
          getSessionFolder(
            sessionId
          );

        for (
          const [
            key,
            content
          ] of Object.entries(
            files || {}
          )
        ) {
          const fileName =
            key.replace(
              /___dot___/g,
              "."
            );

          const filePath =
            path.join(
              sessionDir,
              fileName
            );

          fs.writeFileSync(
            filePath,
            content,
            "utf8"
          );
        }

        console.log(
          `🔄 [RESTORE] ${phoneNumber}`
        );

        createMultiSocket(
          sessionId,
          phoneNumber,
          false
        ).catch(
          (error) => {
            console.error(
              `❌ Restore socket error ${phoneNumber}:`,
              error.message
            );
          }
        );

        /*
         * Small delay prevents 100+ sessions
         * from hammering WhatsApp at exactly
         * the same moment.
         */
        await delay(300);
      } catch (error) {
        console.error(
          "❌ Session restore error:",
          error.message
        );
      }
    }

    return true;
  } catch (error) {
    console.error(
      "❌ Mongo restore error:",
      error.message
    );

    return false;
  }
}

/* =========================================================
   REQUEST PAIRING CODE
========================================================= */

async function requestPairCode(
  phoneNumber
) {
  let cleanNumber = String(
    phoneNumber
  ).replace(
    /[^0-9]/g,
    ""
  );

  /*
   * Sri Lankan number:
   * 0771234567
   * -> 94771234567
   */

  if (
    cleanNumber.startsWith("0")
  ) {
    cleanNumber =
      "94" +
      cleanNumber.substring(1);
  }

  if (
    cleanNumber.length < 10
  ) {
    throw new Error(
      "Invalid phone number."
    );
  }

  const sessionId =
    `session_${cleanNumber}`;

  const sessionDir =
    getSessionFolder(
      sessionId
    );

  /* =======================================================
     CLOSE ONLY SAME USER SOCKET
  ======================================================= */

  const oldSocket =
    global.allActiveSessions.get(
      sessionId
    );

  if (oldSocket) {
    console.log(
      `♻️ [OLD SOCKET] Closing ${cleanNumber}`
    );

    try {
      oldSocket.ev.removeAllListeners(
        "connection.update"
      );
    } catch {}

    try {
      oldSocket.end(
        new Error(
          "New pairing requested"
        )
      );
    } catch {}

    global.activeBotSockets.delete(
      oldSocket
    );

    global.allActiveSessions.delete(
      sessionId
    );

    /*
     * Give Baileys time to close
     * before creating another socket.
     */
    await delay(1000);
  }

  /*
   * IMPORTANT:
   *
   * For a NEW pairing, old auth files can
   * contain an incomplete/expired login.
   *
   * Remove only this user's local session.
   */

  try {
    if (
      fs.existsSync(sessionDir)
    ) {
      fs.rmSync(
        sessionDir,
        {
          recursive: true,
          force: true
        }
      );
    }
  } catch (error) {
    console.error(
      "⚠️ Session cleanup:",
      error.message
    );
  }

  fs.mkdirSync(
    sessionDir,
    {
      recursive: true
    }
  );

  /* =======================================================
     CREATE FRESH SOCKET
  ======================================================= */

  console.log(
    `📱 [PAIRING] Starting fresh socket for ${cleanNumber}`
  );

  const sock =
    await createMultiSocket(
      sessionId,
      cleanNumber,
      true
    );

  /*
   * DO NOT wait for "qr".
   *
   * requestPairingCode() itself starts
   * the pairing process.
   */

  console.log(
    `⏳ [PAIRING] Waiting for WhatsApp connection...`
  );

  let code;

  try {
    /*
     * Wait a little for socket initialization.
     */
    await delay(2500);

    /*
     * If socket is already closed,
     * don't continue.
     */
    if (
      sock.ws &&
      sock.ws.readyState === 3
    ) {
      throw new Error(
        "WhatsApp socket closed before pairing code request."
      );
    }

    console.log(
      `🔐 [PAIRING] Requesting code for ${cleanNumber}`
    );

    code =
      await sock.requestPairingCode(
        cleanNumber
      );
  } catch (error) {
    console.error(
      `❌ [PAIRING CODE ERROR] ${cleanNumber}:`,
      error.message
    );

    try {
      sock.end(
        new Error(
          "Pairing code request failed"
        )
      );
    } catch {}

    throw new Error(
      "Unable to generate pairing code. Please try again."
    );
  }

  if (!code) {
    throw new Error(
      "WhatsApp returned an empty pairing code."
    );
  }

  /*
   * Format:
   * ABCD-EFGH
   */

  const formattedCode =
    String(code).length === 8
      ? `${String(code).slice(
          0,
          4
        )}-${String(code).slice(4)}`
      : String(code);

  console.log(
    `✅ [PAIRING CODE] ${cleanNumber}: ${formattedCode}`
  );

  return {
    code: formattedCode,
    socket: sock
  };
}

/* =========================================================
   BACKWARD COMPATIBILITY
========================================================= */

async function startSavedSocket() {
  return null;
}

async function backupAllCredentials() {
  try {
    const sessions =
      await SessionModel.find({}).lean();

    for (
      const session of sessions
    ) {
      await backupSession(
        session.sessionId,
        session.phoneNumber
      );
    }
  } catch {}
}

/* =========================================================
   ACTIVE SOCKET
========================================================= */

function getActiveSocket() {
  return (
    global.activeBotSockets
      .values()
      .next()
      .value || null
  );
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  restoreCredentials,

  backupAllCredentials,

  requestPairCode,

  startSavedSocket,

  onSocketCreated: (
    callback
  ) => {
    onSocketCreatedCallback =
      callback;
  },

  getActiveSocket
};
