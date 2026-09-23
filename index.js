const express = require("express");
const path = require("path");
const pino = require("pino");
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const { useMongoDBAuthState } = require("./auth");
const commands = require("./commands/general");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = "mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/HESHAN-MD?retryWrites=true&w=majority&appName=Cluster0";

app.use(express.static(path.join(__dirname, "public")));

let sock = null;
let saveCredsGlobal = null;

async function startBot() {
  const { state, saveCreds } = await useMongoDBAuthState(MONGO_URI);
  saveCredsGlobal = saveCreds;

  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("⚡ DARK DINU MD IS NOW CONNECTED!");
    } else if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("Connection closed. Reconnecting:", shouldReconnect);
      if (shouldReconnect) {
        startBot();
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    const prefix = ".";
    if (!body.startsWith(prefix)) return;

    const cmd = body.slice(prefix.length).trim().split(" ")[0].toLowerCase();

    if (cmd === "ping") {
      await commands.ping(sock, from, msg);
    } else if (cmd === "menu") {
      await commands.menu(sock, from, msg);
    }
  });
}

// Endpoint to request Pairing Code
app.get("/pair", async (req, res) => {
  const phone = req.query.number;
  if (!phone) {
    return res.status(400).json({ error: "Phone number is required." });
  }

  if (!sock) {
    return res.status(500).json({ error: "Socket not initialized yet." });
  }

  try {
    if (!sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(phone);
          return res.json({ code: code?.match(/.{1,4}/g)?.join("-") || code });
        } catch (e) {
          return res.status(500).json({ error: "Failed to generate pair code." });
        }
      }, 3000);
    } else {
      return res.json({ error: "Device is already paired. Session exists in MongoDB." });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startBot();
});

