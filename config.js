require("dotenv").config();

module.exports = {
  // 🔑 OpenRouter API Configuration
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "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",
  // නොමිලේ දෙන සුපිරි models: "deepseek/deepseek-chat:free" හෝ "google/gemini-2.0-flash-exp:free"
  AI_MODEL: "deepseek/deepseek-chat:free",

  // 🎨 Logo URLs (පාට 3)
  BOT_LOGOS: [
    "https://files.catbox.moe/3fxa4u.jpeg",    // 🔴 1 වෙනි Logo එක
    "https://files.catbox.moe/koh9j8.jpeg",   // 🔵 2 වෙනි Logo එක
    "https://files.catbox.moe/jz25of.jpeg"   // 🟢 3 වෙනි Logo එක
  ],

  // මාරුවෙන් මාරුවට logo තෝරන helper
  _currentIndex: 0,
  getRandomLogo() {
    if (!this.BOT_LOGOS || this.BOT_LOGOS.length === 0) return null;
    const logo = this.BOT_LOGOS[this._currentIndex];
    this._currentIndex = (this._currentIndex + 1) % this.BOT_LOGOS.length;
    return logo;
  }
};
