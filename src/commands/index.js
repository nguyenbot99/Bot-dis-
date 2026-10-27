/**
 * Registry tất cả slash commands.
 */

const tts = require('./tts');
const play = require('./play');
const skip = require('./skip');
const stop = require('./stop');
const pause = require('./pause');
const resume = require('./resume');
const volume = require('./volume');
const queue = require('./queue');
const leave = require('./leave');
const loop = require('./loop');

const commands = [tts, play, skip, stop, pause, resume, volume, queue, leave, loop];

const commandMap = new Map();
for (const cmd of commands) {
  commandMap.set(cmd.name, cmd);
}

module.exports = { commands, commandMap };
