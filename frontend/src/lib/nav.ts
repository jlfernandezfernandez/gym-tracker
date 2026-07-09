/** Screen navigation stack. Screens can register a re-enter renderer so
 * going "back" re-renders fresh state instead of showing stale DOM. */
import { screen } from './ui';

const stack: string[] = [];
const reenter = new Map<string, () => void>();
let popFallback: () => void = () => screen('landing');

export function onReenter(id: string, fn: () => void) {
  reenter.set(id, fn);
}

/** What to show when the stack is empty (e.g. read-only share links must not land on an empty home). */
export function setPopFallback(fn: () => void) {
  popFallback = fn;
}

export function resetStack() {
  stack.length = 0;
}

export function pushScreen(id: string) {
  stack.push(id);
  screen(id);
}

export function popScreen() {
  const prev = stack.pop();
  if (prev) {
    const render = reenter.get(prev);
    render ? render() : screen(prev);
    return;
  }
  popFallback();
}
