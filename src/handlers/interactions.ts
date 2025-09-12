import { REST, Routes, Client, GatewayIntentBits, type Interaction, type ButtonInteraction, type GuildMember, VoiceState, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder as Row, EmbedBuilder, type ModalSubmitInteraction } from 'discord.js';
import { env } from '../lib/env.js';
import * as LFG from '../commands/lfg.js';
import { config } from '../lib/config.js';
import { emptyTimers, lfgVcIds, ttlTimers, lfgHosts, lfgMessageByVc, waitlistQueue, lastMemberCount, openPingCooldown } from '../lib/state.js';

export async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(env.BOT_TOKEN);
  if (env.CLEAR_GLOBAL) {
    await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body: [] });
  }
  await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, env.DEV_GUILD_ID), {
    body: [LFG.data.toJSON()]
  });
  if (env.DEPLOY_GLOBAL) {
    await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body: [LFG.data.toJSON()] });
  }
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
        return;
      }
      if (i.isModalSubmit()) {
        await handleModal(i);
        return;
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
    const size = channel.members.size;
    const isEmpty = size === 0;
    if (isEmpty) {
      try {
        await channel.delete('LFG VC became empty');
      } catch {}
      const t = emptyTimers.get(channel.id);
      if (t) { clearTimeout(t); emptyTimers.delete(channel.id); }
      const tt = ttlTimers.get(channel.id);
      if (tt) { clearTimeout(tt); ttlTimers.delete(channel.id); }
      lfgVcIds.delete(channel.id);
      lfgHosts.delete(channel.id);
      lfgMessageByVc.delete(channel.id);
      waitlistQueue.delete(channel.id);
      lastMemberCount.delete(channel.id);
      openPingCooldown.delete(channel.id);
      return;
    }
    // Notify-on-open: when transitioning from full/overfull to below target size
    const prev = lastMemberCount.get(channel.id) ?? size;
    lastMemberCount.set(channel.id, size);
    if (config.enableWaitlist && prev >= config.targetSize && size < config.targetSize) {
      const now = Date.now();
      const last = openPingCooldown.get(channel.id) ?? 0;
      if (now - last > 5000) {
        openPingCooldown.set(channel.id, now);
        const queue = waitlistQueue.get(channel.id) ?? [];
        const nextUser = queue.shift();
        if (nextUser) {
          if (queue.length === 0) waitlistQueue.delete(channel.id); else waitlistQueue.set(channel.id, queue);
          const ref = lfgMessageByVc.get(channel.id);
          if (ref) {
            try {
              const textCh = await client.channels.fetch(ref.channelId);
              if (textCh && 'send' in textCh) {
                await (textCh as any).send({ content: `<@${nextUser}> a spot just opened in <#${channel.id}>` });
              }
            } catch {}
          }
        }
      }
    }
  });
}

