const yts = require("yt-search");
const axios = require("axios");

module.exports = {
  name: "csong",
  alias: ["channelsong", "cplay"],
  desc: "Send Song Card & Playable Voice Note to WhatsApp Channel",
  async execute(sock, msg, args, from, { reply, prefix }) {
    try {
      const fullText = args.join(" ");
      const parts = fullText.split(",");

      if (parts.length < 2) {
        return await reply(`⚠️ *භාවිතය:*\n*${prefix}csong <channel_link> , <song_name>*\n\n*උදාහරණ:*\n${prefix}csong https://whatsapp.com/channel/0029VaXXXXX , Maa Dihaa`);
      }

      const channelLink = parts[0].trim();
      const songName = parts.slice(1).join(",").trim();

      const inviteCode = channelLink.split("whatsapp.com/channel/")[1]?.split("/")[0]?.trim();
      if (!inviteCode) {
        return await reply("❌ වලංගු WhatsApp Channel Link එකක් ලබාදෙන්න!");
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      const channelMeta = await sock.newsletterMetadata("invite", inviteCode);
      const channelJid = channelMeta.id;

      if (!channelJid) {
        return await reply("❌ Channel එක සොයාගත නොහැකි විය. Bot ට Channel Admin බලතල තියෙනවද බලන්න.");
      }

      // 1. YouTube Search
      const search = await yts(songName);
      const video = search.videos[0];
      if (!video) return await reply("❌ සින්දුව සොයාගත නොහැකි විය.");

      // 2. High-speed direct MP3 Audio Source
      let audioUrl = null;

      try {
        const res = await axios.get(`https://bk9.fun/download/youtube?url=${encodeURIComponent(video.url)}`, { timeout: 15000 });
        audioUrl = res.data?.BK9?.BK8 || res.data?.BK9?.BK2;
      } catch (e) {}

      if (!audioUrl) {
        try {
          const res2 = await axios.get(`https://api.giftedtech.my.id/api/download/ytmp3?apikey=gifted&url=${encodeURIComponent(video.url)}`, { timeout: 15000 });
          audioUrl = res2.data?.result?.download_url;
        } catch (e) {}
      }

      if (!audioUrl) return await reply("❌ Audio සේවාව කාර්යබහුලයි. සුළු වේලාවකින් නැවත උත්සාහ කරන්න.");

      // 3. Audio එක Buffer එකක් ලෙස Download කර ගැනීම (File Error එක සම්පූර්ණයෙන් නැති කිරීමට)
      const audioResponse = await axios.get(audioUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      });
      const audioBuffer = Buffer.from(audioResponse.data);

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
