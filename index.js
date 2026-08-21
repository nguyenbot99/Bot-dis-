import dotenv from "dotenv";
dotenv.config();

import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { PlayerManager } from "ziplayer";
import {
  YouTubePlugin,
  SpotifyPlugin,
  SoundCloudPlugin,
  TTSPlugin,
} from "@ziplayer/plugin";
import { voiceExt, lyricsExt } from "@ziplayer/extension";

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error("❌ Missing DISCORD_TOKEN");
  process.exit(1);
}

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

// ==================== MANAGER ====================

const lrc = new lyricsExt(null, {
  includeSynced: true,
  autoFetchOnTrackStart: true,
  sanitizeTitle: true,
});

const manager = new PlayerManager({
  plugins: [
    new YouTubePlugin(),
    new SpotifyPlugin(),
    new SoundCloudPlugin(),
    new TTSPlugin({ defaultLang: "vi" }),
  ],
  extensions: [
    lrc,
    new voiceExt(null, {
      client: client,
      ignoreBots: true,
      lang: "vi-VN",
    }),
  ],
  autoCleanup: true,
  extractorTimeout: 25000,
  enableSearchCache: true,
  enableStatsCollection: false,
});

// ==================== EVENTS ====================

manager.on("trackStart", (player, track) => {
  const ch = player?.userdata?.ch;
  if (ch) {
    const embed = new EmbedBuilder()
      .setColor("#FF0000")
      .setTitle("🎵 Đang Phát")
      .setDescription(`**${track.title}**`)
      .setThumbnail(track.thumbnail)
      .setURL(track.url);

    if (track.duration) {
      embed.addFields({
        name: "Thời Lượng",
        value: `${Math.floor(track.duration / 60)}:${(track.duration % 60)
          .toString()
          .padStart(2, "0")}`,
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

    ch.send({ embeds: [embed] }).catch(() => {});
  }
});

manager.on("queueAdd", (player, track) => {
  const ch = player?.userdata?.ch;
  if (ch) ch.send(`✅ Đã thêm: **${track.title}**`).catch(() => {});
});

manager.on("playerError", (player, error, track) => {
  console.error(`❌ ${track?.title}:`, error.message);
  const ch = player?.userdata?.ch;
  if (ch) ch.send(`❌ Lỗi: ${error.message}`).catch(() => {});
});

manager.on("ttsStart", (player, { track }) => {
  const ch = player?.userdata?.ch;
  if (ch) ch.send(`🎤 TTS: ${track?.title || "Phát"}`).catch(() => {});
});

manager.on("ttsEnd", (player) => {
  const ch = player?.userdata?.ch;
  if (ch) ch.send(`✅ TTS kết thúc`).catch(() => {});
});

manager.on("voiceCreate", async (player, evt) => {
  const ch = player?.userdata?.ch;
  const lowerContent = evt.content.toLowerCase();
  const currentTrack = player.currentTrack;
  const isRequester = currentTrack?.requestedBy === evt.userId;

  if (ch) ch.send(`🎤 ${evt.user?.tag}: ${evt.content}`).catch(() => {});

  const commands = {
    "skip|bỏ qua|next": () => {
      if (!isRequester) {
        ch.send(`❌ Chỉ <@${currentTrack?.requestedBy}> skip được`).catch(
          () => {}
        );
        return;
      }
      player.skip();
      ch.send("⏭️ Bỏ qua").catch(() => {});
    },
    "pause|tạm dừng": () => {
      player.pause();
      ch.send("⏸️ Tạm dừng").catch(() => {});
    },
    "resume|tiếp tục": () => {
      player.resume();
      ch.send("▶️ Phát").catch(() => {});
    },
    "stop|dừng|ngưng": () => {
      if (!isRequester) {
        ch.send(`❌ Chỉ <@${currentTrack?.requestedBy}> stop được`).catch(
          () => {}
        );
        return;
      }
      player.destroy();
      ch.send("⏹️ Dừng").catch(() => {});
    },
  };

  for (const [pattern, action] of Object.entries(commands)) {
    if (lowerContent.match(new RegExp(pattern))) {
      await action();
      return;
    }
  }
});

// ==================== DISCORD CLIENT ====================

client.once("ready", () => {
  console.log(`✅ Bot: ${client.user.tag}`);
  console.log("🎵 YouTube • Spotify • SoundCloud • TTS • Lyrics • Voice");
  client.user.setActivity("/help", { type: "LISTENING" });
});

// ==================== FUNCTIONS ====================

const canControl = (msg, player) => {
  const track = player?.currentTrack;
  return !track || track.requestedBy === msg.author.id;
};

const getPlayer = async (guildId, ch) => {
  let p = manager.get(guildId);
  if (!p) {
    p = await manager.create(guildId, {
      volume: 100,
      leaveOnEmpty: true,
      leaveOnEnd: true,
      leaveTimeout: 60000,
    });
  }
  p.userdata = p.userdata || {};
  p.userdata.ch = ch;
  return p;
};

// ==================== MESSAGE HANDLER ====================

client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(prefix)) return;

  const args = msg.content.slice(prefix.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();
  const vc = msg.member?.voice?.channel;

  try {
    // PLAY
    if (cmd === "play" || cmd === "p") {
      if (!vc) return msg.reply("❌ Vào voice");
      const q = args.join(" ");
      if (!q) return msg.reply("❌ `/play <bài hát>`");

      const p = await getPlayer(msg.guildId, msg.channel);
      if (!p.connection) await p.connect(vc);

      const r = await msg.reply("🔎 Tìm...");
      try {
        await p.play(q, msg.author.id);
        await new Promise((x) => setTimeout(x, 800));
        const t = p.currentTrack;
        r.edit(t ? `▶️ **${t.title}**` : "❌ Không tìm").catch(() => {});
      } catch (e) {
        r.edit("❌ " + e.message).catch(() => {});
      }
    }

    // SCPLAY
    else if (cmd === "scplay" || cmd === "sc") {
      if (!vc) return msg.reply("❌ Vào voice");
      const q = args.join(" ");
      if (!q) return msg.reply("❌ `/scplay <bài hát>`");

      const p = await getPlayer(msg.guildId, msg.channel);
      if (!p.connection) await p.connect(vc);

      const r = await msg.reply("☁️ Tìm SoundCloud...");
      try {
        const query = q.startsWith("http") ? q : `scsearch:${q}`;
        await p.play(query, msg.author.id);
        await new Promise((x) => setTimeout(x, 800));
        const t = p.currentTrack;
        r.edit(t ? `▶️ **${t.title}**` : "❌ Không tìm").catch(() => {});
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
      if (!p.connection) await p.connect(vc);

      try {
        await p.play(`tts:${text}`, msg.author.id);
        msg.reply("🎤 Phát...").catch(() => {});
      } catch (e) {
        msg.reply("❌ " + e.message).catch(() => {});
      }
    }

    // JOIN
    else if (cmd === "join") {
      if (!vc) return msg.reply("❌ Vào voice");
      const p = await getPlayer(msg.guildId, msg.channel);
      if (!p.connection) await p.connect(vc);
      msg.reply("✅ Vào được").catch(() => {});
    }

    // LEAVE
    else if (cmd === "leave" || cmd === "disconnect") {
      const p = manager.get(msg.guildId);
      if (!p) return msg.reply("❌ Chưa vào");
      p.destroy();
      msg.reply("👋 Rời").catch(() => {});
    }

    // PAUSE
    else if (cmd === "pause") {
      const p = manager.get(msg.guildId);
      if (!p?.isPlaying) return msg.reply("❌ Không có nhạc");
      p.pause();
      msg.reply("⏸️ Tạm dừng").catch(() => {});
    }

    // RESUME
    else if (cmd === "resume") {
      const p = manager.get(msg.guildId);
      if (!p?.isPaused) return msg.reply("❌ Không dừng");
      p.resume();
      msg.reply("▶️ Phát").catch(() => {});
    }

    // SKIP
    else if (cmd === "skip" || cmd === "next") {
      const p = manager.get(msg.guildId);
      if (!p?.currentTrack) return msg.reply("❌ Không có nhạc");
      if (!canControl(msg, p)) return msg.reply("🔒 Chỉ người phát skip");
      p.skip();
      msg.reply("⏭️ Bỏ qua").catch(() => {});
    }

    // STOP
    else if (cmd === "stop") {
      const p = manager.get(msg.guildId);
      if (!p) return msg.reply("❌ Không có nhạc");
      if (!canControl(msg, p)) return msg.reply("🔒 Chỉ người phát stop");
      p.stop();
      msg.reply("⏹️ Dừng").catch(() => {});
    }

    // VOLUME
    else if (cmd === "volume" || cmd === "vol") {
      const p = manager.get(msg.guildId);
      if (!p) return msg.reply("❌ Không có nhạc");
      if (!args[0]) return msg.reply(`🔊 ${p.volume}%`);
      const v = parseInt(args[0]);
      if (isNaN(v) || v < 0 || v > 200) return msg.reply("❌ 0-200");
      p.setVolume(v);
      msg.reply(`🔊 ${v}%`).catch(() => {});
    }

    // NP
    else if (cmd === "np") {
      const p = manager.get(msg.guildId);
      if (!p?.currentTrack) return msg.reply("❌ Không có nhạc");
      const t = p.currentTrack;
      const progress = p.getProgressBar?.({ size: 15 }) || "Unknown";
      const time = p.getTime?.();
      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("🎵 Đang Phát")
        .setDescription(`**${t.title}**`)
        .setThumbnail(t.thumbnail)
        .setURL(t.url)
        .addFields({
          name: "Tiến Độ",
          value: `\`${progress}\`\n${time?.formatted?.current || "00:00"} / ${
            time?.formatted?.total || "00:00"
          }`,
        })
        .addFields({
          name: "Người Phát",
          value: `<@${t.requestedBy}>`,
          inline: true,
        });
      msg.reply({ embeds: [embed] }).catch(() => {});
    }

    // QUEUE
    else if (cmd === "queue" || cmd === "q") {
      const p = manager.get(msg.guildId);
      if (!p?.currentTrack) return msg.reply("❌ Không có nhạc");
      const upcoming = (p.upcomingTracks || []).slice(0, 10);
      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("🎵 Hàng Đợi")
        .addFields({
          name: "Đang Phát",
          value: `**${p.currentTrack.title}**\nPhát bởi: <@${p.currentTrack.requestedBy}>`,
        })
        .addFields({
          name: `Tiếp Theo (${p.queueSize || 0})`,
          value:
            upcoming.length > 0
              ? upcoming.map((t, i) => `${i + 1}. ${t.title}`).join("\n")
              : "Trống",
        });
      msg.reply({ embeds: [embed] }).catch(() => {});
    }

    // LOOP
    else if (cmd === "loop") {
      const p = manager.get(msg.guildId);
      if (!p) return msg.reply("❌ Không có nhạc");
      const m = args[0]?.toLowerCase() || "off";
      if (!["off", "track", "queue"].includes(m)) return msg.reply("❌ off/track/queue");
      p.loop(m);
      const names = { off: "Tắt", track: "Lặp bài", queue: "Lặp hàng đợi" };
      msg.reply(`🔁 ${names[m]}`).catch(() => {});
    }

    // SHUFFLE
    else if (cmd === "shuffle") {
      const p = manager.get(msg.guildId);
      if (!p) return msg.reply("❌ Không có nhạc");
      p.shuffle();
      msg.reply("🔀 Xáo").catch(() => {});
    }

    // SEARCH
    else if (cmd === "search") {
      const q = args.join(" ");
      if (!q) return msg.reply("❌ `/search <bài hát>`");
      try {
        const results = await manager.search(q);
        if (!results || results.length === 0) return msg.reply("❌ Không tìm");
        const embed = new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle(`🔍 Kết Quả: "${q}"`)
          .setDescription(
            results
              .slice(0, 10)
              .map((t, i) => `${i + 1}. ${t.title}`)
              .join("\n")
          );
        msg.reply({ embeds: [embed] }).catch(() => {});
      } catch (e) {
        msg.reply("❌ " + e.message).catch(() => {});
      }
    }

    // HELP
    else if (cmd === "help" || cmd === "h") {
      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("🎵 BOT NHẠC ĐẦY ĐỦ")
        .addFields({
          name: "🎵 Phát Nhạc",
          value:
            "`/play <tên>` - YouTube/Spotify\n" +
            "`/scplay <tên>` - SoundCloud\n" +
            "`/tts <văn bản>` - Phát âm thanh\n" +
            "`/pause` - Tạm dừng\n" +
            "`/resume` - Phát\n" +
            "`/skip` - Bỏ qua\n" +
            "`/stop` - Dừng",
        })
        .addFields({
          name: "📜 Hàng Đợi",
          value:
            "`/queue` - Xem hàng\n" +
            "`/np` - Bài đang phát\n" +
            "`/loop [off|track|queue]` - Lặp\n" +
            "`/shuffle` - Xáo",
        })
        .addFields({
          name: "⚙️ Khác",
          value: "`/volume <0-200>` - Âm lượng\n" +
            "`/search <tên>` - Tìm\n" +
            "`/join` - Vào voice\n" +
            "`/leave` - Rời voice",
        })
        .setFooter({ text: "Voice commands: 'skip', 'pause', 'resume', 'stop'" });
      msg.reply({ embeds: [embed] }).catch(() => {});
    }

    else {
      msg.reply("❌ Lệnh không tồn tại. `/help`").catch(() => {});
    }
  } catch (error) {
    console.error("Error:", error);
    msg.reply("❌ Lỗi").catch(() => {});
  }
});

client.login(TOKEN);

process.on("uncaughtException", (err) => console.error("Uncaught:", err));
process.on("unhandledRejection", (err) => console.error("Rejection:", err));
