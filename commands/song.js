const yts = require("yt-search");
const youtubedl = require("youtube-dl-exec");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const fs = require("fs");
const path = require("path");

module.exports = {
  name: "song",
  alias: ["play", "mp3", "audio"],
  desc: "Download YouTube audio using youtube-dl-exec",
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

      // 3. Audio Download via youtube-dl-exec with Android Client Bypass
      const tempFilePath = path.join(__dirname, `audio_${Date.now()}.mp3`);

      await youtubedl(videoUrl, {
        format: "bestaudio/best",
        extractAudio: true,
        audioFormat: "mp3",
        ffmpegLocation: ffmpegPath,
        output: tempFilePath,
        noWarnings: true,
        noCheckCertificates: true,
        extractorArgs: "youtube:player_client=android",
        addHeader: [
          "user-agent:com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip"
        ]
      });

      // 4. Send Audio Message
      if (fs.existsSync(tempFilePath)) {
        const audioBuffer = fs.readFileSync(tempFilePath);

        await sock.sendMessage(from, {
          audio: audioBuffer,
          mimetype: "audio/mp4",
          fileName: `${title}.mp3`
        }, { quoted: msg });

        await sock.sendMessage(from, { react: { text: "🎧", key: msg.key } });

        fs.unlinkSync(tempFilePath);
      } else {
        await reply("❌ Audio conversion failed.");
      }

    } catch (err) {
      console.error("Song error:", err);
      await reply(`❌ Error: ${err.message || "Failed to download song"}`);
    }
  }
};
