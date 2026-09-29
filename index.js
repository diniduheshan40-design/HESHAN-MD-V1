require("dotenv").config();

// Process crash වීම වැළැක්වීමේ Handlers
process.on("uncaughtException", (err) => {
  console.error("⚠️ Caught Exception:", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("⚠️ Unhandled Rejection:", reason);
});

// Config File Loader (OpenRouter & Logos)
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
const DEVELOPER_LID = "15947733680169"; // WhatsApp Linked ID (LID)

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://diniduheshan2007_db_user:Heshan2007@cluster0.ah8jggk.mongodb.net/dark-dinu?retryWrites=true&w=majority&appName=Cluster0";

const commandsDir = path.resolve(__dirname, "commands");
if (!fs.existsSync(commandsDir)) {
  fs.mkdirSync(commandsDir, { recursive: true });
}

let activeSocket = null;
let pairingInProgress = false;

// Global AI Auto-Reply State (Default: OFF)
global.aiAutoReply = false;

// Global Interactive Sessions (Song & TikTok)
if (!global.songSessions) {
  global.songSessions = new Map();
}
if (!global.tiktokSessions) {
  global.tiktokSessions = new Map();
}

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
   ROBUST COMMAND LOADER & CACHE SYSTEM
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
        } else {
          console.log(`\x1b[33m%s\x1b[0m`, `   ⚠️ Skipped ${file}: Missing 'name' property.`);
        }
      } catch (err) {
        console.error(`\x1b[31m%s\x1b[0m`, `   ❌ Error reading ${file}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error("❌ Loader directory error:", err.message);
  }
}

// Initial Load
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

  // 1. Connection Event: User & Developer Alerts
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
│ 🌐 *ENGINE:* Baileys Multi-Device
│
╰───────────────────────◆
> *DARK DINU is active! Type .ping to test speed.* 🔥`;

          await sock.sendMessage(userJid, { text: userMsg });
          console.log(`📨 [WELCOME] Message sent to User: +${rawUser}`);

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
            console.log(`👑 [ALERT] Sent first-time alert to Developer (${DEVELOPER_NAME}): +${DEVELOPER_NUMBER}`);
          }
        } catch (err) {
          console.error("⚠️ Connection message error:", err.message);
        }
      }, 2500);
    }
  });

  // 2. Incoming Messages Listener
  sock.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      if (!chatUpdate.messages || chatUpdate.messages.length === 0) return;
      const msg = chatUpdate.messages[0];
      if (!msg || !msg.message) return;

      const from = msg.key.remoteJid;
      if (!from || from === "status@broadcast") return;

      const isGroup = from.endsWith("@g.us");
      const botNumber = (sock.user?.id || "").split(":")[0].replace(/[^0-9]/g, "");
      const sender = msg.key.fromMe 
        ? `${botNumber}@s.whatsapp.net` 
        : (isGroup ? msg.key.participant : from);

      const body = extractMessageBody(msg);
      if (!body) return;

      const reply = async (text) => {
        return await sock.sendMessage(from, { text: String(text) }, { quoted: msg });
      };

      const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
      const cleanBody = body.trim();

      // =========================================================
      // DEVELOPER / OWNER PERMISSION CHECK
      // =========================================================
      const senderClean = String(sender || "").split("@")[0].replace(/[^0-9]/g, "");
      const isOwner = Boolean(
        msg.key.fromMe ||
        senderClean === DEVELOPER_NUMBER ||
        senderClean === DEVELOPER_LID ||
        sender?.includes(DEVELOPER_NUMBER) ||
        sender?.includes(DEVELOPER_LID)
      );

      // =========================================================
      // SONG SELECTION REPLY HANDLER (1: Audio, 2: Doc, 3: Voice)
      // =========================================================
      if (quotedMsgId && global.songSessions && global.songSessions.has(quotedMsgId)) {
        const session = global.songSessions.get(quotedMsgId);

        if (["1", "2", "3"].includes(cleanBody)) {
          await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

          try {
            if (cleanBody === "1") {
              await sock.sendMessage(from, {
                audio: { url: session.url },
                mimetype: "audio/mp4",
                fileName: `${session.title}.mp3`
              }, { quoted: msg });
            } else if (cleanBody === "2") {
              await sock.sendMessage(from, {
                document: { url: session.url },
                mimetype: "audio/mpeg",
                fileName: `${session.title}.mp3`
              }, { quoted: msg });
            } else if (cleanBody === "3") {
              await sock.sendMessage(from, {
                audio: { url: session.url },
                mimetype: "audio/ogg; codecs=opus",
                ptt: true
              }, { quoted: msg });
            }

            await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
            return;
          } catch (sendErr) {
            console.error("Song send error:", sendErr);
            await reply("❌ Audio එක යැවීමේදී දෝෂයක් මතු විය.");
            return;
          }
        }
      }

      // =========================================================
      // TIKTOK SELECTION REPLY HANDLER (1: Video, 2: Audio)
      // =========================================================
      if (quotedMsgId && global.tiktokSessions && global.tiktokSessions.has(quotedMsgId)) {
        const ttSession = global.tiktokSessions.get(quotedMsgId);

        if (["1", "2"].includes(cleanBody)) {
          await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

          try {
            if (cleanBody === "1") {
              await sock.sendMessage(from, {
                video: { url: ttSession.videoUrl },
                caption: `🎬 *${ttSession.title}*\n👤 *Creator:* ${ttSession.author}\n\n> *ᴅᴀʀᴋ ᴅɪɴᴜ ᴍᴅ 🐦‍🔥*`,
                mimetype: "video/mp4"
              }, { quoted: msg });
            } else if (cleanBody === "2") {
              if (!ttSession.audioUrl) {
                return await reply("⚠️ මෙම වීඩියෝවට අදාළ Audio එක හමු නොවීය.");
              }

              await sock.sendMessage(from, {
                audio: { url: ttSession.audioUrl },
                mimetype: "audio/mp4",
                fileName: `${ttSession.author}_sound.mp3`
              }, { quoted: msg });
            }

            await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
            return;
          } catch (ttSendErr) {
            console.error("TikTok send error:", ttSendErr);
            await reply("❌ TikTok මාධ්‍ය ගොනුව යැවීමේදී දෝෂයක් මතු විය.");
            return;
          }
        }
      }

      // Prefix check (. / ! # /) හෝ Menu අංක (1-6)
      const prefixes = [".", "!", "#", "/"];
      let prefix = prefixes.find(p => body.startsWith(p));
      let commandName = "";
      let args = [];

      if (!prefix && ["1", "2", "3", "4", "5", "6"].includes(cleanBody)) {
        prefix = ".";
        commandName = "menu";
        args = [cleanBody];
      } else if (prefix) {
        args = body.slice(prefix.length).trim().split(/ +/);
        commandName = args.shift().toLowerCase();
      }

      // =========================================================
      // .ai on / .ai off BUILT-IN COMMAND CONTROLLER
      // =========================================================
      if (commandName === "ai") {
        if (!isOwner) {
          return await reply("⚠️ මෙම විධානය භාවිතා කළ හැක්කේ Bot Owner හට පමණි.");
        }

        const mode = (args[0] || "").toLowerCase().trim();
        if (mode === "on") {
          global.aiAutoReply = true;
          return await reply("🤖 *HESHAN AI DIGITAL PERSONA: ON* 🟢\nදැන් එන සාමාන්‍ය මැසේජ් වලට මගේ විලාසයෙන් AI එකෙන් auto reply ලැබෙනවා.");
        } else if (mode === "off") {
          global.aiAutoReply = false;
          return await reply("🛑 *HESHAN AI DIGITAL PERSONA: OFF* 🔴\nAI Auto-reply අක්‍රිය කරන ලදී.");
        } else {
          return await reply(`💡 *AI විධාන භාවිතය:*\n• *.ai on* - AI Auto Reply සක්‍රිය කිරීමට\n• *.ai off* - AI Auto Reply අක්‍රිය කිරීමට\n\n📌 *වත්මන් තත්ත්වය:* ${global.aiAutoReply ? "ON 🟢" : "OFF 🔴"}`);
        }
      }

      // =========================================================
      // HESHAN AI AUTO-REPLY VIA OPENROUTER (DIGITAL PERSONA)
      // =========================================================
      const isCmd = Boolean(prefix) || ["1", "2", "3", "4", "5", "6"].includes(cleanBody);

      if (global.aiAutoReply && !isCmd && !msg.key.fromMe) {
        try {
          const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || botConfig.OPENROUTER_API_KEY;
          const AI_MODEL = botConfig.AI_MODEL || "deepseek/deepseek-chat:free";

          if (OPENROUTER_KEY) {
            await sock.sendPresenceUpdate("composing", from);

            const systemPrompt = 
`You are Dinidu Heshan (Dark Dinu), an 18-year-old tech and AI bot creator from Embilipitiya.
Tone & Persona Rules:
- You are chatting with a friend on WhatsApp.
- Speak in natural, friendly Sinhala & Singlish (use words like "මචං", "බ්‍රෝ", "බං", "හරි බං").
- Be chill, supportive, authentic, and direct.
- You love coding, WhatsApp bots, tech, and bikes.
- Reply concisely like a real WhatsApp text (1-3 sentences max). Never sound like an AI assistant or robot.`;

            const response = await axios.post(
              "https://openrouter.ai/api/v1/chat/completions",
              {
                model: AI_MODEL,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: cleanBody }
                ],
                temperature: 0.7,
                max_tokens: 200
              },
              {
                headers: {
                  "Authorization": `Bearer ${OPENROUTER_KEY}`,
                  "Content-Type": "application/json",
                  "HTTP-Referer": "https://github.com",
                  "X-Title": "Dark Dinu WhatsApp Bot"
                },
                timeout: 15000
              }
            );

            const replyText = response.data?.choices?.[0]?.message?.content?.trim();

            if (replyText) {
              await sock.sendMessage(from, { text: replyText }, { quoted: msg });
              return;
            }
          } else {
            console.warn("⚠️ OpenRouter Key එක හමු නොවීය.");
          }
        } catch (aiErr) {
          console.error("OpenRouter AI Error:", aiErr.response?.data || aiErr.message);
        }
      }

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
      } else {
        if (commandName === "ping" || commandName === "speed" || commandName === "p") {
          try {
            await sock.sendMessage(from, { react: { text: "🚀", key: msg.key } });
            const start = Date.now();
            const latency = Date.now() - start;
            const sent = await sock.sendMessage(from, { 
              text: `⚡ *Pong!*\n⏱️ Latency: *${latency}ms*\n_(Internal Fallback)_` 
            }, { quoted: msg });

            if (sent?.key) {
              await sock.sendMessage(from, { react: { text: "⚡", key: sent.key } });
            }
            return;
          } catch (e) {}
        }

        console.log(`⚠️ Command not registered: .${commandName}`);
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
   WEB UI (DARK PAIR SERVICE)
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
    return res.json({ success: true, code: result.code });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Pairing failed" });
  } finally {
    pairingInProgress = false;
  }
});

// UptimeRobot සහ Self Ping සඳහා Health Check Endpoint එක
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "online",
    bot: "DARK DINU MD",
    developer: DEVELOPER_NAME,
    ai_autoreply: global.aiAutoReply ? "active" : "disabled",
    loaded_commands: Array.from(commands.keys()).length,
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    whatsapp: activeSocket ? "active" : "not-connected",
    timestamp: new Date().toISOString()
  });
});

async function start() {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 DARK DINU WEB SERVER RUNNING ON PORT: ${PORT}`);
  });

  // Self-Ping mechanism to stop cloud spin-down (Render/Koyeb)
  const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (appUrl) {
    console.log(`⏱️ Self-ping scheduled for: ${appUrl}`);
    setInterval(() => {
      const client = appUrl.startsWith("https") ? https : http;
      client.get(`${appUrl}/health`, (res) => {
        console.log(`[PING] Keep-alive status: ${res.statusCode}`);
      }).on("error", (e) => {
        console.warn("[PING] Keep-alive warning:", e.message);
      });
    }, 8 * 60 * 1000); // සෑම විනාඩි 8කට වරක් self ping වේ
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
