const fs = require("fs");
const path = require("path");
const pino = require("pino");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const mongoose = require("mongoose");

const DEVELOPER_NUMBER = "94719845166"; // Developer Number

const logger = pino({
  level: "silent"
});

const sessionDir = path.join(__dirname, "session");
const commandsDir = path.join(__dirname, "commands");

let activeSocket = null;
let reconnectTimer = null;
let backupRunning = false;
let backupAgain = false;

/* =========================================================
   COMMANDS FOLDER SETUP & DYNAMIC LOADER
========================================================= */

function ensureCommandsDir() {
  if (!fs.existsSync(commandsDir)) {
    fs.mkdirSync(commandsDir, { recursive: true });
  }
}
ensureCommandsDir();

// Dynamic Command Loader (Auto-Reload on Edit)
function getCommand(cmdName) {
  ensureCommandsDir();
  const files = fs.readdirSync(commandsDir).filter(f => f.endsWith(".js"));

  for (const file of files) {
    const fullPath = path.join(commandsDir, file);
    try {
      // Cache clear කරනවා එවෙලේම කරන වෙනස්කම් reflect වෙන්න
      delete require.cache[require.resolve(fullPath)];
      const cmdObj = require(fullPath);

      if (cmdObj && cmdObj.name) {
        const isNameMatch = cmdObj.name.toLowerCase() === cmdName;
        const isAliasMatch = Array.isArray(cmdObj.alias) && cmdObj.alias.map(a => a.toLowerCase()).includes(cmdName);

        if (isNameMatch || isAliasMatch) {
          return cmdObj;
        }
      }
    } catch (err) {
      console.error(`⚠️ Error loading command from ${file}:`, err.message);
    }
  }
  return null;
}

/* =========================================================
   MONGODB SCHEMAS & MODELS
========================================================= */

const SessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      unique: true,
      required: true
    },
    files: {
      type: Map,
      of: String,
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

const MetaSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed
});

const BotMeta =
  mongoose.models.DarkDinuMeta ||
  mongoose.model("DarkDinuMeta", MetaSchema);

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
    fs.rmSync(sessionDir, {
      recursive: true,
      force: true
    });
  }
}

/* =========================================================
   RESTORE MONGODB SESSION
========================================================= */

async function restoreCredentials() {
  ensureSessionDir();

  try {
    const data = await SessionModel.findOne({
      sessionId: "dark_dinu_session"
    }).lean();

    if (!data || !data.files) {
      console.log("ℹ️ No MongoDB WhatsApp session found");
      return false;
    }

    deleteSessionDir();
    ensureSessionDir();

    const files =
      data.files instanceof Map
        ? Object.fromEntries(data.files)
        : data.files;

    let count = 0;

    for (const [fileName, content] of Object.entries(files)) {
      const filePath = path.join(sessionDir, fileName);
      const directory = path.dirname(filePath);

      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, {
          recursive: true
        });
      }

      fs.writeFileSync(filePath, content, "utf8");
      count++;
    }

    console.log(`✅ Restored ${count} session files from MongoDB`);
    return true;
  } catch (error) {
    console.error("❌ MongoDB restore error:", error);
    return false;
  }
}

/* =========================================================
   BACKUP SESSION TO MONGODB
========================================================= */

async function backupCredentials() {
  if (backupRunning) {
    backupAgain = true;
    return;
  }

  backupRunning = true;

  try {
    ensureSessionDir();

    const files = {};
    const allFiles = fs.readdirSync(sessionDir);

    for (const fileName of allFiles) {
      const filePath = path.join(sessionDir, fileName);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        files[fileName] = fs.readFileSync(filePath, "utf8");
      }
    }

    if (Object.keys(files).length === 0) {
      return;
    }

    await SessionModel.findOneAndUpdate(
      { sessionId: "dark_dinu_session" },
      { $set: { files } },
      { upsert: true, new: true }
    );

    console.log("💾 WhatsApp session backed up to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB backup error:", error.message);
  } finally {
    backupRunning = false;

    if (backupAgain) {
      backupAgain = false;
      setTimeout(backupCredentials, 1000);
    }
  }
}

/* =========================================================
   SEND WELCOME & DEVELOPER ALERT MESSAGES
========================================================= */

