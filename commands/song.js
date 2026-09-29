const yts = require("yt-search");
const axios = require("axios");

module.exports = {
  name: "song",
  alias: ["play", "mp3", "audio"],
  desc: "Direct YouTube Audio Downloader",
  async execute(sock, msg, args, from, { reply, prefix }) {
    try {
      const query = args.join(" ").trim();
      if (!query) {
        return await reply(`⚠️ කරුණාකර සින්දුවේ නම හෝ YouTube Link එකක් ලබාදෙන්න!\n*උදාහරණ:* \`${prefix}song kuweniye\``);
      }

      await sock.sendMessage(from, { react: { text: "🔍", key: msg.key } });

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

      // 2. ඔයාගේ Song Card Design එක
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

      // 3. YouTube Stream URL ලබා ගැනීම (Cobalt Core + Aggregator)
      let audioStreamUrl = null;

      const instances = [
        "https://api.cobalt.tools/api/json",
        "https://cobalt.api.redstream.online/api/json",
        "https://api.wuk.sh/api/json"
      ];

      for (const instance of instances) {
        try {
          const res = await axios.post(instance, {
            url: videoUrl,
            downloadMode: "audio",
            audioFormat: "mp3"
          }, {
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json"
            },
            timeout: 10000
          });

          if (res.data?.url) {
            audioStreamUrl = res.data.url;
            break;
          }
        } catch (e) {}
      }

      // Backup Aggregator
      if (!audioStreamUrl) {
        try {
          const fallback = await axios.get(`https://bk9.fun/download/youtube?url=${encodeURIComponent(videoUrl)}`, { timeout: 12000 });
          if (fallback.data?.BK9?.BK8) {
            audioStreamUrl = fallback.data.BK9.BK8;
          }
        } catch (e) {}
      }

      if (!audioStreamUrl) {
        return await reply("❌ Audio සේවාව කාර්යබහුලයි. සුළු මොහොතකින් නැවත උත්සාහ කරන්න.");
      }

      // 4. WhatsApp එකට Audio Message එක Buffer එකක් ලෙස ලබාදී යැවීම
      const audioRes = await axios.get(audioStreamUrl, {
        responseType: "arraybuffer",
        timeout: 30000
      });

      await sock.sendMessage(from, {
        audio: Buffer.from(audioRes.data),
        mimetype: "audio/mp4",
        fileName: `${title}.mp3`
      }, { quoted: msg });

      await sock.sendMessage(from, { react: { text: "🎧", key: msg.key } });

    } catch (err) {
      console.error("Song command error:", err.message);
      await reply(`❌ Error: ${err.message || "Failed to download song"}`);
    }
  }
};
