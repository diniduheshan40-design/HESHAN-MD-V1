const axios = require('axios');

module.exports = {
  name: "pinterest",
  alias: ["pt"],
  desc: "Download Pinterest Videos Only",
  async execute(sock, msg, args, from) {
    try {
      const inputUrl = args.join(' ').trim();

      if (!inputUrl) {
        return await sock.sendMessage(from, { 
          text: "⚠️ කරුණාකර Pinterest Video Link එකක් ලබා දෙන්න!\n\nඋදාහරණයක්:\n*.pt https://pin.it/8qffdstax*" 
        }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      // 1. pin.it short link එක සැබෑ pinterest.com link එක බවට හරවා ගැනීම (Unshorten)
      let fullUrl = inputUrl;
      if (inputUrl.includes('pin.it')) {
        try {
          const redirectRes = await axios.get(inputUrl, {
            maxRedirects: 10,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
            }
          });
          fullUrl = redirectRes.request?.res?.responseUrl || redirectRes.config?.url || inputUrl;
        } catch (e) {
          // ignore redirect errors
        }
      }

      // 2. Chamindu API එක මගින් Full URL එක හරහා වීඩියෝව ලබා ගැනීම
      const apiKey = 'chama_api_ec9848130d1aea209f08fb85e0b4720f';
      const apiUrl = `https://api.chamindu.site/api/v1/media/pinterest/infodl?q=${encodeURIComponent(fullUrl)}&api_key=${apiKey}`;

      const { data } = await axios.get(apiUrl);

      let videoUrl = null;

      // JSON එක ඇතුළෙන් video file එකක් ඇත්නම් පමණක් සොයා ගැනීම
      if (data && data.data && Array.isArray(data.data.downloads)) {
        const vItem = data.data.downloads.find(d => 
          (d.type && d.type.toLowerCase().includes('video')) ||
          (d.name && d.name.toLowerCase().includes('video')) ||
          (d.link && d.link.includes('.mp4'))
        );
        if (vItem) videoUrl = vItem.link;
      }

      // 3. Chamindu API එකේ නැතිනම් Supun API එකට යොමු කිරීම (Fallback)
      if (!videoUrl) {
        const supunApi = `https://supunofc.site/api/download/down/pin/dl?url=${encodeURIComponent(fullUrl)}&apikey=supun-tvo5olfxylo98b8l6b9lq174`;
        const sRes = await axios.get(supunApi);
        const sData = sRes.data?.result || sRes.data?.data || sRes.data;

        if (typeof sData === 'object') {
          videoUrl = sData.video || sData.video_url || sData.nowm || sData.url_video;
          if (!videoUrl && Array.isArray(sData.downloads)) {
            const sv = sData.downloads.find(i => (i.type && i.type.includes('video')) || (i.url && i.url.includes('.mp4')));
            if (sv) videoUrl = sv.url || sv.link;
          }
        }
      }

      // 4. වීඩියෝවක් හමු නොවූයේ නම් Photo නොයවා Error මැසේජ් එකක් දැක්වීම
      if (!videoUrl) {
        await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
        return await sock.sendMessage(from, { 
          text: "❌ මෙම Pin එකෙහි MP4 Video එකක් සොයාගත නොහැකි විය. කරුණාකර වෙනත් වීඩියෝවක් උත්සාහ කරන්න." 
        }, { quoted: msg });
      }

      const caption = `╭───『 ᴘɪɴᴛᴇʀᴇsᴛ ᴠɪᴅᴇᴏ 』───\n` +
                      `│\n` +
                      `├─▸ 👤 *Bot:* DARK DINU\n` +
                      `├─▸ 🎬 *Format:* MP4 Video\n` +
                      `│\n` +
                      `└───『 ᴅᴀʀᴋ ᴅɪɴᴜ 』───`;

      // 5. Buffer එකක් ලෙස කෙලින්ම Video Stream එක යැවීම
      await sock.sendMessage(from, {
        video: { url: videoUrl },
        caption: caption,
        mimetype: 'video/mp4'
      }, { quoted: msg });

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });

    } catch (err) {
      console.error("Pinterest Error:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await sock.sendMessage(from, { text: `❌ දෝෂයක් සිදුවිය: ${err.message}` }, { quoted: msg });
    }
  }
};
