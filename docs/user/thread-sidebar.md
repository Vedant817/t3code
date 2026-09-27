# Organizing threads

Pin a thread from its context menu to keep it in the pinned section above your active work.
Pinned threads are shown independently of their project, including when you connect to more than
one environment.

Pinned threads still move to **Settled** when they become inactive. They also move when their pull
request merges if **Auto-settle merged threads** is enabled.

On web and desktop, drag a pinned thread to change its position. On mobile, open the thread's menu
and choose **Move up** or **Move down**. The order is stored by the server and appears on your
other connected devices.

If reordering is unavailable for one environment, update the T3 Code server running in that
environment. Older servers can still pin and unpin threads, but do not understand synced ordering;
their pinned threads keep the default newest-first order below the ones you have arranged.

## Environment artwork

Dev and Nightly environments can identify themselves with artwork at the top of the sidebar and in
the send button. Choose **Artwork**, **Version pill**, or **None** in Settings under environment
identification. Artwork is recolored to match each built-in theme. Custom themes use the **Version
pill** fallback because their colors are not controlled by T3 Code.

To generate a fresh title from the conversation, open a thread's context menu and choose
**Regenerate title**. While T3 Code is generating it, the action reads **Regenerating…** and cannot
be selected again. The option is hidden when the connected environment needs a server update.

## Forking from an earlier turn

In a Codex, Claude, or OpenCode thread, hover a completed user or assistant message on web and
desktop, or use the fork button beside that message on mobile. T3 Code creates a new thread whose
conversation and files end at that point, then opens it. The original thread is not changed.

The fork receives its own provider conversation, Git branch, worktree, and checkpoint refs. The
control is hidden when the selected provider cannot create an independent historical conversation.
It is also hidden when the connected server predates thread forking; update that environment's
T3 Code server to enable it.

## Thread alerts

With **Agent notifications** enabled in **Settings General**, T3 Code sends a system notification
when a background thread finishes, fails, or needs your approval — including threads in other
projects and on other connected environments. The thread you are currently looking at never
notifies. Turning the setting off stops notifications but keeps tracking, so re-enabling it does
not replay old activity.

The browser asks for notification permission when the setting is first turned on. If permission is
denied or unavailable, alerts fall back to an in-app toast. The mobile app keeps its own separate
notification controls.
