const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { 
  default: makeWASocket, 
  fetchLatestBaileysVersion, 
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const sessionPath = path.join(__dirname, 'session');

// MongoDB Schema
const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  files: { type: Map, of: String }
});
const SessionModel = mongoose.models.Session || mongoose.model('Session', SessionSchema);

// MongoDB එකෙන් session එක restore කරගැනීම
async function restoreSessionFromMongo() {
  try {
    const doc = await SessionModel.findOne({ sessionId: 'dark_dinu_session' });
    if (!doc || !doc.files || doc.files.size === 0) return false;

    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    for (let [fileName, content] of doc.files.entries()) {
      fs.writeFileSync(path.join(sessionPath, fileName), content, 'utf-8');
    }
    return true;
  } catch (err) {
    console.error('❌ Session restore error:', err);
    return false;
  }
}

// Local Session files MongoDB එකට save කිරීම
async function backupSessionToMongo() {
  try {
    if (!fs.existsSync(sessionPath)) return;
    const fileList = fs.readdirSync(sessionPath);
    const filesMap = new Map();

    for (let file of fileList) {
      const filePath = path.join(sessionPath, file);
      if (fs.statSync(filePath).isFile()) {
        filesMap.set(file, fs.readFileSync(filePath, 'utf-8'));
      }
    }

    await SessionModel.findOneAndUpdate(
      { sessionId: 'dark_dinu_session' },
      { files: filesMap },
      { upsert: true, new: true }
    );
    console.log('⚡ [DARK DINU] Session synced with MongoDB!');
  } catch (err) {
    console.error('❌ Session backup error:', err);
  }
}

let activeSocket = null;

// QR/Handshake event එක fully ready වන තෙක් රැඳී සිට pairing code එක ලබාගැනීම
async function createPairingSocket(phoneNumber, onOpenConnection) {
  // පරණ හිරවුණු session සම්පූර්ණයෙන්ම clear කිරීම
  if (activeSocket) {
    try { activeSocket.end(); } catch (e) {}
    activeSocket = null;
  }

  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }
  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: 'silent' });

  activeSocket = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    browser: Browsers.macOS('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 15000
  });

  activeSocket.ev.on('creds.update', async () => {
    await saveCreds();
    await backupSessionToMongo();
  });

  activeSocket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      console.log('🎉 [DARK DINU] WhatsApp LINKED & VERIFIED SUCCESSFULLY!');
      await backupSessionToMongo();
      if (onOpenConnection) onOpenConnection(activeSocket);
    } else if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut && code !== 401) {
        console.log('[DARK DINU] Connection syncing in progress...');
      }
    }
  });

  // WhatsApp Handshake එක ready වන තුරු (QR frame එක එනකම්) රැඳී සිටීම
  return new Promise((resolve, reject) => {
    let codeRequested = false;
    const timeout = setTimeout(() => {
      if (!codeRequested) {
        reject(new Error('WhatsApp handshake timeout. Please try again.'));
      }
    }, 25000);

    activeSocket.ev.on('connection.update', async (update) => {
      const { qr } = update;
      // Socket එක WhatsApp server එකත් එක්ක handshake එක හදාගත් සැණින් Pairing Code එක request කරයි
      if (qr && !activeSocket.authState.creds.registered && !codeRequested) {
        codeRequested = true;
        clearTimeout(timeout);
        try {
          let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
          const code = await activeSocket.requestPairingCode(cleanNumber);
          resolve(code);
        } catch (err) {
          reject(err);
        }
      }
    });
  });
}

module.exports = {
  createPairingSocket,
  restoreSessionFromMongo,
  backupSessionToMongo,
  sessionPath,
  SessionModel,
  getActiveSocket: () => activeSocket
};
