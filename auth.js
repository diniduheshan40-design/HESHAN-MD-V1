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

const logger = pino({
  level: "silent"
});

const BASE_SESSION_DIR = path.join(
  __dirname,
  "sessions"
);

/* =========================================================
   GLOBAL STATE
========================================================= */

if (!global.activeBotSockets) {
  global.activeBotSockets = new Set();
}

if (!global.allActiveSessions) {
  global.allActiveSessions = new Map();
}

/*
 * Per-session runtime information.
 *
 * Every WhatsApp account gets its own object.
 * Nothing here is shared between accounts.
 */
const runtime = new Map();

let onSocketCreatedCallback = null;

/* =========================================================
   MONGODB MODEL
========================================================= */

const SessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true
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
  mongoose.model(
    "DarkDinuSession",
    SessionSchema
  );

/* =========================================================
   HELPERS
========================================================= */

function ensureBaseDir() {
  if (!fs.existsSync(BASE_SESSION_DIR)) {
    fs.mkdirSync(
      BASE_SESSION_DIR,
      {
        recursive: true
      }
    );
  }
}

function getSessionFolder(sessionId) {
  ensureBaseDir();

  const folder = path.join(
    BASE_SESSION_DIR,
    sessionId
  );

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(
      folder,
      {
        recursive: true
      }
    );
  }

  return folder;
}

function normalizePhoneNumber(number) {
  let phone = String(number || "")
    .replace(/[^0-9]/g, "");

  /*
   * Sri Lanka:
   * 0771234567
   * ->
   * 94771234567
   */
  if (phone.startsWith("0")) {
    phone =
      "94" +
      phone.substring(1);
  }

  return phone;
}

function getSessionId(phoneNumber) {
  return `session_${phoneNumber}`;
}

function getRuntime(sessionId) {
  if (!runtime.has(sessionId)) {
    runtime.set(
      sessionId,
      {
        socket: null,
        connecting: false,
        pairing: false,
        reconnectTimer: null,
        reconnectAttempts: 0,
        stopped: false
      }
    );
  }

  return runtime.get(sessionId);
}

function clearReconnectTimer(sessionId) {
  const r = getRuntime(sessionId);

  if (r.reconnectTimer) {
    clearTimeout(
      r.reconnectTimer
    );

    r.reconnectTimer = null;
  }
}

/* =========================================================
   MONGODB BACKUP
========================================================= */

async function backupSession(
  sessionId,
  phoneNumber
) {
  try {
    const folder =
      getSessionFolder(sessionId);

    const files = {};

    const fileList =
      fs.readdirSync(folder);

    for (const file of fileList) {
      const filePath =
        path.join(
          folder,
          file
        );

      try {
        if (
          fs.existsSync(filePath) &&
          fs.statSync(filePath).isFile()
        ) {
          const safeName =
            file.replace(
              /\./g,
              "___dot___"
            );

          files[safeName] =
            fs.readFileSync(
              filePath,
              "utf8"
            );
        }
      } catch {}
    }

    if (
      Object.keys(files).length === 0
    ) {
      return;
    }

    await SessionModel.findOneAndUpdate(
      {
        sessionId
      },
      {
        $set: {
          sessionId,
          phoneNumber,
          files
        }
      },
      {
        upsert: true
      }
    );

  } catch (error) {
    console.error(
      `❌ Mongo backup ${sessionId}:`,
      error.message
    );
  }
}

/* =========================================================
   RESTORE SESSION FILES
========================================================= */

async function restoreSessionFiles(
  session
) {
  const {
    sessionId,
    files
  } = session;

  const folder =
    getSessionFolder(
      sessionId
    );

  for (
    const [key, content]
    of Object.entries(files || {})
  ) {
    try {
      const fileName =
        key.replace(
          /___dot___/g,
          "."
        );

      /*
       * Prevent accidental path traversal.
       */
      const safeFileName =
        path.basename(
          fileName
        );

      const filePath =
        path.join(
          folder,
          safeFileName
        );

      fs.writeFileSync(
        filePath,
        content,
        "utf8"
      );
    } catch (error) {
      console.error(
        `❌ Restore file error ${sessionId}:`,
        error.message
      );
    }
  }
}

