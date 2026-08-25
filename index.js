require("dotenv").config();
const http = require("http");
const { 
	Client, 
	GatewayIntentBits, 
	Partials, 
	REST, 
	Routes, 
	SlashCommandBuilder, 
	Events, 
	EmbedBuilder, 
	PermissionFlagsBits, 
	MessageFlags 
} = require("discord.js");
const { PlayerManager } = require("ziplayer");
const { lavalinkExt } = require("@ziplayer/extension");
const { TTSPlugin } = require("@ziplayer/plugin"); // Tích hợp Plugin TTS chuẩn ZiPlayer[span_4](start_span)[span_4](end_span)

// --- BẮT LỖI TOÀN CỤC CHỐNG CRASH BOT ---
process.on("uncaughtException", (err) => console.error("⚠️ Uncaught Exception:", err));
process.on("unhandledRejection", (reason) => console.error("⚠️ Unhandled Rejection:", reason));

// --- WEB SERVER KEEP-ALIVE CHO RENDER ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
	res.writeHead(200, { "Content-Type": "text/plain" });
	res.write("Bot ZiPlayer is Running!");
	res.end();
}).listen(PORT, () => console.log(`🚀 Server active on port ${PORT}`));

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

// Khởi tạo Lavalink Extension
const lavalink = new lavalinkExt(null, {
	nodes: [
		{
			identifier: "main-node",
			password: process.env.LAVALINK_PASSWORD || "youshallnotpass",
			host: process.env.LAVALINK_HOST || "5.39.63.207",
			port: parseInt(process.env.LAVALINK_PORT) || 4722,
			secure: process.env.LAVALINK_SECURE === "true" || false,
		},
	],
	client: client,
	searchPrefix: "scsearch",
	debug: false,
});

