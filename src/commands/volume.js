/**
 * Lệnh /volume - Điều chỉnh âm lượng.
 */

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'volume',
  description: 'Điều chỉnh âm lượng phát nhạc.',
  options: [
    {
      type: 4, // INTEGER
      name: 'level',
      description: 'Âm lượng từ 0 đến 100',
      required: true,
      min_value: 0,
      max_value: 100,
    },
  ],
  async execute(interaction, manager) {
    await interaction.deferReply();

    const player = manager.get(interaction.guild.id);
    if (!player) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Lỗi')
            .setDescription('Chưa khởi tạo player cho máy chủ này.'),
        ],
      });
    }

    const level = interaction.options.getInteger('level');
    player.setVolume(level);

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('🔊 Âm lượng')
          .setDescription(`Đã đặt âm lượng: **${level}%**`),
      ],
    });
  },
};
