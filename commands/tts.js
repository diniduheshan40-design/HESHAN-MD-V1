const axios = require('axios');

module.exports = {
  name: 'tts',
  alias: ['speak', 'say', 'voice'],
  desc: 'Convert text to WhatsApp voice message',
  category: 'convert',
  async execute(sock, msg, args, chatJid, extra = {}) {
    try {
      let text = args.join(' ');
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

      if (!text && quoted) {
        text = quoted.conversation || 
               quoted.extendedTextMessage?.text || 
               quoted.imageMessage?.caption || 
               quoted.videoMessage?.caption || '';
      }

      if (!text) {
        return await sock.sendMessage(chatJid, { 
          text: `*කරුණාකර හඬ බවට පත් කිරීමට වචනයක් ලබාදෙන්න!*\n\n*උදාහරණ:* \n.tts කොහොමද යාලුවේ\n.tts Hello bro` 
        }, { quoted: msg });
      }

      // Default language එක සිංහල (si) හෝ English (en) ලෙස හඳුනාගැනීම
      let lang = 'si';
      if (args[0] && args[0].length === 2 && !/[\u0D80-\u0DFF]/.test(args[0])) {
        lang = args[0].toLowerCase();
        text = args.slice(1).join(' ');
      } else {
        const hasSinhala = /[\u0D80-\u0DFF]/.test(text);
        lang = hasSinhala ? 'si' : 'en';
      }

      await sock.sendMessage(chatJid, { react: { text: '🎙️', key: msg.key } });

      // Google Translate Public TTS URL
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;

      const response = await axios.get(ttsUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000
      });

      const audioBuffer = Buffer.from(response.data);

      // WhatsApp එකට නිවැරදි Mimetype එක ලබාදීම (audio/mpeg)
      await sock.sendMessage(
        chatJid,
        {
          audio: audioBuffer,
          mimetype: 'audio/mpeg',
          fileName: 'tts.mp3',
          ptt: false // Voice note එකක් වෙනුවට playable audio එකක් ලෙස යැවීමෙන් corrupt නොවී Play වේ
        },
        { quoted: msg }
      );

      await sock.sendMessage(chatJid, { react: { text: '✅', key: msg.key } });

    } catch (err) {
      console.error('TTS Error:', err);
      await sock.sendMessage(chatJid, { 
        text: `❌ Voice note සෑදීමේ දෝෂයක්: ${err.message}` 
      }, { quoted: msg });
    }
  }
};
