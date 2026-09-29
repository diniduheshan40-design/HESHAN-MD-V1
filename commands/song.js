const yts = require("yt-search");
const axios = require("axios");

// Song download sessions මතක තබා ගැනීමට (In-Memory Map)
if (!global.songSessions) {
  global.songSessions = new Map();
}

module.exports = {
  name: "song",
  alias: ["play", "mp3", "audio"],
  desc: "Download YouTube audio as Audio, Document or Voice note",
  async execute(sock, msg, args, from, { reply, prefix }) {
    try {
      const query = args.join(" ").trim();
      if (!query) {
        return await reply(`⚠️ කරුණාකර සින්දුවේ නම හෝ YouTube Link එකක් ලබාදෙන්න!\n*උදාහරණ:* \`${prefix}song kuweniye\``);
      }

      await sock.sendMessage(from, { react: { text: "🎧", key: msg.key } });

      // 1. YouTube Metadata Search
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
        artist = video.author?.name || "YouTube Artist";
        uploadYear = video.ago || "N/A";
        thumbnail = video.thumbnail;
      }

      // 2. Chamindu API හරහා Direct CDN Download URL එක ලබා ගැනීම
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

      // 3. Premium Glassmorphic Card Design
      const songCard = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐒𝐎𝐍𝐆 』───◆
│
│ 🎼 *ᴛɪᴛʟᴇ:* ${finalTitle}
│ ⏳ *ᴅᴜʀᴀᴛɪᴏɴ:* ${duration || "320kbps"}
│ 👁️ *ᴠɪᴇᴡs:* ${views || "N/A"}
│ 🎙️ *ᴀʀᴛɪsᴛ:* ${artist}
│ 📅 *ᴜᴘʟᴏᴀᴅ:* ${uploadYear}
│
├───『 📥 𝐒𝐄𝐋𝐄𝐂𝐓 𝐅𝐎𝐑𝐌𝐀𝐓 』───
│
│  [1] 🎵 *Audio (MP3)*
│  [2] 📁 *Document (File)*
│  [3] 🎙️ *Voice Note (PTT)*
│
╰──────────────────────────◆
> *Reply to this message with 1, 2, or 3*
> *ᴅᴀʀᴋ ᴅɪɴᴜ ᴍᴅ 🐦‍🔥*`;

      let sentMsg;
      if (thumbnail) {
        sentMsg = await sock.sendMessage(from, {
          image: { url: thumbnail },
          caption: songCard
        }, { quoted: msg });
      } else {
        sentMsg = await reply(songCard);
      }

      // Session එක save කර තැබීම (User ගේ reply එක අඳුනා ගැනීමට)
      if (sentMsg?.key?.id) {
        global.songSessions.set(sentMsg.key.id, {
          title: finalTitle,
          url: downloadUrl,
          from: from,
          createdAt: Date.now()
        });

        // විනාඩි 10 කට පසු Session එක Memory එකෙන් ඉවත් කිරීම
        setTimeout(() => {
          if (global.songSessions.has(sentMsg.key.id)) {
            global.songSessions.delete(sentMsg.key.id);
          }
        }, 10 * 60 * 1000);
      }

      await sock.sendMessage(from, { react: { text: "⚡", key: msg.key } });

    } catch (err) {
      console.error("Chamindu API Song Error:", err.message);
      await reply(`❌ සින්දුව බාගත කිරීම අසාර්ථක විය: ${err.message || "Error"}`);
    }
  }
};
