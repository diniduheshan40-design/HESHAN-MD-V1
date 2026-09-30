const axios = require('axios');

module.exports = {
  name: "pinterest",
  alias: ["pt"],
  desc: "Download Pinterest videos or images using Supun API",
  async execute(sock, msg, args, from) {
    try {
      const inputUrl = args.join(' ');

      if (!inputUrl) {
        return await sock.sendMessage(from, { 
          text: "⚠️ කරුණාකර Pinterest Link එකක් ලබා දෙන්න!\n\nඋදාහරණයක්:\n*.pt https://pin.it/xxxxx*" 
        }, { quoted: msg });
      }

      // Processing reaction එක දැමීම
      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      const apiKey = 'supun-tvo5olfxylo98b8l6b9lq174';
      const apiUrl = `https://supunofc.site/api/download/down/pin/dl?url=${encodeURIComponent(inputUrl.trim())}&apikey=${apiKey}`;

      const response = await axios.get(apiUrl);
      const resData = response.data;

      // API Response එක check කිරීම
      if (!resData.status && !resData.success && !resData.result && !resData.data) {
        await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
        return await sock.sendMessage(from, { text: `❌ මාධ්‍යය බාගත කළ නොහැකි විය: ${resData.error || 'දෝෂයක් සිදුවිය'}` }, { quoted: msg });
      }

      const data = resData.result || resData.data || resData;

      // Video එකක් හෝ Image link එකක් තියෙනවද සොයා බැලීම
      let videoUrl = data.video || data.video_url || (data.downloads && data.downloads.find(d => d.type?.includes('video'))?.url);
      let imageUrl = data.image || data.image_url || data.url || (data.downloads && data.downloads[0]?.url);

      // සරල string link එකක් ආවොත් (result එක string එකක් ලෙස ලැබුණහොත්)
      if (typeof data === 'string' && data.startsWith('http')) {
        if (data.includes('.mp4')) videoUrl = data;
        else imageUrl = data;
      }

      const caption = `╭───『 ᴘɪɴᴛᴇʀᴇsᴛ ᴅʟ 』───\n` +
                      `│\n` +
                      `├─▸ 👤 *Bot:* DARK DINU\n` +
                      `├─▸ 🎬 *Status:* Success\n` +
                      `│\n` +
                      `└───『 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅɪɴᴜ 』───`;

      // Video එකක් තිබේ නම් Video එක යැවීම
      if (videoUrl) {
        await sock.sendMessage(from, {
          video: { url: videoUrl },
          caption: caption,
          mimetype: 'video/mp4'
        }, { quoted: msg });
      } else if (imageUrl) {
        // Image එකක් පමණක් ඇත්නම් Image එක යැවීම
        await sock.sendMessage(from, {
          image: { url: imageUrl },
          caption: caption
        }, { quoted: msg });
      } else {
        throw new Error('Download link එකක් හමු නොවීය.');
      }

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });

    } catch (err) {
      console.error("Pinterest Supun API Error:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await sock.sendMessage(from, { text: `❌ දෝෂයක් සිදුවිය: ${err.message}` }, { quoted: msg });
    }
  }
};
