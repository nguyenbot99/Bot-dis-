/**
 * Per-guild Player - Quản lý hàng đợi và phát âm thanh cho mỗi máy chủ Discord.
 * Tham khảo kiến trúc ZiPlayer: PlayerManager -> Player (per guild) -> Queue.
 */

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  NoSubscriberBehavior,
} = require('@discordjs/voice');

const { TtsProvider } = require('./tts');

const QUEUE_MAX = 200;

// Trạng thái loop: 0 = tắt, 1 = loop bài hiện tại, 2 = loop toàn bộ hàng đợi
const LOOP_OFF = 0;
const LOOP_TRACK = 1;
const LOOP_QUEUE = 2;

class Track {
  constructor({ title, url, source, requestedBy, duration, type = 'audio' }) {
    this.title = title;
    this.url = url;
    this.source = source; // 'youtube', 'tts', 'file', etc.
    this.requestedBy = requestedBy;
    this.duration = duration; // milliseconds
    this.type = type;
    this.createdAt = Date.now();
  }
}

class GuildPlayer {
  constructor(guildId, options = {}) {
    this.guildId = guildId;
    this.textChannel = options.textChannel || null;
    this.leaveOnEnd = options.leaveOnEnd !== false;
    this.volume = options.volume ?? 100;

    this.queue = [];
    this.history = [];
    this.currentTrack = null;
    this.loopMode = LOOP_OFF;
    this.isPaused = false;

    this.connection = null;
    this.player = null;
    this.subscriber = null;

    this.tts = new TtsProvider({
      defaultLang: options.defaultLang || 'vi',
      interrupt: options.ttsInterrupt !== false,
      volume: options.ttsVolume ?? 100,
      maxTimeTts: options.maxTimeTts ?? 60000,
    });

    this._bindPlayerEvents();
  }

