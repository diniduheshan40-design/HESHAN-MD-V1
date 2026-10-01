const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

module.exports = {
  name: 'tts',
  alias: ['speak', 'say', 'voice', 'girl'],
  desc: 'Text to Speech WhatsApp Voice Note',
  category: 'convert',

  async execute(sock, msg, args, chatJid, extra = {}) {

    let inputFile = null;
    let outputFile = null;

    try {

      // ==========================================================
      // GET TEXT
      // ==========================================================

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
              `🎙️ *TTS VOICE*\n\n` +
              `හඬ බවට පත් කිරීමට text එකක් දෙන්න.\n\n` +
              `*Examples:*\n` +
              `.tts කොහොමද ඔයාට\n` +
              `.tts Hello cute girl`
          },
          { quoted: msg }
        );
      }

      // ==========================================================
      // REACTION
      // ==========================================================

      await sock.sendMessage(chatJid, {
        react: {
          text: '🎙️',
          key: msg.key
        }
      });

      // ==========================================================
      // LANGUAGE
      // ==========================================================

      const hasSinhala = /[\u0D80-\u0DFF]/.test(text);

      let audioUrl;

      if (hasSinhala) {

        audioUrl =
          'https://translate.google.com/translate_tts' +
          '?ie=UTF-8' +
          '&client=tw-ob' +
          '&tl=si' +
          '&q=' + encodeURIComponent(text);

      } else {

        audioUrl =
          'https://api.streamelements.com/kappa/v2/speech' +
          '?voice=Salli' +
          '&text=' + encodeURIComponent(text);
      }

      console.log('[TTS] Language:', hasSinhala ? 'Sinhala' : 'English');
      console.log('[TTS] Text:', text);

      // ==========================================================
      // DOWNLOAD AUDIO
      // ==========================================================

      const response = await axios.get(audioUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,

        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
          'Accept':
            'audio/mpeg,audio/*,*/*;q=0.8'
        }
      });

      const audioBuffer = Buffer.from(response.data);

      if (!audioBuffer.length) {
        throw new Error('TTS API returned empty audio');
      }

      console.log(
        '[TTS] Downloaded:',
        audioBuffer.length,
        'bytes'
      );

      // ==========================================================
      // TEMP FILES
      // ==========================================================

      const id =
        `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      inputFile = path.join(
        os.tmpdir(),
        `darkdinu_tts_${id}.mp3`
      );

      outputFile = path.join(
        os.tmpdir(),
        `darkdinu_voice_${id}.ogg`
      );

      fs.writeFileSync(inputFile, audioBuffer);

      // ==========================================================
      // FFMPEG
      // ==========================================================

      await new Promise((resolve, reject) => {

        const ffmpegArgs = [
          '-y',

          '-i',
          inputFile,

          // Audio only
          '-vn',

          // WhatsApp compatible Opus
          '-c:a',
          'libopus',

          // Mono
          '-ac',
          '1',

          // WhatsApp voice frequency
          '-ar',
          '48000',

          // Voice bitrate
          '-b:a',
          '32k',

          // Voice optimized
          '-application',
          'voip',

          // Important timestamp fix
          '-avoid_negative_ts',
          'make_zero',

          // Remove metadata
          '-map_metadata',
          '-1',

          // OGG container
          '-f',
          'ogg',

          outputFile
        ];

        console.log(
          '[TTS] Running FFmpeg...'
        );

        const process = execFile(
          ffmpegPath,
          ffmpegArgs,
          {
            windowsHide: true,
            maxBuffer: 10 * 1024 * 1024
          },
          (error, stdout, stderr) => {

            if (error) {
              console.error(
                '[FFMPEG ERROR]',
                stderr
              );

              return reject(
                new Error(
                  `FFmpeg failed: ${error.message}`
                )
              );
            }

            resolve();
          }
        );

        process.on('error', reject);
      });

      // ==========================================================
      // CHECK OGG FILE
      // ==========================================================

      if (!fs.existsSync(outputFile)) {
        throw new Error(
          'FFmpeg did not create OGG file'
        );
      }

      const oggBuffer =
        fs.readFileSync(outputFile);

      if (oggBuffer.length < 1000) {
        throw new Error(
          'Generated OGG file is too small'
        );
      }

      // OGG files MUST start with "OggS"
      const oggHeader =
        oggBuffer.subarray(0, 4).toString();

      console.log(
        '[TTS] OGG Header:',
        oggHeader
      );

      if (oggHeader !== 'OggS') {
        throw new Error(
          'Generated file is not a valid OGG file'
        );
      }

      console.log(
        '[TTS] Valid OGG/Opus:',
        oggBuffer.length,
        'bytes'
      );

      // ==========================================================
      // SEND AS REAL WHATSAPP VOICE NOTE
      // ==========================================================

      await sock.sendMessage(
        chatJid,
        {
          audio: oggBuffer,

          mimetype: 'audio/ogg; codecs=opus',

          // ⭐ REAL VOICE MESSAGE
          ptt: true
        },
        {
          quoted: msg
        }
      );

      // ==========================================================
      // SUCCESS
      // ==========================================================

      await sock.sendMessage(chatJid, {
        react: {
          text: '💋',
          key: msg.key
        }
      });

      console.log(
        '[TTS] Voice note sent successfully'
      );

    } catch (error) {

      console.error(
        '[DARK DINU TTS ERROR]',
        error
      );

      try {

        await sock.sendMessage(
          chatJid,
          {
            text:
              `❌ *TTS Voice Error*\n\n` +
              `${error.message || 'Unknown error'}`
          },
          {
            quoted: msg
          }
        );

      } catch (sendError) {

        console.error(
          '[TTS SEND ERROR]',
          sendError.message
        );
      }

    } finally {

      // ==========================================================
      // CLEAN TEMP FILES
      // ==========================================================

      try {
        if (
          inputFile &&
          fs.existsSync(inputFile)
        ) {
          fs.unlinkSync(inputFile);
        }
      } catch (e) {
        console.log(
          '[TTS] Input cleanup error:',
          e.message
        );
      }

      try {
        if (
          outputFile &&
          fs.existsSync(outputFile)
        ) {
          fs.unlinkSync(outputFile);
        }
      } catch (e) {
        console.log(
          '[TTS] Output cleanup error:',
          e.message
        );
      }
    }
  }
};
