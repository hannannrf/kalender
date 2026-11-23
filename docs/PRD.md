# Product Requirements Document (PRD): WhatsApp & Calendar Sync

| Field | Value |
|---|---|
| Version | 1.1 (Validated: TA change requests applied and confirmed with Mahd) |
| Previous version | 1.0 (Validated, after AI critique and human validation, Deliverable 2) |
| Course | ISE1003 Introduction to Software Engineering, Deliverable 3 input |
| Client | Mahd Ahmed |
| Team | Abdul Hannan Rauf, Zain Amjad, Muhammad Areeb |

## Changes in v1.1

The TA (Maryam Farooq) asked for two changes after the Deliverable 2 demo. Both are applied here, and Mahd confirmed the decisions behind them (D-14 to D-18, change log at the end).

| Change | What the TA asked | What changed in this PRD |
|---|---|---|
| CR-1 | Resolve the WhatsApp-access dependency with a permitted, free access method, or agree a revised input workflow, and update the affected requirements. | Messages now enter only through WhatsApp's own **Export chat** feature: the User uploads a Chat Export. No unofficial client, linked device or WhatsApp Business Platform is used. OQ-01 is resolved. Approving, updating and validating Chats were rewritten (FR-02, FR-03, FR-13, NFR-01, NFR-02, NFR-04, BR-01, BR-02, BR-03, BR-05, BR-06, BR-15, C-02, C-04, MF-01, MF-02, MF-07, AC-02 to AC-04, AC-13). A working parser demonstrates the normal, boundary and failure cases. |
| CR-2 | Make Event detection measurable: criteria for English and Roman Urdu messages, ambiguous dates and times, and non-Events, and require User review of uncertain interpretations. | Added the Event Message criteria (BR-20), the ambiguity rules U1 to U9 with **Uncertain** marks (BR-21), a fixed 80-message Detection Test Set (Appendix A) and measurable thresholds (NFR-05). OQ-03 is resolved. The User must review every Uncertain detail before confirming (FR-06). BR-12, MF-03 and the AC-05 and AC-06 criteria were updated. |

## Problem

The User wants to avoid missing meetings, deadlines and other Events whose details were shared in WhatsApp Chats, without giving up the privacy of other Chats. Mahd most often misses deadlines and project meetings in class, project and society groups. Details get buried among newer messages, and copying them into a calendar by hand also takes effort. This happens about once a week and leads to missed or nearly missed Events.

## Product intent

The User chooses which Chats the system may read by exporting each one from WhatsApp and uploading the Chat Export. The system finds Event details in new messages from those exports and lets the User review and confirm Detected Events, checking any detail it is unsure of. It adds Confirmed Events to the User's calendar when one is connected, and reminds the User before they start. The User can also create Manual Events.

## Goals / Non-goals

### Goals

| ID | Goal |
|---|---|
| G-01 | The User does not have to copy Event details from an Approved Chat into a calendar by hand. |
| G-02 | The User receives a Reminder before each Confirmed Event, unless that Event's Reminder is turned off or its Reminder Time had already passed (BR-08). |
| G-03 | The User stays in control of privacy: only Approved Chats are read, and message text is kept no longer than BR-05 allows. |

### Non-goals

| ID | Non-goal |
|---|---|
| NG-01 | The system does not send, reply to, or delete WhatsApp messages. |
| NG-02 | The system does not read Chats that are not approved. |
| NG-03 | The system does not summarise Chats. |
| NG-04 | The system does not support other message sources, such as Telegram, SMS or email. |
| NG-05 | The system does not share Events with Chat members or collect RSVPs. |
| NG-06 | The system does not add Events to the Linked Calendar without User confirmation. |
| NG-07 | The system does not send more than one Reminder per Event (see OQ-04). |
| NG-08 | The system does not provide a full calendar view. The User sees an upcoming-Events list and can use the Linked Calendar for a calendar view. |
| NG-09 | The system does not support time zones other than Pakistan Standard Time. |
| NG-10 | The system does not read messages written in Urdu script. |
| NG-11 | Recurring Events are not supported. If a message mentions a recurring class or meeting, the system creates one Detected Event for the first date mentioned. |
| NG-12 | *(v1.1)* The system does not connect to WhatsApp or read messages automatically or in real time. It reads only Chat Exports the User uploads, so Events in messages not yet uploaded cannot be detected. |
| NG-13 | *(v1.1)* The system does not open photos, videos, voice notes or documents included in a Chat Export. |

## Users

| ID | Description |
|---|---|
| USR-01 | **User:** the person who owns an account on the system. The intended User receives meeting, deadline and Event details in WhatsApp Chats and wants reminders for them. |
| USR-02 | **Representative User:** Mahd, who confirmed the intended-user description and the product policies recorded in the decision log, and confirmed the v1.1 decisions D-14 to D-18. |
| USR-03 | **User role:** the system has one User role. A User can see only their own Chats, messages and Events. |

## Glossary

