# Design: the living house

One picture carries the app: the neighbours' house on a warm evening. A lit window is a post.

## Look

Picture book: ink outlines, flat fills, rounded corners. One fixed warm evening scene: no dark
mode, no gradients, no emoji, no stock icons. Everything is drawn as SVG in the code.

| Token | Value | Used for |
|---|---|---|
| ink | `#1B1F2A` | text, outlines |
| sky | `#23425F` | behind the house |
| wall | `#C9D6C3` | house wall |
| roof | `#8C4A3B` | roof, door |
| lit | `#FFD166` | a lit window, offer badge |
| page | `#FBFAF6` | page background |
| action | `#1F6F5C` | buttons (white text), "mine" marker |
| ask | `#3B6EA8` | requests |

Headings: Balsamiq Sans 700. Text: Rubik 400 and 600. Both OFL, served from the site itself
(latin, latin-ext, cyrillic).

| Text | Size |
|---|---|
| entrance name (h1) | 1.35rem |
| large facts (your time and place, dish in a sheet) | 1.25rem |
| lead sentence, big button | 1.1 to 1.15rem |
| body, rows | 1rem (16px) |
| second line of a row, notes | 0.875 to 0.9rem |

Touch targets are 44px or more. Text contrast is 4.5:1 or better. The food line is marked by a
lit-yellow rule on its left.

## Layout

Phone: header, the house (at most 42% of the screen height), compact rows, one button fixed at the
bottom. Desktop (900px and wider): the house on the left, the list on the right.

The house has four windows per floor and draws at most six floors.

## Windows

| State | Looks like |
|---|---|
| dark | night glass with a cross bar |
| offer | lit, a pot with steam |
| ask | lit, a blue speech bubble with "?" |
| mine | as above, plus a green marker on the frame |
| full | lit, curtains drawn |

Which window: posts are placed oldest first; each starts at a slot computed from its id and moves
to the next free one on a clash, so every phone shows the same house.

Example with two posts in a house with five drawn floors (20 windows, counted from the top left):
the post with id `soup` starts at window 6 (third window, second floor from the top), the request
with id `flour` at window 19 (bottom right). Those two light; the others stay dark. The rows below
name both, so the picture is never the only source.

## Motion

CSS and SVG only. Motion says something happened; it never delays an action. All of it stops under
`prefers-reduced-motion`.

| What | How | When | Plays | Reduced motion |
|---|---|---|---|---|
| house appears | rises and fades in, 500ms | opening the page | once | none |
| window lights | glass fades in, halo, small pop, 600ms ease-out | a post not seen before | once | lit at once |
| speech bubble | pops from its tail, 350ms | with the window | once | shown |
| portion taken | pot and marker hop, 500ms | a portion goes, some left | once | count changes only |
| curtains | close from both sides, 450ms | the last portion goes | once | drawn |
| tapped window | its row glows, 1.6s | tapping a window | once | outline only |
| row | fades in, 250ms | a post not seen before | once | shown |
| sheet | slides up, 220ms | opening | once | shown |
| steam | rises and fades, 2.4s | offer windows | loop | still |
| chimney smoke, stars, cat | drift, twinkle, blink | always | loop | still |

Every animated change also changes the row text or is announced, so nothing depends on seeing it
move.

The windows light only after the server confirms a post.
