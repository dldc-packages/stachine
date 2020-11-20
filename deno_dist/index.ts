import { Subscription, SubscribeMethod } from 'https://raw.githubusercontent.com/etienne-dldc/suub/v3.1.1/deno_dist/mod.ts';

export const CANCEL_TOKEN = Symbol.for('STACHINE_CANCEL_TOKEN');

export type Result<States extends UnionBase, Events extends UnionBase> =
  | null
  | typeof CANCEL_TOKEN
  | States
  | StateWithEffect<States, Events>;

export type UnionBase = { type: string };

export type EffectCleanup = () => void;

export type EmitEvents<Events extends UnionBase> = (event: Events) => void;

export type InitialStateFn<States extends UnionBase, Events extends UnionBase> = (
  options: InitialTools<States, Events>
) => States | StateWithEffect<States, Events>;

export type GlobalEffectFn<States extends UnionBase, Events extends UnionBase> = (
  options: GlobalEffectTools<States, Events>
) => EffectCleanup | void;

export type TypedHandler<
  States extends UnionBase,
  Events extends UnionBase,
  S extends States['type'],
  E extends Events['type']
> = (
  event: Extract<Events, { type: E }>,
  state: Extract<States, { type: S }>
) => Result<States, Events>;

export type Handler<States extends UnionBase, Events extends UnionBase> = (
  event: Events,
  state: States
) => Result<States, Events>;

export type EffectTools<States extends UnionBase, Events extends UnionBase> = {
  emit: EmitEvents<Events>;
  setState: (state: States | StateWithEffect<States, Events>) => boolean;
  setStateWithEffect: (state: States, effect: Effect<States, Events>) => boolean;
};

export type Effect<States extends UnionBase, Events extends UnionBase> = (
  tools: EffectTools<States, Events>
) => EffectCleanup | void;

export type EventsObjectHandler<
  States extends UnionBase,
  Events extends UnionBase,
  S extends States['type']
> = {
  [E in Events['type']]?: TypedHandler<States, Events, S, E>;
};

export type StatesObjectHandler<
  States extends UnionBase,
  Events extends UnionBase,
  E extends Events['type']
> = {
  [S in States['type']]?: TypedHandler<States, Events, S, E>;
};

export type HandleObjectByStates<States extends UnionBase, Events extends UnionBase> = {
  [S in States['type']]?:
    | EventsObjectHandler<States, Events, S>
    | TypedHandler<States, Events, S, Events['type']>;
};

export type HandleObjectByEvent<States extends UnionBase, Events extends UnionBase> = {
  [E in Events['type']]?:
    | StatesObjectHandler<States, Events, E>
    | TypedHandler<States, Events, States['type'], E>;
};

export type StateMachineOptions<States extends UnionBase, Events extends UnionBase> = {
  initialState: States | InitialStateFn<States, Events>;
  globalEffect?: GlobalEffectFn<States, Events>;
  debug?: boolean;
};

export type GlobalEffectTools<States extends UnionBase, Events extends UnionBase> = {
  emit: EmitEvents<Events>;
  getState: () => States;
};

export type InitialTools<States extends UnionBase, Events extends UnionBase> = {
  withEffect(state: States, effect: Effect<States, Events>): StateWithEffect<States, Events>;
  emit: EmitEvents<Events>;
};

export type BuilderTools<States extends UnionBase, Events extends UnionBase> = {
  withEffect(state: States, effect: Effect<States, Events>): StateWithEffect<States, Events>;
  compose: (...handlers: Array<Handler<States, Events>>) => Handler<States, Events>;
  handleState<S extends States['type']>(
    state: S | ReadonlyArray<S>,
    handler:
      | TypedHandler<States, Events, S, Events['type']>
      | EventsObjectHandler<States, Events, S>
  ): Handler<States, Events>;
  handleEvent<E extends Events['type']>(
    event: E | ReadonlyArray<E>,
    handler:
      | TypedHandler<States, Events, States['type'], E>
      | StatesObjectHandler<States, Events, E>
  ): Handler<States, Events>;
  handle<S extends States['type'], E extends Events['type']>(
    state: S | ReadonlyArray<S>,
    event: E | ReadonlyArray<E>,
    handler: TypedHandler<States, Events, S, E>
  ): Handler<States, Events>;
  objectByStates(obj: HandleObjectByStates<States, Events>): Handler<States, Events>;
  objectByEvents(obj: HandleObjectByEvent<States, Events>): Handler<States, Events>;
};

