const express = require('express');
const pino = require('pino');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');
const {
  default: makeWASocket,
  DisconnectReason,
  delay,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

process.on('uncaughtException', (err) => console.log('🛡️ Exception:', err?.message || err));
process.on('unhandledRejection', (err) => console.log('🛡️ Rejection:', err?.message || err));

const BOT_NAME = 'HESHAN MD V1';
const MONGODB_URI = 'mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/?appName=Cluster0';
const { useHybridAuthState, Auth } = require('./auth');

const activeSessions = {};
const commands = new Map();

// Commands Loader
function loadAllCommands() {
  const cmdDir = path.join(__dirname, 'commands');
  if (!fs.existsSync(cmdDir)) return;
  const files = fs.readdirSync(cmdDir).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    try {
      let cmd = require(path.join(cmdDir, file));
      if (cmd.default) cmd = cmd.default;
      const cmdName = file.replace('.js', '').toLowerCase();
      if (cmd && cmd.name) commands.set(cmd.name.toLowerCase(), cmd);
      commands.set(cmdName, cmd);
      if (cmd && cmd.alias) {
        const aliases = Array.isArray(cmd.alias) ? cmd.alias : [cmd.alias];
        for (const al of aliases) commands.set(al.toLowerCase(), cmd);
      }
    } catch (e) {}
  }
}

// UI
function renderPortalHtml() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${BOT_NAME} • PAIRING STATION</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet">
      <style>
        :root { --bg: #040914; --panel: rgba(7, 16, 38, 0.85); --blue: #0284c7; --bright: #38bdf8; --text: #f0f9ff; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
        body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: var(--panel); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 24px; padding: 35px 25px; width: 100%; max-width: 400px; text-align: center; box-shadow: 0 0 35px rgba(2, 132, 199, 0.3); }
        h1 { font-size: 26px; font-weight: 800; margin-bottom: 6px; color: #fff; }
        p { font-size: 13px; color: #94a3b8; margin-bottom: 25px; }
        input { width: 100%; padding: 15px; border-radius: 14px; border: 1px solid rgba(56, 189, 248, 0.3); background: rgba(2, 6, 23, 0.8); color: #fff; font-size: 16px; text-align: center; outline: none; margin-bottom: 15px; }
        button { width: 100%; padding: 15px; border-radius: 14px; border: none; font-weight: 700; cursor: pointer; transition: 0.2s; margin-bottom: 10px; }
        .btn-pair { background: var(--blue); color: #fff; font-size: 14px; }
        .btn-clean { background: rgba(56, 189, 248, 0.1); color: var(--bright); border: 1px solid rgba(56, 189, 248, 0.3); font-size: 13px; }
        .code-box { display: none; margin-top: 20px; background: rgba(56, 189, 248, 0.15); border: 2px dashed var(--bright); padding: 15px; border-radius: 14px; font-family: 'JetBrains Mono', monospace; font-size: 28px; letter-spacing: 4px; cursor: pointer; color: #e0f2fe; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>${BOT_NAME}</h1>
        <p>Country Code සමග Phone Number එක ඇතුළත් කරන්න</p>
        <input type="text" id="phone" placeholder="e.g. 9471xxxxxxx" />
        <button class="btn-pair" id="btn" onclick="getPair()">GET PAIRING CODE</button>
        <button class="btn-clean" onclick="cleanSession()">CLEAN PREVIOUS SESSION</button>
        <div class="code-box" id="codeBox" onclick="copy()"></div>
        <p id="hint" style="display:none; margin-top:10px; font-size:11px; color:#aaa;">Click to copy. WhatsApp එකෙහි Link with phone number වෙත දමන්න.</p>
      </div>

      <script>
        async function getPair() {
          const num = document.getElementById('phone').value.replace(/[^0-9]/g, '');
          if (!num || num.length < 10) return alert('Phone number එක නිවැරදිව දමන්න!');
          const btn = document.getElementById('btn');
          const box = document.getElementById('codeBox');
          const hint = document.getElementById('hint');
          btn.innerText = 'GENERATING...';
          btn.disabled = true;
          box.style.display = 'none';

          try {
            const res = await fetch('/pair?num=' + num);
            const data = await res.json();
            if (data.code) {
              box.innerText = data.code;
              box.style.display = 'block';
              hint.style.display = 'block';
              navigator.clipboard.writeText(data.code).catch(()=>{});
            } else {
              alert(data.error || 'Connection Failed! Reload කර නැවත බලන්න.');
            }
          } catch(e) {
            alert('Error generating code!');
          }
          btn.innerText = 'GET PAIRING CODE';
          btn.disabled = false;
        }

        async function cleanSession() {
          const num = document.getElementById('phone').value.replace(/[^0-9]/g, '');
          if (!num) return alert('Phone number එක ඇතුළත් කරන්න!');
          const res = await fetch('/reset-num?num=' + num);
          const data = await res.json();
          if (data.success) alert('Session Cleared! දැන් අලුතින් Code ලබාගන්න.');
        }

        function copy() {
          navigator.clipboard.writeText(document.getElementById('codeBox').innerText);
          alert('Copied to Clipboard!');
        }
      </script>
    </body>
    </html>
  `;
}

// Command Handler
function handleMessages(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg || !msg.message || msg.key?.remoteJid?.endsWith('@newsletter')) return;

      const chatJid = msg.key.remoteJid;
      const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        ''
      ).trim();

      if (!text.startsWith('.') && !text.startsWith('!') && !text.startsWith('#')) return;

      const args = text.slice(1).trim().split(/ +/);
      const cmdName = args.shift().toLowerCase();
      const cmd = commands.get(cmdName);

      if (cmd) {
        const executor = typeof cmd === 'function' ? cmd : (cmd.execute || cmd.run);
        if (executor) {
          const reply = async (content) => {
            const payload = typeof content === 'string' ? { text: content } : content;
            return sock.sendMessage(chatJid, payload, { quoted: msg }).catch(() => sock.sendMessage(chatJid, payload));
          };
          await executor(sock, msg, args, chatJid, reply, { isOwner: true });
        }
      }
    } catch (e) {}
  });
}

// WhatsApp Connector
async function connectWhatsApp(phoneNumber) {
  if (activeSessions[phoneNumber]) {
    try {
      activeSessions[phoneNumber].ev.removeAllListeners();
      activeSessions[phoneNumber].ws?.close();
    } catch (e) {}
    delete activeSessions[phoneNumber];
  }

  const { state, saveCreds, backupToMongo, clearSessionData } = await useHybridAuthState(phoneNumber);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })) },
    logger: pino({ level: 'fatal' }),
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    markOnlineOnConnect: true,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000
  });

  activeSessions[phoneNumber] = sock;

  sock.ev.on('creds.update', async () => {
    await saveCreds();
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log(`✅ [${phoneNumber}] WhatsApp Link සාර්ථකයි! Device Connected.`);
      await backupToMongo(); // Connected වූ සැනින් MongoDB එකට push වේ
      handleMessages(sock);
    } else if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Closed (${phoneNumber}):`, reason);

      if (reason === DisconnectReason.loggedOut || reason === 401) {
        console.log(`❌ Logged out (${phoneNumber})`);
        delete activeSessions[phoneNumber];
        await clearSessionData();
      } else {
        setTimeout(() => connectWhatsApp(phoneNumber), 4000);
      }
    }
  });

  return sock;
}

