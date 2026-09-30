const axios = require('axios');

module.exports = {
  name: "pinterest",
  alias: ["pt"],
  desc: "Download Pinterest videos or images",
  async execute(sock, msg, args, from) {
    try {
      const inputUrl = args.join(' ');

      if (!inputUrl) {
        return await sock.sendMessage(from, { 
          text: "⚠️ කරුණාකර Pinterest Link එකක් ලබා දෙන්න!\n\nඋදාහරණයක්:\n*.pt https://www.pinterest.com/pin/xxxxxxxxx/*" 
        }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      // pin.it short links full URL බවට හරවා ගැනීම
      let targetUrl = inputUrl.trim();
      if (targetUrl.includes('pin.it')) {
        const headRes = await axios.get(targetUrl, { maxRedirects: 5 });
        targetUrl = headRes.request?.res?.responseUrl || targetUrl;
      }

      const apiKey = 'chama_api_ec9848130d1aea209f08fb85e0b4720f';
      const apiUrl = `https://api.chamindu.site/api/v1/media/pinterest/infodl?q=${encodeURIComponent(targetUrl)}&api_key=${apiKey}`;

      const response = await axios.get(apiUrl);
      const resData = response.data;

      if (!resData.status || !resData.data || !resData.data.downloads || !resData.data.downloads.length) {
        await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
        return await sock.sendMessage(from, { text: "❌ මාධ්‍යය සොයාගත නොහැකි විය." }, { quoted: msg });
      }

      const info = resData.data;
      const downloads = info.downloads;
      const title = info.title || 'Pinterest Media';

      // 1. මුලින්ම downloads array එකේ video / mp4 එකක් තියෙනවද බලනවා
      let videoItem = downloads.find(dl => 
        (dl.type && dl.type.toLowerCase().includes('video')) ||
        (dl.name && dl.name.toLowerCase().includes('video')) ||
        (dl.link && dl.link.toLowerCase().includes('.mp4'))
      );

      // 2. API එකේ trailer හෝ වෙනත් video link එකක් ඇත්නම් එයද පරීක්ෂා කිරීම
      let videoUrl = videoItem ? videoItem.link : null;
      if (!videoUrl && info.trailer && info.trailer !== 'N/A' && info.trailer.includes('http')) {
        videoUrl = info.trailer;
      }

      // 3. වීඩියෝ එකක් හමු වුණා නම් අනිවාර්යයෙන්ම Video එක යවනවා
      if (videoUrl) {
        const caption = `╭───『 ᴘɪɴᴛᴇʀᴇsᴛ ᴠɪᴅᴇᴏ 』───\n` +
                        `│\n` +
                        `├─▸ 📌 *Title:* ${title}\n` +
                        `├─▸ 🎬 *Format:* MP4 Video\n` +
                        `│\n` +
                        `└───『 ᴅᴀʀᴋ ᴅɪɴᴜ 』───`;

        await sock.sendMessage(from, {
          video: { url: videoUrl },
          caption: caption,
          mimetype: 'video/mp4'
        }, { quoted: msg });

      } else {
        // Video එකක් ඇත්තටම නැතිනම් පමණක් Image එක යවනවා
        const imageItem = downloads.find(dl => dl.type?.includes('image') || dl.type === 'image_direct') || downloads[0];

        const caption = `╭───『 ᴘɪɴᴛᴇʀᴇsᴛ ɪᴍᴀɢᴇ 』───\n` +
                        `│\n` +
                        `├─▸ 📌 *Title:* ${title}\n` +
                        `├─▸ 🖼️ *Format:* Image\n` +
                        `│\n` +
                        `└───『 ᴅᴀʀᴋ ᴅɪɴᴜ 』───`;

        await sock.sendMessage(from, {
          image: { url: imageItem.link },
          caption: caption
        }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });

    } catch (err) {
      console.error("Pinterest Error:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await sock.sendMessage(from, { text: `❌ දෝෂයක් සිදුවිය: ${err.message}` }, { quoted: msg });
    }
  }
};