// Thêm TTSPlugin vào danh sách plugins[span_5](start_span)[span_5](end_span)
const manager = new PlayerManager({
	plugins: [new TTSPlugin({ defaultLanguage: "vi" })],[span_6](start_span)[span_6](end_span)
	extensions: [lavalink],
	autoCleanup: true,
	extractorTimeout: 90000,
	disabledExtractors: ["youtube", "youtube-dl", "sabrdl", "YouTubePlugin", "spotify"],
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

// --- CÁC LỆNH SLASH COMMANDS (/) ---
const commands = [
	new SlashCommandBuilder().setName("play").setDescription("Phát nhạc từ SoundCloud (nhập tên hoặc link)").addStringOption(o => o.setName("query").setDescription("Tên bài hát / Link SoundCloud").setRequired(true)),
	new SlashCommandBuilder().setName("tts").setDescription("Đọc văn bản bằng giọng nói (Chỉ mình bạn thấy)").addStringOption(o => o.setName("text").setDescription("Nội dung cần đọc").setRequired(true)),
	new SlashCommandBuilder().setName("skip").setDescription("Bỏ qua bài hát hiện tại"),
	new SlashCommandBuilder().setName("pause").setDescription("Tạm dừng phát nhạc"),
	new SlashCommandBuilder().setName("resume").setDescription("Tiếp tục phát nhạc"),
	new SlashCommandBuilder().setName("stop").setDescription("Dừng phát nhạc và dọn dẹp hàng chờ"),
	new SlashCommandBuilder().setName("filter").setDescription("Áp dụng hoặc xem danh sách filter âm thanh").addStringOption(o => o.setName("name").setDescription("Tên filter")),
	new SlashCommandBuilder().setName("removefilter").setDescription("Gỡ bộ lọc âm thanh").addStringOption(o => o.setName("name").setDescription("Tên filter cần gỡ").setRequired(true)),
	new SlashCommandBuilder().setName("clearfilters").setDescription("Xóa toàn bộ bộ lọc âm thanh đang áp dụng"),
	new SlashCommandBuilder().setName("queue").setDescription("Xem danh sách bài hát đang chờ"),
	new SlashCommandBuilder().setName("nowplaying").setDescription("Xem bài hát đang được phát"),
	new SlashCommandBuilder().setName("loop").setDescription("Cài đặt chế độ lặp lại").addStringOption(o => o.setName("mode").setDescription("Chế độ").setRequired(true).addChoices(
		{ name: "Tắt lặp (off)", value: "off" },
		{ name: "Lặp bài hiện tại (track)", value: "track" },
		{ name: "Lặp toàn bộ hàng chờ (queue)", value: "queue" }
	)),
	new SlashCommandBuilder().setName("shuffle").setDescription("Trộn ngẫu nhiên bài hát"),
	new SlashCommandBuilder().setName("autoplay").setDescription("Bật/Tắt tự động phát bài liên quan"),
	new SlashCommandBuilder().setName("volume").setDescription("Điều chỉnh âm lượng").addIntegerOption(o => o.setName("amount").setDescription("Mức âm lượng (0-200)").setRequired(true)),
	new SlashCommandBuilder().setName("search").setDescription("Tìm kiếm bài hát trên SoundCloud").addStringOption(o => o.setName("query").setDescription("Tên bài hát").setRequired(true)),
	new SlashCommandBuilder().setName("join").setDescription("Vào kênh thoại của bạn"),
	new SlashCommandBuilder().setName("leave").setDescription("Rời khỏi kênh thoại"),
	new SlashCommandBuilder().setName("help").setDescription("Hiển thị hướng dẫn"),
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

// --- XỬ LÝ SLASH COMMANDS ---
client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	const { commandName, options, member, guild, channel, user } = interaction;

	try {
		if (commandName === "tts") {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		} else {
			await interaction.deferReply();
		}
	} catch (e) {
		return;
	}

	let player = manager.get(guild.id);

	if (commandName === "play" || commandName === "search") {
		let rawQuery = options.getString("query");
		if (!member?.voice?.channel) return interaction.editReply("❌ Bạn phải vào Voice Channel trước!");

		try {
			if (!player) {
				player = await manager.create(guild.id, { 
					userdata: { channel }, 
					selfDeaf: true,
					extensions: ["lavalinkExt"] 
				});
			}
			if (!player.connection) await player.connect(member.voice.channel);

			let res = null;
			if (rawQuery.includes("soundcloud.com")) {
				res = await player.play(rawQuery, user.id).catch(() => null);
			} else {
				res = await player.play(`scsearch:${rawQuery}`, user.id).catch(() => null);
			}

			if (!res) return interaction.editReply("❌ Không tìm thấy bài hát trên SoundCloud!");

			if (player.currentTrack) player.currentTrack.requestedBy = user.id;
			const title = res.title || res.name || rawQuery;
			return interaction.editReply(`🟠 Đã thêm từ SoundCloud: **${title}**`);
		} catch (err) {
			console.error("Play Error:", err);
			return interaction.editReply("❌ Lỗi tìm kiếm SoundCloud! Vui lòng thử lại.");
		}

	} else if (commandName === "tts") {
		const text = options.getString("text");
		const voiceChannel = member?.voice?.channel;

		if (!voiceChannel) return interaction.editReply("❌ Bạn phải vào Voice Channel trước!");

		try {
			if (!player) {
				player = await manager.create(guild.id, { 
					userdata: { channel },
					selfDeaf: true,
					extensions: ["lavalinkExt"]
				});
			}

			if (!player.connection) await player.connect(voiceChannel);

			// Sử dụng tiền tố tts: trực tiếp với ZiPlayer Manager[span_7](start_span)[span_7](end_span)
			const success = await player.play(`tts:${text}`, user.id);

			if (!success) {
				return interaction.editReply("❌ Không thể khởi tạo luồng đọc TTS!");
			}

			return interaction.editReply(`🗣️ Đã phát giọng nói vào Voice Channel: **"${text}"**`);
		} catch (err) {
			console.error("TTS Error:", err);
			return interaction.editReply("❌ Có lỗi xảy ra khi phát TTS!");
		}

	} else if (["skip", "pause", "resume", "stop"].includes(commandName)) {
		if (!player) return interaction.editReply("❌ Bot chưa ở trong Voice Channel!");
		if (!canControl(interaction, player)) {
			return interaction.editReply("🔒 Chỉ người phát bài hát này (hoặc Admin) mới có quyền thao tác!");
		}

		if (commandName === "skip") {
			player.skip();
			return interaction.editReply("⏭️ Đã bỏ qua!");
		} else if (commandName === "pause") {
			player.pause(true);
			return interaction.editReply("⏸️ Đã tạm dừng phát nhạc!");
		} else if (commandName === "resume") {
			player.pause(false);
			return interaction.editReply("▶️ Đã tiếp tục phát nhạc!");
		} else if (commandName === "stop") {
			player.destroy();
			return interaction.editReply("👋 Đã dừng nhạc và rời kênh!");
		}

	} else if (commandName === "filter") {
		if (!player) return interaction.editReply("❌ Bot chưa ở trong Voice Channel!");
		const filterName = options.getString("name");

		if (!filterName) {
			if (!player.filter) return interaction.editReply("❌ Trình quản lý filter không khả dụng.");
			const availableFilters = player.filter.getAvailableFilters ? player.filter.getAvailableFilters() : [];
			if (!availableFilters.length) return interaction.editReply("🎛️ Không có danh sách filter khả dụng.");
			
			let response = "🎛️ **Danh sách filters có sẵn:**\n";
			availableFilters.forEach((f) => {
				response += `• \`${f.name}\` - ${f.description || "Không có mô tả"}\n`;
			});
			return interaction.editReply(response);
		}

		if (player.filter && typeof player.filter.applyFilter === "function") {
			const success = player.filter.applyFilter(filterName);
			if (success) return interaction.editReply(`✅ Đã áp dụng filter: **${filterName}**`);
			return interaction.editReply(`❌ Không thể áp dụng filter: **${filterName}**`);
		}
		return interaction.editReply("❌ Trình quản lý filter không hỗ trợ.");

	} else if (commandName === "removefilter") {
		if (!player) return interaction.editReply("❌ Bot chưa ở trong Voice Channel!");
		const filterToRemove = options.getString("name");

		if (player.filter && typeof player.filter.removeFilter === "function") {
			const removed = player.filter.removeFilter(filterToRemove);
			if (removed) return interaction.editReply(`✅ Đã gỡ filter: **${filterToRemove}**`);
			return interaction.editReply(`❌ Không tìm thấy filter: **${filterToRemove}**`);
		}
		return interaction.editReply("❌ Trình quản lý filter không hỗ trợ.");

	} else if (commandName === "clearfilters") {
		if (!player) return interaction.editReply("❌ Bot chưa ở trong Voice Channel!");
		if (player.filter && typeof player.filter.clearAll === "function") {
			player.filter.clearAll();
			return interaction.editReply("✅ Đã xóa tất cả filters!");
		}
		return interaction.editReply("❌ Trình quản lý filter không hỗ trợ.");

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
		if (!player || !player.queue.length) return interaction.editReply("❌ Hàng chờ đang trống!");
		if (typeof player.shuffle === "function") player.shuffle();
		return interaction.editReply("🔀 Đã trộn ngẫu nhiên hàng chờ!");

	} else if (commandName === "autoplay") {
		if (!player) return interaction.editReply("❌ Bot chưa ở trong kênh!");
		const isAutoplay = !player.autoplay;
		player.autoplay = isAutoplay;
		return interaction.editReply(`📻 Tự động phát bài liên quan: **${isAutoplay ? "Bật" : "Tắt"}**`);

	} else if (commandName === "volume") {
		const amount = options.getInteger("amount");
		if (!player) return interaction.editReply("❌ Bot chưa ở trong kênh!");
		if (amount < 0 || amount > 200) return interaction.editReply("❌ Âm lượng hợp lệ từ 0 đến 200!");
		player.setVolume(amount);
		return interaction.editReply(`🔊 Âm lượng: **${amount}%**`);

	} else if (commandName === "join") {
		if (!member?.voice?.channel) return interaction.editReply("❌ Bạn phải vào Voice Channel trước!");
		if (!player) player = await manager.create(guild.id, { userdata: { channel }, selfDeaf: true, extensions: ["lavalinkExt"] });
		await player.connect(member.voice.channel);
		return interaction.editReply(`🔊 Đã tham gia **${member.voice.channel.name}**`);

	} else if (commandName === "leave") {
		if (!player) return interaction.editReply("❌ Bot chưa ở trong Voice Channel!");
		player.destroy();
		return interaction.editReply("👋 Đã rời khỏi kênh thoại!");

	} else if (commandName === "help") {
		const embed = new EmbedBuilder()
			.setColor("#ff5500")
			.setTitle("🟠 Bảng Hướng Dẫn - SoundCloud Music Bot")
			.setDescription(
				"**Phát Nhạc & Giọng Nói**\n" +
				"`/play <query>` - Phát bài hát từ từ khóa hoặc link SoundCloud\n" +
				"`/tts <text>` - Đọc văn bản bằng giọng nói\n" +
				"`/skip` - Bỏ qua bài hiện tại\n" +
				"`/stop` - Dừng phát nhạc và dọn dẹp hàng chờ\n"
			);
		return interaction.editReply({ embeds: [embed] });
	}
});

client.login(process.env.DISCORD_TOKEN);
