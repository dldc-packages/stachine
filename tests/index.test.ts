import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Stachine } from '../src/mod';
import { createBooleanMachine, createHomeMachine } from './utils';

let consoleWarnSpy = vi.spyOn(global.console, 'warn');
let consoleErrorSpy = vi.spyOn(global.console, 'error');

beforeEach(() => {
  consoleWarnSpy = vi.spyOn(global.console, 'warn');
  consoleWarnSpy.mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(global.console, 'error');
  consoleErrorSpy.mockImplementation(() => {});
});

afterEach(() => {
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

test('create a state machine without error', () => {
  type State = { state: 'Init' } | { state: 'Error'; error: unknown };
  type Action = { action: 'Hey' };

  expect(() =>
    Stachine<State, Action>({
      createErrorState: (err) => ({ state: 'Error', error: err }),
      initialState: { state: 'Init' },
      states: {
        Error: {},
        Init: {},
      },
    }),
  ).not.toThrow();
});

test('simple machine', () => {
  const machine = createHomeMachine();

  expect(machine.getState()).toEqual({ state: 'Home' });
  machine.dispatch({ action: 'Commute' });
  expect(machine.getState()).toEqual({ state: 'Work' });
  machine.dispatch({ action: 'Commute' });
  expect(machine.getState()).toEqual({ state: 'Home' });
  machine.dispatch({ action: 'Sleep' });
  expect(machine.getState()).toEqual({ state: 'Bed' });
});

test('calling Stachine.is', () => {
  const machine = createHomeMachine();

  expect(Stachine.is(machine)).toBe(true);
  expect(Stachine.is({})).toBe(false);
  expect(Stachine.is(undefined)).toBe(false);
});

test('simple machine with listener', () => {
  type State = { state: 'Home' } | { state: 'Bed' } | { state: 'Work' } | { state: 'Error' };
  type Action = { action: 'Commute' } | { action: 'Wake' } | { action: 'Sleep' };

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    createErrorState: () => ({ state: 'Error' }),
    states: {
      Home: {
        actions: {
          Commute: () => ({ state: 'Work' }),
          Sleep: () => ({ state: 'Bed' }),
        },
      },
      Work: { actions: { Commute: () => ({ state: 'Home' }) } },
      Bed: { actions: { Wake: () => ({ state: 'Home' }) } },
      Error: {},
    },
  });

  expect(machine.getState()).toEqual({ state: 'Home' });
  const callback = vi.fn();
  machine.subscribe(callback);
  machine.dispatch({ action: 'Commute' });
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith({ state: 'Work' });
  callback.mockClear();
  machine.dispatch({ action: 'Sleep' });
  expect(callback).not.toHaveBeenCalled();
});

test('simple machine with initialState function', () => {
  type State = { state: 'Home' } | { state: 'Bed' } | { state: 'Work' } | { state: 'Error' };
  type Action = { action: 'Commute' } | { action: 'Wake' } | { action: 'Sleep' };

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    createErrorState: () => ({ state: 'Error' }),
    states: {
      Home: {
        actions: {
          Commute: () => ({ state: 'Work' }),
          Sleep: () => ({ state: 'Bed' }),
        },
      },
      Work: { actions: { Commute: () => ({ state: 'Home' }) } },
      Bed: { actions: { Wake: () => ({ state: 'Home' }) } },
      Error: {},
    },
  });

  expect(machine.getState()).toEqual({ state: 'Home' });
  const callback = vi.fn();
  machine.subscribe(callback);
  machine.dispatch({ action: 'Commute' });
  expect(machine.getState()).toEqual({ state: 'Work' });
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith({ state: 'Work' });
  callback.mockClear();
  machine.dispatch({ action: 'Sleep' });
  expect(callback).not.toHaveBeenCalled();
});

