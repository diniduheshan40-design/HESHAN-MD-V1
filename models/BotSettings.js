const mongoose = require('mongoose');

const BotSettingsSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Bot Phone Number (e.g. 9470xxxxxxx)
  workMode: { type: String, default: 'public' }, // 'public', 'private', 'inbox', 'groups'
  autoAiInbox: { type: Boolean, default: true },
  autoStatusSeen: { type: Boolean, default: true },
  statusReact: { type: Boolean, default: true },
  statusReactEmoji: { type: String, default: '💐' },
  ownerReact: { type: Boolean, default: true },
  ownerReactEmoji: { type: String, default: '👑' },
  securityPin: { type: String, default: '1234' } // 🔐 Default Password / PIN
});

const BotSettings = mongoose.models.BotSettings || mongoose.model('BotSettings', BotSettingsSchema);

// Cache store for super-fast execution
global.botSettingsCache = new Map();

async function getBotSettings(botNumber) {
  if (global.botSettingsCache.has(botNumber)) {
    return global.botSettingsCache.get(botNumber);
  }
  let settings = await BotSettings.findById(botNumber);
  if (!settings) {
    settings = await BotSettings.create({ _id: botNumber });
  }
  const cleanSettings = settings.toObject();
  global.botSettingsCache.set(botNumber, cleanSettings);
  return cleanSettings;
}

async function updateBotSettings(botNumber, updates) {
  const updated = await BotSettings.findByIdAndUpdate(
    botNumber,
    { $set: updates },
    { new: true, upsert: true }
  );
  const cleanSettings = updated.toObject();
  global.botSettingsCache.set(botNumber, cleanSettings);
  return cleanSettings;
}

module.exports = { BotSettings, getBotSettings, updateBotSettings };

