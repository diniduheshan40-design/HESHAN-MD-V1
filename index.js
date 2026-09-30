require("dotenv").config();

// Process crash වීම වැළැක්වීමේ Handlers
process.on("uncaughtException", (err) => {
  console.error("⚠️ Caught Exception:", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("⚠️ Unhandled Rejection:", reason);
});

// Config File Loader
let botConfig = {};
try {
  botConfig = require("./config");
} catch (e) {
  botConfig = {};
}

const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const axios = require("axios");

const {
  restoreCredentials,
  requestPairCode,
  startSavedSocket,
  onSocketCreated
} = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;

// Developer Configuration
const DEVELOPER_NAME = "DINIDU HESHAN";
const DEVELOPER_NUMBER = "94719845166";
const DEVELOPER_LID = "15947733680169";

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://diniduheshan2007_db_user:SZD7sfcIU6Einajx@cluster0.ah8jggk.mongodb.net/dark-dinu?retryWrites=true&w=majority&appName=Cluster0";

const commandsDir = path.resolve(__dirname, "commands");
if (!fs.existsSync(commandsDir)) {
  fs.mkdirSync(commandsDir, { recursive: true });
}

let activeSocket = null;
let pairingInProgress = false;

// Global Interactive Sessions & Status React Map
if (!global.songSessions) global.songSessions = new Map();
if (!global.tiktokSessions) global.tiktokSessions = new Map();
if (!global.fbSessions) global.fbSessions = new Map();
if (!global.videoSessions) global.videoSessions = new Map();
if (!global.statusReactMap) global.statusReactMap = new Map();

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
   COMMAND LOADER & CACHE SYSTEM
========================================================= */

const commands = new Map();
const aliases = new Map();

function loadCommands() {
  commands.clear();
  aliases.clear();

  try {
    if (!fs.existsSync(commandsDir)) {
      fs.mkdirSync(commandsDir, { recursive: true });
    }

    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith(".js"));
    console.log(`\x1b[36m%s\x1b[0m`, `📂 [LOADER] Scanning folder: Found ${files.length} command files.`);

    for (const file of files) {
      const fullPath = path.join(commandsDir, file);
      try {
        delete require.cache[require.resolve(fullPath)];
        const cmd = require(fullPath);

        if (cmd && cmd.name) {
          const name = cmd.name.toLowerCase().trim();
          commands.set(name, cmd);

          if (Array.isArray(cmd.alias)) {
            cmd.alias.forEach(a => aliases.set(a.toLowerCase().trim(), name));
          }
          console.log(`\x1b[32m%s\x1b[0m`, `   ├ ⚡ Registered: .${name}`);
        }
      } catch (err) {
        console.error(`\x1b[31m%s\x1b[0m`, `   ❌ Error reading ${file}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error("❌ Loader directory error:", err.message);
  }
}

loadCommands();

function getCommand(cmdName) {
  const name = cmdName.toLowerCase().trim();
  if (commands.has(name)) return commands.get(name);
  if (aliases.has(name)) return commands.get(aliases.get(name));
  return null;
}

/* =========================================================
   SAFE MESSAGE TEXT PARSER
========================================================= */

function extractMessageBody(msg) {
  if (!msg || !msg.message) return "";
  let m = msg.message;

  if (m.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessage) m = m.viewOnceMessage.message;
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
  if (m.editedMessage) m = m.editedMessage.message?.protocolMessage?.editedMessage || m.editedMessage;

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId ||
    ""
  ).trim();
}

/* =========================================================
   BOT EVENTS (CONNECTING NOTIFICATIONS & COMMANDS)
========================================================= */

function initBot(sock) {
  if (!sock || !sock.ev) return;
  activeSocket = sock;

  sock.ev.on("connection.update", async (update) => {
    const { connection } = update;

    if (connection === "open") {
      console.log("\x1b[32m%s\x1b[0m", "🎉 [DARK DINU] WhatsApp Connected Successfully!");

      setTimeout(async () => {
        try {
          if (!sock.user) return;

          const rawUser = (sock.user.id || "").split(":")[0].replace(/[^0-9]/g, "");
          const userJid = `${rawUser}@s.whatsapp.net`;
          const devJid = `${DEVELOPER_NUMBER}@s.whatsapp.net`;

          const userMsg = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐌𝐃 』───◆
│
│ 🩸 *STATUS:* Connected Successfully!
│ ⚡ *PREFIX:* [ . / # ! ]
│ 👤 *USER:* +${rawUser}
│ 👑 *DEVELOPER:* ${DEVELOPER_NAME}
│ 📞 *DEV CONTACT:* +${DEVELOPER_NUMBER}
│ 🌐 *ENGINE:* Baileys 24/7 Engine
│
╰───────────────────────◆
> *DARK DINU is active! Type .ping to test speed.* 🔥`;

          await sock.sendMessage(userJid, { text: userMsg });

          const checkMeta = await BotMeta.findOne({ key: "first_time_paired" });
          if (!checkMeta || !checkMeta.value) {
            const devMsg = 
`╭───『 🚨 NEW PAIR ALERT 』───◆
│
│ 🤖 *BOT:* DARK DINU MD
│ 👤 *NEW USER:* +${rawUser}
│ 👑 *DEV:* ${DEVELOPER_NAME}
│ 📅 *DATE:* ${new Date().toLocaleString("en-LK", { timeZone: "Asia/Colombo" })}
│ 🚀 *STATUS:* First Time Pairing Successful!
│
╰──────────────────────────◆`;

            await sock.sendMessage(devJid, { text: devMsg });
            await BotMeta.findOneAndUpdate(
              { key: "first_time_paired" },
              { value: true },
              { upsert: true }
            );
          }
        } catch (err) {
          console.error("⚠️ Connection message error:", err.message);
        }
      }, 2500);
    }
  });

  sock.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      if (!chatUpdate.messages || chatUpdate.messages.length === 0) return;
      const msg = chatUpdate.messages[0];
      if (!msg || !msg.message) return;

      const from = msg.key.remoteJid;
      if (!from) return;

      // Status Auto Seen & Auto React
      if (from === "status@broadcast") {
        try {
          await sock.readMessages([msg.key]);

          const senderJid = msg.key.participant || msg.participant;
          const currentBotNumber = (sock.user?.id || "").split(":")[0].replace(/[^0-9]/g, "");

          if (currentBotNumber && senderJid) {
            let botEmoji = global.statusReactMap?.get(currentBotNumber);

            if (!botEmoji) {
              const savedMeta = await BotMeta.findOne({ key: `status_react_${currentBotNumber}` });
              botEmoji = savedMeta ? savedMeta.value : "💚";
              global.statusReactMap.set(currentBotNumber, botEmoji);
            }

            if (botEmoji !== "off") {
              await sock.sendMessage(
                senderJid,
                { react: { text: botEmoji, key: msg.key } },
                { statusJidList: [senderJid] }
              );
            }
          }
        } catch (e) {}
        return;
      }

      if (msg.key.fromMe) return;

      const isGroup = from.endsWith("@g.us");
      const sender = isGroup ? msg.key.participant : from;
      const body = extractMessageBody(msg);
      if (!body) return;

      const reply = async (text) => {
        return await sock.sendMessage(from, { text: String(text) }, { quoted: msg });
      };

      const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
      const cleanBody = body.trim();

      const senderClean = String(sender || "").split("@")[0].replace(/[^0-9]/g, "");
      const isOwner = Boolean(
        senderClean === DEVELOPER_NUMBER ||
        senderClean === DEVELOPER_LID ||
        sender?.includes(DEVELOPER_NUMBER) ||
        sender?.includes(DEVELOPER_LID)
      );

      // Song Handler
      if (quotedMsgId && global.songSessions && global.songSessions.has(quotedMsgId)) {
        const session = global.songSessions.get(quotedMsgId);
        if (["1", "2", "3"].includes(cleanBody)) {
          await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
          try {
            if (cleanBody === "1") {
              await sock.sendMessage(from, { audio: { url: session.url }, mimetype: "audio/mp4", fileName: `${session.title}.mp3` }, { quoted: msg });
            } else if (cleanBody === "2") {
              await sock.sendMessage(from, { document: { url: session.url }, mimetype: "audio/mpeg", fileName: `${session.title}.mp3` }, { quoted: msg });
            } else if (cleanBody === "3") {
              await sock.sendMessage(from, { audio: { url: session.url }, mimetype: "audio/ogg; codecs=opus", ptt: true }, { quoted: msg });
            }
            await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
            return;
          } catch (e) {
            await reply("❌ Audio එක යැවීමේදී දෝෂයක් මතු විය.");
            return;
          }
        }
      }

      // TikTok Handler
      if (quotedMsgId && global.tiktokSessions && global.tiktokSessions.has(quotedMsgId)) {
        const ttSession = global.tiktokSessions.get(quotedMsgId);
        if (["1", "2", "3"].includes(cleanBody)) {
          await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
          try {
            if (cleanBody === "1") {
              const videoUrl = ttSession.hdVideo || ttSession.videoUrl;
              await sock.sendMessage(from, { video: { url: videoUrl }, caption: `🎬 *${ttSession.title}*\n⚡ HD Quality\n\n> *ᴅᴀʀᴋ ᴅɪɴᴜ ᴍᴅ 🐦‍🔥*`, mimetype: "video/mp4" }, { quoted: msg });
            } else if (cleanBody === "2") {
              const videoUrl = ttSession.sdVideo || ttSession.videoUrl;
              await sock.sendMessage(from, { video: { url: videoUrl }, caption: `🎬 *${ttSession.title}*\n⚡ SD Quality\n\n> *ᴅᴀʀᴋ ᴅɪɴᴜ ᴍᴅ 🐦‍🔥*`, mimetype: "video/mp4" }, { quoted: msg });
            } else if (cleanBody === "3") {
              if (ttSession.audioUrl) {
                await sock.sendMessage(from, { audio: { url: ttSession.audioUrl }, mimetype: "audio/ogg; codecs=opus", ptt: true }, { quoted: msg });
              }
            }
            await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
            return;
          } catch (e) {
            await reply("❌ TikTok බාගත කිරීමේ දෝෂයක් මතු විය.");
            return;
          }
        }
      }

      // Facebook Handler
      if (quotedMsgId && global.fbSessions && global.fbSessions.has(quotedMsgId)) {
        const fbSession = global.fbSessions.get(quotedMsgId);
        if (["1", "2", "3"].includes(cleanBody)) {
          await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
          try {
            if (cleanBody === "1") {
              await sock.sendMessage(from, { video: { url: fbSession.hd || fbSession.sd }, caption: `🎬 *${fbSession.title}*\n\n> *ᴅᴀʀᴋ ᴅɪɴᴜ ᴍᴅ 🐦‍🔥*` }, { quoted: msg });
            } else if (cleanBody === "2") {
              await sock.sendMessage(from, { video: { url: fbSession.sd || fbSession.hd }, caption: `🎬 *${fbSession.title}*\n\n> *ᴅᴀʀᴋ ᴅɪɴᴜ ᴍᴅ 🐦‍🔥*` }, { quoted: msg });
            } else if (cleanBody === "3") {
              await sock.sendMessage(from, { audio: { url: fbSession.audio || fbSession.sd }, mimetype: "audio/mp4", fileName: "audio.mp3" }, { quoted: msg });
            }
            await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
            return;
          } catch (e) {
            await reply("❌ FB Media යැවීමේදී දෝෂයක් මතු විය.");
            return;
          }
        }
      }

      // YouTube Video Selection Handler
      if (quotedMsgId && global.videoSessions && global.videoSessions.has(quotedMsgId)) {
        const vSession = global.videoSessions.get(quotedMsgId);
        const qualityMap = { "1": "1080p", "2": "720p", "3": "480p", "4": "360p" };

        if (qualityMap[cleanBody]) {
          const selectedQuality = qualityMap[cleanBody];
          await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
          try {
            const apiKey = "chama_api_ec9848130d1aea209f08fb85e0b4720f";
            const downloadApi = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(vSession.url)}&quality=${selectedQuality}&format=mp4&api_key=${apiKey}`;

            const qRes = await axios.get(downloadApi, { timeout: 45000 });
            const qData = qRes.data?.data || qRes.data;
            const finalDownloadUrl = qData?.download_url || qData?.direct_url;

            if (finalDownloadUrl) {
              await sock.sendMessage(from, {
                video: { url: finalDownloadUrl },
                caption: `🎬 *${vSession.title}*\n⚡ *Quality:* ${selectedQuality}\n\n> *ᴅᴀʀᴋ ᴅɪɴᴜ ᴍᴅ 🐦‍🔥*`,
                mimetype: "video/mp4"
              }, { quoted: msg });
              await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
              global.videoSessions.delete(quotedMsgId);
              return;
            }
          } catch (e) {
            await reply("❌ වීඩියෝව ලබාගත නොහැකි විය.");
            return;
          }
        }
      }

      // Command Execution
      const prefixes = [".", "!", "#", "/"];
      const prefix = prefixes.find(p => body.startsWith(p));
      if (!prefix) return;

      const args = body.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();
      if (!commandName) return;

      console.log(`⚡ [EXECUTE]: .${commandName} | From: ${from}`);
      const targetCommand = getCommand(commandName);

      if (targetCommand && typeof targetCommand.execute === "function") {
        try {
          await targetCommand.execute(sock, msg, args, from, {
            body,
            prefix,
            sender,
            isOwner,
            isGroup,
            reply,
            DEVELOPER_NAME,
            DEVELOPER_NUMBER,
            DEVELOPER_LID,
            botConfig
          });
        } catch (cmdErr) {
          console.error(`❌ Execution error in .${commandName}:`, cmdErr);
          await reply(`⚠️ Error executing *.${commandName}*:\n_${cmdErr.message}_`);
        }
      } else if (["ping", "speed", "p"].includes(commandName)) {
        try {
          await sock.sendMessage(from, { react: { text: "🚀", key: msg.key } });
          const start = Date.now();
          const latency = Date.now() - start;
          const sent = await sock.sendMessage(from, { 
            text: `⚡ *Pong!*\n⏱️ Latency: *${latency}ms*` 
          }, { quoted: msg });
          if (sent?.key) await sock.sendMessage(from, { react: { text: "⚡", key: sent.key } });
        } catch (e) {}
      }

    } catch (e) {
      console.error("❌ messages.upsert Error:", e);
    }
  });
}

onSocketCreated((sock) => {
  initBot(sock);
});

/* =========================================================
   WEB UI & PAIR SERVICE
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
    .footer { margin-top:24px; font-size:12px; color:#555; }
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
  <div class="footer">Dev: DINIDU HESHAN</div>
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
      resDiv.innerHTML = '<div class="error">' + (data.error || "Failed to get pairing code") + '</div>';
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

app.get("/pair", async (req, res) => {
  if (pairingInProgress) return res.status(429).json({ error: "Pairing in progress, please wait 10 seconds..." });

  let number = String(req.query.num || "").replace(/[^0-9]/g, "");
  if (number.startsWith("0")) number = "94" + number.substring(1);
  if (!/^94[0-9]{9}$/.test(number)) return res.status(400).json({ error: "Invalid Sri Lankan number format." });

  pairingInProgress = true;
  try {
    const result = await requestPairCode(number);
    return res.json({ success: true, code: result.code });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Pairing failed. Try again in 5 seconds." });
  } finally {
    setTimeout(() => { pairingInProgress = false; }, 3000);
  }
});

// Uptime Monitoring Endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "alive",
    bot: "DARK DINU MD",
    uptime: process.uptime(),
    activeSocket: activeSocket ? "connected" : "reconnecting"
  });
});

/* =========================================================
   24/7 SERVER START
========================================================= */

async function start() {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 DARK DINU RUNNING ON PORT: ${PORT}`);
  });

  const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (appUrl) {
    const targetPing = appUrl.endsWith("/") ? `${appUrl}health` : `${appUrl}/health`;
    console.log(`⏱️ Self Keep-Alive Scheduled: ${targetPing}`);

    setInterval(() => {
      const client = targetPing.startsWith("https") ? https : http;
      client.get(targetPing, (res) => {
        if (res.statusCode === 200) {}
      }).on("error", () => {});
    }, 4 * 60 * 1000);
  }

  try {
    console.log("🔄 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, { 
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000
    });
    console.log("\x1b[32m%s\x1b[0m", "✅ [DATABASE] MongoDB connected!");

    await restoreCredentials();
    const sock = await startSavedSocket();
    if (sock) {
      console.log("\x1b[32m%s\x1b[0m", "✅ [WHATSAPP] Active session restored!");
    } else {
      console.log("ℹ️ [WHATSAPP] Ready for new pairing!");
    }
  } catch (err) {
    console.error("Startup error:", err.message);
  }
}

start();