test('simple machine with object handler', () => {
  const machine = createHomeMachine();

  expect(machine.getState()).toEqual({ state: 'Home' });
  machine.dispatch({ action: 'Wake' });
  expect(machine.getState()).toEqual({ state: 'Home' });
  machine.dispatch({ action: 'Commute' });
  expect(machine.getState()).toEqual({ state: 'Work' });
  machine.dispatch({ action: 'Commute' });
  expect(machine.getState()).toEqual({ state: 'Home' });
  machine.dispatch({ action: 'Sleep' });
  expect(machine.getState()).toEqual({ state: 'Bed' });
  machine.dispatch({ action: 'Sleep' });
  expect(machine.getState()).toEqual({ state: 'Bed' });
});

test('simple machine with object handler', () => {
  const machine = createHomeMachine();

  expect(machine.getState()).toEqual({ state: 'Home' });
  machine.dispatch({ action: 'Wake' });
  expect(machine.getState()).toEqual({ state: 'Home' });
  machine.dispatch({ action: 'Commute' });
  expect(machine.getState()).toEqual({ state: 'Work' });
  machine.dispatch({ action: 'Commute' });
  expect(machine.getState()).toEqual({ state: 'Home' });
  machine.dispatch({ action: 'Sleep' });
  expect(machine.getState()).toEqual({ state: 'Bed' });
  machine.dispatch({ action: 'Sleep' });
  expect(machine.getState()).toEqual({ state: 'Bed' });
});

test('dispatch on destroyed machine should warn', () => {
  const machine = createHomeMachine();

  expect(machine.getState()).toEqual({ state: 'Home' });
  machine.dispatch({ action: 'Commute' });
  expect(machine.getState()).toEqual({ state: 'Work' });
  machine.destroy();
  machine.dispatch({ action: 'Commute' });
  expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
  expect(consoleWarnSpy).toHaveBeenCalledWith(
    '[Stachine] Calling .dispatch on an already destroyed machine is a no-op',
  );
});

test('global effect is executed', () => {
  const cleanup = vi.fn();
  const effect = vi.fn(() => cleanup);

  const machine = createBooleanMachine({ globalEffect: effect });

  expect(effect).toHaveBeenCalled();
  expect(cleanup).not.toHaveBeenCalled();
  expect(machine.getState()).toEqual({ state: 'Off' });
  machine.dispatch({ action: 'Toggle' });
  expect(machine.getState()).toEqual({ state: 'On' });
  machine.destroy();
  expect(cleanup).toHaveBeenCalled();
});

test('global effect no cleanup', () => {
  const effect = vi.fn();

  const machine = createBooleanMachine({ globalEffect: effect });

  expect(effect).toHaveBeenCalled();
  expect(machine.getState()).toEqual({ state: 'Off' });
  machine.dispatch({ action: 'Toggle' });
  expect(machine.getState()).toEqual({ state: 'On' });
  machine.destroy();
});

test('unhandled transitions should be ignore if not strict', () => {
  const machine = createBooleanMachine();

  expect(machine.getState()).toEqual({ state: 'Off' });
  machine.dispatch({ action: 'TurnOff' });
  expect(consoleErrorSpy).not.toHaveBeenCalled();
  expect(consoleWarnSpy).not.toHaveBeenCalled();
});

test('unhandled transitions should console.error when strict', () => {
  const machine = createBooleanMachine({ strict: true });

  expect(machine.getState()).toEqual({ state: 'Off' });
  machine.dispatch({ action: 'TurnOff' });
  expect(consoleErrorSpy).toHaveBeenCalledWith(`[Stachine] Action TurnOff is not allowed in state Off`);
  expect(consoleWarnSpy).not.toHaveBeenCalled();
});

