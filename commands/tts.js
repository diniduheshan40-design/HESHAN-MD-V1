const axios = require('axios');

module.exports = {
  name: 'tts',
  alias: ['speak', 'say', 'voice', 'girl'],
  desc: 'Text to speech audio message',
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
          text: `*කරුණාකර හඬ බවට පත් කිරීමට වචනයක් ලබාදෙන්න!* 🎙️\n\n*උදාහරණ:* \n.tts අම්මට නිදිමතයි\n.tts Hello cute girl` 
        }, { quoted: msg });
      }

      await sock.sendMessage(chatJid, { react: { text: '🎙️', key: msg.key } });

      const hasSinhala = /[\u0D80-\u0DFF]/.test(text);
      let audioUrl = '';

      if (hasSinhala) {
        // Sinhala voice
        audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=si&client=tw-ob`;
      } else {
        // English Cute Girl (Salli - StreamElements)
        audioUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Salli&text=${encodeURIComponent(text)}`;
      }

      const res = await axios.get(audioUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        timeout: 15000
      });

      const audioBuffer = Buffer.from(res.data);

      // WhatsApp එකේ කිසිම දෝෂයක් නැතුව Audio එක Play වෙන්න audio/mp4 සහ standard audio track එකක් විදිහට යැවීම
      await sock.sendMessage(
        chatJid,
        {
          audio: audioBuffer,
          mimetype: 'audio/mp4',
          fileName: 'voice.mp3',
          ptt: false // Voice note එකක් (PTT) විදියට දාලා corrupt නොවී, Playable Audio Track එකක් ලෙස යැවීම
        },
        { quoted: msg }
      );

      await sock.sendMessage(chatJid, { react: { text: '✅', key: msg.key } });

    } catch (err) {
      console.error('TTS Error:', err.message);
      await sock.sendMessage(chatJid, { 
        text: `❌ Error: ${err.message}` 
      }, { quoted: msg });
    }
  }
};
