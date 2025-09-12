import fs from 'node:fs';

export type LfgConfig = {
  targetSize: number;
  enableMentorship: boolean;
  enableNeedField: boolean;
  enableWaitlist: boolean;
  enableRateLimit: boolean;
  rateLimitSeconds: number;
  enableAdaptiveTTL: boolean;
  adaptiveExtendMinutes: number;
  enableExtendButton: boolean;
  enableHealthcheck: boolean;
};

const defaults: LfgConfig = {
  targetSize: 5,
  enableMentorship: true,
  enableNeedField: true,
  enableWaitlist: true,
  enableRateLimit: true,
  rateLimitSeconds: 120,
  enableAdaptiveTTL: true,
  adaptiveExtendMinutes: 30,
  enableExtendButton: true,
  enableHealthcheck: true
};

export const config: LfgConfig = (() => {
  try {
    const raw = fs.readFileSync('config/lfg.config.json', 'utf8');
    return { ...defaults, ...JSON.parse(raw) } as LfgConfig;
  } catch {
    return defaults;
  }
})();


