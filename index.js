require("dotenv").config();
const http = require("http");
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } = require("discord.js");
const { PlayerManager } = require("ziplayer");
const { YouTubePlugin, SpotifyPlugin, SoundCloudPlugin, TTSPlugin } = require("@ziplayer/plugin");
const { voiceExt, lyricsExt } = require("@ziplayer/extension");

// --- 1. WEB SERVER KEEP-ALIVE CHO RENDER FREE ---
http.createServer((req, res) => {
	res.write("Bot ZiPlayer is Running!");
	res.end();
}).listen(process.env.PORT || 3000);

// --- 2. DISCORD CLIENT SETUP ---
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.GuildMembers,
	],
	partials: [Partials.Channel],
});

// --- 3. EXTENSIONS CONFIGURATION ---
const lrc = new lyricsExt(null, {
	includeSynced: true,
	autoFetchOnTrackStart: true,
	sanitizeTitle: true,
});

const voice = new voiceExt(null, { client, lang: "vi-VN" });

// --- 4. TẠO DANH SÁCH PLUGIN AN TOÀN (YOUTUBE + SPOTIFY + SOUNDCLOUD) ---
const plugins = [new TTSPlugin({ defaultLang: "vi" }), new SpotifyPlugin()];

// Khởi tạo SoundCloud an toàn (tránh crash do Render bị block IP)
try {
	plugins.push(new SoundCloudPlugin());
} catch (e) {
	console.warn("⚠️ Khởi tạo SoundCloudPlugin thất bại, chuyển sang chế độ dự phòng:", e.message);
}

// Khởi tạo YouTube
plugins.push(
	new YouTubePlugin({
		fetchOptions: {
			headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
			},
		},
	})
);

// --- 5. PLAYER MANAGER SETUP ---
const manager = new PlayerManager({
	plugins: plugins,
	extensions: [lrc, voice],
	autoCleanup: true,
});

// --- 6. EVENT LISTENERS ---
manager.on("trackStart", (player, track) => {
	const title = track?.title || track?.name || "Bài hát không tên";
	player.userdata?.channel?.send(`▶ Đang phát: **${title}**`).catch(() => null);
});

manager.on("queueAdd", (player, track) => {
	const title = track?.title || track?.name || "Bài hát không tên";
	player.userdata?.channel?.send(`✅ Đã thêm vào hàng đợi: **${title}**`).catch(() => null);
});

manager.on("ttsStart", (player, { track }) => {
	player.userdata?.channel?.send(`🗣️ Đang nói TTS: ${track?.title || ""}`).catch(() => null);
});

manager.on("lyricsChange", async (player, track, result) => {
	if (result?.current) {
		const msg = `🎤 **Lời bài hát:** ${result.current}`;
		player.userdata?.channel?.send(msg).catch(() => null);
	}
});

// Voice Control
manager.on("voiceCreate", async (player, evt) => {
	const text = evt.content.toLowerCase();
	const channel = player.userdata?.channel;

	if (text.includes("bỏ qua") || text.includes("skip")) {
		player.skip();
		channel?.send("⏭️ Lệnh giọng nói: Đã bỏ qua bài!");
	} else if (text.includes("dừng") || text.includes("ngưng phát")) {
		player.destroy();
		channel?.send("👋 Lệnh giọng nói: Đã dừng phát!");
	} else if (text.includes("tạm dừng")) {
		player.pause();
		channel?.send("⏸️ Lệnh giọng nói: Đã tạm dừng!");
	} else if (text.includes("tiếp tục")) {
		player.resume();
		channel?.send("▶️ Lệnh giọng nói: Đã tiếp tục!");
	}
});

