import { StateMachine } from '../src';

test('create a state machine without arre', () => {
  type States = { type: 'Init' };
  type Events = { type: 'Hey' };

  expect(
    () => new StateMachine<States, Events>({ initialState: { type: 'Init' } }, () => () => null)
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

  const machine = new StateMachine<States, Events>(
    { initialState: { type: 'Home' } },
    ({ compose, handle }) =>
      compose(
        handle('Home', 'Commute', () => ({ type: 'Work' })),
        handle('Home', 'Sleep', () => ({ type: 'Bed' })),
        handle('Work', 'Commute', () => ({ type: 'Home' })),
        handle('Bed', 'Wake', () => ({ type: 'Home' }))
      )
  );

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

  const machine = new StateMachine<States, Events>(
    { initialState: () => ({ type: 'Home' }) },
    ({ compose, handle }) =>
      compose(
        handle('Home', 'Commute', () => ({ type: 'Work' })),
        handle('Home', 'Sleep', () => ({ type: 'Bed' })),
        handle('Work', 'Commute', () => ({ type: 'Home' })),
        handle('Bed', 'Wake', () => ({ type: 'Home' }))
      )
  );

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
    '[Stachine] Event "TurnOff" on state "Off" has been ignored (transition returned null or CANCEL_TOKEN)'
  );

  consoleInfoSpy.mockRestore();
});

test('returning previous state should not call state listener', () => {
  type States = { type: 'On' } | { type: 'Off' };
  type Events = { type: 'TurnOn' } | { type: 'TurnOff' } | { type: 'Toggle' } | { type: 'Noop' };

  const machine = new StateMachine<States, Events>(
    { initialState: { type: 'Off' } },
    ({ objectByEvents }) =>
      objectByEvents({
        Noop: { Off: (_e, state) => state, On: (_e, state) => state },
        Toggle: { Off: () => ({ type: 'On' }), On: () => ({ type: 'Off' }) },
        TurnOn: { Off: () => ({ type: 'On' }) },
        TurnOff: { On: () => ({ type: 'Off' }) },
      })
  );

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

function createBooleanMachine({ debug, globalEffect }: { debug: boolean; globalEffect?: any }) {
  type States = { type: 'On' } | { type: 'Off' };
  type Events = { type: 'TurnOn' } | { type: 'TurnOff' } | { type: 'Toggle' };

  const machine = new StateMachine<States, Events>(
    { initialState: { type: 'Off' }, debug, globalEffect },
    ({ objectByEvents }) =>
      objectByEvents({
        Toggle: { Off: () => ({ type: 'On' }), On: () => ({ type: 'Off' }) },
        TurnOn: { Off: () => ({ type: 'On' }) },
        TurnOff: { On: () => ({ type: 'Off' }) },
      })
  );

  return machine;
}

function createHomeMachine({ debug }: { debug: boolean }) {
  type States = { type: 'Home' } | { type: 'Bed' } | { type: 'Work' };
  type Events = { type: 'Commute' } | { type: 'Wake' } | { type: 'Sleep' };

  const machine = new StateMachine<States, Events>(
    { initialState: { type: 'Home' }, debug },
    ({ objectByStates }) =>
      objectByStates({
        Home: { Commute: () => ({ type: 'Work' }), Sleep: () => ({ type: 'Bed' }) },
        Work: { Commute: () => ({ type: 'Home' }) },
        Bed: { Wake: () => ({ type: 'Home' }) },
      })
  );

  return machine;
}
