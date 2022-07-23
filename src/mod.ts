import { Subscription, SubscribeMethod } from 'suub';

export const CANCEL_TOKEN = Symbol.for('STACHINE_CANCEL_TOKEN');

export type UnionBase = { type: string };

export type StateResult<States extends UnionBase> = States | null | typeof CANCEL_TOKEN;

export type EffectCleanup = () => void;

export type EmitEvents<Events extends UnionBase> = (event: Events) => void;

export type GlobalEffectTools<States extends UnionBase, Events extends UnionBase> = {
  emit: EmitEvents<Events>;
  getState: () => States;
};

export type TypedHandler<States extends UnionBase, Events extends UnionBase, S extends States['type'], E extends Events['type']> = (
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

export type StateMachineStateOn<States extends UnionBase, Events extends UnionBase, S extends States['type']> = {
  [E in Events['type']]?: TypedHandler<States, Events, S, E>;
};

export type StateMachineStateConfig<States extends UnionBase, Events extends UnionBase, S extends States['type']> = {
  shortcuts?: ReadonlyArray<States['type']>;
  effect?: Effect<States, Events, S>;
  on?: StateMachineStateOn<States, Events, S>;
};

export type StateMachineConfig<States extends UnionBase, Events extends UnionBase> = {
  [S in States['type']]?: StateMachineStateConfig<States, Events, S>;
};

export type StateMachineOptions<States extends UnionBase, Events extends UnionBase> = {
  initialState: States;
  config: StateMachineConfig<States, Events>;
  globalEffect?: GlobalEffectHandler<States, Events>;
  // when strict is true
  // - the machine will throw an error if a state transition is not defined in the config
  // - the machine will throw if a machine is used after destroyed
  strict?: boolean;
  debug?: boolean;
};

export class StateMachine<States extends UnionBase, Events extends UnionBase> {
  private readonly subscription = Subscription<States>() as Subscription<States>;
  private readonly debug: boolean;
  private readonly strict: boolean;
  private readonly config: StateMachineConfig<States, Events>;
  private globalCleanup: EffectCleanup | null = null;
  private currentCleanup: EffectCleanup | null = null;

  private currentState!: States;
  private destroyed = false;

  constructor(options: StateMachineOptions<States, Events>) {
    const { debug = true, strict = false, initialState, globalEffect, config } = options;
    this.config = config;
    this.debug = debug;
    this.strict = strict;
    this.currentState = initialState;

    if (globalEffect) {
      const cleanup = globalEffect({ emit: this.emit, getState: this.getState });
      if (cleanup) {
        this.globalCleanup = cleanup;
      }
    }

    this.updateEffect();
  }

  /**
   * Get current state
   */
  readonly getState = () => this.currentState;

  /**
   * Subscribe to state changes
   */
  readonly subscribe: SubscribeMethod<States> = this.subscription.subscribe;

  /**
   * Dispatch an event
   */
  readonly emit = (event: Events) => {
    if (this.destroyed) {
      this.throw({ type: 'MachineDestroyed', action: 'emit' });
      return;
    }

    const stateConfig = this.config[this.currentState.type as States['type']];
    const baseError = { type: 'UnexpectedEvent', state: this.currentState.type, event: event.type } as const;
    if (!stateConfig) {
      this.throw({ ...baseError, reason: 'NoStateConfig' });
      return;
    }
    if (!stateConfig.on) {
      this.throw({ ...baseError, reason: 'NoOnConfig' });
      return;
    }
    const handler = stateConfig.on[event.type as Events['type']];
    if (!handler) {
      this.throw({ ...baseError, reason: 'NoOnEventConfig' });
      return;
    }
    const result = handler(event as any, this.currentState as any, this);
    if (result === null || result === CANCEL_TOKEN) {
      // do nothing
      this.info(`Event "${event.type}" on state "${this.currentState.type}" has been ignored (transition returned null or CANCEL_TOKEN)`);
      return;
    }

    this.setState(result);
  };

  /**
   * Go directly to a state
   */
  readonly shortcut = (state: States) => {
    if (this.destroyed) {
      this.throw({ type: 'MachineDestroyed', action: 'shortcut' });
      return;
    }
    const stateConfig = this.config[this.currentState.type as States['type']];
    const base = { type: 'UnexpectedShortcut', fromState: this.currentState.type, toState: state.type } as const;
    if (!stateConfig) {
      this.throw({ ...base, reason: 'NoStateConfig' });
      return;
    }
    if (!stateConfig.shortcuts || stateConfig.shortcuts.length === 0) {
      this.throw({ ...base, reason: 'NoShortcutsConfig' });
      return;
    }
    if (!stateConfig.shortcuts.includes(state.type)) {
      this.throw({ ...base, reason: 'ShortcutNotAllowed' });
      return;
    }
    this.setState(state);
  };

  readonly destroy = () => {
    if (this.destroyed) {
      this.throw({ type: 'MachineDestroyed', action: 'destroy' });
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

  /**
   * Throw if strict, warn otherwise
   */
  private throw(details: StateMachineErrorDetails) {
    if (this.strict) {
      throw new StateMachineError(details);
    }
    this.warn(StateMachineError.detailsToErrorMessage(details, 'warn'));
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

export type StateMachineErrorDetails =
  | {
      type: 'UnexpectedEvent';
      state: string;
      event: string;
      reason: 'NoStateConfig' | 'NoOnConfig' | 'NoOnEventConfig';
    }
  | {
      type: 'UnexpectedShortcut';
      fromState: string;
      toState: string;
      reason: 'NoStateConfig' | 'NoShortcutsConfig' | 'ShortcutNotAllowed';
    }
  | {
      type: 'MachineDestroyed';
      action: 'destroy' | 'shortcut' | 'emit';
    };

export class StateMachineError extends Error {
  public static detailsToErrorMessage(details: StateMachineErrorDetails, mode: 'error' | 'warn') {
    if (details.type === 'UnexpectedEvent') {
      const base =
        mode === 'warn'
          ? `Event "${details.event}" on state "${details.state}" has been ignored`
          : `Unexpected event "${details.event}" on state "${details.state}"`;
      if (details.reason === 'NoStateConfig') {
        return `${base} (state "${details.state}" not defined in config)`;
      }
      if (details.reason === 'NoOnConfig') {
        return `${base} (no ".on" defined on state "${details.state}")`;
      }
      if (details.reason === 'NoOnEventConfig') {
        return `${base} (event not present in "${details.state}.on")`;
      }
      return base;
    }
    if (details.type === 'UnexpectedShortcut') {
      const base =
        mode === 'warn'
          ? `Shortcut from "${details.fromState}" to "${details.toState}" has been ignored`
          : `Unexpected shortcut from "${details.fromState}" to "${details.toState}"`;
      if (details.reason === 'NoStateConfig') {
        return `${base} (state "${details.fromState}" not defined in config)`;
      }
      if (details.reason === 'NoShortcutsConfig') {
        return `${base} (no ".shortcuts" defined)`;
      }
      if (details.reason === 'ShortcutNotAllowed') {
        return `${base} (state "${details.toState}" is not in "${details.fromState}.shortcuts")`;
      }
      return base;
    }
    if (details.type === 'MachineDestroyed') {
      if (mode === 'warn') {
        return `Calling .${details.action} on an already destroyed machine is a no-op`;
      }
      if (details.action === 'destroy') {
        return 'Machine has already been destroyed';
      }
      if (details.action === 'shortcut') {
        return 'Cannot call .shortcut on a destroyed machine';
      }
      if (details.action === 'emit') {
        return 'Cannot call .emit on a destroyed machine';
      }
      return 'Machine has already been destroyed';
    }
    return '[Stachine] Unknown error';
  }

  constructor(public readonly details: Readonly<StateMachineErrorDetails>) {
    super('[Stachine] ' + StateMachineError.detailsToErrorMessage(details, 'error'));
    this.name = 'StateMachineError';
    // restore prototype chain
    Object.setPrototypeOf(this, StateMachineError.prototype);
  }
}
