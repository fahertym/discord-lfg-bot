import { Client, GatewayIntentBits } from 'discord.js';
import http from 'node:http';
import { config } from './lib/config.js';
import { restoreState } from './lib/restore.js';
import { env } from './lib/env.js';
import { bindInteractionHandlers, registerCommands } from './handlers/interactions.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', async () => {
  console.log(`✓ Logged in as ${client.user?.tag}`);
  await registerCommands();
  await restoreState(client);
});

bindInteractionHandlers(client);
client.login(env.BOT_TOKEN);

// Minimal healthcheck server (guarded)
if (config.enableHealthcheck && env.PORT) {
  const port = Number(env.PORT);
  http
    .createServer((req, res) => {
      const status = client.ws.status;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, wsStatus: status }));
    })
    .listen(port);
}

