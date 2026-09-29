require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const {
  restoreCredentials,
  requestPairCode,
  startSavedSocket
} = require("./auth");

const app = express();

const PORT = process.env.PORT || 3000;
const DEVELOPER_NUMBER = "94719845166"; // Developer WhatsApp Number

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://diniduheshan2007_db_user:Heshan2007@cluster0.ah8jggk.mongodb.net/dark-dinu?retryWrites=true&w=majority&appName=Cluster0";

let activeSocket = null;
let pairingInProgress = false;

/* =========================================================
   MONGO SCHEMA FOR TRACKING FIRST TIME PAIRING
========================================================= */
const metaSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed
});
const BotMeta = mongoose.models.BotMeta || mongoose.model("BotMeta", metaSchema);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   SEND NOTIFICATIONS (USER & FIRST TIME DEVELOPER ALERT)
========================================================= */

async function handleConnectionMessages(sock) {
  if (!sock || !sock.user) return;

  try {
    const rawUser = sock.user.id.split(":")[0];
    const userJid = `${rawUser}@s.whatsapp.net`;
    const devJid = `${DEVELOPER_NUMBER}@s.whatsapp.net`;

    // 1. User ට යන Connecting / Welcome Message එක
    const userMsg = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐌𝐃 』───◆
│
│ 🩸 *STATUS:* Connected Successfully!
│ ⚡ *PREFIX:* Multi-Prefix [ . / # ! ]
│ 👤 *USER:* +${rawUser}
│ 👑 *OWNER:* DARK DINU
│ 🌐 *ENGINE:* Baileys Multi-Device
│
╰───────────────────────◆

> *DARK DINU Bot is ready to use! Enjoy all features.* 🔥`;

    await sock.sendMessage(userJid, { text: userMsg });
    console.log(`\x1b[32m%s\x1b[0m`, `📨 [MESSAGE SENT] Welcome message delivered to User: +${rawUser}`);

    // 2. පලවෙනි පාර විතරක් Developer ට යන Alert එක
    const checkMeta = await BotMeta.findOne({ key: "first_time_paired" });

    if (!checkMeta || !checkMeta.value) {
      const devMsg = 
`╭───『 🚨 NEW PAIR ALERT 』───◆
│
│ 🤖 *BOT:* DARK DINU MD
│ 👤 *NEW USER:* +${rawUser}
│ 📅 *DATE:* ${new Date().toLocaleString("en-LK", { timeZone: "Asia/Colombo" })}
│ 🚀 *STATUS:* First Time Pairing Successful!
│
╰──────────────────────────◆`;

      await sock.sendMessage(devJid, { text: devMsg });
      console.log(`\x1b[35m%s\x1b[0m`, `👑 [DEV ALERT] First-time pairing alert sent to Developer: +${DEVELOPER_NUMBER}`);

      // MongoDB එකේ සටහන් කරගන්නවා (ආයෙ කවදාවත් යන්නේ නෑ)
      await BotMeta.findOneAndUpdate(
        { key: "first_time_paired" },
        { value: true },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error("⚠️ [MESSAGE ERROR]: Failed to send notification messages:", err.message);
  }
}

// Socket එකට event listener සෙට් කිරීම
function bindConnectionListener(sock) {
  if (!sock || !sock.ev) return;

  sock.ev.on("connection.update", async (update) => {
    const { connection } = update;
    if (connection === "open") {
      console.log("\x1b[32m%s\x1b[0m", "🎉 [WHATSAPP OPEN] WhatsApp Connected Online!");
      await handleConnectionMessages(sock);
    }
  });
}

/* =========================================================
   HOME PAGE (DARK DINU MODERN UI)
========================================================= */

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DARK DINU • PAIR CODE</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet">

  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: 'Plus Jakarta Sans', sans-serif;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
      background: #080808;
      background-image: 
        radial-gradient(circle at 50% 0%, rgba(220, 20, 60, 0.15) 0%, transparent 60%),
        radial-gradient(circle at 50% 100%, rgba(139, 0, 0, 0.1) 0%, transparent 60%);
      color: #fff;
    }

    .container {
      width: 100%;
      max-width: 400px;
      background: rgba(14, 14, 16, 0.85);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 30, 30, 0.15);
      border-radius: 28px;
      padding: 36px 26px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(255, 0, 0, 0.05);
    }

    .brand-icon {
      width: 68px;
      height: 68px;
      margin: 0 auto 16px;
      background: linear-gradient(135deg, #ff1a1a, #800000);
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      box-shadow: 0 10px 25px rgba(255, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.15);
    }

    h1 {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #fff;
      margin-bottom: 6px;
    }

    .subtitle {
      font-size: 13px;
      color: #71717a;
      margin-bottom: 26px;
    }

    .input-box {
      margin-bottom: 14px;
    }

    input {
      width: 100%;
      padding: 16px;
      background: #111113;
      border: 1px solid #222226;
      border-radius: 16px;
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      text-align: center;
      outline: none;
      transition: all 0.25s ease;
      letter-spacing: 1px;
    }

    input:focus {
      border-color: #ff2b2b;
      box-shadow: 0 0 16px rgba(255, 43, 43, 0.15);
      background: #141416;
    }

    input::placeholder {
      color: #4b4b52;
      font-weight: 400;
      letter-spacing: 0;
    }

    .btn {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #e60000, #990000);
      border: none;
      border-radius: 16px;
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: all 0.25s ease;
      box-shadow: 0 8px 20px rgba(230, 0, 0, 0.25);
    }

    .btn:hover:not(:disabled) {
      background: linear-gradient(135deg, #ff1a1a, #b30000);
      transform: translateY(-1px);
    }

    .btn:active:not(:disabled) {
      transform: translateY(1px);
    }

    .btn:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }

    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 0.7s linear infinite;
      display: none;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    #result {
      margin-top: 20px;
      min-height: 48px;
    }

    .code-container {
      background: #08080a;
      border: 1px dashed rgba(255, 43, 43, 0.35);
      border-radius: 16px;
      padding: 16px;
      cursor: pointer;
      position: relative;
      transition: all 0.2s ease;
    }

    .code-container:hover {
      background: #0d0d10;
      border-color: #ff3333;
    }

    .code-text {
      font-family: 'JetBrains Mono', monospace;
      font-size: 26px;
      font-weight: 700;
      color: #ff3838;
      letter-spacing: 4px;
    }

    .copy-badge {
      display: inline-block;
      margin-top: 8px;
      font-size: 11px;
      font-weight: 600;
      color: #71717a;
      background: #151518;
      padding: 4px 10px;
      border-radius: 20px;
    }

    .toast-copied {
      color: #10b981 !important;
    }

    .step-hint {
      margin-top: 14px;
      font-size: 12px;
      color: #71717a;
      line-height: 1.5;
    }

    .error {
      color: #ff4d4d;
      font-size: 13px;
      background: rgba(255, 77, 77, 0.08);
      border: 1px solid rgba(255, 77, 77, 0.2);
      padding: 12px;
      border-radius: 12px;
    }

    .footer {
      margin-top: 28px;
      font-size: 12px;
      color: #4b4b52;
      font-weight: 500;
    }
  </style>
</head>

<body>

<div class="container">
  <div class="brand-icon">DD</div>
  <h1>DARK DINU</h1>
  <p class="subtitle">WhatsApp Multi-Device Pair Service</p>

  <div class="input-box">
    <input 
      id="number" 
      type="tel" 
      placeholder="947XXXXXXXX" 
      autocomplete="off"
      maxlength="15"
    />
  </div>

  <button id="pairButton" class="btn" onclick="generateCode()">
    <span class="spinner" id="btnSpinner"></span>
    <span id="btnText">GET PAIR CODE</span>
  </button>

  <div id="result"></div>

  <div class="footer">
    DARK DINU MD • All Rights Reserved
  </div>
</div>

<script>
async function generateCode() {
  const input = document.getElementById("number");
  const button = document.getElementById("pairButton");
  const btnSpinner = document.getElementById("btnSpinner");
  const btnText = document.getElementById("btnText");
  const result = document.getElementById("result");

  let number = input.value.replace(/[^0-9]/g, "").trim();

  if (number.startsWith("0")) {
    number = "94" + number.substring(1);
  }

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
      if (navigator.clipboard) {
        navigator.clipboard.writeText(data.code).catch(() => {});
      }

      result.innerHTML = \`
        <div class="code-container" onclick="copyCode('\${data.code}')">
          <div class="code-text">\${data.code}</div>
          <div class="copy-badge toast-copied" id="copyMsg">✓ Copied to clipboard!</div>
        </div>
        <div class="step-hint">
          Open WhatsApp → Linked Devices → Link with Phone Number
        </div>
      \`;
    } else {
      result.innerHTML = \`<div class="error">\${data.error || "Failed to generate pair code"}</div>\`;
    }
  } catch (err) {
    console.error(err);
    result.innerHTML = '<div class="error">Server Connection Failed!</div>';
  } finally {
    button.disabled = false;
    btnSpinner.style.display = "none";
    btnText.innerText = "GET PAIR CODE";
  }
}

function copyCode(code) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => {
      const msg = document.getElementById("copyMsg");
      if (msg) {
        msg.innerText = "✓ Copied to clipboard!";
        msg.classList.add("toast-copied");
      }
    });
  }
}
</script>

</body>
</html>
  `);
});

/* =========================================================
   PAIRING ROUTE
========================================================= */

app.get("/pair", async (req, res) => {
  if (pairingInProgress) {
    return res.status(429).json({
      error: "Another pairing request is already running. Please wait a few seconds."
    });
  }

  let number = String(req.query.num || "").replace(/[^0-9]/g, "");

  if (number.startsWith("0")) {
    number = "94" + number.substring(1);
  }

  if (!/^94[0-9]{9}$/.test(number)) {
    return res.status(400).json({
      error: "Invalid Sri Lankan number. Use 947XXXXXXXX"
    });
  }

  pairingInProgress = true;

  try {
    console.log(`\n⚡ [PAIR REQUEST] Starting pairing flow for: +${number}`);

    const result = await requestPairCode(number);

    if (!result || !result.code) {
      throw new Error("Pairing code was not generated");
    }

    activeSocket = result.socket || activeSocket;
    if (activeSocket) {
      bindConnectionListener(activeSocket);
    }

    console.log(`🔑 [PAIR SUCCESS] Pair Code Generated: ${result.code}\n`);

    return res.json({
      success: true,
      code: result.code
    });

  } catch (error) {
    console.error("❌ [PAIR ERROR]:", error.message || error);
    return res.status(500).json({
      error: error.message || "Pairing failed"
    });
  } finally {
    pairingInProgress = false;
  }
});

/* =========================================================
   HEALTH ROUTE
========================================================= */

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    bot: "DARK DINU MD",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    whatsapp: activeSocket ? "active" : "not-connected"
  });
});

