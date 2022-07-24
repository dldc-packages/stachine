import { StateMachine } from '../src/mod';

export function createBooleanMachine({ debug, globalEffect }: { debug: boolean; globalEffect?: any }) {
  type States = { type: 'On' } | { type: 'Off' };
  type Events = { type: 'TurnOn' } | { type: 'TurnOff' } | { type: 'Toggle' };

  const machine = new StateMachine<States, Events>({
    initialState: { type: 'Off' },
    debug,
    globalEffect,
    commands: {},
    states: {
      On: {
        events: {
          Toggle: () => ({ type: 'Off' }),
          TurnOff: () => ({ type: 'Off' }),
        },
      },
      Off: {
        events: {
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
    commands: {},
    states: {
      Home: { events: { Commute: () => ({ type: 'Work' }), Sleep: () => ({ type: 'Bed' }) } },
      Work: { events: { Commute: () => ({ type: 'Home' }) } },
      Bed: { events: { Wake: () => ({ type: 'Home' }) } },
    },
  });

  return machine;
}
