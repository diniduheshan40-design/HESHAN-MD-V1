const yts = require("yt-search");
const axios = require("axios");

module.exports = {
  name: "csong",
  alias: ["channelsong", "cplay"],
  desc: "Send Song Card & Voice Note directly to a WhatsApp Channel",
  async execute(sock, msg, args, from, { reply, prefix }) {
    try {
      const fullText = args.join(" ");
      const parts = fullText.split(",");

      if (parts.length < 2) {
        return await reply(`⚠️ *භාවිතය:*\n*${prefix}csong <channel_link> , <song_name>*\n\n*උදාහරණ:*\n${prefix}csong https://whatsapp.com/channel/0029VaXXXXX , Maa Dihaa`);
      }

      const channelLink = parts[0].trim();
      const songName = parts.slice(1).join(",").trim();

      // Channel Code එක වෙන් කර ගැනීම
      const inviteCode = channelLink.split("whatsapp.com/channel/")[1]?.split("/")[0]?.trim();
      if (!inviteCode) {
        return await reply("❌ වලංගු WhatsApp Channel Link එකක් ලබාදෙන්න!");
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      // Channel Metadata සහ Channel JID එක ලබා ගැනීම
      const channelMeta = await sock.newsletterMetadata("invite", inviteCode);
      const channelJid = channelMeta.id;

      if (!channelJid) {
        return await reply("❌ Channel එක සොයාගත නොහැකි විය. Bot ට Channel එකේ Admin බලතල තියෙනවද බලන්න.");
      }

      // 1. YouTube එකෙන් සින්දුව සෙවීම
      const search = await yts(songName);
      const video = search.videos[0];
      if (!video) return await reply("❌ සින්දුව සොයාගත නොහැකි විය.");

      // 2. High-speed Audio Download Link ලබා ගැනීම
      let audioUrl = null;
      try {
        const apiKey = "chama_api_ec9848130d1aea209f08fb85e0b4720f";
        const res = await axios.get(`https://api.chamindu.site/api/v1/youtube/mp3?url=${encodeURIComponent(video.url)}&quality=320kbps&api_key=${apiKey}`, { timeout: 15000 });
        audioUrl = res.data?.data?.download_url || res.data?.data?.direct_url;
      } catch (e) {}

      if (!audioUrl) {
        try {
          const res2 = await axios.get(`https://bk9.fun/download/youtube?url=${encodeURIComponent(video.url)}`, { timeout: 15000 });
          audioUrl = res2.data?.BK9?.BK8 || res2.data?.BK9?.BK2;
        } catch (e) {}
      }

      if (!audioUrl) {
        try {
          const res3 = await axios.get(`https://api.giftedtech.my.id/api/download/ytmp3?apikey=gifted&url=${encodeURIComponent(video.url)}`, { timeout: 15000 });
          audioUrl = res3.data?.result?.download_url;
        } catch (e) {}
      }

      if (!audioUrl) return await reply("❌ Audio සේවාව කාර්යබහුලයි. සුළු වේලාවකින් නැවත උත්සාහ කරන්න.");

      // 3. Card එකේ Text සැකසීම (Screenshot එකේ ඇති විලාසයටම)
      const cardCaption = 
`🎶 *“ ${video.title} ”*

0:00 ◁◁  II  ▷▷ ${video.timestamp || "4:00"}

Use Headphones For Best Experience.... 🎧🎵

| ⚡ *HESHAN MD*`;

      // 4. STEP 1: Image Card එක Channel එකට යැවීම
      await sock.sendMessage(channelJid, {
        image: { url: video.thumbnail },
        caption: cardCaption
      });

      // 5. STEP 2: ඊට යටින් Voice Note (PTT) එක Channel එකට යැවීම
      await sock.sendMessage(channelJid, {
        audio: { url: audioUrl },
        mimetype: "audio/ogg; codecs=opus",
        ptt: true
      });

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
      await reply(`✅ *"${video.title}"*\nChannel එකට Card එක සහ Voice Note එක සාර්ථකව Post කරන ලදී! 🎙️🔥`);

    } catch (err) {
      console.error("csong error:", err);
      await reply(`❌ Error: ${err.message || "Failed to post to channel"}`);
    }
  }
};
