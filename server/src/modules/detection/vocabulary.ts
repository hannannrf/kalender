// Word lists as data (ADR-004), so they can grow without changing the rules. Lower case, matched on word boundaries.

/** BR-20 activity and deadline words, English and Roman Urdu. */
export const ACTIVITY = [
  'meeting', 'meetup', 'meet', 'sync', 'call', 'class', 'classes', 'lecture', 'lab', 'quiz', 'exam', 'test', 'midterm',
  'mid term', 'viva', 'presentation', 'seminar', 'workshop', 'session', 'tutorial', 'orientation', 'interview', 'practice',
  'match', 'party', 'dinner', 'lunch', 'dawat', 'event', 'hike', 'trip', 'paper', 'deadline', 'due', 'submit', 'submission',
  'jama', 'bhejna', 'bhejni', 'bhejne', 'rakh lete hain',
];

/** Activities whose title names the thing being handed in ("Assignment submission"). */
export const DEADLINE = ['deadline', 'due', 'submit', 'submission', 'jama', 'bhejna', 'bhejni', 'bhejne'];

/** Things handed in, longest first; used to name a deadline with no words before it. */
export const DELIVERABLE = ['lab report', 'assignment', 'proposal', 'report', 'project', 'survey', 'form', 'application', 'thesis'];

/** BR-20: the message refers only to the past. */
export const PAST = [
  'yesterday', 'was', 'were', 'went', 'had', 'did', 'last week', 'last night', 'last time', 'thanks', 'thank you',
  'thi', 'tha', 'thay', 'thin', 'hua', 'hui', 'huay', 'ho gaya', 'ho gayi', 'ho gya', 'hogaya', 'parhaya', 'parhai',
];

/** U9: tentative or conditional wording. */
export const TENTATIVE = ['shayad', 'shaayad', 'maybe', 'perhaps', 'possibly', 'tentative', 'tentatively', 'if', 'agar', 'plan', 'planning', 'ho sakta', 'ho sakti'];

/** A period with no single date gives "Needs date". */
export const PERIOD = [
  'next week', 'this week', 'agle hafte', 'agle haftay', 'agla hafta', 'is hafte', 'this weekend', 'weekend', 'end of month',
  'end of the month', 'month end', 'next month', 'agle mahine', 'is mahine', 'soon', 'jald',
];

export const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** Day names and Roman Urdu spellings; 0 = Sunday. "hafta" is left out because it also means "week". */
export const DAYS: Record<string, number> = {
  sunday: 0, itwar: 0, itwaar: 0, itvaar: 0,
  monday: 1, peer: 1, pir: 1,
  tuesday: 2, mangal: 2,
  wednesday: 3, budh: 3,
  thursday: 4, jumeraat: 4, jumerat: 4, jumairat: 4,
  friday: 5, jumma: 5, jummah: 5, juma: 5, jumay: 5, jummay: 5, jumme: 5,
  saturday: 6,
};

/** BR-12 part-of-day words that turn a bare hour into a clock time. */
export const PART_OF_DAY: Record<string, 'am' | 'noon' | 'pm' | 'night'> = {
  subah: 'am', morning: 'am',
  dopehar: 'noon', dopahar: 'noon', afternoon: 'noon',
  shaam: 'pm', sham: 'pm', evening: 'pm',
  raat: 'night', tonight: 'night', night: 'night',
};

/** U8: vague times with no clock time. */
export const VAGUE_TIME = ['after zuhr', 'after asr', 'after maghrib', 'after isha', 'zuhr ke baad', 'asr ke baad', 'maghrib ke baad', 'isha ke baad'];

/** Words never used in a title: function words, date and time words. */
export const TITLE_STOP = new Set([
  'the', 'a', 'an', 'our', 'my', 'your', 'their', 'for', 'on', 'at', 'to', 'in', 'of', 'by', 'with', 'from', 'and', 'or', 'ya',
  'ki', 'ka', 'ke', 'ko', 'ne', 'se', 'mein', 'me', 'pe', 'par', 'tak', 'hai', 'hain', 'is', 'are', 'will', 'be', 'wali', 'wala',
  'jo', 'wo', 'ye', 'yeh', 'sir', 'reminder', 'please', 'plz', 'dont', "don't", 'forget', 'all', 'everyone', 'guys', 'bhai',
  'kal', 'aaj', 'parson', 'today', 'tomorrow', 'tonight', 'next', 'this', 'agle', 'agla', 'baje', 'am', 'pm', 'shayad', 'maybe',
  'week', 'weekend', 'month', 'hafte', 'haftay', 'hafta', 'mahine', 'end', 'soon', 'jald',
]);

/** Copulas skipped once between the activity word and the words that name it ("report is due"). */
export const COPULA = new Set(['is', 'are', 'hai', 'hain', 'was', 'will', 'be']);

export const PLACE_NOUNS = ['library', 'ground', 'auditorium', 'canteen', 'cafeteria', 'cafe', 'office', 'hall', 'masjid', 'mosque'];
export const ONLINE_PLACES: Record<string, string> = { 'google meet': 'Google Meet', zoom: 'Zoom', teams: 'Teams', meet: 'Google Meet' };
