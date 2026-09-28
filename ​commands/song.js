const axios = require('axios');
const yts = require('yt-search');
const { gifted } = require('gifted-dls');

global.songSessions = global.songSessions || new Map();

async function getAudioDownloadUrl(videoUrl) {
  try {
    const res = await gifted.ytmp3(videoUrl);
    if (res?.result?.download_url) return res.result.download_url;
    if (res?.download_url) return res.download_url;
    throw new Error('Download URL not found');
  } catch (err) {
    const fallbackRes = await axios.get(`https://api.giftedtech.my.id/api/download/ytmp3?apikey=gifted&url=${encodeURIComponent(videoUrl)}`);
    if (fallbackRes.data?.result?.download_url) {
      return fallbackRes.data.result.download_url;
    }
    throw err;
  }
}

module.exports = {
  name: 'song',
  alias: ['play', 'sing', 'mp3', 'ytmp3', 'music'],
  category: 'download',
  desc: 'Interactive Audio Downloader',

  async execute(sock, msg, args, chatJid) {
    const targetChat = (typeof chatJid === 'string' && chatJid.includes('@')) 
      ? chatJid 
      : (msg.key?.remoteJid || null);

    if (!targetChat) return;

    const channelContext = {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363421906774107@newsletter',
        newsletterName: '⚡ ᴅᴀʀᴋ ᴅɪɴᴜ ᴏꜰᴄ ✨',
        serverMessageId: 1
      }
    };

    let rawInput = (Array.isArray(args) ? args.join(' ') : String(args || '')).trim();

    // 1, 2, 3 Reply බාගත කිරීම්
    const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
    const session = quotedMsgId ? global.songSessions.get(quotedMsgId) : global.songSessions.get(targetChat);

    if (session && ['1', '2', '3'].includes(rawInput)) {
      await sock.sendMessage(targetChat, { react: { text: "⏳", key: msg.key } }).catch(() => {});
      
      try {
        const downloadUrl = await getAudioDownloadUrl(session.videoUrl);
        const audioBuffer = (await axios.get(downloadUrl, { responseType: 'arraybuffer' })).data;

        if (rawInput === '1') {
          await sock.sendMessage(targetChat, {
            audio: audioBuffer,
            mimetype: 'audio/mp4',
            fileName: `${session.title}.mp3`,
            contextInfo: channelContext
          }, { quoted: msg });
        } else if (rawInput === '2') {
          await sock.sendMessage(targetChat, {
            document: audioBuffer,
            mimetype: 'audio/mpeg',
            fileName: `${session.title}.mp3`,
            contextInfo: channelContext
          }, { quoted: msg });
        } else if (rawInput === '3') {
          await sock.sendMessage(targetChat, {
            audio: audioBuffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
            contextInfo: channelContext
          }, { quoted: msg });
        }

        await sock.sendMessage(targetChat, { react: { text: "✅", key: msg.key } }).catch(() => {});
        return;
      } catch (dlErr) {
        console.error('Download Error:', dlErr?.message || dlErr);
        await sock.sendMessage(targetChat, { react: { text: "❌", key: msg.key } }).catch(() => {});
        return await sock.sendMessage(targetChat, {
          text: `❌ *Download දෝෂයකි:* සින්දුව බාගත කිරීමට නොහැකි විය.`,
          contextInfo: channelContext
        }, { quoted: msg });
      }
    }

    if (!rawInput) {
      await sock.sendMessage(targetChat, { react: { text: "🎧", key: msg.key } }).catch(() => {});
      return await sock.sendMessage(targetChat, { 
        text: `*⚡ DARK DINU AUDIO BEATS ⚡*\n\n> 💡 කරුණාකර සින්දුවේ නම හෝ YouTube Link එක ඇතුළත් කරන්න.\n> 📌 උදා: *.song Lelena*`,
        contextInfo: channelContext
      }, { quoted: msg });
    }

    await sock.sendMessage(targetChat, { react: { text: "🔎", key: msg.key } }).catch(() => {});

    try {
      let videoUrl = rawInput;
      let videoTitle = rawInput;
      let duration = '03:45';
      let author = 'YouTube Music';
      let views = 'Popular';
      let ago = 'Recent';
      let thumb = 'https://files.catbox.moe/a58add.jpeg';

      const isYtUrl = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(rawInput);

      if (!isYtUrl) {
        const searchResults = await yts(rawInput);
        if (!searchResults?.videos?.length) {
          throw new Error('සින්දුව YouTube හි සොයාගත නොහැකි විය!');
        }

        const video = searchResults.videos[0];
        videoUrl = video.url;
        videoTitle = video.title || rawInput;
        duration = video.timestamp || duration;
        author = video.author?.name || author;
        ago = video.ago || ago;
        views = video.views ? (video.views > 1000000 ? (video.views / 1000000).toFixed(1) + 'M' : (video.views / 1000).toFixed(0) + 'K') : views;
        thumb = video.thumbnail || thumb;
      } else {
        const videoIdMatch = rawInput.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
        if (videoIdMatch && videoIdMatch[1]) {
          const videoData = await yts({ videoId: videoIdMatch[1] });
          if (videoData) {
            videoTitle = videoData.title || videoTitle;
            duration = videoData.timestamp || duration;
            author = videoData.author?.name || author;
            thumb = videoData.thumbnail || thumb;
          }
        }
      }

      let cleanTitle = videoTitle.replace(/[\\/:"*?<>|]/g, '').trim();

      const aestheticCard = 
`⚡𝄢╶╶╶╶ ✦ 🎧 ✦ ╶╶╶╶𝄢⚡
      ◢◤ ᴅ ᴀ ʀ ᴋ  ᴅ ɪ ɴ ᴜ ◥◣
   ─── ❖ ꜱᴛᴜᴅɪᴏ ᴇɴɢɪɴᴇ ❖ ───

╭─◈『 𝗧𝗥𝗔𝗖𝗞 𝗜𝗡𝗙𝗢 』◈─╮
│ 🎵 *Title*  : ${cleanTitle}
│ 👤 *Artist* : ${author}
│ ⏱️ *Time*   : ${duration}
│ 👁️ *Views*  : ${views}
│ ⏳ *Age*    : ${ago}
╰─────────────────────╯

 ılı.lıllılı.ıllı. 320ᴋʙᴘꜱ ʜᴅ .ıllı.lıllılı.ıl
 0:00 ───🔘────────── ${duration}
 ⇄   ◃◃   ❙❙   ▹▹   ↻

┌──❮ 📥 𝗦𝗘𝗟𝗘𝗖𝗧 𝗙𝗢𝗥𝗠𝗔𝗧 ❯──┐
│
│  [1]  ▸ 🎵  Audio (MP3)
│  [2]  ▸ 📂  Document (HQ)
│  [3]  ▸ 🎙️  Voice (PTT)
│
└────────────────────────┘
> 💡 *මෙම පණිවිඩයට 1, 2 හෝ 3 ලෙස Reply කරන්න.*
> ⚡ ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴅɪɴᴜ`.trim();

      const sentMsg = await sock.sendMessage(targetChat, {
        image: { url: thumb },
        caption: aestheticCard,
        contextInfo: channelContext
      }, { quoted: msg });

      await sock.sendMessage(targetChat, { react: { text: "🎵", key: msg.key } }).catch(() => {});

      const sessionPayload = {
        videoUrl,
        title: cleanTitle,
        duration,
        thumb,
        sender: msg.key.participant || targetChat,
        time: Date.now()
      };

      if (sentMsg?.key?.id) {
        global.songSessions.set(sentMsg.key.id, sessionPayload);
      }
      global.songSessions.set(targetChat, sessionPayload);

      setTimeout(() => {
        if (sentMsg?.key?.id) global.songSessions.delete(sentMsg.key.id);
        global.songSessions.delete(targetChat);
      }, 15 * 60 * 1000);

    } catch (err) {
      console.error('Song Search Error:', err?.message || err);
      await sock.sendMessage(targetChat, { react: { text: "❌", key: msg.key } }).catch(() => {});
      await sock.sendMessage(targetChat, { 
        text: `❌ *දෝෂයකි:* ${err.message || 'සින්දුව සෙවීමේදී දෝෂයක් මතු විය.'}`,
        contextInfo: channelContext
      }, { quoted: msg }).catch(() => {});
    }
  }
};
