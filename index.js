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
const DEVELOPER_LID = "15947733680169";

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://diniduheshan2007_db_user:Heshan2007@cluster0.ah8jggk.mongodb.net/dark-dinu?retryWrites=true&w=majority&appName=Cluster0";

const commandsDir = path.resolve(__dirname, "commands");
if (!fs.existsSync(commandsDir)) {
  fs.mkdirSync(commandsDir, { recursive: true });
}

let activeSocket = null;
let pairingInProgress = false;

// Global AI Auto-Reply State (Default: ON)
global.aiAutoReply = true;

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
   FAST ULTRA-LIGHT AI PERSONA ENGINE (DUAL ENGINE)
========================================================= */

async function getHeshanAiReply(userPrompt) {
  const OPENROUTER_KEY = 
    process.env.OPENROUTER_API_KEY || 
    botConfig.OPENROUTER_API_KEY || 
    "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";

  const systemInstructions = "You are Dinidu Heshan, a cool 18yo Sri Lankan boy. Reply in casual Sinhala/Singlish (මචං, බං, බ්‍රෝ). Answer directly in 1 short sentence only like a WhatsApp message.";

  // Engine 1: OpenRouter (DeepSeek / Gemini)
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-chat:free",
        messages: [
          { role: "system", content: systemInstructions },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 60,
        temperature: 0.7
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENROUTER_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://render.com",
          "X-Title": "Dark Dinu"
        },
        timeout: 6000
      }
    );

    const reply = res.data?.choices?.[0]?.message?.content?.trim();
    if (reply) return reply;
  } catch (err) {
    console.warn("⚠️ OpenRouter busy, switching to Fallback Engine...");
  }

  // Engine 2: Instant Public AI Fallback (කවදාවත් හිරවෙන්නේ නෑ)
  try {
    const fallbackUrl = `https://api.giftedtech.my.id/api/ai/geminiai?apikey=gifted&query=${encodeURIComponent(
      `Dinidu Heshan (casual boy) විදියට සිංහලෙන් කෙටි වචන 3-8කින් රිප්ලයි කරන්න: ${userPrompt}`
    )}`;
    const fbRes = await axios.get(fallbackUrl, { timeout: 6000 });
    return fbRes.data?.result || fbRes.data?.message || "හරි මචං!";
  } catch (fbErr) {
    return "කියපන් මචං මොකද්ද වෙන්න ඕනි?";
  }
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
│ 🤖 *AI PERSONA:* AUTO ACTIVE 🟢
│
╰───────────────────────◆
> *AI Auto-reply is active!* 🔥`;

          await sock.sendMessage(userJid, { text: userMsg });

          const checkMeta = await BotMeta.findOne({ key: "first_time_paired" });
          if (!checkMeta || !checkMeta.value) {
            const devMsg = `🤖 Bot Dark Dinu Paired by +${rawUser}`;
            await sock.sendMessage(devJid, { text: devMsg });
            await BotMeta.findOneAndUpdate({ key: "first_time_paired" }, { value: true }, { upsert: true });
          }
        } catch (err) {}
      }, 2500);
    }
  });

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

      // Owner Check
      const senderClean = String(sender || "").split("@")[0].replace(/[^0-9]/g, "");
      const isOwner = Boolean(
        msg.key.fromMe ||
        senderClean === DEVELOPER_NUMBER ||
        senderClean === DEVELOPER_LID ||
        sender?.includes(DEVELOPER_NUMBER) ||
        sender?.includes(DEVELOPER_LID)
      );

      // Song selection
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
          } catch (e) {}
        }
      }

      // TikTok selection
      if (quotedMsgId && global.tiktokSessions && global.tiktokSessions.has(quotedMsgId)) {
        const ttSession = global.tiktokSessions.get(quotedMsgId);
        if (["1", "2"].includes(cleanBody)) {
          await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
          try {
            if (cleanBody === "1") {
              await sock.sendMessage(from, { video: { url: ttSession.videoUrl }, caption: `🎬 *${ttSession.title}*`, mimetype: "video/mp4" }, { quoted: msg });
            } else if (cleanBody === "2" && ttSession.audioUrl) {
              await sock.sendMessage(from, { audio: { url: ttSession.audioUrl }, mimetype: "audio/mp4", fileName: `${ttSession.author}_sound.mp3` }, { quoted: msg });
            }
            await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
            return;
          } catch (e) {}
        }
      }

      // Prefix Handling
      const prefixes = [".", "!", "#", "/"];
      const prefix = prefixes.find(p => body.startsWith(p));
      let commandName = "";
      let args = [];

      if (prefix) {
        args = body.slice(prefix.length).trim().split(/ +/);
        commandName = args.shift().toLowerCase();
      }

      // .ai on / .ai off Control
      if (commandName === "ai") {
        if (!isOwner) return await reply("⚠️ මෙම විධානය භාවිතා කළ හැක්කේ Bot Owner හට පමණි.");
        const mode = (args[0] || "").toLowerCase().trim();
        if (mode === "on") {
          global.aiAutoReply = true;
          return await reply("🤖 *HESHAN AI AUTO-REPLY: ON* 🟢");
        } else if (mode === "off") {
          global.aiAutoReply = false;
          return await reply("🛑 *HESHAN AI AUTO-REPLY: OFF* 🔴");
        } else {
          return await reply(`💡 *Status:* ${global.aiAutoReply ? "ON 🟢" : "OFF 🔴"}\nUse: *.ai on* or *.ai off*`);
        }
      }

      // FAST AI AUTO-REPLY (Non-command regular messages)
      const isCmd = Boolean(prefix);

      if (global.aiAutoReply && !isCmd && cleanBody.length > 0) {
        try {
          console.log(`🤖 [FAST AI TRIGGERED]: ${cleanBody}`);
          const aiText = await getHeshanAiReply(cleanBody);
          if (aiText) {
            await sock.sendMessage(from, { text: aiText }, { quoted: msg });
            return;
          }
        } catch (err) {
          console.error("AI execution error:", err.message);
        }
      }

      if (!commandName) return;

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
          await reply(`⚠️ Error: ${cmdErr.message}`);
        }
      } else if (commandName === "ping" || commandName === "speed" || commandName === "p") {
        const start = Date.now();
        await sock.sendMessage(from, { text: `⚡ Pong: *${Date.now() - start}ms*` }, { quoted: msg });
      }

    } catch (e) {
      console.error("Upsert Error:", e.message);
    }
  });
}

onSocketCreated((sock) => {
  initBot(sock);
});

/* =========================================================
   WEB UI & HEALTH
========================================================= */

app.get("/", (req, res) => {
  res.send("<h1>DARK DINU BOT IS RUNNING</h1>");
});

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

app.get("/health", (req, res) => {
  res.status(200).json({ status: "online", ai: global.aiAutoReply });
});

async function start() {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 DARK DINU WEB SERVER RUNNING ON PORT: ${PORT}`);
  });

  const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (appUrl) {
    setInterval(() => {
      const client = appUrl.startsWith("https") ? https : http;
      client.get(`${appUrl}/health`, () => {}).on("error", () => {});
    }, 8 * 60 * 1000);
  }

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 30000 });
    console.log("✅ [DATABASE] Connected!");
    await restoreCredentials();
    await startSavedSocket();
  } catch (err) {
    console.error("Startup error:", err.message);
  }
}

start();
