const yts = require("yt-search");
const axios = require("axios");

module.exports = {
  name: "song",
  alias: ["play", "mp3", "audio"],
  desc: "Download YouTube audio via Chamindu 10Gbps API",
  async execute(sock, msg, args, from, { reply, prefix }) {
    try {
      const query = args.join(" ").trim();
      if (!query) {
        return await reply(`⚠️ කරුණාකර සින්දුවේ නම හෝ YouTube Link එකක් ලබාදෙන්න!\n*උදාහරණ:* \`${prefix}song kuweniye\``);
      }

      await sock.sendMessage(from, { react: { text: "🎧", key: msg.key } });

      // 1. YouTube Search හරහා Video URL එක සහ තොරතුරු ගැනීම
      let videoUrl = query;
      let title = "";
      let duration = "";
      let views = "";
      let artist = "";
      let uploadYear = "";
      let thumbnail = "";

      if (!query.startsWith("http://") && !query.startsWith("https://")) {
        const search = await yts(query);
        const video = search.videos[0];

        if (!video) {
          return await reply("❌ සින්දුව සොයාගැනීමට නොහැකි විය. කරුණාකර වෙනත් නමක් ලබාදෙන්න.");
        }

        videoUrl = video.url;
        title = video.title;
        duration = video.timestamp || "Unknown";
        views = Number(video.views || 0).toLocaleString();
        artist = video.author?.name || "Unknown Artist";
        uploadYear = video.ago || "N/A";
        thumbnail = video.thumbnail;
      }

      // 2. Card Design එක සකස් කර යැවීම
      const songCard = 
`╔════════════════════════╗
   ⚔️ 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐒𝐎𝐍𝐆 ⚔️
╚════════════════════════╝
 ┌───────────────────────
 │ 🎵 ᴛɪᴛʟᴇ : ${title || "YouTube Audio"}
 │ ⏱️ ᴅᴜʀᴀᴛɪᴏɴ : ${duration || "320kbps"}
 │ 👁️ ᴠɪᴇᴡs : ${views || "N/A"}
 │ 👤 ᴀʀᴛɪsᴛ : ${artist || "YouTube Artist"}
 │ 📡 ᴜᴘʟᴏᴀᴅ : ${uploadYear || "N/A"}
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

      // 3. Chamindu YouTube MP3 API Call
      const apiKey = "chama_api_ec9848130d1aea209f08fb85e0b4720f";
      const apiUrl = `https://api.chamindu.site/api/v1/youtube/mp3?url=${encodeURIComponent(videoUrl)}&quality=320kbps&api_key=${apiKey}`;

      const res = await axios.get(apiUrl, { timeout: 30000 });

      if (!res.data?.status || !res.data?.data) {
        throw new Error("API එකෙන් Audio Link එක ලබාගැනීමට නොහැකි විය.");
      }

      const songData = res.data.data;
      const downloadUrl = songData.download_url || songData.direct_url;
      const finalTitle = title || songData.title || "audio";

      if (!downloadUrl) {
        throw new Error("Direct Download Link එක හමු නොවීය.");
      }

      // 4. WhatsApp වෙත Direct CDN එකෙන් Audio එක යැවීම
      await sock.sendMessage(from, {
        audio: { url: downloadUrl },
        mimetype: "audio/mp4",
        fileName: `${finalTitle}.mp3`
      }, { quoted: msg });

      await sock.sendMessage(from, { react: { text: "🎧", key: msg.key } });

    } catch (err) {
      console.error("Chamindu API Song Error:", err.message);
      await reply(`❌ සින්දුව බාගත කිරීම අසාර්ථක විය: ${err.message || "Error"}`);
    }
  }
};
