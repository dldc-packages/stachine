import { ConfigGlobalEffect, Stachine } from '../src/mod';

type BoolState = { state: 'On' } | { state: 'Off' } | { state: 'Error' };
type BoolAction = { action: 'TurnOn' } | { action: 'TurnOff' } | { action: 'Toggle' } | { action: 'Error' };

export function createBooleanMachine({
  debug,
  strict,
  globalEffect,
}: {
  debug?: string;
  strict?: boolean;
  globalEffect?: ConfigGlobalEffect<BoolState, BoolAction>;
} = {}) {
  const machine = Stachine<BoolState, BoolAction>({
    initialState: { state: 'Off' },
    debug,
    strict,
    createErrorAction: () => ({ action: 'Error' }),
    createErrorState: () => ({ state: 'Error' }),
    effect: globalEffect,
    states: {
      On: {
        actions: {
          Toggle: () => ({ state: 'Off' }),
          TurnOff: () => ({ state: 'Off' }),
        },
      },
      Off: {
        actions: {
          Toggle: () => ({ state: 'On' }),
          TurnOn: () => ({ state: 'On' }),
        },
      },
      Error: {},
    },
  });

  return machine;
}

type HomeState = { state: 'Home' } | { state: 'Bed' } | { state: 'Work' } | { state: 'Error' };
type HomeAction = { action: 'Commute' } | { action: 'Wake' } | { action: 'Sleep' } | { action: 'Error' };

export function createHomeMachine({ debug }: { debug?: string } = {}) {
  const machine = Stachine<HomeState, HomeAction>({
    initialState: { state: 'Home' },
    debug,
    createErrorAction: () => ({ action: 'Error' }),
    createErrorState: () => ({ state: 'Error' }),
    states: {
      Home: { actions: { Commute: () => ({ state: 'Work' }), Sleep: () => ({ state: 'Bed' }) } },
      Work: { actions: { Commute: () => ({ state: 'Home' }) } },
      Bed: { actions: { Wake: () => ({ state: 'Home' }) } },
      Error: {},
    },
  });

  return machine;
}
