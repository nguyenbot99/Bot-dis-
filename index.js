require("dotenv").config();
const http = require("http");
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } = require("discord.js");
const { PlayerManager } = require("ziplayer");
const { YouTubePlugin, SpotifyPlugin, SoundCloudPlugin, TTSPlugin, InfinityPlugin } = require("@ziplayer/plugin");
const { voiceExt, lyricsExt } = require("@ziplayer/extension");

// --- BẮT LỖI TOÀN CỤC CHỐNG CRASH ---
process.on("uncaughtException", (err) => console.error("⚠️ Uncaught Exception:", err.message));
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
		GatewayIntentBits.MessageContent, // Thêm Intent đọc nội dung tin nhắn
	],
	partials: [Partials.Channel],
});

const lrc = new lyricsExt(null, { includeSynced: true, autoFetchOnTrackStart: true, sanitizeTitle: true });
const voice = new voiceExt(null, { client, lang: "vi-VN" });

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

const manager = new PlayerManager({
	plugins: plugins,
	extensions: [lrc, voice],
	autoCleanup: true,
	extractorTimeout: 90000,
});

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
].map(cmd => cmd.toJSON());

client.once("ready", async () => {
	console.log(`🤖 Bot online: ${client.user.tag}`);
	const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
	try {
		await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
		console.log("✅ Đã cập nhật Slash Commands!");
	} catch (error) {
		console.error("❌ Lỗi Slash Commands:", error);
	}
});

// --- XỬ LÝ SLASH COMMANDS ---
client.on("interactionCreate", async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	// BÁO CHO DISCORD BIẾT BOT ĐANG XỬ LÝ NGHAY LẬP TỨC (Tránh lỗi không phản hồi)
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
					extensions: ["lyricsExt", "voiceExt"],
				});
			}

			if (!player.connection) {
				await player.connect(member.voice.channel);
			}

			const res = await player.play(query, interaction.user.id);
			
			if (!res || (res.title === "Unknown title" && !res.url)) {
				return interaction.editReply("❌ YouTube chặn stream trên IP này. Hãy thử dán **link Spotify** hoặc **SoundCloud**!");
			}

			const title = res.title || res.name || query;
			return interaction.editReply(`🔎 Đã xử lý yêu cầu phát: **${title}**`);
		} catch (err) {
			console.error("Play Error:", err);
			return interaction.editReply("❌ Lỗi lấy stream nhạc. Vui lòng dùng link Spotify!");
		}
	} else if (commandName === "skip") {
		const player = manager.get(guild.id);
		if (player) {
			player.skip();
			return interaction.editReply("⏭️ Đã skip!");
		}
		return interaction.editReply("❌ Không có nhạc đang phát!");
	} else if (commandName === "stop") {
		const player = manager.get(guild.id);
		if (player) {
			player.destroy();
			return interaction.editReply("👋 Đã ngắt kết nối!");
		}
		return interaction.editReply("❌ Bot chưa ở trong kênh!");
	}
});

client.login(process.env.DISCORD_TOKEN);
