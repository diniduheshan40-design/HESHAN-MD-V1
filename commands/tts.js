const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;


// ============================================================
// RUN FFMPEG
// ============================================================

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {

    execFile(
      ffmpegPath,
      args,
      {
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024
      },
      (error, stdout, stderr) => {

        if (error) {
          console.error("[FFMPEG ERROR]");
          console.error(stderr);

          return reject(
            new Error(
              stderr?.trim() ||
              error.message ||
              "FFmpeg error"
            )
          );
        }

        resolve({
          stdout,
          stderr
        });
      }
    );
  });
}


// ============================================================
// GET AUDIO DURATION FROM PCM
// 16-bit mono PCM @ 16000Hz
// ============================================================

function getPcmDuration(pcmBuffer) {

  const bytesPerSecond =
    16000 * 1 * 2;

  return Math.max(
    1,
    Math.ceil(
      pcmBuffer.length /
      bytesPerSecond
    )
  );
}


// ============================================================
// CREATE WHATSAPP WAVEFORM
// 64 BARS
// ============================================================

function createWaveform(pcmBuffer) {

  const samples = 64;

  const bytesPerSample = 2;

  const totalSamples =
    Math.floor(
      pcmBuffer.length /
      bytesPerSample
    );

  if (!totalSamples) {

    return Buffer.from(
      new Uint8Array(
        samples
      ).fill(50)
    );
  }

  const blockSize =
    Math.max(
      1,
      Math.floor(
        totalSamples /
        samples
      )
    );

  const waveform =
    new Uint8Array(samples);

  let maxAmplitude = 1;

  const amplitudes =
    new Array(samples).fill(0);


  // ==========================================================
  // FIND RMS AMPLITUDE FOR EACH BLOCK
  // ==========================================================

  for (let i = 0; i < samples; i++) {

    const start =
      i * blockSize;

    const end =
      Math.min(
        totalSamples,
        start + blockSize
      );

    let sum = 0;
    let count = 0;

    for (
      let sample = start;
      sample < end;
      sample++
    ) {

      const offset =
        sample * bytesPerSample;

      if (
        offset + 1 >=
        pcmBuffer.length
      ) {
        break;
      }

      const value =
        pcmBuffer.readInt16LE(
          offset
        );

      const normalized =
        Math.abs(value) / 32768;

      sum +=
        normalized *
        normalized;

      count++;
    }

    if (count > 0) {

      const rms =
        Math.sqrt(
          sum / count
        );

      amplitudes[i] =
        rms;

      if (
        rms >
        maxAmplitude
      ) {
        maxAmplitude =
          rms;
      }
    }
  }


  // ==========================================================
  // NORMALIZE 0 - 100
  // ==========================================================

  for (let i = 0; i < samples; i++) {

    let value =
      amplitudes[i] /
      maxAmplitude;

    // Make quiet voice parts visible
    value =
      Math.max(
        0.12,
        value
      );

    value =
      Math.min(
        1,
        value
      );

    waveform[i] =
      Math.max(
        1,
        Math.min(
          100,
          Math.round(
            value * 100
          )
        )
      );
  }

  return Buffer.from(
    waveform
  );
}


// ============================================================
// MODULE
// ============================================================

