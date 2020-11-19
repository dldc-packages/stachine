import { Subscription, SubscribeMethod } from 'https://raw.githubusercontent.com/etienne-dldc/suub/v3.1.1/deno_dist/mod.ts';
import * as Miid from 'https://raw.githubusercontent.com/etienne-dldc/miid/v4.0.0-0/deno_dist/mod.ts';

export type Result<States extends UnionBase, Events extends UnionBase> =
  | States
  | null
  | StateWithEffect<States, Events>;
export type Middleware<States extends UnionBase, Events extends UnionBase> = Miid.Middleware<
  Result<States, Events>
>;
export type Middlewares<States extends UnionBase, Events extends UnionBase> = Miid.Middlewares<
  Result<States, Events>
>;
export type UnionBase = { type: string };
export type EffectCleanup = () => void;
export type EmitEvents<Events extends UnionBase> = (event: Events) => void;
export type InitialStateFn<States extends UnionBase, Events extends UnionBase> = (
  options: InitialTools<States, Events>
) => States | StateWithEffect<States, Events>;
export type Handler<
  States extends UnionBase,
  Events extends UnionBase,
  S extends States['type'],
  E extends Events['type']
> = (
  event: Extract<Events, { type: E }>,
  state: Extract<States, { type: S }>,
  next: () => Result<States, Events>
) => Result<States, Events>;

export type EffectTools<States extends UnionBase, Events extends UnionBase> = {
  emit: EmitEvents<Events>;
  setState: (state: States | StateWithEffect<States, Events>) => boolean;
  setStateWithEffect: (state: States, effect: Effect<States, Events>) => boolean;
};

export type Effect<States extends UnionBase, Events extends UnionBase> = (
  tools: EffectTools<States, Events>
) => EffectCleanup | void;

export type HandleObjectByStates<States extends UnionBase, Events extends UnionBase> = {
  [S in States['type']]?:
    | {
        [E in Events['type']]?: Handler<States, Events, S, E>;
      }
    | Handler<States, Events, S, Events['type']>;
};

export type HandleObjectByEvent<States extends UnionBase, Events extends UnionBase> = {
  [E in Events['type']]?:
    | {
        [S in States['type']]?: Handler<States, Events, S, E>;
      }
    | Handler<States, Events, States['type'], E>;
};

export type StateMachineOptions<States extends UnionBase, Events extends UnionBase> = {
  debug?: boolean;
  initialState: States | InitialStateFn<States, Events>;
};

export type InitialTools<States extends UnionBase, Events extends UnionBase> = {
  withEffect(state: States, effect: Effect<States, Events>): StateWithEffect<States, Events>;
  emit: EmitEvents<Events>;
};

export type BuilderTools<States extends UnionBase, Events extends UnionBase> = {
  StateConsumer: Miid.ContextConsumer<States, true>;
  EventConsumer: Miid.ContextConsumer<Events, true>;
  compose: (...middlewares: Array<Middleware<States, Events>>) => Middleware<States, Events>;
  handleState<S extends States['type']>(
    state: S | ReadonlyArray<S>,
    handler: Handler<States, Events, S, Events['type']>
  ): Middleware<States, Events>;
  handleEvent<E extends Events['type']>(
    event: E | ReadonlyArray<E>,
    handler: Handler<States, Events, States['type'], E>
  ): Middleware<States, Events>;
  handle<S extends States['type'], E extends Events['type']>(
    state: S | ReadonlyArray<S>,
    event: E | ReadonlyArray<E>,
    handler: Handler<States, Events, S, E>
  ): Middleware<States, Events>;
  handleAny(
    handler: Handler<States, Events, States['type'], Events['type']>
  ): Middleware<States, Events>;
  objectByStates(obj: HandleObjectByStates<States, Events>): Middleware<States, Events>;
  objectByEvents(obj: HandleObjectByEvent<States, Events>): Middleware<States, Events>;
  withEffect(state: States, effect: Effect<States, Events>): StateWithEffect<States, Events>;
};

export type Builder<States extends UnionBase, Events extends UnionBase> = (
  tools: BuilderTools<States, Events>
) => Middleware<States, Events>;

const StateCtx = Miid.createContext<unknown>(null);
const EventCtx = Miid.createContext<unknown>(null);

export const StateConsumer = StateCtx.Consumer;
export const EventConsumer = EventCtx.Consumer;

export class StateMachine<States extends UnionBase, Events extends UnionBase> {
  private readonly middleware: Middleware<States, Events>;
  private readonly subscription = Subscription<States>() as Subscription<States>;
  private readonly debug: boolean;
  private currentCleanup: EffectCleanup | null = null;
  private currentState!: States;
  private destroyed = false;

  constructor(options: StateMachineOptions<States, Events>, builder: Builder<States, Events>) {
    const { debug = false, initialState } = options;
    this.middleware = builder({
      StateConsumer: StateConsumer as Miid.ContextConsumer<States, true>,
      EventConsumer: EventConsumer as Miid.ContextConsumer<Events, true>,
      compose,
      handle,
      handleAny,
      handleEvent,
      handleState,
      withEffect,
      objectByEvents,
      objectByStates,
    });
    this.debug = debug;
    const initialStateFn = typeof initialState === 'function' ? initialState : () => initialState;
    this.handleResult(initialStateFn({ withEffect, emit: this.emit }));
  }

