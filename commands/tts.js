const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');
const path = require('path');
const os = require('os');

ffmpeg.setFfmpegPath(ffmpegPath);

module.exports = {
  name: 'tts',
  alias: ['speak', 'say', 'voice', 'girl'],
  desc: 'Convert text to voice note with female audio',
  category: 'convert',
  async execute(sock, msg, args, chatJid, extra = {}) {
    let tempMp3 = null;
    let tempOpus = null;

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
      let ttsUrl = '';

      if (hasSinhala) {
        // Sinhala female pitch endpoint
        ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=si&client=tw-ob`;
      } else {
        // Natural girl voice for English
        ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Salli&text=${encodeURIComponent(text)}`;
      }

      const res = await axios.get(ttsUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        timeout: 20000
      });

      const uniqueId = Date.now();
      tempMp3 = path.join(os.tmpdir(), `tts_${uniqueId}.mp3`);
      tempOpus = path.join(os.tmpdir(), `tts_${uniqueId}.opus`);

      fs.writeFileSync(tempMp3, Buffer.from(res.data));

      // FFmpeg මගින් WhatsApp standard Voice Note (Opus) බවට පරිවර්තනය කිරීම
      await new Promise((resolve, reject) => {
        ffmpeg(tempMp3)
          .toFormat('ogg')
          .audioCodec('libopus')
          .audioChannels(1)
          .audioFrequency(48000)
          .outputOptions([
            '-avoid_negative_ts make_zero',
            '-map_metadata -1'
          ])
          .on('end', resolve)
          .on('error', reject)
          .save(tempOpus);
      });

      const opusBuffer = fs.readFileSync(tempOpus);

      // WhatsApp Voice Note ලෙස යැවීම
      await sock.sendMessage(
        chatJid,
        {
          audio: opusBuffer,
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true
        },
        { quoted: msg }
      );

      await sock.sendMessage(chatJid, { react: { text: '💋', key: msg.key } });

    } catch (err) {
      console.error('TTS Engine Error:', err);
      await sock.sendMessage(chatJid, { 
        text: `❌ හඬ සෑදීමේ දෝෂයක්: ${err.message}` 
      }, { quoted: msg });
    } finally {
      // Temporary files ඉවත් කිරීම
      if (tempMp3 && fs.existsSync(tempMp3)) try { fs.unlinkSync(tempMp3); } catch (e) {}
      if (tempOpus && fs.existsSync(tempOpus)) try { fs.unlinkSync(tempOpus); } catch (e) {}
    }
  }
};
