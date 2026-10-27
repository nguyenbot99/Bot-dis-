/**
 * Lệnh /skip - Bỏ qua bài hiện tại hoặc n bài tiếp theo.
 */

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'skip',
  description: 'Bỏ qua bài hát hiện tại.',
  options: [
    {
      type: 4, // INTEGER
      name: 'count',
      description: 'Số lượng bài bỏ qua (mặc định: 1)',
      required: false,
      min_value: 1,
      max_value: 10,
    },
  ],
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

    const count = interaction.options.getInteger('count') || 1;
    player.skip(count);

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('⏭️ Bỏ qua')
          .setDescription(`Đã bỏ qua ${count} bài.`)
          .addFields([
            { name: 'Bài hiện tại', value: player.currentTrack ? player.currentTrack.title : 'Không có', inline: true },
          ]),
      ],
    });
  },
};
