import 'dotenv/config';
import { z } from 'zod';

const RawEnv = z
  .object({
    BOT_TOKEN: z.string().min(1),
    CLIENT_ID: z.string().regex(/^\d+$/, 'CLIENT_ID must be numbers only (Discord application ID).'),
    DEV_GUILD_ID: z.string().regex(/^\d+$/, 'DEV_GUILD_ID must be numbers only (server ID).'),
    LFG_CHANNEL_ID: z.string().regex(/^\d+$/, 'LFG_CHANNEL_ID must be numbers only (channel ID).'),
    LFG_CATEGORY_ID: z.string().regex(/^\d+$/).optional().or(z.literal('')).default(''),
    CLEAR_GLOBAL: z.enum(['0', '1']).default('0'),
    DEPLOY_GLOBAL: z.enum(['0', '1']).default('0'),
    PORT: z.string().regex(/^\d+$/).optional().or(z.literal('')).default('')
  })
  .transform(v => ({
    ...v,
    CLEAR_GLOBAL: v.CLEAR_GLOBAL === '1',
    DEPLOY_GLOBAL: v.DEPLOY_GLOBAL === '1'
  }));

export const env = RawEnv.parse(process.env);
