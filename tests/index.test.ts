// deno-lint-ignore-file no-explicit-any

import { expect, fn } from "$std/expect/mod.ts";
import { createStachine, isStachine, type TConsole } from "../mod.ts";
import { createBooleanMachine, createHomeMachine } from "./utils.ts";

const fnBase = () => fn() as (...args: any[]) => any;

function createMockConsole(): TConsole {
  return {
    error: fnBase(),
    warn: fnBase(),
    info: fnBase(),
    groupCollapsed: fnBase(),
    groupEnd: fnBase(),
  };
}

Deno.test("create a state machine without error", () => {
  type State = { state: "Init" } | { state: "Error"; error: unknown };
  type Action = { action: "Hey" };

  expect(() =>
    createStachine<State, Action>({
      createErrorState: (err) => ({ state: "Error", error: err }),
      initialState: { state: "Init" },
      states: {
        Error: {},
        Init: {},
      },
    })
  ).not.toThrow();
});

Deno.test("simple machine", () => {
  const consoleMock = createMockConsole();
  const machine = createHomeMachine(consoleMock);

  expect(machine.getState()).toEqual({ state: "Home" });
  machine.dispatch({ action: "Commute" });
  expect(machine.getState()).toEqual({ state: "Work" });
  machine.dispatch({ action: "Commute" });
  expect(machine.getState()).toEqual({ state: "Home" });
  machine.dispatch({ action: "Sleep" });
  expect(machine.getState()).toEqual({ state: "Bed" });
});

Deno.test("calling isStachine", () => {
  const consoleMock = createMockConsole();
  const machine = createHomeMachine(consoleMock);

  expect(isStachine(machine)).toBe(true);
  expect(isStachine({})).toBe(false);
  expect(isStachine(undefined)).toBe(false);
});

Deno.test("simple machine with listener", () => {
  type State = { state: "Home" } | { state: "Bed" } | { state: "Work" } | {
    state: "Error";
  };
  type Action = { action: "Commute" } | { action: "Wake" } | {
    action: "Sleep";
  };

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
      Work: { actions: { Commute: () => ({ state: "Home" }) } },
      Bed: { actions: { Wake: () => ({ state: "Home" }) } },
      Error: {},
    },
  });

  expect(machine.getState()).toEqual({ state: "Home" });
  const callback = fnBase();
  machine.subscribe(callback);
  machine.dispatch({ action: "Commute" });
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith({ state: "Work" });
  machine.dispatch({ action: "Sleep" });
  expect(callback).toHaveBeenCalledTimes(1);
});

Deno.test("simple machine with initialState function", () => {
  type State = { state: "Home" } | { state: "Bed" } | { state: "Work" } | {
    state: "Error";
  };
  type Action = { action: "Commute" } | { action: "Wake" } | {
    action: "Sleep";
  };

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
      Work: { actions: { Commute: () => ({ state: "Home" }) } },
      Bed: { actions: { Wake: () => ({ state: "Home" }) } },
      Error: {},
    },
  });

  expect(machine.getState()).toEqual({ state: "Home" });
  const callback = fnBase();
  machine.subscribe(callback);
  machine.dispatch({ action: "Commute" });
  expect(machine.getState()).toEqual({ state: "Work" });
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith({ state: "Work" });
  machine.dispatch({ action: "Sleep" });
  expect(callback).toHaveBeenCalledTimes(1);
});

Deno.test("simple machine with object handler", () => {
  const consoleMock = createMockConsole();
  const machine = createHomeMachine(consoleMock);

  expect(machine.getState()).toEqual({ state: "Home" });
  machine.dispatch({ action: "Wake" });
  expect(machine.getState()).toEqual({ state: "Home" });
  machine.dispatch({ action: "Commute" });
  expect(machine.getState()).toEqual({ state: "Work" });
  machine.dispatch({ action: "Commute" });
  expect(machine.getState()).toEqual({ state: "Home" });
  machine.dispatch({ action: "Sleep" });
  expect(machine.getState()).toEqual({ state: "Bed" });
  machine.dispatch({ action: "Sleep" });
  expect(machine.getState()).toEqual({ state: "Bed" });
});

