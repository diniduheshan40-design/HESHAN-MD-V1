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

const sessionDir = path.join(__dirname, "session");
const botIdFile = path.join(__dirname, ".bot_identity");

let activeSocket = null;
let reconnectTimer = null;
let isReconnecting = false;
let onSocketCreatedCallback = null;

// Session ID එක dynamic ලෙස හඳුනාගැනීම
function getCurrentSessionId() {
  if (process.env.SESSION_ID && process.env.SESSION_ID.trim()) {
    return process.env.SESSION_ID.trim();
  }
  if (fs.existsSync(botIdFile)) {
    try {
      const saved = fs.readFileSync(botIdFile, "utf8").trim();
      if (saved) return saved;
    } catch (e) {}
  }
  return "dark_dinu_session";
}

function setBotIdentity(identifier) {
  try {
    fs.writeFileSync(botIdFile, identifier, "utf8");
  } catch (e) {}
}

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

function ensureSessionDir() {
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, {
      recursive: true
    });
  }
}

function deleteSessionDir() {
  if (!fs.existsSync(sessionDir)) return;

  try {
    fs.rmSync(sessionDir, {
      recursive: true,
      force: true
    });
  } catch (error) {
    console.log("⚠️ Session delete warning:", error.message);
  }
}

/* =========================================================
   RESTORE SESSION FROM MONGODB
========================================================= */

