require("dotenv").config();

const { PlayerManager } = require("ziplayer");
const { Client, GatewayIntentBits } = require("discord.js");
const { YouTubePlugin, SpotifyPlugin, SoundCloudPlugin, TTSPlugin } = require("@ziplayer/plugin");

const prefix = "/";

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.MessageContent,
	],
});

// ==================== MANAGER (YouTube + Spotify + SoundCloud + TTS) ====================
const manager = new PlayerManager({
	plugins: [
		new YouTubePlugin(),
		new SpotifyPlugin(),
		new SoundCloudPlugin(), // ✅ Thêm SoundCloud
		new TTSPlugin({ defaultLang: "vi" }), // ✅ Thêm TTS
	],
	autoCleanup: true,
	extractorTimeout: 18000, // ✅ Giảm timeout để tránh hang
	enableSearchCache: true,
	enableStatsCollection: false,
	// ✅ Thêm cấu hình để tránh lỗi
	retryOnFail: true,
});

// ==================== SỰ KIỆN ====================

manager.on("trackStart", (player, track) => {
	const ch = player?.userdata?.ch;
	if (ch) {
		ch.send(`🎵 **${track.title}**`).catch(() => {});
	}
});

manager.on("trackEnd", (player, track) => {
	console.log(`⏹️ ${track?.title}`);
});

manager.on("playerError", (player, error, track) => {
	console.error(`❌ ${track?.title}:`, error.message);
	const ch = player?.userdata?.ch;
	if (ch) ch.send(`❌ Lỗi: ${error.message}`).catch(() => {});
});

// ==================== DISCORD CLIENT ====================

client.once("ready", () => {
	console.log(`✅ Bot: ${client.user.tag}`);
	console.log("🎵 Hỗ trợ: YouTube • Spotify • SoundCloud • TTS");
	client.user.setActivity("/help", { type: "LISTENING" });
});

// ==================== HÀM ====================

const canControl = (msg, player) => {
	const track = player?.currentTrack;
	return !track || track.requestedBy === msg.author.id;
};

const getPlayer = async (guildId, channel) => {
	let p = manager.get(guildId);
	if (!p) {
		try {
			p = await manager.create(guildId, {
				volume: 100,
				leaveOnEmpty: true,
				leaveOnEnd: true,
				leaveTimeout: 60000,
			});
		} catch (e) {
			console.error("Lỗi tạo player:", e);
			return null;
		}
	}
	p.userdata = p.userdata || {};
	p.userdata.ch = channel;
	return p;
};

// ==================== MESSAGE HANDLER ====================