test('returning previous state should not call state listener', () => {
  type State = { state: 'On' } | { state: 'Off' } | { state: 'Error' };
  type Action = { action: 'TurnOn' } | { action: 'TurnOff' } | { action: 'Toggle' } | { action: 'Noop' };

  const machine = Stachine<State, Action>({
    initialState: { state: 'Off' },
    createErrorState: () => ({ state: 'Error' }),
    states: {
      On: {
        actions: {
          Noop: ({ state }) => state,
          Toggle: () => ({ state: 'Off' }),
          TurnOff: () => ({ state: 'Off' }),
        },
      },
      Off: {
        actions: {
          Noop: ({ state }) => state,
          Toggle: () => ({ state: 'On' }),
          TurnOn: () => ({ state: 'On' }),
        },
      },
      Error: {},
    },
  });

  const onStateChange = vi.fn();

  machine.subscribe(onStateChange);
  expect(machine.getState()).toEqual({ state: 'Off' });
  machine.dispatch({ action: 'Toggle' });
  expect(onStateChange).toHaveBeenCalledWith({ state: 'On' });
  onStateChange.mockClear();
  machine.dispatch({ action: 'Noop' });
  expect(onStateChange).not.toHaveBeenCalled();
});

test('destroy twice does nothing', () => {
  const machine = createBooleanMachine();

  expect(machine.getState()).toEqual({ state: 'Off' });
  machine.dispatch({ action: 'Toggle' });
  expect(machine.getState()).toEqual({ state: 'On' });
  machine.destroy();
  expect(() => machine.destroy()).not.toThrow();
});

test('destroy twice warn', () => {
  const machine = createBooleanMachine();

  expect(machine.getState()).toEqual({ state: 'Off' });
  machine.dispatch({ action: 'Toggle' });
  expect(machine.getState()).toEqual({ state: 'On' });
  machine.destroy();
  expect(consoleWarnSpy).not.toHaveBeenCalled();
  machine.destroy();
  expect(consoleWarnSpy).toHaveBeenCalledWith('[Stachine] Calling .destroy on an already destroyed machine is a no-op');
});

test('run effect on initial state', () => {
  type State = { state: 'Home' } | { state: 'Error' };
  type Action = never;

  const effect = vi.fn();

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    createErrorState: () => ({ state: 'Error' }),
    states: { Home: { effect }, Error: {} },
  });

  expect(machine.getState()).toEqual({ state: 'Home' });
  expect(effect).toHaveBeenCalled();
  machine.destroy();
});

test('run effect with cleanup on initial state', () => {
  type State = { state: 'Home' } | { state: 'Error' };
  type Action = never;

  const effectCleanup = vi.fn();
  const effect = vi.fn(() => effectCleanup);

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    states: { Home: { effect }, Error: {} },
    createErrorState: () => ({ state: 'Error' }),
  });

  expect(machine.getState()).toEqual({ state: 'Home' });
  expect(effect).toHaveBeenCalled();
  expect(effectCleanup).not.toHaveBeenCalled();
  machine.destroy();
  expect(effectCleanup).toHaveBeenCalled();
});

test('run effect on state', () => {
  type State = { state: 'Home' } | { state: 'Work' } | { state: 'Error' };
  type Action = { action: 'Commute' };

  const effect = vi.fn();

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    createErrorState: () => ({ state: 'Error' }),
    states: {
      Home: { actions: { Commute: () => ({ state: 'Work' }) } },
      Work: { effect },
      Error: {},
    },
  });

  expect(machine.getState()).toEqual({ state: 'Home' });
  expect(effect).not.toHaveBeenCalled();
  machine.dispatch({ action: 'Commute' });
  expect(machine.getState()).toEqual({ state: 'Work' });
  expect(effect).toHaveBeenCalled();
});

