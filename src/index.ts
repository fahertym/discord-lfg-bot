import { Client, GatewayIntentBits } from 'discord.js';
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

client.once('clientReady', async () => {
  console.log(`✓ Logged in as ${client.user?.tag}`);
  await registerCommands();
});

bindInteractionHandlers(client);
client.login(env.BOT_TOKEN);