client.on("messageCreate", async (msg) => {
	if (msg.author.bot || !msg.guild || !msg.content.startsWith(prefix)) return;

	const args = msg.content.slice(prefix.length).trim().split(/ +/);
	const cmd = args.shift().toLowerCase();
	const vc = msg.member?.voice?.channel;

	try {
		// PLAY - YouTube/Spotify
		if (cmd === "play" || cmd === "p") {
			if (!vc) return msg.reply("❌ Vào voice");
			const q = args.join(" ");
			if (!q) return msg.reply("❌ `/play <bài hát>`");

			const p = await getPlayer(msg.guildId, msg.channel);
			if (!p) return msg.reply("❌ Lỗi khởi tạo bot");
			
			if (!p.connection) {
				try {
					await p.connect(vc);
				} catch (e) {
					return msg.reply("❌ Không thể kết nối voice");
				}
			}

			const r = await msg.reply("🔎 Tìm...");
			try {
				await p.play(q, msg.author.id);
				await new Promise(x => setTimeout(x, 800));
				const t = p.currentTrack;
				if (t) {
					r.edit(`▶️ **${t.title}**`);
				} else {
					r.edit("❌ Không tìm thấy");
				}
			} catch (e) {
				r.edit("❌ " + e.message).catch(() => {});
			}
		}

		// SCPLAY - SoundCloud
		else if (cmd === "scplay" || cmd === "sc") {
			if (!vc) return msg.reply("❌ Vào voice");
			const q = args.join(" ");
			if (!q) return msg.reply("❌ `/scplay <bài hát>`");

			const p = await getPlayer(msg.guildId, msg.channel);
			if (!p) return msg.reply("❌ Lỗi khởi tạo bot");
			
			if (!p.connection) {
				try {
					await p.connect(vc);
				} catch (e) {
					return msg.reply("❌ Không thể kết nối voice");
				}
			}

			const r = await msg.reply("☁️ Tìm SoundCloud...");
			try {
				// SoundCloud search
				const query = q.startsWith("http") ? q : `scsearch:${q}`;
				await p.play(query, msg.author.id);
				await new Promise(x => setTimeout(x, 800));
				const t = p.currentTrack;
				if (t) {
					r.edit(`▶️ **${t.title}** (SoundCloud)`);
				} else {
					r.edit("❌ Không tìm thấy");
				}
			} catch (e) {
				r.edit("❌ " + e.message).catch(() => {});
			}
		}

		// TTS
		else if (cmd === "tts") {
			if (!vc) return msg.reply("❌ Vào voice");
			const text = args.join(" ");
			if (!text) return msg.reply("❌ `/tts <văn bản>`");

			const p = await getPlayer(msg.guildId, msg.channel);
			if (!p) return msg.reply("❌ Lỗi khởi tạo bot");
			
			if (!p.connection) {
				try {
					await p.connect(vc);
				} catch (e) {
					return msg.reply("❌ Không thể kết nối voice");
				}
			}

			try {
				await p.play(`tts:${text}`, msg.author.id);
				msg.reply("🎤 Phát TTS...");
			} catch (e) {
				msg.reply("❌ " + e.message);
			}
		}

		// JOIN
		else if (cmd === "join") {
			if (!vc) return msg.reply("❌ Vào voice");
			const p = await getPlayer(msg.guildId, msg.channel);
			if (!p) return msg.reply("❌ Lỗi khởi tạo bot");
			
			try {
				if (!p.connection) await p.connect(vc);
				msg.reply("✅ Vào được");
			} catch (e) {
				msg.reply("❌ " + e.message);
			}
		}

		// LEAVE
		else if (cmd === "leave" || cmd === "disconnect") {
			const p = manager.get(msg.guildId);
			if (!p) return msg.reply("❌ Chưa vào");
			try {
				p.destroy();
				msg.reply("👋 Rời");
			} catch (e) {
				msg.reply("❌ " + e.message);
			}
		}

		// PAUSE
		else if (cmd === "pause") {
			const p = manager.get(msg.guildId);
			if (!p?.isPlaying) return msg.reply("❌ Không có nhạc");
			try {
				p.pause();
				msg.reply("⏸️ Tạm dừng");
			} catch (e) {
				msg.reply("❌ " + e.message);
			}
		}

		// RESUME
		else if (cmd === "resume") {
			const p = manager.get(msg.guildId);
			if (!p?.isPaused) return msg.reply("❌ Không dừng");
			try {
				p.resume();
				msg.reply("▶️ Phát");
			} catch (e) {
				msg.reply("❌ " + e.message);
			}
		}

		// SKIP
		else if (cmd === "skip" || cmd === "next") {
			const p = manager.get(msg.guildId);
			if (!p?.currentTrack) return msg.reply("❌ Không có nhạc");
			if (!canControl(msg, p)) return msg.reply("🔒 Chỉ người phát skip");
			try {
				p.skip();
				msg.reply("⏭️ Bỏ qua");
			} catch (e) {
				msg.reply("❌ " + e.message);
			}
		}

		// STOP
		else if (cmd === "stop") {
			const p = manager.get(msg.guildId);
			if (!p) return msg.reply("❌ Không có nhạc");
			if (!canControl(msg, p)) return msg.reply("🔒 Chỉ người phát stop");
			try {
				p.stop();
				msg.reply("⏹️ Dừng");
			} catch (e) {
				msg.reply("❌ " + e.message);
			}
		}

		// VOLUME
		else if (cmd === "volume" || cmd === "vol") {
			const p = manager.get(msg.guildId);
			if (!p) return msg.reply("❌ Không có nhạc");
			if (!args[0]) return msg.reply(`🔊 ${p.volume}%`);
			const v = parseInt(args[0]);
			if (isNaN(v) || v < 0 || v > 200) return msg.reply("❌ 0-200");
			try {
				p.setVolume(v);
				msg.reply(`🔊 ${v}%`);
			} catch (e) {
				msg.reply("❌ " + e.message);
			}
		}

		// NOWPLAYING
		else if (cmd === "np") {
			const p = manager.get(msg.guildId);
			if (!p?.currentTrack) return msg.reply("❌ Không có nhạc");
			const t = p.currentTrack;
			msg.reply(`🎵 **${t.title}**`);
		}

		// QUEUE
		else if (cmd === "queue" || cmd === "q") {
			const p = manager.get(msg.guildId);
			if (!p?.currentTrack) return msg.reply("❌ Không có nhạc");
			const list = (p.upcomingTracks || []).slice(0, 5)
				.map((t, i) => `${i + 1}. ${t.title}`).join("\n") || "Trống";
			msg.reply(`🎵 **${p.currentTrack.title}**\n\n${list}`);
		}

		// LOOP
		else if (cmd === "loop") {
			const p = manager.get(msg.guildId);
			if (!p) return msg.reply("❌ Không có nhạc");
			const m = args[0] || "off";
			if (!["off", "track", "queue"].includes(m)) return msg.reply("❌ off/track/queue");
			try {
				p.loop(m);
				msg.reply(`🔁 ${m}`);
			} catch (e) {
				msg.reply("❌ " + e.message);
			}
		}

		// SHUFFLE
		else if (cmd === "shuffle") {
			const p = manager.get(msg.guildId);
			if (!p) return msg.reply("❌ Không có nhạc");
			try {
				p.shuffle();
				msg.reply("🔀 Xáo");
			} catch (e) {
				msg.reply("❌ " + e.message);
			}
		}

		// AUTOPLAY
		else if (cmd === "autoplay") {
			const p = manager.get(msg.guildId);
			if (!p) return msg.reply("❌ Không có nhạc");
			try {
				if (p.queue && typeof p.queue.autoPlay === "function") {
					const current = p.queue.autoPlay?.();
					p.queue.autoPlay(!current);
					msg.reply(`🔁 Autoplay: **${!current ? "Bật" : "Tắt"}**`);
				} else {
					msg.reply("❌ Không hỗ trợ");
				}
			} catch (e) {
				msg.reply("❌ " + e.message);
			}
		}

		// SEARCH
		else if (cmd === "search") {
			const q = args.join(" ");
			if (!q) return msg.reply("❌ `/search <bài hát>`");
			try {
				const results = await manager.search(q);
				if (!results || results.length === 0) return msg.reply("❌ Không tìm thấy");
				const list = results.slice(0, 5)
					.map((t, i) => `${i + 1}. ${t.title}`)
					.join("\n");
				msg.reply(`🔍 **Kết quả:**\n${list}`);
			} catch (e) {
				msg.reply("❌ " + e.message);
			}
		}

		// HELP
		else if (cmd === "help" || cmd === "h") {
			msg.reply(
				`**🎵 BOT NHẠC - YouTube • Spotify • SoundCloud • TTS**\n\n` +
				`**Phát Nhạc:**\n` +
				`/play <tên> - Phát YouTube/Spotify\n` +
				`/scplay <tên> - Phát SoundCloud\n` +
				`/tts <văn bản> - Phát âm thanh\n` +
				`/pause - Tạm dừng\n` +
				`/resume - Phát tiếp\n` +
				`/skip - Bỏ qua\n` +
				`/stop - Dừng\n\n` +
				`**Hàng Đợi:**\n` +
				`/queue - Xem hàng\n` +
				`/loop [off|track|queue] - Lặp\n` +
				`/shuffle - Xáo\n` +
				`/np - Bài đang phát\n` +
				`/search <tên> - Tìm\n\n` +
				`**Khác:**\n` +
				`/volume <0-200> - Âm lượng\n` +
				`/autoplay - Phát tự động\n` +
				`/join - Vào voice\n` +
				`/leave - Rời voice`
			);
		}

		else {
			msg.reply("❌ Lệnh không tồn tại. `/help`");
		}

	} catch (error) {
		console.error("Error:", error);
		msg.reply("❌ Lỗi").catch(() => {});
	}
});

client.login(process.env.DISCORD_TOKEN);

process.on("uncaughtException", (err) => console.error("Uncaught:", err));
process.on("unhandledRejection", (err) => console.error("Rejection:", err));
