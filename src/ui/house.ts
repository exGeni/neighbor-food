// The drawing: a house on a warm evening whose lit windows are the posts.
import type { Post } from '../store/types';
import { assignWindows, drawnFloors, windowState, WINDOWS_PER_FLOOR } from '../windows';
import { s } from './dom';

const WIDTH = 360;
const ROOF = 74;
const FLOOR = 60;
const PORCH = 78;
const WALL_X = 34;
const WALL_W = WIDTH - 2 * WALL_X;
const WIN_W = 48;
const WIN_H = 42;
const GAP = (WALL_W - WINDOWS_PER_FLOOR * WIN_W) / (WINDOWS_PER_FLOOR + 1);

export interface House {
  element: SVGSVGElement;
  /** Draws the posts. Only a window whose post was not seen before lights up with motion. */
  update(posts: Post[], me: string | null, now: number): void;
}

export interface HouseOptions {
  floors: number;
  /** What a screen reader hears for the whole picture. */
  label?: (posts: Post[]) => string;
  /** Makes lit windows buttons. */
  onSelect?: (id: string) => void;
  windowLabel?: (post: Post) => string;
  /** Posts present at the first draw light up too (the opening of the demo). */
  lightFirst?: boolean;
}

/** Steam, pot, bubble and curtains are drawn in a 48 by 42 box. */
function pot(): SVGGElement {
  return s(
    'g',
    { class: 'pot' },
    s('path', { class: 'steam steam-1', d: 'M18 19c-3-4 3-5 0-10' }),
    s('path', { class: 'steam steam-2', d: 'M25 18c-3-4 3-6 0-11' }),
    s('path', { class: 'steam steam-3', d: 'M32 19c-3-4 3-5 0-10' }),
    s('path', { class: 'ink pot-body', d: 'M13 25h24v7a6 6 0 0 1-6 6H19a6 6 0 0 1-6-6z' }),
    s('path', { class: 'ink', d: 'M11 25h28M13 29h-4M37 29h4' }),
  );
}

function bubble(): SVGGElement {
  return s(
    'g',
    { class: 'bubble' },
    s('path', { class: 'ink bubble-body', d: 'M14 7h22a6 6 0 0 1 6 6v11a6 6 0 0 1-6 6H24l-9 7 2-7h-3a6 6 0 0 1-6-6V13a6 6 0 0 1 6-6z' }),
    s('path', { class: 'bubble-mark', d: 'M21 15c1-5 9-4 8 1-1 3-4 3-4 6' }),
    s('circle', { class: 'bubble-dot', cx: 25, cy: 26, r: 1.8 }),
  );
}

function curtains(): SVGGElement {
  return s(
    'g',
    { class: 'curtains' },
    s('path', { class: 'ink curtain curtain-left', d: 'M2 2h22c-1 14-4 20-3 38H2z' }),
    s('path', { class: 'ink curtain curtain-right', d: 'M46 2H24c1 14 4 20 3 38h19z' }),
    s('path', { class: 'ink curtain-rail', d: 'M1 4h46' }),
  );
}

function marker(): SVGGElement {
  return s(
    'g',
    { class: 'marker', transform: `translate(${WIN_W - 6} -6)` },
    s('circle', { class: 'ink marker-body', cx: 6, cy: 6, r: 8 }),
    s('path', { class: 'marker-tick', d: 'M2.5 6.5l2.5 2.5 5-5.5' }),
  );
}

