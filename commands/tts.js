const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { Readable, PassThrough } = require('stream');

ffmpeg.setFfmpegPath(ffmpegPath);

module.exports = {
  name: 'tts',
  alias: ['speak', 'say', 'voice', 'girl'],
  desc: 'Text to speech real WhatsApp voice note (PTT)',
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
          text: `*කරුණාකර හඬ බවට පත් කිරීමට වචනයක් ලබාදෙන්න!* 🎙️\n\n*උදාහරණ:* \n.tts දැන් හරිද ඔයාව\n.tts Hello cute girl` 
        }, { quoted: msg });
      }

      await sock.sendMessage(chatJid, { react: { text: '🎙️', key: msg.key } });

      const hasSinhala = /[\u0D80-\u0DFF]/.test(text);
      let audioUrl = '';

      if (hasSinhala) {
        // Sinhala audio endpoint
        audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=si&client=tw-ob`;
      } else {
        // English Cute Girl (Salli)
        audioUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Salli&text=${encodeURIComponent(text)}`;
      }

      // Audio stream එක download කරගැනීම
      const res = await axios.get(audioUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        timeout: 15000
      });

      const inputStream = new Readable();
      inputStream.push(Buffer.from(res.data));
      inputStream.push(null);

      // Memory stream හරහා Real WhatsApp OGG/OPUS බවට පරිවර්තනය කිරීම (No file lag/freeze)
      const opusBuffer = await new Promise((resolve, reject) => {
        const outputStream = new PassThrough();
        const chunks = [];

        outputStream.on('data', chunk => chunks.push(chunk));
        outputStream.on('end', () => resolve(Buffer.concat(chunks)));
        outputStream.on('error', reject);

        ffmpeg(inputStream)
          .noVideo()
          .audioCodec('libopus')
          .audioChannels(1)
          .audioFrequency(48000)
          .format('ogg')
          .outputOptions([
            '-avoid_negative_ts make_zero',
            '-map_metadata -1'
          ])
          .on('error', err => reject(err))
          .pipe(outputStream, { end: true });
      });

      // Profile picture එක සහිත Real WhatsApp Voice Note (PTT) එකක් විදිහට යැවීම
      await sock.sendMessage(
        chatJid,
        {
          audio: opusBuffer,
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true // මේකෙන් තමයි කෙළවරේ profile picture එක වැටිලා mic voice note එකක් විදිහට එන්නේ
        },
        { quoted: msg }
      );

      await sock.sendMessage(chatJid, { react: { text: '💋', key: msg.key } });

    } catch (err) {
      console.error('PTT Voice Error:', err.message);
      await sock.sendMessage(chatJid, { 
        text: `❌ Voice note සෑදීමේ දෝෂයක්: ${err.message}` 
      }, { quoted: msg });
    }
  }
};
