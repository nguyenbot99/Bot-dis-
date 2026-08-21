import dotenv from "dotenv";
dotenv.config();

import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ChannelType,
} from "discord.js";
import { PlayerManager } from "ziplayer";
import {
  YouTubePlugin,
  SpotifyPlugin,
} from "@ziplayer/plugin";

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
  ],
});

// ==================== MANAGER ====================

const manager = new PlayerManager({
  plugins: [
    new YouTubePlugin(),
    new SpotifyPlugin(),
  ],
  autoCleanup: true,
  extractorTimeout: 20000,
  enableSearchCache: true,
  enableStatsCollection: false,
});

// ==================== EVENTS ====================

manager.on("trackStart", (player, track) => {
  const ch = player?.userdata?.ch;
  if (ch && track) {
    const embed = new EmbedBuilder()
      .setColor("#FF0000")
      .setTitle("🎵 Đang Phát")
      .setDescription(`**${track.title || "Unknown"}**`)
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

    ch.send({ embeds: [embed] }).catch(() => {});
  }
});

manager.on("playerError", (player, error) => {
  console.error("Player error:", error.message);
  const ch = player?.userdata?.ch;
  if (ch) ch.send(`❌ Lỗi: ${error.message}`).catch(() => {});
});

// ==================== DISCORD CLIENT ====================

client.once("ready", () => {
  console.log(`✅ Bot: ${client.user.tag}`);
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
    });
  }
  p.userdata = p.userdata || {};
  p.userdata.ch = ch;
  return p;
};

// ==================== MESSAGE HANDLER ====================

client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(prefix))
    return;

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
      if (!p.connection) {
        try {
          await p.connect(vc);
        } catch {
          return msg.reply("❌ Không vào được voice");
        }
      }

      const r = await msg.reply("🔎 Tìm...");
      try {
        await p.play(q, msg.author.id);
        await new Promise((x) => setTimeout(x, 1000));
        const t = p.currentTrack;
        if (t) {
          r.edit(`▶️ **${t.title}**`).catch(() => {});
        } else {
          r.edit("❌ Không tìm thấy").catch(() => {});
        }
      } catch (e) {
        r.edit(`❌ ${e.message}`).catch(() => {});
      }
    }

    // JOIN
    else if (cmd === "join") {
      if (!vc) return msg.reply("❌ Vào voice");
      const p = await getPlayer(msg.guildId, msg.channel);
      if (!p.connection) {
        try {
          await p.connect(vc);
        } catch {
          return msg.reply("❌ Không vào được");
        }
      }
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
      if (!canControl(msg, p))
        return msg.reply("🔒 Chỉ người phát được skip");
      p.skip();
      msg.reply("⏭️ Bỏ qua").catch(() => {});
    }

    // STOP
    else if (cmd === "stop") {
      const p = manager.get(msg.guildId);
      if (!p) return msg.reply("❌ Không có nhạc");
      if (!canControl(msg, p))
        return msg.reply("🔒 Chỉ người phát được stop");
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
      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("🎵 Đang Phát")
        .setDescription(`**${t.title}**`)
        .setThumbnail(t.thumbnail);
      msg.reply({ embeds: [embed] }).catch(() => {});
    }

    // QUEUE
    else if (cmd === "queue" || cmd === "q") {
      const p = manager.get(msg.guildId);
      if (!p?.currentTrack) return msg.reply("❌ Không có nhạc");
      const list = (p.upcomingTracks || [])
        .slice(0, 5)
        .map((t, i) => `${i + 1}. ${t.title}`)
        .join("\n") || "Trống";
      msg.reply(`🎵 **${p.currentTrack.title}**\n\n${list}`).catch(
        () => {}
      );
    }

    // HELP
    else if (cmd === "help" || cmd === "h") {
      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("🎵 BOT NHẠC")
        .addFields({
          name: "Phát",
          value:
            "`/play <tên>` - Phát\n" +
            "`/pause` - Tạm dừng\n" +
            "`/resume` - Phát\n" +
            "`/skip` - Bỏ qua\n" +
            "`/stop` - Dừng",
        })
        .addFields({
          name: "Khác",
          value:
            "`/queue` - Hàng đợi\n" +
            "`/np` - Bài đang phát\n" +
            "`/volume` - Âm lượng\n" +
            "`/join` - Vào\n" +
            "`/leave` - Rời",
        });
      msg.reply({ embeds: [embed] }).catch(() => {});
    }

    else {
      msg.reply("❌ `/help`").catch(() => {});
    }
  } catch (error) {
    console.error("Error:", error);
  }
});

client.login(TOKEN);

process.on("uncaughtException", (err) => console.error("Error:", err));
process.on("unhandledRejection", (err) => console.error("Rejection:", err));
