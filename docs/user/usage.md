# Review usage

The Usage page combines Codex and Claude Code activity from your connected environments. It reads
the providers' local session history and shows API-equivalent token cost, processed tokens, cache
savings, provider shares, and model breakdowns. Subscription billing is separate from the raw token
cost shown here.

Use **Past 24h** for an hourly chart covering the exact rolling 24-hour period. The **7 days**,
**30 days**, and **90 days** ranges use daily resolution. Cost and token toggles update both the
headline and chart, and refreshing rescans every connected environment.

## Rate limits in the thread header

Threads running Claude or Codex show a token usage chip beside the title. When the provider also
reports subscription rate limits, the chip's popover lists each limit with how much you have used
and when it resets, for example `37% used · 6h left`. Providers that do not report limits (Cursor,
Grok, OpenCode) simply leave the section out.

## Duplicate environments

If two connected environments read the same physical transcript directory — a Windows host and its
WSL distributions sharing one home folder, for example — T3 Code counts it once and lists the
duplicate under the chart.
