const youtubedl = require("youtube-dl-exec");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const fs = require("fs");
const path = require("path");

module.exports = {
  name: "song",
  alias: ["play", "mp3", "audio"],
  desc: "Download YouTube audio by search or URL",
  async execute(sock, msg, args, from, { reply, prefix }) {
    try {
      const query = args.join(" ").trim();
      if (!query) {
        return await reply(`⚠️ කරුණාකර සින්දුවේ නම හෝ YouTube Link එකක් ලබාදෙන්න!\n*උදාහරණ:* \`${prefix}song Neth Manema\``);
      }

      // Reaction: සොයමින් පවතින බව දැක්වීමට
      await sock.sendMessage(from, { react: { text: "🔍", key: msg.key } });

      // 1. YouTube Search & Metadata ලබා ගැනීම
      const searchTarget = query.startsWith("http") ? query : `ytsearch1:${query}`;
      
      const info = await youtubedl(searchTarget, {
        dumpSingleJson: true,
        noWarnings: true,
        noCheckCertificates: true,
        preferFreeFormats: true,
        youtubeSkipDashManifest: true
      });

      const video = info.entries ? info.entries[0] : info;
      if (!video || !video.title) {
        return await reply("❌ සින්දුව සොයාගැනීමට නොහැකි විය. කරුණාකර වෙනත් නමක් ලබාදෙන්න.");
      }

      const title = video.title;
      const duration = video.duration_string || "Unknown";
      const views = Number(video.view_count || 0).toLocaleString();
      const uploader = video.uploader || "Unknown Artist";
      const uploadYear = (video.upload_date || "").substring(0, 4) || "N/A";
      const thumbnail = video.thumbnail;
      const videoUrl = video.webpage_url || `https://www.youtube.com/watch?v=${video.id}`;

      // 2. Card Design එක සකස් කිරීම
      const songCard = 
`╔════════════════════════╗
   ⚔️ 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐒𝐎𝐍𝐆 ⚔️
╚════════════════════════╝
 ┌───────────────────────
 │ 🎵 ᴛɪᴛʟᴇ : ${title}
 │ ⏱️ ᴅᴜʀᴀᴛɪᴏɴ : ${duration}
 │ 👁️ ᴠɪᴇᴡs : ${views}
 │ 👤 ᴀʀᴛɪsᴛ : ${uploader}
 │ 📡 ᴜᴘʟᴏᴀᴅ : ${uploadYear}
 └───────────────────────
 > ⏳ *Uploading your audio...*
 > ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴅɪɴᴜ ᴛᴇᴄʜ 🩸`;

      // Thumbnail එක සහිතව Card එක යැවීම
      if (thumbnail) {
        await sock.sendMessage(from, {
          image: { url: thumbnail },
          caption: songCard
        }, { quoted: msg });
      } else {
        await reply(songCard);
      }

      // Reaction: Download වන බව දැක්වීමට
      await sock.sendMessage(from, { react: { text: "⬇️", key: msg.key } });

      // 3. Audio එක MP3 ලෙස Download කිරීම
      const tempFileName = `song_${Date.now()}.mp3`;
      const tempFilePath = path.join(__dirname, tempFileName);

      await youtubedl(videoUrl, {
        extractAudio: true,
        audioFormat: "mp3",
        ffmpegLocation: ffmpegPath,
        output: tempFilePath,
        noWarnings: true
      });

      // 4. WhatsApp එකට Audio එක යැවීම
      if (fs.existsSync(tempFilePath)) {
        const audioBuffer = fs.readFileSync(tempFilePath);

        await sock.sendMessage(from, {
          audio: audioBuffer,
          mimetype: "audio/mp4",
          fileName: `${title}.mp3`
        }, { quoted: msg });

        // Reaction: සාර්ථකව අවසන් වූ බව
        await sock.sendMessage(from, { react: { text: "🎧", key: msg.key } });

        // Temp file එක ඉවත් කිරීම
        fs.unlinkSync(tempFilePath);
      } else {
        await reply("❌ Audio conversion failed.");
      }

    } catch (err) {
      console.error("Song command error:", err);
      await reply(`❌ Error: ${err.message || "Failed to download song"}`);
    }
  }
};