| ID | Term | Definition |
|---|---|---|
| GL-01 | User | The person who owns an account on the system. |
| GL-02 | Chat Export | *(v1.1, replaces "WhatsApp Account")* The text file WhatsApp creates when the User chooses Export chat > Without media in a Chat: a `.txt` file on Android, or a `.zip` file containing `_chat.txt` on iPhone. |
| GL-03 | Chat | A single WhatsApp conversation, either with one person (individual Chat) or a group (group Chat). |
| GL-04 | Approved Chat | A Chat the User has explicitly allowed the system to read by uploading its Chat Export and confirming it. Only Approved Chats are read. |
| GL-05 | Approval Time | The date and time at which a Chat became an Approved Chat. |
| GL-06 | Revoke | The User's action of removing a Chat from the Approved Chats. |
| GL-07 | Synced Message | A text message from an Approved Chat's uploaded Chat Export, sent at or after the Start Point and not read before, that the system has read. |
| GL-08 | Event | A planned activity with a date, such as a meeting, class, party or deadline. "Meeting" is a kind of Event, not a separate term. |
| GL-09 | Detected Event | An Event the system has found in a Synced Message that is waiting for the User's decision. If no date is found, it is held in a "Needs date" state until the User assigns a date. |
| GL-10 | Confirmed Event | An Event the User has confirmed or created. Confirmed Events receive Reminders, and are added to the Linked Calendar when one is connected and the calendar update succeeds. |
| GL-11 | Manual Event | A Confirmed Event the User created themself, not from a Chat. It is shown as "Manual" in place of a Source Chat. |
| GL-12 | Source Chat / Source Message | The Approved Chat and the original message from which a Detected Event came. The original message text is kept only as BR-05 allows. |
| GL-13 | Possible Duplicate | A Detected Event that matches an existing Detected Event or Confirmed Event by Source Chat and date (BR-04). It is a hint; the User decides what to do. |
| GL-14 | Linked Calendar | The User's Google Calendar, once connected. The primary calendar is used. |
| GL-15 | Reminder | A notification the system sends or presents to the User before a Confirmed Event. |
| GL-16 | Lead Time | How long before a Confirmed Event's start time its Reminder is scheduled. |
| GL-17 | Read | To check the text of a message for Events. Only Synced Messages are read. To find them, the system looks at the sent time of every line in an uploaded Chat Export; lines sent before the Start Point, or already read, are skipped without their text being checked or stored. |
| GL-18 | All-day Event | An Event with a date but no time. |
| GL-19 | Needs date | The state of a Detected Event with no exact date. It cannot be confirmed until the User enters a date. |
| GL-20 | Reminder Time | The Event's start time minus its Lead Time. |
| GL-21 | Upcoming | A Confirmed Event whose start time has not passed. An All-day Event is upcoming until the end of its date. |
| GL-22 | Calendar update failed | The mark on a Confirmed Event whose Linked Calendar copy could not be added, changed or removed after the retries in BR-10. |
| GL-23 | Upload | *(v1.1)* The User's action of giving the system a Chat Export, either to approve a Chat or to update an Approved Chat. |
| GL-24 | Look-back Period | *(v1.1)* How far before the Approval Time the first upload of a Chat is read: 1, 3 or 7 days. The default is 7 days. |
| GL-25 | Start Point | *(v1.1)* The Approval Time minus the Look-back Period. Messages sent before it are never read. |
| GL-26 | Read-up-to Point | *(v1.1)* The sent time of the newest message already read for an Approved Chat. |
| GL-27 | Event Message / Non-Event Message | *(v1.1)* A message that does or does not meet the Event criteria in BR-20. |
| GL-28 | Uncertain | *(v1.1)* A mark on a Detected Event's date, time or on the Event itself, meaning the value came from an interpretation rule in BR-21 rather than being stated plainly. The User must accept or correct it before confirming. |
| GL-29 | Detection Test Set | *(v1.1)* The fixed set of 80 labelled messages in Appendix A, used to measure detection (NFR-05). |

## Functional requirements

These are the 13 core user capabilities. Detailed policies are listed under Business rules.

| ID | Requirement |
|---|---|
| FR-01 | The system shall allow a person to create an account and sign in to it. |
| FR-02 | *(v1.1)* The system shall allow the User to approve a Chat by uploading its Chat Export, confirming the Chat name, and choosing the Look-back Period. |
| FR-03 | *(v1.1)* The system shall allow the User to update an Approved Chat by uploading a newer Chat Export of that Chat, and to view their Approved Chats with each Chat's Approval Time and last upload time. |
| FR-04 | The system shall allow the User to Revoke an Approved Chat. |
| FR-05 | *(v1.1)* The system shall detect Events in English and Roman Urdu Synced Messages, following BR-12, BR-20 and BR-21, and list them as Detected Events with the identified Event details, the Source Chat, and an Uncertain mark on every detail that was interpreted rather than stated plainly. |
| FR-06 | *(v1.1)* The system shall allow the User to review a Detected Event, correct its interpreted details, confirm it, dismiss it, or choose how to handle a Possible Duplicate. A Detected Event with any Uncertain detail can be confirmed only after the User has accepted or corrected each Uncertain detail. |
| FR-07 | The system shall allow the User to create a Manual Event. |
| FR-08 | The system shall allow the User to connect Google Calendar, and shall keep Confirmed Events in it, adding, changing and removing them as they change in the system. |
| FR-09 | The system shall provide a Reminder for each Confirmed Event at its Reminder Time, as a phone notification, and also inside the system when phone notifications are unavailable or disabled. |
| FR-10 | The system shall allow the User to set the default Lead Time, and to change or turn off the Reminder for an individual Confirmed Event. |
| FR-11 | The system shall allow the User to view Upcoming Confirmed Events in date order, with the Source Chat or "Manual" shown for each Event. |
| FR-12 | The system shall allow the User to edit or delete a Confirmed Event. |
| FR-13 | *(v1.1)* The system shall allow the User to unlink their Linked Calendar and to delete their account. |

## Non-functional requirements (NFRs)

| ID | Requirement | Verification |
|---|---|---|
| NFR-01 | *(v1.1)* **Privacy:** The system shall not read or store messages sent before an Approved Chat's Start Point, messages from a Chat other than the one being approved or updated, or the uploaded Chat Export file after it has been processed. | Approve Chat A with a Chat Export holding 10 messages sent before the Start Point and 20 after it. Then upload Chat B's export as an update to Chat A. Inspect stored data and logs: zero pre-Start-Point messages and zero Chat B messages are stored or checked for Events, and no uploaded file remains after processing. |
| NFR-02 | *(v1.1)* **Performance:** Detected Events from an upload shall appear in the Detected Events list within 60 seconds of the upload finishing, for at least 19 of 20 test uploads, each a Chat Export of up to 10,000 lines with up to 300 messages to be read. | Upload 20 such exports and time each one from upload finished to Detected Events shown. At most 1 may take longer than 60 seconds. |
| NFR-03 | **Reminder reliability:** At least 98% of Reminders shall be sent or presented no earlier than their Reminder Time and no later than 1 minute after it, as recorded in the system log. | Schedule at least 50 Reminders over one week of testing and compare each logged time with its Reminder Time. |
| NFR-04 | *(v1.1)* **Usability:** Each of three first-time Users shall export a Chat from WhatsApp, approve it in the system and confirm one Detected Event within 5 minutes, using only on-screen guidance and no help from another person. | Observe Mahd and two other first-time Users. Timing starts after account creation and includes exporting the Chat in WhatsApp. The test passes only if all three succeed. |
| NFR-05 | *(v1.1)* **Detection quality:** On the Detection Test Set (Appendix A), detection shall meet all of these thresholds. **M1:** at least 90% of clear Event Messages produce a Detected Event, measured separately for English (at least 18 of 20) and Roman Urdu (at least 18 of 20). **M2:** at least 90% of those Detected Events have the correct date and start time, or are correctly All-day. **M3:** at least 18 of the 20 ambiguous messages produce a Detected Event, and 100% of those carry the required Uncertain marks or "Needs date". **M4:** at most 4 of the 20 Non-Event Messages produce a Detected Event, and none of the 8 past-reference messages do. | Run all 80 messages through detection as if sent on Monday 19 October 2026 at 10:00 PKT, and score the output against the expected columns. FR-05 is accepted only when every threshold is met. The set is fixed before testing and is not changed to make a run pass. A failed run means detection is fixed and all 80 messages are run again. |