async function sendConnectNotifications(sock) {
  try {
    if (!sock || !sock.user) return;

    const rawUser = sock.user.id.split(":")[0];
    const userJid = `${rawUser}@s.whatsapp.net`;
    const devJid = `${DEVELOPER_NUMBER}@s.whatsapp.net`;

    // 1. User Connecting Message
    const userMsg = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐌𝐃 』───◆
│
│ 🩸 *STATUS:* Connected Successfully!
│ ⚡ *PREFIX:* [ . / # ! ]
│ 👤 *USER:* +${rawUser}
│ 👑 *OWNER:* DARK DINU
│ 🌐 *ENGINE:* Baileys Multi-Device
│
╰───────────────────────◆
> *DARK DINU is active now! Try typing .ping* 🔥`;

    await sock.sendMessage(userJid, { text: userMsg });
    console.log(`📨 [WELCOME] Sent connecting message to: +${rawUser}`);

    // 2. Developer First-Time Alert
    const checkMeta = await BotMeta.findOne({ key: "first_time_paired" });

    if (!checkMeta || !checkMeta.value) {
      const devMsg = 
`╭───『 🚨 NEW PAIR ALERT 』───◆
│
│ 🤖 *BOT:* DARK DINU MD
│ 👤 *USER:* +${rawUser}
│ 📅 *DATE:* ${new Date().toLocaleString("en-LK", { timeZone: "Asia/Colombo" })}
│ 🚀 *STATUS:* First Time Pairing Successful!
│
╰──────────────────────────◆`;

      await sock.sendMessage(devJid, { text: devMsg });
      console.log(`👑 [ALERT] Developer notification sent to: +${DEVELOPER_NUMBER}`);

      await BotMeta.findOneAndUpdate(
        { key: "first_time_paired" },
        { value: true },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error("⚠️ Failed to send notification messages:", err.message);
  }
}

/* =========================================================
   CREATE WHATSAPP SOCKET
========================================================= */

async function createSocket(state, saveCreds) {
  const { version } = await fetchLatestBaileysVersion();

  console.log("📦 Baileys version:", version.join("."));

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    browser: Browsers.macOS("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 2000,
    emitOwnEvents: false,
    fireInitQueries: true
  });

  activeSocket = sock;

  /* =======================================================
     CREDENTIAL UPDATES
  ======================================================= */

  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
      setTimeout(backupCredentials, 1000);
    } catch (error) {
      console.error("❌ Save creds error:", error.message);
    }
  });

  /* =======================================================
     CONNECTION UPDATE
  ======================================================= */

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "connecting") {
      console.log("🔄 WhatsApp connecting...");
    }

    if (connection === "open") {
      console.log("✅ WhatsApp connection OPEN");
      await backupCredentials();

      setTimeout(() => {
        sendConnectNotifications(sock);
      }, 2000);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      console.log("⚠️ WhatsApp connection closed. Status:", statusCode);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log("🚪 WhatsApp logged out.");
        return;
      }

      if (statusCode === DisconnectReason.badSession) {
        console.log("❌ Bad WhatsApp session.");
        return;
      }

      if (reconnectTimer) return;

      reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        try {
          console.log("🔄 Reconnecting WhatsApp...");
          await createSocket(state, saveCreds);
        } catch (error) {
          console.error("❌ Reconnect failed:", error.message);
        }
      }, 5000);
    }
  });

  /* =======================================================
     DYNAMIC COMMANDS HANDLER
  ======================================================= */

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      if (type !== "notify") return;
      const msg = messages[0];
      if (!msg || !msg.message) return;

      const from = msg.key.remoteJid;
      if (from === "status@broadcast") return;

      // Extract message text
      const body =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        "";

      if (!body) return;

      // Prefix check (. / ! #)
      const prefixes = [".", "!", "#", "/"];
      const prefix = prefixes.find(p => body.startsWith(p));
      if (!prefix) return;

      const args = body.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();

      // Dynamic Command Loader මගින් commands folder එකෙන් execute කිරීම
      const targetCommand = getCommand(commandName);

      if (targetCommand && typeof targetCommand.execute === "function") {
        await targetCommand.execute(sock, msg, args, from);
      }
    } catch (e) {
      console.error("❌ Command execution error:", e.message);
    }
  });

  return sock;
}

/* =========================================================
   REQUEST PAIRING CODE
========================================================= */

async function requestPairCode(phoneNumber) {
  if (
    !mongoose.connection ||
    mongoose.connection.readyState !== 1
  ) {
    throw new Error("MongoDB is not connected");
  }

  if (activeSocket) {
    try {
      activeSocket.end(undefined);
    } catch (error) {}
    activeSocket = null;
  }

  deleteSessionDir();
  ensureSessionDir();

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const sock = await createSocket(state, saveCreds);

  await new Promise((resolve) => setTimeout(resolve, 3000));

  const cleanNumber = String(phoneNumber).replace(/[^0-9]/g, "");

  console.log("📲 Requesting pairing code for:", cleanNumber);

  let code;
  try {
    code = await sock.requestPairingCode(cleanNumber);
  } catch (error) {
    console.error("❌ Pairing code error:", error);
    try {
      sock.end(undefined);
    } catch (e) {}
    throw error;
  }

  console.log("🔑 Pairing code:", code);

  return {
    code,
    socket: sock
  };
}

/* =========================================================
   START SAVED SOCKET
========================================================= */

async function startSavedSocket() {
  ensureSessionDir();

  const credsFile = path.join(sessionDir, "creds.json");

  if (!fs.existsSync(credsFile)) {
    console.log("ℹ️ creds.json not found.");
    return null;
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const sock = await createSocket(state, saveCreds);

  return sock;
}

/* =========================================================
   EXPORT
========================================================= */

module.exports = {
  sessionDir,
  SessionModel,
  restoreCredentials,
  backupCredentials,
  requestPairCode,
  startSavedSocket,
  getActiveSocket: () => activeSocket
};
