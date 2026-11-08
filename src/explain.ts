/**
 * Turns a stored send outcome (dm_status, reply_status, the raw error the
 * Worker saved) into a specific, human explanation: what happened, why, and
 * what — if anything — the operator can do about it. Meta's errors are
 * matched by their code and subcode first, then by message text, so a reworded
 * message still lands on the right explanation.
 */

export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'pending';

export type Outcome = {
  /** Short status the UI shows as a badge. */
  label: string;
  tone: Tone;
  /** One sentence: what happened to this comment. */
  title: string;
  /** Why, in plain words. */
  reason: string;
  /** What to do next, if anything. */
  action: string | null;
  /** Whether "Send again" is offered for this row. */
  retryable: boolean;
  /** Meta's code/subcode when there was one, for support threads. */
  code: string | null;
};

type MetaError = { code?: number; subcode?: number; message?: string; transient?: boolean };

/** Pulls Meta's JSON error out of a stored "DM: {...}" or "public reply: {...}" string. */
export function parseMetaError(raw: string | null | undefined): MetaError | null {
  if (!raw) return null;
  const start = raw.indexOf('{');
  if (start < 0) return null;
  try {
    const json = JSON.parse(raw.slice(start)) as {
      error?: { code?: number; error_subcode?: number; message?: string; is_transient?: boolean };
    };
    const e = json.error;
    if (!e) return null;
    return { code: e.code, subcode: e.error_subcode, message: e.message, transient: e.is_transient };
  } catch {
    return null;
  }
}

function codeOf(e: MetaError | null): string | null {
  if (!e || e.code == null) return null;
  return e.subcode != null ? `${e.code}/${e.subcode}` : String(e.code);
}

/** Explains one Meta refusal of a DM. */
export function explainMetaRefusal(raw: string, when: 'dm' | 'reply' = 'dm'): Omit<Outcome, 'label' | 'tone' | 'retryable'> {
  const e = parseMetaError(raw);
  const msg = (e?.message ?? raw).toLowerCase();
  const code = codeOf(e);
  const what = when === 'dm' ? 'The DM' : 'The public reply';

  if (e?.subcode === 2534023 || msg.includes('already has a reply')) {
    return {
      title: 'Already answered — Instagram allows one private reply per comment',
      reason:
        'This comment already got a private reply, most likely from your old Meta Business Suite automation before it was switched off. Instagram refuses a second one so nobody is messaged twice.',
      action: 'Nothing to do. If they still need the guide, they can comment again or DM you.',
      code,
    };
  }
  if (e?.subcode === 2534014 || msg.includes('user cannot be found')) {
    return {
      title: 'Instagram couldn’t deliver to this person',
      reason:
        'Instagram says the account can’t be messaged by you: it was deleted or deactivated, it has blocked or restricted you, it only accepts messages from people it follows, or it’s your own account.',
      action: 'Nothing the bot can fix. If it’s someone you know, ask them to DM you first.',
      code,
    };
  }
  if (e?.code === 4 || msg.includes('application request limit')) {
    return {
      title: 'Paused by Meta’s app-wide hourly limit',
      reason:
        'Meta caps a new app at about 200 API calls per hour per connected user. Every DM, public reply and comment check counts. The bot hit that cap, so it paused and will try again on its own.',
      action: 'Nothing to do — it retries automatically after the pause.',
      code,
    };
  }
  if (e?.code === 613 || e?.code === 17 || e?.code === 32 || msg.includes('rate limit') || msg.includes('too many')) {
    return {
      title: 'Instagram asked the bot to slow down',
      reason: 'Too many messages in a short time for this account (Instagram allows about 750 private replies per hour).',
      action: 'Nothing to do — the bot waits and retries.',
      code,
    };
  }
  if (e?.code === 190 || msg.includes('access token') || msg.includes('session has been invalidated')) {
    return {
      title: 'Instagram connection needs to be renewed',
      reason: 'The login the bot uses was revoked or changed (for example a password change, or the app was removed in Instagram settings).',
      action: 'Open Settings and reconnect Instagram. Queued comments send once you do.',
      code,
    };
  }
  if (e?.code === 10 || e?.code === 200 || e?.code === 3 || msg.includes('permission')) {
    return {
      title: 'Missing permission',
      reason: 'The Meta app isn’t allowed to do this for your account — usually a permission was removed from the login configuration.',
      action: 'Reconnect Instagram and make sure comments and messages access is granted.',
      code,
    };
  }
  if (e?.code === 100 && (msg.includes('comment') || msg.includes('does not exist') || msg.includes('unsupported'))) {
    return {
      title: 'The comment is gone',
      reason: 'The comment was deleted, hidden or is no longer reachable, so Instagram has nothing to reply to.',
      action: null,
      code,
    };
  }
  if (msg.includes('outside') && msg.includes('window')) {
    return {
      title: 'Too late to reply',
      reason: 'Instagram only allows a private reply within 7 days of the comment.',
      action: null,
      code,
    };
  }
  return {
    title: `${what} was refused by Instagram`,
    reason: e?.message ? `Instagram said: “${e.message}”` : raw,
    action: null,
    code,
  };
}

export type SentLike = {
  dm_status: string;
  reply_status: string | null;
  error: string | null;
  attempts?: number | null;
  next_attempt_at?: number | null;
  comment_at?: number | null;
};

