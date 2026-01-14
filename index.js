const mineflayer = require('mineflayer');
const http = require('http');
const https = require('https');
const { Client, GatewayIntentBits, Events } = require('discord.js');

// --- RENDER ÉBREN TARTÁS (WEB SERVER) ---
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running and controlled by Discord!\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Web szerver fut a porton: ${PORT}`);
});

// Belső "Self-Ping" a leállás megelőzésére
setInterval(() => {
    const url = process.env.RENDER_EXTERNAL_URL;
    if (url) {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, (res) => {
            console.log('Self-ping sikeres: ' + res.statusCode);
        }).on('error', (err) => {
            console.log('Self-ping hiba: ' + err.message);
        });
    }
}, 280000);

// --- DISCORD BOT BEÁLLÍTÁSA ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN; 
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '1459574891559780515'; 

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

// --- MC BOT KONFIGURÁCIÓ ---
const options = {
    host: 'donutsmp.net',
    username: 'Patrik12130',
    auth: 'microsoft',
    version: '1.20.4',
    skipValidation: true,
    hideErrors: true 
};

let mcBot = null;
let isStopping = false;
let isAntiAfkActive = false;
let reconnectTimeout = 15000;
let antiAfkTimeout = null;

// Segédfüggvény a logoláshoz Discordra és Konzolra
async function discordLog(message) {
    console.log(message);
    if (!client.isReady()) return;
    try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID);
        if (channel) {
            await channel.send(`\`[${new Date().toLocaleTimeString()}]\` ${message}`);
        }
    } catch (err) {
        console.error('Hiba a Discord logolás közben:', err.message);
    }
}

// Ritka és véletlenszerű Anti-AFK mozgás (AFK Arénához optimalizálva)
function scheduleNextAction() {
    if (antiAfkTimeout) clearTimeout(antiAfkTimeout);
    if (!isAntiAfkActive || isStopping || !mcBot) return;

    // 5 és 15 perc közötti várakozás (300.000 - 900.000 ms)
    const nextInterval = Math.floor(Math.random() * (900000 - 300000 + 1)) + 300000;

    antiAfkTimeout = setTimeout(() => {
        if (mcBot && mcBot.entity) {
            const action = Math.random();
            
            if (action < 0.2) { 
                // 20% esély ugrásra
                mcBot.setControlState('jump', true);
                setTimeout(() => mcBot.setControlState('jump', false), 500);
            } else if (action < 0.8) {
                // 60% esély nézelődésre
                const yaw = mcBot.entity.yaw + (Math.random() - 0.5) * 3;
                const pitch = (Math.random() - 0.5) * 1.5;
                mcBot.look(yaw, pitch);
            } else {
            }
        }
        
        // Következő akció ütemezése
        scheduleNextAction();
    }, nextInterval);
}

function createMCBot() {
    if (isStopping) return;

    console.log('🚀 Minecraft bot indítása...');
    mcBot = mineflayer.createBot(options);
    isAntiAfkActive = false;

    mcBot.on('error', (err) => {
        if (err.code === 'Z_DATA_ERROR' || err.message.includes('inflating chunk')) {
            return;
        }
        discordLog(`❌ MC Hiba: ${err.message}`);
        if (!isStopping && (err.message.includes('already') || err.message.includes('connect'))) {
             if (mcBot) mcBot.quit();
        }
    });

    mcBot.on('spawn', () => {
        discordLog('✅ MC Bot sikeresen bent van a szerveren!');
        reconnectTimeout = 15000;
        
        // Belépés után várunk egy kicsit, majd indítjuk a ritka mozgást
        setTimeout(() => {
            if (isStopping || !mcBot) return;
            isAntiAfkActive = true;
            scheduleNextAction();
            discordLog('🏃 Anti-AFK (ritka mozgás) aktiválva (5-15 percenként).');
        }, 10000);
    });

    mcBot.on('end', (reason) => {
        discordLog(`🔌 MC Bot lecsatlakozott. Indok: ${reason}`);
        if (antiAfkTimeout) clearTimeout(antiAfkTimeout);
        
        if (!isStopping) {
            if (reason.includes('already connected') || reason.includes('logged in')) {
                reconnectTimeout = 60000;
                discordLog('⏳ Ghost Session érzékelve. Várok 1 percet...');
            } else {
                reconnectTimeout = 15000;
                discordLog(`🔄 Újracsatlakozás ${reconnectTimeout / 1000} mp múlva...`);
            }
            setTimeout(createMCBot, reconnectTimeout);
        }
    });
}

// --- DISCORD PARANCSOK ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    if (message.content === '!start') {
        if (isStopping || !mcBot) {
            isStopping = false;
            if (!mcBot) {
                createMCBot();
                return message.reply('▶️ Minecraft bot indítása folyamatban...');
            }
        }
        message.reply('⚠️ A bot már fut!');
    }

    if (message.content === '!stop') {
        if (mcBot) {
            isStopping = true;
            isAntiAfkActive = false;
            if (antiAfkTimeout) clearTimeout(antiAfkTimeout);
            mcBot.quit();
            mcBot = null;
            return message.reply('⏹️ Minecraft bot leállítva.');
        }
        message.reply('❓ A bot nem fut.');
    }

    if (message.content === '!kick') {
        await message.reply('💀 Folyamat kényszerített leállítása...');
        process.exit(0); 
    }
});

client.once(Events.ClientReady, () => {
    console.log(`Discord bot online: ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);
createMCBot();

