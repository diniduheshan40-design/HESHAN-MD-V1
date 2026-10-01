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

const logger = pino({ level: "silent" });

const baseSessionDir = path.join(__dirname, "sessions");

/* =========================================================
   GLOBAL SOCKET STORAGE
========================================================= */

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
  try {
    if (!fs.existsSync(baseSessionDir)) {
      fs.mkdirSync(baseSessionDir, {
        recursive: true
      });
    }
  } catch (error) {
    console.error(
      "❌ [DIRECTORY ERROR]:",
      error.message
    );
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
  let number = String(phoneNumber || "")
    .replace(/[^0-9]/g, "");

  // 0771234567 -> 94771234567
  if (number.startsWith("0")) {
    number = "94" + number.substring(1);
  }

  // 94771234567
  if (
    !number.startsWith("94") ||
    number.length !== 11
  ) {
    throw new Error(
      "Invalid Sri Lankan phone number. Example: 0771234567"
    );
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
   BACKUP SESSION TO MONGODB
========================================================= */

async function backupSession(
  sessionId,
  phoneNumber
) {
  try {
    const sessionDir = path.join(
      baseSessionDir,
      sessionId
    );

    if (!fs.existsSync(sessionDir)) {
      return;
    }

    const files = {};

    const list = fs.readdirSync(
      sessionDir
    );

    for (const file of list) {
      try {
        if (!isSafeSessionFile(file)) {
          continue;
        }

        const filePath = path.join(
          sessionDir,
          file
        );

        if (!fs.existsSync(filePath)) {
          continue;
        }

        const stat = fs.statSync(filePath);

        if (!stat.isFile()) {
          continue;
        }

        /*
         * Baileys multi-file auth files are JSON/text files.
         * Replace dots so Mongo object keys stay safe.
         */
        const safeName = file.replace(
          /\./g,
          "___dot___"
        );

        files[safeName] =
          fs.readFileSync(
            filePath,
            "utf8"
          );
      } catch (fileError) {
        console.error(
          `⚠️ [BACKUP FILE ERROR] ${file}:`,
          fileError.message
        );
      }
    }

    if (
      !Object.keys(files).length
    ) {
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
        new: true,
        setDefaultsOnInsert: true
      }
    );

    console.log(
      `💾 [MONGO BACKUP] +${phoneNumber} Synced!`
    );
  } catch (error) {
    console.error(
      `❌ [MONGO BACKUP ERROR] ${sessionId}:`,
      error.message
    );
  }
}

/* =========================================================
   REMOVE SESSION
========================================================= */

async function removeSession(
  sessionId,
  sessionDir
) {
  try {
    await SessionModel.deleteOne({
      sessionId
    });
  } catch (error) {
    console.error(
      "⚠️ [MONGO DELETE ERROR]:",
      error.message
    );
  }

  try {
    if (
      sessionDir &&
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
      "⚠️ [SESSION DELETE ERROR]:",
      error.message
    );
  }
}

/* =========================================================
   CREATE BAILEYS SOCKET
========================================================= */

async function createMultiSocket(
  sessionId,
  phoneNumber
) {
  const sessionDir =
    getSessionFolder(sessionId);

  const {
    state,
    saveCreds
  } = await useMultiFileAuthState(
    sessionDir
  );

  console.log(
    `🔧 [SOCKET] Initializing Baileys for +${phoneNumber}`
  );

  /* =======================================================
     GET LATEST WHATSAPP WEB VERSION
  ======================================================= */

  let version;

  try {
    const latest =
      await fetchLatestBaileysVersion();

    if (latest?.version) {
      version = latest.version;

      console.log(
        `🌐 [WA VERSION] ${version.join(".")}`
      );
    }
  } catch (error) {
    console.log(
      "⚠️ [WA VERSION] Could not fetch latest version. Using package default."
    );
  }

  /* =======================================================
     SOCKET CONFIG
  ======================================================= */

  const socketConfig = {
    logger,

    auth: {
      creds: state.creds,

      keys: makeCacheableSignalKeyStore(
        state.keys,
        logger
      )
    },

    /*
     * Chrome-like browser identity.
     * Ubuntu Chrome tends to be more reliable
     * for cloud/Render environments.
     */
    browser: Browsers.ubuntu("Chrome"),

    printQRInTerminal: false,

    syncFullHistory: false,

    markOnlineOnConnect: false,

    connectTimeoutMs: 60000,

    defaultQueryTimeoutMs: 60000,

    keepAliveIntervalMs: 25000,

    emitOwnEvents: true,

    generateHighQualityLinkPreview: false,

    retryRequestDelayMs: 500,

    maxMsgRetryCount: 5
  };

  if (version) {
    socketConfig.version = version;
  }

  const sock =
    makeWASocket(socketConfig);

  /* =======================================================
     SOCKET INFORMATION
  ======================================================= */

  sock.sessionId = sessionId;

  sock.phoneNumber = phoneNumber;

  /*
   * Store auth state on our own socket property.
   * DO NOT use sock.authState.
   */
  sock.darkDinuAuthState = state;

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
        /*
         * Always save local auth files first.
         */
        await saveCreds();

        /*
         * Then backup them to MongoDB.
         */
        await backupSession(
          sessionId,
          phoneNumber
        );
      } catch (error) {
        console.error(
          `❌ [CREDS SAVE ERROR] +${phoneNumber}:`,
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
      try {
        const {
          connection,
          lastDisconnect,
          isNewLogin,
          qr
        } = update;

        /* =================================================
           NEW LOGIN
        ================================================= */

        if (isNewLogin) {
          console.log(
            `🎉 [LINK ACCEPTED] +${phoneNumber} Logged in!`
          );
        }

        /* =================================================
           QR EVENT
        ================================================= */

        if (qr) {
          console.log(
            `📡 [PAIRING READY] +${phoneNumber} WhatsApp socket is ready.`
          );
        }

        /* =================================================
           CONNECTION OPEN
        ================================================= */

        if (
          connection === "open"
        ) {
          console.log(
            "\x1b[32m%s\x1b[0m",
            `🟢 [CONNECTED] +${phoneNumber} → DARK DINU ONLINE & ACTIVE`
          );

          global.activeBotSockets.add(
            sock
          );

          global.allActiveSessions.set(
            sessionId,
            sock
          );

          /*
           * Save final credentials immediately.
           */
          try {
            await saveCreds();
          } catch (e) {}

          /*
           * Backup to MongoDB.
           */
          await backupSession(
            sessionId,
            phoneNumber
          );

          return;
        }

        /* =================================================
           CONNECTION CLOSE
        ================================================= */

        if (
          connection === "close"
        ) {
          const statusCode =
            getDisconnectCode(
              lastDisconnect
            );

          console.log(
            `⚠️ [CLOSED] +${phoneNumber} | Status Code: ${statusCode}`
          );

          global.activeBotSockets.delete(
            sock
          );

          /* ===============================================
             LOGGED OUT - 401
          =============================================== */

          if (
            statusCode ===
            DisconnectReason.loggedOut
          ) {
            console.log(
              `🚪 [LOGGED OUT] +${phoneNumber}`
            );

            global.allActiveSessions.delete(
              sessionId
            );

            await removeSession(
              sessionId,
              sessionDir
            );

            return;
          }

          /* ===============================================
             BAD SESSION
          =============================================== */

          if (
            statusCode ===
            DisconnectReason.badSession
          ) {
            console.log(
              `🗑️ [BAD SESSION] Removing corrupted session +${phoneNumber}`
            );

            global.allActiveSessions.delete(
              sessionId
            );

            await removeSession(
              sessionId,
              sessionDir
            );

            return;
          }

          /* ===============================================
             RESTART REQUIRED - 515

             IMPORTANT:
             WhatsApp commonly asks Baileys to restart
             after successful pairing.
          =============================================== */

          if (
            statusCode ===
            DisconnectReason.restartRequired
          ) {
            console.log(
              `⚡ [515 RESTART] WhatsApp requested socket restart for +${phoneNumber}`
            );

            /*
             * Save credentials before restart.
             */
            try {
              await saveCreds();
            } catch (e) {}

            try {
              await backupSession(
                sessionId,
                phoneNumber
              );
            } catch (e) {}

            /*
             * Remove old socket from active map.
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

            /*
             * Give WhatsApp/Baileys a moment
             * before opening the saved session.
             */
            setTimeout(
              async () => {
                try {
                  console.log(
                    `🔄 [515 RECONNECT] Restoring saved session +${phoneNumber}...`
                  );

                  await createMultiSocket(
                    sessionId,
                    phoneNumber
                  );
                } catch (error) {
                  console.error(
                    `❌ [515 RECONNECT ERROR] +${phoneNumber}:`,
                    error.message
                  );
                }
              },
              1500
            );

            return;
          }

          /* ===============================================
             OTHER CONNECTION ERRORS
          =============================================== */

          if (
            global.allActiveSessions.get(
              sessionId
            ) === sock
          ) {
            global.allActiveSessions.delete(
              sessionId
            );
          }

          /*
           * Wait before reconnect.
           */
          setTimeout(
            async () => {
              try {
                /*
                 * Check whether another socket has
                 * already replaced this socket.
                 */
                const currentSocket =
                  global.allActiveSessions.get(
                    sessionId
                  );

                if (
                  currentSocket &&
                  currentSocket !== sock
                ) {
                  return;
                }

                console.log(
                  `🔄 [AUTO RECONNECT] Restoring +${phoneNumber}...`
                );

                await createMultiSocket(
                  sessionId,
                  phoneNumber
                );
              } catch (error) {
                console.error(
                  `❌ [RECONNECT ERROR] +${phoneNumber}:`,
                  error.message
                );
              }
            },
            5000
          );
        }
      } catch (error) {
        console.error(
          `❌ [CONNECTION ERROR] +${phoneNumber}:`,
          error.message
        );
      }
    }
  );

  /* =======================================================
     SOCKET CREATED CALLBACK
  ======================================================= */

  if (
    onSocketCreatedCallback
  ) {
    try {
      onSocketCreatedCallback(
        sock
      );
    } catch (error) {
      console.error(
        "⚠️ [SOCKET CALLBACK ERROR]:",
        error.message
      );
    }
  }

  return sock;
}

