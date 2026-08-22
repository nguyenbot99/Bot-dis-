require("dotenv").config();
const http = require("http");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { PlayerManager } = require("ziplayer");
const { YouTubePlugin, SoundCloudPlugin, SpotifyPlugin, TTSPlugin } = require("@ziplayer/plugin");
const { voiceExt, lyricsExt, lavalinkExt } = require("@ziplayer/extension");

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
		GatewayIntentBits.MessageContent,
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

const lavalink = new lavalinkExt(null, {
	nodes: [
		{
			identifier: "testlava",
			password: "youshallnotpass",
			host: "5.39.63.207",
			port: 4722,
			secure: false,
		},
	],
	client: client,
	searchPrefix: "scsearch",
});

const voice = new voiceExt(null, { client, lang: "vi-VN" });

// --- 4. PLAYER MANAGER SETUP ---
const manager = new PlayerManager({
	plugins: [
		new TTSPlugin({ defaultLang: "vi" }),
		new YouTubePlugin(),
		new SoundCloudPlugin(),
		new SpotifyPlugin(),
	],
	extensions: [lrc, voice, lavalink],
	autoCleanup: true,
});

// --- 5. EVENT LISTENERS ---
manager.on("trackStart", (player, track) => {
	player.userdata?.channel?.send(`▶ Đang phát: **${track.title}**`);
});

manager.on("queueAdd", (player, track) => {
	player.userdata?.channel?.send(`✅ Đã thêm vào hàng đợi: **${track.title}**`);
});

manager.on("ttsStart", (player, { track }) => {
	player.userdata?.channel?.send(`🗣️ Đang nói TTS: ${track?.title || ""}`);
});

manager.on("lyricsChange", async (player, track, result) => {
	if (result.current) {
		const msg = `🎤 **Lời bài hát:** ${result.current}`;
		player.userdata?.channel?.send(msg).catch(() => null);
	}
});

// Nhận diện giọng nói (Voice Control)
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

client.once("ready", () => {
	console.log(`🤖 Bot đã đăng nhập thành công: ${client.user.tag}`);
});

// --- 6. COMMAND HANDLER ---
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
				tts: { createPlayer: true, interrupt: true, volume: 50 },
				extensions: ["lyricsExt", "voiceExt", "lavalinkExt"],
			});
		} else {
			player.userdata.channel = message.channel;
		}
		return player;
	};

	try {
		switch (command) {
			case "play": {
				if (!args[0]) return message.reply("❌ Cần cung cấp tên bài hát hoặc URL!");
				if (!message.member.voice.channel) return message.reply("❌ Hãy vào kênh thoại trước!");

				const player = await ensurePlayer();
				if (!player.connection) await player.connect(message.member.voice.channel);

				const success = await player.play(args.join(" "), message.author.id);
				if (!success) message.reply("❌ Không tìm thấy kết quả!");
				break;
			}

			case "tts":
			case "say": {
				if (!args[0]) return message.reply("❌ Nhập nội dung cần nói!");
				if (!message.member.voice.channel) return message.reply("❌ Hãy vào kênh thoại trước!");

				const player = await ensurePlayer();
				if (!player.connection) await player.connect(message.member.voice.channel);

				await player.play(`tts:${args.join(" ")}`, message.author.id);
				break;
			}

			case "skip": {
				const player = manager.get(message.guild.id);
				if (!player) return message.reply("❌ Không có nhạc đang phát!");
				player.skip();
				message.reply("⏭️ Đã bỏ qua bài hát!");
				break;
			}

			case "pause": {
				const player = manager.get(message.guild.id);
				if (player) { player.pause(); message.reply("⏸️ Đã tạm dừng!"); }
				break;
			}

			case "resume": {
				const player = manager.get(message.guild.id);
				if (player) { player.resume(); message.reply("▶️ Đã tiếp tục!"); }
				break;
			}

			case "stop":
			case "leave": {
				const player = manager.get(message.guild.id);
				if (player) { player.destroy(); message.reply("👋 Đã rời kênh!"); }
				break;
			}

			case "queue": {
				const player = manager.get(message.guild.id);
				if (!player || !player.currentTrack) return message.reply("❌ Hàng đợi trống!");
				const current = player.currentTrack;
				const list = player.upcomingTracks
					.map((t, i) => `${i + 1}. ${t.title}`)
					.slice(0, 10)
					.join("\n");
				message.reply(`**Đang phát:** ${current.title}\n\n**Danh sách tiếp theo:**\n${list || "Không có bài tiếp theo."}`);
				break;
			}

			case "nowplaying":
			case "np": {
				const player = manager.get(message.guild.id);
				if (!player || !player.currentTrack) return message.reply("❌ Không phát bài nào!");
				const progress = player.getProgressBar();
				message.reply(`▶️ **Đang phát:** ${player.currentTrack.title}\n${progress}`);
				break;
			}

			case "autoplay": {
				const player = manager.get(message.guild.id);
				if (!player) return message.reply("❌ Bot chưa kết nối!");
				const status = !player.queue.autoPlay();
				player.queue.autoPlay(status);
				message.reply(`🔁 Tự động phát: **${status ? "Bật" : "Tắt"}**`);
				break;
			}

			case "volume": {
				const player = manager.get(message.guild.id);
				if (!player) return message.reply("❌ Bot chưa kết nối!");
				if (!args[0]) return message.reply(`🔊 Âm lượng hiện tại: **${player.volume}%**`);
				const vol = parseInt(args[0]);
				if (isNaN(vol) || vol < 0 || vol > 100) return message.reply("❌ Nhập số từ 0-100!");
				player.setVolume(vol);
				message.reply(`🔊 Âm lượng: **${vol}%**`);
				break;
			}

			case "filter": {
				const player = manager.get(message.guild.id);
				if (!player) return message.reply("❌ Bot chưa kết nối!");
				const filterName = args[0];
				if (!filterName) return message.reply("❌ Cần nhập tên filter (vd: `nightcore`, `bassboost`, `vaporwave`)!");
				
				const success = player.filter.applyFilter(filterName);
				if (success) message.reply(`✅ Đã áp dụng filter: **${filterName}**`);
				else message.reply(`❌ Không tìm thấy hoặc không thể áp dụng filter: **${filterName}**`);
				break;
			}

			case "clearfilters": {
				const player = manager.get(message.guild.id);
				if (player) {
					player.filter.clearAll();
					message.reply("✅ Đã gỡ toàn bộ hiệu ứng âm thanh!");
				}
				break;
			}
		}
	} catch (error) {
		console.error("Lỗi:", error);
		message.reply("❌ Đã có lỗi xảy ra khi thực hiện lệnh.");
	}
});

client.login(process.env.DISCORD_TOKEN);
