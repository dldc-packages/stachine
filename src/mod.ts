import type { TKey } from '@dldc/erreur';
import { Erreur, Key } from '@dldc/erreur';
import type { OnUnsubscribed, SubscribeMethod, SubscriptionCallback, Unsubscribe } from '@dldc/pubsub';
import { PubSub } from '@dldc/pubsub';

export type StateBase = { state: string };
export type ActionBase = { action: string };

export type Cleanup = () => void;

export const FORCE_EFFECT = Symbol('FORCE_EFFECT');
export type FORCE_EFFECT = typeof FORCE_EFFECT;

export type Dispatch<Action extends ActionBase> = (action: Action) => void;

export type EffectParams<CurrentState extends StateBase, Action extends ActionBase> = {
  state: CurrentState;
  dispatch: Dispatch<Action>;
};

export type Effect<CurrentState extends StateBase, Action extends ActionBase> = (
  params: EffectParams<CurrentState, Action>,
) => Cleanup | void;

export type ReactionParams<CurrentState extends StateBase, Action extends ActionBase> = {
  state: CurrentState;
  dispatch: Dispatch<Action>;
};

export type Reaction<CurrentState extends StateBase, Action extends ActionBase> = (
  params: ReactionParams<CurrentState, Action>,
) => void;

export type StateActionConfig<
  CurrentState extends StateBase,
  CurrentAction extends ActionBase,
  State extends StateBase,
> = false | Transition<CurrentState, CurrentAction, State>;

export type StateConfigActions<CurrentState extends StateBase, State extends StateBase, Action extends ActionBase> = {
  [A in Action['action']]?: StateActionConfig<CurrentState, Extract<Action, { action: A }>, State>;
};

export type StateConfig<CurrentState extends StateBase, State extends StateBase, Action extends ActionBase> = {
  actions?: StateConfigActions<CurrentState, State, Action>;
  // run when the state is entered (run after the emit)
  // if the effect returns a cleanup function, it will be called when the state is left
  effect?: Effect<CurrentState, Action>;
  // run before the store emits the corresponding state (before the emit)
  // If you dispatch an action in the reaction, the intermediate state will not be emitted
  reaction?: Reaction<CurrentState, Action>;
};

export type Transition<
  CurrentState extends StateBase,
  CurrentAction extends ActionBase,
  State extends StateBase,
> = (params: {
  state: CurrentState;
  action: CurrentAction;
  rerunEffect: (styate: CurrentState) => CurrentState;
}) => State;

export type GlobalEffectParams<States extends StateBase, Action extends ActionBase> = {
  getState: () => States;
  dispatch: (action: Action) => void;
};

export type ConfigGlobalEffect<States extends StateBase, Action extends ActionBase> = (
  params: GlobalEffectParams<States, Action>,
) => Cleanup | void;