/* =========================================================
   RESTORE ALL MONGO SESSIONS AT STARTUP
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
        "ℹ️ [SESSIONS] No saved sessions in MongoDB."
      );

      return false;
    }

    console.log(
      `⚡ [SESSIONS] Restoring ${sessions.length} saved session(s)...`
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

        if (
          !sessionId ||
          !phoneNumber
        ) {
          continue;
        }

        const sessionDir =
          getSessionFolder(
            sessionId
          );

        /*
         * Restore auth files from MongoDB.
         */
        for (
          const [
            key,
            content
          ] of Object.entries(
            files || {}
          )
        ) {
          try {
            const fileName =
              key.replace(
                /___dot___/g,
                "."
              );

            if (
              !isSafeSessionFile(
                fileName
              )
            ) {
              continue;
            }

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
          } catch (fileError) {
            console.error(
              `⚠️ [RESTORE FILE ERROR] +${phoneNumber}:`,
              fileError.message
            );
          }
        }

        console.log(
          `🔄 [STARTING SESSION]: +${phoneNumber}`
        );

        createMultiSocket(
          sessionId,
          phoneNumber
        ).catch(
          (error) => {
            console.error(
              `❌ [SESSION START ERROR] +${phoneNumber}:`,
              error.message
            );
          }
        );

        await delay(700);
      } catch (error) {
        console.error(
          "❌ [SESSION RESTORE ITEM ERROR]:",
          error.message
        );
      }
    }

    return true;
  } catch (error) {
    console.error(
      "❌ [MONGO RESTORE ERROR]:",
      error.message
    );

    return false;
  }
}

