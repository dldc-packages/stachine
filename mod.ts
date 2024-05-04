// deno-lint-ignore-file no-explicit-any

import { createErreurStore, type TErreurStore } from "@dldc/erreur";
import {
  createSubscription,
  type SubscribeMethod,
  type TOnUnsubscribed,
  type TSubscriptionCallback,
  type TUnsubscribe,
} from "@dldc/pubsub";

export type TStateBase = { state: string };
export type TActionBase = { action: string };

export type TCleanup = () => void;

export const FORCE_EFFECT = Symbol("FORCE_EFFECT");
export type FORCE_EFFECT = typeof FORCE_EFFECT;

export type TDispatch<Action extends TActionBase> = (action: Action) => void;

export type TEffectParams<
  CurrentState extends TStateBase,
  Action extends TActionBase,
> = {
  state: CurrentState;
  dispatch: TDispatch<Action>;
};

export type TEffect<
  CurrentState extends TStateBase,
  Action extends TActionBase,
> = (
  params: TEffectParams<CurrentState, Action>,
) => TCleanup | void;

export type TReactionParams<
  CurrentState extends TStateBase,
  Action extends TActionBase,
> = {
  state: CurrentState;
  dispatch: TDispatch<Action>;
};

export type TReaction<
  CurrentState extends TStateBase,
  Action extends TActionBase,
> = (
  params: TReactionParams<CurrentState, Action>,
) => void;

export type TStateActionConfig<
  CurrentState extends TStateBase,
  CurrentAction extends TActionBase,
  State extends TStateBase,
> = false | TTransition<CurrentState, CurrentAction, State>;

export type TStateConfigActions<
  CurrentState extends TStateBase,
  State extends TStateBase,
  Action extends TActionBase,
> = {
  [A in Action["action"]]?: TStateActionConfig<
    CurrentState,
    Extract<Action, { action: A }>,
    State
  >;
};

export type TStateConfig<
  CurrentState extends TStateBase,
  State extends TStateBase,
  Action extends TActionBase,
> = {
  actions?: TStateConfigActions<CurrentState, State, Action>;
  // run when the state is entered (run after the emit)
  // if the effect returns a cleanup function, it will be called when the state is left
  effect?: TEffect<CurrentState, Action>;
  // run before the store emits the corresponding state (before the emit)
  // If you dispatch an action in the reaction, the intermediate state will not be emitted
  reaction?: TReaction<CurrentState, Action>;
};

export type TTransition<
  CurrentState extends TStateBase,
  CurrentAction extends TActionBase,
  State extends TStateBase,
> = (params: {
  state: CurrentState;
  action: CurrentAction;
  rerunEffect: (styate: CurrentState) => CurrentState;
}) => State;

export type TGlobalEffectParams<
  States extends TStateBase,
  Action extends TActionBase,
> = {
  getState: () => States;
  dispatch: (action: Action) => void;
};

export type TConfigGlobalEffect<
  States extends TStateBase,
  Action extends TActionBase,
> = (
  params: TGlobalEffectParams<States, Action>,
) => TCleanup | void;

export interface TConsole {
  groupCollapsed: typeof console.groupCollapsed;
  groupEnd: typeof console.groupEnd;
  info: typeof console.info;
  error: typeof console.error;
  warn: typeof console.warn;
}

export type TConfig<State extends TStateBase, Action extends TActionBase> = {
  debug?: string;
  console?: TConsole;
  // when strict is true, the machine will console.error if the action is not defined in the states
  // when strict is false, unhandled actions will be ignored
  strict?: boolean;
  initialState: State;
  states: {
    [S in State["state"]]: TStateConfig<
      Extract<State, { state: S }>,
      State,
      Action
    >;
  };
  // global effect (will cleanup when the machine is destroyed)
  effect?: TConfigGlobalEffect<State, Action>;
  // When an error occurs in a transition, we replace the current state with the error state
  createErrorState: (error: unknown, currentState: State) => State;
  // max number of recursive dispatches in reaction
  maxRecursiveDispatch?: number;
};

type AllowedResult<State extends TStateBase, Action extends TActionBase> =
  | { allowed: false }
  | { allowed: true; transition: TTransition<State, Action, State> };

type StatesActionsResolved<
  State extends TStateBase,
  Action extends TActionBase,
> = {
  [S in State["state"]]: {
    [A in Action["action"]]?: false | TTransition<State, Action, State>;
  };
};

const IS_STACHINE = Symbol("IS_STACHINE");

export interface IStachine<
  State extends TStateBase,
  Action extends TActionBase,
> {
  [IS_STACHINE]: true;
  readonly dispatch: (action: Action) => void;
  readonly allowed: (action: Action) => boolean;
  readonly getState: () => State;
  readonly subscribe: SubscribeMethod<State>;
  // same as subscribe but runs the callback immediately with the current state
  readonly watch: SubscribeMethod<State>;
  readonly isState: (...types: ReadonlyArray<State["state"]>) => boolean;
  readonly destroy: () => void;
  readonly isDestroyed: () => boolean;
}

