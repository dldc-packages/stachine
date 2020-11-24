import { StateMachine, typedTransition } from '../src';

export function createBooleanMachine({
  debug,
  globalEffect,
}: {
  debug: boolean;
  globalEffect?: any;
}) {
  type States = { type: 'On' } | { type: 'Off' };
  type Events = { type: 'TurnOn' } | { type: 'TurnOff' } | { type: 'Toggle' };

  const transition = typedTransition<States, Events>();

  const machine = new StateMachine<States, Events>({
    initialState: { type: 'Off' },
    debug,
    globalEffect,
    transitions: transition.switchByEvents({
      Toggle: { Off: () => ({ type: 'On' }), On: () => ({ type: 'Off' }) },
      TurnOn: { Off: () => ({ type: 'On' }) },
      TurnOff: { On: () => ({ type: 'Off' }) },
    }),
  });

  return machine;
}

export function createHomeMachine({ debug }: { debug: boolean }) {
  type States = { type: 'Home' } | { type: 'Bed' } | { type: 'Work' };
  type Events = { type: 'Commute' } | { type: 'Wake' } | { type: 'Sleep' };

  const transition = typedTransition<States, Events>();

  const machine = new StateMachine<States, Events>({
    initialState: { type: 'Home' },
    debug,
    transitions: transition.switchByStates({
      Home: { Commute: () => ({ type: 'Work' }), Sleep: () => ({ type: 'Bed' }) },
      Work: { Commute: () => ({ type: 'Home' }) },
      Bed: { Wake: () => ({ type: 'Home' }) },
    }),
  });

  return machine;
}
