# Stachine

> A TypeScript state machine with events and effects

```
npm install @dldc/stachine
```

## Gist

```ts
import { Stachine } from '@dldc/stachine';

type State = { state: 'Home' } | { state: 'Bed' } | { state: 'Work' } | { state: 'Error' };
type Action = { action: 'Commute' } | { action: 'Wake' } | { action: 'Sleep' };

const machine = Stachine<State, Action>({
  initialState: { state: 'Home' },
  createErrorState: () => ({ state: 'Error' }),
  states: {
    Home: {
      actions: {
        Commute: () => ({ state: 'Work' }),
        Sleep: () => ({ state: 'Bed' }),
      },
    },
    Work: {
      actions: {
        Commute: () => ({ state: 'Home' }),
      },
    },
    Bed: {
      actions: {
        Wake: () => ({ state: 'Home' }),
      },
    },
    Error: {},
  },
});
```
