import { SubscribeMethod, Subscription } from 'https://raw.githubusercontent.com/etienne-dldc/suub/v3.2.1/deno_dist/mod.ts';

export type StateBase = { state: string };
export type ActionBase = { action: string };

export type Cleanup = () => void;

export const FORCE_EFFECT = Symbol('FORCE_EFFECT');
export type FORCE_EFFECT = typeof FORCE_EFFECT;

export type Effect<CurrentState extends StateBase, Action extends ActionBase> = (params: {
  state: CurrentState;
  dispatch: (action: Action) => void;
}) => Cleanup | void;

export type StateActionConfig<CurrentState extends StateBase, CurrentAction extends ActionBase, State extends StateBase> =
  | false
  | Transition<CurrentState, CurrentAction, State>;

export type StateConfigActions<CurrentState extends StateBase, State extends StateBase, Action extends ActionBase> = {
  [A in Action['action']]?: StateActionConfig<CurrentState, Extract<Action, { action: A }>, State>;
};

export type StateConfig<CurrentState extends StateBase, State extends StateBase, Action extends ActionBase> = {
  effect?: Effect<CurrentState, Action>;
  actions?: StateConfigActions<CurrentState, State, Action>;
};

export type Transition<CurrentState extends StateBase, CurrentAction extends ActionBase, State extends StateBase> = (params: {
  state: CurrentState;
  action: CurrentAction;
  rerunEffect: (styate: CurrentState) => CurrentState;
}) => State;

export type ConfigGlobalEffect<States extends StateBase, Action extends ActionBase> = (params: {
  getState: () => States;
  dispatch: (action: Action) => void;
}) => Cleanup | void;

export type Config<State extends StateBase, Action extends ActionBase> = {
  debug?: string;
  // when strict is true, the machine will throw an error if the action is not defined in the states
  strict?: boolean;
  initialState: State;
  states: {
    [S in State['state']]: StateConfig<Extract<State, { state: S }>, State, Action>;
  };
  effect?: ConfigGlobalEffect<State, Action>;
  // When an error occuse, we first try to emit an error action
  createErrorAction: (error: unknown) => Action;
  // If the dispatch of the error action fails, we replace the state with an error state
  createErrorState: (error: unknown) => State;
};

type AllowedResult<State extends StateBase, Action extends ActionBase> =
  | { allowed: false }
  | { allowed: true; transition: Transition<State, Action, State> };

type StatesActionsResolved<State extends StateBase, Action extends ActionBase> = {
  [S in State['state']]: {
    [A in Action['action']]?: false | Transition<State, Action, State>;
  };
};

const IS_STACHINE = Symbol('IS_STACHINE');

export interface IStachine<State extends StateBase, Action extends ActionBase> {
  [IS_STACHINE]: true;
  readonly dispatch: (action: Action) => void;
  readonly allowed: (action: Action) => boolean;
  readonly getState: () => State;
  readonly subscribe: SubscribeMethod<State>;
  readonly isState: (...types: ReadonlyArray<State['state']>) => boolean;
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

  function create<State extends StateBase, Action extends ActionBase>({
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
      const [state, stateConfig] = entry as [Action['action'], StateConfig<State, State, Action>];
      statesActionsResolved[state] = {};
      Object.entries(stateConfig.actions || {}).forEach((entry) => {
        const [action, actionConfig] = entry as [Action['action'], StateActionConfig<State, Action, State>];
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

    // Run effect on mount
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
    function setState(newState: State): boolean {
      const prevState = state;
      const forceEffect = (newState as any)[FORCE_EFFECT] === true;
      if (forceEffect) {
        delete (newState as any)[FORCE_EFFECT];
      }
      if (newState === prevState) {
        // when state has same ref,
        // do not emit and do not run effect
        return false;
      }
      state = newState;
      sub.emit(state);
      if (forceEffect || prevState.state !== newState.state) {
        runEffect();
      }
      return true;
    }

    function actionAllowed(action: Action): AllowedResult<State, Action> {
      const stateKey = state.state as State['state'];
      const actionKey = action.action as Action['action'];
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
          throw new Error(`Action ${action.action} is not allowed in state ${state.state}`);
        }
        warn(`Unexpected action type ${action.action} in state ${state.state}`, { action, state });
        return;
      }
      const transition = allowedRes.transition;
      const prevState = state;

      try {
        const nextState = transition({ state, action, rerunEffect });
        const stateChanged = setState(nextState);
        if (debug && stateChanged) {
          console.groupCollapsed(`[${debug}]: ${prevState.state} + ${action.action} => ${nextState.state}`);
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
          console.log(`[${debug}]: ${prevState.state} + ${action.action} => XX ERROR XX`);
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
      const stateKey = state.state as keyof typeof states;
      const effect = states[stateKey].effect;
      runCleanup();
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

    function isState(...states: ReadonlyArray<State['state']>): boolean {
      return states.includes(state.state);
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

    function rerunEffect(nextState: State): State {
      if (state === nextState) {
        warn(`Calling rerunEffect on the same state is a no-op, use rerunEffect({ ...state }) instead`);
        return state;
      }
      (nextState as any)[FORCE_EFFECT] = true;
      return nextState;
    }
  }
})();
