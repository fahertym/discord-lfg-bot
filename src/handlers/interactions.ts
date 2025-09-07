import { REST, Routes, Client, GatewayIntentBits, Interaction, ButtonInteraction, GuildMember } from 'discord.js';
import { env } from '../lib/env';
import * as LFG from '../commands/lfg';

export async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(env.BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, env.DEV_GUILD_ID), {
    body: [LFG.data.toJSON()]
  });
  console.log('✓ Slash command registered (guild).');
}

export function bindInteractionHandlers(client: Client) {
  client.on('interactionCreate', async (i: Interaction) => {
    try {
      if (i.isChatInputCommand() && i.commandName === 'lfg') {
        await LFG.execute(i);
        return;
      }
      if (i.isButton()) {
        await handleButton(i);
      }
    } catch (err) {
      console.error(err);
      if (i.isRepliable()) await i.reply({ content: 'Error occurred.', ephemeral: true });
    }
  });
}

async function handleButton(i: ButtonInteraction) {
  if (i.customId.startsWith('lfg.joinvc:')) {
    const vcId = i.customId.split(':')[1];
    const vc = await i.guild!.channels.fetch(vcId);
    const member = i.member as GuildMember;
    if (member.voice?.channel && vc?.isVoiceBased()) {
      await member.voice.setChannel(vc.id);
      return i.reply({ content: `Moved you to <#${vc.id}>.`, ephemeral: true });
    }
    return i.reply({
      content: `Click to join: <#${vcId}>. If you connect to any VC, I can move you in.`,
      ephemeral: true
    });
  }

  if (i.customId === 'lfg.join') {
    return i.reply({ content: 'Seat reserved. See the VC above to hop in!', ephemeral: true });
  }

  if (i.customId === 'lfg.cancel') {
    await i.message.edit({ content: 'Listing archived by host.', embeds: [], components: [] });
    return i.reply({ content: 'Archived.', ephemeral: true });
  }

  if (i.customId === 'lfg.edit') {
    return i.reply({ content: 'Edit modal coming soon.', ephemeral: true });
  }
}
