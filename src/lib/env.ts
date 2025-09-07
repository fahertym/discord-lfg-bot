import 'dotenv/config';
import { z } from 'zod';

const Env = z.object({
  BOT_TOKEN: z.string().min(1),
  // Snowflakes are numeric strings. Avoid prefixes like "your-".
  CLIENT_ID: z.string().regex(/^\d+$/, 'CLIENT_ID must be numbers only (Discord application ID).'),
  DEV_GUILD_ID: z.string().regex(/^\d+$/, 'DEV_GUILD_ID must be numbers only (server ID).'),
  LFG_CHANNEL_ID: z.string().regex(/^\d+$/, 'LFG_CHANNEL_ID must be numbers only (channel ID).')
});

export const env = Env.parse(process.env);
