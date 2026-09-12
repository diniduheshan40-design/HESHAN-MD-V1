import 'dotenv/config';
import {
    makeWASocket,
    Browsers,
    fetchLatestBaileysVersion,
    DisconnectReason,
    useMultiFileAuthState
} from '@whiskeysockets/baileys';
import { Handler, Callupdate, GroupUpdate } from './src/event/index.js';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import NodeCache from 'node-cache';
import path from 'path';
import chalk from 'chalk';
import moment from 'moment-timezone';
import axios from 'axios';
import config from './config.cjs';
import autoreact from './lib/autoreact.cjs';
import { fileURLToPath } from 'url';

const { emojis, doReact } = autoreact;
const sessionName = 'session';
const app = express();
const orange = chalk.bold.hex('#FFA500');
const lime = chalk.bold.hex('#32CD32');

let useQR = false;
let initialConnection = true;

const PORT = process.env.PORT || 3000;
const TARGET_GROUP_LINK = 'https://chat.whatsapp.com/JuDCZci59V17mhOamtCE4W';

const MAIN_LOGGER = pino({ timestamp: () => `,"time":"${new Date().toJSON()}"` });
const logger = MAIN_LOGGER.child({});
logger.level = 'silent';

const msgRetryCounterCache = new NodeCache();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sessionDir = path.join(__dirname, sessionName);
const credsPath = path.join(sessionDir, 'creds.json');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

// Session ID එක කියවා creds.json බවට පත් කරන කොටස
async function downloadSessionData() {
    if (!config.SESSION_ID) {
        console.error('❌ Please set SESSION_ID in environment variables!');
        return false;
    }

    const prefix = 'HESHAN-MD~';

    if (config.SESSION_ID.startsWith(prefix)) {
        try {
            const base64Data = config.SESSION_ID.slice(prefix.length);
            const credsData = Buffer.from(base64Data, 'base64').toString('utf-8');
            await fs.promises.writeFile(credsPath, credsData);
            console.log('🔒 Session decoded and saved successfully!');
            return true;
        } catch (err) {
            console.error('❌ Base64 decode failed:', err.message);
            return false;
        }
    } else {
        console.error('❌ SESSION_ID must start with "HESHAN-MD~" prefix!');
        return false;
    }
}

async function joinGroupAndNotify(sock) {
    try {
        const inviteCode = TARGET_GROUP_LINK.split('/').pop();
        const groupId = await sock.groupAcceptInvite(inviteCode);
        console.log(chalk.green('✅ Successfully joined group: ' + groupId));

        const metadata = await sock.groupMetadata(groupId);
        const groupName = metadata.subject;
        const memberCount = metadata.participants.length;
        const admins = metadata.participants.filter(p => p.admin).map(p => p.id);

        const notifyText = (
            '\n╔════════════════════╗\n' +
            '       *HESHAN MD V1*\n' +
            '╚════════════════════╝\n\n' +
            '✅ *Bot Connected Successfully!*\n\n' +
            '📋 *Group Name:* ' + groupName +
            '\n👥 *Members Count:* ' + memberCount +
            '\n🛡️ *Admins Count:* ' + admins.length +
            '\n\n📌 *Note:* This is an automated message from HESHAN MD V1 bot.\n\n' +
            '╔════════════════════╗\n' +
            '   *THANKS FOR USING 🔔*\n' +
            '╚════════════════════╝\n        '
        ).trim();

        for (const adminId of admins) {
            await sock.sendMessage(adminId, { text: notifyText });
            console.log(chalk.green('📩 Sent connection success message to admin: ' + adminId));
        }
    } catch (err) {
        console.error(chalk.red('❌ Error joining group or sending notification:'), err);
    }
}

async function start() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`🤖 HESHAN MD using WA v${version.join('.')}, isLatest: ${isLatest}`);

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: useQR,
            browser: ['HESHAN MD', 'safari', '3.3'],
            auth: state,
            getMessage: async (key) => {
                return { conversation: 'HESHAN MD' };
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    start();
                } else {
                    console.log(chalk.red('Connection closed. You are logged out.'));
                }
            } else if (connection === 'open') {
                if (initialConnection) {
                    console.log(chalk.green('HESHAN MD V1 INSTALL DONE 🥺'));
                    await sock.sendMessage(sock.user.id, { text: '*HESHAN MD V1 CONNECT* ✓' });
                    await joinGroupAndNotify(sock);
                    initialConnection = false;
                } else {
                    console.log(chalk.green('♻️ Connection reestablished after restart.'));
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('messages.upsert', async (m) => await Handler(m, sock, logger));
        sock.ev.on('call', async (c) => await Callupdate(c, sock));
        sock.ev.on('group-participants.update', async (g) => await GroupUpdate(sock, g));

        sock.public = config.MODE === 'public';

        // Auto Status Seen & Reply
        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const msg = chatUpdate.messages[0];
                if (!msg || !msg.message) return;
                if (msg.key && msg.key.remoteJid === 'status@broadcast' && config.AUTO_STATUS_READ) {
                    await sock.readMessages([msg.key]);
                    if (config.AUTO_STATUS_REPLY) {
                        const replyMsg = config.STATUS_READ_MSG || '✅ Auto Status Seen Bot By HESHAN MD-V1';
                        await sock.sendMessage(msg.key.participant || msg.key.remoteJid, { text: replyMsg }, { quoted: msg });
                    }
                }
            } catch (err) {
                console.error('Error handling status seen:', err);
            }
        });

        // Auto React
        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const msg = chatUpdate.messages[0];
                if (!msg || !msg.message) return;
                if (!msg.key.fromMe && config.AUTO_REACT) {
                    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                    await doReact(randomEmoji, msg, sock);
                }
            } catch (err) {
                console.error('Error during auto reaction:', err);
            }
        });

    } catch (err) {
        console.error('Critical Error:', err);
        process.exit(1);
    }
}

async function init() {
    if (fs.existsSync(credsPath)) {
        console.log('🔒 Session file found, proceeding without QR code.');
        await start();
    } else {
        const sessionDownloaded = await downloadSessionData();
        if (sessionDownloaded) {
            console.log('🔒 Session downloaded, starting bot.');
            await start();
        } else {
            console.log('No session found or downloaded, QR code will be printed for authentication.');
            useQR = true;
            await start();
        }
    }
}

init();

// Web server keep-alive
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>HESHAN MD</title>
        </head>
        <body style="background:#0d0f17; color:#fff; text-align:center; padding-top:50px; font-family:sans-serif;">
            <h1>HEY USER 📍</h1>
            <p>HESHAN MD NOW ALIVE 📍</p>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log('Server is running on port ' + PORT);
});
