const yts = require("yt-search");
const axios = require("axios");

module.exports = {
  name: "csong",
  alias: ["channelsong", "cplay"],
  desc: "Send Song Card & Voice Note directly to WhatsApp Channel",
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
      const channelJid = channelMeta.id;

      if (!channelJid) {
        return await reply("❌ Channel එක සොයාගත නොහැකි විය. Bot ට Channel එකේ Admin බලතල තියෙනවද බලන්න.");
      }

      // 1. YouTube Search
      const search = await yts(songName);
      const video = search.videos[0];
      if (!video) return await reply("❌ සින්දුව සොයාගත නොහැකි විය.");

      // 2. High Reliability Multi-Engine YouTube MP3 Download
      let audioBuffer = null;

      // Method 1: gifted-dls (Local dependency)
      try {
        const { ytmp3 } = require("gifted-dls");
        const dl = await ytmp3(video.url);
        const dlUrl = dl?.download_url || dl?.url;
        if (dlUrl) {
          const res = await axios.get(dlUrl, { responseType: "arraybuffer", timeout: 35000 });
          audioBuffer = Buffer.from(res.data);
        }
      } catch (e) {}

      // Method 2: Cobadownload / Cobalt public API fallback
      if (!audioBuffer) {
        try {
          const resCobalt = await axios.post("https://api.cobalt.tools/api/json", {
            url: video.url,
            downloadMode: "audio",
            audioFormat: "mp3"
          }, {
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json"
            },
            timeout: 20000
          });

          if (resCobalt.data?.url) {
            const res = await axios.get(resCobalt.data.url, { responseType: "arraybuffer", timeout: 35000 });
            audioBuffer = Buffer.from(res.data);
          }
        } catch (e) {}
      }

      // Method 3: Siputzx YouTube Audio Engine
      if (!audioBuffer) {
        try {
          const resSiput = await axios.get(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(video.url)}`, { timeout: 20000 });
          const dlUrl = resSiput.data?.data?.dl;
          if (dlUrl) {
            const res = await axios.get(dlUrl, { responseType: "arraybuffer", timeout: 35000 });
            audioBuffer = Buffer.from(res.data);
          }
        } catch (e) {}
      }

      if (!audioBuffer) {
        return await reply("❌ සින්දුව download කරගැනීමට නොහැකි විය. වෙනත් සින්දුවක නමක් ලබාදෙන්න.");
      }

      // 3. Card එකේ Caption එක
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

      // 5. STEP 2: Error-free Voice Note (PTT) එක Channel එකට යැවීම
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
