const axios = require("axios");

// තාවකාලිකව Download links මතකයේ තබා ගැනීමට (In-memory cache)
const fbSessions = new Map();

module.exports = {
  name: "facebook",
  alias: ["fb", "fbdl"],
  desc: "Download Facebook videos in HD, SD or Audio",
  async execute(sock, msg, args, from) {
    try {
      const text = args.join(" ").trim();

      // ----------------------------------------------------
      // CASE 1: පරිශීලකයා 1, 2 හෝ 3 ලෙස Reply කර ඇති විට
      // ----------------------------------------------------
      const quoted =
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedStanzaId =
        msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

      if (quotedStanzaId && fbSessions.has(quotedStanzaId)) {
        const choice = text;
        const session = fbSessions.get(quotedStanzaId);

        if (!["1", "2", "3"].includes(choice)) {
          return await sock.sendMessage(
            from,
            { text: "⚠ කරුණාකර අදාළ අංකය පමණක් reply කරන්න:\n1 - HD Video\n2 - SD Video\n3 - Audio" },
            { quoted: msg }
          );
        }

        await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

        // 1 - HD Video
        if (choice === "1") {
          const videoUrl = session.hd || session.sd;
          if (!videoUrl) {
            return await sock.sendMessage(from, { text: "❌ HD වීඩියෝවක් හමු නොවීය." }, { quoted: msg });
          }
          await sock.sendMessage(
            from,
            {
              video: { url: videoUrl },
              caption: `🎬 *${session.title}* (HD Quality)`
            },
            { quoted: msg }
          );
        }
        // 2 - SD Video
        else if (choice === "2") {
          const videoUrl = session.sd || session.hd;
          if (!videoUrl) {
            return await sock.sendMessage(from, { text: "❌ SD වීඩියෝවක් හමු නොවීය." }, { quoted: msg });
          }
          await sock.sendMessage(
            from,
            {
              video: { url: videoUrl },
              caption: `🎬 *${session.title}* (SD Quality)`
            },
            { quoted: msg }
          );
        }
        // 3 - Audio Only
        else if (choice === "3") {
          const audioUrl = session.audio || session.sd || session.hd;
          if (!audioUrl) {
            return await sock.sendMessage(from, { text: "❌ Audio එක ලබා ගැනීමට නොහැකි විය." }, { quoted: msg });
          }
          await sock.sendMessage(
            from,
            {
              audio: { url: audioUrl },
              mimetype: "audio/mp4",
              ptt: false
            },
            { quoted: msg }
          );
        }

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return;
      }

      // ----------------------------------------------------
      // CASE 2: මූලික Command එක (.fb <link>) ලබා දුන් විට
      // ----------------------------------------------------
      const url = args[0];
      if (!url || !url.includes("facebook.com") && !url.includes("fb.watch")) {
        return await sock.sendMessage(
          from,
          { text: "⚠ කරුණාකර නිවැරදි Facebook Link එකක් ඇතුළත් කරන්න.\n\n*උදාහරණ:* `.fb https://fb.watch/xxxxxx/`" },
          { quoted: msg }
        );
      }

      await sock.sendMessage(from, { react: { text: "🔎", key: msg.key } });

      const apiUrl = `https://api.chamindu.site/api/v1/facebook?url=${encodeURIComponent(url)}&api_key=chama_api_ec9848130d1aea209f08fb85e0b4720f`;
      const response = await axios.get(apiUrl);
      const resData = response.data;

      if (!resData.status || !resData.data) {
        return await sock.sendMessage(
          from,
          { text: "❌ වීඩියෝව ලබා ගැනීමට නොහැකි විය. (Private වීඩියෝ හෝ වලංගු නොවන Link විය හැක)" },
          { quoted: msg }
        );
      }

      const info = resData.data;
      const title = info.title || "Facebook Video";
      const hdUrl = info.hd || info.video_hd || info.downloads?.hd;
      const sdUrl = info.sd || info.video_sd || info.downloads?.sd || info.url;
      const audioUrl = info.audio || info.downloads?.audio;

      const menuText = `*🎬 Facebook Downloader*\n\n` +
        `📌 *Title:* ${title}\n\n` +
        `බාගත කර ගැනීමට අවශ්‍ය අංකය සමඟ මෙම මැසේජ් එකට *Reply* කරන්න:\n\n` +
        `1️⃣ - *HD Video* ${hdUrl ? "✅" : "❌"}\n` +
        `2️⃣ - *SD Video* ${sdUrl ? "✅" : "❌"}\n` +
        `3️⃣ - *Audio (MP3)* ${audioUrl || sdUrl ? "✅" : "❌"}\n\n` +
        `_Reply with 1, 2, or 3_`;

      const sentMsg = await sock.sendMessage(from, { text: menuText }, { quoted: msg });

      // යැවූ message එකේ ID එක යටතේ විස්තර ගබඩා කිරීම
      fbSessions.set(sentMsg.key.id, {
        title,
        hd: hdUrl,
        sd: sdUrl,
        audio: audioUrl
      });

      // විනාඩි 5කට පසු මතකයෙන් ඉවත් කිරීම (Memory Clean-up)
      setTimeout(() => {
        fbSessions.delete(sentMsg.key.id);
      }, 5 * 60 * 1000);

    } catch (err) {
      console.error("FB Command Error:", err.message);
      await sock.sendMessage(
        from,
        { text: "❌ Facebook video ලබා ගැනීමේදී දෝෂයක් මතු විය." },
        { quoted: msg }
      );
    }
  }
};
