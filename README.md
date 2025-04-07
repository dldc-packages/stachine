# Stachine

> A TypeScript state machine with events and effects

```
deno add @dldc/stachine
```

## Gist

```ts
import { createStachine } from "@dldc/stachine";

type State = { state: "Home" } | { state: "Bed" } | { state: "Work" } | {
  state: "Error";
};
type Action = { action: "Commute" } | { action: "Wake" } | { action: "Sleep" };

const machine = createStachine<State, Action>({
  initialState: { state: "Home" },
  createErrorState: () => ({ state: "Error" }),
  states: {
    Home: {
      actions: {
        Commute: () => ({ state: "Work" }),
        Sleep: () => ({ state: "Bed" }),
      },
    },
    Work: {
      actions: {
        Commute: () => ({ state: "Home" }),
      },
    },
    Bed: {
      actions: {
        Wake: () => ({ state: "Home" }),
      },
    },
    Error: {},
  },
});
```
