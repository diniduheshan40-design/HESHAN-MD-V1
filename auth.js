const fs = require("fs");
const path = require("path");
const pino = require("pino");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const mongoose = require("mongoose");

const logger = pino({ level: "silent" });

const sessionDir = path.join(__dirname, "session");

let activeSocket = null;
let reconnectTimer = null;
let isReconnecting = false;
let onSocketCreatedCallback = null;

let backupTimeout = null;

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
  mongoose.model(
    "DarkDinuSession",
    SessionSchema
  );

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
  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, {
        recursive: true,
        force: true
      });
    } catch (e) {
      console.error(
        "⚠️ Session delete error:",
        e.message
      );
    }
  }
}

/* =========================================================
   RESTORE SESSION FROM MONGODB
========================================================= */

async function restoreCredentials() {
  ensureSessionDir();

  try {
    const data =
      await SessionModel.findOne({
        sessionId: "dark_dinu_session"
      }).lean();

    if (
      !data ||
      !data.files ||
      Object.keys(data.files).length === 0
    ) {
      console.log(
        "ℹ️ [SESSION] No saved session found in MongoDB."
      );

      return false;
    }

    deleteSessionDir();
    ensureSessionDir();

    let count = 0;

    for (const [key, content] of Object.entries(
      data.files
    )) {
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

      const dir =
        path.dirname(filePath);

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
   BACKUP SESSION TO MONGODB
========================================================= */

async function backupAllCredentials() {
  if (backupTimeout) {
    clearTimeout(backupTimeout);
  }

  backupTimeout = setTimeout(
    async () => {
      try {
        ensureSessionDir();

        const files = {};

        const allFiles =
          fs.readdirSync(
            sessionDir
          );

        for (const fileName of allFiles) {
          const filePath =
            path.join(
              sessionDir,
              fileName
            );

          if (
            fs.existsSync(filePath) &&
            fs.statSync(filePath).isFile()
          ) {
            const safeKey =
              fileName.replace(
                /\./g,
                "___dot___"
              );

            files[safeKey] =
              fs.readFileSync(
                filePath,
                "utf8"
              );
          }
        }

        if (
          Object.keys(files).length === 0
        ) {
          return;
        }

        await SessionModel.findOneAndUpdate(
          {
            sessionId:
              "dark_dinu_session"
          },
          {
            $set: {
              files
            }
          },
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
    },
    1000
  );
}

/* =========================================================
   CREATE WHATSAPP SOCKET
========================================================= */

async function createSocket(
  isPairing = false
) {
  ensureSessionDir();

  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      sessionDir
    );

  const {
    version
  } =
    await fetchLatestBaileysVersion();

  /* -------------------------------------------------------
     CLOSE OLD SOCKET
  ------------------------------------------------------- */

  if (activeSocket) {
    try {
      activeSocket.ev.removeAllListeners();
      activeSocket.end(
        undefined
      );
    } catch (e) {}

    activeSocket = null;
  }

  /* -------------------------------------------------------
     CREATE SOCKET

     IMPORTANT:
     Windows Chrome signature is intentionally used here.
     This has been reported to help pairing-code linking
     on Baileys 6.7.x.
  ------------------------------------------------------- */

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

      browser: [
        "Windows",
        "Chrome",
        "114.0.5735.198"
      ],

      printQRInTerminal: false,

      syncFullHistory: false,

      markOnlineOnConnect: false,

      connectTimeoutMs: 60000,

      keepAliveIntervalMs: 15000,

      defaultQueryTimeoutMs: 0
    });

  activeSocket = sock;

  /* =======================================================
     SAVE CREDS
  ======================================================= */

  sock.ev.on(
    "creds.update",
    async () => {
      try {
        await saveCreds();

        await backupAllCredentials();
      } catch (e) {}
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

      /* ---------------------------------------------------
         CONNECTED
      --------------------------------------------------- */

      if (
        connection === "open"
      ) {
        isReconnecting = false;

        if (reconnectTimer) {
          clearTimeout(
            reconnectTimer
          );

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

      if (
        connection === "close"
      ) {
        const statusCode =
          lastDisconnect
            ?.error
            ?.output
            ?.statusCode;

        console.log(
          `⚠️ Connection closed. Status Code: ${statusCode}`
        );

        /* -----------------------------------------------
           LOGGED OUT
        ----------------------------------------------- */

        if (
          statusCode ===
          DisconnectReason.loggedOut
        ) {
          console.log(
            "🚪 Logged out from WhatsApp. Clearing session..."
          );

          await SessionModel.deleteOne({
            sessionId:
              "dark_dinu_session"
          }).catch(() => {});

          deleteSessionDir();

          activeSocket = null;

          return;
        }

        /* -----------------------------------------------
           PAIRING SOCKET CLOSED

           Do NOT start another socket here.
        ----------------------------------------------- */

        if (isPairing) {
          console.log(
            "⚠️ [PAIRING] Pairing socket closed."
          );

          activeSocket = null;

          return;
        }

        /* -----------------------------------------------
           NORMAL AUTO RECONNECT
        ----------------------------------------------- */

        if (
          !isReconnecting
        ) {
          isReconnecting = true;

          if (reconnectTimer) {
            clearTimeout(
              reconnectTimer
            );
          }

          const delayMs =
            statusCode ===
            DisconnectReason.restartRequired
              ? 2000
              : 5000;

          console.log(
            `🔄 Reconnecting automatically in ${delayMs / 1000}s...`
          );

          reconnectTimer =
            setTimeout(
              async () => {
                try {
                  await createSocket(
                    false
                  );
                } catch (e) {
                  console.error(
                    "❌ Auto-reconnect error:",
                    e.message
                  );
                } finally {
                  isReconnecting =
                    false;
                }
              },
              delayMs
            );
        }
      }
    }
  );

  /* =======================================================
     CALLBACK TO INDEX.JS
  ======================================================= */

  if (
    onSocketCreatedCallback
  ) {
    onSocketCreatedCallback(
      sock
    );
  }

  return sock;
}

/* =========================================================
   REQUEST PAIRING CODE
========================================================= */

async function requestPairCode(
  phoneNumber
) {
  /* -------------------------------------------------------
     STOP OLD RECONNECT TIMER
  ------------------------------------------------------- */

  if (reconnectTimer) {
    clearTimeout(
      reconnectTimer
    );

    reconnectTimer = null;
  }

  isReconnecting = true;

  /* -------------------------------------------------------
     NORMALIZE NUMBER
  ------------------------------------------------------- */

  let cleanNumber =
    String(phoneNumber || "")
      .replace(
        /[^0-9]/g,
        ""
      );

  if (
    cleanNumber.startsWith("0")
  ) {
    cleanNumber =
      "94" +
      cleanNumber.substring(1);
  }

  if (
    !/^94[0-9]{9}$/.test(
      cleanNumber
    )
  ) {
    isReconnecting = false;

    throw new Error(
      "Invalid Sri Lankan phone number."
    );
  }

  console.log(
    `📱 [PAIRING] Number: +${cleanNumber}`
  );

  /* -------------------------------------------------------
     IMPORTANT:
     Start with a completely fresh pairing session.
  ------------------------------------------------------- */

  deleteSessionDir();

  ensureSessionDir();

  /* -------------------------------------------------------
     CREATE SOCKET
  ------------------------------------------------------- */

  const sock =
    await createSocket(true);

  return new Promise(
    (resolve, reject) => {
      let finished = false;
      let codeRequested = false;

      /* ---------------------------------------------------
         CLEANUP
      --------------------------------------------------- */

      const cleanup =
        () => {
          try {
            sock.ev.off(
              "connection.update",
              onConnectionUpdate
            );
          } catch (e) {}
        };

      /* ---------------------------------------------------
         SUCCESS
      --------------------------------------------------- */

      const finishSuccess =
        (code) => {
          if (finished) {
            return;
          }

          finished = true;

          cleanup();

          isReconnecting =
            false;

          console.log(
            `✅ [PAIRING] Code generated: ${code}`
          );

          resolve({
            code,
            socket: sock
          });
        };

      /* ---------------------------------------------------
         ERROR
      --------------------------------------------------- */

      const finishError =
        (error) => {
          if (finished) {
            return;
          }

          finished = true;

          cleanup();

          isReconnecting =
            false;

          console.error(
            "❌ [PAIRING] Error:",
            error.message
          );

          reject(error);
        };

      /* ---------------------------------------------------
         TIMEOUT
      --------------------------------------------------- */

      const timeout =
        setTimeout(
          () => {
            finishError(
              new Error(
                "Pairing code timed out. WhatsApp server did not respond."
              )
            );
          },
          60000
        );

      /* ---------------------------------------------------
         REQUEST CODE
         
         Official Baileys pairing flow:
         wait for connection === "connecting"
         then requestPairingCode().
      --------------------------------------------------- */

      const requestCode =
        async () => {
          if (
            finished ||
            codeRequested
          ) {
            return;
          }

          if (
            sock.authState &&
            sock.authState.creds &&
            sock.authState.creds.registered
          ) {
            return;
          }

          codeRequested = true;

          try {
            console.log(
              "⏳ [PAIRING] WhatsApp handshake detected..."
            );

            /* Small delay to make sure the socket
               has completed its initial setup. */

            await new Promise(
              (resolve) =>
                setTimeout(
                  resolve,
                  3000
                )
            );

            if (finished) {
              return;
            }

            console.log(
              "📲 [PAIRING] Requesting pairing code..."
            );

            const code =
              await sock.requestPairingCode(
                cleanNumber
              );

            clearTimeout(
              timeout
            );

            finishSuccess(
              code
            );
          } catch (error) {
            clearTimeout(
              timeout
            );

            finishError(
              error
            );
          }
        };

      /* ---------------------------------------------------
         CONNECTION UPDATE
      --------------------------------------------------- */

      const onConnectionUpdate =
        async (
          update
        ) => {
          if (finished) {
            return;
          }

          const {
            connection,
            lastDisconnect
          } = update;

          console.log(
            `🔌 [PAIRING] Connection: ${connection || "waiting"}`
          );

          /* ---------------------------------------------
             OFFICIAL TRIGGER:
             connection === connecting
          --------------------------------------------- */

          if (
            connection ===
            "connecting"
          ) {
            await requestCode();
            return;
          }

          /* ---------------------------------------------
             QR EVENT FALLBACK

             Pairing code doesn't need QR, but Baileys
             docs allow !!qr as another trigger.
          --------------------------------------------- */

          if (
            update.qr
          ) {
            await requestCode();
            return;
          }

          /* ---------------------------------------------
             CONNECTION CLOSED
          --------------------------------------------- */

          if (
            connection ===
            "close"
          ) {
            clearTimeout(
              timeout
            );

            const statusCode =
              lastDisconnect
                ?.error
                ?.output
                ?.statusCode;

            finishError(
              new Error(
                `WhatsApp pairing connection closed${
                  statusCode
                    ? ` (Status ${statusCode})`
                    : ""
                }.`
              )
            );
          }
        };

      sock.ev.on(
        "connection.update",
        onConnectionUpdate
      );

      /* ---------------------------------------------------
         FALLBACK TIMER

         If the first "connecting" event happened before
         our listener was attached, try once after 5 sec.
      --------------------------------------------------- */

      setTimeout(
        async () => {
          if (
            finished ||
            codeRequested
          ) {
            return;
          }

          console.log(
            "🔁 [PAIRING] Fallback handshake check..."
          );

          await requestCode();
        },
        5000
      );
    }
  );
}

/* =========================================================
   START SAVED SOCKET
========================================================= */

async function startSavedSocket() {
  ensureSessionDir();

  const credsFile =
    path.join(
      sessionDir,
      "creds.json"
    );

  if (
    !fs.existsSync(
      credsFile
    )
  ) {
    return null;
  }

  console.log(
    "🔐 [WHATSAPP] Saved credentials found. Starting socket..."
  );

  return await createSocket(
    false
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
    cb
  ) => {
    onSocketCreatedCallback =
      cb;
  },

  getActiveSocket: () =>
    activeSocket
};
