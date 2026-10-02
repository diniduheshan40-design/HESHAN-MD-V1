const mongoose = require("mongoose");

const BotSettingsSchema = new mongoose.Schema(
  {
    botNumber: { type: String, unique: true, required: true },
    botName: { type: String, default: "DARK DINU MD" },
    botLogo: { type: String, default: "https://files.catbox.moe/3fxa4u.jpeg" },
    prefix: { type: String, default: "." },
    workMode: { type: String, default: "public" }, // "public", "private", "inbox", "groups"
    presence: { type: String, default: "off" },    // "off", "typing", "recording"
    statusSeen: { type: Boolean, default: true },
    statusReact: { type: String, default: "💚" },  // "off" or emoji
    antiViewRoute: { type: String, default: "me" }, // "me", "from"
    antiDeleteRoute: { type: String, default: "me" } // "me", "from"
  },
  { timestamps: true }
);

const BotSettingsModel =
  mongoose.models.DarkDinuSettings ||
  mongoose.model("DarkDinuSettings", BotSettingsSchema);

const settingsCache = new Map();

async function getBotSettings(botNumber) {
  const cleanNumber = String(botNumber || "").replace(/[^0-9]/g, "");
  if (!cleanNumber) return null;

  if (settingsCache.has(cleanNumber)) {
    return settingsCache.get(cleanNumber);
  }

  let config = await BotSettingsModel.findOne({ botNumber: cleanNumber });
  if (!config) {
    config = await BotSettingsModel.create({ botNumber: cleanNumber });
  }

  const data = config.toObject ? config.toObject() : config;
  settingsCache.set(cleanNumber, data);
  return data;
}

async function updateBotSettings(botNumber, updates) {
  const cleanNumber = String(botNumber || "").replace(/[^0-9]/g, "");
  if (!cleanNumber) return null;

  const updated = await BotSettingsModel.findOneAndUpdate(
    { botNumber: cleanNumber },
    { $set: updates },
    { new: true, upsert: true }
  );

  const data = updated.toObject ? updated.toObject() : updated;
  settingsCache.set(cleanNumber, data);
  return data;
}

module.exports = {
  getBotSettings,
  updateBotSettings,
  settingsCache
};