// Server
async function startServer() {
  const app = express();
  const port = process.env.PORT || 3000;
  app.use(express.json());

  app.get('/', (req, res) => res.send(renderPortalHtml()));

  app.get('/reset-num', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.status(400).json({ error: 'Number required' });
    num = num.replace(/[^0-9]/g, '');

    try {
      const { clearSessionData } = await useHybridAuthState(num);
      await clearSessionData();
      if (activeSessions[num]) {
        activeSessions[num].ev.removeAllListeners();
        activeSessions[num].ws?.close();
        delete activeSessions[num];
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/pair', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.status(400).json({ error: 'Number required' });
    num = num.replace(/[^0-9]/g, '');

    try {
      const { clearSessionData } = await useHybridAuthState(num);
      await clearSessionData();

      const sock = await connectWhatsApp(num);
      await delay(3500);

      if (!sock.authState.creds.registered) {
        let code = await sock.requestPairingCode(num);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        console.log(`🔑 Code for ${num}: ${code}`);
        return res.json({ code });
      } else {
        return res.status(400).json({ error: 'Already registered! Clean session.' });
      }
    } catch (err) {
      console.log('Pair Error:', err.message);
      return res.status(500).json({ error: 'Rate limited. Try in 15 seconds!' });
    }
  });

  app.listen(port, () => console.log(`🚀 [${BOT_NAME}] Server running on port ${port}`));

  // Saved DB Sessions Reconnect
  try {
    const saved = await Auth.find({}).lean();
    for (const s of saved) {
      await connectWhatsApp(s._id);
      await delay(5000);
    }
  } catch (e) {}
}

async function main() {
  try {
    loadAllCommands();
    await mongoose.connect(MONGODB_URI);
    console.log('🍃 MongoDB Connected!');
    await startServer();
  } catch (e) {
    console.log('Mongo Error:', e.message);
  }
}

main();

