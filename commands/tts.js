const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");

// FFmpeg Path Setup
let ffmpegPath = "ffmpeg";
try {
  const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
  ffmpegPath = ffmpegInstaller.path;
} catch (e) {
  ffmpegPath = "ffmpeg";
}

// FreeTTS.org Official Configuration
const FREETTS_API_KEY = "ft_live_EZmwd9gPjDLUjaT1EX39Z97tuMbtpDMj";

// Ultra High Quality Neural Voices
const VOICES = {
  girl: "en-US-JennyNeural", // Cute Realistic Young Girl
  boy: "en-US-GuyNeural"     // Natural Young Guy
};

// WhatsApp Android Playable OGG Opus converter
function convertToWhatsAppVoice(inputBuffer) {
  return new Promise((resolve, reject) => {
    const tempId = Date.now() + "_" + Math.random().toString(36).substring(7);
    const tempInput = path.join(os.tmpdir(), `tts_in_${tempId}.mp3`);
    const tempOutput = path.join(os.tmpdir(), `tts_out_${tempId}.ogg`);

    fs.writeFileSync(tempInput, inputBuffer);

    // Strict WhatsApp Opus conversion (48kHz, mono, OGG container)
    const cmd = `"${ffmpegPath}" -y -i "${tempInput}" -c:a libopus -b:a 64k -ar 48000 -ac 1 -avoid_negative_ts make_zero "${tempOutput}"`;

    exec(cmd, (error) => {
      try { if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput); } catch (e) {}

      if (error) return reject(error);

      try {
        const outBuf = fs.readFileSync(tempOutput);
        try { if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput); } catch (e) {}
        resolve(outBuf);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Sinhala High-Pitch Natural Female Voice
async function getSinhalaCuteVoice(text) {
  const cleanText = encodeURIComponent(text);
  // High-pitch Google Neural endpoint (Natural Female Pitch)
  const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=si&q=${cleanText}&pitch=1.3`;
  const res = await axios.get(audioUrl, {
    responseType: "arraybuffer",
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  return Buffer.from(res.data);
}

module.exports = {
  name: "ttsgirl",
  alias: ["ttsboy", "tts", "speak", "voice"],
  desc: "Convert text to realistic voice note using FreeTTS",
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

      const fullBody = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").toLowerCase();
      const isBoy = fullBody.startsWith(".ttsboy") || extra?.body?.toLowerCase()?.startsWith(".ttsboy");

      const voice = isBoy ? VOICES.boy : VOICES.girl;
      const emoji = isBoy ? "🎙️" : "💖";
      const doneEmoji = isBoy ? "🔥" : "💋";

      if (!text) {
        return await sock.sendMessage(
          chatJid,
          {
            text:
              `🎙️ *AI VOICE NOTE*\n\n` +
              `හඬ බවට පත් කිරීමට text එකක් ලබාදෙන්න.\n\n` +
              `*Commands:*\n` +
              `👩 *.ttsgirl* <text> - කෙල්ලෙක්ගෙ හඬින් (Jenny Neural)\n` +
              `👨 *.ttsboy* <text> - කොල්ලෙක්ගෙ හඬින් (Guy Neural)\n\n` +
              `*Tip:* Singlish හෝ English වලින් ලස්සනම Realistic හඬ ලැබෙයි!\n` +
              `*උදා:* \`.ttsgirl kohomada sudu oya kawathey?\``
          },
          { quoted: msg }
        );
      }

      await sock.sendMessage(chatJid, { react: { text: emoji, key: msg.key } });

      const hasSinhala = /[\u0D80-\u0DFF]/.test(text);
      let rawBuffer = null;

      // 1. English හෝ Singlish නම් FreeTTS.org Official Neural API මඟින් ලබාගැනීම
      if (!hasSinhala) {
        try {
          const ftRes = await axios.post(
            "https://freetts.org/api/v1/tts",
            {
              text: text,
              voice: voice,
              output_format: "mp3"
            },
            {
              headers: {
                "x-api-key": FREETTS_API_KEY, // FreeTTS official header
                "Content-Type": "application/json"
              },
              timeout: 25000
            }
          );

          // FreeTTS එකෙන් එන audio url එක download කරගැනීම
          const audioUrl = ftRes.data?.audio_url || ftRes.data?.url || ftRes.data?.download_url;
          if (audioUrl) {
            const dl = await axios.get(audioUrl, { responseType: "arraybuffer", timeout: 20000 });
            rawBuffer = Buffer.from(dl.data);
          } else if (ftRes.data?.audio_base64) {
            rawBuffer = Buffer.from(ftRes.data.audio_base64, "base64");
          }
        } catch (ftErr) {
          console.warn("[FreeTTS API Fail]:", ftErr.response?.data || ftErr.message);
        }
      }

      // 2. FreeTTS වෙතින් නොලැබුණහොත් හෝ Sinhala අකුරු තිබේ නම්
      if (!rawBuffer || !rawBuffer.length) {
        if (hasSinhala) {
          rawBuffer = await getSinhalaCuteVoice(text);
        } else {
          // High Quality English Voice Fallback (StreamElements Salli / Brian)
          const fallbackVoice = isBoy ? "Brian" : "Salli";
          const seRes = await axios.get(
            `https://api.streamelements.com/kappa/v2/speech?voice=${fallbackVoice}&text=${encodeURIComponent(text)}`,
            { responseType: "arraybuffer", timeout: 20000 }
          );
          rawBuffer = Buffer.from(seRes.data);
        }
      }

      // WhatsApp Playable Voice Note (OGG Opus) එකක් බවට convert කිරීම
      const voiceBuffer = await convertToWhatsAppVoice(rawBuffer);

      // WhatsApp Voice Note (PTT) විදිහට යැවීම
      await sock.sendMessage(
        chatJid,
        {
          audio: voiceBuffer,
          mimetype: "audio/ogg; codecs=opus",
          ptt: true
        },
        { quoted: msg }
      );

      await sock.sendMessage(chatJid, { react: { text: doneEmoji, key: msg.key } });

    } catch (error) {
      console.error("[TTS ERROR]:", error);
      await sock.sendMessage(
        chatJid,
        { text: `❌ *Voice Error:*\n_${error.message || "Unknown error"}_` },
        { quoted: msg }
      );
    }
  }
};
