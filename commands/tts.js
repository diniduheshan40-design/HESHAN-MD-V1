const axios = require('axios');

module.exports = {
  name: 'tts',
  alias: ['speak', 'say', 'girl', 'voice'],
  desc: 'Convert text to realistic cute girl voice',
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
          text: `*කරුණාකර කෙල්ලට කියන්න ඕනෙ දේ ලියන්න!* 😉❤️\n\n*උදාහරණ:*\n.tts හායි සුදූ ඔයාට කොහොමද?\n.tts Hey babe, what are you doing?` 
        }, { quoted: msg });
      }

      await sock.sendMessage(chatJid, { react: { text: '💖', key: msg.key } });

      // සිංහල අකුරු තියෙනවද බැලීම
      const hasSinhala = /[\u0D80-\u0DFF]/.test(text);

      let ttsUrl = '';

      if (hasSinhala) {
        // සිංහල කෙල්ලගෙ කටහඬ (Google / Microsoft Neural Sinhala Female)
        // සිංහල භාෂාවට වඩාත් පැහැදිලි high-pitch female audio endpoint එක
        ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=si&client=tw-ob&pitch=1.2`;
      } else {
        // English සඳහා ලස්සන, තරුණ කෙල්ලෙක්ගෙ Cute Neural Voice එකක් (StreamElements Brian/Amy/Salli or Edge TTS)
        // Salli / Joanna / Ivy කියන්නෙ සුපිරිම cute girl voices
        ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Salli&text=${encodeURIComponent(text)}`;
      }

      const response = await axios.get(ttsUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        timeout: 20000
      });

      const audioBuffer = Buffer.from(response.data);

      // WhatsApp Voice Note (PTT) විදියටම යවනවා (කොළ පාට mic ලකුණත් එක්ක ලස්සනට Play වෙන්න)
      await sock.sendMessage(
        chatJid,
        {
          audio: audioBuffer,
          mimetype: 'audio/mpeg',
          fileName: 'cute_girl_voice.mp3',
          ptt: true
        },
        { quoted: msg }
      );

      await sock.sendMessage(chatJid, { react: { text: '💋', key: msg.key } });

    } catch (err) {
      console.error('Girl TTS Error:', err);
      // Fallback
      try {
        const fallbackUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(args.join(' '))}&tl=si&client=tw-ob`;
        const res = await axios.get(fallbackUrl, { responseType: 'arraybuffer' });
        await sock.sendMessage(chatJid, { audio: Buffer.from(res.data), mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(chatJid, { text: `❌ කටහඬ හදන්න බැරි වුණා: ${err.message}` }, { quoted: msg });
      }
    }
  }
};