Deno.test("simple machine with object handler", () => {
  const consoleMock = createMockConsole();
  const machine = createHomeMachine(consoleMock);

  expect(machine.getState()).toEqual({ state: "Home" });
  machine.dispatch({ action: "Wake" });
  expect(machine.getState()).toEqual({ state: "Home" });
  machine.dispatch({ action: "Commute" });
  expect(machine.getState()).toEqual({ state: "Work" });
  machine.dispatch({ action: "Commute" });
  expect(machine.getState()).toEqual({ state: "Home" });
  machine.dispatch({ action: "Sleep" });
  expect(machine.getState()).toEqual({ state: "Bed" });
  machine.dispatch({ action: "Sleep" });
  expect(machine.getState()).toEqual({ state: "Bed" });
});

Deno.test("dispatch on destroyed machine should warn", () => {
  const consoleMock = createMockConsole();
  const machine = createHomeMachine(consoleMock);

  expect(machine.getState()).toEqual({ state: "Home" });
  machine.dispatch({ action: "Commute" });
  expect(machine.getState()).toEqual({ state: "Work" });
  machine.destroy();
  machine.dispatch({ action: "Commute" });
  expect(consoleMock.warn).toHaveBeenCalledTimes(2);
  expect(consoleMock.warn).toHaveBeenCalledWith(
    "[Stachine] Calling .dispatch on an already destroyed machine is a no-op",
  );
});

Deno.test("global effect is executed", () => {
  const cleanup = fnBase();
  const effect = fn(() => cleanup) as () => void;

  const consoleMock = createMockConsole();
  const machine = createBooleanMachine(consoleMock, { globalEffect: effect });

  expect(effect).toHaveBeenCalled();
  expect(cleanup).not.toHaveBeenCalled();
  expect(machine.getState()).toEqual({ state: "Off" });
  machine.dispatch({ action: "Toggle" });
  expect(machine.getState()).toEqual({ state: "On" });
  machine.destroy();
  expect(cleanup).toHaveBeenCalled();
});

Deno.test("global effect no cleanup", () => {
  const effect = fnBase();

  const consoleMock = createMockConsole();
  const machine = createBooleanMachine(consoleMock, { globalEffect: effect });

  expect(effect).toHaveBeenCalled();
  expect(machine.getState()).toEqual({ state: "Off" });
  machine.dispatch({ action: "Toggle" });
  expect(machine.getState()).toEqual({ state: "On" });
  machine.destroy();
});

Deno.test("unhandled transitions should be ignore if not strict", () => {
  const consoleMock = createMockConsole();
  const machine = createBooleanMachine(consoleMock);

  expect(machine.getState()).toEqual({ state: "Off" });
  machine.dispatch({ action: "TurnOff" });
  expect(consoleMock.error).not.toHaveBeenCalled();
  expect(consoleMock.warn).not.toHaveBeenCalled();
});

Deno.test("unhandled transitions should console.error when strict", () => {
  const consoleMock = createMockConsole();
  const machine = createBooleanMachine(consoleMock, { strict: true });

  expect(machine.getState()).toEqual({ state: "Off" });
  machine.dispatch({ action: "TurnOff" });
  expect(consoleMock.error).toHaveBeenCalledWith(
    `[Stachine] Action TurnOff is not allowed in state Off`,
  );
  expect(consoleMock.warn).not.toHaveBeenCalled();
});

Deno.test("returning previous state should not call state listener", () => {
  type State = { state: "On" } | { state: "Off" } | { state: "Error" };
  type Action = { action: "TurnOn" } | { action: "TurnOff" } | {
    action: "Toggle";
  } | { action: "Noop" };

  const machine = createStachine<State, Action>({
    initialState: { state: "Off" },
    createErrorState: () => ({ state: "Error" }),
    states: {
      On: {
        actions: {
          Noop: ({ state }) => state,
          Toggle: () => ({ state: "Off" }),
          TurnOff: () => ({ state: "Off" }),
        },
      },
      Off: {
        actions: {
          Noop: ({ state }) => state,
          Toggle: () => ({ state: "On" }),
          TurnOn: () => ({ state: "On" }),
        },
      },
      Error: {},
    },
  });

  const onStateChange = fnBase();

  machine.subscribe(onStateChange);
  expect(machine.getState()).toEqual({ state: "Off" });
  machine.dispatch({ action: "Toggle" });
  expect(onStateChange).toHaveBeenCalledWith({ state: "On" });
  expect(onStateChange).toHaveBeenCalledTimes(1);
  machine.dispatch({ action: "Noop" });
  expect(onStateChange).toHaveBeenCalledTimes(1);
});

