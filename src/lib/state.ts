export const lfgVcIds = new Set<string>();
export const emptyTimers = new Map<string, NodeJS.Timeout>();

// Maps the LFG VC id to its TTL timer for auto-expiry cleanup
export const ttlTimers = new Map<string, NodeJS.Timeout>();

// Tracks the host user id for each LFG VC (vcId -> hostId)
export const lfgHosts = new Map<string, string>();

// Tracks waitlist subscribers for ping-when-full (vcId -> set of userIds)
export const waitlists = new Map<string, Set<string>>();

// Simple rate limit tracking (userId -> last created ms epoch)
export const lastLfgAt = new Map<string, number>();

// Reverse mapping to prevent multiple active LFGs per host (hostId -> vcId)
export const lfgByHost = new Map<string, string>();

// Mapping from VC to its listing message so we can edit/ping later
export const lfgMessageByVc = new Map<string, { channelId: string; messageId: string }>();

// FIFO waitlist queue for notify-on-open (vcId -> array userIds)
export const waitlistQueue = new Map<string, string[]>();

// Track last observed member count per vc to detect openings
export const lastMemberCount = new Map<string, number>();

// Debounce pings on rapid join/leave (vcId -> epoch ms)
export const openPingCooldown = new Map<string, number>();

