const config = require("../config");

module.exports = {
  name: "menu",
  alias: ["help", "list", "panel", "commands"],
  desc: "Royal Luxury Style Category Menu",
  async execute(sock, msg, args, from, context) {
    try {
      const { sender, DEVELOPER_NAME, prefix, body, settings } = context;

      await sock.sendMessage(from, { react: { text: "⚔️", key: msg.key } });

      const rawUser = sender ? sender.split("@")[0].replace(/[^0-9]/g, "") : "User";

      // System Resource Calculations
      const ramUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
      const botDisplayName = settings?.botName || "DARK DINU MD";
      const currentMode = (settings?.workMode || "public").toUpperCase();

      const header = 
`╭───❖『 ⚔️ ${botDisplayName} ⚔️ 』❖───◆
│
│ ✦ 𝐔𝐬𝐞𝐫  : +${rawUser}
│ ✦ 𝐎𝐰𝐧𝐞𝐫 : ${DEVELOPER_NAME}
│ ✦ 𝐌𝐨𝐝𝐞  : ${currentMode}
│ ✦ 𝐑𝐚𝐦   : ${ramUsed} MB / 2 GB
│
╰───────────────────────────◆\n\n`;

      // Number detect (.menu 1, .1 හෝ reply)
      let choice = (args[0] || "").trim();
      const cleanBody = (body || "").trim();

      if (!choice && ["1", "2", "3", "4", "5", "6"].includes(cleanBody.replace(prefix, ""))) {
        choice = cleanBody.replace(prefix, "");
      }

      let menuBody = "";

      if (choice === "1") {
        menuBody = 
`┏━━━『 ⚙️ 01. SYSTEM & INFO 』━━━┓
┃
┃ ✦ ${prefix}ping        ➔ Check latency speed
┃ ✦ ${prefix}alive       ➔ Bot online verification
┃ ✦ ${prefix}system      ➔ View server architecture
┃ ✦ ${prefix}setting     ➔ Bot dynamic control panel
┃ ✦ ${prefix}setprefix   ➔ Change bot prefix
┃ ✦ ${prefix}setname     ➔ Change bot name
┃ ✦ ${prefix}setlogo     ➔ Set custom bot logo
┃ ✦ ${prefix}owner       ➔ Developer contact info
┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
> 💬 *Type ${prefix}menu to go back.* ↩️
> 👑 *ᴩᴏᴡᴇʀ ʙY ᴅᴀʀᴋ ᴅɪɴᴜ*`;

      } else if (choice === "2") {
        menuBody = 
`┏━━━『 🧠 02. ARTIFICIAL INTELLIGENCE 』━━━┓
┃
┃ ✦ ${prefix}ai <query>    ➔ Ask OpenRouter AI
┃ ✦ ${prefix}gpt <query>   ➔ DeepSeek / GPT Model
┃ ✦ ${prefix}bot <msg>     ➔ Conversational AI chat
┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
> 💬 *Type ${prefix}menu to go back.* ↩️
> 👑 *ᴩᴏᴡᴇʀ ʙY ᴅᴀʀᴋ ᴅɪɴᴜ*`;

      } else if (choice === "3") {
        menuBody = 
`┏━━━『 🎨 03. CONVERTERS & MEDIA 』━━━┓
┃
┃ ✦ ${prefix}sticker     ➔ Photo/Video to Sticker
┃ ✦ ${prefix}take        ➔ Change sticker pack name
┃ ✦ ${prefix}toimg       ➔ Sticker to Photo format
┃ ✦ ${prefix}getdp       ➔ Download any user's DP
┃ ✦ ${prefix}setdp       ➔ Update bot profile picture
┃ ✦ *Emoji Voice* ➔ Auto voice note reactions
┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
> 💬 *Type ${prefix}menu to go back.* ↩️
> 👑 *ᴩᴏᴡᴇʀ ʙY ᴅᴀʀᴋ ᴅɪɴᴜ*`;

      } else if (choice === "4") {
        menuBody = 
`┏━━━『 📥 04. PREMIUM DOWNLOADERS 』━━━┓
┃
┃ ✦ ${prefix}song <name>   ➔ High quality Audio (MP3/PTT)
┃ ✦ ${prefix}video <name>  ➔ HD YouTube Video downloader
┃ ✦ ${prefix}fb <url>      ➔ Facebook HD/SD Video grabber
┃ ✦ ${prefix}tiktok <url>  ➔ TikTok Video (No Watermark)
┃ ✦ *Anti-ViewOnce*  ➔ Auto-save ViewOnce Media
┃ ✦ *Anti-Delete*    ➔ Auto-recover Deleted messages
┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
> 💬 *Type ${prefix}menu to go back.* ↩️
> 👑 *ᴩᴏᴡᴇʀ ʙY ᴅᴀʀᴋ ᴅɪɴᴜ*`;

      } else if (choice === "5") {
        menuBody = 
`┏━━━『 👥 05. GROUP MANAGEMENT 』━━━┓
┃
┃ ✦ ${prefix}kick @tag    ➔ Remove member from group
┃ ✦ ${prefix}add <num>    ➔ Add participant to group
┃ ✦ ${prefix}mute         ➔ Close group chat
┃ ✦ ${prefix}unmute       ➔ Open group chat
┃ ✦ ${prefix}tagall       ➔ Mention all participants
┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
> 💬 *Type ${prefix}menu to go back.* ↩️
> 👑 *ᴩᴏᴡᴇʀ ʙY ᴅᴀʀᴋ ᴅɪɴᴜ*`;

      } else if (choice === "6") {
        menuBody = 
`┏━━━『 🎮 06. GAMES & ENTERTAINMENT 』━━━┓
┃
┃ ✦ ${prefix}joke        ➔ Random funny jokes
┃ ✦ ${prefix}quote       ➔ Motivational thoughts
┃ ✦ ${prefix}fact        ➔ Interesting daily facts
┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
> 💬 *Type ${prefix}menu to go back.* ↩️
> 👑 *ᴩᴏᴡᴇʀ ʙY ᴅᴀʀᴋ ᴅɪɴᴜ*`;

      } else {
        menuBody = 
`┏━━━『 🗂️ 𝐂𝐀𝐓𝐄𝐆𝐎𝐑𝐈𝐄𝐒 』━━━┓
┃
┃ ➊ ✦ ⚙️ System & Info
┃ ➋ ✦ 🧠 Artificial Intelligence
┃ ➌ ✦ 🎨 Converters & Media
┃ ➍ ✦ 📥 Premium Downloaders
┃ ➎ ✦ 👥 Group Management
┃ ➏ ✦ 🎮 Games & Entertainment
┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
> 💬 *Reply with number (1 - 6) to explore*

> 👑 *ᴩᴏᴡᴇʀ ʙY ᴅᴀʀᴋ ᴅɪɴᴜ*`;
      }

      const finalMessage = header + menuBody;

      // Custom Bot Logo fallback
      const logo = settings?.botLogo || (typeof config.getRandomLogo === "function" ? config.getRandomLogo() : null);

      if (logo && logo.startsWith("http")) {
        try {
          await sock.sendMessage(from, {
            image: { url: logo },
            caption: finalMessage
          }, { quoted: msg });
          return;
        } catch (imgErr) {
          console.error("Image send error:", imgErr.message);
        }
      }

      await sock.sendMessage(from, { text: finalMessage }, { quoted: msg });

    } catch (err) {
      console.error("Menu Error:", err);
      await sock.sendMessage(from, { text: "⚠️ Menu display failed." }, { quoted: msg });
    }
  }
};
