const yts = require("yt-search");
const axios = require("axios");

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
        return await reply(`⚠️ කරුණාකර සින්දුවේ නම හෝ YouTube Link එකක් ලබාදෙන්න!\n*උදාහරණ:* \`${prefix}song ma diha\``);
      }

      await sock.sendMessage(from, { react: { text: "🔍", key: msg.key } });

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

      // 2. High-Speed Multi-Engine Stream URL Extractor
      let downloadUrl = null;

      // ENGINE 1: Chamindu API (Timeout 12s දක්වා අඩු කර ඇත - හිරවුණොත් Fallback එකට යාමට)
      try {
        const apiKey = "chama_api_ec9848130d1aea209f08fb85e0b4720f";
        const apiUrl = `https://api.chamindu.site/api/v1/youtube/mp3?url=${encodeURIComponent(videoUrl)}&quality=320kbps&api_key=${apiKey}`;
        const res = await axios.get(apiUrl, { timeout: 12000 });
        if (res.data?.status && res.data?.data) {
          downloadUrl = res.data.data.download_url || res.data.data.direct_url;
        }
      } catch (e) {
        console.log("Chamindu API busy/timeout, switching to Engine 2...");
      }

      // ENGINE 2: BK9 YouTube Engine (High-Speed Backup)
      if (!downloadUrl) {
        try {
          const res2 = await axios.get(`https://bk9.fun/download/youtube?url=${encodeURIComponent(videoUrl)}`, { timeout: 15000 });
          if (res2.data?.BK9?.BK8) {
            downloadUrl = res2.data.BK9.BK8;
          }
        } catch (e) {
          console.log("Engine 2 failed, switching to Engine 3...");
        }
      }

      // ENGINE 3: Vreden Direct High-Speed API
      if (!downloadUrl) {
        try {
          const res3 = await axios.get(`https://api.vreden.my.id/api/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 15000 });
          if (res3.data?.result?.download?.url) {
            downloadUrl = res3.data.result.download.url;
          }
        } catch (e) {}
      }

      if (!downloadUrl) {
        return await reply("❌ සින්දුවේ Audio සේවාවන් මේ මොහොතේ කාර්යබහුලයි. කරුණාකර තත්පර කිහිපයකින් නැවත උත්සාහ කරන්න.");
      }

      const finalTitle = title || "YouTube Audio";

      // 3. UI Card Design
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

      // Song Session Registration
      if (sentMsg?.key?.id) {
        global.songSessions.set(sentMsg.key.id, {
          title: finalTitle,
          url: downloadUrl,
          from: from,
          createdAt: Date.now()
        });

        setTimeout(() => {
          if (global.songSessions.has(sentMsg.key.id)) {
            global.songSessions.delete(sentMsg.key.id);
          }
        }, 10 * 60 * 1000);
      }

      await sock.sendMessage(from, { react: { text: "⚡", key: msg.key } });

    } catch (err) {
      console.error("Song Error:", err.message);
      await reply(`❌ දෝෂයක්: ${err.message || "Failed"}`);
    }
  }
};
