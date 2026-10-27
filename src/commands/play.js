/**
 * Lệnh /play - Thêm bài hát vào hàng đợi và phát.
 * Lưu ý: Without ffmpeg + audio plugin (YouTube/SoundCloud...), lệnh này
 * sẽ tạo entry trong hàng đợi và phát âm thanh im lặng (placeholder).
 * Để phát nhạc thực tế, cần tích hợp plugin audio (yt-dlp / play-dl / etc).
 */

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'play',
  description: 'Thêm bài hát vào hàng đợi và phát.',
  options: [
    {
      type: 3, // STRING
      name: 'query',
      description: 'Tên bài hát hoặc URL',
      required: true,
    },
  ],
  async execute(interaction, manager) {
    await interaction.deferReply();

    const query = interaction.options.getString('query');
    const member = interaction.member;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Lỗi')
            .setDescription('Bạn cần tham gia kênh voice trước khi dùng lệnh /play.'),
        ],
      });
    }

    try {
      const player = manager.create(interaction.guild.id, {
        textChannel: interaction.channel,
        leaveOnEnd: true,
      });

      if (!player.connection) {
        player.connect(voiceChannel);
      }

      const trackIndex = player.add({
        title: query,
        source: 'query',
        requestedBy: interaction.user.id,
        duration: 0,
        type: 'audio',
      });

      // Nếu chưa đang phát gì, bắt đầu ngay
      if (!player.currentTrack && !player.isPlaying) {
        await player.playNext();
      }

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('🎵 Thêm vào hàng đợi')
            .setDescription(`**${query}**`)
            .addFields([
              { name: 'Vị trí', value: `#${trackIndex + 1}`, inline: true },
              { name: 'Kênh voice', value: voiceChannel.name, inline: true },
              { name: 'Yêu cầu bởi', value: `<@${interaction.user.id}>`, inline: true },
            ]),
        ],
      });
    } catch (error) {
      console.error('[/play] error:', error);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Lỗi')
            .setDescription(`Không thể thêm bài: ${error.message}`),
        ],
      });
    }
  },
};
