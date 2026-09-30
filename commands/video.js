const axios = require("axios");

// Video sessions මතක තබා ගැනීමට
if (!global.videoSessions) {
  global.videoSessions = new Map();
}

module.exports = {
  name: "video",
  alias: ["ytv", "ytvideo", "ytmp4"],
  desc: "Download YouTube video by selecting quality (1080p, 720p, 480p, 360p)",
  async execute(sock, msg, args, from) {
    try {
      const url = args[0]?.trim();

      if (!url) {
        return await sock.sendMessage(from, { 
          text: `⚠️ කරුණාකර YouTube Link එකක් ලබාදෙන්න!\n\n*උදාහරණ:* \`.video https://www.youtube.com/watch?v=dQw4w9WgXcQ\`` 
        }, { quoted: msg });
      }

      const isYt = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/.test(url);
      if (!isYt) {
        return await sock.sendMessage(from, { 
          text: "❌ කරුණාකර වලංගු YouTube Video Link එකක් ලබාදෙන්න!" 
        }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: "🔍", key: msg.key } });

      // YouTube Video Info මුලින්ම ලබාගැනීම (360p default call එක මගින් info ගැනීම)
      const apiKey = "chama_api_ec9848130d1aea209f08fb85e0b4720f";
      const apiUrl = `https://api.chamindu.site/api/v1/youtube/download?url=${encodeURIComponent(url)}&quality=360p&format=mp4&api_key=${apiKey}`;

      const res = await axios.get(apiUrl, { timeout: 30000 });
      const resData = res.data;

      if (!resData || (!resData.status && !resData.success)) {
        throw new Error("වීඩියෝවේ තොරතුරු ලබාගැනීමට නොහැකි විය.");
      }

      const item = resData.data || resData;
      const title = item.title || "YouTube Video";
      const thumbnail = item.thumbnail || null;

      // Selection Card UI
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

      // Selection Session එක save කර තැබීම
      if (sentMsg?.key?.id) {
        global.videoSessions.set(sentMsg.key.id, {
          url,
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
        text: `❌ YouTube වීඩියෝව ලබාගත නොහැකි විය: ${err.message || "Error"}` 
      }, { quoted: msg });
    }
  }
};
