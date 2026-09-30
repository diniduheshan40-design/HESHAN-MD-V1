const axios = require('axios');

module.exports = {
  name: "pinterest",
  alias: ["pt"],
  desc: "Download Pinterest videos or images",
  async execute(sock, msg, args, from) {
    try {
      // 1. Link එක ලබා ගැනීම
      const inputUrl = args.join(' ');

      if (!inputUrl) {
        return await sock.sendMessage(from, { 
          text: "⚠️ කරුණාකර Pinterest Link එකක් ලබා දෙන්න!\n\nඋදාහරණයක්:\n*.pt https://www.pinterest.com/pin/xxxxxxxxx/*" 
        }, { quoted: msg });
      }

      // 2. Processing reaction එක දැමීම
      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      // 3. pin.it short links full URL බවට හරවා ගැනීම
      let targetUrl = inputUrl.trim();
      if (targetUrl.includes('pin.it')) {
        const headRes = await axios.get(targetUrl, { maxRedirects: 5 });
        targetUrl = headRes.request?.res?.responseUrl || targetUrl;
      }

      // 4. API Call එක
      const apiKey = 'chama_api_ec9848130d1aea209f08fb85e0b4720f';
      const apiUrl = `https://api.chamindu.site/api/v1/media/pinterest/infodl?q=${encodeURIComponent(targetUrl)}&api_key=${apiKey}`;

      const response = await axios.get(apiUrl);
      const resData = response.data;

      if (!resData.status || !resData.data || !resData.data.downloads || !resData.data.downloads.length) {
        await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
        return await sock.sendMessage(from, { text: "❌ මාධ්‍යය සොයාගත නොහැකි විය. Link එක නිවැරදිදැයි පරීක්ෂා කරන්න." }, { quoted: msg });
      }

      const info = resData.data;
      const title = info.title || 'Pinterest Media';

      // වීඩියෝ එකක් හෝ පින්තූරයක්ද කියා හඳුනා ගැනීම
      const videoItem = info.downloads.find(dl => dl.type?.includes('video'));
      const imageItem = info.downloads.find(dl => dl.type?.includes('image') || dl.type === 'image_direct') || info.downloads[0];

      const caption = `╭───『 ᴘɪɴᴛᴇʀᴇsᴛ ᴅʟ 』───\n` +
                      `│\n` +
                      `├─▸ 📌 *Title:* ${title}\n` +
                      `├─▸ 🌐 *Type:* ${videoItem ? 'Video' : 'Image'}\n` +
                      `│\n` +
                      `└───『 ᴅᴀʀᴋ ᴅɪɴᴜ 』───`;

      // 5. Media එක යැවීම
      if (videoItem && videoItem.link) {
        await sock.sendMessage(from, {
          video: { url: videoItem.link },
          caption: caption,
          mimetype: 'video/mp4'
        }, { quoted: msg });
      } else if (imageItem && imageItem.link) {
        await sock.sendMessage(from, {
          image: { url: imageItem.link },
          caption: caption
        }, { quoted: msg });
      }

      // 6. අවසන් වූ පසු React එක
      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });

    } catch (err) {
      console.error("Pinterest Error:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await sock.sendMessage(from, { text: `❌ දෝෂයක් සිදුවිය: ${err.message}` }, { quoted: msg });
    }
  }
};
