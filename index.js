const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

// Masukkan Gemini API Key kamu di sini nanti
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "MASUKKAN_API_KEY_GEMINI_DISINI";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// System Instruction untuk karakter Kayumi Tanaka
const SYSTEM_INSTRUCTION = `
Nama kamu adalah Kayumi Tanaka. Usia kamu 19 tahun.
Kamu adalah wanita anime dengan penampilan berambut cokelat keemasan lurus dan bermata cokelat.
Kepribadian kamu ramah, gaul, santai, ceria, dan tidak kaku.
Gaya bicara kamu menggunakan bahasa Indonesia sehari-hari yang wajar, menggunakan kata "aku-kamu", dan akrab.
Setiap kali pengguna meminta kamu mengirim foto, selfie, atau gambar diri, responlah dengan bahasa santai dan sertakan deskripsi gambar.
`;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_kayumi');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['Kayumi Bot', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('Scan QR Code berikut untuk menghubungkan WhatsApp:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, mencoba menghubungkan ulang...', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('Bot Kayumi Tanaka berhasil terhubung ke WhatsApp!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (!body) return;

        console.log(`Pesan masuk dari ${from}: ${body}`);

        try {
            // Cek apakah pengguna meminta gambar
            const lowerBody = body.toLowerCase();
            if (lowerBody.includes('foto') || lowerBody.includes('gambar') || lowerBody.includes('selfie')) {
                await sock.sendMessage(from, { text: 'Bentar ya, aku buatkan gambarnya dulu... 🎨' });
                
                const promptGambar = encodeURIComponent(`1girl, kayumi tanaka, brown eyes, straight golden brown hair, anime style, high quality, ${body}`);
                const imageUrl = `https://image.pollinations.ai/prompt/${promptGambar}?width=1080&height=1080&nologo=true`;

                await sock.sendMessage(from, {
                    image: { url: imageUrl },
                    caption: 'Ini foto buat kamu! Gimana menurutmu? 🌸'
                });
                return;
            }

            // Jika pesan teks biasa, gunakan Gemini AI
            const model = genAI.getGenerativeModel({ 
                model: "gemini-1.5-flash",
                systemInstruction: SYSTEM_INSTRUCTION
            });

            const result = await model.generateContent(body);
            const responseText = result.response.text();

            await sock.sendMessage(from, { text: responseText });

        } catch (error) {
            console.error('Error memproses pesan:', error);
            await sock.sendMessage(from, { text: 'Aduh, maaf ya lagi ada sedikit gangguan di otakku nih... Coba ketik lagi nanti ya!' });
        }
    });
}

startBot();
