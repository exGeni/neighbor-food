// The public demonstration: invented neighbours, times relative to now, nothing leaves the page.
import type { Lang } from './i18n';
import { randomId } from './limits';
import { MemoryStore, memoryData, type MemoryData } from './store/memory';
import type { NewPost } from './store/types';
import { askExpiry, offerAt, offerExpiry, systemClock, HOUR, type Clock } from './time';

export const DEMO_KEY = 'demo-entrance-000000000';
export const DEMO_USER = 'you';

type Text = Record<Lang, string>;

interface Texts {
  what: Text;
  where?: Text;
  allergens?: Text;
}

const HALL: Text = { pl: 'w holu', ru: 'в холле', en: 'in the hall' };
const BENCH: Text = { pl: 'ławka przed klatką', ru: 'скамейка у подъезда', en: 'the bench by the door' };

const ENTRANCE = {
  name: { pl: 'Klatka Słoneczna 4', ru: 'Подъезд на Солнечной, 4', en: '4 Sunny Street' },
  contact: { pl: 'Ania na czacie domu (zmyślona)', ru: 'Аня в чате дома (выдумана)', en: 'Ania in the building chat (invented)' },
};

const TEXTS: Record<string, Texts> = {
  soup: { what: { pl: 'Zupa pomidorowa', ru: 'Томатный супчик', en: 'Tomato soup' }, where: HALL, allergens: { pl: 'seler, śmietana', ru: 'сельдерей, сливки', en: 'celery, cream' } },
  popcorn: { what: { pl: 'Popcorn na film', ru: 'Попкорн к фильму', en: 'Popcorn for a film' }, where: HALL },
  pie: { what: { pl: 'Szarlotka', ru: 'Шарлотка', en: 'Apple pie' }, where: BENCH, allergens: { pl: 'gluten, jajka', ru: 'глютен, яйца', en: 'gluten, eggs' } },
  pancakes: { what: { pl: 'Naleśniki z serem', ru: 'Блинчики с творогом', en: 'Pancakes with cheese' }, where: HALL, allergens: { pl: 'gluten, mleko, jajka', ru: 'глютен, молоко, яйца', en: 'gluten, milk, eggs' } },
  flour: { what: { pl: 'Szklanka mąki', ru: 'Стакан муки', en: 'A cup of flour' }, where: HALL },
  bread: { what: { pl: 'Kto piecze chleb?', ru: 'Кто печёт хлеб?', en: 'Who bakes bread this week?' } },
  pierogi: { what: { pl: 'Pierogi ruskie', ru: 'Вареники с картошкой', en: 'Potato dumplings' }, where: HALL, allergens: { pl: 'gluten, mleko', ru: 'глютен, молоко', en: 'gluten, milk' } },
};

const NOTE: Text = { pl: 'Przyniosę o 19 do holu', ru: 'Принесу в 19 в холл', en: 'I will bring it to the hall at 7 pm' };

const text = (id: string, lang: Lang) => ({
  what: TEXTS[id]?.what[lang] ?? '',
  where: TEXTS[id]?.where?.[lang] ?? '',
  allergens: TEXTS[id]?.allergens?.[lang] ?? '',
});

const quarter = (at: number): number => Math.ceil(at / (HOUR / 4)) * (HOUR / 4);

export interface Demo {
  data: MemoryData;
  store: MemoryStore;
  /** Rewrites the invented texts in another language and keeps what the visitor did. */
  setLang(lang: Lang): void;
  /** Starts the neighbours' own actions; returns how to stop them. */
  live(): () => void;
}

