import { StateMachine } from '../src';
import { createHomeMachine, createBooleanMachine } from './utils';

test('create a state machine without arre', () => {
  type States = { type: 'Init' };
  type Events = { type: 'Hey' };

  expect(
    () => new StateMachine<States, Events>({ initialState: { type: 'Init' }, config: {} })
  ).not.toThrow();
});

test('simple machine', () => {
  const machine = createHomeMachine({ debug: false });

  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.emit({ type: 'Wake' });
  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.emit({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Work' });
  machine.emit({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.emit({ type: 'Sleep' });
  expect(machine.getState()).toEqual({ type: 'Bed' });
  machine.emit({ type: 'Sleep' });
  expect(machine.getState()).toEqual({ type: 'Bed' });
});

test('simple machine with listener', () => {
  type States = { type: 'Home' } | { type: 'Bed' } | { type: 'Work' };
  type Events = { type: 'Commute' } | { type: 'Wake' } | { type: 'Sleep' };

  const machine = new StateMachine<States, Events>({
    initialState: { type: 'Home' },
    config: {
      Home: {
        on: {
          Commute: () => ({ type: 'Work' }),
          Sleep: () => ({ type: 'Bed' }),
        },
      },
      Work: { on: { Commute: () => ({ type: 'Home' }) } },
      Bed: { on: { Wake: () => ({ type: 'Home' }) } },
    },
  });

  expect(machine.getState()).toEqual({ type: 'Home' });
  const callback = jest.fn();
  machine.subscribe(callback);
  machine.emit({ type: 'Commute' });
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith({ type: 'Work' });
  callback.mockClear();
  machine.emit({ type: 'Sleep' });
  expect(callback).not.toHaveBeenCalled();
});

test('simple machine with initialState function', () => {
  type States = { type: 'Home' } | { type: 'Bed' } | { type: 'Work' };
  type Events = { type: 'Commute' } | { type: 'Wake' } | { type: 'Sleep' };

  const machine = new StateMachine<States, Events>({
    initialState: { type: 'Home' },
    config: {
      Home: {
        on: {
          Commute: () => ({ type: 'Work' }),
          Sleep: () => ({ type: 'Bed' }),
        },
      },
      Work: { on: { Commute: () => ({ type: 'Home' }) } },
      Bed: { on: { Wake: () => ({ type: 'Home' }) } },
    },
  });

  expect(machine.getState()).toEqual({ type: 'Home' });
  const callback = jest.fn();
  machine.subscribe(callback);
  machine.emit({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Work' });
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith({ type: 'Work' });
  callback.mockClear();
  machine.emit({ type: 'Sleep' });
  expect(callback).not.toHaveBeenCalled();
});

test('simple machine with object handler', () => {
  const machine = createHomeMachine({ debug: false });

  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.emit({ type: 'Wake' });
  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.emit({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Work' });
  machine.emit({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.emit({ type: 'Sleep' });
  expect(machine.getState()).toEqual({ type: 'Bed' });
  machine.emit({ type: 'Sleep' });
  expect(machine.getState()).toEqual({ type: 'Bed' });
});

test('simple machine with object handler', () => {
  const machine = createHomeMachine({ debug: false });

  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.emit({ type: 'Wake' });
  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.emit({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Work' });
  machine.emit({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.emit({ type: 'Sleep' });
  expect(machine.getState()).toEqual({ type: 'Bed' });
  machine.emit({ type: 'Sleep' });
  expect(machine.getState()).toEqual({ type: 'Bed' });
});

test('emit on destroyed machine should warn if debug', () => {
  const consoleWarnSpy = jest.spyOn(global.console, 'warn');
  consoleWarnSpy.mockImplementation(() => {});

  const machine = createHomeMachine({ debug: true });

  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.emit({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Work' });
  machine.destroy();
  machine.emit({ type: 'Commute' });
  expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  expect(consoleWarnSpy).toHaveBeenCalledWith(
    '[Stachine] Calling emit on an already destroyed machine is a no-op'
  );

  consoleWarnSpy.mockRestore();
});

test('emit on destroyed machine should not warn if debug is false', () => {
  const consoleWarnSpy = jest.spyOn(global.console, 'warn');
  consoleWarnSpy.mockImplementation(() => {});

  const machine = createHomeMachine({ debug: false });

  expect(machine.getState()).toEqual({ type: 'Home' });
  machine.emit({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Work' });
  machine.destroy();
  machine.emit({ type: 'Commute' });
  expect(consoleWarnSpy).not.toHaveBeenCalled();

  consoleWarnSpy.mockRestore();
});

test('global effect is run', () => {
  const cleanup = jest.fn();
  const effect = jest.fn(() => cleanup);

  const machine = createBooleanMachine({ debug: false, globalEffect: effect });

  expect(effect).toHaveBeenCalled();
  expect(cleanup).not.toHaveBeenCalled();
  expect(machine.getState()).toEqual({ type: 'Off' });
  machine.emit({ type: 'Toggle' });
  expect(machine.getState()).toEqual({ type: 'On' });
  machine.destroy();
  expect(cleanup).toHaveBeenCalled();
});

test('global effect no cleanup', () => {
  const effect = jest.fn();

  const machine = createBooleanMachine({ debug: false, globalEffect: effect });

  expect(effect).toHaveBeenCalled();
  expect(machine.getState()).toEqual({ type: 'Off' });
  machine.emit({ type: 'Toggle' });
  expect(machine.getState()).toEqual({ type: 'On' });
  machine.destroy();
});

test('unhandled transitions should info if debug', () => {
  const consoleInfoSpy = jest.spyOn(global.console, 'info');
  consoleInfoSpy.mockImplementation(() => {});

  const machine = createBooleanMachine({ debug: true });

  expect(machine.getState()).toEqual({ type: 'Off' });
  machine.emit({ type: 'TurnOff' });
  expect(consoleInfoSpy).toHaveBeenCalledWith(
    '[Stachine] Event "TurnOff" on state "Off" has been ignored (event not present in "on")'
  );

  consoleInfoSpy.mockRestore();
});

test('returning previous state should not call state listener', () => {
  type States = { type: 'On' } | { type: 'Off' };
  type Events = { type: 'TurnOn' } | { type: 'TurnOff' } | { type: 'Toggle' } | { type: 'Noop' };

  const machine = new StateMachine<States, Events>({
    initialState: { type: 'Off' },
    config: {
      On: {
        on: {
          Noop: (_, state) => state,
          Toggle: () => ({ type: 'Off' }),
          TurnOff: () => ({ type: 'Off' }),
        },
      },
      Off: {
        on: {
          Noop: (_, state) => state,
          Toggle: () => ({ type: 'On' }),
          TurnOn: () => ({ type: 'On' }),
        },
      },
    },
  });

  const onStateChange = jest.fn();

  machine.subscribe(onStateChange);
  expect(machine.getState()).toEqual({ type: 'Off' });
  machine.emit({ type: 'Toggle' });
  expect(onStateChange).toHaveBeenCalledWith({ type: 'On' });
  onStateChange.mockClear();
  machine.emit({ type: 'Noop' });
  expect(onStateChange).not.toHaveBeenCalled();
});

test('destroy twice does nothing', () => {
  const machine = createBooleanMachine({ debug: false });

  expect(machine.getState()).toEqual({ type: 'Off' });
  machine.emit({ type: 'Toggle' });
  expect(machine.getState()).toEqual({ type: 'On' });
  machine.destroy();
  expect(() => machine.destroy()).not.toThrow();
});

test('destroy twice warn if debug', () => {
  const consoleWarnSpy = jest.spyOn(global.console, 'warn');
  consoleWarnSpy.mockImplementation(() => {});

  const machine = createBooleanMachine({ debug: true });

  expect(machine.getState()).toEqual({ type: 'Off' });
  machine.emit({ type: 'Toggle' });
  expect(machine.getState()).toEqual({ type: 'On' });
  machine.destroy();
  expect(consoleWarnSpy).not.toHaveBeenCalled();
  machine.destroy();
  expect(consoleWarnSpy).toHaveBeenCalledWith(
    '[Stachine] Calling destroy on an already destroyed machine is a no-op'
  );

  consoleWarnSpy.mockRestore();
});

test('run effect on initial state', () => {
  type States = { type: 'Home' };
  type Events = never;

  const effect = jest.fn();

  const machine = new StateMachine<States, Events>({
    initialState: { type: 'Home' },
    config: { Home: { effect } },
  });

  expect(machine.getState()).toEqual({ type: 'Home' });
  expect(effect).toHaveBeenCalled();
  machine.destroy();
});

test('run effect with cleanup on initial state', () => {
  type States = { type: 'Home' };
  type Events = never;

  const effectCleanup = jest.fn();
  const effect = jest.fn(() => effectCleanup);

  const machine = new StateMachine<States, Events>({
    initialState: { type: 'Home' },
    config: { Home: { effect } },
  });

  expect(machine.getState()).toEqual({ type: 'Home' });
  expect(effect).toHaveBeenCalled();
  expect(effectCleanup).not.toHaveBeenCalled();
  machine.destroy();
  expect(effectCleanup).toHaveBeenCalled();
});

test('run effect on state', () => {
  type States = { type: 'Home' } | { type: 'Work' };
  type Events = { type: 'Commute' };

  const effect = jest.fn();

  const machine = new StateMachine<States, Events>({
    initialState: { type: 'Home' },
    config: {
      Home: { on: { Commute: () => ({ type: 'Work' }) } },
      Work: { effect },
    },
  });

  expect(machine.getState()).toEqual({ type: 'Home' });
  expect(effect).not.toHaveBeenCalled();
  machine.emit({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Work' });
  expect(effect).toHaveBeenCalled();
});

test('cleanup effect on state', () => {
  type States = { type: 'Home' } | { type: 'Work' };
  type Events = { type: 'Commute' };

  const effectCleanup = jest.fn();
  const effect = jest.fn(() => effectCleanup);

  const machine = new StateMachine<States, Events>({
    initialState: { type: 'Home' },
    config: {
      Home: { on: { Commute: () => ({ type: 'Work' }) } },
      Work: { effect, on: { Commute: () => ({ type: 'Home' }) } },
    },
  });

  expect(machine.getState()).toEqual({ type: 'Home' });
  expect(effect).not.toHaveBeenCalled();
  expect(effectCleanup).not.toHaveBeenCalled();
  machine.emit({ type: 'Commute' });
  expect(machine.getState()).toEqual({ type: 'Work' });
  expect(effect).toHaveBeenCalled();
  expect(effectCleanup).not.toHaveBeenCalled();
  machine.emit({ type: 'Commute' });
  expect(effectCleanup).toHaveBeenCalled();
});