/* =========================================================
   REQUEST PAIRING CODE
========================================================= */

async function requestPairCodeInternal(
  sock,
  cleanNumber
) {
  /*
   * IMPORTANT:
   * The pairing code should only be requested
   * after the socket starts its connection process.
   */

  let requestStarted = false;

  return new Promise(
    (resolve, reject) => {
      let finished = false;

      let pairingTimer = null;

      let hardTimeout = null;

      const cleanup = () => {
        try {
          sock.ev.off(
            "connection.update",
            onUpdate
          );
        } catch (e) {}

        if (pairingTimer) {
          clearTimeout(
            pairingTimer
          );
        }

        if (hardTimeout) {
          clearTimeout(
            hardTimeout
          );
        }
      };

      const fail = (
        error
      ) => {
        if (finished) {
          return;
        }

        finished = true;

        cleanup();

        reject(error);
      };

      const generateCode =
        async () => {
          if (
            finished ||
            requestStarted
          ) {
            return;
          }

          /*
           * Never request another pairing code
           * after credentials became registered.
           */
          if (
            sock.darkDinuAuthState
              ?.creds
              ?.registered
          ) {
            return;
          }

          requestStarted = true;

          try {
            console.log(
              `🔐 [PAIRING] Requesting WhatsApp pairing code for +${cleanNumber}...`
            );

            const rawCode =
              await sock.requestPairingCode(
                cleanNumber
              );

            if (!rawCode) {
              throw new Error(
                "WhatsApp did not return a pairing code."
              );
            }

            const code =
              String(rawCode);

            const formattedCode =
              code.length === 8
                ? `${code.slice(
                    0,
                    4
                  )}-${code.slice(4)}`
                : code;

            if (finished) {
              return;
            }

            finished = true;

            cleanup();

            console.log(
              `✅ [PAIRING CODE READY] +${cleanNumber}: ${formattedCode}`
            );

            resolve({
              code: formattedCode,
              socket: sock
            });
          } catch (error) {
            requestStarted = false;

            console.error(
              `❌ [PAIRING CODE ERROR] +${cleanNumber}:`,
              error.message
            );

            fail(error);
          }
        };

      const onUpdate =
        async (update) => {
          try {
            const {
              connection,
              qr
            } = update;

            /*
             * Official Baileys pairing flow:
             * qr event means the socket has reached
             * the stage where pairing can be requested.
             */
            if (qr) {
              console.log(
                `📡 [PAIRING HANDSHAKE] +${cleanNumber} ready.`
              );

              await generateCode();

              return;
            }

            /*
             * Some Baileys versions/environments may
             * enter "connecting" without exposing the
             * QR event immediately.
             *
             * Give the socket a small delay, then request.
             */
            if (
              connection ===
              "connecting"
            ) {
              if (
                !pairingTimer &&
                !requestStarted
              ) {
                pairingTimer =
                  setTimeout(
                    async () => {
                      pairingTimer =
                        null;

                      await generateCode();
                    },
                    2500
                  );
              }
            }
          } catch (error) {
            fail(error);
          }
        };

      /*
       * Listen BEFORE waiting for the socket.
       */
      sock.ev.on(
        "connection.update",
        onUpdate
      );

      /*
       * Safety timeout.
       */
      hardTimeout =
        setTimeout(
          () => {
            fail(
              new Error(
                "Pairing code timeout. WhatsApp socket did not become ready. Please try again."
              )
            );
          },
          60000
        );
    }
  );
}

