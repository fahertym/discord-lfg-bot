import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { env } from '../lib/env';
import { lfgVcIds } from '../lib/state';

export const data = new SlashCommandBuilder()
  .setName('lfg')
  .setDescription('Create an LFG listing')
  .addSubcommand(sc =>
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
      .addIntegerOption(o =>
        o
          .setName('need')
          .setDescription('How many players needed')
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(4)
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
      .addStringOption(o =>
        o
          .setName('role_need')
          .setDescription('Needed role (5v5 only)')
          .addChoices(
            { name: 'Tank', value: 'Tank' },
            { name: 'DPS', value: 'DPS' },
            { name: 'Support', value: 'Support' },
            { name: 'Any', value: 'Any' }
          )
      )
      .addStringOption(o => o.setName('notes').setDescription('Short notes').setMaxLength(120))
  )
  .addSubcommand(sc =>
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
      .addIntegerOption(o =>
        o
          .setName('need')
          .setDescription('How many players needed')
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(4)
      )
      .addStringOption(o =>
        o
          .setName('role_need')
          .setDescription('Needed role (5v5 only)')
          .addChoices(
            { name: 'Tank', value: 'Tank' },
            { name: 'DPS', value: 'DPS' },
            { name: 'Support', value: 'Support' },
            { name: 'Any', value: 'Any' }
          )
      )
      .addStringOption(o => o.setName('notes').setDescription('Short notes').setMaxLength(120))
  )
  .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const mode = interaction.options.getString('mode', true);
  const intent = interaction.options.getString('intent', true);
  const need = interaction.options.getInteger('need', true);
  const roleNeed = interaction.options.getString('role_need') ?? 'Any';
  const rank = sub === 'comp' ? interaction.options.getString('rank', true) : undefined;
  const notes = interaction.options.getString('notes') ?? '';

  const guild = interaction.guild!;
  const vc = await guild.channels.create({
    name: `LFG • ${mode} • @${interaction.user.username}`,
    type: ChannelType.GuildVoice,
    parent: guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('lfg')
    )?.id,
    reason: `LFG by ${interaction.user.tag}`
  });
  lfgVcIds.add(vc.id);

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
  const roleText = mode === 'Comp-5v5' || mode === 'QP-5v5' ? roleNeed : 'Any';
  const detailsParts = [
    `**Needs:** ${need}`,
    `**Role:** ${roleText}`
  ];
  if (isCompMode && rank) detailsParts.push(`**Rank:** ${rank}`);

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

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`lfg.join:${vc.id}`).setLabel('Join').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`lfg.edit`).setLabel('Edit').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`lfg.cancel:${vc.id}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
  );

  // Send the card to the configured LFG text channel
  try {
    const lfgChannel = await interaction.client.channels.fetch(env.LFG_CHANNEL_ID);
    if (lfgChannel?.isTextBased()) {
      await lfgChannel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: 'Posted your LFG in the LFG channel.', ephemeral: true });
      return;
    }
  } catch {}
  await interaction.reply({ embeds: [embed], components: [row] });
}
