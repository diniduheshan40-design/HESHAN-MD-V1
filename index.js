require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const mongoose = require('mongoose');
const { default: makeWASocket, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const { useMongoAuthState, requestPairCode, SessionModel } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/HESHAN-MD?retryWrites=true&w=majority&appName=Cluster0";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sockInstance = null;

// ==========================================
// 1. Cyber Dark-Red Premium Pairing UI
// ==========================================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>⚡ DARK DINU | CYBER PAIR ENGINE ⚡</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;900&family=Rajdhani:wght@500;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: #050608;
          background-image: 
            radial-gradient(circle at 15% 20%, rgba(255, 0, 55, 0.15), transparent 40%),
            radial-gradient(circle at 85% 80%, rgba(255, 0, 55, 0.1), transparent 40%),
            linear-gradient(180deg, #050608 0%, #0c0204 100%);
          color: #ffffff;
          font-family: 'Rajdhani', sans-serif;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow-x: hidden;
        }
        .container {
          width: 92%;
          max-width: 440px;
          position: relative;
        }
        .glow-box {
          position: absolute;
          inset: -2px;
          background: linear-gradient(90deg, #ff0037, #ff5e00, #ff0037);
          border-radius: 20px;
          filter: blur(12px);
          opacity: 0.6;
          animation: pulse 4s ease-in-out infinite;
          z-index: 0;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; filter: blur(10px); }
          50% { opacity: 0.75; filter: blur(16px); }
        }
        .card {
          position: relative;
          z-index: 1;
          background: rgba(14, 16, 20, 0.85);
          backdrop-filter: blur(25px);
          border: 1px solid rgba(255, 0, 55, 0.35);
          border-radius: 18px;
          padding: 35px 25px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.9);
          text-align: center;
        }
        .header-tag {
          font-family: 'Orbitron', sans-serif;
          font-size: 11px;
          letter-spacing: 4px;
          color: #ff0037;
          text-transform: uppercase;
          margin-bottom: 8px;
          display: inline-block;
          background: rgba(255, 0, 55, 0.12);
          padding: 4px 14px;
          border-radius: 50px;
          border: 1px solid rgba(255, 0, 55, 0.3);
        }
        h1 {
          font-family: 'Orbitron', sans-serif;
          font-size: 26px;
          font-weight: 900;
          letter-spacing: 2px;
          color: #ffffff;
          text-shadow: 0 0 15px rgba(255, 0, 55, 0.8);
          margin-bottom: 6px;
        }
        p.subtext {
          font-size: 14px;
          color: #8c909a;
          margin-bottom: 25px;
          font-weight: 500;
        }
        .input-wrap {
          text-align: left;
          margin-bottom: 20px;
        }
        label {
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #ff4769;
          font-weight: 700;
          margin-bottom: 8px;
          display: block;
        }
        input {
          width: 100%;
          padding: 14px 16px;
          background: #090a0d;
          border: 1.5px solid #232730;
          border-radius: 10px;
          color: #ffffff;
          font-family: 'Rajdhani', sans-serif;
          font-size: 18px;
          font-weight: 600;
          letter-spacing: 1px;
          outline: none;
          transition: 0.3s;
        }
        input:focus {
          border-color: #ff0037;
          box-shadow: 0 0 15px rgba(255, 0, 55, 0.35);
        }
        button {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #ff0037, #b30027);
          border: none;
          border-radius: 10px;
          color: #ffffff;
          font-family: 'Orbitron', sans-serif;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 2px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 0 20px rgba(255, 0, 55, 0.4);
        }
        button:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 30px rgba(255, 0, 55, 0.7);
        }
        button:disabled {
          background: #2a2c33;
          box-shadow: none;
          cursor: not-allowed;
          transform: none;
        }
        .code-container {
          display: none;
          margin-top: 25px;
          padding: 20px 15px;
          background: #08090c;
          border: 1.5px dashed #ff0037;
          border-radius: 12px;
          animation: fadeIn 0.4s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .code-title {
          font-size: 12px;
          letter-spacing: 2px;
          color: #ff4769;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .code-badge {
          font-family: 'Orbitron', monospace;
          font-size: 26px;
          font-weight: 900;
          color: #00ffaa;
          letter-spacing: 6px;
          text-shadow: 0 0 15px rgba(0, 255, 170, 0.6);
          margin-bottom: 12px;
          cursor: pointer;
        }
        .copy-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          font-family: 'Rajdhani', sans-serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 1px;
          color: #bbb;
          padding: 6px 16px;
          border-radius: 6px;
          cursor: pointer;
          width: auto;
          box-shadow: none;
          transition: 0.2s;
        }
        .copy-btn:hover {
          background: #ff0037;
          color: #fff;
          border-color: #ff0037;
        }
        .footer {
          margin-top: 20px;
          font-size: 12px;
          color: #555861;
          letter-spacing: 1px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="glow-box"></div>
        <div class="card">
          <div class="header-tag">Official Deployment Engine</div>
          <h1>⚡ DARK DINU ⚡</h1>
          <p class="subtext">Next-Gen Multi-Device WhatsApp Pairing Engine</p>

          <div class="input-wrap">
            <label>WhatsApp Number</label>
            <input type="text" id="phone" placeholder="94770000000" autocomplete="off" />
          </div>

          <button id="submitBtn" onclick="requestPair()">GENERATE PAIR CODE</button>

          <div id="codeDisplay" class="code-container">
            <div class="code-title">Tap Code to Copy</div>
            <div id="codeText" class="code-badge" onclick="copyCode()">--------</div>
            <button class="copy-btn" onclick="copyCode()">📋 COPY CODE</button>
          </div>

          <div class="footer">
            ⚡ DARK DINU MD • V2.0.0
          </div>
        </div>
      </div>

      <script>
        async function requestPair() {
          const numInput = document.getElementById('phone');
          const number = numInput.value.trim();
          if (!number) return alert('කරුණාකර ඔබගේ WhatsApp අංකය ඇතුළත් කරන්න!');

          const btn = document.getElementById('submitBtn');
          btn.innerText = 'GENERATING PAIR CODE...';
          btn.disabled = true;

          try {
            const res = await fetch('/pair', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ number })
            });

            const data = await res.json();
            if (data.code) {
              const display = document.getElementById('codeDisplay');
              const codeText = document.getElementById('codeText');
              codeText.innerText = data.code;
              display.style.display = 'block';
              btn.innerText = 'CODE READY! ENTER IN WHATSAPP';
            } else {
              alert(data.error || 'Pairing error!');
              btn.innerText = 'GENERATE PAIR CODE';
              btn.disabled = false;
            }
          } catch (e) {
            alert('Server error: ' + e.message);
            btn.innerText = 'GENERATE PAIR CODE';
            btn.disabled = false;
          }
        }

        function copyCode() {
          const code = document.getElementById('codeText').innerText;
          if (code && code !== '--------') {
            navigator.clipboard.writeText(code);
            alert('Pairing Code එක Copy විය: ' + code);
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
    const code = await requestPairCode(number, () => {
      // Background handshake verify වූ විට කෙලින්ම bot connection එක live කරවීම
      if (!sockInstance) startBot();
    });
    return res.json({ code });
  } catch (err) {
    console.error('Pairing Error:', err);
    return res.status(500).json({ error: err.message || 'Error generating pair code' });
  }
});

app.listen(PORT, () => console.log(`⚡ [DARK DINU] Web Server listening on port ${PORT}`));

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
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  });

  sockInstance.ev.on('creds.update', saveCreds);

  sockInstance.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('[DARK DINU] Connection closed. Reconnecting...', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✅ [DARK DINU] Connected Successfully via MongoDB Session!');
    }
  });

  sockInstance.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const chatJid = msg.key.remoteJid;
    const textMsg = (
      msg.message.conversation || 
      msg.message.extendedTextMessage?.text || 
      msg.message.imageMessage?.caption || ''
    ).trim();

    // 1, 2, 3 Interactive replies
    const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
    if (quotedMsgId && ['1', '2', '3'].includes(textMsg)) {
      const songCmd = commands.get('song');
      if (songCmd) {
        return await songCmd.execute(sockInstance, msg, [textMsg], chatJid);
      }
    }

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
// 4. Initialize Database
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