/* =========================================================
   REQUEST PAIRING CODE - PUBLIC
========================================================= */

async function requestPairCode(
  phoneNumber
) {
  const cleanNumber =
    normalizePhoneNumber(
      phoneNumber
    );

  const sessionId =
    `session_${cleanNumber}`;

  const sessionDir =
    getSessionFolder(
      sessionId
    );

  /* =======================================================
     CLOSE OLD SOCKET
  ======================================================= */

  const oldSocket =
    global.allActiveSessions.get(
      sessionId
    );

  if (oldSocket) {
    console.log(
      `♻️ [PAIRING] Closing previous connection +${cleanNumber}`
    );

    try {
      global.activeBotSockets.delete(
        oldSocket
      );
    } catch (e) {}

    try {
      if (
        oldSocket.ev &&
        typeof oldSocket.ev.removeAllListeners ===
          "function"
      ) {
        oldSocket.ev.removeAllListeners(
          "connection.update"
        );
      }
    } catch (e) {}

    try {
      oldSocket.end(
        undefined
      );
    } catch (e) {}

    global.allActiveSessions.delete(
      sessionId
    );

    /*
     * Give old socket time to close.
     */
    await delay(1200);
  }

  /* =======================================================
     DELETE OLD LOCAL SESSION
  ======================================================= */

  try {
    if (
      fs.existsSync(
        sessionDir
      )
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
      "⚠️ [SESSION CLEAN ERROR]:",
      error.message
    );
  }

  /* =======================================================
     CREATE FRESH SESSION DIRECTORY
  ======================================================= */

  ensureBaseDir();

  fs.mkdirSync(
    sessionDir,
    {
      recursive: true
    }
  );

  /* =======================================================
     DELETE OLD MONGO SESSION
  ======================================================= */

  try {
    await SessionModel.deleteOne(
      {
        sessionId
      }
    );
  } catch (error) {
    console.error(
      "⚠️ [MONGO OLD SESSION DELETE]:",
      error.message
    );
  }

  /* =======================================================
     CREATE NEW SOCKET
  ======================================================= */

  console.log(
    `📱 [PAIRING] Launching fresh Baileys client for +${cleanNumber}...`
  );

  const sock =
    await createMultiSocket(
      sessionId,
      cleanNumber
    );

  /* =======================================================
     GENERATE PAIRING CODE
  ======================================================= */

  return await requestPairCodeInternal(
    sock,
    cleanNumber
  );
}

/* =========================================================
   BACKUP ALL CREDENTIALS
========================================================= */

async function backupAllCredentials() {
  try {
    const sessions =
      await SessionModel
        .find({})
        .lean();

    for (
      const session of sessions
    ) {
      try {
        await backupSession(
          session.sessionId,
          session.phoneNumber
        );
      } catch (error) {
        console.error(
          `⚠️ [BACKUP ALL ERROR] ${session.sessionId}:`,
          error.message
        );
      }
    }
  } catch (error) {
    console.error(
      "❌ [BACKUP ALL ERROR]:",
      error.message
    );
  }
}

/* =========================================================
   START SAVED SOCKET
========================================================= */

async function startSavedSocket() {
  /*
   * Kept for compatibility with your index.js.
   * restoreCredentials() handles startup restoration.
   */
  return null;
}

/* =========================================================
   GET ACTIVE SOCKET
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

  /*
   * Keep old function name so your index.js
   * does not need to be changed.
   */
  requestPairingCode: requestPairCode,

  startSavedSocket,

  onSocketCreated: (
    callback
  ) => {
    onSocketCreatedCallback =
      callback;
  },

  getActiveSocket
};
