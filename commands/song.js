const yts = require("yt-search");
const axios = require("axios");

module.exports = {
  name: "song",
  alias: ["play", "mp3", "audio"],
  desc: "Download YouTube audio without cloud block",
  async execute(sock, msg, args, from, { reply, prefix }) {
    try {
      const query = args.join(" ").trim();
      if (!query) {
        return await reply(`⚠️ කරුණාකර සින්දුවේ නම හෝ YouTube Link එකක් ලබාදෙන්න!\n*උදාහරණ:* \`${prefix}song kuweniye\``);
      }

      await sock.sendMessage(from, { react: { text: "🎧", key: msg.key } });

      // 1. YouTube Search
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

      // 2. Card Design
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
 > ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴅɪɴᴜ ᴛᴇᴄʜ 🩸`;

      if (thumbnail) {
        await sock.sendMessage(from, {
          image: { url: thumbnail },
          caption: songCard
        }, { quoted: msg });
      } else {
        await reply(songCard);
      }

      await sock.sendMessage(from, { react: { text: "⬇️", key: msg.key } });

      // 3. YouTube Cloud Block Bypass කර Download Link ලබා ගැනීම (Multiple APIs)
      let audioDownloadUrl = null;

      // API 1: gifted-dls / Gifted API
      try {
        const apiRes = await axios.get(`https://api.giftedtech.my.id/api/download/dlmp3?apikey=gifted&url=${encodeURIComponent(videoUrl)}`, { timeout: 15000 });
        if (apiRes.data?.success && apiRes.data?.result?.download_url) {
          audioDownloadUrl = apiRes.data.result.download_url;
        }
      } catch (e) {}

      // API 2: Fallback API
      if (!audioDownloadUrl) {
        try {
          const apiRes2 = await axios.get(`https://api.dhamxx.me/api/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 15000 });
          if (apiRes2.data?.result?.url) {
            audioDownloadUrl = apiRes2.data.result.url;
          }
        } catch (e) {}
      }

      // API 3: NexOrbit API Fallback
      if (!audioDownloadUrl) {
        try {
          const apiRes3 = await axios.get(`https://api.nexorbit.link/api/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 15000 });
          if (apiRes3.data?.download) {
            audioDownloadUrl = apiRes3.data.download;
          }
        } catch (e) {}
      }

      if (!audioDownloadUrl) {
        throw new Error("Download stream unavailable at the moment. Please try again.");
      }

      // 4. Audio එක WhatsApp එකට කෙළින්ම Audio සහ Document Format දෙකෙන්ම support වන ලෙස යැවීම
      await sock.sendMessage(from, {
        audio: { url: audioDownloadUrl },
        mimetype: "audio/mp4",
        fileName: `${title}.mp3`
      }, { quoted: msg });

      await sock.sendMessage(from, { react: { text: "🎧", key: msg.key } });

    } catch (err) {
      console.error("Song error:", err.message);
      await reply(`❌ සින්දුව බාගත කිරීමේ දෝෂයක්: ${err.message || "Failed"}`);
    }
  }
};
