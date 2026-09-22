const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');

const AuthSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    data: { type: Object, required: true }
  },
  { versionKey: false }
);

const Auth = mongoose.models.Auth || mongoose.model('Auth', AuthSchema);

async function useHybridAuthState(sessionId) {
  const cleanId = String(sessionId).replace(/[^0-9]/g, '');
  const sessionDir = path.join(__dirname, 'sessions', `session-${cleanId}`);

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  // MongoDB එකේ කලින් save කරපු session එකක් තියෙනවා නම් Local එකට restore කරනවා
  try {
    const backup = await Auth.findById(cleanId).lean();
    if (backup && backup.data) {
      for (const [file, content] of Object.entries(backup.data)) {
        fs.writeFileSync(path.join(sessionDir, file), content, 'utf-8');
      }
    }
  } catch (e) {}

  // Local File System Auth (Ultra fast - No WebSocket Timeout)
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  // Link වුණාට පස්සේ සම්පූර්ණ session එක MongoDB එකට sync කරන function එක
  const backupToMongo = async () => {
    try {
      if (!fs.existsSync(sessionDir)) return;
      const files = fs.readdirSync(sessionDir);
      const sessionData = {};
      for (const file of files) {
        sessionData[file] = fs.readFileSync(path.join(sessionDir, file), 'utf-8');
      }
      await Auth.findByIdAndUpdate(cleanId, { data: sessionData }, { upsert: true });
      console.log(`☁️ [${cleanId}] Session backed up to MongoDB successfully!`);
    } catch (e) {
      console.error('Mongo Backup Error:', e.message);
    }
  };

  const clearSessionData = async () => {
    try {
      await Auth.findByIdAndDelete(cleanId);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch (e) {}
  };

  return { state, saveCreds, backupToMongo, clearSessionData };
}

module.exports = { Auth, useHybridAuthState };

