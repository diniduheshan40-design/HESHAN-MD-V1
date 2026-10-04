const fs = require("fs");
const path = require("path");
const pino = require("pino");
const mongoose = require("mongoose");

const originalConsoleError = console.error;

console.error = (...args) => {
  const msg = args.join(" ");

  if (
    msg.includes("MessageCounterError") ||
    msg.includes("Bad MAC") ||
    msg.includes("Session error") ||
    msg.includes("currentRatchet") ||
    msg.includes("Failed to decrypt")
  ) {
    return;
  }

  originalConsoleError.apply(console, args);
};

const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const logger = pino({ level: "silent" });

const baseSessionDir = path.resolve(__dirname, "sessions");

if (!global.activeBotSockets) {
  global.activeBotSockets = new Set();
}

if (!global.allActiveSessions) {
  global.allActiveSessions = new Map();
}

if (!global.sessionRetryCache) {
  global.sessionRetryCache = new Map();
}

if (!global.sessionCreating) {
  global.sessionCreating = new Set();
}

if (!global.sessionRestarting) {
  global.sessionRestarting = new Set();
}

class SimpleCache {
  constructor(ttlSeconds = 60) {
    this.ttl = ttlSeconds * 1000;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);

    if (!item) {
      return undefined;
    }

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    return item.value;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttl
    });
  }

  del(key) {
    this.cache.delete(key);
  }
}

const reconnectRetries = new Map();

let onSocketCreatedCallback = null;

/* =========================================================
   MONGODB SESSION SCHEMA
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
   SESSION DIRECTORY
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
      "❌ Session directory error:",
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
  if (!fileName) {
    return false;
  }

  return (
    !fileName.includes("..") &&
    !fileName.includes("/") &&
    !fileName.includes("\\")
  );
}

/* =========================================================
   PHONE NORMALIZER
========================================================= */

function normalizePhoneNumber(phoneNumber) {
  let number = String(phoneNumber || "")
    .replace(/[^0-9]/g, "");

  if (number.startsWith("0")) {
    number =
      "94" +
      number.substring(1);
  }

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
   DISCONNECT CODE
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
   MONGO BACKUP
========================================================= */

const backupDebounce = new Map();

async function backupSession(
  sessionId,
  phoneNumber
) {
  if (backupDebounce.has(sessionId)) {
    clearTimeout(
      backupDebounce.get(sessionId)
    );
  }

  const timer = setTimeout(async () => {
    backupDebounce.delete(sessionId);

    try {
      const sessionDir =
        path.join(
          baseSessionDir,
          sessionId
        );

      if (!fs.existsSync(sessionDir)) {
        return;
      }

      const files = {};

      const list =
        fs.readdirSync(sessionDir);

      for (const file of list) {
        try {
          if (!isSafeSessionFile(file)) {
            continue;
          }

          const filePath =
            path.join(
              sessionDir,
              file
            );

          if (!fs.existsSync(filePath)) {
            continue;
          }

          const stat =
            fs.statSync(filePath);

          if (!stat.isFile()) {
            continue;
          }

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
        } catch (fileError) {
          // Ignore individual file errors
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
        `💾 [MONGO] Session backup saved: +${phoneNumber}`
      );
    } catch (error) {
      console.error(
        "❌ [MONGO BACKUP ERROR]:",
        error.message
      );
    }
  }, 1000);

  backupDebounce.set(
    sessionId,
    timer
  );
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
  } catch (error) {}

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
  } catch (error) {}
}

/* =========================================================
   SOCKET CREATION
========================================================= */

