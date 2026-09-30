const axios = require('axios');

module.exports = {
  name: 'tts',
  alias: ['speak', 'say', 'voice'],
  desc: 'Convert text to voice message',
  category: 'convert',
  async execute(sock, msg, args, chatJid, extra = {}) {
    try {
      // User reply කරපු මැසේජ් එකක් තියෙනවා නම් ඒකේ text එක ගන්නවා, නැත්නම් command එකත් එක්ක දුන්න text එක ගන්නවා
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
          text: `*කරුණාකර හඬ බවට පත් කිරීමට වචනයක් හෝ වාක්‍යයක් ලබාදෙන්න!*\n\n*උදාහරණ:* \n.tts Hello bro\n.tts si කොහොමද යාලුවේ` 
        }, { quoted: msg });
      }

      // Default language එක සිංහල (si) හෝ English (en) ලෙස හඳුනාගැනීම
      let lang = 'si';
      if (args[0] && args[0].length === 2) {
        lang = args[0].toLowerCase();
        text = args.slice(1).join(' ');
      } else {
        // සිංහල අකුරු නැත්නම් default English වලට මාරු කිරීම
        const hasSinhala = /[\u0D80-\u0DFF]/.test(text);
        lang = hasSinhala ? 'si' : 'en';
      }

      await sock.sendMessage(chatJid, { react: { text: '🎙️', key: msg.key } });

      // Google TTS Public Endpoint එක
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;

      const response = await axios.get(ttsUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        timeout: 15000
      });

      const audioBuffer = Buffer.from(response.data);

      // Voice note (PTT) එකක් විදිහට Chat එකට යැවීම
      await sock.sendMessage(
        chatJid,
        {
          audio: audioBuffer,
          mimetype: 'audio/mp4',
          ptt: true
        },
        { quoted: msg }
      );

      await sock.sendMessage(chatJid, { react: { text: '✅', key: msg.key } });

    } catch (err) {
      console.error('TTS Error:', err);
      await sock.sendMessage(chatJid, { 
        text: `❌ Voice note එක සෑදීමේදී දෝෂයක් මතු විය: ${err.message}` 
      }, { quoted: msg });
    }
  }
};