Deno.test("destroy twice does nothing", () => {
  const consoleMock = createMockConsole();
  const machine = createBooleanMachine(consoleMock);

  expect(machine.getState()).toEqual({ state: "Off" });
  machine.dispatch({ action: "Toggle" });
  expect(machine.getState()).toEqual({ state: "On" });
  machine.destroy();
  expect(() => machine.destroy()).not.toThrow();
});

Deno.test("destroy twice warn", () => {
  const consoleMock = createMockConsole();
  const machine = createBooleanMachine(consoleMock);

  expect(machine.getState()).toEqual({ state: "Off" });
  machine.dispatch({ action: "Toggle" });
  expect(machine.getState()).toEqual({ state: "On" });
  machine.destroy();
  expect(consoleMock.warn).not.toHaveBeenCalled();
  machine.destroy();
  expect(consoleMock.warn).toHaveBeenCalledWith(
    "[Stachine] Calling .destroy on an already destroyed machine is a no-op",
  );
});

Deno.test("run effect on initial state", () => {
  type State = { state: "Home" } | { state: "Error" };
  type Action = never;

  const effect = fnBase();

  const machine = createStachine<State, Action>({
    initialState: { state: "Home" },
    createErrorState: () => ({ state: "Error" }),
    states: { Home: { effect }, Error: {} },
  });

  expect(machine.getState()).toEqual({ state: "Home" });
  expect(effect).toHaveBeenCalled();
  machine.destroy();
});

Deno.test("run effect with cleanup on initial state", () => {
  type State = { state: "Home" } | { state: "Error" };
  type Action = never;

  const effectCleanup = fnBase();
  const effect = fn(() => effectCleanup) as () => () => void;

  const machine = createStachine<State, Action>({
    initialState: { state: "Home" },
    states: { Home: { effect }, Error: {} },
    createErrorState: () => ({ state: "Error" }),
  });

  expect(machine.getState()).toEqual({ state: "Home" });
  expect(effect).toHaveBeenCalled();
  expect(effectCleanup).not.toHaveBeenCalled();
  machine.destroy();
  expect(effectCleanup).toHaveBeenCalled();
});

Deno.test("run effect on state", () => {
  type State = { state: "Home" } | { state: "Work" } | { state: "Error" };
  type Action = { action: "Commute" };

  const effect = fnBase();

  const machine = createStachine<State, Action>({
    initialState: { state: "Home" },
    createErrorState: () => ({ state: "Error" }),
    states: {
      Home: { actions: { Commute: () => ({ state: "Work" }) } },
      Work: { effect },
      Error: {},
    },
  });

  expect(machine.getState()).toEqual({ state: "Home" });
  expect(effect).not.toHaveBeenCalled();
  machine.dispatch({ action: "Commute" });
  expect(machine.getState()).toEqual({ state: "Work" });
  expect(effect).toHaveBeenCalled();
});

Deno.test("cleanup effect on state", () => {
  type State = { state: "Home" } | { state: "Work" } | { state: "Error" };
  type Action = { action: "Commute" };

  const effectCleanup = fnBase();
  const effect = fn(() => effectCleanup) as () => () => void;

  const machine = createStachine<State, Action>({
    initialState: { state: "Home" },
    createErrorState: () => ({ state: "Error" }),
    states: {
      Home: { actions: { Commute: () => ({ state: "Work" }) } },
      Work: { effect, actions: { Commute: () => ({ state: "Home" }) } },
      Error: {},
    },
  });

  expect(machine.getState()).toEqual({ state: "Home" });
  expect(effect).not.toHaveBeenCalled();
  expect(effectCleanup).not.toHaveBeenCalled();
  machine.dispatch({ action: "Commute" });
  expect(machine.getState()).toEqual({ state: "Work" });
  expect(effect).toHaveBeenCalled();
  expect(effectCleanup).not.toHaveBeenCalled();
  machine.dispatch({ action: "Commute" });
  expect(effectCleanup).toHaveBeenCalled();
});

