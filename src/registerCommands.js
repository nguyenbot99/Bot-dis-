/**
 * Đăng ký slash commands lên Discord.
 * Chạy: npm run register
 * Biến môi trường: DISCORD_TOKEN, GUILD_ID (tùy chọn, đăng ký guild-local để cập nhật ngay)
 */

const { REST, Routes } = require('discord.js');
const { commands } = require('./commands');

async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('Thiếu DISCORD_TOKEN trong môi trường.');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log('Bắt đầu đăng ký slash commands...');

    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID || process.env.APPLICATION_ID, process.env.GUILD_ID),
        { body: commands.map((c) => ({
          name: c.name,
          description: c.description,
          options: c.options || [],
        })) },
      );
      console.log(`Đã đăng ký ${commands.length} lệnh cho guild ${process.env.GUILD_ID}.`);
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID || process.env.APPLICATION_ID),
        { body: commands.map((c) => ({
          name: c.name,
          description: c.description,
          options: c.options || [],
        })) },
      );
      console.log(`Đã đăng ký ${commands.length} lệnh toàn cầu (có thể mất đến 1 tiếng để cập nhật).`);
    }
  } catch (error) {
    console.error('Lỗi đăng ký lệnh:', error);
    process.exit(1);
  }
}

main();
