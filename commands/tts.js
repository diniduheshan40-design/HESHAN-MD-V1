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
  desc: 'Text to speech Voice Note',
  category: 'convert',

  async execute(sock, msg, args, chatJid, extra = {}) {

    let inputFile = null;
    let outputFile = null;

    try {

      // ============================================================
      // GET TEXT
      // ============================================================

      let text = args.join(' ').trim();

      const quoted =
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

      if (!text && quoted) {
        text =
          quoted.conversation ||
          quoted.extendedTextMessage?.text ||
          quoted.imageMessage?.caption ||
          quoted.videoMessage?.caption ||
          '';
      }

      text = String(text).trim();

      if (!text) {
        return await sock.sendMessage(
          chatJid,
          {
            text:
              `🎙️ *TTS Voice*\n\n` +
              `හඬ බවට පත් කිරීමට text එකක් දෙන්න.\n\n` +
              `*Examples:*\n` +
              `.tts දැන් හරිද ඔයාව\n` +
              `.tts Hello cute girl`
          },
          { quoted: msg }
        );
      }

      // ============================================================
      // REACTION
      // ============================================================

      await sock.sendMessage(chatJid, {
        react: {
          text: '🎙️',
          key: msg.key
        }
      });

      // ============================================================
      // DETECT LANGUAGE
      // ============================================================

      const hasSinhala = /[\u0D80-\u0DFF]/.test(text);

      let audioUrl;

      if (hasSinhala) {

        // Sinhala Google TTS
        audioUrl =
          `https://translate.google.com/translate_tts` +
          `?ie=UTF-8` +
          `&q=${encodeURIComponent(text)}` +
          `&tl=si` +
          `&client=tw-ob`;

      } else {

        // English female voice
        audioUrl =
          `https://api.streamelements.com/kappa/v2/speech` +
          `?voice=Salli` +
          `&text=${encodeURIComponent(text)}`;
      }

      // ============================================================
      // DOWNLOAD TTS AUDIO
      // ============================================================

      const response = await axios.get(audioUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'
        }
      });

      if (!response.data || !response.data.byteLength) {
        throw new Error('TTS audio data empty');
      }

      // ============================================================
      // TEMP FILES
      // ============================================================

      const tempDir = os.tmpdir();

      const randomId =
        `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      inputFile = path.join(
        tempDir,
        `tts_input_${randomId}.mp3`
      );

      outputFile = path.join(
        tempDir,
        `tts_voice_${randomId}.ogg`
      );

      fs.writeFileSync(
        inputFile,
        Buffer.from(response.data)
      );

      // ============================================================
      // FFMPEG -> REAL WHATSAPP OGG OPUS
      // ============================================================

      await new Promise((resolve, reject) => {

        ffmpeg(inputFile)

          .inputOptions([
            '-hide_banner'
          ])

          .noVideo()

          .audioCodec('libopus')

          // WhatsApp voice-note format
          .audioChannels(1)
          .audioFrequency(48000)

          // Good voice-note bitrate
          .audioBitrate('48k')

          .format('ogg')

          .outputOptions([
            '-application voip',
            '-vbr on',
            '-compression_level 10',
            '-frame_duration 20',
            '-avoid_negative_ts make_zero',
            '-map_metadata -1'
          ])

          .on('start', command => {
            console.log('[TTS FFMPEG]', command);
          })

          .on('progress', progress => {
            console.log(
              `[TTS] ${progress.percent || 0}%`
            );
          })

          .on('error', err => {
            reject(err);
          })

          .on('end', () => {
            resolve();
          })

          .save(outputFile);
      });

      // ============================================================
      // CHECK OUTPUT
      // ============================================================

      if (!fs.existsSync(outputFile)) {
        throw new Error('FFmpeg output file not created');
      }

      const stats = fs.statSync(outputFile);

      if (stats.size < 1000) {
        throw new Error('Generated voice file is invalid');
      }

      console.log(
        `[TTS] Voice generated: ${stats.size} bytes`
      );

      // ============================================================
      // SEND REAL WHATSAPP VOICE NOTE
      // ============================================================

      await sock.sendMessage(
        chatJid,
        {
          audio: {
            url: outputFile
          },

          mimetype: 'audio/ogg; codecs=opus',

          // ⭐ THIS MAKES IT A WHATSAPP VOICE NOTE
          ptt: true
        },
        {
          quoted: msg
        }
      );

      // ============================================================
      // SUCCESS REACTION
      // ============================================================

      await sock.sendMessage(chatJid, {
        react: {
          text: '💋',
          key: msg.key
        }
      });

    } catch (err) {

      console.error(
        '[TTS ERROR]',
        err
      );

      try {

        await sock.sendMessage(
          chatJid,
          {
            text:
              `❌ *Voice Note Error*\n\n` +
              `${err.message || 'Unknown error'}`
          },
          { quoted: msg }
        );

      } catch (sendErr) {
        console.error(
          '[TTS ERROR MESSAGE]',
          sendErr.message
        );
      }

    } finally {

      // ============================================================
      // CLEAN TEMP FILES
      // ============================================================

      try {
        if (inputFile && fs.existsSync(inputFile)) {
          fs.unlinkSync(inputFile);
        }
      } catch (e) {
        console.log(
          '[TTS] Input cleanup failed:',
          e.message
        );
      }

      try {
        if (outputFile && fs.existsSync(outputFile)) {
          fs.unlinkSync(outputFile);
        }
      } catch (e) {
        console.log(
          '[TTS] Output cleanup failed:',
          e.message
        );
      }
    }
  }
};
