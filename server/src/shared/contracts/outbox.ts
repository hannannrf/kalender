// Outbox message contracts (architecture section 6.1, ADR-002). Published by events; reminders (S07) and calendar-sync (S11) subscribe.
// Snapshots hold Event details only, never message text.

export type EventSnapshot = {
  eventId: string;
  userId: string;
  title: string;
  date: string; // PKT "YYYY-MM-DD"
  time: string | null; // PKT "HH:MM"; null means All-day
  place: string | null;
  sourceChatName: string; // the Chat name, or "Manual"
  at: string; // ISO instant of the confirm or edit; BR-08 decides against it, not against the dispatch time
};

export type OutboxMessage =
  | { type: 'EventConfirmed'; payload: EventSnapshot }
  | { type: 'EventUpdated'; payload: EventSnapshot }
  | { type: 'EventDeleted'; payload: { eventId: string; userId: string } }
  // S11: calendar-sync publishes CalendarLinked; events answers with one EventResync per Upcoming Confirmed Event (BR-18, Q-3).
  | { type: 'CalendarLinked'; payload: { userId: string } }
  | { type: 'EventResync'; payload: EventSnapshot };

export type OutboxType = OutboxMessage['type'];
