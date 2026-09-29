const yts = require("yt-search");
const axios = require("axios");

module.exports = {
  name: "song",
  alias: ["play", "mp3", "audio"],
  desc: "Download YouTube audio directly",
  async execute(sock, msg, args, from, { reply, prefix }) {
    try {
      const query = args.join(" ").trim();
      if (!query) {
        return await reply(`⚠️ කරුණාකර සින්දුවේ නම හෝ YouTube Link එකක් ලබාදෙන්න!\n*උදාහරණ:* \`${prefix}song kuweniye\``);
      }

      await sock.sendMessage(from, { react: { text: "🎧", key: msg.key } });

      // 1. YouTube Metadata Search
      const search = await yts(query);
      const video = search.videos[0];

      if (!video) {
        return await reply("❌ සින්දුව සොයාගැනීමට නොහැකි විය. කරුණාකර වෙනත් නමක් ලබාදෙන්න.");
      }

      const title = video.title;
      const duration = video.timestamp || "Unknown";
      const views = Number(video.views || 0).toLocaleString();
      const artist = video.author?.name || "Unknown Artist";
      const uploadYear = video.ago || "N/A";
      const thumbnail = video.thumbnail;
      const videoUrl = video.url;

      // 2. ඔයා තෝරාගත් Card Design එක
      const songCard = 
`╔════════════════════════╗
   ⚔️ 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐒𝐎𝐍𝐆 ⚔️
╚════════════════════════╝
 ┌───────────────────────
 │ 🎵 ᴛɪᴛʟᴇ : ${title}
 │ ⏱️ ᴅᴜʀᴀᴛɪᴏɴ : ${duration}
 │ 👁️ ᴠɪᴇᴡs : ${views}
 │ 👤 ᴀʀᴛɪsᴛ : ${artist}
 │ 📡 ᴜᴘʟᴏᴀᴅ : ${uploadYear}
 └───────────────────────
 > ⏳ *Uploading your audio...*
 > ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴅɪɴ𝐔 ᴛᴇᴄʜ 🩸`;

      if (thumbnail) {
        await sock.sendMessage(from, {
          image: { url: thumbnail },
          caption: songCard
        }, { quoted: msg });
      } else {
        await reply(songCard);
      }

      await sock.sendMessage(from, { react: { text: "⬇️", key: msg.key } });

      // 3. YouTube IP Bypass Audio Resolver
      let dlUrl = null;

      // Primary Engine
      try {
        const res = await axios.get(`https://api.vreden.my.id/api/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 25000 });
        if (res.data?.result?.download?.url) {
          dlUrl = res.data.result.download.url;
        }
      } catch (e) {}

      // Backup Engine
      if (!dlUrl) {
        try {
          const res2 = await axios.get(`https://apis.davidcyriltech.my.id/download/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 25000 });
          if (res2.data?.result?.download_url) {
            dlUrl = res2.data.result.download_url;
          }
        } catch (e) {}
      }

      // Third Backup Engine
      if (!dlUrl) {
        try {
          const res3 = await axios.get(`https://api.diioffc.web.id/api/download/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 25000 });
          if (res3.data?.result?.url) {
            dlUrl = res3.data.result.url;
          }
        } catch (e) {}
      }

      if (!dlUrl) {
        return await reply("❌ සින්දුවේ Audio එක ලබාගැනීමට නොහැකි විය. කරුණාකර සුළු මොහොතකින් නැවත උත්සාහ කරන්න.");
      }

      // 4. WhatsApp එකට Direct Stream ලෙස Audio එක යැවීම
      await sock.sendMessage(from, {
        audio: { url: dlUrl },
        mimetype: "audio/mp4",
        fileName: `${title}.mp3`
      }, { quoted: msg });

      await sock.sendMessage(from, { react: { text: "🎧", key: msg.key } });

    } catch (err) {
      console.error("Song error:", err);
      await reply(`❌ Error: ${err.message || "Failed to download song"}`);
    }
  }
};