test('cleanup effect on state', () => {
  type State = { state: 'Home' } | { state: 'Work' } | { state: 'Error' };
  type Action = { action: 'Commute' };

  const effectCleanup = vi.fn();
  const effect = vi.fn(() => effectCleanup);

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    createErrorState: () => ({ state: 'Error' }),
    states: {
      Home: { actions: { Commute: () => ({ state: 'Work' }) } },
      Work: { effect, actions: { Commute: () => ({ state: 'Home' }) } },
      Error: {},
    },
  });

  expect(machine.getState()).toEqual({ state: 'Home' });
  expect(effect).not.toHaveBeenCalled();
  expect(effectCleanup).not.toHaveBeenCalled();
  machine.dispatch({ action: 'Commute' });
  expect(machine.getState()).toEqual({ state: 'Work' });
  expect(effect).toHaveBeenCalled();
  expect(effectCleanup).not.toHaveBeenCalled();
  machine.dispatch({ action: 'Commute' });
  expect(effectCleanup).toHaveBeenCalled();
});

test('run cleanup and effect when transition to same state with rerunEffect', () => {
  type State = { state: 'Main' } | { state: 'Error' };
  type Action = { action: 'Rerun' } | { action: 'SameRef' } | { action: 'Same' };

  const effectCleanup = vi.fn();
  const effect = vi.fn(() => effectCleanup);

  const machine = Stachine<State, Action>({
    initialState: { state: 'Main' },
    createErrorState: () => ({ state: 'Error' }),
    states: {
      Main: {
        effect,
        actions: {
          Rerun: ({ rerunEffect, state }) => rerunEffect({ ...state }),
          SameRef: ({ state }) => state,
          Same: () => ({ state: 'Main' }),
        },
      },
      Error: {},
    },
  });

  const state1 = machine.getState();
  expect(machine.getState()).toEqual({ state: 'Main' });
  expect(effect).toHaveBeenCalledTimes(1);
  expect(effectCleanup).not.toHaveBeenCalled();

  machine.dispatch({ action: 'SameRef' });
  const state2 = machine.getState();
  expect(state2).toEqual(state1);
  expect(state2).toBe(state1);
  expect(effect).toHaveBeenCalledTimes(1);
  expect(effectCleanup).not.toHaveBeenCalled();

  machine.dispatch({ action: 'Same' });
  const state3 = machine.getState();
  expect(state3).toEqual(state2);
  expect(state3).not.toBe(state2);
  expect(effect).toHaveBeenCalledTimes(1);
  expect(effectCleanup).not.toHaveBeenCalled();

  machine.dispatch({ action: 'Rerun' });
  const state4 = machine.getState();
  expect(state4).toEqual(state3);
  expect(state4).not.toBe(state3);
  expect(effect).toHaveBeenCalledTimes(2);
  expect(effectCleanup).toHaveBeenCalledTimes(1);
});

test('setting false as a transition should be the same as not setting it', () => {
  type State = { state: 'Home' } | { state: 'Work' } | { state: 'Error' };
  type Action = { action: 'Commute' } | { action: 'Invalid' };

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    createErrorState: () => ({ state: 'Error' }),
    strict: true,
    states: {
      Home: {
        actions: {
          Commute: () => ({ state: 'Work' }),
          Invalid: false,
        },
      },
      Work: {
        actions: {
          Commute: () => ({ state: 'Home' }),
        },
      },
      Error: {},
    },
  });

  expect(machine.getState()).toEqual({ state: 'Home' });
  machine.dispatch({ action: 'Invalid' });
  expect(machine.getState()).toEqual({ state: 'Home' });
  expect(consoleErrorSpy).toHaveBeenCalledWith(`[Stachine] Action Invalid is not allowed in state Home`);
  machine.dispatch({ action: 'Commute' });
  expect(machine.getState()).toEqual({ state: 'Work' });
  consoleErrorSpy.mockClear();
  machine.dispatch({ action: 'Invalid' });
  expect(machine.getState()).toEqual({ state: 'Work' });
  expect(consoleErrorSpy).toHaveBeenCalledWith(`[Stachine] Action Invalid is not allowed in state Work`);
});

