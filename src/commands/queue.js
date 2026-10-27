/**
 * Lệnh /queue - Xem hàng đợi phát nhạc.
 */

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'queue',
  description: 'Xem danh sách hàng đợi phát nhạc.',
  async execute(interaction, manager) {
    await interaction.deferReply();

    const player = manager.get(interaction.guild.id);
    if (!player || (player.queueSize === 0 && !player.currentTrack)) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('📋 Hàng đợi')
            .setDescription('Hàng đợi đang trống.'),
        ],
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('📋 Hàng đợi phát nhạc')
    ;

    if (player.currentTrack) {
      embed.addFields({
        name: '🎧 Đang phát',
        value: `**${player.currentTrack.title}**`,
        inline: false,
      });
    }

    if (player.queueSize > 0) {
      const list = player.queue
        .slice(0, 10)
        .map((t, i) => `#${i + 1} - ${t.title}`)
        .join('\n');
      embed.addFields({
        name: `⏳ Tiếp theo (${player.queueSize} bài)`,
        value: list,
        inline: false,
      });
    }

    return interaction.editReply({ embeds: [embed] });
  },
};