## Business rules

| ID | Rule |
|---|---|
| BR-01 | *(v1.1)* No Chat is an Approved Chat by default. A Chat becomes approved only when the User uploads its Chat Export and confirms it. The system has no other access to WhatsApp. |
| BR-02 | *(v1.1)* When a Chat is approved, only text messages sent at or after its Start Point are read. On each later upload of that Chat, only messages sent after its Read-up-to Point are read, plus any message sent in the same minute as the Read-up-to Point that was not read before. Each message is read only once, even when it appears in several uploads. A message whose check fails is checked again and counts as read only when the check succeeds. |
| BR-03 | *(v1.1)* The system checks text messages only. Lines showing omitted or attached photos, videos, voice notes, stickers or documents are ignored, and media files inside a `.zip` export are never opened. WhatsApp notices (for example "Messages and calls are end-to-end encrypted" or "X added Y") and "This message was deleted" lines are ignored. |
| BR-04 | A Detected Event is a Possible Duplicate when an existing Detected Event or Confirmed Event has the same Source Chat and date. Manual Events are not compared. The User chooses to add a new Event, update the existing Event, or dismiss it. |
| BR-05 | *(v1.1)* An uploaded Chat Export file is deleted as soon as it has been processed. A Synced Message with no Event is deleted immediately after checking. A message that produces one or more Detected Events is kept only until all of them are confirmed, dismissed or removed. After confirmation, only Event details and the Source Chat name remain. Dismissal deletes the Detected Event and its Source Message immediately. A "Needs date" Detected Event that is still not confirmed or dismissed is deleted, with its Source Message, 7 days after the message was sent. |
| BR-06 | *(v1.1)* When a Chat is Revoked, its Synced Messages and unconfirmed Detected Events are deleted, its Read-up-to Point is cleared, and Confirmed Events remain without the original message text. A later upload of that Chat is refused until the User approves it again, which sets a new Approval Time and Start Point. |
| BR-07 | The default Lead Time is 30 minutes. The User may choose 10 minutes, 30 minutes, 1 hour or 1 day. An All-day Event is all-day in the system and in the Linked Calendar; 09:00 is used only to calculate its Reminder Time. |
| BR-08 | A Reminder is not scheduled if its Reminder Time has already passed when the Event is confirmed. If an Event edit or Lead Time change would put the Reminder Time in the past, no Reminder is scheduled. |
| BR-09 | Calendar synchronisation is one-way. Changes made directly in the Linked Calendar are not brought back into the system. If an Event is deleted directly in the Linked Calendar, it is not automatically brought back; a later edit in the system re-adds its copy. |
| BR-10 | If adding, changing or removing an Event in the Linked Calendar fails, the Confirmed Event and its Reminder remain. The Event is marked "Calendar update failed". The system retries automatically up to three times within 15 minutes, then allows a manual retry. Pending retries are cancelled when the Event is deleted, the Linked Calendar is unlinked or the account is deleted. |
| BR-11 | A User can access only their own Chats, messages and Events. There is one User role. |
| BR-12 | *(v1.1)* Dates and times are in Pakistan Standard Time, and relative words are calculated from the message's sent date and time. **Dates:** numeric dates are read day/month; a date without a year means its next occurrence on or after the sent date. "Today"/"aaj" and "tonight"/"aaj raat" mean the sent date, "tomorrow"/"kal" the next date, and "parson" the date after that; with a past-tense verb ("thi", "hua", "was") they refer to the past. A day name ("Friday", "jumma") means the next date with that name after the sent date. When a day name and an explicit date are both given, the explicit date is used. **Times:** "am"/"pm" and 24-hour times are used as written. In Roman Urdu, "subah" means morning (AM), "dopehar" early afternoon (PM), and "shaam" and "raat" evening or night (PM). "Sawa", "sadhe" and "paune" add a quarter, add a half or take away a quarter of an hour; "dedh" is 1:30 and "dhai" is 2:30. For a time range, the start time is used. Every interpretation is shown to the User before confirmation so they can correct it, and the cases in BR-21 are also marked Uncertain. |
| BR-13 | A Possible Duplicate is only a hint and may flag unrelated Events that share the same Source Chat and date; the same Event posted in two Chats is not flagged. If the User chooses "update the existing Event", that Event takes the new date, time and place. A Confirmed Event's Reminder and calendar copy are updated too, and an existing Detected Event is replaced. |
| BR-14 | Unreviewed Detected Events remain in a separate Detected Events list, not mixed with Confirmed Events. A dated Detected Event is removed, together with its Source Message, at the end of its date. A "Needs date" Detected Event follows BR-05. |
| BR-15 | *(v1.1, replaces the WhatsApp-unlink rule)* An upload is refused, and nothing in it is read or stored, if it is not a `.txt` or `.zip` WhatsApp Chat Export, if no WhatsApp message lines are found in it, or, when updating an Approved Chat, if the export is of a different Chat. When approving, the system shows the Chat name taken from the file, and the User confirms or corrects it. If every date in the file fits both day/month and month/day (for example 05/10), the system asks the User which order the phone uses before reading anything; day/month is offered first. |
| BR-16 | An Event must have a title. Its date, and time if it has one, cannot be in the past when it is created, edited or confirmed. An Event that has become past while awaiting review must be edited to a future date or dismissed. |
| BR-17 | *(v1.1)* If one message mentions several Events, the system creates one Detected Event for each. A dated conditional or tentative mention still creates a Detected Event, with the Event marked Uncertain (BR-21, U9). A message edited in WhatsApp before its Chat is uploaded is read in its edited form; one edited or deleted after it was read does not change an existing Detected or Confirmed Event. |
| BR-18 | When the Linked Calendar is connected or reconnected, Upcoming Confirmed Events are added if they do not already have a copy there. Events that already have a copy are not added again. |
| BR-19 | Changing the default Lead Time applies to new Confirmed Events and to Upcoming Confirmed Events that use the default. Events with an individually set Lead Time keep it. |
| BR-20 | *(v1.1)* **Event Message criteria.** A text message is an Event Message when it announces, schedules or reminds about an activity or deadline that will happen at or after the message's sent time. It needs an activity or deadline word. Examples in English are meeting, class, lab, quiz, exam, midterm, viva, presentation, seminar, workshop, practice, match, party, dinner, deadline, due and submit. Examples in Roman Urdu are meeting, class, paper, jama karwana, submit karna, bhejna, dawat and "rakh lete hain". A date or time is not required (without a date it becomes "Needs date"). A message is a **Non-Event Message** when it has no activity or deadline word, refers only to the past (for example "kal ki class boring thi", "the meeting yesterday went well"), or only asks about or comments on something without planning it. Mixed English and Roman Urdu in one message is supported. Urdu script and non-text messages are outside scope (NG-10, BR-03). |
| BR-21 | *(v1.1)* **Uncertain interpretations.** A detail is marked Uncertain when it comes from one of these rules. **U1:** a bare hour without am/pm or subah/dopehar/shaam/raat ("5 baje", "at 7", "3-5") means 1-7 = PM, 8-11 = AM and 12 = 12:00 noon, and the time is marked Uncertain. **U2:** "12 at night"/"raat 12 baje" means 00:00 on the following date, and the date and time are Uncertain. **U3:** a numeric date whose day and month are both 12 or less (for example 03/11) is read day/month, and the date is Uncertain. **U4:** "next Friday"/"agle Friday" means that day in the following Monday-to-Sunday week, and the date is Uncertain. **U5:** a day name that is the sent date's own weekday means 7 days later, and the date is Uncertain. **U6:** a day name that does not match the explicit date given means the explicit date is used, and the date is Uncertain. **U7:** alternatives ("22 or 23 Oct", "22 ya 23") mean the first one, and the date is Uncertain. **U8:** a vague time with no clock time ("subah", "after Zuhr", "evening") makes an All-day Event, and the time is Uncertain. **U9:** tentative or conditional wording ("shayad", "maybe", "if", "plan") marks the Event itself Uncertain. A period with no single date ("next week", "agle hafte", "this weekend", "end of month") gives "Needs date". Uncertain details are highlighted, and confirming is refused until the User accepts or corrects each one (FR-06). |

