const axios = require("axios");

// Active download sessions තබා ගැනීමට
if (!global.fbSessions) global.fbSessions = new Map();

module.exports = {
  name: "facebook",
  alias: ["fb", "fbdl"],
  desc: "Download Facebook videos in HD, SD or Audio",
  async execute(sock, msg, args, from) {
    try {
      const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        args.join(" ")
      ).trim();

      // Reply කර ඇති message එකේ ID එක ලබා ගැනීම
      const quotedStanzaId =
        msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

      // ==========================================
      // 1. Reply Handling (1, 2 හෝ 3 තේරූ විට)
      // ==========================================
      if (quotedStanzaId && global.fbSessions.has(quotedStanzaId)) {
        const session = global.fbSessions.get(quotedStanzaId);

        if (!["1", "2", "3"].includes(text)) {
          return await sock.sendMessage(
            from,
            { text: "⚠️ කරුණාකර අදාළ අංකය පමණක් Reply කරන්න (1, 2 හෝ 3)." },
            { quoted: msg }
          );
        }

        await sock.sendMessage(from, { react: { text: "📥", key: msg.key } });

        // 1 - HD Video
        if (text === "1") {
          const dlUrl = session.hd || session.sd;
          if (!dlUrl) {
            return await sock.sendMessage(from, { text: "❌ HD Video එකක් ලබා ගත නොහැක." }, { quoted: msg });
          }
          await sock.sendMessage(
            from,
            {
              video: { url: dlUrl },
              caption: `🎬 *${session.title}*\n\n✨ *Quality:* HD Resolution\n> Powered by Dark Dinu`
            },
            { quoted: msg }
          );
        }
        // 2 - SD Video
        else if (text === "2") {
          const dlUrl = session.sd || session.hd;
          if (!dlUrl) {
            return await sock.sendMessage(from, { text: "❌ SD Video එකක් ලබා ගත නොහැක." }, { quoted: msg });
          }
          await sock.sendMessage(
            from,
            {
              video: { url: dlUrl },
              caption: `🎬 *${session.title}*\n\n✨ *Quality:* SD Resolution\n> Powered by Dark Dinu`
            },
            { quoted: msg }
          );
        }
        // 3 - Audio
        else if (text === "3") {
          const dlUrl = session.audio || session.sd || session.hd;
          if (!dlUrl) {
            return await sock.sendMessage(from, { text: "❌ Audio එක ලබා ගත නොහැක." }, { quoted: msg });
          }
          await sock.sendMessage(
            from,
            {
              audio: { url: dlUrl },
              mimetype: "audio/mp4",
              fileName: `${session.title}.mp3`
            },
            { quoted: msg }
          );
        }

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return;
      }

      // ==========================================
      // 2. Initial Request (.fb <link>)
      // ==========================================
      const rawUrl = args.find((arg) => arg.startsWith("http://") || arg.startsWith("https://"));

      if (!rawUrl || (!rawUrl.includes("facebook.com") && !rawUrl.includes("fb.watch"))) {
        return await sock.sendMessage(
          from,
          { text: "⚠️ *කරුණාකර නිවැරදි Facebook Link එකක් ඇතුළත් කරන්න.*\n\n*උදාහරණ:* `.fb https://fb.watch/xxxxxx/`" },
          { quoted: msg }
        );
      }

      await sock.sendMessage(from, { react: { text: "🔍", key: msg.key } });

      const apiUrl = `https://api.chamindu.site/api/v1/facebook?url=${encodeURIComponent(rawUrl)}&api_key=chama_api_ec9848130d1aea209f08fb85e0b4720f`;
      const response = await axios.get(apiUrl, { timeout: 15000 });
      const res = response.data;

      // API Data extraction (නොයෙකුත් API patterns සඳහා fallback)
      const data = res?.data || res?.result || {};
      const title = data.title || "Facebook Video";
      const thumb = data.thumbnail || data.thumb || "https://i.ibb.co/3s1xZ1h/facebook-logo.png";
      const hdUrl = data.hd || data.video_hd || data.downloads?.hd || null;
      const sdUrl = data.sd || data.video_sd || data.downloads?.sd || data.url || null;
      const audioUrl = data.audio || data.downloads?.audio || null;

      if (!hdUrl && !sdUrl) {
        return await sock.sendMessage(
          from,
          { text: "❌ මෙම වීඩියෝව ලබා ගැනීමට නොහැකි විය. (Private හෝ Restricted වීඩියෝවක් විය හැක)" },
          { quoted: msg }
        );
      }

      // Stylish Card UI
      const cardUI = 
`╭━━━━━〔 *FB DOWNLOADER* 〕━━━━━╮
┃
┃ 📌 *Title:* ${title.slice(0, 45)}...
┃ 🌐 *Source:* Facebook
┃
┃ *බාගත කර ගැනීමට අදාළ අංකය Reply කරන්න:*
┃
┃ 1️⃣ ‣ *HD Video* ${hdUrl ? "🟢" : "🔴"}
┃ 2️⃣ ‣ *SD Video* ${sdUrl ? "🟢" : "🔴"}
┃ 3️⃣ ‣ *Audio File* ${(audioUrl || sdUrl) ? "🟢" : "🔴"}
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯
> _Reply with 1, 2, or 3_`;

      // Thumbnail Image එක සමඟ Menu Message එක යැවීම
      const sentMsg = await sock.sendMessage(
        from,
        {
          image: { url: thumb },
          caption: cardUI
        },
        { quoted: msg }
      );

      // Session එක Global Map එකේ තැන්පත් කිරීම
      global.fbSessions.set(sentMsg.key.id, {
        title,
        hd: hdUrl,
        sd: sdUrl,
        audio: audioUrl
      });

      // විනාඩි 5කින් Memory clear කිරීම
      setTimeout(() => {
        global.fbSessions.delete(sentMsg.key.id);
      }, 5 * 60 * 1000);

    } catch (err) {
      console.error("FB Command Error:", err.message);
      await sock.sendMessage(
        from,
        { text: "❌ සබඳතා දෝෂයක් මතු විය. Link එක පරීක්ෂා කර නැවත උත්සාහ කරන්න." },
        { quoted: msg }
      );
    }
  }
};
