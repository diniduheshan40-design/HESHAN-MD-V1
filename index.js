require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const {
  restoreCredentials,
  requestPairCode,
  startSavedSocket,
  onSocketCreated
} = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;
const DEVELOPER_NUMBER = "94719845166";

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://diniduheshan2007_db_user:Heshan2007@cluster0.ah8jggk.mongodb.net/dark-dinu?retryWrites=true&w=majority&appName=Cluster0";

const commandsDir = path.join(__dirname, "commands");
if (!fs.existsSync(commandsDir)) {
  fs.mkdirSync(commandsDir, { recursive: true });
}

let activeSocket = null;
let pairingInProgress = false;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   FIRST TIME PAIRING TRACKER (MONGODB)
========================================================= */

const MetaSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed
});
const BotMeta = mongoose.models.DarkDinuMeta || mongoose.model("DarkDinuMeta", MetaSchema);

/* =========================================================
   DYNAMIC COMMAND LOADER (Auto-Reload on Edit)
========================================================= */

function getCommand(cmdName) {
  try {
    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith(".js"));
    for (const file of files) {
      const fullPath = path.join(commandsDir, file);
      delete require.cache[require.resolve(fullPath)];
      const cmdObj = require(fullPath);

      if (cmdObj && cmdObj.name) {
        const isNameMatch = cmdObj.name.toLowerCase() === cmdName;
        const isAliasMatch = Array.isArray(cmdObj.alias) && cmdObj.alias.map(a => a.toLowerCase()).includes(cmdName);
        if (isNameMatch || isAliasMatch) return cmdObj;
      }
    }
  } catch (e) {
    console.error("Commands read error:", e.message);
  }
  return null;
}

/* =========================================================
   BOT EVENTS (COMMANDS & NOTIFICATIONS)
========================================================= */

