import { StateMachine } from '../src';

test('create a state machine without arre', () => {
  type States = { type: 'Init' };
  type Events = { type: 'Hey' };

  expect(
    () => new StateMachine<States, Events>({ initialState: { type: 'Init' } }, () => () => null)
  ).not.toThrow();
});

test('simple machine', () => {
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
  type States = { type: 'Home' } | { type: 'Bed' } | { type: 'Work' };
  type Events = { type: 'Commute' } | { type: 'Wake' } | { type: 'Sleep' };

  const machine = new StateMachine<States, Events>(
    { initialState: { type: 'Home' } },
    ({ objectByStates }) =>
      objectByStates({
        Home: {
          Commute: () => ({ type: 'Work' }),
          Sleep: () => ({ type: 'Bed' }),
        },
        Work: {
          Commute: () => ({ type: 'Home' }),
        },
        Bed: {
          Wake: () => ({ type: 'Home' }),
        },
      })
  );

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
  type States = { type: 'Home' } | { type: 'Bed' } | { type: 'Work' };
  type Events = { type: 'Commute' } | { type: 'Wake' } | { type: 'Sleep' };

  const machine = new StateMachine<States, Events>(
    { initialState: { type: 'Home' } },
    ({ objectByEvents }) =>
      objectByEvents({
        Commute: {
          Home: () => ({ type: 'Work' }),
          Work: () => ({ type: 'Home' }),
        },
        Sleep: {
          Home: () => ({ type: 'Bed' }),
        },
        Wake: {
          Bed: () => ({ type: 'Home' }),
        },
      })
  );

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
