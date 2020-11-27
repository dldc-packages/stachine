import { StateMachine } from '../src';

export function createBooleanMachine({
  debug,
  globalEffect,
}: {
  debug: boolean;
  globalEffect?: any;
}) {
  type States = { type: 'On' } | { type: 'Off' };
  type Events = { type: 'TurnOn' } | { type: 'TurnOff' } | { type: 'Toggle' };

  const machine = new StateMachine<States, Events>({
    initialState: { type: 'Off' },
    debug,
    globalEffect,
    config: {
      On: {
        on: {
          Toggle: () => ({ type: 'Off' }),
          TurnOff: () => ({ type: 'Off' }),
        },
      },
      Off: {
        on: {
          Toggle: () => ({ type: 'On' }),
          TurnOn: () => ({ type: 'On' }),
        },
      },
    },
  });

  return machine;
}

export function createHomeMachine({ debug }: { debug: boolean }) {
  type States = { type: 'Home' } | { type: 'Bed' } | { type: 'Work' };
  type Events = { type: 'Commute' } | { type: 'Wake' } | { type: 'Sleep' };

  const machine = new StateMachine<States, Events>({
    initialState: { type: 'Home' },
    debug,
    config: {
      Home: { on: { Commute: () => ({ type: 'Work' }), Sleep: () => ({ type: 'Bed' }) } },
      Work: { on: { Commute: () => ({ type: 'Home' }) } },
      Bed: { on: { Wake: () => ({ type: 'Home' }) } },
    },
  });

  return machine;
}