## Constraints

| ID | Constraint |
|---|---|
| C-01 | The work must be completed by the student team within the semester. |
| C-02 | *(v1.1)* WhatsApp messages enter the system only through Chat Exports the User makes with WhatsApp's own Export chat feature, which is free and built into WhatsApp. Unofficial WhatsApp clients, linked-device connections, automated access to WhatsApp and the WhatsApp Business Platform are not used. |
| C-03 | Only free tools, services and free tiers may be used. |
| C-04 | *(v1.1)* The product should be phone-first. The User must be able to upload a Chat Export from the same phone, for example by sharing it from WhatsApp's export screen. The specific platform is an architecture decision (OQ-02). |
| C-05 | Phone notifications are the Reminder delivery method; Reminders must also be presented inside the system when phone notifications are unavailable or disabled. |

## Main flows & edge cases

### MF-01: Create an account (FR-01)
1. The person creates an account and signs in.
2. No Chats are approved.

**Edge cases**
- A returning User signs in to their existing account and sees their own data only (BR-11).

### MF-02: Approve, update or Revoke a Chat (FR-02, FR-03, FR-04)
1. In WhatsApp, the User opens a Chat and chooses Export chat > Without media, then shares or saves the file.
2. The User uploads the Chat Export to the system and chooses "Approve a new Chat".
3. The system checks the file (BR-15) and shows the Chat name from it. The User confirms the name and chooses the Look-back Period (default 7 days).
4. The system records the Approval Time and Start Point, reads the text messages sent since the Start Point (BR-02, BR-03), and deletes the uploaded file (BR-05).
5. Later, the User exports the same Chat again and uploads it to "Update" that Approved Chat. Only messages sent after its Read-up-to Point are read.
6. The User may Revoke an Approved Chat; BR-06 applies.

**Edge cases**
- The file is not a WhatsApp Chat Export, or has no message lines: refused, and nothing is read or stored.
- An export of a different Chat is uploaded as an update: refused, and the Approved Chat is unchanged.
- Every date in the file fits both day/month and month/day: the User is asked which order to use before anything is read.
- An iPhone `.zip` export contains media: only `_chat.txt` is read, and media files are never opened.
- The new export overlaps the previous one: messages already read are not read again, and a new message sent in the same minute as the Read-up-to Point is read.
- An export with no new messages: the system says there are no new messages to read.
- A message sent before the Start Point is not read, even though it is in the file.
- After a Revoke, uploading that Chat is refused until it is approved again.

### MF-03: Detect and decide on Events (FR-05, FR-06)
1. The system checks each Synced Message once.
2. If it is a Non-Event Message (BR-20), it is deleted immediately after checking.
3. If it mentions one or more Events, the system shows a Detected Event for each, with the identified details, the Source Chat, and any Uncertain marks (BR-21).
4. The User reviews the interpretation. Each Uncertain detail must be accepted or corrected. The User then confirms or dismisses the Detected Event. For a Possible Duplicate, the User chooses to add, update or dismiss.
5. Confirmation creates a Confirmed Event, schedules its Reminder, and adds it to the Linked Calendar if one is connected. A calendar failure does not block confirmation.
6. The original message text is deleted as BR-05 states.

**Edge cases**
- A bare hour ("kal 5 baje"): 17:00, marked Uncertain (U1).
- A day name that is the sent date's own weekday ("Monday ko paper hai", sent on a Monday): 7 days later, marked Uncertain (U5).
- "Next Friday", a numeric date like 03/11, conflicting day and date, or two alternative dates: interpreted by U3, U4, U6 or U7 and marked Uncertain.
- Only a period ("agle hafte presentation hai") or no date: shown as "Needs date". The User must assign a date before confirmation; if still not acted on, it is deleted after 7 days.
- A vague time ("parson subah"): All-day, with the time marked Uncertain (U8).
- Date but no time: stored as an All-day Event, and 09:00 is used only for the Reminder calculation.
- A message about the past ("the meeting yesterday went well", "kal ki class boring thi"): not detected.
- If an Event becomes past while awaiting review, it cannot be confirmed until it is edited to a future date.
- Missing details are not filled in from other messages.
- A dated tentative mention ("shayad kal meeting ho 4pm") is detected, with the Event marked Uncertain (U9).
- Recurring Events are not supported; one Detected Event is created for the first date mentioned.
- A Possible Duplicate may be a false positive, because matching uses only Source Chat and date.
- An unreviewed dated Detected Event is removed at the end of its date.

### MF-04: Create, edit or delete an Event (FR-07, FR-12)
1. The User may create a Manual Event, which has no Source Chat.
2. The User may edit or delete a Confirmed Event.
3. Edits and deletions update the Event, its Reminder and its Linked Calendar copy.

**Edge cases**
- An empty title, or a date or time in the past, is refused (BR-16).
- If an Event edit would place its Reminder Time in the past, no Reminder is scheduled.
- If an Event was deleted directly in the Linked Calendar, it is not brought back automatically, but a later edit in the system re-adds its copy.
- Partial calendar-update failures are a design matter; the user-visible policy is BR-10.