/* =========================================================
   REMOVE SESSION COMPLETELY
   ONLY WHEN LOGGED OUT / BAD SESSION
========================================================= */

async function removeSession(
  sessionId,
  removeMongo = true
) {
  const r =
    getRuntime(sessionId);

  r.stopped = true;

  clearReconnectTimer(
    sessionId
  );

  if (r.socket) {
    try {
      global.activeBotSockets.delete(
        r.socket
      );
    } catch {}

    try {
      r.socket.end(
        new Error(
          "Session removed"
        )
      );
    } catch {}
  }

  global.allActiveSessions.delete(
    sessionId
  );

  r.socket = null;

  if (removeMongo) {
    await SessionModel.deleteOne({
      sessionId
    }).catch(() => {});
  }

  const folder =
    path.join(
      BASE_SESSION_DIR,
      sessionId
    );

  try {
    fs.rmSync(
      folder,
      {
        recursive: true,
        force: true
      }
    );
  } catch {}
}

/* =========================================================
   RECONNECT WITH BACKOFF
========================================================= */

function scheduleReconnect(
  sessionId,
  phoneNumber
) {
  const r =
    getRuntime(sessionId);

  if (r.stopped) {
    return;
  }

  /*
   * Never create two reconnect timers
   * for the same account.
   */
  if (r.reconnectTimer) {
    return;
  }

  r.reconnectAttempts++;

  /*
   * 5s, 10s, 20s, 30s...
   * Maximum 60 seconds.
   */
  const wait =
    Math.min(
      60000,
      5000 *
        Math.pow(
          2,
          Math.min(
            r.reconnectAttempts - 1,
            3
          )
        )
    );

  console.log(
    `🔄 [RECONNECT] ${phoneNumber} in ${Math.round(wait / 1000)}s`
  );

  r.reconnectTimer =
    setTimeout(
      async () => {
        r.reconnectTimer =
          null;

        if (r.stopped) {
          return;
        }

        if (
          global.allActiveSessions.has(
            sessionId
          )
        ) {
          return;
        }

        try {
          await createMultiSocket(
            sessionId,
            phoneNumber,
            false
          );
        } catch (error) {
          console.error(
            `❌ Reconnect failed ${phoneNumber}:`,
            error.message
          );

          scheduleReconnect(
            sessionId,
            phoneNumber
          );
        }
      },
      wait
    );
}

/* =========================================================
   CREATE SOCKET
========================================================= */