function initBot(sock) {
  if (!sock || !sock.ev) return;

  sock.ev.on("connection.update", async (update) => {
    const { connection } = update;

    if (connection === "open") {
      console.log("\x1b[32m%s\x1b[0m", "🎉 [DARK DINU] WhatsApp Connected Online!");

      setTimeout(async () => {
        try {
          if (!sock.user) return;
          const rawUser = sock.user.id.split(":")[0];
          const userJid = `${rawUser}@s.whatsapp.net`;
          const devJid = `${DEVELOPER_NUMBER}@s.whatsapp.net`;

          const userMsg = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐌𝐃 』───◆
│
│ 🩸 *STATUS:* Connected Successfully!
│ ⚡ *PREFIX:* [ . / # ! ]
│ 👤 *USER:* +${rawUser}
│ 👑 *OWNER:* DARK DINU
│
╰───────────────────────◆
> *DARK DINU is active! Type .ping to test.* 🔥`;

          await sock.sendMessage(userJid, { text: userMsg });
          console.log(`📨 [WELCOME] Message sent to User: +${rawUser}`);

          const checkMeta = await BotMeta.findOne({ key: "first_time_paired" });
          if (!checkMeta || !checkMeta.value) {
            const devMsg = 
`╭───『 🚨 NEW PAIR ALERT 』───◆
│ 🤖 *BOT:* DARK DINU MD
│ 👤 *USER:* +${rawUser}
│ 📅 *DATE:* ${new Date().toLocaleString("en-LK", { timeZone: "Asia/Colombo" })}
╰──────────────────────────◆`;

            await sock.sendMessage(devJid, { text: devMsg });
            await BotMeta.findOneAndUpdate(
              { key: "first_time_paired" },
              { value: true },
              { upsert: true }
            );
            console.log("👑 [ALERT] Sent first-time alert to Developer!");
          }
        } catch (err) {
          console.error("Connection message error:", err.message);
        }
      }, 2500);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      const msg = messages[0];
      if (!msg || !msg.message) return;

      const from = msg.key.remoteJid;
      if (from === "status@broadcast") return;

      const messageContent = 
        msg.message.ephemeralMessage?.message ||
        msg.message.viewOnceMessageV2?.message ||
        msg.message.viewOnceMessage?.message ||
        msg.message;

      const body = (
        messageContent.conversation ||
        messageContent.extendedTextMessage?.text ||
        messageContent.imageMessage?.caption ||
        messageContent.videoMessage?.caption ||
        ""
      ).trim();

      if (!body) return;

      console.log(`📩 [INCOMING]: "${body}" from ${from}`);

      const prefixes = [".", "!", "#", "/"];
      const prefix = prefixes.find(p => body.startsWith(p));
      if (!prefix) return;

      const args = body.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();

      console.log(`⚡ [COMMAND TRIGGERED]: ${commandName}`);

      const targetCommand = getCommand(commandName);
      if (targetCommand && typeof targetCommand.execute === "function") {
        await targetCommand.execute(sock, msg, args, from);
      } else {
        console.log(`⚠️ Command not found: ${commandName}`);
      }
    } catch (e) {
      console.error("❌ Command execution error:", e.message);
    }
  });
}

onSocketCreated((sock) => {
  initBot(sock);
});

/* =========================================================
   WEB UI (SAFE NO ESCAPE ERROR)
========================================================= */

app.get("/", (req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DARK DINU • PAIR CODE</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; font-family:sans-serif; }
    body { min-height:100vh; display:flex; justify-content:center; align-items:center; padding:20px; background:#080808; color:#fff; }
    .container { width:100%; max-width:400px; background:#111114; border:1px solid rgba(255,30,30,0.25); border-radius:24px; padding:32px 24px; text-align:center; box-shadow:0 15px 35px rgba(0,0,0,0.7); }
    .brand-icon { width:64px; height:64px; margin:0 auto 16px; background:linear-gradient(135deg, #e60000, #800000); border-radius:18px; display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:bold; }
    h1 { font-size:22px; margin-bottom:6px; }
    .subtitle { font-size:13px; color:#888; margin-bottom:24px; }
    input { width:100%; padding:15px; background:#09090b; border:1px solid #27272a; border-radius:14px; color:#fff; font-size:16px; text-align:center; outline:none; margin-bottom:14px; }
    input:focus { border-color:#e60000; }
    .btn { width:100%; padding:15px; background:linear-gradient(135deg, #e60000, #990000); border:none; border-radius:14px; color:#fff; font-size:15px; font-weight:bold; cursor:pointer; }
    .btn:disabled { opacity:0.6; cursor:not-allowed; }
    #result { margin-top:20px; min-height:45px; }
    .code-box { background:#050505; border:1px dashed #e60000; border-radius:14px; padding:15px; cursor:pointer; }
    .code-text { font-size:26px; font-weight:bold; color:#ff3b3b; letter-spacing:4px; }
    .badge { display:inline-block; margin-top:8px; font-size:11px; color:#10b981; background:#18181b; padding:4px 10px; border-radius:20px; }
    .error { color:#ef4444; font-size:13px; padding:10px; }
  </style>
</head>
<body>
<div class="container">
  <div class="brand-icon">DD</div>
  <h1>DARK DINU</h1>
  <p class="subtitle">WhatsApp Multi-Device Pair Service</p>
  <input id="number" type="tel" placeholder="947XXXXXXXX" autocomplete="off" />
  <button id="pairBtn" class="btn" onclick="getCode()">GET PAIR CODE</button>
  <div id="result"></div>
</div>
<script>
async function getCode() {
  var input = document.getElementById("number");
  var btn = document.getElementById("pairBtn");
  var resDiv = document.getElementById("result");

  var num = input.value.replace(/[^0-9]/g, "").trim();
  if (num.startsWith("0")) num = "94" + num.substring(1);
  if (!/^94[0-9]{9}$/.test(num)) {
    resDiv.innerHTML = '<div class="error">Invalid number! Example: 947XXXXXXXX</div>';
    return;
  }

  btn.disabled = true;
  btn.innerText = "GENERATING...";
  resDiv.innerHTML = "";

  try {
    var res = await fetch("/pair?num=" + encodeURIComponent(num));
    var data = await res.json();
    if (data.code) {
      if (navigator.clipboard) navigator.clipboard.writeText(data.code).catch(function(){});
      resDiv.innerHTML = '<div class="code-box" onclick="navigator.clipboard.writeText(\\x27' + data.code + '\\x27)"><div class="code-text">' + data.code + '</div><div class="badge">✓ Auto-Copied to clipboard!</div></div>';
    } else {
      resDiv.innerHTML = '<div class="error">' + (data.error || "Failed") + '</div>';
    }
  } catch (err) {
    resDiv.innerHTML = '<div class="error">Server Connection Failed!</div>';
  } finally {
    btn.disabled = false;
    btn.innerText = "GET PAIR CODE";
  }
}
</script>
</body>
</html>`);
});

/* =========================================================
   ROUTES & SERVER START
========================================================= */

app.get("/pair", async (req, res) => {
  if (pairingInProgress) return res.status(429).json({ error: "Pairing in progress..." });

  let number = String(req.query.num || "").replace(/[^0-9]/g, "");
  if (number.startsWith("0")) number = "94" + number.substring(1);
  if (!/^94[0-9]{9}$/.test(number)) return res.status(400).json({ error: "Invalid Sri Lankan number" });

  pairingInProgress = true;
  try {
    const result = await requestPairCode(number);
    activeSocket = result.socket;
    return res.json({ success: true, code: result.code });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Pairing failed" });
  } finally {
    pairingInProgress = false;
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    bot: "DARK DINU MD",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    whatsapp: activeSocket ? "active" : "not-connected"
  });
});

async function start() {
  // Render Port එක කලින්ම Bind කර Express Run කරනවා
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 DARK DINU WEB SERVER RUNNING ON PORT: ${PORT}`);
  });

  try {
    console.log("🔄 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, { 
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000
    });
    console.log("\x1b[32m%s\x1b[0m", "✅ [DATABASE] MongoDB connected!");

    await restoreCredentials();
    activeSocket = await startSavedSocket();
    if (activeSocket) {
      console.log("\x1b[32m%s\x1b[0m", "✅ [WHATSAPP] Active session restored!");
    } else {
      console.log("ℹ️ [WHATSAPP] Ready for new pairing!");
    }
  } catch (err) {
    console.error("Startup error:", err.message);
  }
}

start();