### MF-05: Reminders (FR-09, FR-10)
1. Each Confirmed Event has one Reminder, unless the User turns it off.
2. The default Lead Time is 30 minutes; the User can select 10 minutes, 30 minutes, 1 hour or 1 day. A new default applies as BR-19 states.
3. Reminders are sent as phone notifications, and are also presented inside the system if phone notifications are unavailable or disabled.

**Edge cases**
- If the Reminder Time has passed, no Reminder is scheduled.
- For an All-day Event, 09:00 is used to calculate the Reminder (08:30 with the default Lead Time), while the Event stays all-day in the system and the calendar.
- The phone's own notification-preview settings control whether details appear on the lock screen.

### MF-06: Connect or disconnect Google Calendar (FR-08, FR-13)
1. The User connects Google Calendar; the primary calendar is used.
2. Upcoming Confirmed Events are added if they do not already have a copy there, and future Confirmed Events are added as well.
3. Calendar synchronisation is one-way.
4. The User may unlink the calendar, after which no further Events are added to it.

**Edge cases**
- If a calendar update fails, the Confirmed Event and Reminder remain and BR-10 applies.
- Reconnecting the calendar does not add a second copy of an Event that is already there.
- If Google access expires, it is treated as a calendar update failure. Pending retries are cancelled on unlink.
- Calendar changes the User makes directly in Google Calendar are not imported into the system.
- Events already in Google Calendar stay there after the calendar is unlinked or the account is deleted.

### MF-07: Delete the account (FR-13)
1. When the User deletes their account, the User's stored data, Approved Chats and Google access token are deleted.

**Edge cases**
- After deletion, the account cannot sign in and no upload is accepted for it.
- Backups are outside the defined deletion test scope and are deferred to design.

## Acceptance criteria

Unless stated otherwise, example messages are sent on Monday 19 October 2026 at 10:00 PKT. Upload examples use the sample exports in `fixtures/exports/samples` (mapped to these criteria in `fixtures/README.md`). For the two TA changes, **N** marks a normal case, **B** a boundary case and **F** a failure case.

