import 'dotenv/config';
import { z } from 'zod';

const Env = z.object({
  BOT_TOKEN: z.string().min(1),
  CLIENT_ID: z.string().min(1),
  DEV_GUILD_ID: z.string().min(1)
});

export const env = Env.parse(process.env);
