# Neighbor food: requirements for the first version

This is the one authoritative list. The build and its tests follow it. Visual tokens, window
states and motion are in [DESIGN.md](../../DESIGN.md). Deferred ideas are in
[TODOS.md](../../TODOS.md).

## What it is

A page a neighbour opens from a QR code on a poster in the building entrance, to treat the
neighbours to home-made food or to ask for some: "soup at three, three portions", "popcorn
tonight, send requests", "who bakes bread this week?". Neighbours agree on the meeting place
themselves. Gifts and requests only: no money, no prices.

The goal is a good-looking, working demonstration in a public, non-commercial portfolio, tried in
one entrance. Keep every part in its simplest honest form.

Published at `https://exgeni.github.io/neighbor-food/`. Every copy uses its owner's own Firebase
project; there is no shared database for other people's entrances. The person who runs a copy is
the **organiser**.

### Why not just the building chat

The chat is how neighbours hear about food: there are no notifications, so the app offers to send
each new offer into it. What the page adds: portions counted without a thread, posts that expire,
no phone numbers exchanged, and a house whose windows light up.

## Routes

Hash routes under the build's base path.

| Route | Shows |
|---|---|
| bare address, `#/demo` | demo house with invented neighbours, in memory, no Firebase calls |
| `#/e/<key>` | resident page when not signed in or this key was not entered on this phone, else the house |
| `#/e/<key>?p=<post id>` | the same, opening that offer |
| `#/new` | create an entrance (only the README names this address) |
| `#/e/<key>/poster` | printable poster for the entrance |
| `#/demo/poster` | the same poster with a QR to the demo |
| `#/about`, `#/e/<key>/about` | what is stored (data page) |

## Screens

**Resident page** (first visit): language switch; house drawing with the entrance name; one
sentence; the Enter button above the fold ("Enter to see this offer" with `?p=`); short lines on
who sees posts, the food line, the organiser's contact, "use the same browser next time"; link to
the data page. No name field. A wrong or closed link is shown instead of Enter. If Enter fails,
the page stays, says why and allows a retry.

**House:** header (entrance name; menu with poster, data page, "make one for your building",
language); the house, at most 42% of the viewport on a phone; compact rows, not stacked cards,
with the first row visible without scrolling; one main button "treat or ask" fixed at the bottom.
On a desktop: house left, list right. Works at 320 CSS px, with enlarged text and long Polish and
Russian labels.

**Rows** are led by dish, time and portions left; a row opens to place, allergens, name and
actions. Order: "Yours" first, then offers by soonest time, then asks. Empty house: "Quiet for
now. Treat first." (only after the first server answer). While loading: a dim house with a label.
A stalled load offers a retry. Expired posts are not shown. After the offer time a row says
"started at HH:MM" until it expires.

**"Yours":** your offers with takers and how many are new since the last visit; your claims with
time and place in large type. A claimed post that disappears is reported ("removed" or "ended")
only after a server answer; on network or access failure the state is unknown, never "removed".
Deleting asks to confirm and says how many took a portion.

**Post form:** offer or ask; what; when (offer: today, tomorrow or another day within 7, plus a
clock time; ask: today or this week); portions for offers (1-20 or "no portion count"); where
(hint: meet in the hall, do not write flat numbers); allergens (offers); name (prefilled and
remembered). Errors appear next to their field and keep the typed text. A time already past is
refused. Back closes the form. After publishing and only after the server confirms: the form
closes, the house is in view, the window lights, and a sheet offers "send to the building chat"
with the warning that the link lets its reader into this entrance.

**Taking:** a small sheet with the optional name, "your name is visible to everyone here", time
and place, one confirm button. "Your portion" appears only after the database confirms, with
place, time, the calendar button and cancel. An offer without a portion count says "I'm coming"
and shows how many are coming. Empty names show as "neighbour 1, 2".

**Ask replies:** a note "when and where" is required (1-80) and the sheet says the asker cannot
write back, so come at the time written. "Do not write your flat number."

**Other actions:** "Hide on this phone" (hidden posts can be shown again from the end of the
list) and "Contact the organiser" (shows the contact). No report button.

**Two share actions with different names:** "send to the building chat" on an offer (Web Share
with copy fallback: "<name or 'a neighbour'>: <what>, <time>, <where>" plus the offer link), and
"make one for your building" in the menu (QR and link to the demo). Links are built from origin
plus base path only.

**Calendar:** a button on offers, for the author and for takers: an `.ics` file with an alarm 15
minutes before and a 30 minute event (CRLF, UID, DTSTAMP, UTC, escaped text, safe folding of
Cyrillic lines). Visible fallback text if nothing opens. Labelled "Add to calendar" until the
alarm is seen on a real iPhone and Android.

**Demo:** invented posts with times relative to now; one or two timed neighbour events; a
dismissible "this is a demonstration" strip that does not cover the house; "make one for your
building" links to the README.

