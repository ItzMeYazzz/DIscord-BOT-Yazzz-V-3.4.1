'use strict';

const { REST, Routes } = require('discord.js');
const config = require('./config');
const { loadCommands } = require('./utils/loadCommands');

(async () => {
  const body = [...loadCommands().values()].map((c) => c.data.toJSON());
  const rest = new REST().setToken(config.token);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  await rest.put(route, { body });
  console.log(`Berhasil mendaftarkan ${body.length} command ${config.guildId ? `ke server ${config.guildId}` : 'secara global (bisa butuh waktu hingga 1 jam)'}.`);
})().catch((err) => {
  console.error('Gagal mendaftarkan command:', err);
  process.exit(1);
});
