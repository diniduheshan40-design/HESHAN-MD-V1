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

// MongoDB එකෙන් Files ටික Local Folder එකට Restore කිරීම
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
    console.error('Session restore error:', err);
    return false;
  }
}

// Local Session Folder එක MongoDB එකට Sync කිරීම
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
    console.log('☁️ [DARK DINU] Session backed up to MongoDB successfully!');
  } catch (err) {
    console.error('Session backup error:', err);
  }
}

let activePairSocket = null;

async function requestPairCode(phoneNumber, onConnected) {
  // පරණ session clear කරමු
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
    browser: ['Chrome (Linux)', 'Chrome', '122.0.0.0'],
    syncFullHistory: false,
    generateHighQualityLinkPreview: true
  });

  activePairSocket.ev.on('creds.update', async () => {
    await saveCreds();
    await backupSessionToMongo(); // Credentials update වෙන හැමවිටම MongoDB එකට backup වේ
  });

  activePairSocket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log('🎉 [DARK DINU] WhatsApp Connected & Verified!');
      await backupSessionToMongo();
      if (onConnected) onConnected(activePairSocket);
    } else if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log('[DARK DINU] Handshake in progress...');
      }
    }
  });

  let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  await delay(3000);
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
