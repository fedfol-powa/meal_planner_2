import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { isBusy, registerBusyCheck, registeredBusy, resetBusy, trackBusy, useBusyCheck } from './busy';

afterEach(() => {
  resetBusy();
  document.body.innerHTML = '';
});

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('busy page', () => {
  it('is free with nothing running, registered or open', () => {
    expect(isBusy()).toBe(false);
    expect(registeredBusy()).toBe(false);
  });
  it('counts a tracked operation until it settles, resolved or rejected, and passes its outcome on', async () => {
    const ok = deferred<number>();
    const failing = deferred();
    const tracked = trackBusy(ok.promise);
    const trackedFailure = trackBusy(failing.promise);
    expect(registeredBusy()).toBe(true);
    ok.resolve(7);
    expect(await tracked).toBe(7);
    expect(registeredBusy()).toBe(true);
    failing.reject(new Error('no'));
    await expect(trackedFailure).rejects.toThrow('no');
    expect(registeredBusy()).toBe(false);
  });
  it('is busy while a registered check says so, and free once it is removed', () => {
    let writing = true;
    const remove = registerBusyCheck(() => writing);
    expect(isBusy()).toBe(true);
    writing = false;
    expect(isBusy()).toBe(false);
    writing = true;
    remove();
    expect(isBusy()).toBe(false);
  });
  it('counts a check that throws as busy', () => {
    registerBusyCheck(() => {
      throw new Error('boom');
    });
    expect(isBusy()).toBe(true);
  });
  it('is busy with an open sheet', () => {
    document.body.innerHTML = '<dialog open></dialog>';
    expect(isBusy()).toBe(true);
    document.body.innerHTML = '<dialog></dialog>';
    expect(isBusy()).toBe(false);
  });
  it('is busy with the focus in a text field, not on a button or checkbox', () => {
    document.body.innerHTML = '<input id="t" type="text"><input id="p" type="password"><textarea id="a"></textarea><input id="c" type="checkbox"><button id="b">x</button><div id="e" contenteditable="true" tabindex="0"></div>';
    const focus = (id: string) => (document.getElementById(id) as HTMLElement).focus();
    for (const [id, busy] of [['t', true], ['p', true], ['a', true], ['c', false], ['b', false], ['e', true]] as const) {
      focus(id);
      expect(isBusy(), id).toBe(busy);
    }
  });
  it('registers a hook check while mounted, reading its latest value', () => {
    function Probe({ busy }: { busy: boolean }) {
      useBusyCheck(() => busy);
      return null;
    }
    const view = render(<Probe busy={false} />);
    expect(isBusy()).toBe(false);
    view.rerender(<Probe busy />);
    expect(isBusy()).toBe(true);
    view.unmount();
    expect(isBusy()).toBe(false);
  });
});
