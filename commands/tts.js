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

// ElevenLabs Configuration
const ELEVENLABS_API_KEY = "sk_2c61d3d5c8070d111cb1b41c92e6d64e4cce8f60036790b6";

// Voice IDs (ElevenLabs Pre-made Super Realistic Voices)
// Rachel: Ultra natural cute young girl voice
// Adam / Josh: Deep natural boy/guy voice
const VOICES = {
  girl: "21m00Tcm4TlvDq8ikWAM", // Rachel (Female)
  boy: "TxGEqnHWrfWFTfGW9XjX"   // Josh (Male)
};

// WhatsApp Android Playable OGG Opus converter
function convertToWhatsAppVoice(inputBuffer) {
  return new Promise((resolve, reject) => {
    const tempId = Date.now() + "_" + Math.random().toString(36).substring(7);
    const tempInput = path.join(os.tmpdir(), `el_in_${tempId}.mp3`);
    const tempOutput = path.join(os.tmpdir(), `el_out_${tempId}.ogg`);

    fs.writeFileSync(tempInput, inputBuffer);

    // WhatsApp Mobile strictly requires libopus mono 48000Hz OGG container
    const cmd = `"${ffmpegPath}" -y -i "${tempInput}" -c:a libopus -b:a 64k -ar 48000 -ac 1 -avoid_negative_ts make_zero "${tempOutput}"`;

    exec(cmd, (error) => {
      try { if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput); } catch (e) {}

      if (error) {
        return reject(error);
      }

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

module.exports = {
  name: "ttsgirl",
  alias: ["ttsboy", "tts", "speak", "voice"],
  desc: "Convert text to realistic AI Voice Note using ElevenLabs",
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

      // Command එක මොකක්ද කියලා හඳුනාගැනීම (boy ද girl ද කියලා)
      const fullBody = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").toLowerCase();
      const isBoy = fullBody.startsWith(".ttsboy") || extra?.body?.toLowerCase()?.startsWith(".ttsboy");

      const gender = isBoy ? "boy" : "girl";
      const voiceId = isBoy ? VOICES.boy : VOICES.girl;
      const emoji = isBoy ? "🎙️" : "💖";
      const doneEmoji = isBoy ? "🔥" : "💋";

      if (!text) {
        return await sock.sendMessage(
          chatJid,
          {
            text:
              `🎙️ *ELEVENLABS AI VOICE NOTE*\n\n` +
              `හඬ බවට පත් කිරීමට text එකක් ලබාදෙන්න.\n\n` +
              `*Commands:*\n` +
              `👩 *.ttsgirl* <text> - කෙල්ලෙක්ගෙ කටහඬින්\n` +
              `👨 *.ttsboy* <text> - කොල්ලෙක්ගෙ කටහඬින්\n\n` +
              `*උදාහරණ:*\n` +
              `.ttsgirl කොහොමද සුදූ, ඔයා කෑවද?\n` +
              `.ttsboy මචං අද හවසට සෙට් වෙමුද?`
          },
          { quoted: msg }
        );
      }

      await sock.sendMessage(chatJid, { react: { text: emoji, key: msg.key } });

      // ElevenLabs API Request
      const elevenUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

      const response = await axios.post(
        elevenUrl,
        {
          text: text,
          model_id: "eleven_multilingual_v2", // සිංහල, Singlish සහ English සුපිරියටම උච්චාරණය වන model එක
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
          },
          responseType: "arraybuffer",
          timeout: 45000
        }
      );

      const rawBuffer = Buffer.from(response.data);
      if (!rawBuffer.length) {
        throw new Error("ElevenLabs returned empty audio");
      }

      // WhatsApp Playable Voice Note (OGG Opus) එකක් බවට convert කිරීම
      const voiceBuffer = await convertToWhatsAppVoice(rawBuffer);

      // WhatsApp Voice Note (PTT) විදිහට යැවීම (Profile icon & Waveform සහිතව)
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
      console.error("[ELEVENLABS TTS ERROR]:", error?.response?.data ? error.response.data.toString() : error.message);
      
      let errMsg = error.message;
      if (error.response?.status === 401) {
        errMsg = "ElevenLabs API Key එක වැරදියි හෝ Expire වී ඇත.";
      } else if (error.response?.status === 429) {
        errMsg = "ElevenLabs Quota/Limit එක ඉවර වී ඇත.";
      }

      await sock.sendMessage(
        chatJid,
        {
          text: `❌ *Voice Error:*\n_${errMsg}_`
        },
        { quoted: msg }
      );
    }
  }
};