| ID | FR | Acceptance criterion |
|---|---|---|
| AC-01.1 | FR-01 | Given a new person, when they create an account, then they are signed in; a returning User can sign in to their existing account. |
| AC-01.2 | FR-01 | Given User A is signed in, when A tries to open an Event that belongs to User B, then access is refused (BR-11). |
| AC-02.1 | FR-02 | **N (CR-1).** Given an Android Chat Export of "SE-3D Class" uploaded on Monday 19 October 2026 at 10:25 with the default 7-day Look-back Period, when the User confirms the Chat name, then "SE-3D Class" is an Approved Chat with Start Point 12 October 2026 10:25, and exactly the 6 text messages sent since then are read. Messages from 1, 8 and 11 October, the media line, the deleted-message line and WhatsApp notices are not read, and a three-line message is read as one message. |
| AC-02.2 | FR-02 | **N (CR-1).** Given an iPhone `.zip` Chat Export of "ISE Project Team" containing a photo, when it is approved with a 3-day Look-back Period, then the 2 text messages sent since the Start Point are read and the photo file is never opened. |
| AC-02.3 | FR-02 | **F (CR-1).** Given a file that is not a WhatsApp Chat Export (a renamed note or an unrelated `.txt`), when it is uploaded, then it is refused with a reason, no Chat is created, and nothing from it is stored. |
| AC-02.4 | FR-02 | **B (CR-1).** Given a Chat Export whose dates all fit both day/month and month/day, when it is uploaded, then the system asks the User which order to use before reading anything; after the User chooses day/month, a message dated 05/10 (before the Start Point) is not read. |
| AC-02.5 | FR-02 | Given a new account, then zero Chats are approved and no message is read. |
| AC-03.1 | FR-03 | **B (CR-1).** Given "SE-3D Class" was approved at 10:25 on 19 October, when a newer export of it is uploaded on 22 October, then only the 3 messages not read before are read. This includes a new message sent at 10:25 on 19 October, while the two 10:25 messages already read are not read again. |
| AC-03.2 | FR-03 | **F (CR-1).** Given "SE-3D Class" is an Approved Chat, when the User uploads an export of the Chat "Ammi" as its update, then the upload is refused, nothing is read, and the Read-up-to Point of "SE-3D Class" is unchanged. |
| AC-03.3 | FR-03 | Given two Approved Chats, when the User opens the Approved Chats list, then each Chat is shown with its Approval Time and last upload time. |
| AC-04.1 | FR-04 | Given an Approved Chat with a Detected Event, when the User Revokes it, then the unconfirmed Detected Event and its Source Message text are deleted, while any Confirmed Event remains. |
| AC-04.2 | FR-04 | **F (CR-1).** Given a Revoked Chat, when its Chat Export is uploaded as an update, then the upload is refused and nothing is read until the User approves the Chat again, which sets a new Approval Time and Start Point. |
| AC-05.1 | FR-05 | **N (CR-2).** Given "Meeting tomorrow at 3pm in Room 4" is read, then a Detected Event appears with date 20 October 2026, time 15:00, place Room 4 and the Source Chat, with no Uncertain marks. |
| AC-05.2 | FR-05 | **N (CR-2).** Given "kal shaam 5 baje project meeting hai" is read, then a Detected Event appears with date 20 October 2026 and time 17:00, with no Uncertain marks. |
| AC-05.3 | FR-05 | **B (CR-2).** Given "kal 5 baje project meeting hai" is read, then a Detected Event appears with date 20 October 2026 and time 17:00, and the time is marked Uncertain (U1). |
| AC-05.4 | FR-05 | Given a Non-Event text message such as "anyone has the slides?" is checked, then no Detected Event is created and the message is not stored after checking. |
| AC-05.5 | FR-05 | Given an Approved Chat's export contains a voice note, image, video, document or Urdu-script message, then it is ignored and no Detected Event is created. |
| AC-05.6 | FR-05 | **B (CR-2).** Given "agle hafte presentation hai" is read, then a Detected Event marked "Needs date" appears and cannot be confirmed until a date is entered. |
| AC-05.7 | FR-05 | **B (CR-2).** Given "The meeting yesterday went well" or "kal ki class bohat boring thi" is read, then no Detected Event is created. |
| AC-05.8 | FR-05 | **N / F (CR-2).** Given the 80-message Detection Test Set (Appendix A), when it is run through detection, then the results meet every NFR-05 threshold (M1 to M4). A run that misses any threshold fails this criterion, and FR-05 is not accepted. |
| AC-05.9 | FR-05 | Given "Lab report due Friday" is read, then a Detected Event appears as an All-day Event on 23 October 2026. |
| AC-05.10 | FR-05 | Given a Confirmed Event on 23 October 2026 from Chat A, when "Friday's meeting is now at 5pm" is read from Chat A, then the new Detected Event is marked Possible Duplicate and shows the existing Event. |
| AC-05.11 | FR-05 | Given a "Needs date" Detected Event that is never confirmed or dismissed, then it and its Source Message are deleted 7 days after the message was sent. |
| AC-05.12 | FR-05 | **B (CR-2).** Given "Monday ko paper hai" is read from a message sent on Monday 19 October 2026, then the Detected Event is dated 26 October 2026 and its date is marked Uncertain (U5). |
| AC-05.13 | FR-05 | **B (CR-2).** Given "meeting Friday 24/10 at 3pm" is read, then the Detected Event is dated 24 October 2026 (a Saturday) at 15:00, and its date is marked Uncertain (U6). |
| AC-06.1 | FR-06 | **N (CR-2).** Given a Detected Event with no Uncertain marks, when the User confirms it in one action, then it becomes a Confirmed Event, leaves the Detected Events list, and its Source Message text is deleted. |
| AC-06.2 | FR-06 | Given a Detected Event, when the User edits its time and confirms it, then the Confirmed Event has the edited time. |
| AC-06.3 | FR-06 | Given a Detected Event, when the User dismisses it, then it is removed, no Confirmed Event is created, and its Source Message text is deleted. |
| AC-06.4 | FR-06 | Given a Possible Duplicate whose existing Confirmed Event is in Google Calendar, when the User chooses "update the existing Event", then that Event, its Reminder and its calendar copy take the new date, time and place, and no new Event is created. |
| AC-06.5 | FR-06 | Given a Detected Event, when the User edits its date to 18 October 2026, then confirming is refused. |
| AC-06.6 | FR-06 | Given an unreviewed Detected Event dated 20 October 2026, then it is removed from the Detected Events list at the end of 20 October 2026. |
| AC-06.7 | FR-06 | **F (CR-2).** Given the Detected Event from "kal 5 baje project meeting hai" with its time marked Uncertain, when the User tries to confirm without reviewing the time, then confirming is refused and the time is highlighted. |
| AC-06.8 | FR-06 | **B (CR-2).** Given the same Detected Event, when the User accepts 17:00 or changes it to 05:00, then the Uncertain mark is cleared and the User can confirm in one action with the reviewed time. |
| AC-07.1 | FR-07 | Given the User enters a title and a future date for a Manual Event, when they save it, then a Confirmed Event shown as "Manual" is created. |
| AC-07.2 | FR-07 | Given a Manual Event with an empty title or a past date, when the User tries to save it, then the system refuses and explains why. |
| AC-08.1 | FR-08 | Given a Linked Calendar, when a Detected Event is confirmed, then the Event appears in the primary Google Calendar with the same title, date and time. |
| AC-08.2 | FR-08 | Given existing Upcoming Confirmed Events, when the User connects Google Calendar, then each Event without a calendar copy is added. |
| AC-08.3 | FR-08 | Given a Confirmed Event that already has a copy in Google Calendar, when the calendar is reconnected, then no second copy is added. |
| AC-09.1 | FR-09 | Given a Confirmed Event at 15:00 with a 30-minute Lead Time, then its Reminder is sent or presented between 14:30 and 14:31. |
| AC-09.2 | FR-09 | Given a Confirmed Event is deleted, then its Reminder is not sent or presented. |
| AC-09.3 | FR-09 | Given phone notifications are disabled or unavailable, when a Reminder becomes due, then it is still presented inside the system. |
| AC-09.4 | FR-09 | Given an Event at 15:00 with a 30-minute Lead Time, when it is confirmed at 14:45, then no Reminder is scheduled. |
| AC-09.5 | FR-09 | Given an All-day Confirmed Event on 23 October 2026 with the default Lead Time, then its Reminder is sent between 08:30 and 08:31 on 23 October 2026. |
| AC-10.1 | FR-10 | Given the default Lead Time is changed to 1 hour, when a new Event is confirmed, then its Reminder is scheduled 1 hour before the Event. |
| AC-10.2 | FR-10 | Given the User turns off the Reminder for one Event, then no Reminder is scheduled for that Event. |
| AC-10.3 | FR-10 | Given an Event with an individually set Lead Time, when the default Lead Time changes, then that Event keeps its individually set Lead Time. |
| AC-10.4 | FR-10 | Given an Upcoming Event that uses the default Lead Time, when the default is changed to 1 hour, then its Reminder is rescheduled to 1 hour before the Event. |
| AC-11.1 | FR-11 | Given three Upcoming Confirmed Events, when the User opens the Events list, then all three appear in date-and-time order with their Source Chat or "Manual". |
| AC-11.2 | FR-11 | Given a Confirmed Event whose start time has passed, then it is not shown in the Events list. |
| AC-12.1 | FR-12 | Given a Confirmed Event with a Linked Calendar copy, when the User edits its time, then the system Event, its Reminder and its calendar copy all show the new time. |
| AC-12.2 | FR-12 | Given a Confirmed Event with a Linked Calendar copy, when the User deletes it, then it is removed from the system and from Google Calendar, and its Reminder is cancelled. |
| AC-13.1 | FR-13 | Given the User deletes their account, then the User can no longer sign in, and no upload is accepted for the account. |
| AC-13.2 | FR-13 | Given the User unlinks Google Calendar, then no further Events are added to that calendar. |
| AC-13.3 | FR-13 | Given the User deletes their account, then the User's stored data, Approved Chats and Google access token are absent from the system's stored data; backup deletion is deferred to design. |

## Open Questions

| ID | Open question | Status | Related items |
|---|---|---|---|
| OQ-01 | Which WhatsApp access method is both permitted under WhatsApp's terms and free? | **Resolved in v1.1:** WhatsApp's own Export chat feature, uploaded by the User (D-14, confirmed by Mahd). Live access was rejected because WhatsApp's terms forbid accessing its Services "through automated or other means" and unofficial linked-device clients risk the User's number being banned. The WhatsApp Business Platform only serves business numbers and cannot read a person's private Chats. | FR-02, FR-03, C-02 |
| OQ-02 | Which phone-first platform is feasible, including uploading a Chat Export from the phone and reliable phone notifications within free tiers? | Open; decided as an architecture decision in Deliverable 3. It no longer depends on OQ-01. | C-04, C-05, FR-09 |
| OQ-03 | What numeric detection-accuracy threshold is acceptable? | **Resolved in v1.1:** NFR-05 thresholds M1 to M4 on the Detection Test Set, confirmed by Mahd (D-17). | FR-05, NFR-05, AC-05.8 |
| OQ-04 | Is a "Snooze" option for Reminders required? It appeared in the Deliverable 1 prototype, but the team has not decided whether it is in scope. If it is, NG-07 must change to allow a snoozed repeat. | Open | FR-09, NG-07 |
| OQ-05 | *(v1.1)* Should the system remind the User to upload new exports of their Approved Chats (for example once a day), since Events are found only in uploaded messages (NG-12)? | Open (D-19). If Mahd wants it, it becomes a new FR. | NG-12, FR-03 |

