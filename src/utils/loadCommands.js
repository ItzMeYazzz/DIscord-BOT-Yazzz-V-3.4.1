'use strict';

const fs = require('fs');
const path = require('path');

/** Baca semua file di src/commands. Satu file boleh mengekspor satu command atau array command. */
function loadCommands() {
  const dir = path.join(__dirname, '..', 'commands');
  const commands = new Map();

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const mod = require(path.join(dir, file));
    const list = Array.isArray(mod) ? mod : [mod];
    for (const cmd of list) {
      if (!cmd?.data || typeof cmd.execute !== 'function') continue;
      cmd.category = path.basename(file, '.js');
      commands.set(cmd.data.name, cmd);
    }
  }
  return commands;
}

module.exports = { loadCommands };
