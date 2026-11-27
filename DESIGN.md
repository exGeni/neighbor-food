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

Headings: Balsamiq Sans. Text: Rubik. Both OFL, served from the site itself (latin, latin-ext,
cyrillic). Body text 16px or more; touch targets 44px or more.

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

Example with two posts: soup and a request for flour light two windows; the others stay dark. The
rows below name both, so the picture is never the only source.

## Motion

CSS and SVG only. Motion says something happened; it never delays an action. All of it stops under
`prefers-reduced-motion`.

| What | How | When |
|---|---|---|
| window lights | glass fades in, halo, small pop, 600ms ease-out | a post not seen before |
| speech bubble | pops from its tail, 350ms | with the window |
| steam | rises and fades, 2.4s loop | offer windows |
| curtains | close from both sides, 450ms | the last portion goes |
| chimney smoke | slow drift, 6s loop | always |
| cat | blinks now and then | always |
| sheet | slides up, 220ms | opening |
| row | fades in, 250ms | a post not seen before |

The windows light only after the server confirms a post.
