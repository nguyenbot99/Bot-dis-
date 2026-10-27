/**
 * ZiPlayer Music Bot - Entry point
 * Đính kèm lệnh /tts và các lệnh điều khiển nhạc đi kèm.
 * Tham khảo kiến trúc ZiPlayer: PlayerManager (global) → Player (per guild) → Queue.
 */

const { Client, GatewayIntentBits, Events, Partials } = require('discord.js');
const { PlayerManager } = require('./src/player');
const { commands, commandMap } = require('./src/commands');

require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Lỗi: Thiếu DISCORD_TOKEN. Tạo file .env và DISCORD_TOKEN=your_token');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const manager = new PlayerManager({
  leaveOnEnd: true,
  defaultLang: 'vi',
  ttsInterrupt: true,
  volume: 100,
});

// Sự kiện khi bot sẵn sàng
client.once(Events.ClientReady, (readyClient) => {
  console.log(`[Bot] Đã đăng nhập thành ${readyClient.user.tag}`);
  console.log(`[Bot] Quản lý player cho ${readyClient.guilds.cache.size} máy chủ.`);
});

// Xử lý slash command interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);
  if (!command) {
    console.warn(`[Bot] Không tìm thấy lệnh: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction, manager);
  } catch (error) {
    console.error(`[Bot] Lỗi thực thi lệnh ${interaction.commandName}:`, error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'Đã xảy ra lỗi khi thực thi lệnh.',
        flags: 64, // E
      });
    } else {
      await interaction.reply({
        content: 'Đã xảy ra lỗi khi thực thi lệnh.',
        flags: 64,
      });
    }
  }
});

// Xử lý sự kiện lỗi của client
client.on(Events.Error, (error) => {
  console.error('[Bot] Discord client error:', error);
});

client.on(Events.Warn, (warn) => {
  console.warn('[Bot] Discord warn:', warn);
});

client.login(token).catch((error) => {
  console.error('[Bot] Không thể đăng nhập:', error.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Bot] Đang tắt...');
  for (const [guildId, player] of manager.players) {
    player.destroy();
  }
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Bot] Nhận SIGTERM, đang tắt...');
  for (const [guildId, player] of manager.players) {
    player.destroy();
  }
  client.destroy();
  process.exit(0);
});

module.exports = { client, manager };
