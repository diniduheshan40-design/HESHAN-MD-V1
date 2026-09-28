const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { 
  default: makeWASocket, 
  delay, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion, 
  makeCacheableSignalKeyStore,
  DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const sessionDir = path.join(__dirname, 'session');

const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  creds: { type: String, required: true }
});
const SessionModel = mongoose.models.Session || mongoose.model('Session', SessionSchema);

async function restoreCredentials() {
  try {
    const record = await SessionModel.findOne({ sessionId: 'dark_dinu_session' });
    if (!record || !record.creds) return false;

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const credsJson = Buffer.from(record.creds, 'base64').toString('utf-8');
    fs.writeFileSync(path.join(sessionDir, 'creds.json'), credsJson, 'utf-8');
    return true;
  } catch (e) {
    console.error('Session restore failed:', e);
    return false;
  }
}

async function backupCredentials() {
  try {
    const credsPath = path.join(sessionDir, 'creds.json');
    if (!fs.existsSync(credsPath)) return;

    const credsContent = fs.readFileSync(credsPath, 'utf-8');
    const base64Creds = Buffer.from(credsContent).toString('base64');

    await SessionModel.findOneAndUpdate(
      { sessionId: 'dark_dinu_session' },
      { creds: base64Creds },
      { upsert: true, new: true }
    );
    console.log('⚡ [DARK DINU] Session secured in MongoDB successfully!');
  } catch (e) {
    console.error('Session backup failed:', e);
  }
}

let activeSocket = null;

async function requestPairCode(phoneNumber, onLoginSuccess) {
  if (activeSocket) {
    try { activeSocket.end(); } catch (e) {}
    activeSocket = null;
  }

  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
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
    // Standard Linux Chrome User-Agent (WhatsApp rejects non-standard desktop agents)
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
    markOnlineOnConnect: false
  });

  activeSocket.ev.on('creds.update', async () => {
    await saveCreds();
    await backupCredentials();
  });

  activeSocket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'open') {
      console.log('🎉 [DARK DINU] WHATSAPP DEVICE LINKED SUCCESSFULLY!');
      await backupCredentials();
      if (onLoginSuccess) onLoginSuccess(activeSocket);
    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        console.log('[DARK DINU] Maintaining socket connection...');
      }
    }
  });

  let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');

  // Socket එක WhatsApp WebSocket stream එක register කරගන්න තත්පර 4ක් ඉඩ දෙන්න
  await delay(4000);
  const code = await activeSocket.requestPairingCode(cleanNumber);
  return code;
}

module.exports = {
  requestPairCode,
  restoreCredentials,
  backupCredentials,
  sessionDir,
  SessionModel
};
