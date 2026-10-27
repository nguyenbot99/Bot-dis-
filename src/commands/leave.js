/**
 * Lệnh /leave - Ngắt kết nối khỏi kênh voice.
 */

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'leave',
  description: 'Ngắt kết nối bot khỏi kênh voice.',
  async execute(interaction, manager) {
    await interaction.deferReply();

    const player = manager.get(interaction.guild.id);
    if (!player || !player.connection) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Lỗi')
            .setDescription('Bot không đang kết nối kênh voice nào.'),
        ],
      });
    }

    player.destroy();

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('👋 Đã rời kênh')
          .setDescription('Bot đã ngắt kết nối khỏi kênh voice.'),
      ],
    });
  },
};