export type Builder<States extends UnionBase, Events extends UnionBase> = (
  tools: BuilderTools<States, Events>
) => Handler<States, Events>;

export class StateMachine<States extends UnionBase, Events extends UnionBase> {
  private readonly handler: Handler<States, Events>;
  private readonly subscription = Subscription<States>() as Subscription<States>;
  private readonly debug: boolean;
  private globalCleanup: EffectCleanup | null = null;
  private currentCleanup: EffectCleanup | null = null;
  private currentState!: States;
  private destroyed = false;

  constructor(options: StateMachineOptions<States, Events>, builder: Builder<States, Events>) {
    const { debug = false, initialState, globalEffect } = options;

    this.handler = builder({
      compose,
      handle,
      handleEvent,
      handleState,
      withEffect,
      objectByEvents,
      objectByStates,
    });
    const initialStateFn = typeof initialState === 'function' ? initialState : () => initialState;
    this.handleResult(initialStateFn({ withEffect, emit: this.emit }));

    if (globalEffect) {
      const cleanup = globalEffect({ emit: this.emit, getState: this.getState });
      if (cleanup) {
        this.globalCleanup = cleanup;
      }
    }
    this.debug = debug;
  }

  getState = () => this.currentState;

  subscribe: SubscribeMethod<States> = this.subscription.subscribe;

  emit = (event: Events) => {
    if (this.destroyed) {
      if (this.debug) {
        console.warn(`[Stachine] Calling emit on an already destroyed machine is a no-op`);
      }
      return;
    }

    const result = this.handler(event, this.currentState);

    if (result === null) {
      // do nothing
      if (this.debug) {
        console.info(
          `[Stachine] Event "${event.type}" on state "${this.currentState.type}" has been ignored (transition returned null or CANCEL_TOKEN)`
        );
      }
      return;
    }
    const stateChanged = this.handleResult(result);
    if (stateChanged) {
      this.subscription.emit(this.currentState);
    }
  };

  destroy() {
    if (this.destroyed) {
      if (this.debug) {
        console.warn(`[Stachine] Calling destroy on an already destroyed machine is a no-op`);
      }
      return;
    }
    this.destroyed = true;
    this.cleanup();
    this.subscription.unsubscribeAll();
    if (this.globalCleanup) {
      this.globalCleanup();
    }
  }

  private handleResult(result: Result<States, Events>): boolean {
    if (result === CANCEL_TOKEN || result === null) {
      return false;
    }
    const nextState = result instanceof StateWithEffect ? result.state : result;
    const nextEffect = result instanceof StateWithEffect ? result.effect : null;
    const stateChanged = this.currentState !== nextState;
    if (stateChanged === false) {
      if (nextEffect) {
        this.cleanup();
        this.runEffect(nextEffect);
      }
      return false;
    }
    this.cleanup();
    this.currentState = nextState;
    if (nextEffect) {
      this.runEffect(nextEffect);
    }
    return true;
  }

  private cleanup() {
    if (this.currentCleanup) {
      this.currentCleanup();
    }
    this.currentCleanup = null;
  }

  private runEffect(effect: Effect<States, Events>) {
    if (this.currentCleanup) {
      throw new Error(`Effect not cleaned up !!`);
    }
    let cleanedup = false;

    const setState = (nextState: States | StateWithEffect<States, Events>) => {
      if (cleanedup) {
        return false;
      }
      const stateChanged = this.handleResult(nextState);
      if (stateChanged) {
        this.subscription.emit(this.currentState);
        return true;
      }
      return false;
    };

    const cleanup = effect({
      emit: this.emit,
      setState,
      setStateWithEffect: (nextState, effect) => {
        return setState(withEffect(nextState, effect));
      },
    });
    this.currentCleanup = () => {
      if (cleanup) {
        cleanup();
      }
      cleanedup = true;
    };
  }
}

