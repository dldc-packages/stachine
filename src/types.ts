import type { SubscribeMethod } from "@dldc/pubsub";
import type { IS_STACHINE } from "./internals.ts";

export type TStateBase = { state: string };
export type TActionBase = { action: string };

export type TCleanup = () => void;

export type TDispatch<Action extends TActionBase> = (action: Action) => void;

export type TEffectParams<
  CurrentState extends TStateBase,
  Action extends TActionBase,
> = {
  signal: AbortSignal;
  state: CurrentState;
  dispatch: TDispatch<Action>;
};

export type TEffect<
  CurrentState extends TStateBase,
  Action extends TActionBase,
> = (params: TEffectParams<CurrentState, Action>) => TCleanup | void;

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
> = (params: TReactionParams<CurrentState, Action>) => void;

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
  /**
   * Effect run when the state is entered (run after the emit)
   * if the effect returns a cleanup function, it will be called when the state is left
   */
  effect?: TEffect<CurrentState, Action>;
  /**
   * Reaction run before the store emits the corresponding state (before the emit)
   * If you dispatch an action in the reaction, the intermediate state will not be emitted
   */
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
> = (params: TGlobalEffectParams<States, Action>) => TCleanup | void;

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
  /**
   * When strict is true, the machine will console.error if the action is not defined in the states
   * When strict is false, unhandled actions will be ignored
   */
  strict?: boolean;
  initialState: State;
  states: {
    [S in State["state"]]: TStateConfig<
      Extract<State, { state: S }>,
      State,
      Action
    >;
  };
  /**
   * Global effect (will cleanup when the machine is destroyed)
   */
  effect?: TConfigGlobalEffect<State, Action>;
  /**
   * When an error occurs in a transition, we replace the current state with the error state
   */
  createErrorState: (error: unknown, currentState: State) => State;
  /**
   * Max number of recursive dispatches in reaction
   */
  maxRecursiveDispatch?: number;
};

export type TAllowedResult<
  State extends TStateBase,
  Action extends TActionBase,
> =
  | { allowed: false }
  | { allowed: true; transition: TTransition<State, Action, State> };

export type TStatesActionsResolved<
  State extends TStateBase,
  Action extends TActionBase,
> = {
  [S in State["state"]]: {
    [A in Action["action"]]?: false | TTransition<State, Action, State>;
  };
};

export interface TStachine<
  State extends TStateBase,
  Action extends TActionBase,
> {
  [IS_STACHINE]: true;
  readonly dispatch: (action: Action) => void;
  readonly allowed: (action: Action) => boolean;
  readonly getState: () => State;
  readonly subscribe: SubscribeMethod<State>;
  /**
   * Same as subscribe but runs the callback immediately with the current state
   */
  readonly watch: SubscribeMethod<State>;
  readonly isState: (...types: ReadonlyArray<State["state"]>) => boolean;
  readonly destroy: () => void;
  readonly isDestroyed: () => boolean;
}