Deno.test("run cleanup and effect when transition to same state with rerunEffect", () => {
  type State = { state: "Main" } | { state: "Error" };
  type Action = { action: "Rerun" } | { action: "SameRef" } | {
    action: "Same";
  };

  const effectCleanup = fnBase();
  const effect = fn(() => effectCleanup) as () => () => void;

  const machine = createStachine<State, Action>({
    initialState: { state: "Main" },
    createErrorState: () => ({ state: "Error" }),
    states: {
      Main: {
        effect,
        actions: {
          Rerun: ({ rerunEffect, state }) => rerunEffect({ ...state }),
          SameRef: ({ state }) => state,
          Same: () => ({ state: "Main" }),
        },
      },
      Error: {},
    },
  });

  const state1 = machine.getState();
  expect(machine.getState()).toEqual({ state: "Main" });
  expect(effect).toHaveBeenCalledTimes(1);
  expect(effectCleanup).not.toHaveBeenCalled();

  machine.dispatch({ action: "SameRef" });
  const state2 = machine.getState();
  expect(state2).toEqual(state1);
  expect(state2).toBe(state1);
  expect(effect).toHaveBeenCalledTimes(1);
  expect(effectCleanup).not.toHaveBeenCalled();

  machine.dispatch({ action: "Same" });
  const state3 = machine.getState();
  expect(state3).toEqual(state2);
  expect(state3).not.toBe(state2);
  expect(effect).toHaveBeenCalledTimes(1);
  expect(effectCleanup).not.toHaveBeenCalled();

  machine.dispatch({ action: "Rerun" });
  const state4 = machine.getState();
  expect(state4).toEqual(state3);
  expect(state4).not.toBe(state3);
  expect(effect).toHaveBeenCalledTimes(2);
  expect(effectCleanup).toHaveBeenCalledTimes(1);
});

Deno.test("setting false as a transition should be the same as not setting it", () => {
  type State = { state: "Home" } | { state: "Work" } | { state: "Error" };
  type Action = { action: "Commute" } | { action: "Invalid" };

  const consoleMock = createMockConsole();
  const machine = createStachine<State, Action>({
    initialState: { state: "Home" },
    createErrorState: () => ({ state: "Error" }),
    strict: true,
    console: consoleMock,
    states: {
      Home: {
        actions: {
          Commute: () => ({ state: "Work" }),
          Invalid: false,
        },
      },
      Work: {
        actions: {
          Commute: () => ({ state: "Home" }),
        },
      },
      Error: {},
    },
  });

  expect(machine.getState()).toEqual({ state: "Home" });
  machine.dispatch({ action: "Invalid" });
  expect(machine.getState()).toEqual({ state: "Home" });
  expect(consoleMock.error).toHaveBeenCalledWith(
    `[Stachine] Action Invalid is not allowed in state Home`,
  );
  expect(consoleMock.error).toHaveBeenCalledWith({
    action: { action: "Invalid" },
    state: { state: "Home" },
  });
  expect(consoleMock.error).toHaveBeenCalledTimes(2);
  machine.dispatch({ action: "Commute" });
  expect(machine.getState()).toEqual({ state: "Work" });
  machine.dispatch({ action: "Invalid" });
  expect(machine.getState()).toEqual({ state: "Work" });
  expect(consoleMock.error).toHaveBeenCalledWith(
    `[Stachine] Action Invalid is not allowed in state Work`,
  );
  expect(consoleMock.error).toHaveBeenCalledTimes(4);
});

Deno.test("setting debug should add a prefix to error messages", () => {
  type State = { state: "Home" } | { state: "Error" };
  type Action = { action: "Invalid" };

  const consoleMock = createMockConsole();
  const machine = createStachine<State, Action>({
    initialState: { state: "Home" },
    createErrorState: () => ({ state: "Error" }),
    strict: true,
    debug: "Debug",
    console: consoleMock,
    states: { Home: { actions: { Invalid: false } }, Error: {} },
  });

  expect(machine.getState()).toEqual({ state: "Home" });
  machine.dispatch({ action: "Invalid" });
  expect(machine.getState()).toEqual({ state: "Home" });
  expect(consoleMock.error).toHaveBeenCalledWith(
    `[Debug] Action Invalid is not allowed in state Home`,
  );
});

