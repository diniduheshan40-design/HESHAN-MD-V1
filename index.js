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
const DEVELOPER_NUMBER = "94719845166"; // Developer Number

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
      delete require.cache[require.resolve(fullPath)]; // Live reload cache bust
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

  // 1. Connection Update (Connecting & Dev Alert)
  sock.ev.on("connection.update", async (update) => {
    const { connection } = update;

    if (connection === "open") {
      console.log("\x1b[32m%s\x1b[0m", "🎉 [DARK DINU] WhatsApp Connected Successfully!");

      setTimeout(async () => {
        try {
          if (!sock.user) return;
          const rawUser = sock.user.id.split(":")[0];
          const userJid = `${rawUser}@s.whatsapp.net`;
          const devJid = `${DEVELOPER_NUMBER}@s.whatsapp.net`;

          // User Connecting Message
          const userMsg = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐌𝐃 』───◆
│
│ 🩸 *STATUS:* Connected Successfully!
│ ⚡ *PREFIX:* [ . / # ! ]
│ 👤 *USER:* +${rawUser}
│ 👑 *OWNER:* DARK DINU
│
╰───────────────────────◆
> *DARK DINU is active! Type .ping* 🔥`;

          await sock.sendMessage(userJid, { text: userMsg });
          console.log(`📨 [MESSAGE] Welcome message sent to User: +${rawUser}`);

          // Developer First Time Alert
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
            console.log(`👑 [ALERT] Sent first-time alert to Developer!`);
          }
        } catch (err) {
          console.error("Connection message error:", err.message);
        }
      }, 2000);
    }
  });

  // 2. Message & Commands Listener
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      if (type !== "notify") return;
      const msg = messages[0];
      if (!msg || !msg.message) return;

      const from = msg.key.remoteJid;
      if (from === "status@broadcast") return;

      const body =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        "";

      if (!body) return;

      const prefixes = [".", "!", "#", "/"];
      const prefix = prefixes.find(p => body.startsWith(p));
      if (!prefix) return;

      const args = body.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();

      // Dynamic Command Call
      const targetCommand = getCommand(commandName);
      if (targetCommand && typeof targetCommand.execute === "function") {
        await targetCommand.execute(sock, msg, args, from);
      }
    } catch (e) {
      console.error("Command execution error:", e.message);
    }
  });
}

// Socket එක හැදෙන හැමවිටම initBot එක auto call වෙනවා
onSocketCreated((sock) => {
  initBot(sock);
});

/* =========================================================
   WEB PAIRING UI
========================================================= */

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DARK DINU • PAIR CODE</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; font-family:'Plus Jakarta Sans',sans-serif; }
    body { min-height:100vh; display:flex; justify-content:center; align-items:center; padding:20px; background:#080808; background-image:radial-gradient(circle at 50% 0%, rgba(220,20,60,0.15) 0%, transparent 60%); color:#fff; }
    .container { width:100%; max-width:400px; background:rgba(14,14,16,0.85); backdrop-filter:blur(16px); border:1px solid rgba(255,30,30,0.15); border-radius:28px; padding:36px 26px; text-align:center; box-shadow:0 25px 50px -12px rgba(0,0,0,0.7); }
    .brand-icon { width:68px; height:68px; margin:0 auto 16px; background:linear-gradient(135deg, #ff1a1a, #800000); border-radius:20px; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:800; box-shadow:0 10px 25px rgba(255,0,0,0.35); }
    h1 { font-size:24px; font-weight:800; margin-bottom:6px; }
    .subtitle { font-size:13px; color:#71717a; margin-bottom:26px; }
    input { width:100%; padding:16px; background:#111113; border:1px solid #222226; border-radius:16px; color:#fff; font-size:16px; font-weight:600; text-align:center; outline:none; margin-bottom:14px; }
    input:focus { border-color:#ff2b2b; }
    .btn { width:100%; padding:16px; background:linear-gradient(135deg, #e60000, #990000); border:none; border-radius:16px; color:#fff; font-size:14px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; }
    .btn:disabled { opacity:0.65; cursor:not-allowed; }
    .spinner { width:18px; height:18px; border:2px solid rgba(255,255,255,0.3); border-radius:50%; border-top-color:#fff; animation:spin 0.7s linear infinite; display:none; }
    @keyframes spin { to { transform:rotate(360deg); } }
    #result { margin-top:20px; min-height:48px; }
    .code-container { background:#08080a; border:1px dashed rgba(255,43,43,0.35); border-radius:16px; padding:16px; cursor:pointer; }
    .code-text { font-family:'JetBrains Mono',monospace; font-size:26px; font-weight:700; color:#ff3838; letter-spacing:4px; }
    .copy-badge { display:inline-block; margin-top:8px; font-size:11px; font-weight:600; color:#10b981; background:#151518; padding:4px 10px; border-radius:20px; }
    .error { color:#ff4d4d; font-size:13px; padding:12px; }
  </style>
</head>
<body>
<div class="container">
  <div class="brand-icon">DD</div>
  <h1>DARK DINU</h1>
  <p class="subtitle">WhatsApp Multi-Device Pair Service</p>
  <input id="number" type="tel" placeholder="947XXXXXXXX" autocomplete="off" />
  <button id="pairButton" class="btn" onclick="generateCode()">
    <span class="spinner" id="btnSpinner"></span>
    <span id="btnText">GET PAIR CODE</span>
  </button>
  <div id="result"></div>
</div>
<script>
async function generateCode() {
  const input = document.getElementById("number");
  const button = document.getElementById("pairButton");
  const btnSpinner = document.getElementById("btnSpinner");
  const btnText = document.getElementById("btnText");
  const result = document.getElementById("result");

  let number = input.value.replace(/[^0-9]/g, "").trim();
  if (number.startsWith("0")) number = "94" + number.substring(1);
  if (!/^94[0-9]{9}$/.test(number)) {
    result.innerHTML = '<div class="error">Invalid number! Use: 947XXXXXXXX</div>';
    return;
  }

  button.disabled = true;
  btnSpinner.style.display = "inline-block";
  btnText.innerText = "GENERATING...";
  result.innerHTML = "";

  try {
    const res = await fetch("/pair?num=" + encodeURIComponent(number));
    const data = await res.json();
    if (data.code) {
      if (navigator.clipboard) navigator.clipboard.writeText(data.code).catch(()=>{});
      result.innerHTML = '<div class="code-container" onclick="navigator.clipboard.writeText(\\'' + data.code + '\\')"><div class="code-text">' + data.code + '</div><div class="copy-badge">✓ Auto-Copied!</div></div>';
    } else {
      result.innerHTML = '<div class="error">' + (data.error || "Failed") + '</div>';
    }
  } catch (err) {
    result.innerHTML = '<div class="error">Server Connection Failed!</div>';
  } finally {
    button.disabled = false;
    btnSpinner.style.display = "none";
    btnText.innerText = "GET PAIR CODE";
  }
}
</script>
</body>
</html>
  `);
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

async function start() {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 30000 });
    console.log("\x1b[32m%s\x1b[0m", "✅ [DATABASE] MongoDB connected!");

    await restoreCredentials();
    activeSocket = await startSavedSocket();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 DARK DINU ONLINE ON PORT: ${PORT}`);
    });
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
}

start();
