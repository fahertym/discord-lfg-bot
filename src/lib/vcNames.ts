import { type VoiceChannel } from 'discord.js';
import { nameUpdateCooldown } from './state.js';

export function parseBaseName(name: string): string {
  const idx = name.lastIndexOf(' • ');
  if (idx === -1) return name;
  const tail = name.slice(idx + 3);
  // If tail looks like X/Y or contains Need: consider it a counter suffix
  if (/^\d+\/\d+/.test(tail) || /Need:/i.test(tail)) {
    return name.slice(0, idx);
  }
  return name;
}

export function buildName(base: string, size: number, cap: number, need?: string): string {
  const needSuffix = need ? ` • Need: ${need}` : '';
  const raw = `${base} • ${size}/${cap}${needSuffix}`;
  return raw.slice(0, 96);
}

export async function scheduleNameUpdate(vc: VoiceChannel, base: string, cap: number, need?: string) {
  const now = Date.now();
  const last = nameUpdateCooldown.get(vc.id) ?? 0;
  const debounceMs = 1500;
  if (now - last < debounceMs) return;
  nameUpdateCooldown.set(vc.id, now);
  const size = vc.members.size;
  const newName = buildName(base, size, cap, need);
  if (vc.name === newName) return;
  try {
    await vc.setName(newName, 'Sync headcount/need');
  } catch {}
}


