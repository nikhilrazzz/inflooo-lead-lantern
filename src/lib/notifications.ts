export function reminderAlertKey(reminder: { id: string; remind_at: string }) { return `${reminder.id}:${reminder.remind_at}`; }
export function shouldAlert(reminder: { user_id: string; completed: boolean; remind_at: string; id: string }, userId: string, now: number, dismissed: Set<string>) {
  return reminder.user_id === userId && !reminder.completed && Date.parse(reminder.remind_at) <= now && !dismissed.has(reminderAlertKey(reminder));
}
export function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname) || url.hostname.endsWith('.notify.windows.com')) && !url.username && !url.password;
  } catch { return false; }
}