export function isStachine(maybe: unknown): maybe is IStachine<any, any> {
  if (!maybe) {
    return false;
  }
  return (maybe as any)[IS_STACHINE] === true;
}

export function createStachine<
  State extends TStateBase,
  Action extends TActionBase,
>({
  initialState,
  states,
  debug,
  strict,
  effect: globalEffect,
  createErrorState,
  maxRecursiveDispatch = 1000,
  console = globalThis.console,
}: TConfig<State, Action>): IStachine<State, Action> {
  const statesActionsResolved: StatesActionsResolved<State, Action> = {} as any;
  Object.entries(states).forEach((entry) => {
    const [state, stateConfig] = entry as [
      Action["action"],
      TStateConfig<State, State, Action>,
    ];
    statesActionsResolved[state] = {};
    Object.entries(stateConfig.actions || {}).forEach((entry) => {
      const [action, actionConfig] = entry as [
        Action["action"],
        TStateActionConfig<State, Action, State>,
      ];
      if (actionConfig === false) {
        statesActionsResolved[state][action] = false;
        return;
      }
      statesActionsResolved[state][action] = actionConfig;
    });
  });

  const sub = createSubscription<State>();
  const dispatchQueue: Array<Action> = [];
  let isDispatching = false;
  let inTransition = false;
  let state: State = initialState;
  let currentStateCleanup: TCleanup | null = null;

  const globalEffectCleanup = globalEffect?.({ dispatch, getState }) ?? null;

  // Run effect on mount
  runEffect();
  // Run reaction on mount
  runReaction();

  return {
    [IS_STACHINE]: true,
    dispatch,
    allowed,
    getState,
    subscribe: sub.subscribe,
    watch,
    isState,
    destroy,
    isDestroyed: sub.isDestroyed,
  };

  function hasForceEffect(state: State): boolean {
    const forceEffect = (state as any)[FORCE_EFFECT] === true;
    if (forceEffect) {
      delete (state as any)[FORCE_EFFECT];
    }
    return forceEffect;
  }

  function actionAllowed(action: Action): AllowedResult<State, Action> {
    const stateKey = state.state as State["state"];
    const actionKey = action.action as Action["action"];
    const actionConfig = statesActionsResolved[stateKey][actionKey] ?? false;
    if (actionConfig === false) {
      return { allowed: false };
    }
    return { allowed: true, transition: actionConfig };
  }

  function dispatch(action: Action): void {
    if (checkDestroyed("dispatch", { state, action })) {
      return;
    }
    if (inTransition) {
      return throwDispatchInTransition(action, state);
    }
    dispatchQueue.push(action);
    if (isDispatching) {
      return;
    }
    isDispatching = true;
    const prevState = state; // prevState is the state of the first dispatch
    // keep track of the force effect bu state
    const forceEffectMap: Record<string, boolean> = {};
    let dispatchQueueSafe = maxRecursiveDispatch + 1; // add one because we don't count the first one
    while (dispatchQueue.length > 0 && dispatchQueueSafe > 0) {
      dispatchQueueSafe--;
      const action = dispatchQueue.shift()!;
      // apply action
      const allowedRes = actionAllowed(action);
      if (allowedRes.allowed === false) {
        if (strict) {
          logError(
            `Action ${action.action} is not allowed in state ${state.state}`,
            { action, state },
          );
        }
        break;
      }
      const transition = allowedRes.transition;
      const nextState = safeTransition(transition, action);
      forceEffectMap[nextState.state] = forceEffectMap[nextState.state] ||
        hasForceEffect(nextState);
      if (nextState === state) {
        if (debug) {
          console.groupCollapsed(
            `[${debug}]: ${prevState.state} + ${action.action} => [SAME_STATE]`,
          );
          console.info({ state: prevState, action });
          console.groupEnd();
        }
        break;
      }
      // state changed, update state
      state = nextState;
      if (debug) {
        console.groupCollapsed(
          `[${debug}]: ${prevState.state} + ${action.action} => ${nextState.state}`,
        );
        console.info({ prevState, action, state });
        console.groupEnd();
      }
      // run reaction for the new state
      runReaction();
    }
    if (dispatchQueueSafe <= 0) {
      return throwMaxRecursiveDispatchReached(maxRecursiveDispatch);
    }
    if (dispatchQueue.length > 0) {
      // if there is still actions in the queue, this is not expected
      return throwUnexpectedDispatchQueue(dispatchQueue);
    }
    isDispatching = false;
    if (state === prevState) {
      // no state change, stop here
      return;
    }
    // state changed
    if (debug) {
      console.info(`[${debug}]: Emitting state ${state.state}`);
    }
    sub.emit(state);
    // run effect if state type changed or if force effect
    const stateTypeChanged = prevState.state !== state.state;
    const shouldRunEffect = stateTypeChanged ||
      forceEffectMap[prevState.state] === true;
    if (shouldRunEffect) {
      if (debug) {
        console.info(
          `[${debug}]: Running effect for state ${state.state} (${
            stateTypeChanged ? "state type changed" : "force effect"
          })`,
        );
      }
      runEffect();
    }
  }

  function runEffect() {
    const stateKey = state.state as keyof typeof states;
    const effect = states[stateKey].effect;
    runCleanup();
    if (effect) {
      currentStateCleanup = effect({ state: state as any, dispatch }) ?? null;
    }
  }

  function runReaction() {
    const stateKey = state.state as keyof typeof states;
    const reaction = states[stateKey].reaction;
    if (reaction) {
      if (debug) {
        console.info(`[${debug}]: Rining reaction of ${stateKey}`);
      }
      reaction({ state: state as any, dispatch });
    }
  }

  function safeTransition(
    transition: TTransition<State, Action, State>,
    action: Action,
  ): State {
    const prevState = state;
    inTransition = true;
    try {
      const nextState = transition({ state, action, rerunEffect });
      inTransition = false;
      return nextState;
    } catch (error) {
      if (debug) {
        console.info(
          `[${debug}]: ${prevState.state} + ${action.action} => XX ERROR XX`,
        );
      }
      inTransition = false;
      return createErrorState(error, prevState);
    }
  }

  function runCleanup() {
    if (currentStateCleanup !== null) {
      currentStateCleanup();
    }
    currentStateCleanup = null;
  }

  function watch(
    callback: TSubscriptionCallback<State>,
    onUnsubscribe?: TOnUnsubscribed,
  ): TUnsubscribe {
    if (checkDestroyed("watch", { state })) {
      return () => {};
    }
    callback(state);
    return sub.subscribe(callback, onUnsubscribe);
  }

  function allowed(action: Action) {
    return actionAllowed(action).allowed;
  }

  function getState() {
    return state;
  }

  function isState(...states: ReadonlyArray<State["state"]>): boolean {
    return states.includes(state.state);
  }

  function checkDestroyed(action: string, infos?: any): boolean {
    if (sub.isDestroyed()) {
      logWarn(
        `Calling .${action} on an already destroyed machine is a no-op`,
        infos,
      );
      return true;
    }
    return false;
  }

  function destroy() {
    if (checkDestroyed("destroy", { state })) {
      return;
    }

    sub.destroy();
    runCleanup();
    if (globalEffectCleanup) {
      globalEffectCleanup();
    }
  }

  function rerunEffect(nextState: State): State {
    if (state === nextState) {
      logWarn(
        `Calling rerunEffect on the same state is a no-op, use rerunEffect({ ...state }) instead`,
      );
      return state;
    }
    (nextState as any)[FORCE_EFFECT] = true;
    return nextState;
  }

  function logWarn(message: string, infos?: any) {
    const prefix = debug ? `[${debug}] ` : "[Stachine] ";
    console.warn(prefix + message);
    if (infos) {
      console.warn(infos);
    }
  }

  function logError(message: string, infos?: any) {
    const prefix = debug ? `[${debug}] ` : "[Stachine] ";
    console.error(prefix + message);
    if (infos) {
      console.error(infos);
    }
  }
}