async function handleButton(i: ButtonInteraction) {
  if (i.customId.startsWith('lfg.v1.join:')) {
    const vcId = i.customId.split(':')[1];
    if (!vcId) return i.reply({ content: 'VC not found.', ephemeral: true });
    const member = i.member as GuildMember;
    const me = i.guild!.members.me;
    if (!me?.permissions.has(PermissionsBitField.Flags.MoveMembers)) {
      return i.reply({ content: 'I need the Move Members permission to move you.', ephemeral: true });
    }
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

  if (i.customId.startsWith('lfg.v1.cancel:')) {
    const vcId = i.customId.split(':')[1];
    if (!vcId) return i.reply({ content: 'VC not found.', ephemeral: true });
    try {
      const ch = await i.guild!.channels.fetch(vcId);
      if (ch?.type === ChannelType.GuildVoice) {
        await ch.delete('LFG canceled by host');
        lfgVcIds.delete(vcId);
        const t = emptyTimers.get(vcId);
        if (t) { clearTimeout(t); emptyTimers.delete(vcId); }
        const tt = ttlTimers.get(vcId);
        if (tt) { clearTimeout(tt); ttlTimers.delete(vcId); }
        lfgHosts.delete(vcId);
      }
    } catch {}
    await i.message.edit({ content: 'Listing archived by host.', embeds: [], components: [] });
    return i.reply({ content: 'Archived and VC removed.', ephemeral: true });
  }

  if (i.customId.startsWith('lfg.v1.extend:')) {
    const vcId = i.customId.split(':')[1];
    if (!vcId) return i.reply({ content: 'VC not found.', ephemeral: true });
    // Only host or users with ManageChannels can extend
    const hostId = lfgHosts.get(vcId);
    const member = i.member as GuildMember;
    const isHost = hostId === member.id;
    const canManage = member.permissions.has(PermissionsBitField.Flags.ManageChannels);
    if (!isHost && !canManage) {
      return i.reply({ content: 'Only the host or moderators can extend.', ephemeral: true });
    }
    const existing = ttlTimers.get(vcId);
    if (existing) { clearTimeout(existing); }
    const ttlMs = 60 * 60 * 1000;
    const ch = await i.guild!.channels.fetch(vcId).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildVoice) {
      ttlTimers.delete(vcId);
      lfgHosts.delete(vcId);
      lfgVcIds.delete(vcId);
      return i.reply({ content: 'VC not found.', ephemeral: true });
    }
    const newTimer = setTimeout(async () => {
      try {
        const fetched = await i.guild!.channels.fetch(vcId);
        if (fetched?.type === ChannelType.GuildVoice) {
          await fetched.delete('LFG TTL expired');
        }
      } catch {}
      ttlTimers.delete(vcId);
      lfgVcIds.delete(vcId);
      lfgHosts.delete(vcId);
    }, ttlMs);
    ttlTimers.set(vcId, newTimer);
    return i.reply({ content: 'Extended by 60 minutes.', ephemeral: true });
  }

  if (i.customId.startsWith('lfg.v1.notifyOpen:')) {
    const vcId = i.customId.split(':')[1];
    if (!vcId) return i.reply({ content: 'VC not found.', ephemeral: true });
    const queue = waitlistQueue.get(vcId) ?? [];
    const idx = queue.indexOf(i.user.id);
    if (idx >= 0) {
      queue.splice(idx, 1);
      if (queue.length === 0) waitlistQueue.delete(vcId); else waitlistQueue.set(vcId, queue);
      return i.reply({ content: 'Removed from notifications.', ephemeral: true });
    }
    queue.push(i.user.id);
    waitlistQueue.set(vcId, queue);
    return i.reply({ content: 'I will ping you when a spot opens.', ephemeral: true });
  }

  if (i.customId.startsWith('lfg.v1.edit:')) {
    const modal = new ModalBuilder().setCustomId(`lfg.v1.apply:${i.message.id}`).setTitle('Edit LFG');
    const notes = new TextInputBuilder().setCustomId('notes').setLabel('Notes').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120);
    const intent = new TextInputBuilder().setCustomId('intent').setLabel('Intent').setStyle(TextInputStyle.Short).setRequired(false);
    await i.showModal(modal.addComponents(new Row<TextInputBuilder>().addComponents(notes), new Row<TextInputBuilder>().addComponents(intent)));
    return;
  }
}

async function handleModal(i: ModalSubmitInteraction) {
  if (!i.customId.startsWith('lfg.v1.apply:')) return;
  const messageId = i.customId.split(':')[1];
  const newNotes = i.fields.getTextInputValue('notes')?.trim();
  const newIntent = i.fields.getTextInputValue('intent')?.trim();
  try {
    const msg = await i.channel?.messages.fetch(messageId!);
    if (msg) {
      const eb = EmbedBuilder.from(msg.embeds[0] ?? {} as any);
      if (newNotes) {
        const lines = (eb.data.description ?? '').split('\n').filter(Boolean);
        const idx = lines.findIndex(l => l.startsWith('Notes:'));
        if (idx >= 0) lines[idx] = `Notes: ${newNotes}`; else lines.push(`Notes: ${newNotes}`);
        eb.setDescription(lines.join('\n'));
      }
      if (newIntent) {
        const title = eb.data.title ?? '';
        eb.setTitle(title.replace(/LFG:\s[^•]+/, `LFG: ${newIntent}`));
      }
      await msg.edit({ embeds: [eb] });
    }
    await i.reply({ content: 'Updated.', ephemeral: true });
  } catch {
    await i.reply({ content: 'Could not update message.', ephemeral: true });
  }
}
