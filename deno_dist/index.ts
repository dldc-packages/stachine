import { Subscription, SubscribeMethod } from 'https://raw.githubusercontent.com/etienne-dldc/suub/v3.1.1/deno_dist/mod.ts';

export const CANCEL_TOKEN = Symbol.for('STACHINE_CANCEL_TOKEN');

export type UnionBase = { type: string };

export type StateResult<States extends UnionBase> = States | null | typeof CANCEL_TOKEN;

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

export type Effect<States extends UnionBase, Events extends UnionBase, S extends States['type']> = (
  state: Extract<States, { type: S }>,
  machine: StateMachine<States, Events>
) => EffectCleanup | void;

export type StateMachineStateOn<
  States extends UnionBase,
  Events extends UnionBase,
  S extends States['type']
> = {
  [E in Events['type']]?: TypedHandler<States, Events, S, E>;
};

export type StateMachineStateConfig<
  States extends UnionBase,
  Events extends UnionBase,
  S extends States['type']
> = {
  shortcuts?: ReadonlyArray<States['type']>;
  effect?: Effect<States, Events, S>;
  on?: StateMachineStateOn<States, Events, S>;
};

export type StateMachineConfig<States extends UnionBase, Events extends UnionBase> = {
  // Should we enforce all states to be defined here ?
  [S in States['type']]?: StateMachineStateConfig<States, Events, S>;
};

export type StateMachineOptions<States extends UnionBase, Events extends UnionBase> = {
  initialState: States;
  // transitions?: TransitionHandler<States, Events>;
  // effects?: Effects<States, Events>;
  // list allowed shortut for each state
  // shortcuts?: Shortcuts<States>;
  config: StateMachineConfig<States, Events>;
  globalEffect?: GlobalEffectHandler<States, Events>;
  debug?: boolean;
};

export class StateMachine<States extends UnionBase, Events extends UnionBase> {
  private readonly subscription = Subscription<States>() as Subscription<States>;
  private readonly debug: boolean;
  private readonly config: StateMachineConfig<States, Events>;
  private globalCleanup: EffectCleanup | null = null;
  private currentCleanup: EffectCleanup | null = null;

  private currentState!: States;
  private destroyed = false;

  constructor(options: StateMachineOptions<States, Events>) {
    const { debug = false, initialState, globalEffect, config = {} } = options;
    this.config = config;
    this.debug = debug;
    this.currentState = initialState;

    if (globalEffect) {
      const cleanup = globalEffect({ emit: this.emit, getState: this.getState });
      if (cleanup) {
        this.globalCleanup = cleanup;
      }
    }

    this.updateEffect();
  }

  getState = () => this.currentState;

  subscribe: SubscribeMethod<States> = this.subscription.subscribe;

  emit = (event: Events) => {
    if (this.destroyed) {
      this.warn(`Calling emit on an already destroyed machine is a no-op`);
      return;
    }

    const stateConfig = this.config[this.currentState.type as States['type']];
    if (!stateConfig) {
      // Should we throw an error here ?
      this.info(
        `Event "${event.type}" on state "${this.currentState.type}" has been ignored (state not defined in config)`
      );
      return;
    }
    if (!stateConfig.on) {
      this.info(
        `Event "${event.type}" on state "${this.currentState.type}" has been ignored (no "on" defined)`
      );
      return;
    }
    const handler = stateConfig.on[event.type as Events['type']];
    if (!handler) {
      this.info(
        `Event "${event.type}" on state "${this.currentState.type}" has been ignored (event not present in "on")`
      );
      return;
    }
    const result = handler(event as any, this.currentState as any, this);
    if (result === null || result === CANCEL_TOKEN) {
      // do nothing
      this.info(
        `Event "${event.type}" on state "${this.currentState.type}" has been ignored (transition returned null or CANCEL_TOKEN)`
      );
      return;
    }

    this.setState(result);
  };

  shortcut = (state: States) => {
    if (this.destroyed) {
      this.warn(`Calling shortcut on an already destroyed machine is a no-op`);
      return;
    }
    const stateConfig = this.config[this.currentState.type as States['type']];
    if (!stateConfig) {
      this.info(
        `Shortcut "${state.type}" on state "${this.currentState.type}" has been ignored (state not defined in config)`
      );
      return;
    }
    if (!stateConfig.shortcuts || stateConfig.shortcuts.length === 0) {
      this.info(
        `Shortcut "${state.type}" on state "${this.currentState.type}" has been ignored (no shortcuts defined)`
      );
      return;
    }
    if (!stateConfig.shortcuts.includes(state.type)) {
      this.info(
        `Shortcut "${state.type}" on state "${this.currentState.type}" has been ignored (not allowed)`
      );
      return;
    }
    this.setState(state);
  };

  destroy = () => {
    if (this.destroyed) {
      this.warn(`Calling destroy on an already destroyed machine is a no-op`);
      return;
    }
    this.destroyed = true;
    this.subscription.unsubscribeAll();
    this.cleanup();
    if (this.globalCleanup) {
      this.globalCleanup();
    }
  };

  private warn(msg: string) {
    if (this.debug) {
      console.warn(`[Stachine] ${msg}`);
    }
  }

  private info(msg: string) {
    if (this.debug) {
      console.info(`[Stachine] ${msg}`);
    }
  }

  private updateEffect() {
    const stateConfig = this.config[this.currentState.type as States['type']];
    if (!stateConfig) {
      return;
    }
    if (!stateConfig.effect) {
      return;
    }
    const cleanup = stateConfig.effect(this.currentState as any, this);
    if (cleanup) {
      this.currentCleanup = cleanup;
    }
  }

  private setState(state: StateResult<States>) {
    if (state === CANCEL_TOKEN || state === null) {
      return;
    }
    const stateChanged = this.currentState !== state;
    if (stateChanged === false) {
      return;
    }
    this.currentState = state;
    this.cleanup();
    this.updateEffect();
    this.subscription.emit(this.currentState);
  }

  private cleanup() {
    if (this.currentCleanup) {
      this.currentCleanup();
    }
    this.currentCleanup = null;
  }
}
