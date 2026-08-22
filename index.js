require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { PlayerManager } = require("ziplayer");
const { YouTubePlugin, SoundCloudPlugin, SpotifyPlugin } = require("@ziplayer/plugin");

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.MessageContent,
	],
});

const manager = new PlayerManager({
	plugins: [new YouTubePlugin(), new SoundCloudPlugin(), new SpotifyPlugin()],
	autoCleanup: true,
});

// Event logs
manager.on("trackStart", (player, track) => {
	player.userdata?.channel?.send(`▶ Đang phát: **${track.title}**`);
});

manager.on("playerError", (player, error) => {
	console.error(`[${player.guildId}] Lỗi player:`, error);
});

client.once("ready", () => {
	console.log(`🤖 Bot đã đăng nhập thành công: ${client.user.tag}`);
});

const prefix = "!";

client.on("messageCreate", async (message) => {
	if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

	const args = message.content.slice(prefix.length).trim().split(/ +/);
	const command = args.shift().toLowerCase();

	const ensurePlayer = async () => {
		let player = manager.get(message.guild.id);
		if (!player) {
			player = await manager.create(message.guild.id, {
				userdata: { channel: message.channel },
				selfDeaf: true,
			});
		} else {
			player.userdata.channel = message.channel;
		}
		return player;
	};

	try {
		switch (command) {
			case "play": {
				if (!args[0]) return message.reply("❌ Vui lòng cung cấp tên bài hát hoặc URL!");
				if (!message.member.voice.channel) return message.reply("❌ Bạn phải vào kênh thoại trước!");

				const player = await ensurePlayer();
				if (!player.connection) await player.connect(message.member.voice.channel);

				const query = args.join(" ");
				const success = await player.play(query, message.author.id);
				if (success) message.reply(`✅ Đã thêm vào hàng đợi: **${query}**`);
				else message.reply("❌ Không tìm thấy kết quả phù hợp!");
				break;
			}

			case "skip": {
				const player = manager.get(message.guild.id);
				if (!player || !player.isPlaying) return message.reply("❌ Không có nhạc đang phát!");
				player.skip();
				message.reply("⏭️ Đã bỏ qua bài hát hiện tại!");
				break;
			}

			case "pause": {
				const player = manager.get(message.guild.id);
				if (!player || player.isPaused) return message.reply("❌ Nhạc đã tạm dừng hoặc không phát!");
				player.pause();
				message.reply("⏸️ Đã tạm dừng phát nhạc!");
				break;
			}

			case "resume": {
				const player = manager.get(message.guild.id);
				if (!player || !player.isPaused) return message.reply("❌ Nhạc đang phát hoặc không dừng!");
				player.resume();
				message.reply("▶️ Đã tiếp tục phát nhạc!");
				break;
			}

			case "stop":
			case "leave": {
				const player = manager.get(message.guild.id);
				if (!player) return message.reply("❌ Bot không ở trong kênh thoại!");
				player.destroy();
				message.reply("👋 Đã ngắt kết nối!");
				break;
			}

			case "volume": {
				const player = manager.get(message.guild.id);
				if (!player) return message.reply("❌ Bot chưa sẵn sàng!");
				if (!args[0]) return message.reply(`🔊 Âm lượng hiện tại: **${player.volume}%**`);
				const vol = parseInt(args[0]);
				if (isNaN(vol) || vol < 0 || vol > 100) return message.reply("❌ Âm lượng từ 0 đến 100!");
				player.setVolume(vol);
				message.reply(`🔊 Đã chỉnh âm lượng thành: **${vol}%**`);
				break;
			}
		}
	} catch (error) {
		console.error("Lỗi thực thi command:", error);
		message.reply("❌ Đã xảy ra lỗi khi xử lý lệnh.");
	}
});

client.login(process.env.DISCORD_TOKEN);