/** The full explanation for one comment the bot handled. */
export function explainSend(s: SentLike, opts: { pausedUntil?: number; now?: number } = {}): Outcome {
  const err = s.error ?? '';
  const replyFailed = s.reply_status === 'failed';
  const replyErr = err.split(/\n|;\s*/).find((p) => /^public reply/i.test(p)) ?? '';
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const pausedNote =
    opts.pausedUntil && opts.pausedUntil > now
      ? ` Sending is paused until ${new Date(opts.pausedUntil * 1000).toISOString()} because Meta’s hourly limit was reached.`
      : '';

  switch (s.dm_status) {
    case 'ok': {
      if (/earlier try timed out/i.test(err)) {
        return {
          label: 'Sent',
          tone: 'success',
          title: 'Guide delivered (confirmed on re-check)',
          reason:
            'The first try timed out, so the bot checked again. Instagram answered that this comment already had our reply, which proves the first DM got through.',
          action: null,
          retryable: false,
          code: null,
        };
      }
      if (replyFailed) {
        const why = /no time was left|slow to answer/i.test(replyErr)
          ? 'Instagram was slow to answer, so the bot skipped the public reply rather than risk the DM.'
          : explainMetaRefusal(replyErr, 'reply').reason;
        return {
          label: 'DM sent',
          tone: 'success',
          title: 'Guide delivered by DM. The public reply didn’t post.',
          reason: why,
          action: 'Nothing urgent — they have the link.',
          retryable: false,
          code: codeOf(parseMetaError(replyErr)),
        };
      }
      return {
        label: 'Sent',
        tone: 'success',
        title: s.reply_status === 'ok' ? 'Guide delivered by DM and replied publicly' : 'Guide delivered by DM',
        reason: 'Instagram accepted the private reply. Non-followers find it in their Message requests.',
        action: null,
        retryable: false,
        code: null,
      };
    }
    case 'queued':
      if (/rate limit/i.test(err)) {
        const at = s.next_attempt_at ? new Date(s.next_attempt_at * 1000).toISOString() : null;
        return {
          label: 'Queued',
          tone: 'pending',
          title: 'Waiting out Meta’s hourly limit',
          reason: `Meta paused the app for a few minutes because its hourly API allowance ran out (mostly slow responses from Instagram). This doesn’t use up the comment’s tries.${at ? ` Next try: ${at}.` : ''}`,
          action: 'Nothing to do — it goes out automatically.',
          retryable: false,
          code: '4',
        };
      }
      return {
        label: 'Queued',
        tone: 'pending',
        title: 'Waiting to send',
        reason: `Matched a rule and is in line. The queue sends newest comments first.${pausedNote}`,
        action: null,
        retryable: false,
        code: null,
      };
    case 'pending':
      return {
        label: 'Sending',
        tone: 'pending',
        title: 'Being sent right now',
        reason: 'The bot is talking to Instagram for this comment.',
        action: null,
        retryable: false,
        code: null,
      };
    case 'retry': {
      if (/Checking an unconfirmed DM/i.test(err)) {
        return {
          label: 'Re-checking',
          tone: 'pending',
          title: 'Checking whether an unconfirmed DM arrived',
          reason:
            'Instagram didn’t confirm an earlier try. The bot is asking again; since Instagram allows one reply per comment, this can’t send the guide twice.',
          action: null,
          retryable: false,
          code: null,
        };
      }
      const ex = explainMetaRefusal(err.replace(/^DM:\s*/i, ''));
      const at = s.next_attempt_at ? new Date(s.next_attempt_at * 1000).toISOString() : null;
      return {
        label: 'Retrying',
        tone: 'warning',
        title: ex.title,
        reason: `${ex.reason}${at ? ` Next try: ${at}.` : ''}`,
        action: ex.action,
        retryable: false,
        code: ex.code,
      };
    }
    case 'unsure':
      return {
        label: 'Unconfirmed',
        tone: 'warning',
        title: 'Instagram didn’t confirm — the DM may have been delivered',
        reason:
          'Instagram didn’t answer in time. It often delivers anyway. The bot re-checks unconfirmed DMs automatically (up to 3 tries) — Instagram allows one reply per comment, so a re-check can’t message anyone twice.',
        action: 'Nothing to do; it re-checks on its own. Send again forces a check now.',
        retryable: true,
        code: null,
      };
    case 'skipped':
      return {
        label: 'Skipped',
        tone: 'info',
        title: 'Not sent, on purpose',
        reason: err || 'The rule decided not to send (paused rule, own comment, or an excluded word).',
        action: null,
        retryable: false,
        code: null,
      };
    case 'failed':
    default: {
      if (/lease|stopped before/i.test(err)) {
        return {
          label: 'Failed',
          tone: 'danger',
          title: 'The send was interrupted',
          reason: 'The Worker running the send was stopped mid-way, so the outcome is unknown.',
          action: 'Press Send again if the person didn’t get it.',
          retryable: true,
          code: null,
        };
      }
      if (/7-day|expired|too old/i.test(err)) {
        return {
          label: 'Expired',
          tone: 'info',
          title: 'Too late to reply',
          reason: 'Instagram only allows a private reply within 7 days of the comment, and this one waited past that.',
          action: null,
          retryable: false,
          code: null,
        };
      }
      const ex = explainMetaRefusal(err.replace(/^DM:\s*/i, ''));
      return { label: 'Not sent', tone: 'danger', ...ex, retryable: false };
    }
  }
}