Deno.test("setting debug should add a prefix to warn messages", () => {
  type State = { state: "Home" } | { state: "Error" };
  type Action = { action: "Error" };

  const consoleMock = createMockConsole();
  const machine = createStachine<State, Action>({
    initialState: { state: "Home" },
    createErrorState: () => ({ state: "Error" }),
    strict: false,
    debug: "Debug",
    console: consoleMock,
    states: { Home: {}, Error: {} },
  });

  expect(machine.getState()).toEqual({ state: "Home" });
  machine.destroy();
  machine.destroy();
  expect(consoleMock.warn).toHaveBeenCalledWith(
    `[Debug] Calling .destroy on an already destroyed machine is a no-op`,
  );
});

Deno.test("calling Machine.allowed should check if an action is allowed in the current state", () => {
  const consoleMock = createMockConsole();
  const machine = createHomeMachine(consoleMock);

  expect(machine.getState()).toEqual({ state: "Home" });
  expect(machine.allowed({ action: "Commute" })).toBe(true);
  expect(machine.allowed({ action: "Sleep" })).toBe(true);
  expect(machine.allowed({ action: "Wake" })).toBe(false);

  machine.dispatch({ action: "Commute" });
  expect(machine.getState()).toEqual({ state: "Work" });
  expect(machine.allowed({ action: "Commute" })).toBe(true);
  expect(machine.allowed({ action: "Sleep" })).toBe(false);
  expect(machine.allowed({ action: "Wake" })).toBe(false);
});

Deno.test("reaction should run on state", () => {
  type State = { state: "Main" } | { state: "Error" };
  type Action = { action: "SameState" } | { action: "SameRef" };

  const reaction = fnBase();

  const machine = createStachine<State, Action>({
    initialState: { state: "Main" },
    states: {
      Main: {
        reaction,
        actions: {
          SameRef: ({ state }) => state,
          SameState: () => ({ state: "Main" }),
        },
      },
      Error: {},
    },
    createErrorState: () => ({ state: "Error" }),
  });

  expect(reaction).toHaveBeenCalledTimes(1);
  machine.dispatch({ action: "SameRef" });
  expect(reaction).toHaveBeenCalledTimes(1);
  machine.dispatch({ action: "SameState" });
  expect(reaction).toHaveBeenCalledTimes(2);
});

Deno.test("dispatch in reaction should not emit the intermediate state", () => {
  type State = { state: "Init" } | { state: "Step1" } | { state: "Step2" } | {
    state: "Error";
  };
  type Action = { action: "Next" };

  const step1Effect = fnBase();
  const step2Effect = fnBase();

  const machine = createStachine<State, Action>({
    createErrorState: () => ({ state: "Error" }),
    initialState: { state: "Init" },
    states: {
      Error: {},
      Init: {
        actions: {
          Next: () => ({ state: "Step1" }),
        },
      },
      Step1: {
        reaction: ({ dispatch }) => {
          dispatch({ action: "Next" });
        },
        effect: step1Effect,
        actions: {
          Next: () => ({ state: "Step2" }),
        },
      },
      Step2: {
        effect: step2Effect,
      },
    },
  });

  const onEmit = fnBase();
  machine.subscribe(onEmit);

  machine.dispatch({ action: "Next" });
  expect(onEmit).toHaveBeenCalledTimes(1);
  expect(onEmit).toHaveBeenCalledWith({ state: "Step2" });
  expect(onEmit).not.toHaveBeenCalledWith({ state: "Step1" });
  expect(step1Effect).not.toHaveBeenCalled();
  expect(step2Effect).toHaveBeenCalled();
});

Deno.test("dispatch in transition should throw", () => {
  type State = { state: "Main" } | { state: "Error" };
  type Action = { action: "Next" };

  const machine = createStachine<State, Action>({
    initialState: { state: "Main" },
    states: {
      Main: {
        actions: {
          Next: ({ state }) => {
            machine.dispatch({ action: "Next" });
            return state;
          },
        },
      },
      Error: {},
    },
    createErrorState: (error) => {
      throw error;
    },
  });

  expect(() => machine.dispatch({ action: "Next" })).toThrow(
    "Cannot dispatch in a transition (in transition Main -> Next)",
  );
});
