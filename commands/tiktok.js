const axios = require("axios");

if (!global.tiktokSessions) {
  global.tiktokSessions = new Map();
}

module.exports = {
  name: "tiktok",
  alias: ["tt", "ttdl", "tiktokdl"],
  desc: "Download TikTok HD/SD Video or Voice Note",
  async execute(sock, msg, args, from) {
    try {
      const url = args[0]?.trim();
      if (!url) {
        return await sock.sendMessage(from, { 
          text: `⚠️️ කරුණාකර TikTok Video Link එකක් ලබාදෙන්න!\n*උදාහරණ:* \`.tt https://vt.tiktok.com/xxxxxx/\`` 
        }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: "🔍", key: msg.key } });

      const apiKey = "chama_api_ec9848130d1aea209f08fb85e0b4720f";
      const apiUrl = `https://api.chamindu.site/api/v1/tiktok?url=${encodeURIComponent(url)}&api_key=${apiKey}`;

      const res = await axios.get(apiUrl, { timeout: 25000 });
      const resData = res.data;

      if (!resData || (!resData.success && !resData.status)) {
        throw new Error("API එකෙන් දත්ත ලබාගැනීමට නොහැකි විය.");
      }

      const item = resData.data || resData;
      const downloads = item.downloads || {};

      const hdVideo = downloads.no_watermark_hd || downloads.no_watermark;
      const sdVideo = downloads.no_watermark_sd || downloads.no_watermark;
      const audioUrl = downloads.audio || item.music_info?.play_url;

      const title = item.title || "TikTok Media";
      const author = item.author?.nickname || item.author?.unique_id || "TikTok User";
      const duration = item.duration ? `${item.duration}s` : "N/A";
      const cover = item.origin_cover || item.cover;

      if (!hdVideo && !sdVideo && !audioUrl) {
        throw new Error("බාගත කිරීමේ links හමු නොවීය.");
      }

      const tiktokCard = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐓𝐈𝐊𝐓𝐎𝐊 』───◆
│
│ 🎬 *ᴛɪᴛʟᴇ:* ${title}
│ 👤 *ᴄʀᴇᴀᴛᴏʀ:* ${author}
│ ⏱️ *ᴅᴜʀᴀᴛɪᴏɴ:* ${duration}
│
├───『 📥 𝐒𝐄𝐋𝐄𝐂𝐓 𝐅𝐎𝐑𝐌𝐀𝐓 』───
│
│  [1] 🎬 *HD Video (No Watermark)*
│  [2] 📱 *SD Video (Data Saver)*
│  [3] 🎙️ *Voice Note (PTT Audio)*
│
╰──────────────────────────◆
> *Reply with 1, 2, or 3 to download*
> *ᴅᴀʀᴋ ᴅɪɴᴜ ᴍᴅ 🐦‍🔥*`;

      let sentMsg;
      if (cover) {
        sentMsg = await sock.sendMessage(from, {
          image: { url: cover },
          caption: tiktokCard
        }, { quoted: msg });
      } else {
        sentMsg = await sock.sendMessage(from, { 
          text: tiktokCard 
        }, { quoted: msg });
      }

      // තෝරාගැනීම සඳහා session එක save කිරීම
      if (sentMsg?.key?.id) {
        global.tiktokSessions.set(sentMsg.key.id, {
          title,
          hdVideo,
          sdVideo,
          audioUrl,
          from,
          createdAt: Date.now()
        });

        // විනාඩි 10 කින් session එක ඉවත් කිරීම
        setTimeout(() => {
          if (global.tiktokSessions.has(sentMsg.key.id)) {
            global.tiktokSessions.delete(sentMsg.key.id);
          }
        }, 10 * 60 * 1000);
      }

      await sock.sendMessage(from, { react: { text: "⚡", key: msg.key } });

    } catch (err) {
      console.error("TikTok Error:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await sock.sendMessage(from, { 
        text: `❌ දෝෂයක් සිදුවිය: ${err.message}` 
      }, { quoted: msg });
    }
  }
};
