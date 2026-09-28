require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const mongoose = require('mongoose');
const { 
  default: makeWASocket, 
  fetchLatestBaileysVersion, 
  useMultiFileAuthState, 
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason 
} = require('@whiskeysockets/baileys');

const { 
  requestPairCode, 
  restoreCredentials, 
  backupCredentials, 
  sessionDir 
} = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/HESHAN-MD?retryWrites=true&w=majority&appName=Cluster0";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let botSocket = null;

// ==========================================
// 1. Official Hacker Pairing Console (UI)
// ==========================================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>☠️ DARK DINU // MAINFRAME</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&family=Orbitron:wght@800;900&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background-color: #030406;
          color: #00ffaa;
          font-family: 'Fira Code', monospace;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        body::before {
          content: " ";
          position: fixed;
          inset: 0;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.04), rgba(0, 255, 170, 0.02), rgba(0, 0, 255, 0.04));
          z-index: 10;
          background-size: 100% 3px, 6px 100%;
          pointer-events: none;
        }
        .container { width: 92%; max-width: 460px; position: relative; z-index: 20; }
        .box {
          background: rgba(10, 12, 16, 0.96);
          border: 1px solid #ff0044;
          box-shadow: 0 0 35px rgba(255, 0, 68, 0.35);
          border-radius: 8px;
          padding: 30px 24px;
          text-align: center;
        }
        h1 {
          font-family: 'Orbitron', sans-serif;
          font-size: 26px;
          letter-spacing: 3px;
          color: #fff;
          text-shadow: 0 0 12px #ff0044, 0 0 24px #ff0044;
          margin-bottom: 5px;
        }
        p.desc { font-size: 11px; letter-spacing: 2px; color: #737c8c; margin-bottom: 25px; text-transform: uppercase; }
        .group { text-align: left; margin-bottom: 20px; }
        label { font-size: 11px; letter-spacing: 1.5px; color: #ff3366; display: block; margin-bottom: 8px; text-transform: uppercase; }
        input {
          width: 100%;
          padding: 14px;
          background: #050608;
          border: 1px solid #232936;
          color: #00ffaa;
          font-family: 'Fira Code', monospace;
          font-size: 16px;
          border-radius: 4px;
          outline: none;
        }
        input:focus { border-color: #ff0044; box-shadow: 0 0 15px rgba(255, 0, 68, 0.4); }
        button {
          width: 100%;
          padding: 14px;
          background: #ff0044;
          border: none;
          color: #fff;
          font-family: 'Orbitron', sans-serif;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 2px;
          border-radius: 4px;
          cursor: pointer;
          box-shadow: 0 0 20px rgba(255, 0, 68, 0.4);
          transition: 0.3s;
        }
        button:hover { background: #d60039; }
        button:disabled { background: #252833; color: #616675; cursor: not-allowed; }
        .result {
          display: none;
          margin-top: 22px;
          padding: 18px;
          background: #050608;
          border: 1px dashed #ff0044;
          border-radius: 4px;
        }
        .code {
          font-family: 'Orbitron', monospace;
          font-size: 28px;
          font-weight: 900;
          letter-spacing: 6px;
          color: #fff;
          text-shadow: 0 0 15px #00ffaa;
          padding: 8px 0;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="box">
          <h1>⚡ DARK DINU ⚡</h1>
          <p class="desc">> SYSTEM INJECTOR V2.0.0</p>

          <div class="group">
            <label>> Target Phone Number (with Country Code)</label>
            <input type="text" id="phone" placeholder="94770000000" autocomplete="off" />
          </div>

          <button id="btn" onclick="getPair()">[ INITIALIZE LINK ]</button>

          <div id="resBox" class="result">
            <div style="font-size: 10px; color: #ff3366;">> CLICK CODE TO COPY</div>
            <div id="codeBadge" class="code" onclick="copy()">--------</div>
            <div id="statusTag" style="font-size: 10px; color: #798294;">> READY FOR WHATSAPP PAIRING</div>
          </div>
        </div>
      </div>

      <script>
        async function getPair() {
          const number = document.getElementById('phone').value.trim();
          if (!number) return alert('Phone number එක ඇතුළත් කරන්න!');

          const btn = document.getElementById('btn');
          btn.innerText = 'INITIALIZING PROTOCOL...';
          btn.disabled = true;

          try {
            const res = await fetch('/pair', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ number })
            });
            const data = await res.json();
            if (data.code) {
              document.getElementById('resBox').style.display = 'block';
              document.getElementById('codeBadge').innerText = data.code;
              btn.innerText = 'ENTER CODE IN WHATSAPP NOW!';
            } else {
              alert(data.error || 'Pairing error!');
              btn.innerText = '[ INITIALIZE LINK ]';
              btn.disabled = false;
            }
          } catch (e) {
            alert('Host failure: ' + e.message);
            btn.innerText = '[ INITIALIZE LINK ]';
            btn.disabled = false;
          }
        }

        function copy() {
          const code = document.getElementById('codeBadge').innerText;
          if (code && code !== '--------') {
            navigator.clipboard.writeText(code);
            const tag = document.getElementById('statusTag');
            tag.innerText = '>> COPIED! ENTER IN WHATSAPP <<';
            tag.style.color = '#00ffaa';
            setTimeout(() => {
              tag.innerText = '> READY FOR WHATSAPP PAIRING';
              tag.style.color = '#798294';
            }, 3000);
          }
        }
      </script>
    </body>
    </html>
  `);
});

app.post('/pair', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Phone number parameter required.' });

  try {
    const code = await requestPairCode(number, (socket) => {
      botSocket = socket;
      setupMessageHandler(botSocket);
    });
    return res.json({ code });
  } catch (err) {
    console.error('Pairing Error:', err);
    return res.status(500).json({ error: err.message || 'Mainframe rejection.' });
  }
});

app.listen(PORT, () => console.log(`⚡ [DARK DINU] Web Server live on port ${PORT}`));

// ==========================================
// 2. Command Loading
// ==========================================
const commands = new Map();
const commandsDir = path.join(__dirname, 'commands');

if (fs.existsSync(commandsDir)) {
  fs.readdirSync(commandsDir).forEach(file => {
    if (file.endsWith('.js')) {
      const cmd = require(path.join(commandsDir, file));
      if (cmd.name) {
        commands.set(cmd.name, cmd);
        if (cmd.alias && Array.isArray(cmd.alias)) {
          cmd.alias.forEach(al => commands.set(al, cmd));
        }
      }
    }
  });
}

function setupMessageHandler(sock) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const chatJid = msg.key.remoteJid;
    const textMsg = (
      msg.message.conversation || 
      msg.message.extendedTextMessage?.text || 
      msg.message.imageMessage?.caption || ''
    ).trim();

    // 1, 2, 3 Interactive replies for songs
    const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
    if (quotedMsgId && ['1', '2', '3'].includes(textMsg)) {
      const songCmd = commands.get('song');
      if (songCmd) {
        return await songCmd.execute(sock, msg, [textMsg], chatJid);
      }
    }

    const prefix = '.';
    if (!textMsg.startsWith(prefix)) return;

    const [cmdName, ...args] = textMsg.slice(prefix.length).trim().split(/ +/);
    const cmd = commands.get(cmdName.toLowerCase());

    if (cmd) {
      try {
        await cmd.execute(sock, msg, args, chatJid);
      } catch (err) {
        console.error(`Execution error in ${cmdName}:`, err);
      }
    }
  });
}

// ==========================================
// 3. Bot Connection Lifecycle
// ==========================================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: 'silent' });

  botSocket = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    browser: Browsers.windows('Desktop')
  });

  botSocket.ev.on('creds.update', async () => {
    await saveCreds();
    await backupCredentials();
  });

  botSocket.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('⚡ [DARK DINU] Link dropped. Reconnecting...', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('☠️ [DARK DINU] SYSTEM FULLY CONNECTED VIA MONGODB!');
    }
  });

  setupMessageHandler(botSocket);
}

// ==========================================
// 4. Initialize Database & Session Restore
// ==========================================
async function init() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ [DARK DINU] Connected to MongoDB (Cluster: HESHAN-MD)!');

    const restored = await restoreCredentials();
    if (restored && fs.existsSync(path.join(sessionDir, 'creds.json'))) {
      console.log('🔄 [DARK DINU] Cloud session detected. Booting bot daemon...');
      startBot();
    } else {
      console.log('ℹ️ [DARK DINU] No saved session found. Please pair via Web Dashboard.');
    }
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
  }
}

init();
