require("dotenv").config();

const { PlayerManager } = require("ziplayer");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const { SoundCloudPlugin, YouTubePlugin, SpotifyPlugin, TTSPlugin } = require("@ziplayer/plugin");
const { voiceExt, lyricsExt } = require("@ziplayer/extension");

const prefix = "/";

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
	],
});

const lrc = new lyricsExt(null, {
	includeSynced: true,
	autoFetchOnTrackStart: true,
	sanitizeTitle: true,
});

const manager = new PlayerManager({
	plugins: [
		new TTSPlugin({ defaultLang: "en" }),
		new YouTubePlugin(),
		new SoundCloudPlugin(),
		new SpotifyPlugin(),
	],
	extensions: [
		lrc,
		new voiceExt(null, {
			client: client,
			ignoreBots: true,
			lang: "en-US",
			minimalVoiceMessageDuration: 1,
		}),
	],
	autoCleanup: true,
	extractorTimeout: 30000,
	enableSearchCache: true,
	enableStatsCollection: false,
});

// ==================== Sự Kiện ====================

manager.on("trackStart", (player, track) => {
	const channel = player?.userdata?.channel;
	if (channel) {
		const embed = new EmbedBuilder()
			.setColor("#FF0000")
			.setTitle("🎵 Đang Phát")
			.setDescription(`**${track.title}**`)
			.setThumbnail(track.thumbnail)
			.setURL(track.url);

		if (track.duration) {
			embed.addFields({
				name: "Thời Lượng",
				value: `${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, "0")}`,
				inline: true,
			});
		}

		if (track.requestedBy) {
			embed.addFields({
				name: "Yêu Cầu Bởi",
				value: `<@${track.requestedBy}>`,
				inline: true,
			});
		}

		channel.send({ embeds: [embed] });
	}
});

manager.on("queueAdd", (player, track) => {
	const channel = player?.userdata?.channel;
	if (channel) channel.send(`✅ Đã thêm vào hàng đợi: **${track.title}**`);
});

manager.on("trackEnd", (player, track) => {
	console.log(`⏹️ Kết thúc: ${track.title}`);
});

manager.on("playerError", (player, error, track) => {
	console.error(`[LỖI] ${track?.title}:`, error.message);
	const channel = player?.userdata?.channel;
	if (channel) channel.send(`❌ Lỗi phát **${track?.title}**: ${error.message}`);
});

manager.on("ttsStart", (player, { track }) => {
	const channel = player?.userdata?.channel;
	if (channel) channel.send(`🎤 TTS: ${track?.title || "<inline>"}`);
});

manager.on("ttsEnd", (player) => {
	const channel = player?.userdata?.channel;
	if (channel) channel.send(`✅ TTS kết thúc, tiếp tục phát nhạc`);
});

manager.on("voiceCreate", async (player, evt) => {
	const lowerContent = evt.content.toLowerCase();
	const channel = player?.userdata?.channel;
	const userTag = evt.user?.tag || evt.userId;

	if (channel) channel.send(`🎤 **${userTag}**: ${evt.content}`);

	const currentTrack = player.currentTrack;
	const isRequester = currentTrack?.requestedBy === evt.userId;

	const commands = {
		"skip|next|bỏ qua": () => {
			if (!isRequester) {
				channel.send(`❌ Chỉ <@${currentTrack.requestedBy}> (người phát nhạc) mới có thể skip!`);
				return;
			}
			player.skip();
			channel.send("⏭️ | Đã bỏ qua bài hát hiện tại");
		},
		"pause|tạm dừng": () => {
			player.pause();
			channel.send("⏸️ | Đã tạm dừng nhạc");
		},
		"resume|tiếp tục": () => {
			player.resume();
			channel.send("▶️ | Đã tiếp tục phát nhạc");
		},
		"stop|dừng|ngưng|disconnect": () => {
			if (!isRequester) {
				channel.send(`❌ Chỉ <@${currentTrack.requestedBy}> (người phát nhạc) mới có thể stop!`);
				return;
			}
			player.destroy();
			channel.send("⏹️ | Đã dừng và rời khỏi kênh thoại");
		},
		"volume|âm lượng": () => {
			const volumeMatch = lowerContent.match(/\d+/);
			if (volumeMatch) {
				const vol = parseInt(volumeMatch[0]);
				if (vol >= 0 && vol <= 100) {
					player.setVolume(vol);
					channel.send(`🔊 | Đã đặt âm lượng: **${vol}%**`);
				}
			} else {
				channel.send(`🔊 | Âm lượng hiện tại: **${player.volume}%**`);
			}
		},
		"autoplay|tự động": () => {
			player.queue.autoPlay(!player.queue.autoPlay());
			channel.send(`🔁 | Phát tự động: **${player.queue.autoPlay() ? "Bật" : "Tắt"}**`);
		},
	};

	for (const [pattern, action] of Object.entries(commands)) {
		if (lowerContent.match(new RegExp(pattern))) {
			await action();
			return;
		}
	}
});