async function createMultiSocket(
  sessionId,
  phoneNumber
) {
  /*
   * Prevent duplicate sockets.
   */
  if (
    global.sessionCreating.has(sessionId)
  ) {
    const existing =
      global.allActiveSessions.get(
        sessionId
      );

    if (existing) {
      return existing;
    }
  }

  global.sessionCreating.add(
    sessionId
  );

  try {
    const sessionDir =
      getSessionFolder(sessionId);

    const {
      state,
      saveCreds
    } =
      await useMultiFileAuthState(
        sessionDir
      );

    /*
     * Important:
     *
     * We intentionally do NOT call
     * fetchLatestBaileysVersion()
     * on every socket creation.
     *
     * This removes an unnecessary
     * network request during pairing
     * and reconnecting.
     */

    if (
      !global.sessionRetryCache.has(
        sessionId
      )
    ) {
      global.sessionRetryCache.set(
        sessionId,
        new SimpleCache(60)
      );
    }

    const msgRetryCounterCache =
      global.sessionRetryCache.get(
        sessionId
      );

    const socketConfig = {
      logger,

      auth: {
        creds: state.creds,

        keys:
          makeCacheableSignalKeyStore(
            state.keys,
            logger
          )
      },

      browser:
        Browsers.ubuntu(
          "Chrome"
        ),

      printQRInTerminal: false,

      syncFullHistory: false,

      markOnlineOnConnect: true,

      connectTimeoutMs: 60000,

      defaultQueryTimeoutMs: 30000,

      keepAliveIntervalMs: 20000,

      emitOwnEvents: false,

      generateHighQualityLinkPreview: false,

      msgRetryCounterCache,

      retryRequestDelayMs: 1000,

      maxMsgRetryCount: 2,

      getMessage: async () => ({
        conversation: ""
      })
    };

    const sock =
      makeWASocket(
        socketConfig
      );

    if (
      sock.ev &&
      typeof sock.ev.setMaxListeners ===
        "function"
    ) {
      sock.ev.setMaxListeners(0);
    }

    sock.sessionId =
      sessionId;

    sock.phoneNumber =
      phoneNumber;

    sock.darkDinuAuthState =
      state;

    /*
     * Track credential save promise.
     *
     * This is important for 515 pairing.
     */
    let lastCredSave =
      Promise.resolve();

    sock._darkDinuLastCredSave =
      lastCredSave;

    global.allActiveSessions.set(
      sessionId,
      sock
    );

    /*
     * SAVE CREDENTIALS
     */
    sock.ev.on(
      "creds.update",
      async () => {
        lastCredSave =
          (async () => {
            try {
              await saveCreds();

              /*
               * Save to Mongo shortly after
               * local credentials are written.
               */
              backupSession(
                sessionId,
                phoneNumber
              );
            } catch (error) {
              console.error(
                "❌ Credential save error:",
                error.message
              );
            }
          })();

        sock._darkDinuLastCredSave =
          lastCredSave;

        await lastCredSave;
      }
    );

    /*
     * CONNECTION UPDATE
     */
    sock.ev.on(
      "connection.update",
      async (update) => {
        try {
          const {
            connection,
            lastDisconnect,
            isNewLogin
          } = update;

          /*
           * Pairing accepted.
           */
          if (isNewLogin) {
            console.log(
              `🎉 [PAIR SUCCESS] +${phoneNumber}`
            );

            /*
             * Save credentials immediately.
             */
            try {
              await lastCredSave;
              await saveCreds();
              backupSession(
                sessionId,
                phoneNumber
              );
            } catch (e) {}
          }

          /*
           * CONNECTED
           */
          if (
            connection === "open"
          ) {
            console.log(
              `🟢 [CONNECTED] +${phoneNumber} Active 24/7`
            );

            reconnectRetries.delete(
              sessionId
            );

            global.activeBotSockets.add(
              sock
            );

            global.allActiveSessions.set(
              sessionId,
              sock
            );

            try {
              await lastCredSave;
              await saveCreds();
              backupSession(
                sessionId,
                phoneNumber
              );
            } catch (e) {}

            return;
          }

          /*
           * CLOSED
           */
          if (
            connection === "close"
          ) {
            const statusCode =
              getDisconnectCode(
                lastDisconnect
              );

            global.activeBotSockets.delete(
              sock
            );

            console.log(
              `🔴 [SOCKET CLOSED] +${phoneNumber} | Code: ${statusCode}`
            );

            /*
             * LOGGED OUT
             */
            if (
              statusCode ===
              DisconnectReason.loggedOut
            ) {
              console.log(
                `🚪 [LOGGED OUT] +${phoneNumber}`
              );

              reconnectRetries.delete(
                sessionId
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

            /*
             * BAD AUTH
             */
            if (
              statusCode ===
              DisconnectReason.badSession
            ) {
              console.log(
                `🧹 [BAD SESSION] Rebuilding +${phoneNumber}`
              );

              reconnectRetries.delete(
                sessionId
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

            /*
             * 515 RESTART REQUIRED
             *
             * IMPORTANT:
             * This is normal after pairing.
             *
             * Restart immediately.
             */
            if (
              statusCode ===
              DisconnectReason.restartRequired
            ) {
              console.log(
                `♻️ [515] Restart required for +${phoneNumber}`
              );

              /*
               * Wait for credential save.
               */
              try {
                await lastCredSave;
                await saveCreds();
              } catch (e) {}

              /*
               * Do not create multiple
               * restart sockets.
               */
              if (
                global.sessionRestarting.has(
                  sessionId
                )
              ) {
                return;
              }

              global.sessionRestarting.add(
                sessionId
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

              try {
                sock.end(
                  undefined
                );
              } catch (e) {}

              /*
               * 515 should restart
               * immediately.
               */
              setTimeout(
                async () => {
                  try {
                    await createMultiSocket(
                      sessionId,
                      phoneNumber
                    );
                  } catch (e) {
                    console.error(
                      `❌ 515 restart failed +${phoneNumber}:`,
                      e.message
                    );
                  } finally {
                    global.sessionRestarting.delete(
                      sessionId
                    );
                  }
                },
                100
              );

              return;
            }

            /*
             * CONNECTION REPLACED
             */
            if (
              statusCode ===
              DisconnectReason.connectionReplaced
            ) {
              console.log(
                `🔁 [REPLACED] +${phoneNumber}`
              );

              global.allActiveSessions.delete(
                sessionId
              );

              return;
            }

            /*
             * OTHER CONNECTION ERRORS
             */
            const retries =
              reconnectRetries.get(
                sessionId
              ) || 0;

            const nextRetry =
              retries + 1;

            reconnectRetries.set(
              sessionId,
              nextRetry
            );

            /*
             * Backoff:
             *
             * 1st = 2 sec
             * 2nd = 3 sec
             * 3rd = 5 sec
             * max = 15 sec
             */
            const delayMs =
              Math.min(
                15000,
                2000 *
                  Math.min(
                    nextRetry,
                    7
                  )
              );

            console.log(
              `🔄 [RECONNECT] +${phoneNumber} in ${delayMs}ms`
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

            setTimeout(
              async () => {
                try {
                  await createMultiSocket(
                    sessionId,
                    phoneNumber
                  );
                } catch (e) {
                  console.error(
                    `❌ Reconnect failed +${phoneNumber}:`,
                    e.message
                  );
                }
              },
              delayMs
            );
          }
        } catch (error) {
          console.error(
            "❌ connection.update error:",
            error.message
          );
        }
      }
    );

    /*
     * CALLBACK TO INDEX.JS
     */
    if (
      onSocketCreatedCallback
    ) {
      try {
        onSocketCreatedCallback(
          sock
        );
      } catch (error) {}
    }

    return sock;
  } finally {
    global.sessionCreating.delete(
      sessionId
    );
  }
}

/* =========================================================
   RESTORE MONGO SESSIONS
========================================================= */

async function restoreCredentials() {
  ensureBaseDir();

  try {
    const sessions =
      await SessionModel.find({})
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
         * Restore files from Mongo.
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
          } catch (fileError) {}
        }

        /*
         * Start socket.
         */
        await createMultiSocket(
          sessionId,
          phoneNumber
        );

        /*
         * Small gap between multiple
         * restored sessions.
         */
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              500
            )
        );
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
      "❌ [MONGO RESTORE ERROR]:",
      error.message
    );

    return false;
  }
}

/* =========================================================
   PAIRING CODE
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

  /*
   * Remove old socket.
   */
  const oldSocket =
    global.allActiveSessions.get(
      sessionId
    );

  if (oldSocket) {
    console.log(
      `🧹 [PAIR] Removing old socket +${cleanNumber}`
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

        oldSocket.ev.removeAllListeners(
          "messages.upsert"
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
  }

  /*
   * Remove old local auth.
   */
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
      "❌ Old session cleanup error:",
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
   * Remove old Mongo session.
   */
  try {
    await SessionModel.deleteOne({
      sessionId
    });
  } catch (error) {}

  /*
   * Create fresh socket.
   */
  const sock =
    await createMultiSocket(
      sessionId,
      cleanNumber
    );

  return new Promise(
    (resolve, reject) => {
      let finished = false;

      let codeRequested =
        false;

      let connectingSeen =
        false;

      /*
       * Overall timeout.
       *
       * 30 seconds is enough.
       */
      const timeout =
        setTimeout(() => {
          if (finished) {
            return;
          }

          finished = true;

          try {
            sock.end(
              undefined
            );
          } catch (e) {}

          reject(
            new Error(
              "Pairing code request timed out. Please try again."
            )
          );
        }, 30000);

      const cleanup =
        () => {
          clearTimeout(
            timeout
          );

          try {
            sock.ev.removeListener(
              "connection.update",
              onUpdate
            );
          } catch (e) {}
        };

      /*
       * Request pairing code.
       */
      const requestCode =
        async () => {
          if (
            finished ||
            codeRequested
          ) {
            return;
          }

          codeRequested =
            true;

          try {
            /*
             * Small delay after connecting
             * event to make sure socket is ready.
             */
            await new Promise(
              (resolve) =>
                setTimeout(
                  resolve,
                  300
                )
            );

            if (finished) {
              return;
            }

            if (
              sock.darkDinuAuthState
                ?.creds
                ?.registered
            ) {
              finished = true;
              cleanup();

              return reject(
                new Error(
                  "Device is already registered."
                )
              );
            }

            console.log(
              `📲 [PAIR] Requesting code for +${cleanNumber}`
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

            const codeStr =
              String(rawCode);

            const formattedCode =
              codeStr.length === 8
                ? `${codeStr.slice(
                    0,
                    4
                  )}-${codeStr.slice(
                    4
                  )}`
                : codeStr;

            if (finished) {
              return;
            }

            finished = true;

            cleanup();

            console.log(
              `🔐 [PAIR CODE] +${cleanNumber}: ${formattedCode}`
            );

            resolve({
              code: formattedCode
            });
          } catch (error) {
            if (finished) {
              return;
            }

            finished = true;

            cleanup();

            reject(
              error
            );
          }
        };

      /*
       * Listen ONLY to this socket.
       */
      const onUpdate =
        async (update) => {
          try {
            const {
              connection,
              isNewLogin
            } = update;

            /*
             * Baileys documentation recommends
             * requesting pairing code after
             * connecting event.
             */
            if (
              connection ===
              "connecting"
            ) {
              connectingSeen =
                true;

              await requestCode();

              return;
            }

            /*
             * Some Baileys versions can send
             * QR/update without "connecting".
             */
            if (
              update.qr &&
              !codeRequested
            ) {
              connectingSeen =
                true;

              await requestCode();

              return;
            }

            /*
             * Pair accepted.
             */
            if (
              isNewLogin
            ) {
              console.log(
                `🎉 [PAIR ACCEPTED] +${cleanNumber}`
              );
            }

            /*
             * If socket reaches open before
             * code request somehow happened.
             */
            if (
              connection ===
                "open" &&
              !codeRequested
            ) {
              await requestCode();

              return;
            }

            /*
             * If it closes before code arrives,
             * report useful error.
             */
            if (
              connection ===
                "close" &&
              !finished
            ) {
              const code =
                getDisconnectCode(
                  update.lastDisconnect
                );

              if (
                code ===
                DisconnectReason.restartRequired
              ) {
                /*
                 * Don't immediately reject if
                 * pairing was already accepted.
                 *
                 * 515 is normal after successful
                 * pairing.
                 */
                if (
                  sock.darkDinuAuthState
                    ?.creds
                    ?.registered
                ) {
                  return;
                }
              }

              finished =
                true;

              cleanup();

              reject(
                new Error(
                  `WhatsApp connection closed during pairing. Code: ${code || "unknown"}`
                )
              );
            }
          } catch (error) {
            if (!finished) {
              finished =
                true;

              cleanup();

              reject(
                error
              );
            }
          }
        };

      sock.ev.on(
        "connection.update",
        onUpdate
      );

      /*
       * Fallback:
       *
       * If Baileys has already emitted
       * connecting before our listener was
       * attached, request code after a
       * short period.
       */
      setTimeout(
        async () => {
          if (
            !finished &&
            !codeRequested
          ) {
            await requestCode();
          }
        },
        1500
      );
    }
  );
}

/* =========================================================
   LOGOUT ALL
========================================================= */

async function logoutAllBots() {
  if (
    global.allActiveSessions &&
    global.allActiveSessions.size >
      0
  ) {
    for (
      const [
        sessionId,
        sock
      ] of global.allActiveSessions.entries()
    ) {
      try {
        if (
          typeof sock.logout ===
          "function"
        ) {
          await sock.logout();
        }

        if (
          typeof sock.end ===
          "function"
        ) {
          sock.end(
            undefined
          );
        }
      } catch (err) {}
    }

    global.allActiveSessions.clear();
  }

  if (
    global.activeBotSockets
  ) {
    global.activeBotSockets.clear();
  }

  try {
    await SessionModel.deleteMany(
      {}
    );
  } catch (err) {}

  try {
    if (
      fs.existsSync(
        baseSessionDir
      )
    ) {
      fs.rmSync(
        baseSessionDir,
        {
          recursive: true,
          force: true
        }
      );

      fs.mkdirSync(
        baseSessionDir,
        {
          recursive: true
        }
      );
    }
  } catch (err) {}

  return true;
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  restoreCredentials,

  requestPairCode,

  logoutAllBots,

  onSocketCreated:
    (callback) => {
      onSocketCreatedCallback =
        callback;
    }
};
