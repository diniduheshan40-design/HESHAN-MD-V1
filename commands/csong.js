const yts = require("yt-search");
const axios = require("axios");

module.exports = {
  name: "csong",
  alias: ["channelsong", "cplay"],
  desc: "Send Song Card & Voice Note directly to WhatsApp Channel using Chamindu API",
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
        return await reply("❌ Channel එක සොයාගත නොහැකි විය. Bot ට Channel එකේ Admin බලතල තියෙනවද බලන්න.");
      }

      // 1. YouTube එකෙන් සින්දුව සෙවීම
      const search = await yts(songName);
      const video = search.videos[0];
      if (!video) return await reply("❌ සින්දුව සොයාගත නොහැකි විය.");

      // 2. Chamindu API හරහා Direct Download Link ලබා ගැනීම
      const apiKey = "chama_api_ec9848130d1aea209f08fb85e0b4720f";
      let audioDownloadUrl = null;

      try {
        // MP3 Format එකෙන් ලබා ගැනීමට උත්සාහ කිරීම
        const apiUrl = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(video.url)}&quality=128kbps&format=mp3&api_key=${apiKey}`;
        const res = await axios.get(apiUrl, { timeout: 20000 });
        audioDownloadUrl = res.data?.data?.direct_url || res.data?.data?.download_url || res.data?.direct_url || res.data?.download_url;
      } catch (err) {
        console.warn("Chamindu MP3 error, trying MP4 stream...");
      }

      // MP3 direct link නැත්නම් MP4 audio stream එකෙන් fallback වීම
      if (!audioDownloadUrl) {
        try {
          const fallbackApi = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(video.url)}&quality=360p&format=mp4&api_key=${apiKey}`;
          const res2 = await axios.get(fallbackApi, { timeout: 20000 });
          audioDownloadUrl = res2.data?.data?.direct_url || res2.data?.data?.download_url || res2.data?.direct_url;
        } catch (err2) {}
      }

      if (!audioDownloadUrl) {
        return await reply("❌ Audio සේවාවෙන් Direct Link ලබාගැනීමට නොහැකි විය. කරුණාකර නැවත උත්සාහ කරන්න.");
      }

      // 3. Audio එක Buffer එකක් ලෙස Download කර ගැනීම (WhatsApp File Play Error එක නැති කිරීමට)
      const audioRes = await axios.get(audioDownloadUrl, {
        responseType: "arraybuffer",
        timeout: 45000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
      });
      const audioBuffer = Buffer.from(audioRes.data);

      // 4. Card එක Channel එකට යැවීම
      const cardCaption = 
`🎶 *“ ${video.title} ”*

0:00 ◁◁  II  ▷▷ ${video.timestamp || "4:00"}

Use Headphones For Best Experience.... 🎧🎵

| ⚡ *HESHAN MD*`;

      await sock.sendMessage(channelJid, {
        image: { url: video.thumbnail },
        caption: cardCaption
      });

      // 5. Playable Voice Note (PTT) එක Channel එකට යැවීම
      await sock.sendMessage(channelJid, {
        audio: audioBuffer,
        mimetype: "audio/mp4",
        ptt: true
      });

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
      await reply(`✅ *"${video.title}"*\nChannel එකට සාර්ථකව Post කරන ලදී! 🎙️🔥`);

    } catch (err) {
      console.error("csong error:", err);
      await reply(`❌ Error: ${err.message || "Failed to post to channel"}`);
    }
  }
};