  _bindPlayerEvents() {
    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });

    this.player.on(AudioPlayerStatus.Idle, () => this._onIdle());
    this.player.on('error', (error) => {
      console.error(`[Player ${this.guildId}] Audio player error:`, error.message);
      this._onIdle();
    });
  }

  /**
   * Kết nối vào voice channel.
   */
  connect(voiceChannel) {
    if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      return this.connection;
    }

    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    this.connection.subscribe(this.player);

    entersState(this.connection, VoiceConnectionStatus.Ready, 30e3).catch((err) => {
      console.error(`[Player ${this.guildId}] Voice connection failed:`, err.message);
      this.destroy();
    });

    return this.connection;
  }

  /**
   * Thêm bài vào hàng đợi.
   */
  add(track) {
    if (this.queue.length >= QUEUE_MAX) {
      throw new Error('Hàng đợi đã đầy (tối đa 200 bài).');
    }
    this.queue.push(track);
    return this.queue.length - 1;
  }

  /**
   * Thêm nhiều bài.
   */
  addMultiple(tracks) {
    const indices = [];
    for (const track of tracks) {
      indices.push(this.add(track));
    }
    return indices;
  }

  /**
   * Phát TTS (có thể gián đoạn bài hiện tại nếu interrupt bật).
   */
  async speak(text, lang, options = {}) {
    const { interrupt = this.tts.interrupt, force = false } = options;

    const result = await this.tts.synthesize(text, lang);

    let resource;
    if (result.type === 'pcm') {
      resource = createAudioResource(result.buffer, {
        inputType: 'raw',
        inlineVolume: true,
      });
    } else {
      // ffmpeg stream (MP3) - cần ffmpeg trên hệ thống
      const stream = require('stream').Readable.from([result.buffer]);
      resource = createAudioResource(stream, {
        inlineVolume: true,
      });
    }

    if (resource.volume) {
      resource.volume.setVolume(this.tts.volume / 100);
    }

    if (interrupt && this.player.state.status !== AudioPlayerStatus.Idle) {
      this.player.stop(true);
    }

    this.player.play(resource);
    this.currentTrack = new Track({
      title: `🔊 TTS: ${text.slice(0, 60)}`,
      source: 'tts',
      requestedBy: options.requestedBy || 'system',
      duration: this.tts.maxTimeTts,
      type: 'tts',
    });

    return this.currentTrack;
  }

  /**
   * Phát bài tiếp theo trong hàng đợi.
   */
  async playNext() {
    // Xử lý loop
    if (this.loopMode === LOOP_TRACK && this.currentTrack) {
      // loop bài hiện tại: giữ nguyên, chơi lại
      this._playTrack(this.currentTrack);
      return this.currentTrack;
    }

    if (this.queue.length === 0) {
      this.currentTrack = null;
      if (this.leaveOnEnd) {
        setTimeout(() => {
          if (!this.player.state.status || this.player.state.status === AudioPlayerStatus.Idle) {
            this.destroy();
          }
        }, 30000);
      }
      return null;
    }

    let track = this.queue.shift();
    if (this.loopMode === LOOP_QUEUE) {
      this.queue.push({ ...track });
    }
    this.history.push(track);

    this._playTrack(track);
    return track;
  }

  _playTrack(track) {
    this.currentTrack = track;
    this.isPaused = false;

    let resource;
    if (track.type === 'tts') {
      // TTS đã được xử lý trong speak()
      return;
    }

    // Mặc định: tạo resource từ URL/stream. Nếu có ffmpeg, dùng createFFmpegAudioResource.
    // Ở đây tạo resource trống để tránh lỗi nếu không có nguồn audio thực tế.
    // Trong triển khai thực tế, bạn sẽ gọi plugin (YouTube, SoundCloud...) để lấy stream.
    const silent = Buffer.alloc(48000 * 2 * 2 * 1); // 1 giây im lặng PCM stereo
    resource = createAudioResource(silent, {
      inputType: 'raw',
      inlineVolume: true,
    });

    if (resource.volume) {
      resource.volume.setVolume(this.volume / 100);
    }

    this.player.play(resource);
  }

  _onIdle() {
    // Khi bài kết thúc tự động, chơi tiếp
    if (this.currentTrack && this.currentTrack.type !== 'tts') {
      this.playNext();
    } else if (this.currentTrack && this.currentTrack.type === 'tts') {
      this.currentTrack = null;
      this.playNext();
    }
  }

  pause() {
    if (this.player && this.player.state.status !== AudioPlayerStatus.Idle && !this.isPaused) {
      this.player.pause();
      this.isPaused = true;
      return true;
    }
    return false;
  }

  resume() {
    if (this.player && this.isPaused) {
      this.player.unpause();
      this.isPaused = false;
      return true;
    }
    return false;
  }

  skip(count = 1) {
    if (count <= 0) return false;
    // Bỏ qua `count` bài tiếp theo, giữ lại bài hiện tại nếu muốn
    const skipped = this.queue.splice(0, count - 1);
    this.player.stop(true);
    return skipped.length;
  }

  stop() {
    this.queue = [];
    this.currentTrack = null;
    if (this.player) this.player.stop(true);
    this.isPaused = false;
  }

  setVolume(volume) {
    this.volume = Math.min(100, Math.max(0, volume));
    if (this.player && this.player.state.resource && this.player.state.resource.volume) {
      this.player.state.resource.volume.setVolume(this.volume / 100);
    }
    return this.volume;
  }

  setLoop(mode) {
    this.loopMode = mode;
    return this.loopMode;
  }

  shuffle() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    return this.queue;
  }

  seek(ms) {
    // @discordjs/voice không hỗ trợ seek trực tiếp trên resource đã play.
    // Cần tạo lại resource từ offset. Để trống, trả về false.
    return false;
  }

  get queueSize() {
    return this.queue.length;
  }

  get isPlaying() {
    return this.player && this.player.state.status === AudioPlayerStatus.Playing;
  }

  destroy() {
    this.stop();
    if (this.player) {
      this.player.stop(true);
      this.player.removeAllListeners();
    }
    if (this.connection) {
      this.connection.destroy();
    }
    this.connection = null;
    this.player = null;
    this.currentTrack = null;
    this.queue = [];
    this.history = [];
  }
}

class PlayerManager {
  constructor(options = {}) {
    this.players = new Map();
    this.options = options;
  }

  create(guildId, options = {}) {
    if (!this.players.has(guildId)) {
      const player = new GuildPlayer(guildId, {
        ...this.options,
        ...options,
      });
      this.players.set(guildId, player);
    }
    return this.players.get(guildId);
  }

  get(guildId) {
    return this.players.get(guildId) || null;
  }

  destroy(guildId) {
    const player = this.players.get(guildId);
    if (player) {
      player.destroy();
      this.players.delete(guildId);
    }
  }
}

module.exports = { PlayerManager, GuildPlayer, Track, LOOP_OFF, LOOP_TRACK, LOOP_QUEUE };