async function createMultiSocket(
  sessionId,
  phoneNumber,
  isPairing = false
) {
  const r =
    getRuntime(sessionId);

  /*
   * Don't create duplicate sockets.
   */
  if (
    r.socket &&
    global.allActiveSessions.get(
      sessionId
    ) === r.socket
  ) {
    return r.socket;
  }

  r.stopped = false;
  r.connecting = true;

  const folder =
    getSessionFolder(
      sessionId
    );

  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      folder
    );

  const {
    version
  } =
    await fetchLatestBaileysVersion();

  console.log(
    `🔧 [SOCKET] ${phoneNumber}`
  );

  const sock =
    makeWASocket({
      version,

      logger,

      auth: {
        creds: state.creds,

        keys:
          makeCacheableSignalKeyStore(
            state.keys,
            logger
          )
      },

      /*
       * Keep this browser stable.
       */
      browser:
        Browsers.ubuntu(
          "Chrome"
        ),

      printQRInTerminal:
        false,

      syncFullHistory:
        false,

      markOnlineOnConnect:
        false,

      connectTimeoutMs:
        60000,

      defaultQueryTimeoutMs:
        60000,

      keepAliveIntervalMs:
        15000,

      emitOwnEvents:
        true,

      generateHighQualityLinkPreview:
        false
    });

  sock.sessionId =
    sessionId;

  sock.phoneNumber =
    phoneNumber;

  r.socket =
    sock;

  /*
   * Important:
   * register the socket immediately.
   */
  global.allActiveSessions.set(
    sessionId,
    sock
  );

  /* =======================================================
     CREDS UPDATE
  ======================================================= */

  sock.ev.on(
    "creds.update",
    async () => {
      try {
        await saveCreds();

        /*
         * Backup asynchronously.
         * Don't block Baileys.
         */
        backupSession(
          sessionId,
          phoneNumber
        ).catch(() => {});
      } catch (error) {
        console.error(
          `❌ Creds save ${phoneNumber}:`,
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
         OPEN
      ================================================ */

      if (
        connection === "open"
      ) {
        r.connecting =
          false;

        r.pairing =
          false;

        r.reconnectAttempts =
          0;

        clearReconnectTimer(
          sessionId
        );

        global.activeBotSockets.add(
          sock
        );

        global.allActiveSessions.set(
          sessionId,
          sock
        );

        console.log(
          "\x1b[32m%s\x1b[0m",
          `🟢 [ONLINE] ${phoneNumber}`
        );

        backupSession(
          sessionId,
          phoneNumber
        ).catch(() => {});

        return;
      }

      /* ================================================
         CLOSE
      ================================================ */

      if (
        connection === "close"
      ) {
        r.connecting =
          false;

        r.pairing =
          false;

        global.activeBotSockets.delete(
          sock
        );

        /*
         * Only delete map entry if this
         * socket is still the active one.
         */
        if (
          global.allActiveSessions.get(
            sessionId
          ) === sock
        ) {
          global.allActiveSessions.delete(
            sessionId
          );
        }

        if (
          r.socket === sock
        ) {
          r.socket =
            null;
        }

        const statusCode =
          lastDisconnect
            ?.error
            ?.output
            ?.statusCode;

        console.log(
          `⚠️ [CLOSED] ${phoneNumber} | ${statusCode}`
        );

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

          await removeSession(
            sessionId,
            true
          );

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
            `⚠️ [BAD SESSION] ${phoneNumber}`
          );

          /*
           * Bad session means this auth state
           * cannot be reused.
           */
          await removeSession(
            sessionId,
            true
          );

          return;
        }

        /*
         * All other disconnect reasons:
         * KEEP SESSION FILES.
         *
         * This is important.
         */
        scheduleReconnect(
          sessionId,
          phoneNumber
        );
      }
    }
  );

  /* =======================================================
     SOCKET CALLBACK
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
   RESTORE ALL SAVED SESSIONS
========================================================= */

