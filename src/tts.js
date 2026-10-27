/**
 * TTS Provider - Chuyển văn bản thành âm thanh để phát trên Discord voice.
 *
 * Thứ tự ưu tiên nguồn âm thanh:
 *  1. espeak-ng (command line) - nếu có sẵn trên hệ thống, tạo WAV trực tiếp.
 *  2. Web TTS API (Google Translate) - tải MP3 qua HTTP.
 *  3. Fallback - tạo tiếng bip (beep) dạng PCM thô để lệnh vẫn hoạt động.
 *
 * Trả về một ReadableStream chứa dữ liệu âm thanh (PCM 16-bit stereo 48kHz
 * đã sẵn s feeding trực tiếp vào @discordjs/voice AudioPlayer, hoặc stream
 * được decode bởi ffmpeg qua createFFmpegAudioResource).
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');

const streamPipeline = promisify(pipeline);

/**
 * Tạo âm thanh bip (beep) đơn giản dưới dạng PCM 16-bit stereo 48kHz.
 * Dùng làm fallback khi không có nguồn TTS nào khác.
 */
function createBeepPcm(durationMs = 800) {
  const sampleRate = 48000;
  const channels = 2;
  const frameSize = 2; // 16-bit = 2 bytes per sample per channel
  const totalSamples = Math.floor((sampleRate * durationMs) / 1000);
  const buffer = Buffer.alloc(totalSamples * channels * frameSize);

  const frequency = 440; // A4
  const volume = 0.15;
  const twoPi = 2 * Math.PI;

  let offset = 0;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(twoPi * frequency * t) * volume;
    const intSample = Math.floor(sample * 32767);
    const left = Buffer.alloc(2);
    left.writeInt16LE(intSample, 0);
    const right = Buffer.alloc(2);
    right.writeInt16LE(intSample, 0);
    left.copy(buffer, offset);
    offset += 2;
    right.copy(buffer, offset);
    offset += 2;
  }
  return buffer;
}

/**
 * Chạy espeak-ng để tạo WAV từ văn bản, trả về Buffer dữ liệu WAV.
 */
async function espeakSynthesize(text, lang = 'vi') {
  return new Promise((resolve, reject) => {
    const espeakCmd = process.env.ESPEAK_CMD || 'espeak-ng';
    const child = spawn(espeakCmd, [
      '-v', lang,
      '-s', '150',
      '-w', '-', // ghi ra stdout
      text,
    ]);

    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', () => {}); // bỏ qua stderr
    child.on('close', (code) => {
      if (code !== 0 || chunks.length === 0) {
        reject(new Error(`espeak-ng exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    child.on('error', reject);
  });
}

/**
 * Tải MP3 từ Google Translate TTS.
 */
async function webTtsSynthesize(text, lang = 'vi') {
  const fetch = globalThis.fetch;
  const encodedText = encodeURIComponent(text.slice(0, 200));
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=${lang}&client=tw-ob`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Web TTS failed: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Chuyển WAV buffer thành PCM 16-bit stereo 48kHz (đầu ra thuần clesan cho voice).
 * Nếu không có ffmpeg, đây là bước tối giản: chỉ cắt bỏ header WAV (44 bytes)
 * và giả định dữ liệu bên trong đã là PCM 16-bit mono, sau đó upsample lên stereo.
 */
function wavToPcmStereo(wavBuffer) {
  // WAV header thường 44 bytes. Dữ liệu PCM bắt đầu sau data chunk.
  // Tìm vị trí "data" chunk.
  let dataOffset = 44;
  for (let i = 12; i < wavBuffer.length - 4; i++) {
    if (
      wavBuffer[i] === 0x64 &&
      wavBuffer[i + 1] === 0x61 &&
      wavBuffer[i + 2] === 0x74 &&
      wavBuffer[i + 3] === 0x61
    ) {
      dataOffset = i + 8;
      break;
    }
  }

  const pcmMono = wavBuffer.slice(dataOffset);
  const sampleRate = 48000;
  const channels = 2;
  const frameSize = 2;
  const outputSamples = Math.floor((sampleRate * pcmMono.length / 2) / 44100); // rough resample 44100->48000
  const output = Buffer.alloc(outputSamples * channels * frameSize);

  let outOffset = 0;
  const step = pcmMono.length / 2 / outputSamples;
  for (let i = 0; i < outputSamples; i++) {
    const srcIdx = Math.floor(i * step) * 2;
    const value = pcmMono.readInt16LE(srcIdx);
    const left = Buffer.alloc(2);
    left.writeInt16LE(value, 0);
    const right = Buffer.alloc(2);
    right.writeInt16LE(value, 0);
    left.copy(output, outOffset);
    outOffset += 2;
    right.copy(output, outOffset);
    outOffset += 2;
  }
  return output;
}

class TtsProvider {
  constructor(options = {}) {
    this.defaultLang = options.defaultLang || 'vi';
    this.interrupt = options.interrupt !== false;
    this.volume = options.volume ?? 100;
    this.maxTimeTts = options.maxTimeTts ?? 60000;
  }

  /**
   * Tạo audio resource từ văn bản.
   * Trả về { resource, type } where type in ['pcm','ffmpeg','fallback']
   * resource là đối tượng phù hợp để truyền vào AudioPlayer.play()
   */
  async synthesize(text, lang = this.defaultLang) {
    // Thử espeak-ng trước
    try {
      const wav = await espeakSynthesize(text, lang);
      const pcm = wavToPcmStereo(wav);
      return {
        type: 'pcm',
        buffer: pcm,
      };
    } catch (_err) {
      // espeak không có, tiếp tục
    }

    // Thử web TTS
    try {
      const mp3 = await webTtsSynthesize(text, lang);
      return {
        type: 'ffmpeg',
        buffer: mp3,
        mime: 'audio/mpeg',
      };
    } catch (_err) {
      // web TTS không dùng được, tiếp tục
    }

    // Không có nguồn TTS nào khả dụng — ném lỗi rõ ràng
    throw new Error('Không có nguồn TTS khả dụng. Vui lòng cài espeak-ng trên hệ thống hoặc kiểm tra kết nối mạng.');
  }
}

module.exports = { TtsProvider, createBeepPcm, espeakSynthesize, webTtsSynthesize, wavToPcmStereo };
