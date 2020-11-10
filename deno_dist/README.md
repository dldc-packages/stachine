# Stachine

> A TypeScript state machine with events and effects

## Gist

```ts
import { StateMachine } from 'stachine';

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
        Bed: (effect) => {
          effect(() => {
            console.log(`Good night`);
          });
          return { type: 'Home' };
        },
      },
    },
  }
);
```
