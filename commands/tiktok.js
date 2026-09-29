const axios = require("axios");

// TikTok download sessions මතක තබා ගැනීමට (In-Memory Map)
if (!global.tiktokSessions) {
  global.tiktokSessions = new Map();
}

module.exports = {
  name: "tiktok",
  alias: ["tt", "ttdl", "tiktokdl"],
  desc: "Download TikTok video or audio via interactive selection",
  async execute(sock, msg, args, from, { reply, prefix }) {
    try {
      const url = args[0]?.trim();
      if (!url) {
        return await reply(`⚠️ කරුණාකර TikTok වීඩියෝ ලින්ක් එකක් ලබාදෙන්න!\n*උදාහරණ:* \`${prefix}tt https://vt.tiktok.com/xxxxxx/\``);
      }

      if (!url.includes("tiktok.com")) {
        return await reply("❌ කරුණාකර වලංගු TikTok Video Link එකක් ලබාදෙන්න!");
      }

      await sock.sendMessage(from, { react: { text: "🔍", key: msg.key } });

      // Sasa Dev TikTok API Call
      const apiKey = "Sasa_Dev_Api_dc3569c8b4571d6203c49cf2e81dc1a8cdc7e7d3";
      const apiUrl = `https://sasa-dev-api.xyz/api/tiktok/dl?apikey=${apiKey}&url=${encodeURIComponent(url)}&raw=true`;

      const res = await axios.get(apiUrl, { timeout: 25000 });

      if (!res.data) {
        throw new Error("API එකෙන් දත්ත ලබාගැනීමට නොහැකි විය.");
      }

      const data = res.data?.data || res.data?.result || res.data;

      const videoUrl = data?.play || data?.nowm || data?.video || data?.download_url || data?.urls?.[0];
      const title = data?.title || data?.desc || "TikTok Video";
      const author = data?.author?.nickname || data?.author?.unique_id || "TikTok Creator";
      const duration = data?.duration || "N/A";
      const audioUrl = data?.music || data?.audio || data?.music_info?.url;
      const cover = data?.cover || data?.origin_cover || data?.author?.avatar;

      if (!videoUrl) {
        throw new Error("වීඩියෝවේ බාගත කිරීමේ ලින්ක් එක හමු නොවීය.");
      }

      // Premium TikTok Card Design
      const tiktokCard = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐓𝐈𝐊𝐓𝐎𝐊 』───◆
│
│ 🎬 *ᴛɪᴛʟᴇ:* ${title}
│ 👤 *ᴄʀᴇᴀᴛᴏʀ:* ${author}
│ ⏱️ *ᴅᴜʀᴀᴛɪᴏɴ:* ${duration}s
│ ⚡ *ǫᴜᴀʟɪᴛʏ:* HD (No Watermark)
│
├───『 📥 𝐒𝐄𝐋𝐄𝐂𝐓 𝐅𝐎𝐑𝐌𝐀𝐓 』───
│
│  [1] 🎬 *Video (No Watermark)*
│  [2] 🎵 *Audio (MP3 Sound)*
│
╰──────────────────────────◆
> *Reply to this message with 1 or 2*
> *ᴅᴀʀᴋ ᴅɪɴᴜ ᴍᴅ 🐦‍🔥*`;

      let sentMsg;
      if (cover) {
        sentMsg = await sock.sendMessage(from, {
          image: { url: cover },
          caption: tiktokCard
        }, { quoted: msg });
      } else {
        sentMsg = await reply(tiktokCard);
      }

      // Session එක save කර තැබීම
      if (sentMsg?.key?.id) {
        global.tiktokSessions.set(sentMsg.key.id, {
          title,
          author,
          videoUrl,
          audioUrl,
          from,
          createdAt: Date.now()
        });

        // විනාඩි 10 කට පසු Session එක clear කිරීම
        setTimeout(() => {
          if (global.tiktokSessions.has(sentMsg.key.id)) {
            global.tiktokSessions.delete(sentMsg.key.id);
          }
        }, 10 * 60 * 1000);
      }

      await sock.sendMessage(from, { react: { text: "⚡", key: msg.key } });

    } catch (err) {
      console.error("TikTok download error:", err.message);
      await reply(`❌ TikTok බාගත කිරීම අසාර්ථක විය: ${err.message || "Error"}`);
    }
  }
};