function backdrop(height: number, floors: number): SVGGElement {
  const wallTop = ROOF;
  const wallBottom = height - 14;
  const door = { x: WIDTH / 2 - 24, y: wallBottom - 58 };
  const star = (x: number, y: number, delay: number) => s('circle', { class: `star star-${delay}`, cx: x, cy: y, r: 1.7 });
  return s(
    'g',
    { 'aria-hidden': 'true' },
    s('rect', { class: 'sky', x: 0, y: 0, width: WIDTH, height, rx: 22 }),
    s('path', { class: 'moon', d: 'M318 18a15 15 0 1 0 14 22 12 12 0 0 1-14-22z' }),
    star(30, 24, 1),
    star(66, 50, 2),
    star(112, 18, 3),
    star(262, 28, 2),
    star(20, 92, 3),
    star(346, 80, 1),
    // Chimney and its smoke.
    s('g', { class: 'smoke' }, s('circle', { cx: 258, cy: 24, r: 7 }), s('circle', { cx: 264, cy: 18, r: 5.5 }), s('circle', { cx: 270, cy: 14, r: 4 })),
    s('path', { class: 'ink chimney', d: `M248 ${wallTop - 24}V32h18v${wallTop - 20}` }),
    s('path', { class: 'ink roof', d: `M${WALL_X - 16} ${wallTop}L${WALL_X + 34} 36h${WALL_W - 68}L${WALL_X + WALL_W + 16} ${wallTop}z` }),
    s('path', { class: 'roof-line', d: `M${WALL_X + 24} 50h${WALL_W - 48}M${WALL_X + 8} 62h${WALL_W - 16}` }),
    // The cat on the ridge.
    s(
      'g',
      { class: 'cat', transform: 'translate(92 14)' },
      s('path', { class: 'cat-body', d: 'M4 22c0-8 3-10 4-12L7 3l5 4h5l5-4-1 7c2 2 3 4 3 7 7 1 9-3 8-8 5 4 4 13-8 13z' }),
      s('circle', { class: 'cat-eye', cx: 12, cy: 12, r: 1.4 }),
      s('circle', { class: 'cat-eye', cx: 18, cy: 12, r: 1.4 }),
    ),
    s('rect', { class: 'ink wall', x: WALL_X, y: wallTop, width: WALL_W, height: wallBottom - wallTop }),
    ...Array.from({ length: floors }, (_, floor) =>
      s('path', { class: 'floor-line', d: `M${WALL_X + 6} ${wallTop + (floor + 1) * FLOOR + 2}h${WALL_W - 12}` }),
    ),
    // Porch: canopy, door, lamp.
    s('rect', { class: 'ink door', x: door.x, y: door.y, width: 48, height: 58, rx: 4 }),
    s('rect', { class: 'ink door-glass', x: door.x + 10, y: door.y + 9, width: 28, height: 18, rx: 3 }),
    s('circle', { class: 'door-knob', cx: door.x + 38, cy: door.y + 38, r: 2.6 }),
    s('path', { class: 'ink canopy', d: `M${door.x - 14} ${door.y}l8-11h60l8 11z` }),
    s('circle', { class: 'lamp-glow', cx: door.x - 16, cy: door.y + 18, r: 13 }),
    s('circle', { class: 'ink lamp', cx: door.x - 16, cy: door.y + 18, r: 5 }),
    // Bushes and the ground.
    s('path', { class: 'ink bush', d: `M14 ${wallBottom}c-4-20 18-30 28-18 12-8 28 4 22 18z` }),
    s('path', { class: 'ink bush', d: `M292 ${wallBottom}c-2-16 16-24 26-14 10-10 30-2 26 14z` }),
    s('path', { class: 'ground', d: `M0 ${wallBottom}h${WIDTH}` }),
  );
}