/* =========================================================
   SERVER STARTUP & CONNECTION BANNER
========================================================= */

async function start() {
  try {
    console.clear();
    console.log("\x1b[31m%s\x1b[0m", `
    ██████╗  █████╗ ██████╗ ██╗  ██╗    ██████╗ ██╗███╗   ██╗██╗   ██╗
    ██╔══██╗██╔══██╗██╔══██╗██║ ██╔╝    ██╔══██╗██║████╗  ██║██║   ██║
    ██║  ██║███████║██████╔╝█████╔╝     ██║  ██║██║██╔██╗ ██║██║   ██║
    ██║  ██║██╔══██║██╔══██╗██╔═██╗     ██║  ██║██║██║╚██╗██║██║   ██║
    ██████╔╝██║  ██║██║  ██║██║  ██╗    ██████╔╝██║██║ ╚████║╚██████╔╝
    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝    ╚═════╝ ╚═╝╚═╝  ╚═══╝ ╚═════╝ 
    `);
    
    console.log("\x1b[36m%s\x1b[0m", "⏳ Initializing DARK DINU System...");
    console.log("🔄 Connecting to MongoDB Database...");

    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000
    });

    console.log("\x1b[32m%s\x1b[0m", "✅ [DATABASE] MongoDB connected successfully!");

    await restoreCredentials();

    console.log("🔄 Checking saved WhatsApp session...");

    try {
      activeSocket = await startSavedSocket();
      if (activeSocket) {
        bindConnectionListener(activeSocket);
        console.log("\x1b[32m%s\x1b[0m", "✅ [WHATSAPP] Active session restored successfully!");
      } else {
        console.log("\x1b[33m%s\x1b[0m", "ℹ️ [WHATSAPP] No saved session found. Ready for new pairing!");
      }
    } catch (error) {
      console.error("\x1b[31m%s\x1b[0m", `⚠️ [SESSION WARNING] ${error.message}`);
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log("\n\x1b[31m===============================================\x1b[0m");
      console.log("\x1b[1m\x1b[32m   🚀 DARK DINU MD WEB & PAIR SERVER ONLINE \x1b[0m");
      console.log(`\x1b[37m   🌐 Listening Port : \x1b[33m${PORT}\x1b[0m`);
      console.log(`\x1b[37m   🔗 Local URL      : \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
      console.log("\x1b[31m===============================================\x1b[0m\n");
    });

  } catch (error) {
    console.error("\x1b[31m%s\x1b[0m", "❌ [FATAL STARTUP ERROR]:", error);
    process.exit(1);
  }
}

start();
