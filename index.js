require("dotenv").config();
const http = require("http");
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } = require("discord.js");
const { PlayerManager } = require("ziplayer");
const { YouTubePlugin, SpotifyPlugin, SoundCloudPlugin, TTSPlugin, InfinityPlugin } = require("@ziplayer/plugin");
const { voiceExt, lyricsExt } = require("@ziplayer/extension");

// --- BẮT LỖI TOÀN CỤC CHỐNG CRASH ---
process.on("uncaughtException", (err) => console.error("⚠️ Uncaught Exception:", err));
process.on("unhandledRejection", (reason) => console.error("⚠️ Unhandled Rejection:", reason));

// --- WEB SERVER KEEP-ALIVE ---
http.createServer((req, res) => {
	res.write("Bot ZiPlayer is Running!");
	res.end();
}).listen(process.env.PORT || 3000);

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.MessageContent,
	],
	partials: [Partials.Channel],
});

// --- TỐI ƯU CẤU HÌNH PLUGIN & EXTENSION ---
const plugins = [
	new TTSPlugin({ defaultLang: "vi" }),
	new SpotifyPlugin(),
	new InfinityPlugin(),
	new YouTubePlugin({
		playerClients: ["TVHTML5", "ANDROID", "IOS"],
		fetchOptions: {
			headers: {
				"User-Agent": "Mozilla/5.0 (SmartTV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.93 TV Safari/537.36",
			},
		},
	}),
];

try {
	plugins.push(new SoundCloudPlugin());
} catch (e) {
	console.warn("⚠️ SoundCloudPlugin bypass:", e.message);
}

// KHỞI TẠO EXTENSION ĐÚNG CÁCH (Không truyền null)
const lrc = new lyricsExt({ includeSynced: true, autoFetchOnTrackStart: true, sanitizeTitle: true });
const voice = new voiceExt({ lang: "vi-VN" });

const manager = new PlayerManager({
	plugins: plugins,
	extensions: [lrc, voice],
	autoCleanup: true,
	extractorTimeout: 90000,
});

// --- HÀM XỬ LÝ EQ CLARITY ---
const applyClarity = async (player) => {
	if (!player) return false;
	try {
		if (player.filter && typeof player.filter.applyFilter === "function") {
			await player.filter.applyFilter("trebleboost");
			return true;
		}
		if (player.filters && typeof player.filters.set === "function") {
			await player.filters.set("trebleboost");
			return true;
		}
		if (typeof player.setFilter === "function") {
			await player.setFilter("trebleboost");
			return true;
		}
		return false;
	} catch (error) {
		console.error("applyClarity error:", error);
		return false;
	}
};

// --- EVENTS ---
manager.on("trackStart", (player, track) => {
	const title = track?.title || track?.name || "Bài hát";
	player.userdata?.channel?.send(`▶ Đang phát: **${title}**`).catch(() => null);
});

// --- SLASH COMMANDS ---
const commands = [
	new SlashCommandBuilder()
		.setName("play")
		.setDescription("Phát nhạc từ YouTube, Spotify hoặc SoundCloud")
		.addStringOption(opt => opt.setName("query").setDescription("Tên bài hát hoặc URL").setRequired(true)),
	new SlashCommandBuilder().setName("skip").setDescription("Bỏ qua bài hát hiện tại"),
	new SlashCommandBuilder().setName("stop").setDescription("Dừng nhạc và rời kênh"),
	new SlashCommandBuilder().setName("clarity").setDescription("Bật bộ lọc âm thanh Clarity (Treble Boost)"),
].map(cmd => cmd.toJSON());

client.once("ready", async () => {
	console.log(`🤖 Bot online: ${client.user.tag}`);
	const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
	try {
		// Đăng ký lệnh ngay lập tức cho toàn bộ Server bot tham gia
		await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
		console.log("✅ Đã đăng ký thành công Slash Commands!");
	} catch (error) {
		console.error("❌ Lỗi Slash Commands:", error);
	}
});

// --- XỬ LÝ SLASH COMMANDS ---
client.on("interactionCreate", async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	// BÁO DISCORD BOT ĐANG XỬ LÝ (Tránh bị Timeout 3 giây)
	try {
		await interaction.deferReply();
	} catch (e) {
		return;
	}

	const { commandName, options, member, guild, channel } = interaction;

	if (commandName === "play") {
		const query = options.getString("query");
		if (!member?.voice?.channel) {
			return interaction.editReply("❌ Bạn phải vào voice channel trước!");
		}

		try {
			let player = manager.get(guild.id);
			if (!player) {
				player = await manager.create(guild.id, {
					userdata: { channel },
					selfDeaf: true,
				});
			}

			// Đảm bảo kết nối Voice hoàn tất
			if (!player.connection) {
				await player.connect(member.voice.channel);
			}

			const res = await player.play(query, interaction.user.id);
			
			if (!res || (res.title === "Unknown title" && !res.url)) {
				return interaction.editReply("❌ YouTube chặn stream trên IP này. Hãy thử dán **link Spotify** hoặc **SoundCloud**!");
			}

			// Lưu lại người yêu cầu bài hát
			if (player.currentTrack) {
				player.currentTrack.requestedBy = interaction.user.id;
			}

			const title = res.title || res.name || query;
			return interaction.editReply(`🔎 Đã xử lý yêu cầu phát: **${title}**`);
		} catch (err) {
			console.error("Play Error:", err);
			return interaction.editReply("❌ Lỗi lấy stream nhạc. Vui lòng dùng link Spotify!");
		}

	} else if (commandName === "skip") {
		const player = manager.get(guild.id);
		if (!player || !player.currentTrack) {
			return interaction.editReply("❌ Không có nhạc đang phát!");
		}

		// Kiểm tra quyền chỉ người gọi bài mới skip được
		const currentTrack = player.currentTrack;
		if (currentTrack.requestedBy && currentTrack.requestedBy !== interaction.user.id) {
			return interaction.editReply("🔒 Chỉ người yêu cầu bài hát này mới có quyền skip!");
		}

		player.skip();
		return interaction.editReply("⏭️ Đã skip!");

	} else if (commandName === "stop") {
		const player = manager.get(guild.id);
		if (!player) {
			return interaction.editReply("❌ Bot chưa ở trong kênh!");
		}

		// Kiểm tra quyền chỉ người gọi bài mới stop được
		const currentTrack = player.currentTrack;
		if (currentTrack && currentTrack.requestedBy && currentTrack.requestedBy !== interaction.user.id) {
			return interaction.editReply("🔒 Chỉ người yêu cầu bài hát hiện tại mới có quyền stop!");
		}

		player.destroy();
		return interaction.editReply("👋 Đã ngắt kết nối!");

	} else if (commandName === "clarity") {
		const player = manager.get(guild.id);
		if (!player || !player.currentTrack) {
			return interaction.editReply("❌ Không có bài hát nào đang phát!");
		}

		const success = await applyClarity(player);
		if (success) {
			return interaction.editReply("✨ Đã bật chế độ âm thanh **Clarity (Treble Boost)**!");
		} else {
			return interaction.editReply("❌ Trình phát nhạc hiện tại không hỗ trợ bộ lọc Clarity.");
		}
	}
});

client.login(process.env.DISCORD_TOKEN);
