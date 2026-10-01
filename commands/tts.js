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

// FreeTTS.org API Configuration
const FREETTS_API_KEY = "ft_live_EZmwd9gPjDLUjaT1EX39Z97tuMbtpDMj";

// Voice Selection
// Female / Male voices
const VOICES = {
  girl: "en-US-JennyNeural",   // Natural Female
  boy: "en-US-GuyNeural",      // Natural Male
  si_girl: "si-LK-ThiliniNeural", // Sinhala Female (if supported)
  si_boy: "si-LK-SameeraNeural"   // Sinhala Male (if supported)
};

// WhatsApp Android Playable OGG Opus converter
function convertToWhatsAppVoice(inputBuffer) {
  return new Promise((resolve, reject) => {
    const tempId = Date.now() + "_" + Math.random().toString(36).substring(7);
    const tempInput = path.join(os.tmpdir(), `tts_in_${tempId}.mp3`);
    const tempOutput = path.join(os.tmpdir(), `tts_out_${tempId}.ogg`);

    fs.writeFileSync(tempInput, inputBuffer);

    // WhatsApp Mobile strictly requires libopus mono 48000Hz OGG container
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

// Fallback Free Voice Generator (Google / StreamElements)
async function getFallbackVoice(text, isBoy) {
  const hasSinhala = /[\u0D80-\u0DFF]/.test(text);
  let audioUrl = "";

  if (hasSinhala) {
    audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=si&q=${encodeURIComponent(text)}`;
  } else {
    const voiceName = isBoy ? "Brian" : "Salli";
    audioUrl = `https://api.streamelements.com/kappa/v2/speech?voice=${voiceName}&text=${encodeURIComponent(text)}`;
  }

  const res = await axios.get(audioUrl, {
    responseType: "arraybuffer",
    timeout: 25000,
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  return Buffer.from(res.data);
}

module.exports = {
  name: "ttsgirl",
  alias: ["ttsboy", "tts", "speak", "voice"],
  desc: "Convert text to Voice Note using FreeTTS.org API",
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

      const emoji = isBoy ? "🎙️" : "💖";
      const doneEmoji = isBoy ? "🔥" : "💋";

      if (!text) {
        return await sock.sendMessage(
          chatJid,
          {
            text:
              `🎙️ *FREETTS VOICE NOTE*\n\n` +
              `හඬ බවට පත් කිරීමට text එකක් ලබාදෙන්න.\n\n` +
              `*Commands:*\n` +
              `👩 *.ttsgirl* <text> - කෙල්ලෙක්ගෙ කටහඬින්\n` +
              `👨 *.ttsboy* <text> - කොල්ලෙක්ගෙ කටහඬින්\n\n` +
              `*උදාහරණ:*\n` +
              `.ttsgirl කොහොමද සුදූ ඔයාට\n` +
              `.ttsboy මචං මොකද වෙන්නේ`
          },
          { quoted: msg }
        );
      }

      await sock.sendMessage(chatJid, { react: { text: emoji, key: msg.key } });

      const hasSinhala = /[\u0D80-\u0DFF]/.test(text);
      let selectedVoice = hasSinhala 
        ? (isBoy ? VOICES.si_boy : VOICES.si_girl) 
        : (isBoy ? VOICES.boy : VOICES.girl);

      let rawBuffer = null;

      // 1. FreeTTS.org API එකෙන් Audio ලබා ගැනීම
      try {
        const ftResponse = await axios.post(
          "https://freetts.org/api/v1/tts",
          {
            text: text,
            voice: selectedVoice,
            format: "mp3"
          },
          {
            headers: {
              "Authorization": `Bearer ${FREETTS_API_KEY}`,
              "Content-Type": "application/json"
            },
            timeout: 20000
          }
        );

        const audioUrl = ftResponse.data?.audio_url || ftResponse.data?.url || ftResponse.data?.data?.url;

        if (audioUrl) {
          const dlRes = await axios.get(audioUrl, { responseType: "arraybuffer", timeout: 20000 });
          rawBuffer = Buffer.from(dlRes.data);
        } else if (Buffer.isBuffer(ftResponse.data)) {
          rawBuffer = ftResponse.data;
        }
      } catch (apiErr) {
        console.warn(`FreeTTS API Error (${apiErr.message}). Switching to Fallback Engine...`);
      }

      // 2. FreeTTS එකෙන් නොලැබුණහොත් Fallback Engine එකෙන් ලබා ගැනීම
      if (!rawBuffer || !rawBuffer.length) {
        rawBuffer = await getFallbackVoice(text, isBoy);
      }

      // 3. WhatsApp Playable Voice Note (OGG Opus) එකක් බවට Convert කිරීම
      const voiceBuffer = await convertToWhatsAppVoice(rawBuffer);

      // 4. Send as WhatsApp Voice Note (PTT)
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