// --- 7. KHAI BÁO SLASH COMMANDS ---
const commands = [
	new SlashCommandBuilder()
		.setName("play")
		.setDescription("Phát nhạc từ YouTube, Spotify hoặc SoundCloud")
		.addStringOption(opt => opt.setName("query").setDescription("Tên bài hát hoặc liên kết").setRequired(true)),
	new SlashCommandBuilder()
		.setName("tts")
		.setDescription("Chuyển văn bản thành giọng nói")
		.addStringOption(opt => opt.setName("text").setDescription("Nội dung cần nói").setRequired(true)),
	new SlashCommandBuilder().setName("skip").setDescription("Bỏ qua bài hát hiện tại"),
	new SlashCommandBuilder().setName("pause").setDescription("Tạm dừng phát nhạc"),
	new SlashCommandBuilder().setName("resume").setDescription("Tiếp tục phát nhạc"),
	new SlashCommandBuilder().setName("stop").setDescription("Dừng nhạc và rời kênh thoại"),
	new SlashCommandBuilder().setName("queue").setDescription("Xem danh sách hàng đợi"),
	new SlashCommandBuilder().setName("nowplaying").setDescription("Xem bài hát đang phát"),
	new SlashCommandBuilder().setName("autoplay").setDescription("Bật/tắt chế độ tự phát bài liên quan"),
	new SlashCommandBuilder()
		.setName("volume")
		.setDescription("Điều chỉnh hoặc kiểm tra âm lượng")
		.addIntegerOption(opt => opt.setName("level").setDescription("Mức âm lượng từ 0-100").setRequired(false)),
	new SlashCommandBuilder()
		.setName("filter")
		.setDescription("Áp dụng hiệu ứng âm thanh")
		.addStringOption(opt => opt.setName("name").setDescription("Tên filter (vd: nightcore, bassboost, vaporwave)").setRequired(true)),
	new SlashCommandBuilder().setName("clearfilters").setDescription("Xóa toàn bộ hiệu ứng âm thanh"),
].map(cmd => cmd.toJSON());

// --- 8. REGISTER COMMANDS & READY EVENT ---
client.once("ready", async () => {
	console.log(`🤖 Bot đã đăng nhập thành công: ${client.user.tag}`);

	const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
	try {
		console.log("⏳ Đang đăng ký các lệnh Slash (/)....");
		await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
		console.log("✅ Đã cập nhật thành công hệ thống lệnh Slash (/)!");
	} catch (error) {
		console.error("❌ Lỗi đăng ký Slash Commands:", error);
	}
});

