require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const mongoose = require('mongoose');
const { default: makeWASocket, fetchLatestBaileysVersion, Browsers, DisconnectReason } = require('@whiskeysockets/baileys');
const { useMongoAuthState, getPairingCode, SessionModel } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ඔබ ලබාදුන් නිවැරදි MongoDB Connection String එක
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/HESHAN-MD?retryWrites=true&w=majority&appName=Cluster0";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sockInstance = null;

// ==========================================
// 1. Web Pairing Page (UI)
// ==========================================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>DARK DINU | PAIR CODE</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          background-color: #0b0c10;
          color: #c5c6c7;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
        }
        .card {
          background: #1f2833;
          border: 1px solid #e63946;
          box-shadow: 0 0 25px rgba(230, 57, 70, 0.4);
          border-radius: 12px;
          padding: 30px;
          text-align: center;
          max-width: 400px;
          width: 90%;
        }
        h2 { color: #e63946; margin-bottom: 20px; letter-spacing: 2px; }
        input {
          width: 100%;
          padding: 12px;
          margin: 12px 0;
          background: #0b0c10;
          border: 1px solid #45a29e;
          border-radius: 8px;
          color: #fff;
          box-sizing: border-box;
          font-size: 16px;
        }
        button {
          width: 100%;
          padding: 12px;
          background: #e63946;
          border: none;
          color: #fff;
          font-weight: bold;
          font-size: 16px;
          border-radius: 8px;
          cursor: pointer;
          transition: 0.3s;
        }
        button:hover { background: #c1121f; }
        .code-box {
          margin-top: 20px;
          padding: 15px;
          background: #0b0c10;
          border: 1px dashed #66fcf1;
          font-size: 24px;
          letter-spacing: 5px;
          color: #66fcf1;
          display: none;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>⚡ DARK DINU PAIR ⚡</h2>
        <p>WhatsApp අංකය ඇතුළත් කරන්න (උදා: 947xxxxxxxx):</p>
        <input type="text" id="phone" placeholder="94770000000" />
        <button onclick="requestPair()">GET PAIRING CODE</button>
        <div id="codeDisplay" class="code-box"></div>
      </div>

      <script>
        async function requestPair() {
          const num = document.getElementById('phone').value.trim();
          if (!num) return alert('කරුණාකර Phone Number එක ඇතුළත් කරන්න!');
          const btn = document.querySelector('button');
          btn.innerText = 'Connecting...';
          btn.disabled = true;

          try {
            const res = await fetch('/pair', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ number: num })
            });
            const data = await res.json();
            if (data.code) {
              const box = document.getElementById('codeDisplay');
              box.innerText = data.code;
              box.style.display = 'block';
            } else {
              alert(data.error || 'දෝෂයක් ඇති විය.');
            }
          } catch (e) {
            alert('Server error: ' + e.message);
          } finally {
            btn.innerText = 'GET PAIRING CODE';
            btn.disabled = false;
          }
        }
      </script>
    </body>
    </html>
  `);
});

app.post('/pair', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Phone number is required' });

  try {
    await getPairingCode(number, (code) => {
      return res.json({ code });
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`[DARK DINU] Web Server listening on port ${PORT}`));

// ==========================================
// 2. Command Handler Loading
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

// ==========================================
// 3. Bot Connection Lifecycle
// ==========================================
async function startBot() {
  const { state, saveCreds } = await useMongoAuthState();
  const { version } = await fetchLatestBaileysVersion();

  sockInstance = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.macOS('Desktop')
  });

  sockInstance.ev.on('creds.update', saveCreds);

  sockInstance.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('[DARK DINU] Connection closed. Reconnecting...', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✅ [DARK DINU] WhatsApp Connected Successfully via MongoDB Session!');
    }
  });

  sockInstance.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const chatJid = msg.key.remoteJid;
    const textMsg = 
      msg.message.conversation || 
      msg.message.extendedTextMessage?.text || 
      msg.message.imageMessage?.caption || '';

    const prefix = '.';
    if (!textMsg.startsWith(prefix)) return;

    const [cmdName, ...args] = textMsg.slice(prefix.length).trim().split(/ +/);
    const cmd = commands.get(cmdName.toLowerCase());

    if (cmd) {
      try {
        await cmd.execute(sockInstance, msg, args, chatJid);
      } catch (err) {
        console.error(`Error in ${cmdName}:`, err);
      }
    }
  });
}

// ==========================================
// 4. Database Connect & Bootstrap
// ==========================================
async function init() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ [DARK DINU] Connected to MongoDB (Database: HESHAN-MD)!');

    const existingSession = await SessionModel.findOne({ sessionId: 'dark_dinu_session' });
    if (existingSession) {
      startBot();
    }
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
  }
}

init();