test('setting debug should add a prefix to error messages', () => {
  type State = { state: 'Home' } | { state: 'Error' };
  type Action = { action: 'Invalid' };

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    createErrorState: () => ({ state: 'Error' }),
    strict: true,
    debug: 'Debug',
    states: { Home: { actions: { Invalid: false } }, Error: {} },
  });

  expect(machine.getState()).toEqual({ state: 'Home' });
  machine.dispatch({ action: 'Invalid' });
  expect(machine.getState()).toEqual({ state: 'Home' });
  expect(consoleErrorSpy).toHaveBeenCalledWith(`[Debug] Action Invalid is not allowed in state Home`);
});

test('setting debug should add a prefix to warn messages', () => {
  type State = { state: 'Home' } | { state: 'Error' };
  type Action = { action: 'Error' };

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    createErrorState: () => ({ state: 'Error' }),
    strict: false,
    debug: 'Debug',
    states: { Home: {}, Error: {} },
  });

  expect(machine.getState()).toEqual({ state: 'Home' });
  machine.destroy();
  machine.destroy();
  expect(consoleWarnSpy).toHaveBeenCalledWith(`[Debug] Calling .destroy on an already destroyed machine is a no-op`);
});

test('calling Machine.allowed should check if an action is allowed in the current state', () => {
  const machine = createHomeMachine();

  expect(machine.getState()).toEqual({ state: 'Home' });
  expect(machine.allowed({ action: 'Commute' })).toBe(true);
  expect(machine.allowed({ action: 'Sleep' })).toBe(true);
  expect(machine.allowed({ action: 'Wake' })).toBe(false);

  machine.dispatch({ action: 'Commute' });
  expect(machine.getState()).toEqual({ state: 'Work' });
  expect(machine.allowed({ action: 'Commute' })).toBe(true);
  expect(machine.allowed({ action: 'Sleep' })).toBe(false);
  expect(machine.allowed({ action: 'Wake' })).toBe(false);
});

test('reaction should run on state', () => {
  type State = { state: 'Main' } | { state: 'Error' };
  type Action = { action: 'SameState' } | { action: 'SameRef' };

  const reaction = vi.fn();

  const machine = Stachine<State, Action>({
    initialState: { state: 'Main' },
    states: {
      Main: {
        reaction,
        actions: {
          SameRef: ({ state }) => state,
          SameState: () => ({ state: 'Main' }),
        },
      },
      Error: {},
    },
    createErrorState: () => ({ state: 'Error' }),
  });

  expect(reaction).toHaveBeenCalledTimes(1);
  machine.dispatch({ action: 'SameRef' });
  expect(reaction).toHaveBeenCalledTimes(1);
  machine.dispatch({ action: 'SameState' });
  expect(reaction).toHaveBeenCalledTimes(2);
});

test('dispatch in reaction should not emit the intermediate state', () => {
  type State = { state: 'Init' } | { state: 'Step1' } | { state: 'Step2' } | { state: 'Error' };
  type Action = { action: 'Next' };

  const step1Effect = vi.fn();
  const step2Effect = vi.fn();

  const machine = Stachine<State, Action>({
    createErrorState: () => ({ state: 'Error' }),
    initialState: { state: 'Init' },
    states: {
      Error: {},
      Init: {
        actions: {
          Next: () => ({ state: 'Step1' }),
        },
      },
      Step1: {
        reaction: ({ dispatch }) => {
          dispatch({ action: 'Next' });
        },
        effect: step1Effect,
        actions: {
          Next: () => ({ state: 'Step2' }),
        },
      },
      Step2: {
        effect: step2Effect,
      },
    },
  });

  const onEmit = vi.fn();
  machine.subscribe(onEmit);

  machine.dispatch({ action: 'Next' });
  expect(onEmit).toHaveBeenCalledTimes(1);
  expect(onEmit).toHaveBeenCalledWith({ state: 'Step2' });
  expect(onEmit).not.toHaveBeenCalledWith({ state: 'Step1' });
  expect(step1Effect).not.toHaveBeenCalled();
  expect(step2Effect).toHaveBeenCalled();
});
