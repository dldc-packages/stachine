import { ConfigGlobalEffect, Stachine } from '../src/mod';

type BoolState = { type: 'On' } | { type: 'Off' } | { type: 'Error' };
type BoolAction = { type: 'TurnOn' } | { type: 'TurnOff' } | { type: 'Toggle' } | { type: 'Error' };

export function createBooleanMachine({
  debug,
  globalEffect,
}: {
  debug?: string;
  globalEffect?: ConfigGlobalEffect<BoolState, BoolAction>;
} = {}) {
  const machine = Stachine<BoolState, BoolAction>({
    initialState: { type: 'Off' },
    debug,
    createErrorAction: () => ({ type: 'Error' }),
    createErrorState: () => ({ type: 'Error' }),
    effect: globalEffect,
    states: {
      On: {
        actions: {
          Toggle: () => ({ type: 'Off' }),
          TurnOff: () => ({ type: 'Off' }),
        },
      },
      Off: {
        actions: {
          Toggle: () => ({ type: 'On' }),
          TurnOn: () => ({ type: 'On' }),
        },
      },
      Error: {},
    },
  });

  return machine;
}

type HomeState = { type: 'Home' } | { type: 'Bed' } | { type: 'Work' } | { type: 'Error' };
type HomeAction = { type: 'Commute' } | { type: 'Wake' } | { type: 'Sleep' } | { type: 'Error' };

export function createHomeMachine({ debug }: { debug?: string } = {}) {
  const machine = Stachine<HomeState, HomeAction>({
    initialState: { type: 'Home' },
    debug,
    createErrorAction: () => ({ type: 'Error' }),
    createErrorState: () => ({ type: 'Error' }),
    states: {
      Home: { actions: { Commute: () => ({ type: 'Work' }), Sleep: () => ({ type: 'Bed' }) } },
      Work: { actions: { Commute: () => ({ type: 'Home' }) } },
      Bed: { actions: { Wake: () => ({ type: 'Home' }) } },
      Error: {},
    },
  });

  return machine;
}