async function restoreCredentials() {
  ensureSessionDir();

  try {
    const currentId = getCurrentSessionId();
    const data = await SessionModel.findOne({
      sessionId: currentId
    }).lean();

    if (
      !data ||
      !data.files ||
      Object.keys(data.files).length === 0
    ) {
      console.log(`ℹ️ [SESSION] No saved session found in MongoDB for: ${currentId}`);
      return false;
    }

    deleteSessionDir();
    ensureSessionDir();

    let count = 0;

    for (const [key, content] of Object.entries(data.files)) {
      const fileName = key.replace(/___dot___/g, ".");

      const filePath = path.join(
        sessionDir,
        fileName
      );

      const dir = path.dirname(filePath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
          recursive: true
        });
      }

      fs.writeFileSync(
        filePath,
        content,
        "utf8"
      );

      count++;
    }

    console.log(
      `✅ [SESSION] Restored ${count} session files for [${currentId}] from MongoDB.`
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
   BACKUP SESSION TO MONGODB
========================================================= */

async function backupAllCredentials() {
  try {
    ensureSessionDir();

    const files = {};
    const allFiles = fs.readdirSync(sessionDir);

    for (const fileName of allFiles) {
      const filePath = path.join(
        sessionDir,
        fileName
      );

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

    const currentId = getCurrentSessionId();

    await SessionModel.findOneAndUpdate(
      {
        sessionId: currentId
      },
      {
        $set: {
          files
        }
      },
      {
        upsert: true
      }
    );

    console.log(
      `⚡ [SESSION] Synced [${currentId}] with MongoDB Atlas!`
    );

  } catch (error) {
    console.error(
      "❌ Backup error:",
      error.message
    );
  }
}

/* =========================================================
   CREATE SOCKET
========================================================= */

async function createSocket(isPairing = false) {
  ensureSessionDir();

  const {
    state,
    saveCreds
  } = await useMultiFileAuthState(
    sessionDir
  );

  const {
    version
  } = await fetchLatestBaileysVersion();

  if (activeSocket) {
    try {
      activeSocket.ev.removeAllListeners();
      activeSocket.end(undefined);
    } catch (error) {}

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
    browser: Browsers.windows(
      "Chrome"
    ),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
    defaultQueryTimeoutMs: 60000,
    emitOwnEvents: true
  });

  activeSocket = sock;

  sock.ev.on(
    "creds.update",
    async () => {
      try {
        await saveCreds();

        // Bot phone number එක assign වූ පසු dynamic session ID එක register කිරීම
        if (sock.user?.id) {
          const rawNum = sock.user.id.split(":")[0].replace(/[^0-9]/g, "");
          if (rawNum) {
            setBotIdentity(`dinu_bot_${rawNum}`);
          }
        }

        await backupAllCredentials();

      } catch (error) {
        console.error(
          "❌ Credentials save error:",
          error.message
        );
      }
    }
  );

  sock.ev.on(
    "connection.update",
    async (update) => {

      const {
        connection,
        lastDisconnect,
        isNewLogin
      } = update;

      if (isNewLogin) {
        console.log(
          "🎉 [PAIRING] WhatsApp pairing accepted!"
        );

        if (isPairing) {
          setTimeout(async () => {
            try {
              console.log(
                "🔄 [PAIRING] Restarting socket after successful pairing..."
              );
              isReconnecting = true;
              await createSocket(false);
            } catch (error) {
              console.error(
                "❌ [PAIRING] Restart failed:",
                error.message
              );
            } finally {
              isReconnecting = false;
            }
          }, 1500);
        }
      }

      if (connection === "open") {
        isReconnecting = false;

        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }

        if (sock.user?.id) {
          const rawNum = sock.user.id.split(":")[0].replace(/[^0-9]/g, "");
          if (rawNum) {
            setBotIdentity(`dinu_bot_${rawNum}`);
          }
        }

        console.log(
          "\x1b[32m%s\x1b[0m",
          "🟢 [SOCKET] WhatsApp connected successfully!"
        );

        await backupAllCredentials();
      }

      if (connection === "close") {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        console.log(
          `⚠️ [SOCKET] Connection closed. Status Code: ${statusCode}`
        );

        if (
          statusCode ===
          DisconnectReason.loggedOut
        ) {
          console.log(
            "🚪 [SOCKET] Logged out from WhatsApp."
          );

          const currentId = getCurrentSessionId();
          await SessionModel.deleteOne({
            sessionId: currentId
          }).catch(() => {});

          deleteSessionDir();
          activeSocket = null;
          return;
        }

        if (
          isPairing &&
          statusCode ===
          DisconnectReason.restartRequired
        ) {
          console.log(
            "🔄 [PAIRING] Restart required after pairing. Reconnecting..."
          );

          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
          }

          reconnectTimer = setTimeout(
            async () => {
              try {
                isReconnecting = true;
                await createSocket(false);
              } catch (error) {
                console.error(
                  "❌ [PAIRING] Reconnect error:",
                  error.message
                );
              } finally {
                isReconnecting = false;
              }
            },
            1500
          );

          return;
        }

        if (!isReconnecting) {
          isReconnecting = true;

          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
          }

          let delayMs = 5000;

          if (
            statusCode ===
            DisconnectReason.restartRequired
          ) {
            delayMs = 1500;
          }

          reconnectTimer = setTimeout(
            async () => {
              try {
                console.log(
                  "🔄 [SOCKET] Auto reconnecting..."
                );
                await createSocket(false);
              } catch (error) {
                console.error(
                  "❌ [SOCKET] Auto reconnect error:",
                  error.message
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
   REQUEST PAIRING CODE
========================================================= */

async function requestPairCode(phoneNumber) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  isReconnecting = true;

  let cleanNumber = String(
    phoneNumber
  ).replace(/[^0-9]/g, "");

  if (cleanNumber.startsWith("0")) {
    cleanNumber = "94" + cleanNumber.substring(1);
  }

  // අදාළ නම්බර් එකට අනන්‍ය Dynamic Session Identifier එකක් Set කිරීම
  setBotIdentity(`dinu_bot_${cleanNumber}`);

  deleteSessionDir();
  ensureSessionDir();

  const sock = await createSocket(true);

  console.log(
    `📱 [PAIRING] Requesting pairing code for ${cleanNumber}`
  );

  return new Promise(
    (resolve, reject) => {
      let finished = false;
      let codeRequested = false;

      const cleanup = () => {
        sock.ev.off(
          "connection.update",
          onUpdate
        );

        if (timeout) {
          clearTimeout(timeout);
        }
      };

      const timeout = setTimeout(
        () => {
          if (finished) return;
          finished = true;
          cleanup();
          isReconnecting = false;
          reject(
            new Error(
              "Pairing code timeout. Please try again."
            )
          );
        },
        30000
      );

      const requestCode = async () => {
        if (finished || codeRequested) return;

        if (sock.authState?.creds?.registered) return;

        codeRequested = true;

        try {
          console.log(
            "🔐 [PAIRING] Requesting WhatsApp pairing code..."
          );

          const code =
            await sock.requestPairingCode(
              cleanNumber
            );

          if (!code) {
            throw new Error(
              "WhatsApp did not return a pairing code."
            );
          }

          console.log(
            `🔑 [PAIRING] CODE: ${code}`
          );

          finished = true;
          cleanup();
          isReconnecting = false;

          resolve({
            code,
            socket: sock
          });

        } catch (error) {
          finished = true;
          cleanup();
          isReconnecting = false;
          console.error(
            "❌ [PAIRING] Code request failed:",
            error.message
          );
          reject(error);
        }
      };

      const onUpdate = async (update) => {
        if (finished) return;

        const { connection, qr } = update;

        console.log(
          `🔌 [PAIRING] connection=${connection || "none"} qr=${qr ? "yes" : "no"}`
        );

        if (connection === "connecting" || !!qr) {
          await delay(1000);
          await requestCode();
        }
      };

      sock.ev.on("connection.update", onUpdate);

      setTimeout(async () => {
        if (!finished && !codeRequested) {
          console.log(
            "⏳ [PAIRING] Fallback pairing request..."
          );
          await requestCode();
        }
      }, 4000);
    }
  );
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
    console.log(
      "ℹ️ [SOCKET] No saved WhatsApp credentials."
    );
    return null;
  }

  console.log(
    "🔄 [SOCKET] Starting saved WhatsApp session..."
  );

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
  onSocketCreated: (callback) => {
    onSocketCreatedCallback = callback;
  },
  getActiveSocket: () => {
    return activeSocket;
  }
};
