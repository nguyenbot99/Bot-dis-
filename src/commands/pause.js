/**
 * Lệnh /pause - Tạm duspend phát.
 */

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'pause',
  description: 'Tạm dừng phát nhạc.',
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

    const ok = player.pause();
    if (!ok) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Lỗi')
            .setDescription('Nhạc đang được tạm dừng hoặc không phát.'),
        ],
      });
    }

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffff00)
          .setTitle('⏸️ Tạm dừng')
          .setDescription(`Đã tạm dừng: **${player.currentTrack.title}**`),
      ],
    });
  },
};
