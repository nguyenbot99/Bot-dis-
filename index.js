require("dotenv").config();
const http = require("http");
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, Events, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { PlayerManager } = require("ziplayer");
const { YouTubePlugin, SpotifyPlugin, TTSPlugin } = require("@ziplayer/plugin");
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

// --- CẤU HÌNH PLUGINS ---
const plugins = [
	new TTSPlugin({ defaultLang: "vi" }),
	new SpotifyPlugin(),
	new YouTubePlugin({
		playerClients: ["WEB_CREATOR", "TVHTML5", "ANDROID", "IOS"],
		fetchOptions: {
			headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
			},
		},
	}),
];

const lrc = new lyricsExt({ includeSynced: true, autoFetchOnTrackStart: true, sanitizeTitle: true });
const voice = new voiceExt({ lang: "vi-VN" });

const manager = new PlayerManager({
	plugins: plugins,
	extensions: [lrc, voice],
	autoCleanup: true,
	extractorTimeout: 90000,
});

// --- HÀM KIỂM TRA QUYỀN ĐIỀU KHIỂN ---
const canControl = (interaction, player) => {
	const userId = interaction.user.id;
	const member = interaction.member;
	
	// Cho phép nếu là Administrator hoặc người yêu cầu bài hát hiện tại
	if (member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
	if (player?.currentTrack?.requestedBy === userId) return true;
	return false;
};

// --- EVENTS ---
manager.on("trackStart", (player, track) => {
	const title = track?.title || track?.name || "Bài hát";
	player.userdata?.channel?.send(`▶ Đang phát: **${title}**`).catch(() => null);
});

// --- DANH SÁCH SLASH COMMANDS (/) ---
const commands = [
	new SlashCommandBuilder().setName("play").setDescription("Phát bài hát từ link hoặc từ khóa").addStringOption(o => o.setName("query").setDescription("Tên bài hát hoặc URL").setRequired(true)),
	new SlashCommandBuilder().setName("tts").setDescription("Đọc văn bản giọng nói trong voice").addStringOption(o => o.setName("text").setDescription("Nội dung cần đọc").setRequired(true)),
	new SlashCommandBuilder().setName("skip").setDescription("Bỏ qua bài hát hiện tại"),
	new SlashCommandBuilder().setName("pause").setDescription("Tạm dừng phát nhạc"),
	new SlashCommandBuilder().setName("resume").setDescription("Tiếp tục phát nhạc"),
	new SlashCommandBuilder().setName("stop").setDescription("Dừng nhạc và dọn dẹp hàng chờ"),
	new SlashCommandBuilder().setName("queue").setDescription("Xem danh sách hàng chờ nhạc"),
	new SlashCommandBuilder().setName("nowplaying").setDescription("Xem bài hát đang phát"),
	new SlashCommandBuilder().setName("loop").setDescription("Cài đặt chế độ lặp lại").addStringOption(o => o.setName("mode").setDescription("Lựa chọn: off | track | queue").setRequired(true)),
	new SlashCommandBuilder().setName("shuffle").setDescription("Trộn ngẫu nhiên bài hát trong hàng chờ"),
	new SlashCommandBuilder().setName("autoplay").setDescription("Bật/Tắt tự động phát bài hát liên quan"),
	new SlashCommandBuilder().setName("volume").setDescription("Điều chỉnh âm lượng").addIntegerOption(o => o.setName("amount").setDescription("Mức âm lượng từ 0 đến 200").setRequired(true)),
	new SlashCommandBuilder().setName("join").setDescription("Kết nối vào Voice Channel"),
	new SlashCommandBuilder().setName("leave").setDescription("Rời khỏi Voice Channel"),
	new SlashCommandBuilder().setName("help").setDescription("Xem bảng hướng dẫn sử dụng bot"),
].map(cmd => cmd.toJSON());

client.once(Events.ClientReady, async (readyClient) => {
	console.log(`🤖 Bot online: ${readyClient.user.tag}`);
	const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
	try {
		await rest.put(Routes.applicationCommands(readyClient.user.id), { body: commands });
		console.log("✅ Đã cập nhật Slash Commands (/) thành công!");
	} catch (error) {
		console.error("❌ Lỗi Slash Commands:", error);
	}
});

// --- XỬ LÝ SLASH COMMANDS (/) ---
client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	try { await interaction.deferReply(); } catch (e) { return; }

	const { commandName, options, member, guild, channel, user } = interaction;
	let player = manager.get(guild.id);

	if (commandName === "play") {
		const query = options.getString("query");
		if (!member?.voice?.channel) return interaction.editReply("❌ Bạn phải vào Voice Channel trước!");

		try {
			if (!player) {
				player = await manager.create(guild.id, {
					userdata: { channel },
					selfDeaf: true,
				});
			}

			if (!player.connection) {
				await player.connect(member.voice.channel);
			}

			const res = await player.play(query, user.id);
			if (!res) return interaction.editReply("❌ Không tìm thấy bài hát hoặc lỗi nguồn phát!");
			
			if (player.currentTrack) {
				player.currentTrack.requestedBy = user.id;
			}
			
			const title = res.title || res.name || query;
			return interaction.editReply(`🔎 Đã xử lý yêu cầu phát: **${title}**`);
		} catch (err) {
			console.error("Play Error:", err);
			return interaction.editReply("❌ Lỗi lấy stream nhạc. Vui lòng thử lại với link Spotify!");
		}

	} else if (["skip", "pause", "resume", "stop"].includes(commandName)) {
		if (!player) return interaction.editReply("❌ Bot chưa ở trong Voice Channel!");
		if (!canControl(interaction, player)) {
			return interaction.editReply("🔒 Chỉ người yêu cầu bài hát này (hoặc Admin) mới có quyền thao tác!");
		}

		if (commandName === "skip") {
			player.skip();
			return interaction.editReply("⏭️ Đã skip bài hát!");
		} else if (commandName === "pause") {
			player.pause(true);
			return interaction.editReply("⏸️ Đã tạm dừng nhạc!");
		} else if (commandName === "resume") {
			player.pause(false);
			return interaction.editReply("▶️ Tiếp tục phát nhạc!");
		} else if (commandName === "stop") {
			player.destroy();
			return interaction.editReply("👋 Đã dừng nhạc và ngắt kết nối!");
		}

	} else if (commandName === "queue") {
		if (!player || !player.queue.length) return interaction.editReply("📜 Hàng chờ đang trống!");
		const list = player.queue.slice(0, 10).map((t, i) => `${i + 1}. ${t.title || t.name}`).join("\n");
		return interaction.editReply(`📜 **Danh sách hàng chờ:**\n${list}`);

	} else if (commandName === "nowplaying") {
		if (!player || !player.currentTrack) return interaction.editReply("❌ Không có bài hát nào đang phát!");
		return interaction.editReply(`🎵 Đang phát: **${player.currentTrack.title || player.currentTrack.name}**`);

	} else if (commandName === "volume") {
		const amount = options.getInteger("amount");
		if (!player) return interaction.editReply("❌ Bot chưa tham gia kênh!");
		if (amount < 0 || amount > 200) return interaction.editReply("❌ Vui lòng nhập mức âm lượng từ 0 đến 200!");
		player.setVolume(amount);
		return interaction.editReply(`🔊 Đã chỉnh âm lượng thành **${amount}%**`);

	} else if (commandName === "join") {
		if (!member?.voice?.channel) return interaction.editReply("❌ Bạn phải vào Voice Channel trước!");
		if (!player) {
			player = await manager.create(guild.id, { userdata: { channel }, selfDeaf: true });
		}
		await player.connect(member.voice.channel);
		return interaction.editReply(`🔊 Đã kết nối vào kênh **${member.voice.channel.name}**!`);

	} else if (commandName === "leave") {
		if (!player) return interaction.editReply("❌ Bot chưa ở trong Voice Channel!");
		player.destroy();
		return interaction.editReply("👋 Đã rời khỏi kênh Voice!");

	} else if (commandName === "help") {
		const embed = new EmbedBuilder()
			.setColor("#3498db")
			.setTitle("🎵 Music Bot Help")
			.setDescription(
				"**Playback**\n" +
				"`/play <query>` - Play a song\n" +
				"`/tts <text>` - Text to speech\n" +
				"`/skip` - Skip current track\n" +
				"`/pause` - Pause music\n" +
				"`/resume` - Resume music\n" +
				"`/stop` - Stop and clear queue\n\n" +
				"**Queue**\n" +
				"`/queue` - Show queue\n" +
				"`/nowplaying` - Show current track\n" +
				"`/loop [off|track|queue]` - Set loop mode\n" +
				"`/shuffle` - Shuffle queue\n" +
				"`/autoplay` - Toggle autoplay\n\n" +
				"**Settings**\n" +
				"`/volume [0-200]` - Set volume\n\n" +
				"**Connection**\n" +
				"`/join` - Join your voice channel\n" +
				"`/leave` - Leave voice channel"
			);
		return interaction.editReply({ embeds: [embed] });
	}
});

client.login(process.env.DISCORD_TOKEN);
