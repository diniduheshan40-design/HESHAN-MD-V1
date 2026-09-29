const yts = require("yt-search");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");

// FFmpeg Path Configuration
let ffmpegPath = "ffmpeg";
try {
  const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
  ffmpegPath = ffmpegInstaller.path;
} catch (e) {
  ffmpegPath = "ffmpeg";
}

// Helper: Convert Any Audio Buffer to Real WhatsApp Voice Note (OGG Opus)
function convertToWhatsAppVoice(inputBuffer) {
  return new Promise((resolve, reject) => {
    const tempId = Date.now() + "_" + Math.random().toString(36).substring(7);
    const tempInput = path.join(os.tmpdir(), `input_${tempId}.mp3`);
    const tempOutput = path.join(os.tmpdir(), `output_${tempId}.opus`);

    fs.writeFileSync(tempInput, inputBuffer);

    // WhatsApp Real Voice Note Codec Settings: libopus, 48kHz, 1 channel (mono), voice tuned
    const cmd = `"${ffmpegPath}" -y -i "${tempInput}" -c:a libopus -b:a 64k -vbr on -compression_level 10 -ar 48000 -ac 1 "${tempOutput}"`;

    exec(cmd, (error) => {
      // Temp input clean-up
      try { if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput); } catch (e) {}

      if (error) {
        return reject(error);
      }

      try {
        const outputBuffer = fs.readFileSync(tempOutput);
        if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
        resolve(outputBuffer);
      } catch (readErr) {
        reject(readErr);
      }
    });
  });
}

module.exports = {
  name: "csong",
  alias: ["channelsong", "cplay"],
  desc: "Send Song Card & Real WhatsApp Playable Voice Note to Channel",
  async execute(sock, msg, args, from, { reply, prefix }) {
    try {
      const fullText = args.join(" ");
      const parts = fullText.split(",");

      if (parts.length < 2) {
        return await reply(`⚠️ *භාවිතය:*\n*${prefix}csong <channel_link> , <song_name>*\n\n*උදාහරණ:*\n${prefix}csong https://whatsapp.com/channel/0029VaXXXXX , kuweniye`);
      }

      const channelLink = parts[0].trim();
      const songName = parts.slice(1).join(",").trim();

      const inviteCode = channelLink.split("whatsapp.com/channel/")[1]?.split("/")[0]?.trim();
      if (!inviteCode) {
        return await reply("❌ වලංගු WhatsApp Channel Link එකක් ලබාදෙන්න!");
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      const channelMeta = await sock.newsletterMetadata("invite", inviteCode);
      const channelJid = channelMeta?.id;

      if (!channelJid) {
        return await reply("❌ Channel එක සොයාගත නොහැකි විය. Bot ට Channel Admin බලතල තියෙනවද බලන්න.");
      }

      // 1. YouTube Search
      const search = await yts(songName);
      const video = search.videos[0];
      if (!video) return await reply("❌ සින්දුව සොයාගත නොහැකි විය.");

      // 2. Chamindu API හරහා Direct MP3 Download කර ගැනීම
      const apiKey = "chama_api_ec9848130d1aea209f08fb85e0b4720f";
      let audioDownloadUrl = null;

      try {
        const apiUrl = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(video.url)}&quality=128kbps&format=mp3&api_key=${apiKey}`;
        const res = await axios.get(apiUrl, { timeout: 20000 });
        audioDownloadUrl = res.data?.data?.direct_url || res.data?.data?.download_url || res.data?.direct_url || res.data?.download_url;
      } catch (err) {}

      if (!audioDownloadUrl) {
        try {
          const fallbackApi = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(video.url)}&quality=360p&format=mp4&api_key=${apiKey}`;
          const res2 = await axios.get(fallbackApi, { timeout: 20000 });
          audioDownloadUrl = res2.data?.data?.direct_url || res2.data?.data?.download_url || res2.data?.direct_url;
        } catch (err2) {}
      }

      if (!audioDownloadUrl) {
        return await reply("❌ Audio Download කරගැනීමට නොහැකි විය. නැවත උත්සාහ කරන්න.");
      }

      // Raw audio file එක Buffer කර ගැනීම
      const rawRes = await axios.get(audioDownloadUrl, {
        responseType: "arraybuffer",
        timeout: 45000,
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      const rawBuffer = Buffer.from(rawRes.data);

      // 3. Local FFmpeg මඟින් Original WhatsApp Voice Note එකක් (OGG Opus) බවට Convert කිරීම
      let voiceBuffer;
      try {
        voiceBuffer = await convertToWhatsAppVoice(rawBuffer);
      } catch (convErr) {
        console.warn("FFmpeg conversion fallback:", convErr.message);
        voiceBuffer = rawBuffer;
      }

      // 4. STEP 1: Card Banner එක Channel එකට යැවීම
      const cardCaption = 
`🎶 *“ ${video.title} ”*

0:00 ◁◁  II  ▷▷ ${video.timestamp || "4:00"}

Use Headphones For Best Experience.... 🎧🎵

| ⚡ *HESHAN MD*`;

      await sock.sendMessage(channelJid, {
        image: { url: video.thumbnail },
        caption: cardCaption
      });

      // 5. STEP 2: Real Playable Voice Note (Waveform & Profile Icon සහිතව) Channel එකට යැවීම
      await sock.sendMessage(channelJid, {
        audio: voiceBuffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true
      });

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
      await reply(`✅ *"${video.title}"*\nChannel එකට Original Voice Note එකක් ලෙස සාර්ථකව Post කරන ලදී! 🎙️🔥`);

    } catch (err) {
      console.error("csong error:", err);
      await reply(`❌ Error: ${err.message || "Failed to post voice note to channel"}`);
    }
  }
};
