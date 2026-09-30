const axios = require("axios");

if (!global.videoSessions) {
  global.videoSessions = new Map();
}

module.exports = {
  name: "video",
  alias: ["ytv", "ytvideo", "ytmp4"],
  desc: "Download YouTube video by link or name (1080p, 720p, 480p, 360p)",
  async execute(sock, msg, args, from) {
    try {
      const text = args.join(" ").trim();

      if (!text) {
        return await sock.sendMessage(from, { 
          text: `⚠️ කරුණාකර වීඩියෝවේ නම හෝ YouTube Link එකක් ලබාදෙන්න!\n\n*උදාහරණ:*\n• \`.video Alan Walker Faded\`\n• \`.video https://youtu.be/xxxxxx\`` 
        }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: "🔍", key: msg.key } });

      let targetUrl = text;
      const isYtLink = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/.test(text);

      // 1. නමක් (Name/Search Query) දුන්නොත් YouTube එකෙන් Link එක Search කර ගැනීම
      if (!isYtLink) {
        try {
          const searchRes = await axios.get(`https://weeb-api.vercel.app/ytsearch?query=${encodeURIComponent(text)}`, { timeout: 15000 });
          const firstResult = searchRes.data?.[0] || searchRes.data?.results?.[0];
          
          if (firstResult && firstResult.url) {
            targetUrl = firstResult.url;
          } else {
            // Fallback Search API
            const fbSearch = await axios.get(`https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(text)}`, { timeout: 15000 });
            const fbResult = fbSearch.data?.data?.[0];
            if (fbResult && fbResult.url) {
              targetUrl = fbResult.url;
            }
          }
        } catch (searchErr) {
          console.error("YT Search Error:", searchErr.message);
        }
      }

      // 2. Chamindu API හරහා Video Details ලබා ගැනීම
      const apiKey = "chama_api_ec9848130d1aea209f08fb85e0b4720f";
      const apiUrl = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(targetUrl)}&quality=360p&format=mp4&api_key=${apiKey}`;

      const res = await axios.get(apiUrl, { timeout: 30000 });
      const resData = res.data;

      if (!resData || (!resData.status && !resData.success)) {
        throw new Error("වීඩියෝවේ තොරතුරු සොයාගත නොහැකි විය. වෙනත් නමක් හෝ Link එකක් උත්සාහ කරන්න.");
      }

      const item = resData.data || resData;
      const title = item.title || "YouTube Video";
      const thumbnail = item.thumbnail || null;

      // Quality Selection Menu Card
      const videoCard = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐘𝐎𝐔𝐓𝐔𝐁𝐄 』───◆
│
│ 🎬 *ᴛɪᴛʟᴇ:* ${title}
│ 🌐 *ᴘʟᴀᴛғᴏʀᴍ:* YouTube HD
│
├───『 📥 𝐒𝐄𝐋𝐄𝐂𝐓 𝐐𝐔𝐀𝐋𝐈𝐓𝐘 』───
│
│  [1] 🌟 *1080p (Full HD)*
│  [2] 🎬 *720p (HD Video)*
│  [3] 📱 *480p (Standard SD)*
│  [4] ⚡ *360p (Data Saver)*
│
╰──────────────────────────◆
> *Reply with 1, 2, 3, or 4 to download*
> *ᴅᴀʀᴋ ᴅɪɴᴜ ᴍᴅ 🐦‍🔥*`;

      let sentMsg;
      if (thumbnail) {
        sentMsg = await sock.sendMessage(from, {
          image: { url: thumbnail },
          caption: videoCard
        }, { quoted: msg });
      } else {
        sentMsg = await sock.sendMessage(from, { 
          text: videoCard 
        }, { quoted: msg });
      }

      // Session එක Memory එකේ තැන්පත් කිරීම
      if (sentMsg?.key?.id) {
        global.videoSessions.set(sentMsg.key.id, {
          url: targetUrl,
          title,
          from,
          createdAt: Date.now()
        });

        // විනාඩි 10 කට පසු Session එක ඉවත් කිරීම
        setTimeout(() => {
          if (global.videoSessions.has(sentMsg.key.id)) {
            global.videoSessions.delete(sentMsg.key.id);
          }
        }, 10 * 60 * 1000);
      }

      await sock.sendMessage(from, { react: { text: "⚡", key: msg.key } });

    } catch (err) {
      console.error("YouTube Video Command Error:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await sock.sendMessage(from, { 
        text: `❌ වීඩියෝව ලබාගත නොහැකි විය: ${err.message || "Error"}` 
      }, { quoted: msg });
    }
  }
};
