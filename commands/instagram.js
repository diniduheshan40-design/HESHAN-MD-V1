const axios = require("axios");

module.exports = {
  name: "instagram",
  alias: ["insta", "ig", "igdl"],
  desc: "Download Instagram Reels, Videos, and Photos",
  async execute(sock, msg, args, from) {
    try {
      const url = args[0]?.trim();

      if (!url) {
        return await sock.sendMessage(from, { 
          text: "⚠️ කරුණාකර වලංගු Instagram Link එකක් ලබාදෙන්න!\n\n*උදාහරණ:* `.insta https://www.instagram.com/reel/xxxxxx/`" 
        }, { quoted: msg });
      }

      if (!url.includes("instagram.com")) {
        return await sock.sendMessage(from, { 
          text: "❌ කරුණාකර නිවැරදි Instagram Link එකක් ඇතුළත් කරන්න." 
        }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      const apiKey = "chama_api_ec9848130d1aea209f08fb85e0b4720f";
      const apiUrl = `https://api.chamindu.site/api/v1/media/instagram?url=${encodeURIComponent(url)}&api_key=${apiKey}`;

      const res = await axios.get(apiUrl, { timeout: 30000 });
      const resData = res.data;

      // 1. API එකෙන් Link එක Private හෝ Inaccessible ලෙස පැමිණියහොත්
      if (resData?.data?.status === "inaccessible_or_private" || resData?.message?.includes("Could not resolve")) {
        await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
        return await sock.sendMessage(from, { 
          text: "❌ මෙම Post එක Private එකක් හෝ ලබාගත නොහැකි Link එකකි. කරුණාකර Public Post එකක Link එකක් ලබාදෙන්න." 
        }, { quoted: msg });
      }

      if (!resData || (!resData.status && !resData.success)) {
        await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
        return await sock.sendMessage(from, { 
          text: "❌ මාධ්‍යය සොයාගත නොහැකි විය. Link එක නිවැරදිදැයි පරීක්ෂා කරන්න." 
        }, { quoted: msg });
      }

      const mediaData = resData.data || resData.result || resData;

      const caption = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐈𝐍𝐒𝐓𝐀𝐆𝐑𝐀𝐌 』───◆
│
│ 👤 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ:* DARK DINU MD
│ ⚡ *ǫᴜᴀʟɪᴛʏ:* High Definition
│
╰──────────────────────────◆
> *ᴅᴀʀᴋ ᴅɪɴᴜ ᴍᴅ 🐦‍🔥*`;

      // 2. විවිධ API Data Formats පරීක්ෂා කිරීම
      let mediaList = [];
      if (Array.isArray(mediaData)) {
        mediaList = mediaData;
      } else if (Array.isArray(mediaData.downloads)) {
        mediaList = mediaData.downloads;
      } else if (Array.isArray(mediaData.media)) {
        mediaList = mediaData.media;
      } else if (typeof mediaData === "object") {
        mediaList = [mediaData];
      }

      let sentMedia = false;

      for (const item of mediaList) {
        const downloadUrl = item.url || item.download_url || item.link || (typeof item === "string" ? item : null);
        const isVideo = item.type === "video" || item.type === "mp4" || downloadUrl?.includes(".mp4");

        if (downloadUrl && typeof downloadUrl === "string" && downloadUrl.startsWith("http")) {
          if (isVideo) {
            await sock.sendMessage(from, {
              video: { url: downloadUrl },
              caption: caption,
              mimetype: "video/mp4"
            }, { quoted: msg });
          } else {
            await sock.sendMessage(from, {
              image: { url: downloadUrl },
              caption: caption
            }, { quoted: msg });
          }
          sentMedia = true;
          break;
        }
      }

      if (!sentMedia) {
        await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
        return await sock.sendMessage(from, { 
          text: "❌ මෙම Link එකෙන් Media එක බාගත කිරීමට නොහැකි විය." 
        }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });

    } catch (err) {
      console.error("Instagram Command Error:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await sock.sendMessage(from, { 
        text: `❌ Instagram බාගත කිරීම අසාර්ථක විය: ${err.message || "Error"}` 
      }, { quoted: msg });
    }
  }
};
