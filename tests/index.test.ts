import { StateMachine } from '../src';

test('create a state machine without arre', () => {
  type States = { type: 'Init' };
  type Events = { type: 'Hey' };

  expect(() => new StateMachine<States, Events>({ type: 'Init' }, {})).not.toThrow();
});

test('warn if duplicate handler', () => {
  const spy = jest.spyOn(console, 'warn').mockImplementation();

  type States = { type: 'Init' };
  type Events = { type: 'Hey' };

  new StateMachine<States, Events>(
    { type: 'Init' },
    {
      onEvent: { Hey: { Init: () => null } },
      onState: { Init: { Hey: () => null } },
    }
  );

  expect(console.warn).toHaveBeenCalledWith(
    `Duplicate handler: Hey->Init is already handled by Init->Hey !`
  );
  spy.mockRestore();
});

test('simple machine', () => {
  type States = { type: 'Home' } | { type: 'Bed' } | { type: 'Work' };
  type Events = { type: 'Commute' } | { type: 'Wake' } | { type: 'Sleep' };

  const machine = new StateMachine<States, Events>(
    { type: 'Home' },
    {
      onEvent: {
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
      },
    }
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
    { type: 'Home' },
    {
      onEvent: {
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
      },
    }
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

  const machine = new StateMachine<States, Events>(() => ({ type: 'Home' }), {
    onEvent: {
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
