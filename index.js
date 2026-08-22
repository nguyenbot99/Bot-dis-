require("dotenv").config();
const http = require("http");
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, Events, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { PlayerManager } = require("ziplayer");
const { YouTubePlugin, SpotifyPlugin, TTSPlugin } = require("@ziplayer/plugin");
const { voiceExt, lyricsExt } = require("@ziplayer/extension");

// --- BẮT LỖI TOÀN CỤC CHỐNG CRASH BOT ---
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

// --- CẤU HÌNH PLUGINS TỐI ƯU ---
const plugins = [
	new TTSPlugin({ defaultLang: "vi" }),
	new SpotifyPlugin({ emitError: false }),
	new YouTubePlugin({
		playerClients: ["ANDROID", "IOS"],
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
	
	if (member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
	if (player?.currentTrack?.requestedBy === userId) return true;
	return false;
};

// --- EVENTS ---
manager.on("trackStart", (player, track) => {
	const title = track?.title || track?.name || "Bài hát";
	player.userdata?.channel?.send(`▶ Đang phát: **${title}**`).catch(() => null);
});

// --- KHAI BÁO CÁC LỆNH SLASH COMMANDS (/) ---
const commands = [
	// Playback
	new SlashCommandBuilder().setName("play").setDescription("Phát bài hát từ link hoặc từ khóa").addStringOption(o => o.setName("query").setDescription("Tên bài hát/URL").setRequired(true)),
	new SlashCommandBuilder().setName("tts").setDescription("Đọc văn bản bằng giọng nói").addStringOption(o => o.setName("text").setDescription("Nội dung cần đọc").setRequired(true)),
	new SlashCommandBuilder().setName("skip").setDescription("Bỏ qua bài hát hiện tại"),
	new SlashCommandBuilder().setName("pause").setDescription("Tạm dừng phát nhạc"),
	new SlashCommandBuilder().setName("resume").setDescription("Tiếp tục phát nhạc"),
	new SlashCommandBuilder().setName("stop").setDescription("Dừng phát nhạc và dọn dẹp hàng chờ"),
	
	// Queue
	new SlashCommandBuilder().setName("queue").setDescription("Xem danh sách bài hát đang chờ"),
	new SlashCommandBuilder().setName("nowplaying").setDescription("Xem bài hát đang được phát"),
	new SlashCommandBuilder().setName("loop").setDescription("Cài đặt chế độ lặp lại").addStringOption(o => o.setName("mode").setDescription("Chế độ: off | track | queue").setRequired(true).addChoices(
		{ name: "Tắt lặp (off)", value: "off" },
		{ name: "Lặp bài hiện tại (track)", value: "track" },
		{ name: "Lặp toàn bộ hàng chờ (queue)", value: "queue" }
	)),
	new SlashCommandBuilder().setName("shuffle").setDescription("Trộn ngẫu nhiên bài hát trong hàng chờ"),
	new SlashCommandBuilder().setName("autoplay").setDescription("Bật/Tắt chế độ tự động phát bài liên quan"),
	
	// Settings & Search
	new SlashCommandBuilder().setName("volume").setDescription("Điều chỉnh âm lượng").addIntegerOption(o => o.setName("amount").setDescription("Mức âm lượng (0-200)").setRequired(true)),
	new SlashCommandBuilder().setName("search").setDescription("Tìm kiếm bài hát").addStringOption(o => o.setName("query").setDescription("Tên bài hát").setRequired(true)),
	
	// Connection & Help
	new SlashCommandBuilder().setName("join").setDescription("Vào kênh thoại của bạn"),
	new SlashCommandBuilder().setName("leave").setDescription("Rời khỏi kênh thoại"),
	new SlashCommandBuilder().setName("help").setDescription("Hiển thị danh sách hướng dẫn lệnh"),
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

	// --- 1. PLAYBACK ---
	if (commandName === "play" || commandName === "search") {
		let rawQuery = options.getString("query");
		if (!member?.voice?.channel) return interaction.editReply("❌ Bạn phải vào Voice Channel trước!");

		try {
			if (!player) {
				player = await manager.create(guild.id, { userdata: { channel }, selfDeaf: true });
			}
			if (!player.connection) await player.connect(member.voice.channel);

			let res = null;

			// Nếu dán Link YouTube, tự động trích xuất tên bài hát để tìm qua Spotify (bypass IP Block)
			if (rawQuery.includes("youtube.com") || rawQuery.includes("youtu.be")) {
				const cleanName = rawQuery.replace(/(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/(watch\?v=)?/, "").split("&")[0];
				res = await player.play(`spsearch:${cleanName}`, user.id).catch(() => null);
			} else if (!rawQuery.startsWith("http")) {
				// Tìm kiếm từ khóa mặc định qua Spotify
				res = await player.play(`spsearch:${rawQuery}`, user.id).catch(() => null);
			}

			// Nếu tìm kiếm Spotify thất bại, phát theo query gốc
			if (!res) {
				res = await player.play(rawQuery, user.id).catch(() => null);
			}

			if (!res) return interaction.editReply("❌ Không thể lấy bài hát! Hãy thử gõ **tên bài hát** (VD: `/play Chúng ta của tương lai`) hoặc dùng link Spotify.");

			if (player.currentTrack) player.currentTrack.requestedBy = user.id;
			const title = res.title || res.name || rawQuery;
			return interaction.editReply(`🔎 Đã xử lý yêu cầu phát: **${title}**`);
		} catch (err) {
			console.error("Play Error:", err);
			return interaction.editReply("❌ Lỗi kết nối nguồn nhạc! Vui lòng dùng tên bài hát hoặc link Spotify.");
		}

	} else if (commandName === "tts") {
		const text = options.getString("text");
		if (!member?.voice?.channel) return interaction.editReply("❌ Bạn phải vào Voice Channel trước!");
		if (!player) player = await manager.create(guild.id, { userdata: { channel }, selfDeaf: true });
		if (!player.connection) await player.connect(member.voice.channel);

		await player.play(`tts:${text}`, user.id);
		return interaction.editReply(`🗣️ Đang đọc: **"${text}"**`);

	} else if (["skip", "pause", "resume", "stop"].includes(commandName)) {
		if (!player) return interaction.editReply("❌ Bot chưa ở trong Voice Channel!");
		if (!canControl(interaction, player)) {
			return interaction.editReply("🔒 Chỉ người phát bài hát này (hoặc Admin) mới có quyền thao tác!");
		}

		if (commandName === "skip") {
			player.skip();
			return interaction.editReply("⏭️ Đã bỏ qua bài hát hiện tại!");
		} else if (commandName === "pause") {
			player.pause(true);
			return interaction.editReply("⏸️ Đã tạm dừng phát nhạc!");
		} else if (commandName === "resume") {
			player.pause(false);
			return interaction.editReply("▶️ Đã tiếp tục phát nhạc!");
		} else if (commandName === "stop") {
			player.destroy();
			return interaction.editReply("👋 Đã dừng nhạc và ngắt kết nối!");
		}

	// --- 2. QUEUE ---
	} else if (commandName === "queue") {
		if (!player || !player.queue.length) return interaction.editReply("📜 Hàng chờ hiện tại đang trống!");
		const list = player.queue.slice(0, 10).map((t, i) => `${i + 1}. **${t.title || t.name}**`).join("\n");
		return interaction.editReply(`📜 **Danh sách hàng chờ (${player.queue.length} bài):**\n${list}`);

	} else if (commandName === "nowplaying") {
		if (!player || !player.currentTrack) return interaction.editReply("❌ Không có bài hát nào đang phát!");
		return interaction.editReply(`🎵 Đang phát: **${player.currentTrack.title || player.currentTrack.name}**`);

	} else if (commandName === "loop") {
		const mode = options.getString("mode");
		if (!player) return interaction.editReply("❌ Bot chưa ở trong kênh!");
		if (typeof player.setLoop === "function") player.setLoop(mode);
		return interaction.editReply(`🔄 Đã chuyển sang chế độ lặp: **${mode}**`);

	} else if (commandName === "shuffle") {
		if (!player || !player.queue.length) return interaction.editReply("❌ Hàng chờ đang trống, không thể trộn!");
		if (typeof player.shuffle === "function") player.shuffle();
		return interaction.editReply("🔀 Đã trộn ngẫu nhiên danh sách hàng chờ!");

	} else if (commandName === "autoplay") {
		if (!player) return interaction.editReply("❌ Bot chưa ở trong kênh!");
		const isAutoplay = player.autoplay ? !player.autoplay : true;
		player.autoplay = isAutoplay;
		return interaction.editReply(`📻 Tự động phát bài liên quan: **${isAutoplay ? "Bật" : "Tắt"}**`);

	// --- 3. SETTINGS & CONNECTION ---
	} else if (commandName === "volume") {
		const amount = options.getInteger("amount");
		if (!player) return interaction.editReply("❌ Bot chưa ở trong kênh!");
		if (amount < 0 || amount > 200) return interaction.editReply("❌ Mức âm lượng hợp lệ từ 0 đến 200!");
		player.setVolume(amount);
		return interaction.editReply(`🔊 Đã chỉnh âm lượng thành **${amount}%**`);

	} else if (commandName === "join") {
		if (!member?.voice?.channel) return interaction.editReply("❌ Bạn phải vào Voice Channel trước!");
		if (!player) player = await manager.create(guild.id, { userdata: { channel }, selfDeaf: true });
		await player.connect(member.voice.channel);
		return interaction.editReply(`🔊 Đã tham gia kênh thoại **${member.voice.channel.name}**`);

	} else if (commandName === "leave") {
		if (!player) return interaction.editReply("❌ Bot chưa ở trong Voice Channel!");
		player.destroy();
		return interaction.editReply("👋 Đã rời khỏi kênh thoại!");

	// --- 4. HELP MENU ---
	} else if (commandName === "help") {
		const embed = new EmbedBuilder()
			.setColor("#3498db")
			.setTitle("🎵 Bảng Hướng Dẫn - Music Bot")
			.setDescription(
				"**Phát Nhạc (Playback)**\n" +
				"`/play <query>` - Phát bài hát từ từ khóa hoặc link\n" +
				"`/tts <text>` - Đọc văn bản bằng giọng nói\n" +
				"`/skip` - Bỏ qua bài hát đang phát\n" +
				"`/pause` - Tạm dừng phát nhạc\n" +
				"`/resume` - Tiếp tục phát nhạc\n" +
				"`/stop` - Dừng phát nhạc và xóa danh sách chờ\n\n" +
				"**Hàng Chờ (Queue)**\n" +
				"`/queue` - Xem danh sách bài hát đang chờ\n" +
				"`/nowplaying` - Xem thông tin bài hát đang phát\n" +
				"`/loop [off|track|queue]` - Cài đặt chế độ lặp lại\n" +
				"`/shuffle` - Trộn ngẫu nhiên danh sách chờ\n" +
				"`/autoplay` - Bật/Tắt tự động phát bài liên quan\n\n" +
				"**Cài Đặt (Settings)**\n" +
				"`/volume [0-200]` - Điều chỉnh âm lượng nhạc\n" +
				"`/search <query>` - Tìm kiếm danh sách bài hát\n\n" +
				"**Kết Nối (Connection)**\n" +
				"`/join` - Mời bot vào kênh thoại của bạn\n" +
				"`/leave` - Yêu cầu bot rời khỏi kênh thoại"
			);
		return interaction.editReply({ embeds: [embed] });
	}
});

client.login(process.env.DISCORD_TOKEN);