export type TStachineErreurData =
  | { kind: "MaxRecursiveDispatchReached"; limit: number }
  | { kind: "UnexpectedDispatchQueue"; queue: TActionBase[] }
  | { kind: "DispatchInTransition"; action: TActionBase; state: TStateBase };

const StachineErreurInternal: TErreurStore<TStachineErreurData> =
  createErreurStore<TStachineErreurData>();

export const StachineErreur = StachineErreurInternal.asReadonly;

function throwMaxRecursiveDispatchReached(limit: number): never {
  return StachineErreurInternal.setAndThrow(
    `The maxRecursiveDispatch limit (${limit}) has been reached, did you emit() in a callback ? If this is expected you can use the maxRecursiveDispatch option to raise the limit`,
    {
      kind: "MaxRecursiveDispatchReached",
      limit,
    },
  );
}

function throwUnexpectedDispatchQueue(queue: TActionBase[]): never {
  return StachineErreurInternal.setAndThrow(
    `The dispatch queue is not empty after exiting dispatch loop, this is unexpected`,
    {
      kind: "UnexpectedDispatchQueue",
      queue,
    },
  );
}

function throwDispatchInTransition(
  action: TActionBase,
  state: TStateBase,
): never {
  return StachineErreurInternal.setAndThrow(
    `Cannot dispatch in a transition (in transition ${state.state} -> ${action.action})`,
    {
      kind: "DispatchInTransition",
      action,
      state,
    },
  );
}
