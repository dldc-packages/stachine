import { Stachine } from '../src/mod';
import { createHomeMachine, createBooleanMachine } from './utils';

let consoleWarnSpy = jest.spyOn(global.console, 'warn');
let consoleErrorSpy = jest.spyOn(global.console, 'error');

beforeEach(() => {
  consoleWarnSpy = jest.spyOn(global.console, 'warn');
  consoleWarnSpy.mockImplementation(() => {});
  consoleErrorSpy = jest.spyOn(global.console, 'error');
  consoleErrorSpy.mockImplementation(() => {});
});

afterEach(() => {
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

test('create a state machine without error', () => {
  type State = { state: 'Init' } | { state: 'Error'; error: unknown };
  type Action = { action: 'Hey' } | { action: 'FatalError'; error: unknown };

  expect(() =>
    Stachine<State, Action>({
      createErrorAction: (err) => ({ action: 'FatalError', error: err }),
      createErrorState: (err) => ({ state: 'Error', error: err }),
      initialState: { state: 'Init' },
      states: {
        Error: {},
        Init: {},
      },
    })
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

test('Stachine.is', () => {
  const machine = createHomeMachine();

  expect(Stachine.is(machine)).toBe(true);
  expect(Stachine.is({})).toBe(false);
  expect(Stachine.is(undefined)).toBe(false);
});

test('simple machine with listener', () => {
  type State = { state: 'Home' } | { state: 'Bed' } | { state: 'Work' } | { state: 'Error' };
  type Action = { action: 'Commute' } | { action: 'Wake' } | { action: 'Sleep' } | { action: 'Error' };

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    createErrorAction: () => ({ action: 'Error' }),
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
  const callback = jest.fn();
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
  type Action = { action: 'Commute' } | { action: 'Wake' } | { action: 'Sleep' } | { action: 'Error' };

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    createErrorAction: () => ({ action: 'Error' }),
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
  const callback = jest.fn();
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
  expect(consoleWarnSpy).toHaveBeenCalledWith('[Stachine] Calling .dispatch on an already destroyed machine is a no-op');
});

test('global effect is executed', () => {
  const cleanup = jest.fn();
  const effect = jest.fn(() => cleanup);

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
  const effect = jest.fn();

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
  type Action = { action: 'TurnOn' } | { action: 'TurnOff' } | { action: 'Toggle' } | { action: 'Noop' } | { action: 'Error' };

  const machine = Stachine<State, Action>({
    initialState: { state: 'Off' },
    createErrorAction: () => ({ action: 'Error' }),
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

  const onStateChange = jest.fn();

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

  const effect = jest.fn();

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    createErrorAction: () => {
      throw new Error('No error action');
    },
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

  const effectCleanup = jest.fn();
  const effect = jest.fn(() => effectCleanup);

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    states: { Home: { effect }, Error: {} },
    createErrorAction: () => {
      throw new Error('No error action');
    },
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
  type Action = { action: 'Commute' } | { action: 'Error' };

  const effect = jest.fn();

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },

    createErrorAction: () => ({ action: 'Error' }),
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
  type Action = { action: 'Commute' } | { action: 'Error' };

  const effectCleanup = jest.fn();
  const effect = jest.fn(() => effectCleanup);

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    createErrorAction: () => ({ action: 'Error' }),
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
  type Action = { action: 'Rerun' } | { action: 'SameRef' } | { action: 'Same' } | { action: 'Error' };

  const effectCleanup = jest.fn();
  const effect = jest.fn(() => effectCleanup);

  const machine = Stachine<State, Action>({
    initialState: { state: 'Main' },
    createErrorAction: () => ({ action: 'Error' }),
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

test('Setting false as a transition should be the same as not setting it', () => {
  type State = { state: 'Home' } | { state: 'Work' } | { state: 'Error' };
  type Action = { action: 'Commute' } | { action: 'Invalid' } | { action: 'Error' };

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    createErrorAction: () => ({ action: 'Error' }),
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

test('Setting debug should add a prefix to error messages', () => {
  type State = { state: 'Home' } | { state: 'Error' };
  type Action = { action: 'Invalid' } | { action: 'Error' };

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    createErrorAction: () => ({ action: 'Error' }),
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

test('Setting debug should add a prefix to warn messages', () => {
  type State = { state: 'Home' } | { state: 'Error' };
  type Action = { action: 'Error' };

  const machine = Stachine<State, Action>({
    initialState: { state: 'Home' },
    createErrorAction: () => ({ action: 'Error' }),
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

test('Machine.allowed should check if an action is allowed in the current state', () => {
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
