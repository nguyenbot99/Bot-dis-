/**
 * Lệnh /tts - Chuyển văn bản thành giọng nói và phát trong voice channel.
 * Tham khảo ZiPlayer: player.play("tts: ..."), chế độ interrupt.
 */

const { EmbedBuilder } = require('discord.js');
const { entersState, VoiceConnectionStatus } = require('@discordjs/voice');

module.exports = {
  name: 'tts',
  description: 'Đọc văn bản bằng giọng nói trong kênh voice.',
  options: [
    {
      type: 3, // STRING
      name: 'text',
      description: 'Văn bản muốn đọc',
      required: true,
    },
    {
      type: 3, // STRING
      name: 'lang',
      description: 'Mã ngôn ngữ (mặc định: vi)',
      required: false,
    },
  ],
  async execute(interaction, manager) {
    await interaction.deferReply();

    const text = interaction.options.getString('text');
    const lang = interaction.options.getString('lang') || 'vi';
    const member = interaction.member;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Lỗi')
            .setDescription('Bạn cần tham gia kênh voice trước khi dùng lệnh /tts.'),
        ],
      });
    }

    try {
      const player = manager.create(interaction.guild.id, {
        textChannel: interaction.channel,
        defaultLang: lang,
        ttsInterrupt: true,
      });

      // Kết nối voice nếu chưa kết nối
      if (!player.connection) {
        player.connect(voiceChannel);
        // Đợi kết nối voice sẵn sàng trước khi phát TTS
        await entersState(player.connection, VoiceConnectionStatus.Ready, 15e3);
      }

      // Phát TTS (gián đoạn bài nhạc hiện tại nếu có)
      await player.speak(text, lang, {
        requestedBy: interaction.user.id,
        interrupt: true,
      });

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('🔊 TTS')
            .setDescription(`Đang đọc: *${text}*`)
            .addFields([
              { name: 'Ngôn ngữ', value: lang, inline: true },
              { name: 'Kênh voice', value: voiceChannel.name, inline: true },
              { name: 'Yêu cầu bởi', value: `<@${interaction.user.id}>`, inline: true },
            ]),
        ],
      });
    } catch (error) {
      console.error('[/tts] error:', error);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Lỗi TTS')
            .setDescription(`Không thể phát TTS: ${error.message}`),
        ],
      });
    }
  },
};
