# TODOS

## Real entrance

### Turn the first real entrance on and try it with phones

**What:** Create the Firebase project and the first entrance (README, "Host your own entrance", from step 3), then run `npm run check:live`, try it with two real phones from the printed poster and from a chat link, and check the calendar alarm on an iPhone and an Android.

**Why:** Only the demonstration has been tried. Sign-in, the real database, the restricted browser key, real phones and print are unverified.

**Context:** The site is already published from this repository, so steps 1 and 2 are done. Version 0.1.0 was checked on the emulators and, for the demonstration, on the live site in a phone-sized Chromium. Fix the README wherever a step turns out to be unclear: nobody has followed it yet.

**Effort:** S
**Priority:** P2
**Depends on:** The maintainer's Firebase project

## Product

### Push notifications for new food

**What:** Tell neighbours about a new offer without the building chat.

**Why:** Food is perishable; today a neighbour learns of it only by opening the page or from a chat message.

**Context:** Needs something that can send from a server. The first version deliberately has none and relies on "send to the building chat".

**Effort:** L
**Priority:** P3
**Depends on:** a decision on hosting

### Shared hosting for other buildings

**What:** Let someone start an entrance without setting up their own Firebase project.

**Why:** Self-hosting takes about 20 minutes or more and some GitHub skill.

**Context:** Whoever hosts other people's posts is responsible for them. Needs moderation, abuse protection (App Check) and terms before it is considered.

**Effort:** XL
**Priority:** P4
**Depends on:** the outcome of the first trial

### "I want this for my entrance" link

**What:** A link where interested people can say so.

**Why:** Shows whether shared hosting is worth building.

**Context:** A GitHub issue template would do. Deferred because it creates a duty to answer.

**Effort:** S
**Priority:** P3
**Depends on:** None

### Scripted demo evening for filming

**What:** A demo mode that plays a whole evening by itself.

**Why:** Easier video takes without real neighbours.

**Context:** The first version has only one or two timed events in the demo.

**Effort:** M
**Priority:** P4
**Depends on:** None

## Design

### Sky that follows local time, celebration when all portions are taken

**What:** Day and night in the house drawing, a small celebration.

**Why:** Delight; not needed to understand or use the product.

**Context:** The first version has one fixed warm evening, curtains and steam.

**Effort:** S
**Priority:** P4
**Depends on:** None

## Developer experience

### Rules version marker and copyable diagnostics

**What:** Detect outdated published rules; a button that copies safe error details.

**Why:** Helps people who run their own copy.

**Context:** Cut from the first version to keep it small. The access-refused message names both causes.

**Effort:** S
**Priority:** P3
**Depends on:** a second person actually self-hosting
