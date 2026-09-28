const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { 
  default: makeWASocket, 
  delay, 
  fetchLatestBaileysVersion, 
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const sessionPath = path.join(__dirname, 'session');

// MongoDB Model for Session Storage
const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  files: { type: Map, of: String }
});
const SessionModel = mongoose.models.Session || mongoose.model('Session', SessionSchema);

async function restoreSessionFromMongo() {
  try {
    const doc = await SessionModel.findOne({ sessionId: 'dark_dinu_session' });
    if (!doc || !doc.files) return false;
    
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    for (let [fileName, content] of doc.files.entries()) {
      fs.writeFileSync(path.join(sessionPath, fileName), content, 'utf-8');
    }
    return true;
  } catch (err) {
    console.error('[DATABASE] Session restore error:', err);
    return false;
  }
}

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
    console.log('⚡ [DARK DINU] Cloud Auth Matrix Synced to MongoDB!');
  } catch (err) {
    console.error('[DATABASE] Session backup error:', err);
  }
}

let activePairSocket = null;

async function requestPairCode(phoneNumber, onConnected) {
  // Clear any incomplete session state
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }
  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  if (activePairSocket) {
    try { activePairSocket.end(); } catch (e) {}
  }

  activePairSocket = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '120.0.6099.199'],
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
    connectTimeoutMs: 90000,
    defaultQueryTimeoutMs: 90000,
    keepAliveIntervalMs: 15000,
    retryRequestDelayMs: 2500
  });

  activePairSocket.ev.on('creds.update', async () => {
    await saveCreds();
    await backupSessionToMongo();
  });

  activePairSocket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log('☠️ [DARK DINU CORE] AUTHENTICATION GRANTED! SYSTEM ONLINE.');
      await backupSessionToMongo();
      if (onConnected) onConnected(activePairSocket);
    } else if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log('[DARK DINU CORE] Secure handshake tunnel maintaining...');
      }
    }
  });

  let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  await delay(3500);
  const code = await activePairSocket.requestPairingCode(cleanNumber);
  return code;
}

module.exports = {
  requestPairCode,
  restoreSessionFromMongo,
  backupSessionToMongo,
  sessionPath,
  SessionModel
};
