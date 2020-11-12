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
export type Effect<Events extends UnionBase> = (emit: EmitEvents<Events>) => EffectCleanup | void;
export type InitialStateFn<States extends UnionBase, Events extends UnionBase> = () =>
  | States
  | StateWithEffect<States, Events>;
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
export type StateMachineOptions = { debug?: boolean };

const StateCtx = Miid.createContext<unknown>(null);
const EventCtx = Miid.createContext<unknown>(null);

export const StateConsumer = StateCtx.Consumer;
export const EventConsumer = EventCtx.Consumer;

export class StateMachine<States extends UnionBase, Events extends UnionBase> {
  private readonly middleware: Middleware<States, Events>;
  private readonly subscription = Subscription<States>() as Subscription<States>;
  private readonly options: Required<StateMachineOptions>;
  private currentCleanup: EffectCleanup | null = null;
  private currentState!: States;

  static typed<States extends UnionBase, Events extends UnionBase>() {
    return {
      StateConsumer: StateConsumer as Miid.ContextConsumer<States, true>,
      EventConsumer: EventConsumer as Miid.ContextConsumer<Events, true>,
      create: (
        initialState: States | InitialStateFn<States, Events>,
        middleware: Middleware<States, Events>,
        options?: StateMachineOptions
      ) => new StateMachine<States, Events>(initialState, middleware, options),
      compose: (...middlewares: Array<Middleware<States, Events>>) => compose(...middlewares),
      handleState<S extends States['type']>(
        state: S | ReadonlyArray<S>,
        handler: Handler<States, Events, S, Events['type']>
      ): Middleware<States, Events> {
        return handleState(state, handler);
      },
      handleEvent<E extends Events['type']>(
        event: E | ReadonlyArray<E>,
        handler: Handler<States, Events, States['type'], E>
      ): Middleware<States, Events> {
        return handleEvent(event, handler);
      },
      handle<S extends States['type'], E extends Events['type']>(
        state: S | ReadonlyArray<S>,
        event: E | ReadonlyArray<E>,
        handler: Handler<States, Events, S, E>
      ): Middleware<States, Events> {
        return handle(state, event, handler);
      },
      handleAny(
        handler: Handler<States, Events, States['type'], Events['type']>
      ): Middleware<States, Events> {
        return handleAny(handler);
      },
      withEffect(state: States, effect: Effect<Events>): StateWithEffect<States, Events> {
        return withEffect(state, effect);
      },
    };
  }

  constructor(
    initialState: States | InitialStateFn<States, Events>,
    middleware: Middleware<States, Events>,
    options: StateMachineOptions = {}
  ) {
    this.middleware = middleware;
    this.options = {
      debug: false,
      ...options,
    };
    const initialStateFn = typeof initialState === 'function' ? initialState : () => initialState;
    this.handleResult(initialStateFn());
  }

  getState = () => this.currentState;

  subscribe: SubscribeMethod<States> = this.subscription.subscribe;

  emit = (event: Events) => {
    const result = this.middleware(
      Miid.ContextStack.createFrom(StateCtx.Provider(this.currentState), EventCtx.Provider(event)),
      () => null
    );

    if (result === null) {
      // do nothing
      if (this.options.debug) {
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

  private runEffect(effect: Effect<Events>) {
    if (this.currentCleanup) {
      throw new Error(`Effect not cleaned up !!`);
    }
    let cleanedup = false;
    const cleanup = effect((event) => {
      if (cleanedup) {
        throw new Error('Cannot emit from cleaned up effect, did you forget a cleanup function ?');
      }
      return this.emit(event);
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
  readonly effect: Effect<Events>;

  constructor(state: States, effect: Effect<Events>) {
    this.state = state;
    this.effect = effect;
  }
}

export function withEffect<States extends UnionBase, Events extends UnionBase>(
  state: States,
  effect: Effect<Events>
): StateWithEffect<States, Events> {
  return new StateWithEffect(state, effect);
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
