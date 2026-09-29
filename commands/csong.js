const yts = require("yt-search");
const axios = require("axios");

module.exports = {
  name: "csong",
  alias: ["channelsong"],
  desc: "Send audio as a Voice Note directly to a WhatsApp Channel",
  async execute(sock, msg, args, from, { reply, prefix }) {
    try {
      const fullText = args.join(" ");
      const parts = fullText.split(",");

      if (parts.length < 2) {
        return await reply(`⚠️ භාවිතය:\n*${prefix}csong <channel_link> , <song_name>*\n\n*උදාහරණ:*\n${prefix}csong https://whatsapp.com/channel/0029VaXXXXX , kuweniye`);
      }

      const channelLink = parts[0].trim();
      const songName = parts.slice(1).join(",").trim();

      // Channel Code / JID එක වෙන් කර ගැනීම
      const inviteCode = channelLink.split("whatsapp.com/channel/")[1]?.split("/")[0]?.trim();
      if (!inviteCode) {
        return await reply("❌ වලංගු WhatsApp Channel Link එකක් ලබාදෙන්න!");
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      // Channel Metadata ලබා ගැනීම
      const channelMeta = await sock.newsletterMetadata("invite", inviteCode);
      const channelJid = channelMeta.id;

      // 1. YouTube Search
      const search = await yts(songName);
      const video = search.videos[0];
      if (!video) return await reply("❌ සින්දුව සොයාගත නොහැකි විය.");

      // 2. High-speed Audio Download Link
      let audioUrl = null;
      try {
        const apiKey = "chama_api_ec9848130d1aea209f08fb85e0b4720f";
        const res = await axios.get(`https://api.chamindu.site/api/v1/youtube/mp3?url=${encodeURIComponent(video.url)}&quality=320kbps&api_key=${apiKey}`, { timeout: 12000 });
        audioUrl = res.data?.data?.download_url || res.data?.data?.direct_url;
      } catch (e) {}

      if (!audioUrl) {
        try {
          const res2 = await axios.get(`https://bk9.fun/download/youtube?url=${encodeURIComponent(video.url)}`, { timeout: 15000 });
          audioUrl = res2.data?.BK9?.BK8;
        } catch (e) {}
      }

      if (!audioUrl) return await reply("❌ Audio සේවාව කාර්යබහුලයි. නැවත උත්සාහ කරන්න.");

      // 3. Channel එකට Voice Note (PTT) එකක් ලෙස යැවීම
      await sock.sendMessage(channelJid, {
        audio: { url: audioUrl },
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
        contextInfo: {
          externalAdReply: {
            title: video.title,
            body: "DARK DINU MD VOICE STREAM 🎙️",
            thumbnailUrl: video.thumbnail,
            sourceUrl: video.url,
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      });

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
      await reply(`✅ *"${video.title}"* සින්දුව Channel එකට Voice Note එකක් ලෙස සාර්ථකව යවන ලදී! 🎙️`);

    } catch (err) {
      console.error("csong error:", err);
      await reply(`❌ Error: ${err.message || "Failed to send voice note to channel"}`);
    }
  }
};
