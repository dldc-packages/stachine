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

const IS_STACHINE = Symbol('IS_STACHINE');

export interface IStachine<State extends Base, Action extends Base> {
  [IS_STACHINE]: true;
  readonly dispatch: (action: Action) => void;
  readonly allowed: (action: Action) => boolean;
  readonly getState: () => State;
  readonly subscribe: SubscribeMethod<State>;
  readonly isState: (...types: ReadonlyArray<State['type']>) => boolean;
  readonly destroy: () => void;
  readonly isDestroyed: () => boolean;
}

export const Stachine = (() => {
  return Object.assign(create, { is });

  function is(maybe: unknown): maybe is IStachine<any, any> {
    if (!maybe) {
      return false;
    }
    return (maybe as any)[IS_STACHINE] === true;
  }

  function create<State extends Base, Action extends Base>({
    initialState,
    states,
    debug,
    strict,
    effect: globalEffect,
    createErrorAction,
    createErrorState,
  }: Config<State, Action>): IStachine<State, Action> {
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

    const sub = Subscription<State>() as Subscription<State>;
    let state: State = initialState;
    let cleanup: Cleanup | null = null;
    let destroyed = false;

    const globalEffectCleanup = globalEffect?.({ dispatch, getState }) ?? null;

    runEffect();

    return {
      [IS_STACHINE]: true,
      dispatch,
      allowed,
      getState,
      subscribe: sub.subscribe,
      isState,
      destroy,
      isDestroyed,
    };

    function warn(message: string, infos?: any) {
      const prefix = debug ? `[${debug}] ` : '[Stachine] ';
      console.warn(prefix + message);
      if (infos) {
        console.warn(infos);
      }
    }

    /**
     * Return true if the state has changed
     */
    function setState(newtState: State): boolean {
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
    }

    function actionAllowed(action: Action): AllowedResult<State, Action> {
      const stateKey = state.type as State['type'];
      const actionKey = action.type as Action['type'];
      const actionConfig = statesActionsResolved[stateKey][actionKey] ?? false;
      if (actionConfig === false) {
        return { allowed: false };
      }
      return { allowed: true, transition: actionConfig };
    }

    function internalDispatch(action: Action, fromError: boolean): void {
      const allowedRes = actionAllowed(action);
      if (allowedRes.allowed === false) {
        if (strict) {
          throw new Error(`Action ${action.type} is not allowed in state ${state.type}`);
        }
        warn(`Unexpected action type ${action.type} in state ${state.type}`, { action, state });
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
    }

    function runEffect() {
      const stateKey = state.type as keyof typeof states;
      runCleanup();
      const effect = states[stateKey].effect;
      if (effect) {
        cleanup = effect({ state: state as any, dispatch }) ?? null;
      }
    }

    function runCleanup() {
      if (cleanup !== null) {
        cleanup();
      }
      cleanup = null;
    }

    function checkDestroyed(action: string, infos?: any) {
      if (destroyed) {
        warn(`Calling .${action} on an already destroyed machine is a no-op`, infos);
        return;
      }
    }

    function dispatch(action: Action) {
      checkDestroyed('dispatch', { state, action });
      internalDispatch(action, false);
    }

    function allowed(action: Action) {
      return actionAllowed(action).allowed;
    }

    function getState() {
      return state;
    }

    function isState(...types: ReadonlyArray<State['type']>): boolean {
      return types.includes(state.type);
    }

    function destroy() {
      checkDestroyed('destroy', { state });

      destroyed = true;
      runCleanup();
      if (globalEffectCleanup) {
        globalEffectCleanup();
      }
    }

    function isDestroyed() {
      return destroyed;
    }
  }
})();
