import { type Client, ChannelType, type VoiceChannel, type TextChannel } from 'discord.js';
import { env } from './env.js';
import { config } from './config.js';
import { lfgVcIds, ttlTimers, lfgHosts, lastMemberCount, lfgMessageByVc } from './state.js';
import { parseBaseName, scheduleNameUpdate } from './vcNames.js';

export async function restoreState(client: Client) {
  const guilds = [...client.guilds.cache.values()];
  for (const g of guilds) {
    const guild = await g.fetch();
    // Find LFG category
    let categoryId = env.LFG_CATEGORY_ID || '';
    let category = null as any;
    if (categoryId) {
      const ch = await guild.channels.fetch(categoryId).catch(() => null);
      if (ch?.type === ChannelType.GuildCategory) category = ch;
    }
    if (!category) {
      category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('lfg')) || null;
    }
    // Rebind VCs under category
    if (category) {
      const children = guild.channels.cache.filter(c => c.parentId === category.id && c.type === ChannelType.GuildVoice) as any;
      for (const vc of children.values() as Iterable<VoiceChannel>) {
        lfgVcIds.add(vc.id);
        lastMemberCount.set(vc.id, vc.members.size);
        // Restart TTL: auto-extend while occupied, delete when empty
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
              await ch.delete('LFG empty and TTL expired (restore)');
            }
          } catch {}
          ttlTimers.delete(vc.id);
          lfgVcIds.delete(vc.id);
          lfgHosts.delete(vc.id);
        };
        const timer = setTimeout(onTtl, 60 * 60 * 1000);
        ttlTimers.set(vc.id, timer);
        // Normalize name
        const base = parseBaseName(vc.name);
        await scheduleNameUpdate(vc, base, config.targetSize);
      }
    }
    // Rebind message refs
    if (env.LFG_CHANNEL_ID) {
      const tch = await guild.channels.fetch(env.LFG_CHANNEL_ID).catch(() => null);
      if (tch && tch.type === ChannelType.GuildText) {
        const text = tch as TextChannel;
        const messages = await text.messages.fetch({ limit: 200 }).catch(() => null);
        if (messages) {
          for (const msg of messages.values()) {
            if (!msg.components?.length) continue;
            const customIds = msg.components.flatMap(r => r.components.map(c => (c as any).customId || ''));
            for (const cid of customIds) {
              const m = cid.match(/lfg\.v1\.(?:join|cancel|notifyOpen):(.+)/);
              if (m) {
                const vcId = m[1];
                lfgMessageByVc.set(vcId, { channelId: msg.channelId, messageId: msg.id });
              }
            }
          }
        }
      }
    }
  }
}


