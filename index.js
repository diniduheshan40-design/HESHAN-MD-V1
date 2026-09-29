require("dotenv").config();

// Process crash වැළැක්වීම
process.on("uncaughtException", (err) => {
  console.error("⚠️ Caught Exception:", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("⚠️ Unhandled Rejection:", reason);
});

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

// Global AI Auto-Reply (Default: ON)
global.aiAutoReply = true;

// Anti-Spam Rate Limit Memory
const userCooldowns = new Map();
let lastGeneratedReply = "";

if (!global.songSessions) global.songSessions = new Map();
if (!global.tiktokSessions) global.tiktokSessions = new Map();

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
   COMMAND LOADER
========================================================= */

const commands = new Map();
const aliases = new Map();

function loadCommands() {
  commands.clear();
  aliases.clear();

  try {
    if (!fs.existsSync(commandsDir)) fs.mkdirSync(commandsDir, { recursive: true });
    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith(".js"));

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
        }
      } catch (err) {}
    }
  } catch (err) {}
}

loadCommands();

function getCommand(cmdName) {
  const name = cmdName.toLowerCase().trim();
  if (commands.has(name)) return commands.get(name);
  if (aliases.has(name)) return commands.get(aliases.get(name));
  return null;
}

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
    ""
  ).trim();
}

/* =========================================================
   SAFE AI PERSONA GENERATOR
========================================================= */

async function getHeshanAiReply(userPrompt) {
  const OPENROUTER_KEY = 
    process.env.OPENROUTER_API_KEY || 
    botConfig.OPENROUTER_API_KEY || 
    "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";

  const systemInstructions = "You are Dinidu Heshan, a chill 18-year-old Sri Lankan boy. Chat naturally in casual Sinhala/Singlish (use words like මචං, බං, බ්‍රෝ). Keep reply strictly to 1 short sentence only. Never repeat the exact same sentence.";

  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "google/gemini-2.0-flash-exp:free",
        messages: [
          { role: "system", content: systemInstructions },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 60,
        temperature: 0.8
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
  } catch (err) {}

  // Fallback engine
  try {
    const fallbackUrl = `https://api.giftedtech.my.id/api/ai/geminiai?apikey=gifted&query=${encodeURIComponent(
      `Dinidu Heshan (casual boy) විදියට සිංහලෙන් කෙටි වචන 3-8කින් රිප්ලයි කරන්න: ${userPrompt}`
    )}`;
    const fbRes = await axios.get(fallbackUrl, { timeout: 5000 });
    return fbRes.data?.result || fbRes.data?.message || "හරි මචං!";
  } catch (fbErr) {
    return "කියපන් මචං මොකද්ද සීන් එක?";
  }
}

/* =========================================================
   SOCKET LISTENERS
========================================================= */

function initBot(sock) {
  if (!sock || !sock.ev) return;
  activeSocket = sock;

  sock.ev.on("connection.update", async (update) => {
    const { connection } = update;
    if (connection === "open") {
      console.log("\x1b[32m%s\x1b[0m", "🎉 [DARK DINU] WhatsApp Connected Successfully!");
    }
  });

  sock.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      if (!chatUpdate.messages || chatUpdate.messages.length === 0) return;
      const msg = chatUpdate.messages[0];
      if (!msg || !msg.message) return;

      const from = msg.key.remoteJid;
      if (!from || from === "status@broadcast") return;

      // 🔴 SAFETY LOCK 1: Bot ගේම මැසේජ් සම්පූර්ණයෙන්ම Block කිරීම
      if (msg.key.fromMe) return;

      const isGroup = from.endsWith("@g.us");
      const sender = isGroup ? msg.key.participant : from;
      const body = extractMessageBody(msg);
      if (!body) return;

      const reply = async (text) => {
        return await sock.sendMessage(from, { text: String(text) }, { quoted: msg });
      };

      const cleanBody = body.trim();

      // Owner check
      const senderClean = String(sender || "").split("@")[0].replace(/[^0-9]/g, "");
      const isOwner = Boolean(
        senderClean === DEVELOPER_NUMBER ||
        senderClean === DEVELOPER_LID ||
        sender?.includes(DEVELOPER_NUMBER) ||
        sender?.includes(DEVELOPER_LID)
      );

      // Prefix check
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

      // 🔴 SAFETY LOCK 2 & 3: Anti-Flood Cooldown සහ Anti-Spam
      const isCmd = Boolean(prefix);

      if (global.aiAutoReply && !isCmd && cleanBody.length > 0) {
        // Cooldown: තත්පර 4ක් යනතුරු එකම කෙනාට auto reply යවන්නේ නෑ
        const now = Date.now();
        const lastSent = userCooldowns.get(from) || 0;
        if (now - lastSent < 4000) return;

        try {
          userCooldowns.set(from, now);
          await sock.sendPresenceUpdate("composing", from);

          const aiText = await getHeshanAiReply(cleanBody);

          // Loop Check: කලින් ගිය text එකම නම් cancel කිරීම
          if (aiText && aiText !== lastGeneratedReply) {
            lastGeneratedReply = aiText;
            await sock.sendMessage(from, { text: aiText }, { quoted: msg });
          }
          await sock.sendPresenceUpdate("paused", from);
          return;
        } catch (err) {
          await sock.sendPresenceUpdate("paused", from);
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
      } else if (commandName === "ping" || commandName === "p") {
        await reply("⚡ *Pong! Bot is active.*");
      }

    } catch (e) {}
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
    console.log(`🚀 SERVER RUNNING ON PORT: ${PORT}`);
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
  } catch (err) {}
}

start();
