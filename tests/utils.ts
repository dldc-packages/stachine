import {
  createStachine,
  type TConfigGlobalEffect,
  type TConsole,
} from "../mod.ts";

type BoolState = { state: "On" } | { state: "Off" } | { state: "Error" };
type BoolAction = { action: "TurnOn" } | { action: "TurnOff" } | {
  action: "Toggle";
};

export function createBooleanMachine(
  console: TConsole,
  {
    debug,
    strict,
    globalEffect,
  }: {
    debug?: string;
    strict?: boolean;
    globalEffect?: TConfigGlobalEffect<BoolState, BoolAction>;
  } = {},
) {
  const machine = createStachine<BoolState, BoolAction>({
    initialState: { state: "Off" },
    debug,
    console,
    strict,
    createErrorState: () => ({ state: "Error" }),
    effect: globalEffect,
    states: {
      On: {
        actions: {
          Toggle: () => ({ state: "Off" }),
          TurnOff: () => ({ state: "Off" }),
        },
      },
      Off: {
        actions: {
          Toggle: () => ({ state: "On" }),
          TurnOn: () => ({ state: "On" }),
        },
      },
      Error: {},
    },
  });

  return machine;
}

type HomeState = { state: "Home" } | { state: "Bed" } | { state: "Work" } | {
  state: "Error";
};
type HomeAction = { action: "Commute" } | { action: "Wake" } | {
  action: "Sleep";
};

export function createHomeMachine(
  console: TConsole,
  { debug }: { debug?: string } = {},
) {
  const machine = createStachine<HomeState, HomeAction>({
    initialState: { state: "Home" },
    debug,
    console,
    createErrorState: () => ({ state: "Error" }),
    states: {
      Home: {
        actions: {
          Commute: () => ({ state: "Work" }),
          Sleep: () => ({ state: "Bed" }),
        },
      },
      Work: { actions: { Commute: () => ({ state: "Home" }) } },
      Bed: { actions: { Wake: () => ({ state: "Home" }) } },
      Error: {},
    },
  });

  return machine;
}
