/**
 * Lệnh /resume - Tiếp tục phát sau khi tạm dừng.
 */

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'resume',
  description: 'Tiếp tục phát nhạc.',
  async execute(interaction, manager) {
    await interaction.deferReply();

    const player = manager.get(interaction.guild.id);
    if (!player || !player.currentTrack) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Lỗi')
            .setDescription('Không có bài nào để tiếp tục.'),
        ],
      });
    }

    const ok = player.resume();
    if (!ok) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Lỗi')
            .setDescription('Nhạc không ở trạng thái tạm dừng.'),
        ],
      });
    }

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('▶️ Tiếp tục')
          .setDescription(`Đang phát: **${player.currentTrack.title}**`),
      ],
    });
  },
};
