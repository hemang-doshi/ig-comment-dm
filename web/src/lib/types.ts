export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'pending';

export type Outcome = {
  label: string;
  tone: Tone;
  title: string;
  reason: string;
  action: string | null;
  retryable: boolean;
  code: string | null;
};

export type Totals = { sent: number; skipped: number; failed: number; reached: number };

export type Overview = {
  now: number;
  state: 'ok' | 'busy' | 'paused' | 'attention';
  headline: string;
  problems: { secret: string; problem: string; fix: string }[];
  health: { lastWebhookAt: number | null; lastPollOkAt: number | null; lastCronOkAt: number | null; lastEventAt: number | null };
  queue: { waiting: number; retrying: number; pausedUntil: number | null; oldestCommentAt: number | null; callsLastHour: number };
  totals: { day: Totals; week: Totals; month: Totals; all: Totals; todayUtcFrom: number };
  hourly: { hour: number; sent: number; problems: number }[];
  accounts: { igUserId: string; username: string; active: boolean; needsReconnect: boolean; connectedAt: number }[];
  rules: { total: number; active: number };
  problemsWeek: number;
};

export type ActivityItem = {
  commentId: string;
  username: string | null;
  commentText: string | null;
  ruleId: number | null;
  ruleLabel: string | null;
  mediaId: string | null;
  status: string;
  replyStatus: string | null;
  commentAt: number | null;
  updatedAt: number;
  attempts: number;
  nextAttemptAt: number | null;
  outcome: Outcome;
  raw: string | null;
};

export type ActivityPage = {
  items: ActivityItem[];
  next: { before: number; beforeId: string } | null;
  counts: { all: number; sent: number; waiting: number; problem: number; skipped: number };
};

export type Media = {
  id: string;
  caption: string;
  fullCaption?: string;
  permalink: string;
  kind: 'reel' | 'post';
  thumbnail?: string;
  timestamp?: string;
  comments?: number;
  usedBy?: string | null;
};

export type Rule = {
  id: number;
  igUserId: string;
  label: string;
  keywords: string[];
  excludeKeywords: string[];
  matchMode: 'word' | 'contains';
  matchAll: boolean;
  replyWithoutDm: boolean;
  mediaId: string | null;
  media: Media | null;
  dmText: string;
  publicReplies: string[];
  active: boolean;
  createdAt: number;
  stats?: { sent: number; waiting: number; problem: number; lastSentAt: number | null };
};

export type RuleInput = {
  igUserId: string;
  label: string;
  keywords: string[];
  excludeKeywords: string[];
  matchMode: 'word' | 'contains';
  matchAll: boolean;
  replyWithoutDm: boolean;
  mediaId: string | null;
  dmText: string;
  publicReplies: string[];
};

export type WebhookEvent = {
  id: number;
  receivedAt: number;
  status: string;
  error: string | null;
  field: string | null;
  username: string | null;
  text: string | null;
};
