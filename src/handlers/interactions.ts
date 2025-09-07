import { REST, Routes, Client, GatewayIntentBits, Interaction, ButtonInteraction, GuildMember, VoiceState, ChannelType } from 'discord.js';
import { env } from '../lib/env';
import * as LFG from '../commands/lfg';

export async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(env.BOT_TOKEN);
  // Clear any old GLOBAL commands from previous experiments
  await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body: [] });
  // Overwrite GUILD commands for the dev server
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

  // Empty VC cleanup: if a temp LFG VC becomes empty, delete it after 5 minutes
  const emptyTimers = new Map<string, NodeJS.Timeout>();
  client.on('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
    const vc = oldState.channel ?? newState.channel;
    if (!vc || vc.type !== ChannelType.GuildVoice) return;
    const channel = await vc.fetch(true);
    const isEmpty = channel.members.size === 0;
    if (isEmpty) {
      if (emptyTimers.has(channel.id)) return;
      const t = setTimeout(async () => {
        try {
          const refreshed = await channel.fetch(true);
          if (refreshed.members.size === 0) await refreshed.delete('LFG VC empty for 5 minutes');
        } catch {/* no-op */}
        finally { emptyTimers.delete(channel.id); }
      }, 5 * 60 * 1000);
      emptyTimers.set(channel.id, t);
    } else {
      const t = emptyTimers.get(channel.id);
      if (t) { clearTimeout(t); emptyTimers.delete(channel.id); }
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
