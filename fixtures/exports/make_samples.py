"""Creates realistic sample exports (Android .txt, iOS .zip) in ./samples.
Formats follow what WhatsApp writes: Android uses a narrow no-break space
before am/pm; iOS wraps the timestamp in [ ] and puts a left-to-right mark
before media/system lines."""
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
S = os.path.join(HERE, "samples")  # writes fixtures/exports/samples
os.makedirs(S, exist_ok=True)
N = " "   # narrow no-break space (Android)
L = "‎"   # left-to-right mark (iOS)


def w(name, lines):
    with open(os.path.join(S, name), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


class_v1 = [
    f"01/10/2026, 9:00{N}am - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.",
    f"01/10/2026, 9:02{N}am - CR Usman: Welcome to SE-3D class group",
    f"08/10/2026, 4:10{N}pm - CR Usman: Quiz 2 was today, results next week",          # before Start Point
    f"11/10/2026, 8:15{N}pm - Hira: Assignment 3 due 13/10 by midnight",                # before Start Point
    f"14/10/2026, 11:30{N}am - CR Usman: Sir ne kaha hai project proposal Friday tak submit karna hai",
    f"14/10/2026, 11:31{N}am - Hira: <Media omitted>",
    f"15/10/2026, 6:45{N}pm - Bilal: anyone has the slides?",
    f"16/10/2026, 9:05{N}am - CR Usman: This message was deleted",
    f"17/10/2026, 2:00{N}pm - CR Usman added Areeb",
    f"18/10/2026, 10:12{N}pm - CR Usman: Reminder:",
    "OOP lab moved to Wednesday 21/10 at 2pm",
    "Room C-204",
    f"18/10/2026, 10:20{N}pm - Bilal: kal class hai? <This message was edited>",
    f"19/10/2026, 10:25{N}am - CR Usman: Meeting tomorrow at 3pm in Room 4",
    f"19/10/2026, 10:25{N}am - Hira: noted",
]
w("WhatsApp Chat with SE-3D Class.txt", class_v1)

class_v2 = class_v1 + [
    f"19/10/2026, 10:25{N}am - Bilal: kal 5 baje project meeting hai",              # same minute, after 1st export
    f"20/10/2026, 8:00{N}am - CR Usman: Lab report due Friday",
    f"21/10/2026, 7:30{N}pm - Hira: sticker omitted",
    f"21/10/2026, 7:31{N}pm - Hira: The meeting yesterday went well",
]
os.makedirs(os.path.join(S, "v2"), exist_ok=True)
with open(os.path.join(S, "v2", "WhatsApp Chat with SE-3D Class.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(class_v2) + "\n")

# iOS export (zip with _chat.txt and a photo)
ios_chat = "\n".join([
    f"[12/10/2026, 9:00:01 AM] ISE Project Team: {L}Messages and calls are end-to-end encrypted.",
    "[16/10/2026, 8:14:55 PM] Zain: Deliverable 3 demo slot is 23/10 at 11:30",
    f"[16/10/2026, 8:15:20 PM] Areeb: {L}image omitted",
    f"[17/10/2026, 1:02:10 PM] Hannan: {L}<attached: 00000012-PHOTO-2026-10-17.jpg>",
    "[18/10/2026, 9:40:00 PM] Zain: parson meeting rakh lete hain 7 baje",
]) + "\n"
with zipfile.ZipFile(os.path.join(S, "WhatsApp Chat - ISE Project Team.zip"), "w") as z:
    z.writestr("_chat.txt", ios_chat)
    z.writestr("00000012-PHOTO-2026-10-17.jpg", b"\xff\xd8\xff fake jpeg bytes")

# A different Chat, used for the wrong-file boundary case
w("WhatsApp Chat with Ammi.txt", [
    f"18/10/2026, 7:00{N}pm - Ammi: Sunday ko khala ke ghar dinner hai",
])

# Not a Chat export at all
w("notes.txt", ["shopping list", "eggs", "milk"])
w("WhatsApp Chat with Fake.txt", ["this file was renamed but is not an export"])

# Every date fits both readings (05/10 = 5 Oct or 10 May)
w("WhatsApp Chat with Society Core.txt", [
    f"05/10/2026, 6:00{N}pm - Sana: Welcome",
    f"12/10/2026, 6:05{N}pm - Sana: core meetup Saturday 4pm",
])
print("samples written to", S)
