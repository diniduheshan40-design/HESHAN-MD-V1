require("dotenv").config();

module.exports = {
  // 🔑 OpenRouter API Configuration
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  // නොමිලේ දෙන සුපිරි models: "deepseek/deepseek-chat:free" හෝ "google/gemini-2.0-flash-exp:free"
  AI_MODEL: "deepseek/deepseek-chat:free",

  // 🎨 Logo URLs (පාට 3)
  BOT_LOGOS: [
    "https://i.ibb.co/your-red-logo.jpg",    // 🔴 1 වෙනි Logo එක
    "https://i.ibb.co/your-blue-logo.jpg",   // 🔵 2 වෙනි Logo එක
    "https://i.ibb.co/your-green-logo.jpg"   // 🟢 3 වෙනි Logo එක
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
