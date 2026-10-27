/**
 * Lệnh /loop - Chế độ lặp: tắt / lặp bài / lặp hàng đợi.
 */

const { EmbedBuilder } = require('discord.js');
const { LOOP_OFF, LOOP_TRACK, LOOP_QUEUE } = require('../player');

const MODE_NAMES = {
  [LOOP_OFF]: 'Tắt',
  [LOOP_TRACK]: 'Lặp bài hiện tại',
  [LOOP_QUEUE]: 'Lặp toàn bộ hàng đợi',
};

module.exports = {
  name: 'loop',
  description: 'Đặt chế độ lặp phát nhạc.',
  options: [
    {
      type: 3, // STRING
      name: 'mode',
      description: 'Chế độ lặp: off, track, queue',
      required: true,
      choices: [
        { name: 'Tắt', value: 'off' },
        { name: 'Lặp bài', value: 'track' },
        { name: 'Lặp hàng đợi', value: 'queue' },
      ],
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

    const modeStr = interaction.options.getString('mode');
    let mode;
    if (modeStr === 'track') mode = LOOP_TRACK;
    else if (modeStr === 'queue') mode = LOOP_QUEUE;
    else mode = LOOP_OFF;

    player.setLoop(mode);

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('🔁 Chế độ lặp')
          .setDescription(`Đã đặt: **${MODE_NAMES[mode]}**`),
      ],
    });
  },
};
