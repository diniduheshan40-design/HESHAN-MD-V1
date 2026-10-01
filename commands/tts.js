const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

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
          console.error("[FFMPEG]", stderr);
          return reject(error);
        }

        resolve({
          stdout,
          stderr
        });
      }
    );
  });
}

async function getDuration(file) {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegPath,
      [
        "-i",
        file
      ],
      {
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      },
      (error, stdout, stderr) => {

        const output = `${stdout}\n${stderr}`;

        const match = output.match(
          /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i
        );

        if (!match) {
          return resolve(0);
        }

        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        const seconds = Number(match[3]);

        resolve(
          Math.ceil(
            hours * 3600 +
            minutes * 60 +
            seconds
          )
        );
      }
    );
  });
}

module.exports = {

  name: "tts",

  alias: [
    "speak",
    "say",
    "voice",
    "girl"
  ],

  desc: "Text to Speech WhatsApp Voice Note",

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

    try {

      // ======================================================
      // TEXT
      // ======================================================

      let text = args.join(" ").trim();

      const quoted =
        msg.message
          ?.extendedTextMessage
          ?.contextInfo
          ?.quotedMessage;

      if (!text && quoted) {

        text =
          quoted.conversation ||
          quoted.extendedTextMessage?.text ||
          quoted.imageMessage?.caption ||
          quoted.videoMessage?.caption ||
          "";
      }

      text = String(text).trim();

      if (!text) {

        return await sock.sendMessage(
          chatJid,
          {
            text:
              `🎙️ *TTS VOICE*\n\n` +
              `හඬ බවට පත් කිරීමට text එකක් දෙන්න.\n\n` +
              `*.tts කොහොමද ඔයාට*\n` +
              `*.tts Hello cute girl*`
          },
          {
            quoted: msg
          }
        );
      }

      // ======================================================
      // REACTION
      // ======================================================

      await sock.sendMessage(
        chatJid,
        {
          react: {
            text: "🎙️",
            key: msg.key
          }
        }
      );

      // ======================================================
      // TTS API
      // ======================================================

      const hasSinhala =
        /[\u0D80-\u0DFF]/.test(text);

      let audioUrl;

      if (hasSinhala) {

        audioUrl =
          "https://translate.google.com/translate_tts" +
          "?ie=UTF-8" +
          "&client=tw-ob" +
          "&tl=si" +
          "&q=" +
          encodeURIComponent(text);

      } else {

        audioUrl =
          "https://api.streamelements.com/kappa/v2/speech" +
          "?voice=Salli" +
          "&text=" +
          encodeURIComponent(text);
      }

      console.log(
        "[TTS] Request:",
        text
      );

      // ======================================================
      // DOWNLOAD
      // ======================================================

      const response =
        await axios.get(
          audioUrl,
          {
            responseType: "arraybuffer",

            timeout: 30000,

            headers: {
              "User-Agent":
                "Mozilla/5.0"
            }
          }
        );

      const inputBuffer =
        Buffer.from(response.data);

      if (!inputBuffer.length) {
        throw new Error(
          "TTS returned empty audio"
        );
      }

      // ======================================================
      // TEMP FILE
      // ======================================================

      const id =
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .substring(2, 8);

      inputFile = path.join(
        os.tmpdir(),
        `tts_${id}.mp3`
      );

      outputFile = path.join(
        os.tmpdir(),
        `voice_${id}.ogg`
      );

      fs.writeFileSync(
        inputFile,
        inputBuffer
      );

      // ======================================================
      // IMPORTANT
      // WHATSAPP PTT OGG / OPUS
      // ======================================================

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

        // WhatsApp voice
        "-ar",
        "16000",

        // MONO
        "-ac",
        "1",

        // Voice bitrate
        "-b:a",
        "32k",

        // Voice optimized
        "-application",
        "voip",

        // Better WhatsApp compatibility
        "-compression_level",
        "10",

        "-frame_duration",
        "60",

        "-packet_loss",
        "0",

        // Fix timestamp
        "-avoid_negative_ts",
        "make_zero",

        // Remove metadata
        "-map_metadata",
        "-1",

        // OGG container
        "-f",
        "ogg",

        outputFile
      ]);

      // ======================================================
      // CHECK FILE
      // ======================================================

      if (!fs.existsSync(outputFile)) {
        throw new Error(
          "OGG file was not created"
        );
      }

      const voiceBuffer =
        fs.readFileSync(outputFile);

      if (voiceBuffer.length < 1000) {
        throw new Error(
          "Generated voice file is invalid"
        );
      }

      // OGG signature
      const header =
        voiceBuffer
          .subarray(0, 4)
          .toString();

      if (header !== "OggS") {

        throw new Error(
          "Generated audio is not a valid OGG file"
        );
      }

      // ======================================================
      // DURATION
      // ======================================================

      let seconds =
        await getDuration(outputFile);

      if (!seconds || seconds < 1) {
        seconds = 1;
      }

      console.log(
        "[TTS] Duration:",
        seconds,
        "seconds"
      );

      console.log(
        "[TTS] OGG:",
        voiceBuffer.length,
        "bytes"
      );

      // ======================================================
      // SEND WHATSAPP PTT
      // ======================================================

      await sock.sendMessage(
        chatJid,
        {
          audio: voiceBuffer,

          mimetype:
            "audio/ogg; codecs=opus",

          ptt: true,

          // Current Baileys supports this
          seconds: seconds
        },
        {
          quoted: msg
        }
      );

      // ======================================================
      // SUCCESS
      // ======================================================

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
        "[TTS] Voice sent successfully"
      );

    } catch (error) {

      console.error(
        "[TTS ERROR]",
        error
      );

      try {

        await sock.sendMessage(
          chatJid,
          {
            text:
              `❌ *TTS Error*\n\n` +
              `${error.message}`
          },
          {
            quoted: msg
          }
        );

      } catch (e) {

        console.error(
          "[TTS SEND ERROR]",
          e.message
        );
      }

    } finally {

      // ======================================================
      // CLEAN
      // ======================================================

      try {

        if (
          inputFile &&
          fs.existsSync(inputFile)
        ) {
          fs.unlinkSync(inputFile);
        }

      } catch (e) {}

      try {

        if (
          outputFile &&
          fs.existsSync(outputFile)
        ) {
          fs.unlinkSync(outputFile);
        }

      } catch (e) {}
    }
  }
};