## Change log v1.0 → v1.1 (decisions confirmed with Mahd)

| ID | Decision | Source | Affects |
|---|---|---|---|
| D-14 | Messages enter only through Chat Exports the User makes with WhatsApp's Export chat and uploads. Approving a Chat means uploading its export and confirming it. | TA CR-1; feasibility check (WhatsApp terms of service and the Export chat feature) | FR-02, FR-03, FR-13, NFR-01, NFR-02, NFR-04, BR-01–BR-03, BR-05, BR-06, BR-15, C-02, C-04, NG-12, NG-13, MF-01, MF-02, MF-07, AC-02–AC-04, AC-13, OQ-01 |
| D-15 | The first upload of a Chat reads messages from the last 7 days by default; the User may choose 1, 3 or 7 days. Later uploads read only messages not read before. | CR-1 (replaces "only messages after approval", which would read nothing from a first export) | GL-24–GL-26, BR-02, AC-02.1, AC-03.1 |
| D-16 | The Event Message criteria (BR-20), the date and time rules (BR-12) and the ambiguity rules U1–U9 (BR-21). A day name on its own weekday now means 7 days later (v1.0 read it as the same day, which made "Monday ko paper hai" sent on a Monday a past Event). | TA CR-2 | BR-12, BR-17, BR-20, BR-21, MF-03, AC-05.1–AC-05.13 |
| D-17 | Detection thresholds M1–M4 on the 80-message Detection Test Set. | TA CR-2; resolves OQ-03 | NFR-05, AC-05.8, Appendix A |
| D-18 | Every Uncertain detail must be accepted or corrected before a Detected Event can be confirmed. | TA CR-2 | FR-06, BR-21, AC-06.1, AC-06.7, AC-06.8 |
| D-19 | Whether to add a daily reminder to upload new exports: still open. | CR-1 consequence | OQ-05 |

Removed in v1.1: unlinking a WhatsApp Account (old BR-15, AC-02.1 "connected", AC-13.2), because there is no longer a WhatsApp connection. Revoking a Chat (BR-06) and deleting the account (MF-07) cover the same privacy needs.

**Renumbered acceptance criteria:**

| v1.0 | v1.1 |
|---|---|
| AC-05.2 | AC-05.3 (with an Uncertain time) |
| AC-05.3 | Removed (covered by AC-02.1 and NFR-01) |
| AC-05.4 | AC-05.4 (example added) |
| AC-13.3 | AC-13.2 |
| AC-13.4 | AC-13.3 |

## Appendix A: Detection Test Set

Every message is treated as sent on **Monday 19 October 2026 at 10:00 PKT** in an Approved Chat. "Expected" is what a correct Detected Event shows. Uncertain = the details that must carry an Uncertain mark (BR-21). The same set is in `detection_test_set.csv`, and `evaluate.py` scores a detector's output against NFR-05.

### A.1 Clear English Event Messages (20)

| ID | Message | Expected | Uncertain | Rule |
|---|---|---|---|---|
| EN01 | Meeting tomorrow at 3pm in Room 4 | Tue 20 Oct 2026, 15:00 | – | BR-12 tomorrow |
| EN02 | Lab report due Friday | Fri 23 Oct 2026, All-day | – | BR-12 day name; BR-07 |
| EN03 | OOP quiz on 22/10 at 9:30am | Thu 22 Oct 2026, 09:30 | – | BR-12 day/month |
| EN04 | Reminder: project proposal submission deadline is 25 October, 11:59 pm | Sun 25 Oct 2026, 23:59 | – | BR-12 month name |
| EN05 | Society general body meeting today at 5:00 PM, Auditorium | Mon 19 Oct 2026, 17:00 | – | BR-12 today |
| EN06 | Viva for DS on Thursday 2pm | Thu 22 Oct 2026, 14:00 | – | BR-12 day name |
| EN07 | Presentation slots: our group is on 27 Oct at 11:30 | Tue 27 Oct 2026, 11:30 | – | BR-12 |
| EN08 | Assignment 4 deadline: 30/10/2026 | Fri 30 Oct 2026, All-day | – | BR-12; BR-07 |
| EN09 | Football practice tonight at 9pm | Mon 19 Oct 2026, 21:00 | – | BR-12 tonight |
| EN10 | Calculus midterm on Monday 26 October, 8:30am | Mon 26 Oct 2026, 08:30 | – | BR-12 explicit date wins |
| EN11 | Team sync at 15:00 tomorrow on Google Meet | Tue 20 Oct 2026, 15:00 | – | BR-12 24-hour time |
| EN12 | Workshop on Git this Saturday 10am-1pm | Sat 24 Oct 2026, 10:00 | – | BR-12 range start |
| EN13 | Don't forget the lab exam on Nov 2 at 1 pm | Mon 02 Nov 2026, 13:00 | – | BR-12 month name |
| EN14 | Submit the survey form by Wednesday | Wed 21 Oct 2026, All-day | – | BR-12 day name; BR-07 |
| EN15 | Class rescheduled to 23/10 at 11am | Fri 23 Oct 2026, 11:00 | – | BR-12 |
| EN16 | Birthday dinner for Ali on 31st Oct, 8pm at Monal | Sat 31 Oct 2026, 20:00 | – | BR-12 ordinal date |
| EN17 | Seminar on AI ethics today 4:30pm, Room A-1 | Mon 19 Oct 2026, 16:30 | – | BR-12 today |
| EN18 | Group meeting on Sunday at 7:30 pm | Sun 25 Oct 2026, 19:30 | – | BR-12 day name |
| EN19 | Final report is due 5 Nov | Thu 05 Nov 2026, All-day | – | BR-12; BR-07 |
| EN20 | Makeup class tomorrow 8am | Tue 20 Oct 2026, 08:00 | – | BR-12 tomorrow |

### A.2 Clear Roman Urdu / mixed Event Messages (20)