module.exports = {

  name: "tts",

  alias: [
    "speak",
    "say",
    "voice",
    "girl"
  ],

  desc:
    "Text to Speech Real WhatsApp Voice Note",

  category: "convert",


  async execute(
    sock,
    msg,
    args,
    chatJid,
    extra = {}
  ) {

    let inputFile = null;
    let outputFile = null;
    let pcmFile = null;

    try {

      // ========================================================
      // GET TEXT
      // ========================================================

      let text =
        args
          .join(" ")
          .trim();

      const quoted =
        msg.message
          ?.extendedTextMessage
          ?.contextInfo
          ?.quotedMessage;


      // Reply to text message
      if (
        !text &&
        quoted
      ) {

        text =
          quoted.conversation ||
          quoted.extendedTextMessage?.text ||
          quoted.imageMessage?.caption ||
          quoted.videoMessage?.caption ||
          "";
      }


      text =
        String(text)
          .trim();


      // ========================================================
      // NO TEXT
      // ========================================================

      if (!text) {

        return await sock.sendMessage(
          chatJid,
          {
            text:
              `🎙️ *TTS VOICE NOTE*\n\n` +
              `හඬ බවට පත් කරන්න text එකක් දෙන්න.\n\n` +
              `*Examples:*\n` +
              `.tts කොහොමද ඔයාට\n` +
              `.tts මට ඔයාව මතක් වෙනවා\n` +
              `.tts Hello cute girl`
          },
          {
            quoted: msg
          }
        );
      }


      // ========================================================
      // PROCESS REACTION
      // ========================================================

      await sock.sendMessage(
        chatJid,
        {
          react: {
            text: "🎙️",
            key: msg.key
          }
        }
      );


      // ========================================================
      // LANGUAGE DETECTION
      // ========================================================

      const hasSinhala =
        /[\u0D80-\u0DFF]/.test(
          text
        );


      let audioUrl;


      // ========================================================
      // SINHALA
      // ========================================================

      if (hasSinhala) {

        audioUrl =
          "https://translate.google.com/translate_tts" +
          "?ie=UTF-8" +
          "&client=tw-ob" +
          "&tl=si" +
          "&q=" +
          encodeURIComponent(
            text
          );

      }

      // ========================================================
      // ENGLISH
      // ========================================================

      else {

        audioUrl =
          "https://api.streamelements.com/kappa/v2/speech" +
          "?voice=Salli" +
          "&text=" +
          encodeURIComponent(
            text
          );
      }


      console.log(
        "[TTS] Language:",
        hasSinhala
          ? "Sinhala"
          : "English"
      );

      console.log(
        "[TTS] Text:",
        text
      );


      // ========================================================
      // DOWNLOAD TTS
      // ========================================================

      const response =
        await axios.get(
          audioUrl,
          {
            responseType:
              "arraybuffer",

            timeout:
              30000,

            headers: {
              "User-Agent":
                "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36",

              "Accept":
                "audio/mpeg,audio/*,*/*"
            }
          }
        );


      const inputBuffer =
        Buffer.from(
          response.data
        );


      if (
        !inputBuffer.length
      ) {
        throw new Error(
          "TTS server returned empty audio"
        );
      }


      console.log(
        "[TTS] Downloaded:",
        inputBuffer.length,
        "bytes"
      );


      // ========================================================
      // TEMP FILES
      // ========================================================

      const id =
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .substring(2, 8);


      inputFile =
        path.join(
          os.tmpdir(),
          `darkdinu_tts_${id}.input`
        );


      outputFile =
        path.join(
          os.tmpdir(),
          `darkdinu_tts_${id}.ogg`
        );


      pcmFile =
        path.join(
          os.tmpdir(),
          `darkdinu_tts_${id}.pcm`
        );


      fs.writeFileSync(
        inputFile,
        inputBuffer
      );


      // ========================================================
      // STEP 1
      // CREATE REAL OGG / OPUS
      // ========================================================

      console.log(
        "[TTS] Creating OGG/Opus..."
      );


      await runFFmpeg([
        "-y",

        "-hide_banner",

        "-loglevel",
        "error",

        "-i",
        inputFile,

        "-vn",

        // OPUS
        "-c:a",
        "libopus",

        // MONO
        "-ac",
        "1",

        // Standard audio rate
        "-ar",
        "48000",

        // Voice bitrate
        "-b:a",
        "32k",

        // Voice optimized
        "-application",
        "voip",

        // Good Opus compression
        "-compression_level",
        "10",

        // Frame
        "-frame_duration",
        "20",

        // Timestamp
        "-avoid_negative_ts",
        "make_zero",

        // Remove metadata
        "-map_metadata",
        "-1",

        // OGG
        "-f",
        "ogg",

        outputFile
      ]);


      // ========================================================
      // CHECK OGG
      // ========================================================

      if (
        !fs.existsSync(
          outputFile
        )
      ) {
        throw new Error(
          "FFmpeg did not create OGG file"
        );
      }


      const voiceBuffer =
        fs.readFileSync(
          outputFile
        );


      if (
        voiceBuffer.length <
        1000
      ) {
        throw new Error(
          "Generated OGG file is too small"
        );
      }


      // OGG signature
      const header =
        voiceBuffer
          .subarray(
            0,
            4
          )
          .toString();


      if (
        header !==
        "OggS"
      ) {

        throw new Error(
          "Generated file is not valid OGG"
        );
      }


      console.log(
        "[TTS] Valid OGG:",
        voiceBuffer.length,
        "bytes"
      );


      // ========================================================
      // STEP 2
      // DECODE AUDIO TO RAW PCM
      //
      // This is ONLY for waveform generation.
      // The actual WhatsApp audio remains OGG/Opus.
      // ========================================================

      console.log(
        "[TTS] Generating waveform..."
      );


      await runFFmpeg([
        "-y",

        "-hide_banner",

        "-loglevel",
        "error",

        "-i",
        outputFile,

        "-vn",

        "-ac",
        "1",

        "-ar",
        "16000",

        "-f",
        "s16le",

        pcmFile
      ]);


      if (
        !fs.existsSync(
          pcmFile
        )
      ) {
        throw new Error(
          "PCM waveform file was not created"
        );
      }


      const pcmBuffer =
        fs.readFileSync(
          pcmFile
        );


      if (
        !pcmBuffer.length
      ) {
        throw new Error(
          "PCM audio is empty"
        );
      }


      // ========================================================
      // DURATION
      // ========================================================

      const seconds =
        getPcmDuration(
          pcmBuffer
        );


      // ========================================================
      // WAVEFORM
      // ========================================================

      const waveform =
        createWaveform(
          pcmBuffer
        );


      console.log(
        "[TTS] Duration:",
        seconds,
        "seconds"
      );


      console.log(
        "[TTS] Waveform:",
        waveform.length,
        "bars"
      );


      // ========================================================
      // STEP 3
      // SEND REAL WHATSAPP PTT
      // ========================================================

      await sock.sendMessage(
        chatJid,
        {
          audio:
            voiceBuffer,

          mimetype:
            "audio/ogg; codecs=opus",

          // ⭐ REAL VOICE NOTE
          ptt:
            true,

          // ⭐ AUDIO DURATION
          seconds:
            seconds,

          // ⭐ 64 WAVEFORM BARS
          waveform:
            waveform
        },
        {
          quoted:
            msg
        }
      );


      // ========================================================
      // SUCCESS
      // ========================================================

      await sock.sendMessage(
        chatJid,
        {
          react: {
            text: "💋",
            key: msg.key
          }
        }
      );


      console.log(
        "[TTS] ============================="
      );

      console.log(
        "[TTS] VOICE NOTE SENT"
      );

      console.log(
        "[TTS] ============================="
      );


    } catch (error) {

      console.error(
        "[DARK DINU TTS ERROR]"
      );

      console.error(
        error
      );


      try {

        await sock.sendMessage(
          chatJid,
          {
            text:
              `❌ *TTS Voice Error*\n\n` +
              `${error.message || "Unknown error"}`
          },
          {
            quoted:
              msg
          }
        );

      } catch (sendError) {

        console.error(
          "[TTS ERROR MESSAGE]",
          sendError.message
        );
      }

    } finally {

      // ========================================================
      // DELETE TEMP FILES
      // ========================================================

      try {

        if (
          inputFile &&
          fs.existsSync(
            inputFile
          )
        ) {
          fs.unlinkSync(
            inputFile
          );
        }

      } catch (e) {}


      try {

        if (
          outputFile &&
          fs.existsSync(
            outputFile
          )
        ) {
          fs.unlinkSync(
            outputFile
          );
        }

      } catch (e) {}


      try {

        if (
          pcmFile &&
          fs.existsSync(
            pcmFile
          )
        ) {
          fs.unlinkSync(
            pcmFile
          );
        }

      } catch (e) {}
    }
  }
};
