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
  try {
    if (!fs.existsSync(baseSessionDir)) {
      fs.mkdirSync(baseSessionDir, {
        recursive: true
      });
    }
  } catch (error) {
    console.error("❌ Base session directory error:", error.message);
  }
}

function getSessionFolder(sessionId) {
  ensureBaseDir();

  const folder = path.join(baseSessionDir, sessionId);

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, {
      recursive: true
    });
  }

  return folder;
}

/* =========================================================
   SAFE SESSION FILE CHECK
========================================================= */

function isSafeSessionFile(fileName) {
  if (!fileName) return false;

  if (
    fileName.includes("..") ||
    fileName.includes("/") ||
    fileName.includes("\\")
  ) {
    return false;
  }

  return true;
}

/* =========================================================
   BACKUP SESSION TO MONGODB
========================================================= */

async function backupSession(sessionId, phoneNumber) {
  try {
    const sessionDir = path.join(baseSessionDir, sessionId);

    if (!fs.existsSync(sessionDir)) {
      return;
    }

    const files = {};
    const list = fs.readdirSync(sessionDir);

    for (const file of list) {
      try {
        const filePath = path.join(sessionDir, file);

        if (!fs.existsSync(filePath)) {
          continue;
        }

        const stat = fs.statSync(filePath);

        if (!stat.isFile()) {
          continue;
        }

        /*
         * Baileys auth files are JSON/text files.
         * Keep filename safe for Mongo object keys.
         */
        const safeName = file.replace(/\./g, "___dot___");

        files[safeName] = fs.readFileSync(filePath, "utf8");
      } catch (fileError) {
        console.error(
          `⚠️ [BACKUP FILE ERROR] ${file}:`,
          fileError.message
        );
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
        new: true,
        setDefaultsOnInsert: true
      }
    );

    console.log(
      `💾 [MONGO BACKUP] +${phoneNumber} | ${Object.keys(files).length} files`
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

async function removeSession(sessionId, sessionDir) {
  try {
    await SessionModel.deleteOne({
      sessionId
    });
  } catch (error) {
    console.error(
      `⚠️ Mongo session delete error ${sessionId}:`,
      error.message
    );
  }

  try {
    if (sessionDir && fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, {
        recursive: true,
        force: true
      });
    }
  } catch (error) {
    console.error(
      `⚠️ Session directory delete error ${sessionId}:`,
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
  const sessionDir = getSessionFolder(sessionId);

  /*
   * If an old socket exists, don't create duplicate sockets.
   */
  const existingSocket =
    global.allActiveSessions.get(sessionId);

  if (existingSocket && !isPairing) {
    try {
      if (existingSocket.user) {
        return existingSocket;
      }
    } catch {}
  }

  const {
    state,
    saveCreds
  } = await useMultiFileAuthState(sessionDir);

  const {
    version,
    isLatest
  } = await fetchLatestBaileysVersion();

  console.log(
    `🔧 [SOCKET] Baileys v${version.join(".")} | Latest: ${isLatest} | +${phoneNumber}`
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

    /*
     * Desktop browser is generally reliable for
     * Linked Device / Pairing Code.
     */
    browser: Browsers.macOS("Desktop"),

    printQRInTerminal: false,

    syncFullHistory: false,

    markOnlineOnConnect: true,

    connectTimeoutMs: 120000,

    defaultQueryTimeoutMs: 120000,

    keepAliveIntervalMs: 25000,

    emitOwnEvents: true,

    generateHighQualityLinkPreview: false,

    retryRequestDelayMs: 1000,

    maxMsgRetryCount: 5
  });

  sock.sessionId = sessionId;
  sock.phoneNumber = phoneNumber;

  /*
   * Register immediately.
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
         * Backup after saving credentials.
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
          isNewLogin
        } = update;

        if (isNewLogin) {
          console.log(
            `🎉 [LINK ACCEPTED] +${phoneNumber} Successfully Linked!`
          );
        }

        /* ---------------------------------------------------
           CONNECTED
        --------------------------------------------------- */

        if (connection === "open") {
          console.log(
            "\x1b[32m%s\x1b[0m",
            `🟢 [CONNECTED] +${phoneNumber} → DARK DINU ONLINE & ACTIVE`
          );

          global.activeBotSockets.add(sock);

          global.allActiveSessions.set(
            sessionId,
            sock
          );

          /*
           * Save final credentials to Mongo.
           */
          await backupSession(
            sessionId,
            phoneNumber
          );
        }

        /* ---------------------------------------------------
           CLOSED
        --------------------------------------------------- */

        if (connection === "close") {
          const statusCode =
            lastDisconnect?.error?.output?.statusCode;

          console.log(
            `⚠️ [CLOSED] +${phoneNumber} | Status: ${statusCode}`
          );

          global.activeBotSockets.delete(sock);

          if (
            global.allActiveSessions.get(sessionId) ===
            sock
          ) {
            global.allActiveSessions.delete(
              sessionId
            );
          }

          /* -----------------------------------------------
             LOGGED OUT
          ------------------------------------------------ */

          if (
            statusCode ===
            DisconnectReason.loggedOut
          ) {
            console.log(
              `🚪 [LOGGED OUT] +${phoneNumber}`
            );

            await removeSession(
              sessionId,
              sessionDir
            );

            return;
          }

          /* -----------------------------------------------
             BAD SESSION
          ------------------------------------------------ */

          if (
            statusCode ===
            DisconnectReason.badSession
          ) {
            console.log(
              `🗑️ [BAD SESSION] Removing corrupted session +${phoneNumber}`
            );

            await removeSession(
              sessionId,
              sessionDir
            );

            return;
          }

          /* -----------------------------------------------
             RESTART REQUIRED
             
             IMPORTANT:
             Do NOT repeatedly restart forever.
          ------------------------------------------------ */

          if (
            statusCode ===
            DisconnectReason.restartRequired
          ) {
            console.log(
              `🔄 [RESTART REQUIRED] Reconnecting +${phoneNumber}...`
            );

            setTimeout(async () => {
              try {
                if (
                  global.allActiveSessions.has(
                    sessionId
                  )
                ) {
                  return;
                }

                await createMultiSocket(
                  sessionId,
                  phoneNumber,
                  false
                );
              } catch (error) {
                console.error(
                  `❌ Restart error +${phoneNumber}:`,
                  error.message
                );
              }
            }, 2000);

            return;
          }

          /* -----------------------------------------------
             GENERAL AUTO RECONNECT
          ------------------------------------------------ */

          setTimeout(async () => {
            try {
              if (
                global.allActiveSessions.has(
                  sessionId
                )
              ) {
                return;
              }

              console.log(
                `🔄 [AUTO RECONNECT] Restoring +${phoneNumber}...`
              );

              await createMultiSocket(
                sessionId,
                phoneNumber,
                false
              );
            } catch (error) {
              console.error(
                `❌ [RECONNECT ERROR] +${phoneNumber}:`,
                error.message
              );
            }
          }, 5000);
        }
      } catch (error) {
        console.error(
          `❌ [CONNECTION UPDATE ERROR] +${phoneNumber}:`,
          error.message
        );
      }
    }
  );

  /* =======================================================
     SOCKET CALLBACK
  ======================================================= */

  if (onSocketCreatedCallback) {
    try {
      onSocketCreatedCallback(sock);
    } catch (error) {
      console.error(
        "⚠️ Socket callback error:",
        error.message
      );
    }
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
        "ℹ️ [SESSIONS] No saved sessions in MongoDB."
      );

      return false;
    }

    console.log(
      `⚡ [SESSIONS] Restoring ${sessions.length} session(s)...`
    );

    for (const session of sessions) {
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
          getSessionFolder(sessionId);

        /*
         * Restore Mongo files to local session folder.
         */
        for (
          const [key, content]
          of Object.entries(files || {})
        ) {
          const fileName =
            key.replace(
              /___dot___/g,
              "."
            );

          if (
            !isSafeSessionFile(fileName)
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
        }

        console.log(
          `🔄 [STARTING SESSION] +${phoneNumber}`
        );

        createMultiSocket(
          sessionId,
          phoneNumber,
          false
        ).catch((error) => {
          console.error(
            `❌ Socket restore error +${phoneNumber}:`,
            error.message
          );
        });

        /*
         * Small delay between sessions.
         */
        await delay(500);
      } catch (error) {
        console.error(
          "❌ Session restore item error:",
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
  let cleanNumber =
    String(phoneNumber)
      .replace(/[^0-9]/g, "");

  /*
   * Sri Lankan number:
   * 07XXXXXXXX -> 947XXXXXXXX
   */
  if (
    cleanNumber.startsWith("0")
  ) {
    cleanNumber =
      "94" +
      cleanNumber.substring(1);
  }

  /*
   * If user enters 947XXXXXXXX
   * keep it unchanged.
   */
  if (
    !cleanNumber.startsWith("94")
  ) {
    throw new Error(
      "Please enter a valid Sri Lankan number. Example: 0771234567"
    );
  }

  if (
    cleanNumber.length !== 11
  ) {
    throw new Error(
      "Invalid phone number. Example: 0771234567"
    );
  }

  const sessionId =
    `session_${cleanNumber}`;

  const sessionDir =
    getSessionFolder(sessionId);

  /* =======================================================
     CLOSE OLD SOCKET
  ======================================================= */

  const oldSocket =
    global.allActiveSessions.get(
      sessionId
    );

  if (oldSocket) {
    console.log(
      `♻️ [PAIRING] Closing old socket +${cleanNumber}...`
    );

    try {
      oldSocket.ev.removeAllListeners(
        "connection.update"
      );
    } catch {}

    try {
      oldSocket.end(
        undefined
      );
    } catch {}

    global.activeBotSockets.delete(
      oldSocket
    );

    global.allActiveSessions.delete(
      sessionId
    );

    await delay(1000);
  }

  /* =======================================================
     CLEAR OLD LOCAL SESSION
  ======================================================= */

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
      "⚠️ Old session cleanup error:",
      error.message
    );
  }

  ensureBaseDir();

  fs.mkdirSync(
    sessionDir,
    {
      recursive: true
    }
  );

  /*
   * IMPORTANT:
   * Remove old Mongo session BEFORE requesting
   * a completely fresh pairing code.
   */
  try {
    await SessionModel.deleteOne({
      sessionId
    });

    console.log(
      `🧹 [PAIRING] Old Mongo session cleared for +${cleanNumber}`
    );
  } catch (error) {
    console.error(
      "⚠️ Mongo old session cleanup error:",
      error.message
    );
  }

  /* =======================================================
     CREATE FRESH SOCKET
  ======================================================= */

  console.log(
    `📱 [PAIRING] Starting fresh socket for +${cleanNumber}...`
  );

  const sock =
    await createMultiSocket(
      sessionId,
      cleanNumber,
      true
    );

  /* =======================================================
     WAIT FOR SOCKET HANDSHAKE
  ======================================================= */

  return new Promise(
    (resolve, reject) => {
      let finished = false;
      let codeRequested = false;

      const timeout =
        setTimeout(() => {
          if (finished) {
            return;
          }

          finished = true;

          console.error(
            `⏰ [PAIRING TIMEOUT] +${cleanNumber}`
          );

          reject(
            new Error(
              "Pairing code timeout. Please refresh and request a new code."
            )
          );
        }, 60000);

      const cleanup = () => {
        try {
          sock.ev.removeListener(
            "connection.update",
            connectionHandler
          );
        } catch {}

        clearTimeout(timeout);
      };

      const requestCode =
        async () => {
          if (
            finished ||
            codeRequested
          ) {
            return;
          }

          /*
           * Don't request a code if already registered.
           */
          if (
            sock.authState?.creds
              ?.registered
          ) {
            return;
          }

          codeRequested = true;

          try {
            /*
             * Give WhatsApp handshake enough time.
             */
            await delay(2500);

            if (finished) {
              return;
            }

            console.log(
              `🔐 [PAIRING] Requesting code for +${cleanNumber}...`
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
                  )}-${code.slice(
                    4
                  )}`
                : code;

            console.log(
              `✅ [PAIRING CODE] +${cleanNumber}: ${formattedCode}`
            );

            if (finished) {
              return;
            }

            finished = true;

            cleanup();

            resolve({
              code: formattedCode,
              socket: sock
            });
          } catch (error) {
            codeRequested = false;

            console.error(
              `❌ [PAIRING CODE ERROR] +${cleanNumber}:`,
              error.message
            );

            /*
             * Don't instantly reject.
             * Sometimes WhatsApp handshake takes longer.
             */
            if (!finished) {
              setTimeout(() => {
                requestCode().catch(
                  () => {}
                );
              }, 2000);
            }
          }
        };

      const connectionHandler =
        async (update) => {
          try {
            const {
              connection
            } = update;

            console.log(
              `📡 [PAIRING SOCKET] +${cleanNumber} → ${connection || "waiting"}`
            );

            /*
             * Request after socket starts connecting.
             */
            if (
              connection ===
              "connecting"
            ) {
              setTimeout(() => {
                requestCode().catch(
                  () => {}
                );
              }, 1500);
            }

            /*
             * Sometimes no "connecting"
             * event arrives in time.
             */
            if (
              connection ===
              "open"
            ) {
              /*
               * Already linked.
               */
              console.log(
                `🟢 [PAIRING] +${cleanNumber} connected.`
              );
            }
          } catch (error) {
            console.error(
              "❌ Pairing connection handler error:",
              error.message
            );
          }
        };

      sock.ev.on(
        "connection.update",
        connectionHandler
      );

      /*
       * Fallback:
       * If connection.update does not fire,
       * still request the code.
       */
      setTimeout(() => {
        if (
          !finished &&
          !codeRequested
        ) {
          requestCode().catch(
            () => {}
          );
        }
      }, 4000);
    }
  );
}

/* =========================================================
   START SAVED SOCKET
========================================================= */

async function startSavedSocket() {
  try {
    await restoreCredentials();
    return true;
  } catch (error) {
    console.error(
      "❌ Start saved socket error:",
      error.message
    );

    return false;
  }
}

/* =========================================================
   BACKUP ALL CREDENTIALS
========================================================= */

async function backupAllCredentials() {
  try {
    const sessions =
      await SessionModel.find({}).lean();

    for (const session of sessions) {
      await backupSession(
        session.sessionId,
        session.phoneNumber
      );
    }

    console.log(
      "💾 [MONGO] All sessions backed up."
    );
  } catch (error) {
    console.error(
      "❌ Backup all credentials error:",
      error.message
    );
  }
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

  startSavedSocket,

  onSocketCreated: (
    callback
  ) => {
    onSocketCreatedCallback =
      callback;
  },

  getActiveSocket
};