manager.on("lyricsChange", async (player, track, result) => {
	if (result.current) {
		const msg = [
			result.previous ? `Trước: ${result.previous}` : null,
			`Hiện tại: **${result.current}**`,
			result.next ? `Tiếp theo: ${result.next}` : null,
		]
			.filter(Boolean)
			.join("\n");

		try {
			if (player?.userdata?.lrcmess) {
				await player.userdata.lrcmess.edit(msg);
			} else {
				const lrcmess = await player?.userdata?.channel?.send({ content: msg });
				player.userdata.lrcmess = lrcmess;
			}
		} catch (e) {
			console.log("Lỗi cập nhật lời bài hát:", e);
		}
	}
});

manager.on("debug", console.log);

// ==================== Discord Client ====================

client.once("ready", () => {
	console.log(`✅ Bot đã đăng nhập: ${client.user.tag}`);
	client.user.setActivity("/help để xem lệnh", { type: "LISTENING" });
});

// ==================== Hàm Kiểm Tra Quyền ====================
const canControlPlayer = (message, player) => {
	const currentTrack = player?.currentTrack;
	if (!currentTrack) return true;
	return currentTrack.requestedBy === message.author.id;
};

const getRequesterInfo = (player) => {
	const currentTrack = player?.currentTrack;
	if (!currentTrack) return "Không xác định";
	return `<@${currentTrack.requestedBy}>`;
};