// --- 9. INTERACTION HANDLER ---
client.on("interactionCreate", async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	const { commandName, options, member, guild, channel } = interaction;

	const ensurePlayer = async () => {
		let player = manager.get(guild.id);
		if (!player) {
			player = await manager.create(guild.id, {
				userdata: { channel: channel },
				selfDeaf: true,
				tts: { createPlayer: true, interrupt: true, volume: 50 },
				extensions: ["lyricsExt", "voiceExt"],
			});
		} else {
			player.userdata.channel = channel;
		}
		return player;
	};

	try {
		switch (commandName) {
			case "play": {
				const query = options.getString("query");
				if (!member.voice.channel) {
					return interaction.reply({ content: "❌ Bạn phải vào kênh thoại trước!", flags: 64 });
				}

				await interaction.deferReply();

				try {
					const player = await ensurePlayer();
					if (!player.connection) await player.connect(member.voice.channel);

					const res = await player.play(query, interaction.user.id);
					
					let songTitle = query;
					if (res && typeof res === "object") {
						songTitle = res.title || res.name || res.tracks?.[0]?.title || query;
					} else if (player.currentTrack) {
						songTitle = player.currentTrack.title || player.currentTrack.name || query;
					}

					await interaction.editReply(`🔎 Đã thêm vào hàng đợi: **${songTitle}**`);
				} catch (err) {
					console.error("Lỗi khi tìm/phát nhạc:", err);
					await interaction.editReply("❌ Không thể lấy dữ liệu phát bài hát này. Bạn hãy thử dán link trực tiếp từ Spotify hoặc SoundCloud!");
				}
				break;
			}

			case "tts": {
				const text = options.getString("text");
				if (!member.voice.channel) return interaction.reply({ content: "❌ Bạn phải vào kênh thoại trước!", flags: 64 });

				await interaction.deferReply();
				const player = await ensurePlayer();
				if (!player.connection) await player.connect(member.voice.channel);

				await player.play(`tts:${text}`, interaction.user.id);
				await interaction.editReply(`🗣️ Đã thêm lệnh đọc TTS: **${text}**`);
				break;
			}

			case "skip": {
				const player = manager.get(guild.id);
				if (!player) return interaction.reply({ content: "❌ Không có nhạc đang phát!", flags: 64 });
				player.skip();
				interaction.reply("⏭️ Đã bỏ qua bài hát hiện tại!");
				break;
			}

			case "pause": {
				const player = manager.get(guild.id);
				if (!player) return interaction.reply({ content: "❌ Bot chưa phát nhạc!", flags: 64 });
				player.pause();
				interaction.reply("⏸️ Đã tạm dừng!");
				break;
			}

			case "resume": {
				const player = manager.get(guild.id);
				if (!player) return interaction.reply({ content: "❌ Bot chưa phát nhạc!", flags: 64 });
				player.resume();
				interaction.reply("▶️ Đã tiếp tục phát nhạc!");
				break;
			}

			case "stop": {
				const player = manager.get(guild.id);
				if (!player) return interaction.reply({ content: "❌ Bot không có trong kênh thoại!", flags: 64 });
				player.destroy();
				interaction.reply("👋 Đã dừng nhạc và rời kênh!");
				break;
			}

			case "queue": {
				const player = manager.get(guild.id);
				if (!player || !player.currentTrack) return interaction.reply({ content: "❌ Hàng đợi trống!", flags: 64 });
				const current = player.currentTrack.title || player.currentTrack.name || "Không tên";
				const list = player.upcomingTracks
					.map((t, i) => `${i + 1}. ${t.title || t.name || "Không tên"}`)
					.slice(0, 10)
					.join("\n");
				interaction.reply(`**Đang phát:** ${current}\n\n**Danh sách tiếp theo:**\n${list || "Không có bài tiếp theo."}`);
				break;
			}

			case "nowplaying": {
				const player = manager.get(guild.id);
				if (!player || !player.currentTrack) return interaction.reply({ content: "❌ Không có bài hát nào đang phát!", flags: 64 });
				const progress = player.getProgressBar();
				interaction.reply(`▶️ **Đang phát:** ${player.currentTrack.title || player.currentTrack.name || "Không tên"}\n${progress}`);
				break;
			}

			case "autoplay": {
				const player = manager.get(guild.id);
				if (!player) return interaction.reply({ content: "❌ Bot chưa kết nối!", flags: 64 });
				const status = !player.queue.autoPlay();
				player.queue.autoPlay(status);
				interaction.reply(`🔁 Tự động phát bài liên quan: **${status ? "Bật" : "Tắt"}**`);
				break;
			}

			case "volume": {
				const player = manager.get(guild.id);
				if (!player) return interaction.reply({ content: "❌ Bot chưa kết nối!", flags: 64 });
				const vol = options.getInteger("level");
				if (vol === null) return interaction.reply(`🔊 Âm lượng hiện tại: **${player.volume}%**`);
				if (vol < 0 || vol > 100) return interaction.reply({ content: "❌ Âm lượng phải từ 0 đến 100!", flags: 64 });
				player.setVolume(vol);
				interaction.reply(`🔊 Đã chỉnh âm lượng thành: **${vol}%**`);
				break;
			}

			case "filter": {
				const player = manager.get(guild.id);
				if (!player) return interaction.reply({ content: "❌ Bot chưa kết nối!", flags: 64 });
				const filterName = options.getString("name");
				const success = player.filter.applyFilter(filterName);
				if (success) interaction.reply(`✅ Đã áp dụng filter: **${filterName}**`);
				else interaction.reply({ content: `❌ Không tìm thấy hoặc không áp dụng được filter: **${filterName}**`, flags: 64 });
				break;
			}

			case "clearfilters": {
				const player = manager.get(guild.id);
				if (player) {
					player.filter.clearAll();
					interaction.reply("✅ Đã gỡ toàn bộ hiệu ứng âm thanh!");
				} else {
					interaction.reply({ content: "❌ Bot chưa kết nối!", flags: 64 });
				}
				break;
			}
		}
	} catch (error) {
		console.error("Lỗi Interaction:", error);
		if (interaction.replied || interaction.deferred) {
			interaction.editReply("❌ Đã xảy ra lỗi khi xử lý lệnh này!").catch(() => null);
		} else {
			interaction.reply({ content: "❌ Đã xảy ra lỗi khi xử lý lệnh này!", flags: 64 }).catch(() => null);
		}
	}
});

client.login(process.env.DISCORD_TOKEN);
