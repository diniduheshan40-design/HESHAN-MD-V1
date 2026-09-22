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
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

// 🟢 Global Process Crash Guards
process.on('uncaughtException', (err) => {
  console.error('🛡️ Uncaught Exception Guard:', err?.message || err);
});
process.on('unhandledRejection', (err) => {
  console.error('🛡️ Unhandled Rejection Guard:', err?.message || err);
});

// 🟢 Configuration
const BOT_NAME = 'HESHAN MD V1';
const MONGODB_URI = 'mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/?appName=Cluster0';
const { useMongoDBAuthState, Auth } = require('./auth');

// ============================================================================
// 🧠 RUNTIME STATE
// ============================================================================

const activeSessions = {};
global.activeSessions = activeSessions;
const isStarting = {};
const reconnectAttempts = {};
const commands = new Map();

// ============================================================================
// 📂 COMMAND LOADER (Ping & Commands Support)
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

function getCommandExecutor(cmd) {
  if (typeof cmd === 'function') return cmd;
  if (cmd && typeof cmd.execute === 'function') return cmd.execute;
  if (cmd && typeof cmd.run === 'function') return cmd.run;
  return null;
}

// ============================================================================
// 🌐 NEON BLUE / CYAN GLASSMORPHIC PORTAL
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
          --bg-core: #040914;
          --panel-bg: rgba(7, 16, 38, 0.82);
          --accent-blue: #0284c7;
          --accent-glow: rgba(14, 165, 233, 0.45);
          --blue-bright: #38bdf8;
          --blue-soft: #7dd3fc;
          --border-glass: rgba(56, 189, 248, 0.28);
          --border-focus: rgba(56, 189, 248, 0.8);
          --text-main: #f0f9ff;
          --text-muted: #94a3b8;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background-color: var(--bg-core);
          background-image: 
            radial-gradient(circle at 50% 0%, rgba(14, 165, 233, 0.25) 0%, transparent 60%),
            radial-gradient(circle at 10% 90%, rgba(3, 105, 161, 0.18) 0%, transparent 45%);
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
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1px solid var(--border-glass);
          border-radius: 28px;
          padding: 44px 34px;
          width: 100%;
          max-width: 440px;
          text-align: center;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.75), 0 0 50px var(--accent-glow);
          position: relative;
          overflow: hidden;
        }
        .portal-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, transparent, var(--blue-bright), transparent);
        }
        .badge-status {
          display: inline-flex; align-items: center; gap: 7px;
          font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
          color: var(--blue-soft); background: rgba(14, 165, 233, 0.14);
          border: 1px solid rgba(56, 189, 248, 0.35); padding: 6px 16px; border-radius: 30px; margin-bottom: 20px;
        }
        .badge-dot { width: 7px; height: 7px; background: var(--blue-bright); border-radius: 50%; box-shadow: 0 0 10px var(--blue-bright); }
        .app-title {
          font-size: 32px; font-weight: 800; letter-spacing: -0.5px;
          background: linear-gradient(135deg, #ffffff 40%, var(--blue-bright) 80%, var(--accent-blue) 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 8px;
        }
        .app-desc { font-size: 13.5px; color: var(--text-muted); margin-bottom: 30px; font-weight: 400; }
        .input-wrap { position: relative; margin-bottom: 16px; }
        .phone-input {
          width: 100%; padding: 16px 20px; border-radius: 16px; border: 1px solid var(--border-glass);
          background: rgba(2, 6, 23, 0.75); color: var(--text-main); font-size: 17px; font-weight: 600;
          letter-spacing: 0.8px; text-align: center; outline: none; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .phone-input:focus { border-color: var(--border-focus); box-shadow: 0 0 25px rgba(56, 189, 248, 0.45); background: rgba(4, 11, 30, 0.95); }
        .btn-action {
          width: 100%; padding: 16px; border-radius: 16px; border: none;
          background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
          color: #ffffff; font-size: 14.5px; font-weight: 700; cursor: pointer; transition: all 0.25s ease;
          box-shadow: 0 8px 24px rgba(2, 132, 199, 0.4); margin-bottom: 12px;
        }
        .btn-action:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(56, 189, 248, 0.55); background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); }
        .btn-reset {
          width: 100%; padding: 13px; border-radius: 14px; border: 1px solid rgba(56, 189, 248, 0.3);
          background: rgba(14, 165, 233, 0.1); color: var(--blue-soft); font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all 0.25s ease;
        }
        .btn-reset:hover { background: rgba(14, 165, 233, 0.22); border-color: var(--blue-bright); }
        .code-container { display: none; margin-top: 24px; animation: fadeIn 0.4s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .code-box {
          font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 800; letter-spacing: 5px;
          color: #e0f2fe; background: rgba(14, 165, 233, 0.18); border: 1.5px dashed var(--blue-bright);
          padding: 18px; border-radius: 16px; cursor: pointer; transition: all 0.25s ease;
        }
        .code-box:hover { background: rgba(14, 165, 233, 0.28); border-color: #ffffff; transform: scale(1.02); }
        .copy-tag { font-size: 11.5px; color: var(--text-muted); margin-top: 8px; font-weight: 500; }
        .footer-note { margin-top: 28px; font-size: 11px; letter-spacing: 1px; color: rgba(255, 255, 255, 0.3); text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="portal-card">
        <div class="badge-status"><span class="badge-dot"></span> Online System</div>
        <h1 class="app-title">${botName}</h1>
        <p class="app-desc">Enter phone number with country code</p>
        <div class="input-wrap">
          <input type="text" id="phone" class="phone-input" placeholder="e.g. 9471xxxxxxx" />
        </div>
        <button id="btn" class="btn-action" onclick="fetchPairCode()">GET PAIRING CODE</button>
        <button class="btn-reset" onclick="cleanSessionSlot()">CLEAN PREVIOUS SESSION</button>
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
              alert('✅ Pairing Code: ' + data.code + '\\n\\nWhatsApp එකෙහි Link with phone number වෙත දමන්න!');
            } else {
              alert(data.error || 'Connection busy. Please wait 10 seconds and retry.');
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
              if (data.success) alert('✅ Session Cleared! දැන් අලුතින් Code එකක් ගන්න.');
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
// 🔌 SOCKET CREATION (Working Setup)
// ============================================================================

async function createBaileysSocket(phoneNumber) {
  const { state, saveCreds, clearSessionData } = await useMongoDBAuthState(phoneNumber);
  const logger = pino({ level: 'silent' });
  const msgRetryCounterCache = new NodeCache({ stdTTL: 180, checkperiod: 60, maxKeys: 300 });

  const sock = makeWASocket({
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    msgRetryCounterCache,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    fireInitQueries: true,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
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
    console.log(`❌ Permanent session logout: ${phoneNumber}`);
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

function handleConnectionOpen(sock, phoneNumber) {
  console.log(`✅ BOT CONNECTED: ${phoneNumber}`);
  reconnectAttempts[phoneNumber] = 0;
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
// 💬 MESSAGE HANDLING (Commands / Ping Handler)
// ============================================================================

function extractMessageText(rawMsg) {
  return (
    rawMsg?.conversation ||
    rawMsg?.extendedTextMessage?.text ||
    rawMsg?.imageMessage?.caption ||
    rawMsg?.videoMessage?.caption ||
    ''
  ).trim();
}

function buildSafeReply(sock, chatJid, msg) {
  return async (content) => {
    const replyPayload = typeof content === 'string' ? { text: content } : { ...content };
    try {
      return await sock.sendMessage(chatJid, replyPayload, { quoted: msg });
    } catch (e) {
      return await sock.sendMessage(chatJid, replyPayload);
    }
  };
}

async function processSingleMessage(sock, msg) {
  if (!msg || !msg.message) return;
  const chatJid = msg.key?.remoteJid;
  if (!chatJid || chatJid === 'status@broadcast' || chatJid.endsWith('@newsletter')) return;

  const rawMsg =
    msg.message?.ephemeralMessage?.message ||
    msg.message?.viewOnceMessage?.message ||
    msg.message?.viewOnceMessageV2?.message ||
    msg.message;

  const text = extractMessageText(rawMsg);
  if (!text) return;

  const prefixMatch = text.match(/^[./!#]/);
  if (!prefixMatch) return;

  const prefix = prefixMatch[0];
  const args = text.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const cmd = commands.get(commandName);
  if (!cmd) return;

  const executor = getCommandExecutor(cmd);
  if (executor) {
    const safeReply = buildSafeReply(sock, chatJid, msg);
    try {
      await executor(sock, msg, args, chatJid, safeReply, { isOwner: true, isGroup: chatJid.endsWith('@g.us') });
    } catch (err) {
      console.error(`Command [${commandName}] execution error:`, err?.message);
    }
  }
}

function registerMessageUpsertHandler(sock) {
  sock.ev.on('messages.upsert', ({ messages }) => {
    if (!messages || !messages.length) return;
    for (const msg of messages) {
      processSingleMessage(sock, msg).catch(() => {});
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
    registerMessageUpsertHandler(sock);

    return sock;
  } catch (err) {
    delete isStarting[phoneNumber];
    console.error(`initWhatsApp Error (${phoneNumber}):`, err.message);
  }
}

// ============================================================================
// 🌐 HTTP ROUTES (Working Pairing Engine)
// ============================================================================

function stopAndRemoveSession(num) {
  if (!activeSessions[num]) return;
  try {
    activeSessions[num].ev.removeAllListeners();
    activeSessions[num].ws?.close();
  } catch (e) {}
  delete activeSessions[num];
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
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        markOnlineOnConnect: false,
        emitOwnEvents: false
      });

      pairSock.ev.on('creds.update', saveCreds);

      pairSock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
          activeSessions[num] = pairSock;
          registerConnectionUpdateHandler(pairSock, num, clearSessionData);
          registerMessageUpsertHandler(pairSock);
          handleConnectionOpen(pairSock, num);
        } else if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode;
          if (code !== DisconnectReason.loggedOut && code !== 401) {
            setTimeout(() => initWhatsApp(num), 6000);
          }
        }
      });

      await delay(3000);

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
        error: 'Pairing code generation failed. WhatsApp server rate-limit or network delay. Wait 15 seconds and retry.'
      });
    }
  });
}

function registerAllHttpRoutes(app) {
  registerPortalRoute(app);
  registerResetSingleNumberRoute(app);
  registerPairRoute(app);
}

// ============================================================================
// 🔁 KEEP-ALIVE (WAKE SERVER EVERY 2 MINUTES)
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
    console.log(`🚀 [${BOT_NAME}] Server running on port ${port}`);
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

