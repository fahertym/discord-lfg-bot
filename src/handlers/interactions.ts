import { REST, Routes, Client, GatewayIntentBits, type Interaction, type ButtonInteraction, type GuildMember, VoiceState, ChannelType } from 'discord.js';
import { env } from '../lib/env.js';
import * as LFG from '../commands/lfg.js';
import { emptyTimers, lfgVcIds } from '../lib/state.js';

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

  // Empty VC cleanup: delete tracked LFG VC as soon as it becomes empty
  client.on('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
    const vc = oldState.channel ?? newState.channel;
    if (!vc || vc.type !== ChannelType.GuildVoice) return;
    if (!lfgVcIds.has(vc.id)) return;
    let channel;
    try {
      channel = await vc.fetch(true);
    } catch {
      return; // channel likely deleted
    }
    const isEmpty = channel.members.size === 0;
    if (isEmpty) {
      try {
        await channel.delete('LFG VC became empty');
      } catch {}
      const t = emptyTimers.get(channel.id);
      if (t) { clearTimeout(t); emptyTimers.delete(channel.id); }
      lfgVcIds.delete(channel.id);
    }
  });
}

async function handleButton(i: ButtonInteraction) {
  if (i.customId.startsWith('lfg.join:')) {
    const vcId = i.customId.split(':')[1];
    if (!vcId) return i.reply({ content: 'VC not found.', ephemeral: true });
    const member = i.member as GuildMember;
    try {
      const vc = await i.guild!.channels.fetch(vcId);
      if (member.voice?.channel && vc?.isVoiceBased()) {
        await member.voice.setChannel(vc.id);
        return i.reply({ content: `Moved you to <#${vc.id}>.`, ephemeral: true });
      }
      if (vc?.isVoiceBased()) {
        return i.reply({ content: `Join VC: <#${vc.id}>`, ephemeral: true });
      }
    } catch {}
    return i.reply({ content: 'VC not found.', ephemeral: true });
  }

  if (i.customId.startsWith('lfg.cancel:')) {
    const vcId = i.customId.split(':')[1];
    if (!vcId) return i.reply({ content: 'VC not found.', ephemeral: true });
    try {
      const ch = await i.guild!.channels.fetch(vcId);
      if (ch?.type === ChannelType.GuildVoice) {
        await ch.delete('LFG canceled by host');
        lfgVcIds.delete(vcId);
        const t = emptyTimers.get(vcId);
        if (t) { clearTimeout(t); emptyTimers.delete(vcId); }
      }
    } catch {}
    await i.message.edit({ content: 'Listing archived by host.', embeds: [], components: [] });
    return i.reply({ content: 'Archived and VC removed.', ephemeral: true });
  }

  if (i.customId === 'lfg.edit') {
    return i.reply({ content: 'Edit modal coming soon.', ephemeral: true });
  }
}