**Create entrance:** organiser code; entrance name (1-40); floors (1-30); how to reach you
(phone, e-mail or chat name, 1-60). A refusal says to check the code and the setup steps and
creates nothing. The new key is saved on the phone before writing, reused on retry, checked on
load and before every retry (if the entrance exists, go to its poster), and cleared on success.

**Poster:** one A4 portrait page; entrance name and a short headline in three languages; QR at
least 8 cm, black on white with quiet zone; "nothing to install", "free between neighbours", the
food line, the organiser contact; line art that survives black-and-white printing without
backgrounds; fits a 40-character name and 60-character contact. On screen only: a warning not to
show this QR in videos or social media, and a button back to the house.

**Food line:** "Home-made food: ask about allergens; you take it at your own risk."

**Data page** (three languages): the organiser (contact shown) is responsible; what is stored;
names and notes are visible to everyone with the entrance link or QR, do not write flat numbers;
posts are hidden after expiry and deleted, best effort, when someone next opens the entrance
(posts of a closed entrance stay until the organiser deletes them); the entrance and anonymous
sign-in records stay until the organiser deletes them; posts live in the region the organiser
chose; Google processes sign-in data (random id, IP address) in the United States; an iPhone may
forget who you are after about a week without a visit, then you cannot delete your old post or
cancel a portion (and could take a second one); opening the link inside a chat or social app may
count you as a new person there.

## Languages

pl, ru, en. Default from the browser (pl, ru, otherwise en), a switcher remembered on the phone.
Plural forms through `Intl.PluralRules`. A test checks all three have the same keys.

## Data and rules

Firestore and its rules are the only protection. Every rule has an allow and a deny emulator
test. Limits come from one table in code, which the rules tests use.

- `config/owner`: field `code`, written by the organiser in the console. Every entrance create is
  refused if the stored code is shorter than 16 characters. `config/**` is never readable or
  writable by clients.
- `entrances/{key}`: `name` (string 1-40), `floors` (int 1-30), `contact` (string 1-60),
  `closed` (boolean false on create; set true only in the console), `createdAt` (server time).
  `key` is 16 random bytes as base64url; rules require `^[A-Za-z0-9_-]{22,}$`. Get by key is
  allowed without sign-in while `closed == false`; listing is denied. Creating needs sign-in.
  No client updates or deletes an entrance.
- `entrances/{key}/private/create`: field `code`. Created only in the batch that creates the
  entrance, only if both did not exist before, only when it equals `config/owner.code`. Never
  readable, updatable or deletable by clients. The app never keeps or logs the code.
- No recursive wildcard `allow` under `entrances/{key}`.
- `entrances/{key}/posts/{id}`, listed fields only. All: `kind` ('offer' | 'ask'), `what`
  (1-60, not only spaces), `where` (0-60), `name` (0-30), `allergens` (0-100, empty for asks),
  `author` (= signed-in id), `createdAt` (server time), `expiresAt` (after `createdAt`, at most 9
  days later), `responses` (empty map on create). Offers: `at` (time, required) with
  `expiresAt == at + 3h`; `portions` (int 1-20, optional) with `left` (= `portions` on create),
  both present or both absent. Asks: no `at`, `portions`, `left`. Single-line fields have no line
  breaks. Types are checked explicitly.
- Everything under an entrance needs sign-in and an existing, not closed entrance (except the
  `private/create` write above).
- Posts are not editable. The author deletes their own; any signed-in user deletes an expired one.
- A non-author adds or removes only their own entry in `responses` (key = their id): `name`
  (0-30), `at` (server time), and for asks `note` (1-80). At most 30 entries. `left`, when
  present, changes by exactly the matching amount and never below zero. Only before expiry.
- Posts are read newest first with a limit of at most 100, enforced by the rules.

## Behaviour

- Anonymous sign-in only on "Enter" or on submitting `#/new`. `initializeAuth` with
  `indexedDBLocalPersistence` then `browserLocalPersistence`, no popup or redirect resolver.
- Listeners include metadata changes and read server timestamps as estimates. "Empty" and
  "removed" are judged only on server snapshots. Animations play only for ids not seen before.
  A failed listener changes the screen state and is re-subscribed on retry.
- The database uses the in-memory cache: a reload drops unsent writes.
- Post ids are made by the client and kept on the phone until confirmed; before a retry the app
  reads that id.
  A plain write (create, delete) with no answer after 10 s marks its row "not confirmed yet" and
  blocks only that action. Pending deletes are tracked in the app so the row can be marked.
- Claim and cancel are transactions with typed outcomes: taken, already yours, full, gone,
  expired, unknown. On denied or aborted: re-read from the server, classify, and while a portion
  is free retry a few times with a growing random wait (the database refuses an outdated count when
  many press at once); an existing own entry counts as success. The row stays "checking"
  until the transaction returns; after 10 s it offers "reload to check".