  getState = () => this.currentState;

  subscribe: SubscribeMethod<States> = this.subscription.subscribe;

  emit = (event: Events) => {
    if (this.destroyed) {
      if (this.debug) {
        console.warn(`Calling emit on an already destroyed machine. This is a no-op`);
      }
      return;
    }

    const result = this.middleware(
      Miid.ContextStack.createFrom(StateCtx.Provider(this.currentState), EventCtx.Provider(event)),
      () => null
    );

    if (result === null) {
      // do nothing
      if (this.debug) {
        console.info(
          `[StateMachine] Event ${event.type} on state ${this.currentState.type} has been canceled (transition returned null)`
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
        console.warn(`Calling destroy on an already destroyed machine`);
      }
      return;
    }
    this.destroyed = true;
    this.cleanup();
    this.subscription.unsubscribeAll();
  }

  private handleResult(result: Result<States, Events>): boolean {
    if (result === null) {
      return false;
    }
    this.cleanup();
    const nextState = result instanceof StateWithEffect ? result.state : result;
    const nextEffect = result instanceof StateWithEffect ? result.effect : null;
    const stateChanged = this.currentState !== nextState;
    if (stateChanged) {
      this.currentState = nextState;
    }
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

export function objectByStates<States extends UnionBase, Events extends UnionBase>(
  obj: HandleObjectByStates<States, Events>
): Middleware<States, Events> {
  return (ctx, next) => {
    const state = ctx.getOrFail(StateConsumer as Miid.ContextConsumer<States, true>);
    const event = ctx.getOrFail(EventConsumer as Miid.ContextConsumer<Events, true>);
    const stateHandler = (obj as any)[state.type];
    if (!stateHandler) {
      return next(ctx);
    }
    if (typeof stateHandler === 'function') {
      return stateHandler(event, state, () => next(ctx));
    }
    const handler = stateHandler[event.type];
    if (!handler) {
      return next(ctx);
    }
    return handler(event, state, () => next(ctx));
  };
}

export function objectByEvents<States extends UnionBase, Events extends UnionBase>(
  obj: HandleObjectByEvent<States, Events>
): Middleware<States, Events> {
  return (ctx, next) => {
    const state = ctx.getOrFail(StateConsumer as Miid.ContextConsumer<States, true>);
    const event = ctx.getOrFail(EventConsumer as Miid.ContextConsumer<Events, true>);
    const eventHandler = (obj as any)[event.type];
    if (!eventHandler) {
      return next(ctx);
    }
    if (typeof eventHandler === 'function') {
      return eventHandler(event, state, () => next(ctx));
    }
    const handler = eventHandler[state.type];
    if (!handler) {
      return next(ctx);
    }
    return handler(event, state, () => next(ctx));
  };
}

export function compose<States extends UnionBase, Events extends UnionBase>(
  ...middlewares: Middlewares<States, Events>
) {
  return Miid.compose(...middlewares);
}

export function handleState<
  States extends UnionBase,
  Events extends UnionBase,
  S extends States['type']
>(
  state: S | ReadonlyArray<S>,
  handler: Handler<States, Events, S, Events['type']>
): Middleware<States, Events> {
  const stateArr = Array.isArray(state) ? state : [state];
  return (ctx, next) => {
    const state = ctx.getOrFail(StateConsumer as Miid.ContextConsumer<States, true>);
    const event = ctx.getOrFail(EventConsumer as Miid.ContextConsumer<Events, true>);
    if (!stateArr.includes(state.type)) {
      return next(ctx);
    }
    return handler(event as any, state as any, () => next(ctx));
  };
}

export function handleEvent<
  States extends UnionBase,
  Events extends UnionBase,
  E extends Events['type']
>(
  event: E | ReadonlyArray<E>,
  handler: Handler<States, Events, States['type'], E>
): Middleware<States, Events> {
  const eventArr = Array.isArray(event) ? event : [event];
  return (ctx, next) => {
    const state = ctx.getOrFail(StateConsumer as Miid.ContextConsumer<States, true>);
    const event = ctx.getOrFail(EventConsumer as Miid.ContextConsumer<Events, true>);
    if (!eventArr.includes(event.type)) {
      return next(ctx);
    }
    return handler(event as any, state as any, () => next(ctx));
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
  handler: Handler<States, Events, S, E>
): Middleware<States, Events> {
  const eventArr = Array.isArray(event) ? event : [event];
  const stateArr = Array.isArray(state) ? state : [state];
  return (ctx, next) => {
    const state = ctx.getOrFail(StateConsumer as Miid.ContextConsumer<States, true>);
    const event = ctx.getOrFail(EventConsumer as Miid.ContextConsumer<Events, true>);
    if (!eventArr.includes(event.type) || !stateArr.includes(state.type)) {
      return next(ctx);
    }
    return handler(event as any, state as any, () => next(ctx));
  };
}

export function handleAny<States extends UnionBase, Events extends UnionBase>(
  handler: Handler<States, Events, States['type'], Events['type']>
): Middleware<States, Events> {
  return (ctx, next) => {
    const state = ctx.getOrFail(StateConsumer as Miid.ContextConsumer<States, true>);
    const event = ctx.getOrFail(EventConsumer as Miid.ContextConsumer<Events, true>);
    return handler(event as any, state as any, () => next(ctx));
  };
}