export async function createDemo(lang: Lang, clock: Clock = systemClock): Promise<Demo> {
  let current = lang;
  const data = memoryData();
  data.entrances.set(DEMO_KEY, { key: DEMO_KEY, name: ENTRANCE.name[lang], floors: 5, contact: ENTRANCE.contact[lang], closed: false });
  const start = clock();

  const neighbour = async (id: string, at: Clock = clock): Promise<MemoryStore> => {
    const store = new MemoryStore(data, id, at);
    await store.signIn();
    return store;
  };

  const offer = (id: string, at: number, name: string, portions?: number): NewPost => ({
    id,
    kind: 'offer',
    ...text(id, current),
    name,
    at,
    expiresAt: offerExpiry(at),
    ...(portions === undefined ? {} : { portions }),
  });
  const ask = (id: string, until: 'today' | 'week', name: string): NewPost => ({
    id,
    kind: 'ask',
    ...text(id, current),
    allergens: '',
    name,
    expiresAt: askExpiry(start, until),
  });

  // Posted an hour ago, one second apart, so the windows get a stable order.
  const publish = async (who: string, order: number, post: NewPost) =>
    (await neighbour(who, () => start - HOUR + order * 1000)).createPost(DEMO_KEY, post);

  const tomorrow = offerAt(start, 1, '17:00') ?? start + 24 * HOUR;
  await publish('n-marek', 1, offer('soup', quarter(start + 2 * HOUR), 'Marek', 3));
  await publish('n-ola', 2, ask('flour', 'today', 'Ola'));
  await publish('n-basia', 3, offer('pie', tomorrow, 'Basia', 6));
  await publish('n-igor', 4, offer('popcorn', quarter(start + 5 * HOUR), 'Igor'));
  await publish('n-zosia', 5, offer('pancakes', quarter(start + HOUR), 'Zosia', 2));
  await publish('n-pawel', 6, ask('bread', 'week', ''));

  const take = async (who: string, post: string, name: string, note?: string) =>
    (await neighbour(who)).claim(DEMO_KEY, post, { name, ...(note === undefined ? {} : { note }) });
  await take('n-kasia', 'soup', 'Kasia');
  await take('n-ola', 'pancakes', 'Ola');
  await take('n-igor', 'pancakes', 'Igor');
  await take('n-basia', 'popcorn', 'Basia');

  const store = new MemoryStore(data, DEMO_USER, clock);
  await store.signIn();

  return {
    data,
    store,
    setLang(next) {
      current = next;
      const entrance = data.entrances.get(DEMO_KEY);
      if (entrance) Object.assign(entrance, { name: ENTRANCE.name[next], contact: ENTRANCE.contact[next] });
      for (const post of data.posts.get(DEMO_KEY)?.values() ?? []) {
        if (post.id in TEXTS) Object.assign(post, text(post.id, next));
        for (const reply of Object.values(post.responses)) if (reply.note !== undefined && post.author !== DEMO_USER) reply.note = NOTE[next];
      }
      for (const listener of [...data.listeners]) listener();
    },
    live() {
      const timers: ReturnType<typeof setTimeout>[] = [];
      const later = (ms: number, act: () => Promise<unknown>) => {
        timers.push(setTimeout(() => void act().catch(() => undefined), ms));
      };
      const posts = () => data.posts.get(DEMO_KEY);

      later(9_000, async () => {
        if (posts()?.has('pierogi')) return;
        const at = quarter(clock() + 3 * HOUR);
        await (await neighbour('n-ala')).createPost(DEMO_KEY, offer('pierogi', at, 'Ala', 4));
      });
      later(16_000, () => take('n-ala', 'soup', 'Ala'));

      // A neighbour answers whatever the visitor posts, once.
      const answered = new Set<string>();
      const watch = () => {
        for (const post of posts()?.values() ?? []) {
          if (post.author !== DEMO_USER || answered.has(post.id)) continue;
          answered.add(post.id);
          const who = `n-${randomId(4)}`;
          later(6_000, () => take(who, post.id, 'Kasia', post.kind === 'ask' ? NOTE[current] : undefined));
        }
      };
      data.listeners.add(watch);
      watch();

      return () => {
        data.listeners.delete(watch);
        timers.forEach(clearTimeout);
      };
    },
  };
}
