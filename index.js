require("dotenv").config();

process.setMaxListeners(0);

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
  botConfig = {
    BOT_LOGOS: [
      "https://files.catbox.moe/3fxa4u.jpeg",
      "https://files.catbox.moe/koh9j8.jpeg",
      "https://files.catbox.moe/jz25of.jpeg"
    ],
    getRandomLogo() {
      return this.BOT_LOGOS[Math.floor(Math.random() * this.BOT_LOGOS.length)];
    }
  };
}

const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");
const axios = require("axios");
const { exec } = require("child_process");

const { downloadMediaMessage } = require("@whiskeysockets/baileys");

let ffmpegPath = "ffmpeg";
try {
  const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
  ffmpegPath = ffmpegInstaller.path;
} catch (e) {
  ffmpegPath = "ffmpeg";
}

function convertToWhatsAppVoice(inputBuffer) {
  return new Promise((resolve, reject) => {
    const tempId = Date.now() + "_" + Math.random().toString(36).substring(7);
    const tempIn = path.join(os.tmpdir(), `tt_in_${tempId}.mp3`);
    const tempOut = path.join(os.tmpdir(), `tt_out_${tempId}.ogg`);

    fs.writeFileSync(tempIn, inputBuffer);

    const cmd = `"${ffmpegPath}" -y -i "${tempIn}" -c:a libopus -b:a 64k -ar 48000 -ac 1 -avoid_negative_ts make_zero "${tempOut}"`;

    exec(cmd, (err) => {
      try { if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn); } catch (e) {}
      if (err) return reject(err);

      try {
        const outBuf = fs.readFileSync(tempOut);
        try { if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); } catch (e) {}
        resolve(outBuf);
      } catch (readErr) {
        reject(readErr);
      }
    });
  });
}

const {
  restoreCredentials,
  requestPairCode,
  onSocketCreated
} = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;

const DEVELOPER_NAME = "DINIDU HESHAN";
const DEVELOPER_NUMBER = "94719845166";
const DEVELOPER_LID = "15947733680169";

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://diniduheshan2007_db_user:SZD7sfcIU6Einajx@cluster0.ah8jggk.mongodb.net/dark-dinu?retryWrites=true&w=majority&appName=Cluster0";

/* =========================================================
   SETTINGS SCHEMA & HELPER
========================================================= */

const BotSettingsSchema = new mongoose.Schema(
  {
    botNumber: { type: String, unique: true, required: true },
    botName: { type: String, default: "DARK DINU MD" },
    botLogo: { type: String, default: "https://files.catbox.moe/3fxa4u.jpeg" },
    prefix: { type: String, default: "." },
    workMode: { type: String, default: "public" },
    presence: { type: String, default: "off" },
    statusSeen: { type: Boolean, default: true },
    statusReact: { type: String, default: "💚" },
    antiViewRoute: { type: String, default: "me" },
    antiDeleteRoute: { type: String, default: "me" }
  },
  { timestamps: true }
);

const BotSettingsModel =
  mongoose.models.DarkDinuSettings ||
  mongoose.model("DarkDinuSettings", BotSettingsSchema);

const settingsCache = new Map();
global.settingsCache = settingsCache;

async function getBotSettings(botNumber) {
  const cleanNumber = String(botNumber || "").replace(/[^0-9]/g, "");
  if (!cleanNumber) return null;

  if (settingsCache.has(cleanNumber)) {
    return settingsCache.get(cleanNumber);
  }

  let config = await BotSettingsModel.findOne({ botNumber: cleanNumber });
  if (!config) {
    config = await BotSettingsModel.create({ botNumber: cleanNumber });
  }

  const data = config.toObject ? config.toObject() : config;
  settingsCache.set(cleanNumber, data);
  return data;
}

const MetaSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed
});
const BotMeta = mongoose.models.DarkDinuMeta || mongoose.model("DarkDinuMeta", MetaSchema);

