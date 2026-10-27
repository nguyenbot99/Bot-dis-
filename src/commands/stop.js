/**
 * Lệnh /stop - Dừng phát và xóa hàng đợi.
 */

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'stop',
  description: 'Dừng phát nhạc và xóa hàng đợi.',
  async execute(interaction, manager) {
    await interaction.deferReply();

    const player = manager.get(interaction.guild.id);
    if (!player || !player.currentTrack) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Lỗi')
            .setDescription('Không có bài nào đang phát.'),
        ],
      });
    }

    player.stop();

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('⏹️ Dừng phát')
          .setDescription('Đã dừng nhạc và xóa hàng đợi.'),
      ],
    });
  },
};
