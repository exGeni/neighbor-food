// A few DOM helpers. Strings become text nodes: user text is never parsed as markup.

export type Child = Node | string | number | false | null | undefined;
type Props = Record<string, unknown>;

function apply(element: Element, props: Props): void {
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (name.startsWith('on') && typeof value === 'function') {
      element.addEventListener(name.slice(2), value as EventListener);
    } else {
      element.setAttribute(name, value === true ? '' : String(value));
    }
  }
}

const append = (element: Element, children: Child[]): void => {
  for (const child of children) {
    if (child === false || child === null || child === undefined) continue;
    element.append(typeof child === 'number' ? String(child) : child);
  }
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props) apply(element, props);
  append(element, children);
  return element;
}

export function s<K extends keyof SVGElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): SVGElementTagNameMap[K] {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (props) apply(element, props);
  append(element, children);
  return element;
}

export const button = (label: Child, onclick: () => void, props: Props = {}): HTMLButtonElement =>
  h('button', { type: 'button', class: 'button', ...props, onclick }, label);

export const link = (label: Child, href: string, props: Props = {}): HTMLAnchorElement => h('a', { href, ...props }, label);

let counter = 0;
export const uid = (prefix: string): string => `${prefix}-${++counter}`;

export const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
