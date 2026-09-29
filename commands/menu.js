const config = require("../config");

module.exports = {
  name: "menu",
  alias: ["help", "list", "panel", "1", "2", "3", "4", "5", "6"],
  desc: "Interactive category menu",
  async execute(sock, msg, args, from, { sender, DEVELOPER_NAME, prefix }) {
    try {
      await sock.sendMessage(from, { react: { text: "📃", key: msg.key } });

      const rawUser = sender ? sender.split("@")[0].replace(/[^0-9]/g, "") : "User";
      const uptimeSec = Math.floor(process.uptime());
      const hours = Math.floor(uptimeSec / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      const seconds = uptimeSec % 60;
      const runtimeStr = `${hours}h ${minutes}m ${seconds}s`;

      // Header Banner
      const header = 
`╔════════════════════════╗
   ⚔️ 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐕𝟏 ⚔️
╚════════════════════════╝
 ┌───────────────────────
 │ 🕷️ ᴜsᴇʀ : +${rawUser}
 │ 👑 ᴏᴡɴᴇʀ : ${DEVELOPER_NAME}
 │ ⌛ ʀᴜɴᴛɪᴍᴇ : ${runtimeStr}
 │ 📡 ᴍᴏᴅᴇ : Public
 └───────────────────────\n`;

      // Selection check (args[0] හෝ alias හරහා අංකය අඳුනගැනීම)
      const choice = (args[0] || "").trim() || (["1", "2", "3", "4", "5", "6"].includes(msg.body?.slice(1)) ? msg.body?.slice(1) : "");

      let menuBody = "";

      if (choice === "1") {
        menuBody = 
`┌──『 ⚙️ 01. MAIN & SYSTEM 』───
│
│ ✦ ${prefix}ping     - Check response speed
│ ✦ ${prefix}alive    - Check bot status
│ ✦ ${prefix}system   - View server specs
│ ✦ ${prefix}owner    - Developer contact
│
└───────────────────────
> Type ${prefix}menu to go back.`;

      } else if (choice === "2") {
        menuBody = 
`┌──『 🧠 02. AI & CHATBOT 』───
│
│ ✦ ${prefix}ai <query>  - Ask OpenRouter AI
│ ✦ ${prefix}gpt <query> - DeepSeek / GPT Model
│ ✦ ${prefix}bot         - Bot conversational chat
│
└───────────────────────
> Type ${prefix}menu to go back.`;

      } else if (choice === "3") {
        menuBody = 
`┌──『 🎨 03. CONVERTERS 』───
│
│ ✦ ${prefix}sticker   - Image to sticker
│ ✦ ${prefix}take      - Change sticker pack name
│ ✦ ${prefix}toimg     - Sticker to photo
│
└───────────────────────
> Type ${prefix}menu to go back.`;

      } else if (choice === "4") {
        menuBody = 
`┌──『 📥 04. DOWNLOADERS 』───
│
│ ✦ ${prefix}song <name>  - YouTube Audio download
│ ✦ ${prefix}video <name> - YouTube Video download
│ ✦ ${prefix}fb <url>     - Facebook Video download
│ ✦ ${prefix}tiktok <url> - TikTok without watermark
│
└───────────────────────
> Type ${prefix}menu to go back.`;

      } else if (choice === "5") {
        menuBody = 
`┌──『 👥 05. GROUP ADMINS 』───
│
│ ✦ ${prefix}kick @tag   - Remove participant
│ ✦ ${prefix}add <num>   - Add member to group
│ ✦ ${prefix}mute        - Close group chat
│ ✦ ${prefix}unmute      - Open group chat
│ ✦ ${prefix}tagall      - Mention all members
│
└───────────────────────
> Type ${prefix}menu to go back.`;

      } else if (choice === "6") {
        menuBody = 
`┌──『 🎮 06. FUN & GAMES 』───
│
│ ✦ ${prefix}joke       - Sinhala / English jokes
│ ✦ ${prefix}quote      - Motivational quotes
│ ✦ ${prefix}fact       - Random facts
│
└───────────────────────
> Type ${prefix}menu to go back.`;

      } else {
        // Main Category Overview
        menuBody = 
`┌──『 📜 𝐌𝐄𝐍𝐔 𝐂𝐀𝐓𝐄𝐆𝐎𝐑𝐈𝐄𝐒 』───
│
│  [1] ⚙️ Main & System
│  [2] 🧠 AI & Chatbot
│  [3] 🎨 Media & Converter
│  [4] 📥 Downloader Zone
│  [5] 👥 Group Management
│  [6] 🎮 Fun & Other Tools
│
└───────────────────────
> *Reply with number or type ${prefix}menu <number>*
> *Example:* ${prefix}menu 1 or ${prefix}1
> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴅɪɴᴜ ᴛᴇᴄʜ 🩸`;
      }

      const finalMessage = header + menuBody;

      // Logo Image එක සමඟ යැවීම (Image fail වුවහොත් text fallback)
      const logo = config.getRandomLogo();
      if (logo && logo.startsWith("http")) {
        try {
          await sock.sendMessage(from, {
            image: { url: logo },
            caption: finalMessage
          }, { quoted: msg });
          return;
        } catch (imgErr) {
          console.error("Menu image error, sending text:", imgErr.message);
        }
      }

      await sock.sendMessage(from, { text: finalMessage }, { quoted: msg });

    } catch (err) {
      console.error("Menu Execution Error:", err);
      await sock.sendMessage(from, { text: "⚠️ Menu display failed." }, { quoted: msg });
    }
  }
};
