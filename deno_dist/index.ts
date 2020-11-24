import { Subscription, SubscribeMethod } from 'https://raw.githubusercontent.com/etienne-dldc/suub/v3.1.1/deno_dist/mod.ts';

export type UnionBase = { type: string };

export type StateResult<States extends UnionBase> = States | null | typeof CANCEL_TOKEN;

export const CANCEL_TOKEN = Symbol.for('STACHINE_CANCEL_TOKEN');

export type EffectCleanup = () => void;

export type EmitEvents<Events extends UnionBase> = (event: Events) => void;

export type GlobalEffectTools<States extends UnionBase, Events extends UnionBase> = {
  emit: EmitEvents<Events>;
  getState: () => States;
};

export type TypedHandler<
  States extends UnionBase,
  Events extends UnionBase,
  S extends States['type'],
  E extends Events['type']
> = (
  event: Extract<Events, { type: E }>,
  state: Extract<States, { type: S }>,
  machine: StateMachine<States, Events>
) => StateResult<States>;

export type GlobalEffectHandler<States extends UnionBase, Events extends UnionBase> = (
  options: GlobalEffectTools<States, Events>
) => EffectCleanup | void;

export type Effects<States extends UnionBase, Events extends UnionBase> = {
  [S in States['type']]?: (
    state: Extract<States, { type: S }>,
    machine: StateMachine<States, Events>
  ) => EffectCleanup | void;
};

export type TransitionHandler<States extends UnionBase, Events extends UnionBase> = (
  event: Events,
  state: States,
  machine: StateMachine<States, Events>
) => StateResult<States>;

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
    | TypedHandler<States, Events, S, Events['type']>
    | EventsObjectHandler<States, Events, S>;
};

export type HandleObjectByEvent<States extends UnionBase, Events extends UnionBase> = {
  [E in Events['type']]?:
    | StatesObjectHandler<States, Events, E>
    | TypedHandler<States, Events, States['type'], E>;
};

export type StateMachineOptions<States extends UnionBase, Events extends UnionBase> = {
  initialState: States;
  transitions?: TransitionHandler<States, Events>;
  effects?: Effects<States, Events>;
  globalEffect?: GlobalEffectHandler<States, Events>;
  debug?: boolean;
};

export type TransitionConstraint<
  States extends UnionBase,
  Events extends UnionBase,
  S extends States['type'],
  E extends Events['type']
> = null | { state?: S; states?: ReadonlyArray<S>; event?: E; events?: ReadonlyArray<E> };

export class StateMachine<States extends UnionBase, Events extends UnionBase> {
  private readonly subscription = Subscription<States>() as Subscription<States>;
  private readonly debug: boolean;
  private globalCleanup: EffectCleanup | null = null;
  private currentCleanup: EffectCleanup | null = null;
  private readonly transitions: TransitionHandler<States, Events>;
  private readonly effects: Effects<States, Events>;

  private currentState!: States;
  private destroyed = false;