const commandsDir = path.resolve(__dirname, "commands");
if (!fs.existsSync(commandsDir)) {
  fs.mkdirSync(commandsDir, { recursive: true });
}

let pairingInProgress = false;

if (!global.msgStore) global.msgStore = new Map();
if (!global.songSessions) global.songSessions = new Map();
if (!global.tiktokSessions) global.tiktokSessions = new Map();
if (!global.fbSessions) global.fbSessions = new Map();
if (!global.videoSessions) global.videoSessions = new Map();
if (!global.settingSessions) global.settingSessions = new Map();
if (!global.activeBotSockets) global.activeBotSockets = new Set();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

function initBot(sock) {
  if (!sock || !sock.ev) return;
  if (sock._isInitialized) return;
  sock._isInitialized = true;

  if (global.activeBotSockets) {
    global.activeBotSockets.add(sock);
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection } = update;

    if (connection === "open") {
      const currentBotNum = (sock.user?.id || "").split(":")[0].replace(/[^0-9]/g, "");
      console.log("\x1b[32m%s\x1b[0m", `🟢 [DARK DINU] Connected: +${currentBotNum}`);

      setTimeout(async () => {
        try {
          if (!sock.user) return;

          const rawUser = currentBotNum;
          const userJid = `${rawUser}@s.whatsapp.net`;
          const devJid = `${DEVELOPER_NUMBER}@s.whatsapp.net`;

          const settings = await getBotSettings(rawUser);
          const activeLogo = settings?.botLogo || (typeof botConfig.getRandomLogo === "function" ? botConfig.getRandomLogo() : "https://files.catbox.moe/3fxa4u.jpeg");
          const activeName = settings?.botName || "DARK DINU MD";
          const activePrefix = settings?.prefix || ".";

          const userCaption = 
`╭───『 ${activeName} 』───◆
│
│ 🩸 *STATUS:* Connected Successfully!
│ ⚡ *PREFIX:* [ ${activePrefix} ]
│ 🌐 *WORK MODE:* ${(settings?.workMode || "public").toUpperCase()}
│ 👤 *USER:* +${rawUser}
│ 👑 *DEVELOPER:* ${DEVELOPER_NAME}
│ 🌐 *ENGINE:* Baileys 24/7 Engine
│
╰───────────────────────◆
> *DARK DINU is active! Type ${activePrefix}setting to configure.* 🔥`;

          try {
            await sock.sendMessage(userJid, { image: { url: activeLogo }, caption: userCaption });
          } catch (e) {
            await sock.sendMessage(userJid, { text: userCaption });
          }

          const checkUserMeta = await BotMeta.findOne({ key: `user_registered_${rawUser}` });

          if (!checkUserMeta) {
            if (rawUser !== DEVELOPER_NUMBER) {
              const devCaption = 
`╭───『 🚨 NEW USER DEPLOYED 』───◆
│
│ 🤖 *BOT:* ${activeName}
│ 👤 *NEW USER:* +${rawUser}
│ 👑 *DEV:* ${DEVELOPER_NAME}
│ 📅 *DATE:* ${new Date().toLocaleString("en-LK", { timeZone: "Asia/Colombo" })}
│ 🚀 *STATUS:* First Time Deployment!
│
╰──────────────────────────◆`;

              try {
                await sock.sendMessage(devJid, { image: { url: activeLogo }, caption: devCaption });
              } catch (e) {
                await sock.sendMessage(devJid, { text: devCaption });
              }
            }

            await BotMeta.findOneAndUpdate(
              { key: `user_registered_${rawUser}` },
              { value: true },
              { upsert: true }
            );
          }
        } catch (err) {
          console.error("⚠️ Connection message error:", err.message);
        }
      }, 3000);
    }
  });

  sock.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      if (!chatUpdate.messages || chatUpdate.messages.length === 0) return;
      const msg = chatUpdate.messages[0];
      if (!msg || !msg.message) return;

      const from = msg.key.remoteJid;
      if (!from) return;

      const currentBotNumber = (sock.user?.id || "").split(":")[0].replace(/[^0-9]/g, "");
      if (!currentBotNumber) return;

      const ownerJid = `${currentBotNumber}@s.whatsapp.net`;
      const settings = await getBotSettings(currentBotNumber);

      const isGroup = from.endsWith("@g.us");

      let sender = isGroup ? (msg.key.participant || msg.participant) : from;
      if (msg.key.fromMe) {
        sender = ownerJid;
      }
      const senderClean = String(sender || "").split("@")[0].split(":")[0].replace(/[^0-9]/g, "");

      const isDev = Boolean(
        senderClean === DEVELOPER_NUMBER ||
        senderClean === DEVELOPER_LID
      );

      const isBotOwner = Boolean(
        msg.key.fromMe ||
        senderClean === currentBotNumber
      );

      const isOwner = Boolean(isDev || isBotOwner);

      const body = extractMessageBody(msg);
      const cleanBody = body.trim();

      if (msg.key.fromMe && !cleanBody.startsWith(settings?.prefix || ".")) {
        return;
      }

      const reply = async (text) => {
        return await sock.sendMessage(from, { text: String(text) }, { quoted: msg });
      };

      /* =========================================================
         ⭐ 1. INTERACTIVE SELECTION HANDLERS (FB / SONG / TIKTOK 1, 2, 3)
      ========================================================= */
      const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

      if (quotedMsgId && ["1", "2", "3", "4"].includes(cleanBody)) {
        
        // Facebook
        if (global.fbSessions && global.fbSessions.has(quotedMsgId)) {
          const fbSession = global.fbSessions.get(quotedMsgId);
          await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
          try {
            if (cleanBody === "1") {
              const vidUrl = fbSession.hd || fbSession.sd;
              await sock.sendMessage(from, { video: { url: vidUrl }, caption: `🎬 *${fbSession.title || "Video"}*\n⚡ HD Quality\n\n> *${settings.botName}*` }, { quoted: msg });
            } else if (cleanBody === "2") {
              const vidUrl = fbSession.sd || fbSession.hd;
              await sock.sendMessage(from, { video: { url: vidUrl }, caption: `🎬 *${fbSession.title || "Video"}*\n⚡ SD Quality\n\n> *${settings.botName}*` }, { quoted: msg });
            } else if (cleanBody === "3") {
              await sock.sendMessage(from, { audio: { url: fbSession.audio || fbSession.sd }, mimetype: "audio/mp4", fileName: "fb_audio.mp3" }, { quoted: msg });
            }
            await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
            global.fbSessions.delete(quotedMsgId);
            return;
          } catch (e) {
            await reply("❌ FB Error: " + e.message);
            return;
          }
        }

        // Song
        if (global.songSessions && global.songSessions.has(quotedMsgId)) {
          const session = global.songSessions.get(quotedMsgId);
          await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
          try {
            if (cleanBody === "1") {
              await sock.sendMessage(from, { audio: { url: session.url }, mimetype: "audio/mp4", fileName: `${session.title}.mp3` }, { quoted: msg });
            } else if (cleanBody === "2") {
              await sock.sendMessage(from, { document: { url: session.url }, mimetype: "audio/mpeg", fileName: `${session.title}.mp3` }, { quoted: msg });
            } else if (cleanBody === "3") {
              const songRes = await axios.get(session.url, { responseType: "arraybuffer", timeout: 45000 });
              const voiceBuf = await convertToWhatsAppVoice(Buffer.from(songRes.data));
              await sock.sendMessage(from, { audio: voiceBuf, mimetype: "audio/ogg; codecs=opus", ptt: true }, { quoted: msg });
            }
            await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
            global.songSessions.delete(quotedMsgId);
            return;
          } catch (e) {
            await reply("❌ Audio Error.");
            return;
          }
        }

        // TikTok
        if (global.tiktokSessions && global.tiktokSessions.has(quotedMsgId)) {
          const ttSession = global.tiktokSessions.get(quotedMsgId);
          await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
          try {
            if (cleanBody === "1") {
              await sock.sendMessage(from, { video: { url: ttSession.hdVideo || ttSession.sdVideo }, caption: `🎬 *${ttSession.title}*\n⚡ HD Quality\n\n> *${settings.botName}*` }, { quoted: msg });
            } else if (cleanBody === "2") {
              await sock.sendMessage(from, { video: { url: ttSession.sdVideo || ttSession.hdVideo }, caption: `🎬 *${ttSession.title}*\n⚡ SD Quality\n\n> *${settings.botName}*` }, { quoted: msg });
            } else if (cleanBody === "3") {
              const rawAudioRes = await axios.get(ttSession.audioUrl, { responseType: "arraybuffer", timeout: 30000 });
              const voiceBuffer = await convertToWhatsAppVoice(Buffer.from(rawAudioRes.data));
              await sock.sendMessage(from, { audio: voiceBuffer, mimetype: "audio/ogg; codecs=opus", ptt: true }, { quoted: msg });
            }
            await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
            global.tiktokSessions.delete(quotedMsgId);
            return;
          } catch (e) {
            await reply("❌ TikTok Error.");
            return;
          }
        }
      }

      /* =========================================================
         2. ANTI-DELETE
      ========================================================= */
      if (msg.key.id && !msg.key.fromMe) {
        global.msgStore.set(msg.key.id, {
          msg,
          from,
          sender: msg.key.participant || from,
          pushName: msg.pushName || "User",
          time: new Date()
        });

        if (global.msgStore.size > 500) {
          const firstKey = global.msgStore.keys().next().value;
          global.msgStore.delete(firstKey);
        }
      }

      const protocolMsg = msg.message?.protocolMessage;
      if (protocolMsg && protocolMsg.type === 0) {
        const deletedId = protocolMsg.key?.id;
        if (deletedId && global.msgStore.has(deletedId)) {
          const cached = global.msgStore.get(deletedId);
          const targetSendJid = settings.antiDeleteRoute === "me" ? ownerJid : cached.from;
          const senderNum = (cached.sender || "").split("@")[0].replace(/[^0-9]/g, "");

          const alertHeader = 
`╭───『 🗑️ 𝐀𝐍𝐓𝐈-𝐃𝐄𝐋𝐄𝐓𝐄 𝐀𝐋𝐄𝐑𝐓 』───◆
│
│ 👤 *Sender:* +${senderNum} (${cached.pushName})
│ 💬 *Chat:* ${cached.from.endsWith("@g.us") ? "Group Chat" : "Private Chat"}
│ ⏰ *Time:* ${cached.time.toLocaleTimeString("en-LK", { timeZone: "Asia/Colombo" })}
│
╰───────────────────────────────◆`;

          try {
            let rawDeletedMsg = cached.msg.message;
            if (rawDeletedMsg.ephemeralMessage) rawDeletedMsg = rawDeletedMsg.ephemeralMessage.message;
            if (rawDeletedMsg.viewOnceMessageV2) rawDeletedMsg = rawDeletedMsg.viewOnceMessageV2.message;
            if (rawDeletedMsg.viewOnceMessage) rawDeletedMsg = rawDeletedMsg.viewOnceMessage.message;

            let deletedText = 
              rawDeletedMsg.conversation ||
              rawDeletedMsg.extendedTextMessage?.text ||
              rawDeletedMsg.imageMessage?.caption ||
              rawDeletedMsg.videoMessage?.caption ||
              "";

            if (rawDeletedMsg.conversation || rawDeletedMsg.extendedTextMessage) {
              await sock.sendMessage(targetSendJid, { text: `${alertHeader}\n\n📝 *Deleted Message:*\n${deletedText || "_No Text Content_"}` });
            } else if (rawDeletedMsg.imageMessage) {
              const buffer = await downloadMediaMessage(cached.msg, "buffer", {}, { logger: console });
              await sock.sendMessage(targetSendJid, { image: buffer, caption: `${alertHeader}\n\n📝 *Caption:*\n${deletedText || "_No Caption_"}` });
            } else if (rawDeletedMsg.videoMessage) {
              const buffer = await downloadMediaMessage(cached.msg, "buffer", {}, { logger: console });
              await sock.sendMessage(targetSendJid, { video: buffer, caption: `${alertHeader}\n\n📝 *Caption:*\n${deletedText || "_No Caption_"}` });
            }
          } catch (delErr) {}
          return;
        }
      }

      /* =========================================================
         3. ANTI-VIEWONCE
      ========================================================= */
      const antiViewEmojis = ["🥺", "🙏", "🌚", "😁", "🤭", "😩", "😂", "🫣", "❤", "👍", "🙌", "🫡", "😍", "🫶", "😶"];
      const quotedMsgRaw = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const isEmojiReplyVO = quotedMsgRaw && antiViewEmojis.includes(cleanBody) && (quotedMsgRaw.viewOnceMessageV2 || quotedMsgRaw.viewOnceMessage);

      let voTarget = null;
      let isReplyMode = false;

      if (msg.message?.viewOnceMessageV2) {
        voTarget = msg.message.viewOnceMessageV2.message;
      } else if (msg.message?.viewOnceMessage) {
        voTarget = msg.message.viewOnceMessage.message;
      } else if (isEmojiReplyVO) {
        const qm = quotedMsgRaw.viewOnceMessageV2 || quotedMsgRaw.viewOnceMessage;
        voTarget = qm.message;
        isReplyMode = true;
      }

      if (voTarget && (!msg.key.fromMe || isReplyMode)) {
        const targetViewJid = settings.antiViewRoute === "me" ? ownerJid : from;
        const senderNum = (msg.key.participant || from).split("@")[0].split(":")[0].replace(/[^0-9]/g, "");

        try {
          const isImg = Boolean(voTarget.imageMessage);
          const isVid = Boolean(voTarget.videoMessage);

          if (isImg || isVid) {
            const mediaObj = isImg ? voTarget.imageMessage : voTarget.videoMessage;
            const fakeMessageToDownload = {
              key: isReplyMode ? {
                remoteJid: from,
                id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                participant: msg.message.extendedTextMessage.contextInfo.participant
              } : msg.key,
              message: voTarget
            };

            const buffer = await downloadMediaMessage(fakeMessageToDownload, "buffer", {}, { logger: console });

            const caption = 
`╭───『 👁️ 𝐀𝐍𝐓𝐈-𝐕𝐈𝐄𝐖𝐎𝐍𝐂𝐄 』───◆
│
│ 👤 *Sender:* +${senderNum}
│ 📁 *Type:* ${isImg ? "Photo" : "Video"}
│ 📝 *Caption:* ${mediaObj.caption || "No caption"}
│
╰─────────────────────────◆
> *${settings.botName}*`;

            if (isImg) {
              await sock.sendMessage(targetViewJid, { image: buffer, caption }, { quoted: msg });
            } else {
              await sock.sendMessage(targetViewJid, { video: buffer, caption }, { quoted: msg });
            }

            if (isReplyMode) return;
          }
        } catch (voErr) {}
      }

      /* =========================================================
         4. AUTO STATUS READ & REACT
      ========================================================= */
      if (from === "status@broadcast") {
        try {
          if (settings.statusSeen) {
            await sock.readMessages([msg.key]);
          }
          const senderJid = msg.key.participant || msg.participant;
          if (settings.statusReact && settings.statusReact !== "off" && senderJid) {
            await sock.sendMessage(
              senderJid,
              { react: { text: settings.statusReact, key: msg.key } },
              { statusJidList: [senderJid] }
            );
          }
        } catch (e) {}
        return;
      }

      /* =========================================================
         5. WORK MODE PROTECTION
      ========================================================= */
      if (!isOwner) {
        const mode = (settings?.workMode || "public").toLowerCase();
        if (mode === "private") return;
        if (mode === "groups" && !isGroup) return;
        if (mode === "inbox" && isGroup) return;
      }

      // Settings Reply Handler
      if (quotedMsgId && global.settingSessions.has(quotedMsgId) && (isOwner || isDev)) {
        const settingCmd = getCommand("setting");
        if (settingCmd && typeof settingCmd.execute === "function") {
          return await settingCmd.execute(sock, msg, [], from, {
            reply, isOwner, isDev, cleanBody, body, sender, DEVELOPER_NAME, DEVELOPER_NUMBER
          });
        }
      }

      /* =========================================================
         6. COMMAND ROUTING & EXECUTION
      ========================================================= */
      const defaultPrefixes = [".", "!", "#", "/", "*", ","];
      const configuredPrefix = settings?.prefix || ".";
      let matchedPrefix = null;

      if (body.startsWith(configuredPrefix)) {
        matchedPrefix = configuredPrefix;
      } else if (defaultPrefixes.some(p => body.startsWith(p))) {
        matchedPrefix = defaultPrefixes.find(p => body.startsWith(p));
      }

      if (!matchedPrefix) {
        return;
      }

      const args = body.slice(matchedPrefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();
      if (!commandName) return;

      console.log(`⚡ [EXECUTE]: ${matchedPrefix}${commandName} | Bot: +${currentBotNumber} | User: +${senderClean}`);
      const targetCommand = getCommand(commandName);

      if (targetCommand && typeof targetCommand.execute === "function") {
        try {
          await targetCommand.execute(sock, msg, args, from, {
            body,
            cleanBody,
            prefix: matchedPrefix,
            sender,
            isOwner,
            isDev,
            isBotOwner,
            isGroup,
            reply,
            settings,
            currentBotNumber,
            DEVELOPER_NAME,
            DEVELOPER_NUMBER,
            DEVELOPER_LID,
            botConfig
          });
        } catch (cmdErr) {
          console.error(`❌ Execution error in ${commandName}:`, cmdErr);
          await reply(`⚠️ Error executing *${commandName}*:\n_${cmdErr.message}_`);
        }
      } else if (["ping", "speed", "p"].includes(commandName)) {
        try {
          await sock.sendMessage(from, { react: { text: "🚀", key: msg.key } });
          const start = Date.now();
          const latency = Date.now() - start;
          const sent = await sock.sendMessage(from, { 
            text: `⚡ *Pong!*\n⏱️ Latency: *${latency}ms*\n🤖 *Bot:* ${settings.botName}` 
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
  if (sock && global.activeBotSockets) {
    global.activeBotSockets.add(sock);
  }
  initBot(sock);
});

/* =========================================================
   WEB UI & PAIR SERVICE
========================================================= */

app.get("/", (req, res) => {
  const displayLogo = typeof botConfig.getRandomLogo === "function" 
    ? botConfig.getRandomLogo() 
    : (botConfig.BOT_LOGOS && botConfig.BOT_LOGOS[0]) || "https://files.catbox.moe/3fxa4u.jpeg";

  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DARK DINU • PAIR SERVICE</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px; background: #050507 radial-gradient(circle at 50% 0%, rgba(230, 0, 0, 0.25), transparent 70%); font-family: 'Rajdhani', sans-serif; color: #fff; overflow-x: hidden; }
    .container { width: 100%; max-width: 420px; background: rgba(16, 16, 22, 0.85); border: 1px solid rgba(255, 30, 30, 0.35); border-radius: 28px; padding: 38px 26px; text-align: center; backdrop-filter: blur(16px); box-shadow: 0 0 50px rgba(230, 0, 0, 0.2); position: relative; }
    .avatar-wrapper { position: relative; width: 100px; height: 100px; margin: 0 auto 18px; }
    .avatar-img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid #ff2b2b; box-shadow: 0 0 25px rgba(255, 43, 43, 0.6); }
    h1 { font-family: 'Orbitron', sans-serif; font-size: 24px; color: #ffffff; margin-bottom: 4px; }
    .subtitle { font-size: 14px; color: #9ca3af; margin-bottom: 24px; }
    input { width: 100%; padding: 16px; background: rgba(10, 10, 14, 0.9); border: 1px solid rgba(255, 50, 50, 0.25); border-radius: 16px; color: #fff; font-size: 18px; text-align: center; outline: none; margin-bottom: 16px; }
    .btn { width: 100%; padding: 16px; background: linear-gradient(135deg, #e60000, #880000); border: none; border-radius: 16px; color: #fff; font-family: 'Orbitron', sans-serif; font-size: 14px; font-weight: 700; cursor: pointer; }
    #result { margin-top: 22px; min-height: 48px; }
    .code-box { background: rgba(8, 8, 12, 0.95); border: 1.5px dashed #ff2b2b; border-radius: 16px; padding: 18px 12px; cursor: pointer; }
    .code-text { font-family: 'Orbitron', monospace; font-size: 28px; font-weight: 800; color: #ff3b3b; letter-spacing: 5px; }
    .badge { display: inline-block; margin-top: 8px; font-size: 12px; color: #00ff88; }
    .error { color: #ff4d4d; font-size: 14px; padding: 10px; }
    .footer { margin-top: 26px; font-size: 13px; color: #71717a; }
  </style>
</head>
<body>
<div class="container">
  <div class="avatar-wrapper"><img src="${displayLogo}" class="avatar-img" /></div>
  <h1>DARK DINU MD</h1>
  <p class="subtitle">WhatsApp Multi-Device Link System</p>
  <div class="input-box"><input id="number" type="tel" placeholder="07XXXXXXXX" autocomplete="off" /></div>
  <button id="pairBtn" class="btn" onclick="getCode()">GET PAIR CODE</button>
  <div id="result"></div>
  <div class="footer">POWERED BY <b>${DEVELOPER_NAME}</b></div>
</div>
<script>
async function getCode() {
  var input = document.getElementById("number");
  var btn = document.getElementById("pairBtn");
  var resDiv = document.getElementById("result");
  var num = input.value.replace(/[^0-9]/g, "").trim();
  if (num.startsWith("0")) num = "94" + num.substring(1);
  if (!/^94[0-9]{9}$/.test(num)) {
    resDiv.innerHTML = '<div class="error">❌ Invalid phone number! Example: 07XXXXXXXX</div>';
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
      resDiv.innerHTML = '<div class="code-box" onclick="navigator.clipboard.writeText(\\x27' + data.code + '\\x27)"><div class="code-text">' + data.code + '</div><div class="badge">✓ Copied to clipboard! Click to copy again</div></div>';
    } else {
      resDiv.innerHTML = '<div class="error">' + (data.error || "Failed to generate pairing code.") + '</div>';
    }
  } catch (err) {
    resDiv.innerHTML = '<div class="error">❌ Server connection failed! Try again.</div>';
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

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "alive",
    bot: "DARK DINU MD",
    uptime: process.uptime(),
    activeBots: global.activeBotSockets ? global.activeBotSockets.size : 0
  });
});

/* =========================================================
   24/7 KEEP-ALIVE SERVER START
========================================================= */

async function start() {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 DARK DINU RUNNING ON PORT: ${PORT}`);
  });

  const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  const targetPing = appUrl.endsWith("/") ? `${appUrl}health` : `${appUrl}/health`;

  setInterval(() => {
    try {
      const client = targetPing.startsWith("https") ? https : http;
      client.get(targetPing, (res) => { res.on("data", () => {}); }).on("error", () => {});
    } catch (e) {}
  }, 3 * 60 * 1000);

  try {
    console.log("🔄 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, { 
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000
    });
    console.log("\x1b[32m%s\x1b[0m", "✅ [DATABASE] MongoDB connected!");

    await restoreCredentials();
  } catch (err) {
    console.error("Startup error:", err.message);
  }
}

start();
