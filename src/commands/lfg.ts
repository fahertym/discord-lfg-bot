import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type GuildChannelCreateOptions,
  type CategoryChannelResolvable,
  PermissionsBitField,
  type Message
} from 'discord.js';
import { env } from '../lib/env.js';
import { lfgVcIds, ttlTimers, lfgHosts, waitlists, lastLfgAt, lfgByHost, lfgMessageByVc } from '../lib/state.js';
import { config } from '../lib/config.js';

function hasSend(ch: unknown): ch is { send: (payload: unknown) => Promise<unknown> } {
  return typeof (ch as any)?.send === 'function';
}

export const data = new SlashCommandBuilder()
  .setName('lfg')
  .setDescription('Create an LFG listing')
  .addSubcommand(sc => {
    sc
      .setName('comp')
      .setDescription('Competitive LFG')
      .addStringOption(o =>
        o
          .setName('mode')
          .setDescription('Competitive mode')
          .setRequired(true)
          .addChoices(
            { name: 'Stadium-Comp', value: 'Stadium-Comp' },
            { name: 'Comp-5v5', value: 'Comp-5v5' },
            { name: 'Comp-6v6', value: 'Comp-6v6' }
          )
      )
      .addStringOption(o =>
        o
          .setName('intent')
          .setDescription('Play intent')
          .setRequired(true)
          .addChoices(
            { name: 'Chill', value: 'Chill' },
            { name: 'Climbing', value: 'Climbing' },
            { name: 'Practice/Mentor', value: 'Practice/Mentor' },
            { name: 'Scrims/Customs', value: 'Scrims/Customs' },
            { name: 'Any', value: 'Any' }
          )
      )
      .addStringOption(o =>
        o
          .setName('rank')
          .setDescription('Approx rank range')
          .setRequired(true)
          .addChoices(
            { name: 'Bronze/Silver', value: 'Bronze/Silver' },
            { name: 'Gold/Plat', value: 'Gold/Plat' },
            { name: 'Diamond/Master', value: 'Diamond/Master' },
            { name: 'GM+', value: 'GM+' },
            { name: 'Mixed/Any', value: 'Mixed/Any' }
          )
      )
      .addStringOption(o => o.setName('notes').setDescription('Short notes').setMaxLength(120));
    if (config.enableMentorship) {
      sc.addStringOption(o =>
        o
          .setName('mentorship')
          .setDescription('Mentorship signal')
          .addChoices({ name: 'LF Mentor', value: 'LF Mentor' }, { name: 'Can Mentor', value: 'Can Mentor' })
      );
    }
    if (config.enableNeedField) {
      sc.addStringOption(o => o.setName('need').setDescription('What do you need? e.g. 1T 1D').setMaxLength(15));
    }
    return sc;
  })
  .addSubcommand(sc => {
    sc
      .setName('qp')
      .setDescription('Quick Play LFG')
      .addStringOption(o =>
        o
          .setName('mode')
          .setDescription('QP mode')
          .setRequired(true)
          .addChoices(
            { name: 'Stadium-QP', value: 'Stadium-QP' },
            { name: 'QP-5v5', value: 'QP-5v5' },
            { name: 'QP-6v6', value: 'QP-6v6' }
          )
      )
      .addStringOption(o =>
        o
          .setName('intent')
          .setDescription('Play intent')
          .setRequired(true)
          .addChoices(
            { name: 'Chill', value: 'Chill' },
            { name: 'Climbing', value: 'Climbing' },
            { name: 'Practice/Mentor', value: 'Practice/Mentor' },
            { name: 'Scrims/Customs', value: 'Scrims/Customs' },
            { name: 'Any', value: 'Any' }
          )
      )
      .addStringOption(o => o.setName('notes').setDescription('Short notes').setMaxLength(120));
    if (config.enableMentorship) {
      sc.addStringOption(o =>
        o
          .setName('mentorship')
          .setDescription('Mentorship signal')
          .addChoices({ name: 'LF Mentor', value: 'LF Mentor' }, { name: 'Can Mentor', value: 'Can Mentor' })
      );
    }
    if (config.enableNeedField) {
      sc.addStringOption(o => o.setName('need').setDescription('What do you need? e.g. 1T 1D').setMaxLength(15));
    }
    return sc;
  })
  .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
  const now = Date.now();
  if (config.enableRateLimit) {
    const last = lastLfgAt.get(interaction.user.id);
    const windowMs = config.rateLimitSeconds * 1000;
    if (last && now - last < windowMs) {
      const remaining = Math.ceil((windowMs - (now - last)) / 1000);
      return interaction.reply({ content: `Please wait ${remaining}s before creating another listing.`, ephemeral: true });
    }
  }

  const sub = interaction.options.getSubcommand();
  const mode = interaction.options.getString('mode', true);
  const intent = interaction.options.getString('intent', true);
  // need and role_need removed
  const rank = sub === 'comp' ? interaction.options.getString('rank', true) : undefined;
  const mentorship = interaction.options.getString('mentorship') ?? undefined;
  const need = interaction.options.getString('need') ?? undefined;
  const notes = interaction.options.getString('notes') ?? '';

  const guild = interaction.guild!;
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    return interaction.reply({ content: 'I need Manage Channels to create LFG rooms.', ephemeral: true });
  }

  // Prevent multiple active LFGs per host
  const existingVcId = lfgByHost.get(interaction.user.id);
  if (existingVcId) {
    const existing = await guild.channels.fetch(existingVcId).catch(() => null);
    if (existing && existing.type === ChannelType.GuildVoice) {
      return interaction.reply({ content: `You already have an active LFG: <#${existing.id}>`, ephemeral: true });
    }
    lfgByHost.delete(interaction.user.id);
  }
  const baseName = `LFG • ${mode} • @${interaction.user.username}`;
  let finalName = baseName;
  if (notes) {
    const short = notes.replace(/[\r\n]+/g, ' ').trim();
    const extra = short.slice(0, 40);
    const proposed = `${baseName} • ${extra}`;
    finalName = proposed.slice(0, 96); // keep under typical limits
  }
  let parentCategory = undefined as CategoryChannelResolvable | undefined;
  if (env.LFG_CATEGORY_ID) {
    const cat = await guild.channels.fetch(env.LFG_CATEGORY_ID).catch(() => null);
    if (cat?.type === ChannelType.GuildCategory) parentCategory = cat as CategoryChannelResolvable;
  }
  if (!parentCategory) {
    const found = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('lfg')) as CategoryChannelResolvable | undefined;
    parentCategory = found ?? undefined;
  }
  if (!parentCategory) {
    try {
      const created = await guild.channels.create({ name: 'LFG', type: ChannelType.GuildCategory, reason: 'Create LFG category' });
      parentCategory = created as CategoryChannelResolvable;
    } catch {}
  }

  const createOptions: GuildChannelCreateOptions & { type: ChannelType.GuildVoice } = {
    name: finalName,
    type: ChannelType.GuildVoice,
    parent: parentCategory ?? null,
    reason: `LFG by ${interaction.user.tag}`
  };
  const vc = await guild.channels.create(createOptions);
  lfgVcIds.add(vc.id);
  lfgHosts.set(vc.id, interaction.user.id);
  lfgByHost.set(interaction.user.id, vc.id);

  // Start TTL; auto-extend while occupied, delete when empty
  const onTtl = async () => {
    try {
      const ch = await guild.channels.fetch(vc.id);
      if (ch?.type === ChannelType.GuildVoice) {
        if (ch.members.size > 0) {
          const ms = Math.max(1, config.adaptiveExtendMinutes) * 60 * 1000;
          const newTimer = setTimeout(onTtl, ms);
          ttlTimers.set(vc.id, newTimer);
          return;
        }
        await ch.delete('LFG empty and TTL expired');
      }
    } catch {}
    ttlTimers.delete(vc.id);
    lfgVcIds.delete(vc.id);
    lfgHosts.delete(vc.id);
  };
  const timer = setTimeout(onTtl, 60 * 60 * 1000);
  ttlTimers.set(vc.id, timer);

  const member = await guild.members.fetch(interaction.user.id);
  if (member.voice?.channel) {
    await member.voice.setChannel(vc);
  }

  const footer =
    mode === 'Stadium-Comp' || mode === 'Stadium-QP'
      ? 'Stadium: round economy, Armory upgrades, separate ladder.'
      : mode === 'Comp-5v5'
      ? 'Role queue. 1T 2D 2S.'
      : 'Auto expires in 60 minutes.';

  const isCompMode = sub === 'comp';
  const detailsParts: string[] = [];
  if (isCompMode && rank) detailsParts.push(`**Rank:** ${rank}`);
  if (mentorship) detailsParts.push(`**Mentorship:** ${mentorship}`);
  if (need) detailsParts.push(`**Need:** ${need}`);

  const embed = new EmbedBuilder()
    .setTitle(`LFG: ${mode} • ${intent}`)
    .setDescription(
      [
        `Host: <@${interaction.user.id}>`,
        detailsParts.join(' • '),
        notes ? `Notes: ${notes}` : null
      ]
        .filter(Boolean)
        .join('\n')
    )
    .setColor(0x30a7ff)
    .setFooter({ text: `VC: ${vc.name} • ${footer}` });

  const components: ButtonBuilder[] = [
    new ButtonBuilder().setCustomId(`lfg.v1.join:${vc.id}`).setLabel('Join').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`lfg.v1.edit:${vc.id}`).setLabel('Edit').setStyle(ButtonStyle.Secondary)
  ];
  if (config.enableWaitlist) {
    components.push(new ButtonBuilder().setCustomId(`lfg.v1.notifyOpen:${vc.id}`).setLabel('Notify on open').setStyle(ButtonStyle.Secondary));
  }
  components.push(new ButtonBuilder().setCustomId(`lfg.v1.cancel:${vc.id}`).setLabel('Cancel').setStyle(ButtonStyle.Danger));
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...components);

  // Send the card to the configured LFG text channel
  try {
    const lfgChannel = await interaction.client.channels.fetch(env.LFG_CHANNEL_ID);
    if (lfgChannel && hasSend(lfgChannel)) {
      const msg = (await lfgChannel.send({ embeds: [embed], components: [row] })) as Message;
      lfgMessageByVc.set(vc.id, { channelId: msg.channelId, messageId: msg.id });
      await interaction.reply({ content: 'Posted your LFG in the LFG channel.', ephemeral: true });
      return;
    }
  } catch {}
  const replyMsg = (await interaction.reply({ embeds: [embed], components: [row], ephemeral: false, fetchReply: true })) as Message;
  lfgMessageByVc.set(vc.id, { channelId: replyMsg.channelId, messageId: replyMsg.id });

  lastLfgAt.set(interaction.user.id, now);
}