| ID | Message | Expected | Uncertain | Rule |
|---|---|---|---|---|
| RU01 | kal shaam 5 baje project meeting hai | Tue 20 Oct 2026, 17:00 | – | BR-12 kal + shaam |
| RU02 | aaj raat 9 baje group call hogi | Mon 19 Oct 2026, 21:00 | – | BR-12 aaj + raat |
| RU03 | quiz jumma ko hai subah 9 baje | Fri 23 Oct 2026, 09:00 | – | BR-12 jumma = Friday |
| RU04 | assignment 28/10 tak jama karwani hai | Wed 28 Oct 2026, All-day | – | BR-12; BR-07 |
| RU05 | parson dopehar 2 baje viva hai | Wed 21 Oct 2026, 14:00 | – | BR-12 parson = +2 days |
| RU06 | Sir ne bola hai presentation Wednesday ko hogi 11am pe | Wed 21 Oct 2026, 11:00 | – | BR-12 |
| RU07 | meeting kal subah 10 baje library mein | Tue 20 Oct 2026, 10:00 | – | BR-12 subah |
| RU08 | society ka event Saturday shaam 6 baje hai | Sat 24 Oct 2026, 18:00 | – | BR-12 |
| RU09 | lab report kal tak submit karni hai | Tue 20 Oct 2026, All-day | – | BR-12; BR-07 |
| RU10 | aaj 4pm pe class hai room C-204 mein | Mon 19 Oct 2026, 16:00 | – | BR-12 |
| RU11 | proposal 25 Oct tak bhejna hai | Sun 25 Oct 2026, All-day | – | BR-12; BR-07 |
| RU12 | mid term 26/10 ko subah 8:30 baje | Mon 26 Oct 2026, 08:30 | – | BR-12 |
| RU13 | Areeb ki birthday party Friday raat 8 baje | Fri 23 Oct 2026, 20:00 | – | BR-12 raat |
| RU14 | match kal shaam 4 baje hai ground pe | Tue 20 Oct 2026, 16:00 | – | BR-12 |
| RU15 | Thursday ko 3pm meeting rakhi hai sir ke office mein | Thu 22 Oct 2026, 15:00 | – | BR-12 |
| RU16 | deadline 2 Nov hai final project ki | Mon 02 Nov 2026, All-day | – | BR-12; BR-07 |
| RU17 | sadhe 3 baje dopehar ko lab hai aaj | Mon 19 Oct 2026, 15:30 | – | BR-12 sadhe = half past |
| RU18 | kal sawa 11 baje subah quiz hoga | Tue 20 Oct 2026, 11:15 | – | BR-12 sawa = quarter past |
| RU19 | jummay ko dopehar 2 baje meeting | Fri 23 Oct 2026, 14:00 | – | BR-12 |
| RU20 | orientation 13/11 ko subah 10 baje hai | Fri 13 Nov 2026, 10:00 | – | BR-12 |

### A.3 Ambiguous dates and times (20): must be marked Uncertain or Needs date

| ID | Message | Expected | Uncertain | Rule |
|---|---|---|---|---|
| A01 | kal 5 baje project meeting hai | Tue 20 Oct 2026, 17:00 | time | U1 bare hour 1-7 = PM |
| A02 | quiz next Friday | Fri 30 Oct 2026, All-day | date | U4 next <day> = following week |
| A03 | Monday ko paper hai | Mon 26 Oct 2026, All-day | date | U5 own weekday = 7 days later |
| A04 | agle hafte presentation hai | Needs date | – | Needs date: period only |
| A05 | project deadline end of month | Needs date | – | Needs date: period only |
| A06 | class 03/11 ko hai | Tue 03 Nov 2026, All-day | date | U3 both parts <= 12 |
| A07 | meeting Friday 24/10 at 3pm | Sat 24 Oct 2026, 15:00 | date | U6 day name conflicts with date |
| A08 | viva 22 ya 23 Oct ko hogi | Thu 22 Oct 2026, All-day | date | U7 alternatives = first |
| A09 | shayad kal meeting ho 4pm | Tue 20 Oct 2026, 16:00 | event | U9 tentative |
| A10 | lab after Zuhr tomorrow | Tue 20 Oct 2026, All-day | time | U8 vague time |
| A11 | aaj raat 12 baje submission deadline | Tue 20 Oct 2026, 00:00 | date, time | U2 12 at night = 00:00 next day |
| A12 | meeting at 7 | Needs date, time 19:00 | time | Needs date; U1 |
| A13 | class 9 baje kal | Tue 20 Oct 2026, 09:00 | time | U1 bare hour 8-11 = AM |
| A14 | event 3-5 Saturday | Sat 24 Oct 2026, 15:00 | time | U1 on range start |
| A15 | dhai baje kal meeting | Tue 20 Oct 2026, 14:30 | time | U1 dhai = 2:30 |
| A16 | hike plan this weekend | Needs date | event | Needs date; U9 plan |
| A17 | quiz on 10/11 | Tue 10 Nov 2026, All-day | date | U3 |
| A18 | kal ki meeting 11 baje | Tue 20 Oct 2026, 11:00 | time | U1 bare hour 8-11 = AM |
| A19 | deadline extended to Monday | Mon 26 Oct 2026, All-day | date | U5 |
| A20 | parson subah meeting hai | Wed 21 Oct 2026, All-day | time | U8 vague time |

### A.4 Non-Event Messages (20), of which 8 refer only to the past

| ID | Message | Expected | Uncertain | Rule |
|---|---|---|---|---|
| N01 | The meeting yesterday went well | No Detected Event | – | past |
| N02 | anyone has the slides? | No Detected Event | – | no activity |
| N03 | noted | No Detected Event | – | no activity |
| N04 | kal ki class bohat boring thi | No Detected Event | – | past (thi) |
| N05 | Quiz 2 was really hard | No Detected Event | – | past |
| N06 | ok sir | No Detected Event | – | no activity |
| N07 | Thanks everyone for coming to the event on Saturday | No Detected Event | – | past |
| N08 | kya scene hai | No Detected Event | – | no activity |
| N09 | send me the notes please | No Detected Event | – | no activity |
| N10 | happy birthday Ali!! | No Detected Event | – | greeting, no plan |
| N11 | parson wali meeting mein kya decide hua tha? | No Detected Event | – | past (hua tha) |
| N12 | Room C-204 is so cold | No Detected Event | – | no activity |
| N13 | lol | No Detected Event | – | no activity |
| N14 | acha theek hai | No Detected Event | – | no activity |
| N15 | assignment ho gaya submit | No Detected Event | – | past (ho gaya) |
| N16 | Friday ko jo party thi wo zabardast thi | No Detected Event | – | past (thi) |
| N17 | who made these slides? they're great | No Detected Event | – | no activity |
| N18 | sir ka number kis ke paas hai | No Detected Event | – | no activity |
| N19 | I'll check and let you know | No Detected Event | – | no activity |
| N20 | class mein aaj kya parhaya? | No Detected Event | – | past (parhaya) |
