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
	],
	partials: [Partials.Channel],
});

const lrc = new lyricsExt(null, { includeSynced: true, autoFetchOnTrackStart: true, sanitizeTitle: true });
const voice = new voiceExt(null, { client, lang: "vi-VN" });

// --- TỐI ƯU PLUGIN DANH SÁCH PHÁT ---
const plugins = [
	new TTSPlugin({ defaultLang: "vi" }),
	new SpotifyPlugin(),
	new InfinityPlugin(), // Hỗ trợ YouTube qua REST API
	new YouTubePlugin({
		playerClients: ["TVHTML5", "ANDROID", "IOS"], // Đổi Client vượt rào cản IP
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

manager.on("queueAdd", (player, track) => {
	const title = track?.title || track?.name || "Bài hát";
	player.userdata?.channel?.send(`✅ Đã thêm vào hàng đợi: **${title}**`).catch(() => null);
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

client.on("interactionCreate", async (interaction) => {
	if (!interaction.isChatInputCommand()) return;
	const { commandName, options, member, guild, channel } = interaction;

	if (commandName === "play") {
		const query = options.getString("query");
		if (!member.voice.channel) return interaction.reply({ content: "❌ Vào voice channel trước!", flags: 64 });

		await interaction.deferReply();
		try {
			let player = manager.get(guild.id);
			if (!player) {
				player = await manager.create(guild.id, {
					userdata: { channel },
					selfDeaf: true,
					extensions: ["lyricsExt", "voiceExt"],
				});
			}

			if (!player.connection) await player.connect(member.voice.channel);

			const res = await player.play(query, interaction.user.id);
			
			// Kiểm tra nếu bài hát lấy về bị rỗng dữ liệu
			if (!res || (res.title === "Unknown title" && !res.url)) {
				await interaction.editReply("❌ YouTube chặn stream trên IP này. Hãy thử dán **link Spotify** hoặc **SoundCloud**!");
				return;
			}

			const title = res.title || res.name || query;
			await interaction.editReply(`🔎 Đã xử lý yêu cầu phát: **${title}**`);
		} catch (err) {
			console.error("Play Error:", err);
			await interaction.editReply("❌ Lỗi lấy stream nhạc. Vui lòng dùng link Spotify!");
		}
	} else if (commandName === "skip") {
		const player = manager.get(guild.id);
		if (player) player.skip();
		interaction.reply("⏭️ Đã skip!");
	} else if (commandName === "stop") {
		const player = manager.get(guild.id);
		if (player) player.destroy();
		interaction.reply("👋 Đã ngắt kết nối!");
	}
});

client.login(process.env.DISCORD_TOKEN);
