const axios = require('axios');

module.exports = {
    name: 'pinterest',
    alias: ['pt'],
    category: 'download',
    desc: 'Pinterest වෙතින් Video හෝ Image download කිරීම',
    async execute({ conn, m, text }) {
        if (!text) {
            return await conn.sendMessage(m.chat, { 
                text: '⚠️ කරුණාකර Pinterest Link එකක් ලබා දෙන්න!\n\nඋදාහරණයක්:\n*.pt https://www.pinterest.com/pin/xxxxxxxxx/* ' 
            }, { quoted: m });
        }

        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

        try {
            const apiKey = 'chama_api_ec9848130d1aea209f08fb85e0b4720f';
            const apiUrl = `https://api.chamindu.site/api/v1/media/pinterest/infodl?q=${encodeURIComponent(text)}&api_key=${apiKey}`;

            const response = await axios.get(apiUrl);
            const resData = response.data;

            if (!resData.status || !resData.data || !resData.data.downloads.length) {
                await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
                return await conn.sendMessage(m.chat, { text: '❌ මාධ්‍යය සොයාගත නොහැකි විය. Link එක පරීක්ෂා කරන්න.' }, { quoted: m });
            }

            const info = resData.data;
            const title = info.title || 'Pinterest Media';

            // වීඩියෝ එකක් ඇත්නම් එය තෝරාගැනීම, නැතහොත් පළමු direct image link එක ගැනීම
            const videoItem = info.downloads.find(dl => dl.type?.includes('video'));
            const imageItem = info.downloads.find(dl => dl.type?.includes('image') || dl.type === 'image_direct') || info.downloads[0];

            const caption = `╭───『 ᴘɪɴᴛᴇʀᴇsᴛ ᴅʟ 』───\n` +
                            `│\n` +
                            `├─▸ 📌 *Title:* ${title}\n` +
                            `├─▸ 🌐 *Type:* ${videoItem ? 'Video' : 'Image'}\n` +
                            `│\n` +
                            `└───『 ᴅᴀʀᴋ ᴅɪɴᴜ 』───`;

            if (videoItem && videoItem.link) {
                // Video එකක් නම්
                await conn.sendMessage(m.chat, {
                    video: { url: videoItem.link },
                    caption: caption,
                    mimetype: 'video/mp4'
                }, { quoted: m });
            } else if (imageItem && imageItem.link) {
                // Image එකක් නම්
                await conn.sendMessage(m.chat, {
                    image: { url: imageItem.link },
                    caption: caption
                }, { quoted: m });
            } else {
                throw new Error('බාගත හැකි link එකක් හමු නොවීය.');
            }

            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

        } catch (error) {
            console.error(error);
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            await conn.sendMessage(m.chat, { text: '❌ Media එක download කිරීමට නොහැකි විය. API එකේ දෝෂයක් හෝ Link එක අවලංගුයි.' }, { quoted: m });
        }
    }
};
