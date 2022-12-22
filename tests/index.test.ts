import { Stachine } from '../src/mod';
import { createHomeMachine, createBooleanMachine } from './utils';

let consoleWarnSpy = jest.spyOn(global.console, 'warn');

beforeEach(() => {
  consoleWarnSpy = jest.spyOn(global.console, 'warn');
  consoleWarnSpy.mockImplementation(() => {});
});

afterEach(() => {
  consoleWarnSpy.mockRestore();
});

test('create a state machine without error', () => {
  type State = { type: 'Init' } | { type: 'Error'; error: unknown };
  type Action = { type: 'Hey' } | { type: 'FatalError'; error: unknown };

  expect(() =>
    Stachine<State, Action>({
      createErrorAction: (err) => ({ type: 'FatalError', error: err }),
      createErrorState: (err) => ({ type: 'Error', error: err }),
      states: {
        Error: {},
        Init: {},
      },
      initialState: { type: 'Init' },
    })
  ).not.toThrow();
});

test('simple machine', () => {
  const machine = createHomeMachine();

  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.dispatch({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Work' });
  machine.dispatch({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.dispatch({ type: 'Sleep' });
  expect(machine.getState()).toEqual({ type: 'Bed' });
});

test('simple machine with listener', () => {
  type State = { type: 'Home' } | { type: 'Bed' } | { type: 'Work' } | { type: 'Error' };
  type Action = { type: 'Commute' } | { type: 'Wake' } | { type: 'Sleep' } | { type: 'Error' };

  const machine = Stachine<State, Action>({
    initialState: { type: 'Home' },
    createErrorAction: () => ({ type: 'Error' }),
    createErrorState: () => ({ type: 'Error' }),
    states: {
      Home: {
        actions: {
          Commute: () => ({ type: 'Work' }),
          Sleep: () => ({ type: 'Bed' }),
        },
      },
      Work: { actions: { Commute: () => ({ type: 'Home' }) } },
      Bed: { actions: { Wake: () => ({ type: 'Home' }) } },
      Error: {},
    },
  });

  expect(machine.getState()).toEqual({ type: 'Home' });
  const callback = jest.fn();
  machine.subscribe(callback);
  machine.dispatch({ type: 'Commute' });
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith({ type: 'Work' });
  callback.mockClear();
  machine.dispatch({ type: 'Sleep' });
  expect(callback).not.toHaveBeenCalled();
});

test('simple machine with initialState function', () => {
  type State = { type: 'Home' } | { type: 'Bed' } | { type: 'Work' } | { type: 'Error' };
  type Action = { type: 'Commute' } | { type: 'Wake' } | { type: 'Sleep' } | { type: 'Error' };

  const machine = Stachine<State, Action>({
    initialState: { type: 'Home' },
    createErrorAction: () => ({ type: 'Error' }),
    createErrorState: () => ({ type: 'Error' }),
    states: {
      Home: {
        actions: {
          Commute: () => ({ type: 'Work' }),
          Sleep: () => ({ type: 'Bed' }),
        },
      },
      Work: { actions: { Commute: () => ({ type: 'Home' }) } },
      Bed: { actions: { Wake: () => ({ type: 'Home' }) } },
      Error: {},
    },
  });

  expect(machine.getState()).toEqual({ type: 'Home' });
  const callback = jest.fn();
  machine.subscribe(callback);
  machine.dispatch({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Work' });
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith({ type: 'Work' });
  callback.mockClear();
  machine.dispatch({ type: 'Sleep' });
  expect(callback).not.toHaveBeenCalled();
});

test('simple machine with object handler', () => {
  const machine = createHomeMachine();

  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.dispatch({ type: 'Wake' });
  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.dispatch({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Work' });
  machine.dispatch({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.dispatch({ type: 'Sleep' });
  expect(machine.getState()).toEqual({ type: 'Bed' });
  machine.dispatch({ type: 'Sleep' });
  expect(machine.getState()).toEqual({ type: 'Bed' });
});

test('simple machine with object handler', () => {
  const machine = createHomeMachine();

  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.dispatch({ type: 'Wake' });
  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.dispatch({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Work' });
  machine.dispatch({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.dispatch({ type: 'Sleep' });
  expect(machine.getState()).toEqual({ type: 'Bed' });
  machine.dispatch({ type: 'Sleep' });
  expect(machine.getState()).toEqual({ type: 'Bed' });
});

test('dispatch on destroyed machine should warn', () => {
  const machine = createHomeMachine();

  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.dispatch({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Work' });
  machine.destroy();
  machine.dispatch({ type: 'Commute' });
  expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
  expect(consoleWarnSpy).toHaveBeenCalledWith('[Stachine] Calling .dispatch on an already destroyed machine is a no-op');
});

test('global effect is executed', () => {
  const cleanup = jest.fn();
  const effect = jest.fn(() => cleanup);

  const machine = createBooleanMachine({ globalEffect: effect });

  expect(effect).toHaveBeenCalled();
  expect(cleanup).not.toHaveBeenCalled();
  expect(machine.getState()).toEqual({ type: 'Off' });
  machine.dispatch({ type: 'Toggle' });
  expect(machine.getState()).toEqual({ type: 'On' });
  machine.destroy();
  expect(cleanup).toHaveBeenCalled();
});

test('global effect no cleanup', () => {
  const effect = jest.fn();

  const machine = createBooleanMachine({ globalEffect: effect });

  expect(effect).toHaveBeenCalled();
  expect(machine.getState()).toEqual({ type: 'Off' });
  machine.dispatch({ type: 'Toggle' });
  expect(machine.getState()).toEqual({ type: 'On' });
  machine.destroy();
});

test('unhandled transitions should warn', () => {
  const machine = createBooleanMachine();

  expect(machine.getState()).toEqual({ type: 'Off' });
  machine.dispatch({ type: 'TurnOff' });
  expect(consoleWarnSpy).toHaveBeenCalledWith('[Stachine] Unexpected action type TurnOff in state Off');
});

test('returning previous state should not call state listener', () => {
  type State = { type: 'On' } | { type: 'Off' } | { type: 'Error' };
  type Action = { type: 'TurnOn' } | { type: 'TurnOff' } | { type: 'Toggle' } | { type: 'Noop' } | { type: 'Error' };

  const machine = Stachine<State, Action>({
    initialState: { type: 'Off' },
    createErrorAction: () => ({ type: 'Error' }),
    createErrorState: () => ({ type: 'Error' }),
    states: {
      On: {
        actions: {
          Noop: ({ state }) => state,
          Toggle: () => ({ type: 'Off' }),
          TurnOff: () => ({ type: 'Off' }),
        },
      },
      Off: {
        actions: {
          Noop: ({ state }) => state,
          Toggle: () => ({ type: 'On' }),
          TurnOn: () => ({ type: 'On' }),
        },
      },
      Error: {},
    },
  });

  const onStateChange = jest.fn();

  machine.subscribe(onStateChange);
  expect(machine.getState()).toEqual({ type: 'Off' });
  machine.dispatch({ type: 'Toggle' });
  expect(onStateChange).toHaveBeenCalledWith({ type: 'On' });
  onStateChange.mockClear();
  machine.dispatch({ type: 'Noop' });
  expect(onStateChange).not.toHaveBeenCalled();
});

test('destroy twice does nothing', () => {
  const machine = createBooleanMachine();

  expect(machine.getState()).toEqual({ type: 'Off' });
  machine.dispatch({ type: 'Toggle' });
  expect(machine.getState()).toEqual({ type: 'On' });
  machine.destroy();
  expect(() => machine.destroy()).not.toThrow();
});

test('destroy twice warn', () => {
  const machine = createBooleanMachine();

  expect(machine.getState()).toEqual({ type: 'Off' });
  machine.dispatch({ type: 'Toggle' });
  expect(machine.getState()).toEqual({ type: 'On' });
  machine.destroy();
  expect(consoleWarnSpy).not.toHaveBeenCalled();
  machine.destroy();
  expect(consoleWarnSpy).toHaveBeenCalledWith('[Stachine] Calling .destroy on an already destroyed machine is a no-op');
});

test('run effect on initial state', () => {
  type State = { type: 'Home' } | { type: 'Error' };
  type Action = never;

  const effect = jest.fn();

  const machine = Stachine<State, Action>({
    initialState: { type: 'Home' },
    createErrorAction: () => {
      throw new Error('No error action');
    },
    createErrorState: () => ({ type: 'Error' }),
    states: { Home: { effect }, Error: {} },
  });

  expect(machine.getState()).toEqual({ type: 'Home' });
  expect(effect).toHaveBeenCalled();
  machine.destroy();
});

test('run effect with cleanup on initial state', () => {
  type State = { type: 'Home' } | { type: 'Error' };
  type Action = never;

  const effectCleanup = jest.fn();
  const effect = jest.fn(() => effectCleanup);

  const machine = Stachine<State, Action>({
    initialState: { type: 'Home' },
    states: { Home: { effect }, Error: {} },
    createErrorAction: () => {
      throw new Error('No error action');
    },
    createErrorState: () => ({ type: 'Error' }),
  });

  expect(machine.getState()).toEqual({ type: 'Home' });
  expect(effect).toHaveBeenCalled();
  expect(effectCleanup).not.toHaveBeenCalled();
  machine.destroy();
  expect(effectCleanup).toHaveBeenCalled();
});

test('run effect on state', () => {
  type State = { type: 'Home' } | { type: 'Work' } | { type: 'Error' };
  type Action = { type: 'Commute' } | { type: 'Error' };

  const effect = jest.fn();

  const machine = Stachine<State, Action>({
    initialState: { type: 'Home' },

    createErrorAction: () => ({ type: 'Error' }),
    createErrorState: () => ({ type: 'Error' }),
    states: {
      Home: { actions: { Commute: () => ({ type: 'Work' }) } },
      Work: { effect },
      Error: {},
    },
  });

  expect(machine.getState()).toEqual({ type: 'Home' });
  expect(effect).not.toHaveBeenCalled();
  machine.dispatch({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Work' });
  expect(effect).toHaveBeenCalled();
});

test('cleanup effect on state', () => {
  type State = { type: 'Home' } | { type: 'Work' } | { type: 'Error' };
  type Action = { type: 'Commute' } | { type: 'Error' };

  const effectCleanup = jest.fn();
  const effect = jest.fn(() => effectCleanup);

  const machine = Stachine<State, Action>({
    initialState: { type: 'Home' },
    createErrorAction: () => ({ type: 'Error' }),
    createErrorState: () => ({ type: 'Error' }),
    states: {
      Home: { actions: { Commute: () => ({ type: 'Work' }) } },
      Work: { effect, actions: { Commute: () => ({ type: 'Home' }) } },
      Error: {},
    },
  });

  expect(machine.getState()).toEqual({ type: 'Home' });
  expect(effect).not.toHaveBeenCalled();
  expect(effectCleanup).not.toHaveBeenCalled();
  machine.dispatch({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Work' });
  expect(effect).toHaveBeenCalled();
  expect(effectCleanup).not.toHaveBeenCalled();
  machine.dispatch({ type: 'Commute' });
  expect(effectCleanup).toHaveBeenCalled();
});