export function createHouse(options: HouseOptions): House {
  const floors = drawnFloors(options.floors);
  const count = floors * WINDOWS_PER_FLOOR;
  const height = ROOF + floors * FLOOR + PORCH;
  const element = s('svg', { class: 'house appear', viewBox: `0 0 ${WIDTH} ${height}`, role: options.onSelect ? 'group' : 'img' });
  element.append(backdrop(height, floors));

  const frames = Array.from({ length: count }, (_, slot) => {
    // Slot 0 is the top left window.
    const column = slot % WINDOWS_PER_FLOOR;
    const row = Math.floor(slot / WINDOWS_PER_FLOOR);
    const x = WALL_X + GAP + column * (WIN_W + GAP);
    const y = ROOF + 10 + row * FLOOR;
    const content = s('g', { class: 'content' });
    const frame = s(
      'g',
      { class: 'window', 'data-state': 'dark', transform: `translate(${x} ${y})`, 'aria-hidden': 'true' },
      s(
        'g',
        { class: 'pane' },
        s('rect', { class: 'halo', x: -6, y: -6, width: WIN_W + 12, height: WIN_H + 12, rx: 12 }),
        s('rect', { class: 'ink glass', x: 0, y: 0, width: WIN_W, height: WIN_H, rx: 5 }),
        s('path', { class: 'mullion', d: `M${WIN_W / 2} 2v${WIN_H - 4}M2 ${WIN_H / 2}h${WIN_W - 4}` }),
        content,
        s('path', { class: 'ink sill', d: `M-4 ${WIN_H + 2}h${WIN_W + 8}` }),
      ),
    );
    element.append(frame);
    return { frame, content, id: '', drawn: '', left: 0 };
  });

  let seen: Set<string> | null = options.lightFirst ? new Set() : null;
  let ids = new Map<number, string>();

  const select = (slot: number) => {
    const id = ids.get(slot);
    if (id && options.onSelect) options.onSelect(id);
  };
  if (options.onSelect) {
    frames.forEach(({ frame }, slot) => {
      frame.addEventListener('click', () => select(slot));
      frame.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        select(slot);
      });
    });
  }

  return {
    element,
    update(posts, me, now) {
      // A post of mine that the server has not confirmed does not light a window yet.
      const confirmed = posts.filter((post) => !post.pending);
      const placed = assignWindows(confirmed, count, now);
      ids = new Map([...placed].map(([slot, post]) => [slot, post.id]));
      let order = 0;

      frames.forEach((window, slot) => {
        const post = placed.get(slot);
        const { frame, content } = window;
        const state = windowState(post, me);
        const mine = !!post && !!me && (post.author === me || !!post.responses[me]);
        const drawn = post ? `${post.id}:${post.kind}:${state}:${mine}` : '';
        const fresh = !!post && !!seen && !seen.has(post.id);
        const closing = !!post && window.id === post.id && state === 'full' && !window.drawn.endsWith(`:full:${mine}`);
        // A portion went and some are left.
        const served = !!post && window.id === post.id && post.left !== undefined && post.left > 0 && post.left < window.left;
        window.left = post?.left ?? 0;

        if (post && options.onSelect) {
          frame.setAttribute('role', 'button');
          frame.setAttribute('tabindex', '0');
          frame.setAttribute('aria-label', options.windowLabel?.(post) ?? post.what);
          frame.removeAttribute('aria-hidden');
        } else {
          frame.removeAttribute('role');
          frame.removeAttribute('tabindex');
          frame.removeAttribute('aria-label');
          frame.setAttribute('aria-hidden', 'true');
        }

        if (served) {
          // Taking the class away and reading the layout lets the same window play it again.
          frame.classList.remove('served');
          void frame.getBoundingClientRect();
          frame.classList.add('served');
        }
        if (window.drawn === drawn) return;
        frame.dataset.state = state;
        if (post) frame.dataset.kind = post.kind;
        else delete frame.dataset.kind;
        frame.classList.toggle('lighting', fresh);
        frame.classList.toggle('closing', closing);
        if (fresh) frame.style.setProperty('--delay', `${order++ * 140}ms`);

        content.replaceChildren();
        if (post) {
          if (state === 'full') content.append(curtains());
          else content.append(post.kind === 'ask' ? bubble() : pot());
          if (mine) content.append(marker());
        }
        window.id = post?.id ?? '';
        window.drawn = drawn;
      });

      seen = new Set([...(seen ?? []), ...confirmed.map((post) => post.id)]);
      if (options.label) element.setAttribute('aria-label', options.label(confirmed.filter((post) => post.expiresAt > now)));
    },
  };
}