export type Config<State extends StateBase, Action extends ActionBase> = {
  debug?: string;
  // when strict is true, the machine will console.error if the action is not defined in the states
  // when strict is false, unhandled actions will be ignored
  strict?: boolean;
  initialState: State;
  states: {
    [S in State['state']]: StateConfig<Extract<State, { state: S }>, State, Action>;
  };
  // global effect (will cleanup when the machine is destroyed)
  effect?: ConfigGlobalEffect<State, Action>;
  // When an error occurs in a transition, we replace the current state with the error state
  createErrorState: (error: unknown, currentState: State) => State;
  // max number of recursive dispatches in reaction
  maxRecursiveDispatch?: number;
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
  // same as subscribe but runs the callback immediately with the current state
  readonly watch: SubscribeMethod<State>;
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
    createErrorState,
    maxRecursiveDispatch = 1000,
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

    const sub = PubSub.createSubscription<State>();
    const dispatchQueue: Array<Action> = [];
    let isDispatching = false;
    let inTransition = false;
    let state: State = initialState;
    let currentStateCleanup: Cleanup | null = null;

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
      const stateKey = state.state as State['state'];
      const actionKey = action.action as Action['action'];
      const actionConfig = statesActionsResolved[stateKey][actionKey] ?? false;
      if (actionConfig === false) {
        return { allowed: false };
      }
      return { allowed: true, transition: actionConfig };
    }

    function dispatch(action: Action): void {
      if (checkDestroyed('dispatch', { state, action })) {
        return;
      }
      if (inTransition) {
        throw StachineErreur.DispatchInTransition(action, state);
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
            logError(`Action ${action.action} is not allowed in state ${state.state}`, { action, state });
          }
          break;
        }
        const transition = allowedRes.transition;
        const nextState = safeTransition(transition, action);
        forceEffectMap[nextState.state] = forceEffectMap[nextState.state] || hasForceEffect(nextState);
        if (nextState === state) {
          if (debug) {
            console.groupCollapsed(`[${debug}]: ${prevState.state} + ${action.action} => [SAME_STATE]`);
            console.log({ state: prevState, action });
            console.groupEnd();
          }
          break;
        }
        // state changed, update state
        state = nextState;
        if (debug) {
          console.groupCollapsed(`[${debug}]: ${prevState.state} + ${action.action} => ${nextState.state}`);
          console.log({ prevState, action, state });
          console.groupEnd();
        }
        // run reaction for the new state
        runReaction();
      }
      if (dispatchQueueSafe <= 0) {
        throw StachineErreur.MaxRecursiveDispatchReached(maxRecursiveDispatch);
      }
      if (dispatchQueue.length > 0) {
        // if there is still actions in the queue, this is not expected
        throw StachineErreur.UnexpectedDispatchQueue(dispatchQueue);
      }
      isDispatching = false;
      if (state === prevState) {
        // no state change, stop here
        return;
      }
      // state changed
      if (debug) {
        console.log(`[${debug}]: Emitting state ${state.state}`);
      }
      sub.emit(state);
      // run effect if state type changed or if force effect
      const stateTypeChanged = prevState.state !== state.state;
      const shouldRunEffect = stateTypeChanged || forceEffectMap[prevState.state] === true;
      if (shouldRunEffect) {
        if (debug) {
          console.log(
            `[${debug}]: Running effect for state ${state.state} (${
              stateTypeChanged ? 'state type changed' : 'force effect'
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
          console.log(`[${debug}]: Rining reaction of ${stateKey}`);
        }
        reaction({ state: state as any, dispatch });
      }
    }

    function safeTransition(transition: Transition<State, Action, State>, action: Action): State {
      const prevState = state;
      inTransition = true;
      try {
        const nextState = transition({ state, action, rerunEffect });
        inTransition = false;
        return nextState;
      } catch (error) {
        if (debug) {
          console.log(`[${debug}]: ${prevState.state} + ${action.action} => XX ERROR XX`);
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

    function watch(callback: SubscriptionCallback<State>, onUnsubscribe?: OnUnsubscribed): Unsubscribe {
      if (checkDestroyed('watch', { state })) {
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

    function isState(...states: ReadonlyArray<State['state']>): boolean {
      return states.includes(state.state);
    }

    function checkDestroyed(action: string, infos?: any): boolean {
      if (sub.isDestroyed()) {
        logWarn(`Calling .${action} on an already destroyed machine is a no-op`, infos);
        return true;
      }
      return false;
    }

    function destroy() {
      if (checkDestroyed('destroy', { state })) {
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
        logWarn(`Calling rerunEffect on the same state is a no-op, use rerunEffect({ ...state }) instead`);
        return state;
      }
      (nextState as any)[FORCE_EFFECT] = true;
      return nextState;
    }

    function logWarn(message: string, infos?: any) {
      const prefix = debug ? `[${debug}] ` : '[Stachine] ';
      console.warn(prefix + message);
      if (infos) {
        console.warn(infos);
      }
    }

    function logError(message: string, infos?: any) {
      const prefix = debug ? `[${debug}] ` : '[Stachine] ';
      console.error(prefix + message);
      if (infos) {
        console.error(infos);
      }
    }
  }
})();

export type TStachineErreurData =
  | { kind: 'MaxRecursiveDispatchReached'; limit: number }
  | { kind: 'UnexpectedDispatchQueue'; queue: ActionBase[] }
  | { kind: 'DispatchInTransition'; action: ActionBase; state: StateBase };

export const StachineErreurKey: TKey<TStachineErreurData, false> = Key.create<TStachineErreurData>('StachineErreur');

export const StachineErreur = {
  MaxRecursiveDispatchReached: (limit: number) =>
    Erreur.create(
      new Error(
        `The maxRecursiveDispatch limit (${limit}) has been reached, did you emit() in a callback ? If this is expected you can use the maxRecursiveDispatch option to raise the limit`,
      ),
    )
      .withName('MaxRecursiveDispatchReached')
      .with(StachineErreurKey.Provider({ kind: 'MaxRecursiveDispatchReached', limit })),
  UnexpectedDispatchQueue: (queue: ActionBase[]) =>
    Erreur.create(new Error(`The dispatch queue is not empty after exiting dispatch loop, this is unexpected`))
      .withName('UnexpectedDispatchQueue')
      .with(StachineErreurKey.Provider({ kind: 'UnexpectedDispatchQueue', queue })),
  DispatchInTransition: (action: ActionBase, state: StateBase) =>
    Erreur.create(new Error(`Cannot dispatch in a transition (in transition ${state.state} -> ${action.action})`))
      .withName('DispatchInTransition')
      .with(StachineErreurKey.Provider({ kind: 'DispatchInTransition', action, state })),
};
