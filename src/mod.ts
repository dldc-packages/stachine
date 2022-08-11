import { SubscribeMethod, Subscription } from 'suub';

type Base = { type: string };

export type Cleanup = () => void;

export type Effect<CurrentState extends Base, Action extends Base> = (params: {
  state: CurrentState;
  dispatch: (action: Action) => void;
}) => Cleanup | void;

export type StateActionConfig<CurrentState extends Base, CurrentAction extends Base, State extends Base> =
  | false
  | Transition<CurrentState, CurrentAction, State>;

export type StateConfig<CurrentState extends Base, State extends Base, Action extends Base> = {
  effect?: Effect<CurrentState, Action>;
  actions?: {
    [A in Action['type']]?: StateActionConfig<CurrentState, Extract<Action, { type: A }>, State>;
  };
};

export type Transition<CurrentState extends Base, CurrentAction extends Base, State extends Base> = (params: {
  state: CurrentState;
  action: CurrentAction;
}) => State;

export type ConfigGlobalEffect<States extends Base, Action extends Base> = (params: {
  getState: () => States;
  dispatch: (action: Action) => void;
}) => Cleanup | void;

export type Config<State extends Base, Action extends Base> = {
  debug?: string;
  // when strict is true, the machine will throw an error if the action is not defined in the states
  strict?: boolean;
  initialState: State;
  states: {
    [S in State['type']]: StateConfig<Extract<State, { type: S }>, State, Action>;
  };
  effect?: ConfigGlobalEffect<State, Action>;
  // When an error occuse, we first try to emit an error action
  createErrorAction: (error: unknown) => Action;
  // If the dispatch of the error action fails, we replace the state with an error state
  createErrorState: (error: unknown) => State;
};

type AllowedResult<State extends Base, Action extends Base> =
  | { allowed: false }
  | { allowed: true; transition: Transition<State, Action, State> };

type StatesActionsResolved<State extends Base, Action extends Base> = {
  [S in State['type']]: {
    [A in Action['type']]?: false | Transition<State, Action, State>;
  };
};

export class Stachine<State extends Base, Action extends Base> {
  public readonly dispatch: (action: Action) => void;
  public readonly allowed: (action: Action) => boolean;
  public readonly getState: () => State;
  public readonly subscribe: SubscribeMethod<State>;
  public readonly isState: (...types: ReadonlyArray<State['type']>) => boolean;
  public readonly destroy: () => void;

  constructor({ initialState, states, debug, strict, effect: globalEffect, createErrorAction, createErrorState }: Config<State, Action>) {
    const statesActionsResolved: StatesActionsResolved<State, Action> = {} as any;
    Object.entries(states).forEach((entry) => {
      const [state, stateConfig] = entry as [Action['type'], StateConfig<State, State, Action>];
      statesActionsResolved[state] = {};
      Object.entries(stateConfig.actions || {}).forEach((entry) => {
        const [action, actionConfig] = entry as [Action['type'], StateActionConfig<State, Action, State>];
        if (actionConfig === false) {
          statesActionsResolved[state][action] = false;
          return;
        }
        statesActionsResolved[state][action] = actionConfig;
      });
    });

    /**
     * Return true if the state has changed
     */
    const setState = (newtState: State): boolean => {
      const prevState = state;
      if (newtState === prevState) {
        return false;
      }
      state = newtState;
      sub.emit(state);
      // Run effect when state type changes
      if (prevState.type !== state.type) {
        runEffect();
      }
      return true;
    };

    const actionAllowed = (action: Action): AllowedResult<State, Action> => {
      const stateKey = state.type as State['type'];
      const actionKey = action.type as Action['type'];
      const actionConfig = statesActionsResolved[stateKey][actionKey] ?? false;
      if (actionConfig === false) {
        return { allowed: false };
      }
      return { allowed: true, transition: actionConfig };
    };

    const internalDispatch = (action: Action, fromError: boolean): void => {
      const allowedRes = actionAllowed(action);
      if (allowedRes.allowed === false) {
        if (strict) {
          throw new Error(`Action ${action.type} is not allowed in state ${state.type}`);
        }
        console.warn(`[Stachine] Unexpected action type ${action.type} in state ${state.type}`);
        return;
      }
      const transition = allowedRes.transition;
      const prevState = state;

      try {
        const nextState = transition({ state, action });
        const stateChanged = setState(nextState);
        if (debug && stateChanged) {
          console.groupCollapsed(`[${debug}]: ${prevState.type} + ${action.type} => ${nextState.type}`);
          console.log('Prev State', prevState);
          console.log('Action', action);
          console.log('Next State', nextState);
          console.groupEnd();
        }
      } catch (error) {
        if (fromError) {
          // if fromError is true, we let the parent call handle the error
          throw error;
        }
        if (debug) {
          console.log(`[${debug}]: ${prevState.type} + ${action.type} => XX ERROR XX`);
          console.log({ prevState, action });
        }
        try {
          // dispatch error action (with fromError = true)
          internalDispatch(createErrorAction(error), true);
          return;
        } catch (error) {
          // Error when dispatching error action, replace state with error state
          setState(createErrorState(error));
          return;
        }
      }
    };

    const runEffect = () => {
      const stateKey = state.type as keyof typeof states;
      runCleanup();
      const effect = states[stateKey].effect;
      if (effect) {
        cleanup = effect({ state: state as any, dispatch: this.dispatch }) ?? null;
      }
    };

    const runCleanup = () => {
      if (cleanup !== null) {
        cleanup();
      }
      cleanup = null;
    };

    const checkDestroyed = (action: string, infos?: any) => {
      if (destroyed) {
        if (infos) {
          console.warn(infos);
        }
        console.warn(`[Stachine] Calling .${action} on an already destroyed machine is a no-op`);
        return;
      }
    };

    const sub = Subscription<State>() as Subscription<State>;
    let state: State = initialState;
    let cleanup: Cleanup | null = null;
    let destroyed = false;

    this.dispatch = (action) => {
      checkDestroyed('dispatch', { state, action });
      internalDispatch(action, false);
    };

    this.allowed = (action) => {
      return actionAllowed(action).allowed;
    };

    this.subscribe = sub.subscribe;

    this.getState = () => state;

    this.isState = (...types) => {
      return types.includes(state.type);
    };

    this.destroy = () => {
      checkDestroyed('destroy', { state });

      destroyed = true;
      runCleanup();
      if (globalEffectCleanup) {
        globalEffectCleanup();
      }
    };

    const globalEffectCleanup = globalEffect?.({ dispatch: this.dispatch, getState: this.getState }) ?? null;

    runEffect();
  }
}