  constructor(options: StateMachineOptions<States, Events>) {
    const { debug = false, initialState, globalEffect, transitions, effects = {} } = options;
    this.transitions = transitions ?? (() => null);
    this.effects = effects;
    this.debug = debug;
    this.currentState = initialState;

    if (globalEffect) {
      const cleanup = globalEffect({ emit: this.emit, getState: this.getState });
      if (cleanup) {
        this.globalCleanup = cleanup;
      }
    }

    this.runEffect();
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

    const result = this.transitions(event, this.currentState, this);

    if (result === null || result === CANCEL_TOKEN) {
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
      this.cleanup();
      this.runEffect();
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
    this.subscription.unsubscribeAll();
    this.cleanup();
    if (this.globalCleanup) {
      this.globalCleanup();
    }
  }

  private runEffect() {
    if (this.effects) {
      const state: States['type'] = this.currentState.type;
      const effect = this.effects[state];
      if (effect) {
        const cleanup = effect(this.currentState as any, this);
        if (cleanup) {
          this.currentCleanup = cleanup;
        }
      }
    }
  }

  private handleResult(result: StateResult<States>): boolean {
    if (result === CANCEL_TOKEN || result === null) {
      return false;
    }
    const stateChanged = this.currentState !== result;
    if (stateChanged === false) {
      return false;
    }
    this.currentState = result;
    return true;
  }

  private cleanup() {
    if (this.currentCleanup) {
      this.currentCleanup();
    }
    this.currentCleanup = null;
  }
}

export function typedTransition<States extends UnionBase, Events extends UnionBase>() {
  return {
    compose,
    switchByStates,
    switchByEvents,
    onState,
    onEvent,
    on: transition,
  };

  function compose(
    ...handlers: Array<TransitionHandler<States, Events>>
  ): TransitionHandler<States, Events> {
    return function composed(event, state, machine) {
      for (const handler of handlers) {
        const res = handler(event, state, machine); // handler(event, state);
        if (res) {
          return res;
        }
      }
      return null;
    };
  }

  function switchByStates(
    obj: HandleObjectByStates<States, Events>
  ): TransitionHandler<States, Events> {
    return function handler(event, state, machine) {
      const stateHandler = obj[state.type as States['type']];
      if (!stateHandler) {
        return null;
      }
      if (typeof stateHandler === 'function') {
        return stateHandler(event as any, state as any, machine);
      }
      const handler = stateHandler[event.type as Events['type']];
      if (!handler) {
        return null;
      }
      return handler(event as any, state as any, machine);
    };
  }

  function switchByEvents(
    obj: HandleObjectByEvent<States, Events>
  ): TransitionHandler<States, Events> {
    return function handler(event, state, machine) {
      const eventHandler = obj[event.type as Events['type']];
      if (!eventHandler) {
        return null;
      }
      if (typeof eventHandler === 'function') {
        return eventHandler(event as any, state as any, machine);
      }
      const handler = eventHandler[state.type as States['type']];
      if (!handler) {
        return null;
      }
      return handler(event as any, state as any, machine);
    };
  }

  function onState<S extends States['type']>(
    state: S | ReadonlyArray<S>,
    handler:
      | TypedHandler<States, Events, S, Events['type']>
      | EventsObjectHandler<States, Events, S>
  ): TransitionHandler<States, Events> {
    const stateArr = Array.isArray(state) ? state : [state];
    return function result(event, state, machine) {
      if (!stateArr.includes(state.type)) {
        return null;
      }
      if (typeof handler === 'function') {
        return handler(event as any, state as any, machine);
      }
      const handlerFn = handler[event.type as Events['type']];
      if (!handlerFn) {
        return null;
      }
      return handlerFn(event as any, state as any, machine);
    };
  }

  function onEvent<E extends Events['type']>(
    event: E | ReadonlyArray<E>,
    handler:
      | TypedHandler<States, Events, States['type'], E>
      | StatesObjectHandler<States, Events, E>
  ): TransitionHandler<States, Events> {
    const eventArr = Array.isArray(event) ? event : [event];
    return function result(event, state, machine) {
      if (!eventArr.includes(event.type)) {
        return null;
      }
      if (typeof handler === 'function') {
        return handler(event as any, state as any, machine);
      }
      const handlerFn = handler[state.type as States['type']];
      if (!handlerFn) {
        return null;
      }
      return handlerFn(event as any, state as any, machine);
    };
  }

  function transition<S extends States['type'], E extends Events['type']>(
    constraint: TransitionConstraint<States, Events, S, E>,
    handler: TypedHandler<States, Events, S, E>
  ): TransitionHandler<States, Events> {
    const { state, states, event, events } = constraint || {};
    const eventArr = Array.isArray(events) ? events : event ? [event] : null;
    const stateArr = Array.isArray(states) ? states : state ? [state] : null;
    return function result(event, state, machine) {
      const isEvent = eventArr === null ? true : eventArr.includes(event.type);
      const isState = stateArr === null ? true : stateArr.includes(state.type);
      if (!isEvent || !isState) {
        return null;
      }
      return handler(event as any, state as any, machine);
    };
  }
}
