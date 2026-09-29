const yts = require("yt-search");
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
        return await reply(`⚠️ කරුණාකර සින්දුවේ නම හෝ YouTube Link එකක් ලබාදෙන්න!\n*උදාහරණ:* \`${prefix}song kuweniye\``);
      }

      await sock.sendMessage(from, { react: { text: "🎧", key: msg.key } });

      // 1. YouTube Search එක yt-search එකෙන් කරගන්නවා (YouTube Bot Block නොවී තොරතුරු ගන්න)
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

      // 2. Card Design එක
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

      // 3. Audio එක Download කිරීම (Android/iOS Client Bypass එකක් සහිතව)
      const tempFileName = `song_${Date.now()}.mp3`;
      const tempFilePath = path.join(__dirname, tempFileName);

      await youtubedl(videoUrl, {
        extractAudio: true,
        audioFormat: "mp3",
        ffmpegLocation: ffmpegPath,
        output: tempFilePath,
        noWarnings: true,
        noCheckCertificates: true,
        // Cloud Block එක Bypass කිරීම සඳහා
        extractorArgs: "youtube:player_client=android,web",
        addHeader: [
          "user-agent:Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        ]
      });

      // 4. WhatsApp එකට Audio එක යැවීම
      if (fs.existsSync(tempFilePath)) {
        const audioBuffer = fs.readFileSync(tempFilePath);

        await sock.sendMessage(from, {
          audio: audioBuffer,
          mimetype: "audio/mp4",
          fileName: `${title}.mp3`
        }, { quoted: msg });

        await sock.sendMessage(from, { react: { text: "🎧", key: msg.key } });

        // Clean up temp file
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