- On opening an entrance, delete a few expired posts once per session after a server snapshot,
  ignoring refusals (logged with a code).
- The clock is injectable. The screen re-evaluates every minute and when the page returns. A
  refusal a wrong clock can cause says "check your phone's clock".
- Offline: banner; posting, claiming, cancelling and deleting disabled. A first visit without a
  network never says the link is wrong.
- Windows: newest posts up to the number of windows; placed in creation order from a slot derived
  from the id, moving to the next free slot on a clash; the same on every phone, regardless of
  local "Hide". 4 windows per floor, at most 6 drawn floors.
- Every browser storage key the app writes starts with `nf:` and is scoped by base path and
  entrance. Storage access is wrapped so private mode works.

## Accessibility

Text contrast 4.5:1 or better; visible focus; offer and take work with a keyboard and a screen
reader and with motion switched off; every animated change also changes row text; new posts from
neighbours and the outcome of an action are announced politely; the house is a labelled group whose
lit windows are buttons (the rows say the same).

Tapping a lit window opens, scrolls to and highlights its row. "Hide on this phone" is for posts
you have not answered; "Contact the organiser" stays on a post you have. "Send to the building
chat" is on every offer.

## Errors

One table in code, mirrored as README troubleshooting anchors, with a test that they match:
`NF-BUILD-CONFIG-JSON`, `NF-BUILD-CONFIG-FIELD`, `NF-BUILD-CONFIG-SECRET`, `NF-AUTH-OFF`,
`NF-AUTH-LIMIT`, `NF-KEY-BLOCKED`, `NF-NEW-REFUSED`, `NF-NEW-UNCONFIRMED`, `NF-ENTRY-DENIED`,
`NF-LIVE-STOPPED`, `NF-NET-UNCONFIRMED`, `NF-QUOTA`, `NF-EMU-DOWN`, `NF-UNEXPECTED`. People see a
plain sentence, the next action and the code. A global handler gives `NF-UNEXPECTED`. Logs never
contain the address, key, code, names or post text; the database SDK's logging is silenced in
production.

## Safety

User text is only ever inserted as text. A content security policy limits scripts and
connections. Nothing is loaded from third parties; only real entrance routes call Firebase. The
build rejects any config field outside the web-app config (and any server credential) without
printing values. Only open licences compatible with MIT publication ship.

## Accepted risks (written in the README)

Anyone with the entrance link can post without limit, take every portion from several browsers,
pose under another name or use up the daily free quota. Sharing an offer into a chat puts the
entrance key into that chat. Every page on `exgeni.github.io` shares browser storage, so a script
on any of them could read the entrance key and sign-in token: no third-party scripts there.
Restricting the browser key limits casual reuse only. A leaked link or QR: create a new entrance.
An exhausted daily quota only recovers at the daily reset.

## Organiser

Moderation in the Firebase console: delete a post; close an entrance (`closed: true`) or delete it
with its subcollections; delete anonymous accounts. Routine: ask permission to hang the poster,
post the first offer before hanging it, after the trial keep it running or close it and clear its
data; watch once whether a neighbour finds an offer through the chat and finds the meeting place.
Filming: a second, disposable entrance with invented names, with consent, closed before the video
is published; the demo poster is for shots of the poster.

## Setup and delivery

- Vite, TypeScript, vitest; Firebase modular SDK; `qrcode`; no UI framework. One data-store
  interface: memory (demo, tests) and Firestore, with one contract test suite over both.
- `npm ci`, `npm run dev` (demo), `npm test`, `npm run test:rules`, `npm run dev:emulator`
  (starts emulators, seeds an emulator-only organiser code and prints it). Node and Java pinned.
  `BASE_PATH` overrides the base path. `VITE_FIREBASE_EMULATOR=1` uses project `demo-nf`.
- A build without Firebase config is a working demo. Config comes from the repository variable
  `FIREBASE_CONFIG` (one JSON object) as `VITE_FIREBASE_CONFIG`, or a local `.env.local`.
- CI: unit tests, rules and contract tests on the emulator, Playwright on the built site under
  the base path (demo makes no Firebase request; offer-and-take and ask-and-reply with two
  browser contexts; phone user agent: no request outside allowed hosts, no policy violation).
  Deploy only from `main` after tests; the run prints whether a database is configured.
- Budgets: demo-route JavaScript under 120 KB gzipped before Firebase (checked in CI); fonts are
  woff2 subsets (latin, latin-ext, cyrillic).
- README order: try the demo; run locally; host your entrance; organise and moderate;
  troubleshooting by code; risks and filming. CHANGELOG says whether rules changed.
- Rules stay compatible with the previous release or are published before the site that needs them.

## Done means

The demo may be published as a preview. The version is complete only when two phones on the real
site, entering from the printed poster and from a link sent through the organiser's chat app, have
done offer-and-take and ask-and-reply. A live check after each rules paste confirms the refusals
and one successful sign-in, read and claim.
