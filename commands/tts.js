const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");

// FFmpeg Path Configuration (csong එකේ ක්‍රමයම)
let ffmpegPath = "ffmpeg";
try {
  const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
  ffmpegPath = ffmpegInstaller.path;
} catch (e) {
  ffmpegPath = "ffmpeg";
}

// csong එකේ 100% Play වන WhatsApp Original Voice Note Converter එක
function convertToWhatsAppVoice(inputBuffer) {
  return new Promise((resolve, reject) => {
    const tempId = Date.now() + "_" + Math.random().toString(36).substring(7);
    const tempInput = path.join(os.tmpdir(), `tts_in_${tempId}.mp3`);
    const tempOutput = path.join(os.tmpdir(), `tts_out_${tempId}.opus`);

    fs.writeFileSync(tempInput, inputBuffer);

    // WhatsApp Standard Opus Parameters: 48kHz, mono, 64k VBR
    const cmd = `"${ffmpegPath}" -y -i "${tempInput}" -c:a libopus -b:a 64k -vbr on -compression_level 10 -ar 48000 -ac 1 "${tempOutput}"`;

    exec(cmd, (error) => {
      try { if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput); } catch (e) {}

      if (error) {
        return reject(error);
      }

      try {
        const outputBuffer = fs.readFileSync(tempOutput);
        try { if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput); } catch (e) {}
        resolve(outputBuffer);
      } catch (readErr) {
        reject(readErr);
      }
    });
  });
}

module.exports = {
  name: "tts",
  alias: ["speak", "say", "voice", "girl"],
  desc: "Convert text to real playable WhatsApp voice note",
  category: "convert",

  async execute(sock, msg, args, chatJid, extra = {}) {
    try {
      let text = args.join(" ").trim();
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

      if (!text && quoted) {
        text = quoted.conversation ||
               quoted.extendedTextMessage?.text ||
               quoted.imageMessage?.caption ||
               quoted.videoMessage?.caption || "";
      }

      text = String(text).trim();

      if (!text) {
        return await sock.sendMessage(
          chatJid,
          {
            text:
              `🎙️ *TTS VOICE NOTE*\n\n` +
              `හඬ බවට පත් කිරීමට text එකක් දෙන්න.\n\n` +
              `*Examples:*\n` +
              `.tts අම්මට නිදිමතයි\n` +
              `.tts Hello cute girl`
          },
          { quoted: msg }
        );
      }

      await sock.sendMessage(chatJid, { react: { text: "🎙️", key: msg.key } });

      const hasSinhala = /[\u0D80-\u0DFF]/.test(text);
      let audioUrl = "";

      if (hasSinhala) {
        // Sinhala Voice
        audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=si&q=${encodeURIComponent(text)}`;
      } else {
        // English Cute Girl (Salli - StreamElements)
        audioUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Salli&text=${encodeURIComponent(text)}`;
      }

      // Download Raw Audio Stream
      const response = await axios.get(audioUrl, {
        responseType: "arraybuffer",
        timeout: 25000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });

      const rawAudioBuffer = Buffer.from(response.data);
      if (!rawAudioBuffer.length) {
        throw new Error("TTS server returned empty audio");
      }

      // csong එකේ engine එක හරහා Real Opus Buffer එකක් ලබා ගැනීම
      const voiceBuffer = await convertToWhatsAppVoice(rawAudioBuffer);

      // WhatsApp Playable Voice Note (PTT) එකක් විදිහට යැවීම
      await sock.sendMessage(
        chatJid,
        {
          audio: voiceBuffer,
          mimetype: "audio/ogg; codecs=opus",
          ptt: true // මේකෙන් දකුණු පැත්තේ Profile Picture එක වැටිලා Voice Note එකක් ලෙස play වේ
        },
        { quoted: msg }
      );

      await sock.sendMessage(chatJid, { react: { text: "😘", key: msg.key } });

    } catch (error) {
      console.error("[TTS ERROR]:", error);
      await sock.sendMessage(
        chatJid,
        {
          text: `❌ *TTS Voice Error*\n\n_${error.message || "Unknown error"}_`
        },
        { quoted: msg }
      );
    }
  }
};
