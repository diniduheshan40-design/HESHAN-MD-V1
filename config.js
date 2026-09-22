require('dotenv').config();

// Helper to safely parse multiple API keys separated by commas
const parseKeys = () => {
  const envKeys = process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "";
  const keys = envKeys.split(',').map(k => k.trim()).filter(Boolean);
  return keys;
};

// ☠️ DARK DINU Mainframe MongoDB Connection
const DEFAULT_MONGO = "mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/HESHAN-MD?retryWrites=true&w=majority&appName=Cluster0";
const rawMongoUri = process.env.MONGODB_URI || DEFAULT_MONGO;
const MONGODB_URI = rawMongoUri.includes('maxPoolSize') 
  ? rawMongoUri 
  : `${rawMongoUri}&maxPoolSize=10`;

module.exports = {
  // Database URL (Safe Connection Pool)
  MONGODB_URI,
  
  // OpenRouter API Keys Array
  OPENROUTER_KEYS: parseKeys(),
  OPENROUTER_API_KEY: (process.env.OPENROUTER_API_KEY || "").trim(),
  
  // Default AI Model
  AI_MODEL: (process.env.AI_MODEL || "deepseek/deepseek-chat").trim(),

  // Bot Metadata & Hacker Persona Branding
  BOT_NAME: (process.env.BOT_NAME || "DARK DINU").trim(),
  OWNER_NAME: (process.env.OWNER_NAME || "DARK DINU ROOT").trim(),
  OWNER_NUMBER: (process.env.OWNER_NUMBER || "94719845166").replace(/[^0-9]/g, ''),
  PORT: process.env.PORT || 3000,
  
  // Hacker Aesthetic Formatting Symbols
  PREFIX: process.env.PREFIX || ".",
  BOT_FOOTER: "> ☠️ ᴅᴀʀᴋ ᴅɪɴᴜ ᴇxᴄʟᴜꜱɪᴠᴇ ꜱʏꜱᴛᴇᴍ",
  THEME_EMOJI: "☠️",
  SYSTEM_STATUS: "MAIN_NODE_ARMED"
};
