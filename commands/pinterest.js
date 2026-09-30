const axios = require('axios');

module.exports = {
  name: "pinterest",
  alias: ["pt"],
  desc: "Download Pinterest videos or images using Supun API",
  async execute(sock, msg, args, from) {
    try {
      const inputUrl = args.join(' ').trim();

      if (!inputUrl) {
        return await sock.sendMessage(from, { 
          text: "⚠️ කරුණාකර Pinterest Link එකක් ලබා දෙන්න!\n\nඋදාහරණයක්:\n*.pt https://pin.it/xxxxx*" 
        }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      const apiKey = 'supun-tvo5olfxylo98b8l6b9lq174';
      const apiUrl = `https://supunofc.site/api/download/down/pin/dl?url=${encodeURIComponent(inputUrl)}&apikey=${apiKey}`;

      const { data } = await axios.get(apiUrl);

      // API Response එක පරීක්ෂා කිරීම
      const res = data.result || data.data || data;

      // 1. JSON එක ඇතුළෙන් Video Link එකක් තිබේදැයි ගැඹුරින් සෙවීම
      let videoUrl = null;
      let imageUrl = null;

      if (typeof res === 'object') {
        // Video සඳහා සුලභ properties පරීක්ෂා කිරීම
        videoUrl = res.video || res.video_url || res.url_video || res.nowm || res.direct_link;

        // downloads array එකක් ඇත්නම්
        if (!videoUrl && Array.isArray(res.downloads)) {
          const vItem = res.downloads.find(item => 
            (item.type && item.type.includes('video')) || 
            (item.format && item.format.includes('mp4')) ||
            (item.url && item.url.includes('.mp4'))
          );
          if (vItem) videoUrl = vItem.url || vItem.link;
        }

        // Object එකේ values ඇතුළේ කෙලින්ම .mp4 link එකක් තියෙනවද බැලීම
        if (!videoUrl) {
          const values = Object.values(res).flatMap(v => typeof v === 'object' ? Object.values(v || {}) : v);
          videoUrl = values.find(val => typeof val === 'string' && val.includes('.mp4'));
        }

        // Image link එක සොයාගැනීම (video එකක් නැතිවිට පමණක් භාවිතයට)
        imageUrl = res.image || res.image_url || res.url_image || res.url || res.thumbnail;
      } else if (typeof res === 'string' && res.startsWith('http')) {
        if (res.includes('.mp4')) videoUrl = res;
        else imageUrl = res;
      }

      const caption = `╭───『 ᴘɪɴᴛᴇʀᴇsᴛ ᴅʟ 』───\n` +
                      `│\n` +
                      `├─▸ 👤 *Source:* Pinterest\n` +
                      `├─▸ 🎬 *Quality:* High Definition\n` +
                      `│\n` +
                      `└───『 ᴅᴀʀᴋ ᴅɪɴᴜ 』───`;

      // 2. Video එකක් හමු වුණා නම් අනිවාර්යයෙන්ම Video එක Send කිරීම
      if (videoUrl) {
        await sock.sendMessage(from, {
          video: { url: videoUrl },
          caption: caption,
          mimetype: 'video/mp4'
        }, { quoted: msg });
      } else if (imageUrl) {
        // Video එකක් ඇත්තටම නැතිනම් පමණක් Image එක යැවීම
        await sock.sendMessage(from, {
          image: { url: imageUrl },
          caption: caption
        }, { quoted: msg });
      } else {
        await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
        return await sock.sendMessage(from, { text: "❌ බාගත හැකි Video එකක් හමු නොවීය." }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });

    } catch (err) {
      console.error("Pinterest Error:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await sock.sendMessage(from, { text: `❌ දෝෂයක් සිදුවිය: ${err.message}` }, { quoted: msg });
    }
  }
};
