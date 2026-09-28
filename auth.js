const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const sessionDir = path.join(__dirname, 'session');

async function getPairingCode(phoneNumber, onPairCode) {
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.macOS('Desktop')
  });

  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    await delay(3000);
    const code = await sock.requestPairingCode(cleanNumber);
    if (onPairCode) onPairCode(code);
  }

  return sock;
}

module.exports = { getPairingCode, sessionDir };