async function restoreCredentials() {
  ensureBaseDir();

  try {
    const sessions =
      await SessionModel
        .find({})
        .lean();

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
      `⚡ [SESSIONS] Found ${sessions.length} saved session(s).`
    );

    /*
     * Start sessions gradually instead of
     * creating 100 sockets at exactly the
     * same millisecond.
     */
    for (
      const session of sessions
    ) {
      try {
        await restoreSessionFiles(
          session
        );

        const {
          sessionId,
          phoneNumber
        } = session;

        const r =
          getRuntime(
            sessionId
          );

        r.stopped =
          false;

        /*
         * If already running, skip it.
         */
        if (
          global.allActiveSessions.has(
            sessionId
          )
        ) {
          continue;
        }

        createMultiSocket(
          sessionId,
          phoneNumber,
          false
        ).catch(
          (error) => {
            console.error(
              `❌ Restore ${phoneNumber}:`,
              error.message
            );

            scheduleReconnect(
              sessionId,
              phoneNumber
            );
          }
        );

        /*
         * Small stagger between accounts.
         */
        await delay(1000);
      } catch (error) {
        console.error(
          "❌ Session restore item:",
          error.message
        );
      }
    }

    return true;
  } catch (error) {
    console.error(
      "❌ Restore error:",
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
  const cleanNumber =
    normalizePhoneNumber(
      phoneNumber
    );

  if (
    !cleanNumber ||
    cleanNumber.length < 10
  ) {
    throw new Error(
      "Invalid phone number."
    );
  }

  const sessionId =
    getSessionId(
      cleanNumber
    );

  const r =
    getRuntime(
      sessionId
    );

  /*
   * Don't allow two pairing requests
   * for the SAME number simultaneously.
   *
   * Other numbers are completely independent.
   */
  if (r.pairing) {
    throw new Error(
      "Pairing is already in progress for this number."
    );
  }

  r.pairing =
    true;

  r.stopped =
    true;

  clearReconnectTimer(
    sessionId
  );

  /* =======================================================
     CLOSE ONLY SAME NUMBER SOCKET
  ======================================================= */

  const oldSocket =
    global.allActiveSessions.get(
      sessionId
    );

  if (oldSocket) {
    console.log(
      `♻️ [PAIR] Closing old socket ${cleanNumber}`
    );

    global.allActiveSessions.delete(
      sessionId
    );

    global.activeBotSockets.delete(
      oldSocket
    );

    try {
      oldSocket.end(
        new Error(
          "New pairing requested"
        )
      );
    } catch {}
  }

  if (
    r.socket &&
    r.socket !== oldSocket
  ) {
    try {
      r.socket.end(
        new Error(
          "New pairing requested"
        )
      );
    } catch {}
  }

  r.socket =
    null;

  /*
   * IMPORTANT:
   *
   * DO NOT DELETE THE SESSION FOLDER HERE.
   *
   * This prevents accidental destruction
   * of the authentication state.
   *
   * If WhatsApp says the session is bad/logged
   * out, connection.update handles cleanup.
   */

  r.stopped =
    false;

  console.log(
    `📱 [PAIRING] ${cleanNumber}`
  );

  let sock;

  try {
    sock =
      await createMultiSocket(
        sessionId,
        cleanNumber,
        true
      );
  } catch (error) {
    r.pairing =
      false;

    throw error;
  }

  /*
   * Wait for socket initialization.
   */
  await delay(1500);

  try {
    console.log(
      `🔐 [PAIRING CODE] Requesting ${cleanNumber}`
    );

    const code =
      await sock.requestPairingCode(
        cleanNumber
      );

    if (!code) {
      throw new Error(
        "WhatsApp returned an empty pairing code."
      );
    }

    const raw =
      String(code);

    const formatted =
      raw.length === 8
        ? `${raw.slice(
            0,
            4
          )}-${raw.slice(4)}`
        : raw;

    console.log(
      `✅ [PAIRING CODE] ${cleanNumber}: ${formatted}`
    );

    r.pairing =
      false;

    return {
      code: formatted,
      socket: sock
    };
  } catch (error) {
    r.pairing =
      false;

    console.error(
      `❌ [PAIRING ERROR] ${cleanNumber}:`,
      error.message
    );

    /*
     * Don't delete Mongo/session data here.
     * A temporary pairing failure should NOT
     * destroy the account's saved auth.
     */
    try {
      sock.end(
        new Error(
          "Pairing request failed"
        )
      );
    } catch {}

    if (
      global.allActiveSessions.get(
        sessionId
      ) === sock
    ) {
      global.allActiveSessions.delete(
        sessionId
      );
    }

    global.activeBotSockets.delete(
      sock
    );

    if (
      r.socket === sock
    ) {
      r.socket =
        null;
    }

    throw new Error(
      `Pairing code failed: ${error.message}`
    );
  }
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
      await SessionModel
        .find({})
        .lean();

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
  for (
    const socket
    of global.activeBotSockets
  ) {
    return socket;
  }

  return null;
}

/* =========================================================
   EXPORT
========================================================= */

module.exports = {
  restoreCredentials,

  backupAllCredentials,

  requestPairCode,

  startSavedSocket,

  onSocketCreated:
    (callback) => {
      onSocketCreatedCallback =
        callback;
    },

  getActiveSocket
};