export class StateWithEffect<States extends UnionBase, Events extends UnionBase> {
  readonly state: States;
  readonly effect: Effect<States, Events>;

  constructor(state: States, effect: Effect<States, Events>) {
    this.state = state;
    this.effect = effect;
  }
}

export function withEffect<States extends UnionBase, Events extends UnionBase>(
  state: States,
  effect: Effect<States, Events>
): StateWithEffect<States, Events> {
  return new StateWithEffect(state, effect);
}

export function compose<States extends UnionBase, Events extends UnionBase>(
  ...handlers: Array<Handler<States, Events>>
): Handler<States, Events> {
  return (event, state) => {
    for (const handler of handlers) {
      const res = handler(event, state);
      if (res) {
        return res;
      }
    }
    return null;
  };
}

export function objectByStates<States extends UnionBase, Events extends UnionBase>(
  obj: HandleObjectByStates<States, Events>
): Handler<States, Events> {
  return (event, state) => {
    const stateHandler = (obj as any)[state.type];
    if (!stateHandler) {
      return null;
    }
    if (typeof stateHandler === 'function') {
      return stateHandler(event, state);
    }
    const handler = stateHandler[event.type];
    if (!handler) {
      return null;
    }
    return handler(event, state);
  };
}

export function objectByEvents<States extends UnionBase, Events extends UnionBase>(
  obj: HandleObjectByEvent<States, Events>
): Handler<States, Events> {
  return (event, state) => {
    const eventHandler = (obj as any)[event.type];
    if (!eventHandler) {
      return null;
    }
    if (typeof eventHandler === 'function') {
      return eventHandler(event, state);
    }
    const handler = eventHandler[state.type];
    if (!handler) {
      return null;
    }
    return handler(event, state);
  };
}

export function handleState<
  States extends UnionBase,
  Events extends UnionBase,
  S extends States['type']
>(
  state: S | ReadonlyArray<S>,
  handler: TypedHandler<States, Events, S, Events['type']> | EventsObjectHandler<States, Events, S>
): Handler<States, Events> {
  const stateArr = Array.isArray(state) ? state : [state];
  return (event, state) => {
    if (!stateArr.includes(state.type)) {
      return null;
    }
    if (typeof handler === 'function') {
      return handler(event as any, state as any);
    }
    const handlerFn = (handler as any)[event.type];
    if (!handlerFn) {
      return null;
    }
    return handlerFn(event as any, state as any);
  };
}

export function handleEvent<
  States extends UnionBase,
  Events extends UnionBase,
  E extends Events['type']
>(
  event: E | ReadonlyArray<E>,
  handler: TypedHandler<States, Events, States['type'], E> | StatesObjectHandler<States, Events, E>
): Handler<States, Events> {
  const eventArr = Array.isArray(event) ? event : [event];
  return (event, state) => {
    if (!eventArr.includes(event.type)) {
      return null;
    }
    if (typeof handler === 'function') {
      return handler(event as any, state as any);
    }
    const handlerFn = (handler as any)[state.type];
    if (!handlerFn) {
      return null;
    }
    return handlerFn(event as any, state as any);
  };
}

export function handle<
  States extends UnionBase,
  Events extends UnionBase,
  S extends States['type'],
  E extends Events['type']
>(
  state: S | ReadonlyArray<S>,
  event: E | ReadonlyArray<E>,
  handler: TypedHandler<States, Events, S, E>
): Handler<States, Events> {
  const eventArr = Array.isArray(event) ? event : [event];
  const stateArr = Array.isArray(state) ? state : [state];
  return (event, state) => {
    if (!eventArr.includes(event.type) || !stateArr.includes(state.type)) {
      return null;
    }
    return handler(event as any, state as any);
  };
}