client.on("messageCreate", async (message) => {
	if (message.author.bot || !message.guild) return;
	if (!message.content.startsWith(prefix)) return;

	const args = message.content.slice(prefix.length).trim().split(/ +/g);
	const command = args.shift().toLowerCase();

	try {
		const ensurePlayer = async () => {
			let player = manager.get(message.guildId);
			if (!player) {
				player = await manager.create(message.guildId, {
					userdata: { channel: message.channel },
					tts: { createPlayer: true, interrupt: true, volume: 50 },
					extensions: ["voiceExt", "lyricsExt"],
					leaveOnEmpty: true,
					leaveOnEnd: true,
					leaveTimeout: 30000,
				});
			}
			player.userdata = player.userdata || {};
			player.userdata.channel = message.channel;
			return player;
		};

		switch (command) {
			case "play": {
				if (!message.member.voice.channel) {
					return message.reply("❌ Bạn phải tham gia kênh thoại");
				}

				const query = args.join(" ");
				if (!query) {
					return message.reply("❌ Vui lòng cung cấp tên bài hát hoặc URL");
				}

				const player = await ensurePlayer();
				if (!player.connection) {
					await player.connect(message.member.voice.channel);
				}

				await message.reply(`🔍 Đang tìm kiếm: **${query}**...`);
				const success = await player.play(query, message.author.id);

				if (!success) {
					message.reply(`❌ Không tìm thấy kết quả cho **${query}**`);
				}
				break;
			}

			case "tts": {
				if (!message.member.voice.channel) {
					return message.reply("❌ Bạn phải tham gia kênh thoại");
				}

				const text = args.join(" ");
				if (!text) {
					return message.reply("❌ Vui lòng cung cấp văn bản để phát");
				}

				const player = await ensurePlayer();
				if (!player.connection) {
					await player.connect(message.member.voice.channel);
				}

				await player.play(`tts:${text}`, message.author.id);
				break;
			}

			case "join": {
				if (!message.member.voice.channel) {
					return message.reply("❌ Bạn phải tham gia kênh thoại");
				}

				const player = await ensurePlayer();
				await player.connect(message.member.voice.channel);
				message.reply("✅ Bot đã tham gia kênh thoại");
				break;
			}

			case "leave":
			case "disconnect": {
				const player = manager.get(message.guildId);
				if (!player) {
					return message.reply("❌ Bot không kết nối với kênh thoại");
				}

				player.destroy();
				message.reply("👋 Bot đã rời khỏi kênh thoại");
				break;
			}

			case "skip":
			case "next": {
				const player = manager.get(message.guildId);
				if (!player?.isPlaying) {
					return message.reply("❌ Không có nhạc đang phát");
				}

				// Kiểm tra quyền
				if (!canControlPlayer(message, player)) {
					return message.reply(`❌ Chỉ ${getRequesterInfo(player)} (người phát nhạc) mới có thể skip!`);
				}

				player.skip();
				message.reply("⏭️ Đã bỏ qua bài hát hiện tại");
				break;
			}

			case "pause": {
				const player = manager.get(message.guildId);
				if (!player?.isPlaying) {
					return message.reply("❌ Không có nhạc đang phát");
				}

				if (player.isPaused) {
					return message.reply("❌ Nhạc đã được tạm dừng");
				}

				player.pause();
				message.reply("⏸️ Đã tạm dừng nhạc");
				break;
			}

			case "resume": {
				const player = manager.get(message.guildId);
				if (!player?.isPaused) {
					return message.reply("❌ Nhạc không được tạm dừng");
				}

				player.resume();
				message.reply("▶️ Đã tiếp tục phát nhạc");
				break;
			}

			case "stop": {
				const player = manager.get(message.guildId);
				if (!player) {
					return message.reply("❌ Không có nhạc đang phát");
				}

				// Kiểm tra quyền
				if (!canControlPlayer(message, player)) {
					return message.reply(`❌ Chỉ ${getRequesterInfo(player)} (người phát nhạc) mới có thể stop!`);
				}

				player.stop();
				message.reply("⏹️ Đã dừng phát nhạc và xóa hàng đợi");
				break;
			}

			case "volume": {
				const player = manager.get(message.guildId);
				if (!player) {
					return message.reply("❌ Không có nhạc đang phát");
				}

				if (!args[0]) {
					return message.reply(`🔊 Âm lượng hiện tại: **${player.volume}%**`);
				}

				const vol = parseInt(args[0]);
				if (isNaN(vol) || vol < 0 || vol > 200) {
					return message.reply("❌ Âm lượng phải từ 0 đến 200");
				}

				player.setVolume(vol);
				message.reply(`🔊 Đã đặt âm lượng: **${vol}%**`);
				break;
			}

			case "nowplaying":
			case "np": {
				const player = manager.get(message.guildId);
				if (!player?.currentTrack) {
					return message.reply("❌ Không có nhạc đang phát");
				}

				const track = player.currentTrack;
				const progress = player.getProgressBar({ size: 15 });
				const time = player.getTime();

				const embed = new EmbedBuilder()
					.setColor("#FF0000")
					.setTitle("🎵 Đang Phát")
					.setDescription(`**${track.title}**`)
					.setThumbnail(track.thumbnail)
					.setURL(track.url)
					.addFields({
						name: "Tiến Độ",
						value: `\`${progress}\`\n${time.formatted.current} / ${time.formatted.total}`,
					})
					.addFields({
						name: "Người Phát",
						value: `<@${track.requestedBy}>`,
						inline: true,
					});

				message.reply({ embeds: [embed] });
				break;
			}

			case "queue": {
				const player = manager.get(message.guildId);
				if (!player) {
					return message.reply("❌ Không có nhạc đang phát");
				}

				const current = player.currentTrack;
				const upcoming = player.upcomingTracks.slice(0, 10);

				const embed = new EmbedBuilder()
					.setColor("#FF0000")
					.setTitle("🎵 Hàng Đợi")
					.addFields({
						name: "Đang Phát",
						value: current ? `**${current.title}**\nPhát bởi: <@${current.requestedBy}>` : "Không có",
					})
					.addFields({
						name: `Tiếp Theo (${player.queueSize})`,
						value:
							upcoming.length > 0
								? upcoming.map((t, i) => `${i + 1}. ${t.title}`).join("\n")
								: "Hàng đợi trống",
					});

				message.reply({ embeds: [embed] });
				break;
			}

			case "loop": {
				const player = manager.get(message.guildId);
				if (!player) {
					return message.reply("❌ Không có nhạc đang phát");
				}

				const mode = args[0]?.toLowerCase() || "off";
				if (!["off", "track", "queue"].includes(mode)) {
					return message.reply("❌ Chế độ lặp phải là: off, track, hoặc queue");
				}

				player.loop(mode);
				const modeNames = { off: "Tắt", track: "Lặp bài", queue: "Lặp hàng đợi" };
				message.reply(`🔁 Chế độ lặp: **${modeNames[mode]}**`);
				break;
			}

			case "shuffle": {
				const player = manager.get(message.guildId);
				if (!player) {
					return message.reply("❌ Không có nhạc đang phát");
				}

				player.shuffle();
				message.reply("🔀 Đã xáo trộn hàng đợi");
				break;
			}

			case "autoplay": {
				const player = manager.get(message.guildId);
				if (!player) {
					return message.reply("❌ Không có nhạc đang phát");
				}

				const current = player.queue.autoPlay();
				player.queue.autoPlay(!current);
				message.reply(`🔁 Phát Tự Động: **${!current ? "Bật" : "Tắt"}**`);
				break;
			}

			case "search": {
				const query = args.join(" ");
				if (!query) {
					return message.reply("❌ Vui lòng cung cấp từ khóa tìm kiếm");
				}

				const results = await manager.search(query);
				if (!results || results.length === 0) {
					return message.reply(`❌ Không tìm thấy kết quả cho **${query}**`);
				}

				const embed = new EmbedBuilder()
					.setColor("#FF0000")
					.setTitle(`🔍 Kết Quả Tìm Kiếm: "${query}"`)
					.setDescription(results.slice(0, 10).map((t, i) => `${i + 1}. ${t.title}`).join("\n"));

				message.reply({ embeds: [embed] });
				break;
			}

			case "help": {
				const embed = new EmbedBuilder()
					.setColor("#FF0000")
					.setTitle("🎵 Trợ Giúp Bot Nhạc")
					.addFields(
						{ 
							name: "🎵 Phát Nhạc", 
							value: "`/play <tìm kiếm>` - Phát bài hát\n`/tts <văn bản>` - Phát âm thanh văn bản\n`/skip` - Bỏ qua bài (chỉ người phát)\n`/pause` - Tạm dừng\n`/resume` - Tiếp tục\n`/stop` - Dừng (chỉ người phát)" 
						},
						{ 
							name: "📜 Hàng Đợi", 
							value: "`/queue` - Hiển thị hàng đợi\n`/nowplaying` - Bài đang phát\n`/loop [off|track|queue]` - Chế độ lặp\n`/shuffle` - Xáo trộn\n`/autoplay` - Phát tự động" 
						},
						{ 
							name: "⚙️ Cài Đặt", 
							value: "`/volume [0-200]` - Điều chỉnh âm lượng\n`/search <tìm kiếm>` - Tìm kiếm bài hát" 
						},
						{ 
							name: "🔌 Kết Nối", 
							value: "`/join` - Bot tham gia kênh thoại\n`/leave` - Bot rời kênh thoại" 
						},
					)
					.setFooter({ text: "⚠️ Chỉ người phát nhạc mới có thể skip hoặc stop!" });

				message.reply({ embeds: [embed] });
				break;
			}

			default:
				message.reply(`❌ Lệnh không tồn tại: **${command}**. Sử dụng \`/help\` để xem danh sách.`);
		}
	} catch (error) {
		console.error("Lỗi lệnh:", error);
		message.reply(`❌ Có lỗi xảy ra: ${error.message}`);
	}
});

client.login(process.env.DISCORD_TOKEN);

process.on("uncaughtException", (error) => {
	console.error("Ngoại lệ không được xử lý:", error);
});

process.on("unhandledRejection", (error) => {
	console.error("Promise bị từ chối:", error);
});