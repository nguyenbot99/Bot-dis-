/**
 * ZiPlayer Music Bot - Entry point
 * Đính kèm lệnh /tts và các lệnh điều khiển nhạc đi kèm.
 * Tham khảo kiến trúc ZiPlayer: PlayerManager (global) → Player (per guild) → Queue.
 * Tự động đăng ký slash commands khi khởi động.
 */

const {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
  REST,
  Routes,
} = require('discord.js');
const { PlayerManager } = require('./src/player');
const { commands, commandMap } = require('./src/commands');
const { server } = require('./server');

require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID || process.env.APPLICATION_ID;
const guildId = process.env.GUILD_ID;

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

/**
 * Đăng ký slash commands lên Discord.
 * Nếu có GUILD_ID → đăng ký guild-local (cập nhật ngay lập tức).
 * Ngược lại → đăng ký toàn cầu (có thể mất đến 1 tiếng để cập nhật).
 */
async function registerCommands() {
  if (!clientId) {
    console.warn('[Bot] Thiếu CLIENT_ID, bỏ qua đăng ký slash commands.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    const commandData = commands.map((c) => ({
      name: c.name,
      description: c.description,
      options: c.options || [],
    }));

    if (guildId) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commandData },
      );
      console.log(`[Bot] Đã đăng ký ${commands.length} lệnh slash cho guild ${guildId}.`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commandData });
      console.log(`[Bot] Đã đăng ký ${commands.length} lệnh slash toàn cầu (có thể mất đến 1 tiếng).`);
    }
  } catch (error) {
    console.error('[Bot] Lỗi đăng ký slash commands:', error);
  }
}

// Sự kiện khi bot sẵn sàng
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[Bot] Đã đăng nhập thành ${readyClient.user.tag}`);
  console.log(`[Bot] Quản lý player cho ${readyClient.guilds.cache.size} máy chủ.`);

  // Tự động đăng ký lệnh sau khi ready
  await registerCommands();
});

// Xử lý slash command interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);
  if (!command) {
    console.warn(`[Bot] Không tìm thấy lệnh: ${interaction.commandName}`);
    // Trả về lỗi ephemeral để người dùng biết
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Lệnh này chưa được đăng ký trên bot. Vui lòng thử lại sau.',
        flags: 64,
      });
    }
    return;
  }

  try {
    await command.execute(interaction, manager);
  } catch (error) {
    console.error(`[Bot] Lỗi thực thi lệnh ${interaction.commandName}:`, error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'Đã xảy ra lỗi khi thực thi lệnh.',
        flags: 64,
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
  server.close(() => console.log('[Keep-alive] Express server closed.'));
  for (const [guildId, player] of manager.players) {
    player.destroy();
  }
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Bot] Nhận SIGTERM, đang tắt...');
  server.close(() => console.log('[Keep-alive] Express server closed.'));
  for (const [guildId, player] of manager.players) {
    player.destroy();
  }
  client.destroy();
  process.exit(0);
});

module.exports = { client, manager };
