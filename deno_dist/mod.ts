import { Subscription, SubscribeMethod } from 'https://raw.githubusercontent.com/etienne-dldc/suub/v3.2.1/deno_dist/mod.ts';

export const CANCEL_TOKEN = Symbol.for('STACHINE_CANCEL_TOKEN');

export type TransitionReason<States extends UnionBase, Events extends UnionBase> =
  | { type: 'Shortcut'; state: States }
  | { type: 'Event'; event: Events; state: States };

export type EffectCleanupReason<States extends UnionBase, Events extends UnionBase, Commands extends UnionBase> =
  | TransitionReason<States, Events>
  | { type: 'Command'; command: Commands }
  | { type: 'Destroy' };

// When cleanup return false or CANCEL_TOKEN,
// we cancel the thing that triggered the cleanup
export type EffectCleanup<States extends UnionBase, Events extends UnionBase, Commands extends UnionBase> = (
  reason: EffectCleanupReason<States, Events, Commands>
) => void | boolean | typeof CANCEL_TOKEN;

export type CommandCleanupReason<States extends UnionBase, Events extends UnionBase> =
  | { type: 'StopCalled' }
  | { type: 'Destroy' }
  | TransitionReason<States, Events>;

export type CommandCleanup<States extends UnionBase, Events extends UnionBase> = (reason: CommandCleanupReason<States, Events>) => void;

export type StateMachineInfosDetails =
  | {
      type: 'StateTransitionRefusedByEffect';
      fromState: UnionBase;
      toState: UnionBase;
      transitionReason: TransitionReason<UnionBase, UnionBase>;
    }
  | { type: 'EventIgnored'; event: UnionBase; state: UnionBase };

export type Action = 'destroy' | 'shortcut' | 'event' | 'command' | 'map' | 'mapAll' | 'mapExec' | 'mapExecAll';

export type StateMachineErrorDetails =
  | {
      type: 'UnexpectedEvent';
      state: UnionBase;
      event: UnionBase;
      reason: 'NoStateConfig' | 'NoEventsConfig' | 'NoEventConfig';
    }
  | {
      type: 'UnexpectedCommand';
      state: UnionBase;
      command: UnionBase;
      reason: 'NoStateConfig' | 'NoCommandsConfig' | 'CommandNotAllowed';
    }
  | {
      type: 'UnexpectedShortcut';
      fromState: UnionBase;
      toState: UnionBase;
      reason: 'NoStateConfig' | 'NoShortcutsConfig' | 'ShortcutNotAllowed';
    }
  | { type: 'MachineDestroyed'; action: Action }
  | { type: 'EffectDestroyRefused'; state: UnionBase }
  | { type: 'GlobalEffectDestroyRefused' }
  | { type: 'StopCalledBeforeReturn'; command: UnionBase }
  | { type: 'StopCalledOnNoCleanupCommand'; command: UnionBase };

export type UnionBase = { type: string };

export type StateResult<States extends UnionBase> = States | null | typeof CANCEL_TOKEN;

export type GlobalEffectTools<States extends UnionBase, Events extends UnionBase, Commands extends UnionBase> = {
  event: (event: Events) => void;
  command: (command: Commands) => void;
  getState: () => States;
};

export type ConfigGlobalEffect<States extends UnionBase, Events extends UnionBase, Commands extends UnionBase> = (
  tools: GlobalEffectTools<States, Events, Commands>
) => EffectCleanup<States, Events, Commands> | void;

export type ConfigEffect<States extends UnionBase, Events extends UnionBase, Commands extends UnionBase, S extends States['type']> = (
  state: Extract<States, { type: S }>,
  machine: StateMachine<States, Events, Commands>
) => EffectCleanup<States, Events, Commands> | void;

export type EventTools<
  States extends UnionBase,
  Events extends UnionBase,
  Commands extends UnionBase,
  S extends States['type'],
  E extends Events['type']
> = { event: Extract<Events, { type: E }>; state: Extract<States, { type: S }>; machine: StateMachine<States, Events, Commands> };

export type ConfigEvent<
  States extends UnionBase,
  Events extends UnionBase,
  Commands extends UnionBase,
  S extends States['type'],
  E extends Events['type']
> = (tools: EventTools<States, Events, Commands, S, E>) => StateResult<States>;

export type ConfigEvents<States extends UnionBase, Events extends UnionBase, Commands extends UnionBase, S extends States['type']> = {
  [E in Events['type']]?: ConfigEvent<States, Events, Commands, S, E>;
};

export type CommandTools<States extends UnionBase, Events extends UnionBase, Commands extends UnionBase, C extends Commands['type']> = {
  state: States;
  command: Extract<Commands, { type: C }>;
  machine: StateMachine<States, Events, Commands>;
  stop: () => void;
};

export type ConfigCommand<States extends UnionBase, Events extends UnionBase, Commands extends UnionBase, C extends Commands['type']> = (
  tools: CommandTools<States, Events, Commands, C>
) => CommandCleanup<States, Events> | void;

export type ConfigCommands<States extends UnionBase, Events extends UnionBase, Commands extends UnionBase> = {
  [C in Commands['type']]: ConfigCommand<States, Events, Commands, C>;
};

export type StateMachineStateConfig<
  States extends UnionBase,
  Events extends UnionBase,
  Commands extends UnionBase,
  S extends States['type']
> = {
  // List of state you can shortcut to
  shortcuts?: ReadonlyArray<States['type']>;
  // State effect
  effect?: ConfigEffect<States, Events, Commands, S>;
  // Events to listen to and the resulting state
  events?: ConfigEvents<States, Events, Commands, S>;
  // Allowed commands
  commands?: ReadonlyArray<Commands['type']>;
};

export type RunningCommand<States extends UnionBase, Events extends UnionBase, Commands extends UnionBase> = {
  readonly command: Commands;
  readonly cleanup: CommandCleanup<States, Events>;
};

export type ConfigStates<States extends UnionBase, Events extends UnionBase, Commands extends UnionBase> = {
  [S in States['type']]?: StateMachineStateConfig<States, Events, Commands, S>;
};

export type StateMachineOptions<States extends UnionBase, Events extends UnionBase, Commands extends UnionBase> = {
  initialState: States;
  states: ConfigStates<States, Events, Commands>;
  commands: ConfigCommands<States, Events, Commands>;
  globalEffect?: ConfigGlobalEffect<States, Events, Commands>;
  // when strict is true
  // - the machine will throw an error if a state transition is not defined in the config
  // - the machine will throw if a machine is used after destroyed
  strict?: boolean;
  debug?: boolean;
};

export class StateMachine<States extends UnionBase, Events extends UnionBase = never, Commands extends UnionBase = never> {
  public static infoDetailsToMessage(details: StateMachineInfosDetails): string {
    if (details.type === 'EventIgnored') {
      return `Event "${details.event.type}" on state "${details.state.type}" has been ignored (transition returned null or CANCEL_TOKEN)`;
    }
    if (details.type === 'StateTransitionRefusedByEffect') {
      const base = `Effect of state "${details.fromState.type}" refused to transition to state "${details.toState.type}"`;
      if (details.transitionReason.type === 'Event') {
        return `${base} (transition caused by event "${details.transitionReason.event.type}")`;
      }
      if (details.transitionReason.type === 'Shortcut') {
        return `${base} (transition caused by shortcut)`;
      }
      return expectNever(details.transitionReason);
    }
    return expectNever(details);
  }

  public static errorDetailsToMessage(details: StateMachineErrorDetails, mode: 'error' | 'warn'): string {
    if (details.type === 'UnexpectedEvent') {
      const base =
        mode === 'warn'
          ? `Event "${details.event.type}" on state "${details.state.type}" has been ignored`
          : `Unexpected event "${details.event.type}" on state "${details.state.type}"`;
      if (details.reason === 'NoStateConfig') {
        return `${base} (state "${details.state.type}" not defined in config)`;
      }
      if (details.reason === 'NoEventsConfig') {
        return `${base} ("${details.state.type}.events" is not defined in config)`;
      }
      if (details.reason === 'NoEventConfig') {
        return `${base} ("${details.state.type}.events.${details.event.type}" is not defined in config)`;
      }
      return base;
    }
    if (details.type === 'UnexpectedShortcut') {
      const base =
        mode === 'warn'
          ? `Shortcut from "${details.fromState.type}" to "${details.toState.type}" has been ignored`
          : `Unexpected shortcut from "${details.fromState.type}" to "${details.toState.type}"`;
      if (details.reason === 'NoStateConfig') {
        return `${base} (state "${details.fromState.type}" is not defined in config)`;
      }
      if (details.reason === 'NoShortcutsConfig') {
        return `${base} ("${details.fromState.type}.shortcuts" is not defined in config)`;
      }
      if (details.reason === 'ShortcutNotAllowed') {
        return `${base} (state "${details.toState.type}" is not in "${details.fromState.type}.shortcuts")`;
      }
      return expectNever(details.reason);
    }
    if (details.type === 'MachineDestroyed') {
      if (mode === 'warn') {
        return `Calling .${details.action} on an already destroyed machine is a no-op`;
      }
      if (details.action === 'destroy') {
        return 'Machine has already been destroyed';
      }
      return `Cannot call .${details.action} on a destroyed machine`;
    }
    if (details.type === 'UnexpectedCommand') {
      const base =
        mode === 'warn'
          ? `Command "${details.command.type}" on state "${details.state.type}" has been ignored`
          : `Unexpected command "${details.command.type}" on state "${details.state.type}"`;
      if (details.reason === 'NoStateConfig') {
        return `${base} (state "${details.state.type}" is not defined in config)`;
      }
      if (details.reason === 'NoCommandsConfig') {
        return `${base} ("${details.state.type}.commands" is not defined in config)`;
      }
      if (details.reason === 'CommandNotAllowed') {
        return `${base} (command "${details.command.type}" is not in "${details.state.type}.commands")`;
      }
      return expectNever(details.reason);
    }
    if (details.type === 'EffectDestroyRefused') {
      return `The effect of state "${details.state.type}" refused to be cleaned up on Destroy`;
    }
    if (details.type === 'GlobalEffectDestroyRefused') {
      return `The global effect refused to be cleaned up on Destroy`;
    }
    if (details.type === 'StopCalledBeforeReturn') {
      return `Stop was called on command "${details.command.type}" before the command returned.`;
    }
    if (details.type === 'StopCalledOnNoCleanupCommand') {
      return `Stop was called on command "${details.command.type}" but the command did not return a cleanup function.`;
    }
    return expectNever(details);
  }

  private readonly subscription = Subscription<States>() as Subscription<States>;
  private readonly debug: boolean;
  private readonly strict: boolean;
  private readonly states: ConfigStates<States, Events, Commands>;
  private readonly commands: ConfigCommands<States, Events, Commands>;

  private globalEffectCleanup: EffectCleanup<States, Events, Commands> | null = null;
  private effectCleanup: EffectCleanup<States, Events, Commands> | null = null;
  private runningCommands: Array<RunningCommand<States, Events, Commands>> = [];

  private currentState: States;
  private destroyed = false;

  constructor(options: StateMachineOptions<States, Events, Commands>) {
    const { debug = true, strict = false, initialState, globalEffect, states, commands } = options;
    this.states = states;
    this.commands = commands;
    this.debug = debug;
    this.strict = strict;
    this.currentState = initialState;

    if (globalEffect) {
      const cleanup = globalEffect({ getState: this.getState, event: this.event, command: this.command });
      if (cleanup) {
        this.globalEffectCleanup = cleanup;
      }
    }

    this.runEffectForCurrentState();
  }

  /**
   * Get current state
   */
  readonly getState = (): Readonly<States> => this.currentState;

  /**
   * Subscribe to state changes
   */
  readonly subscribe: SubscribeMethod<Readonly<States>> = this.subscription.subscribe;

  /**
   * Dispatch an event
   * Returns true if the event produced a successfull transition
   */
  readonly event = (event: Events): boolean => {
    this.checkDestroyed('event');

    const stateConfig = this.states[this.currentState.type as States['type']];
    const baseError = { type: 'UnexpectedEvent', state: this.currentState, event } as const;
    if (!stateConfig) {
      this.warnStrict({ ...baseError, reason: 'NoStateConfig' });
      return false;
    }
    if (!stateConfig.events) {
      this.warnStrict({ ...baseError, reason: 'NoEventsConfig' });
      return false;
    }
    const eventFn = stateConfig.events[event.type as Events['type']];
    if (!eventFn) {
      this.warnStrict({ ...baseError, reason: 'NoEventConfig' });
      return false;
    }
    const state = eventFn({ event: event as any, state: this.currentState as any, machine: this });
    if (state === null || state === CANCEL_TOKEN) {
      // do nothing
      this.info({ type: 'EventIgnored', event, state: this.currentState });
      return false;
    }
    return this.tryToSetState(state, { type: 'Event', event, state });
  };

  /**
   * Start a command
   * Returns true if the command was started
   */
  readonly command = (command: Commands): (() => void) => {
    this.checkDestroyed('command');

    const stateConfig = this.states[this.currentState.type as States['type']];
    const base = { type: 'UnexpectedCommand', command, state: this.currentState } as const;

    if (!stateConfig) {
      this.warnStrict({ ...base, reason: 'NoStateConfig' });
      return () => {};
    }
    if (!stateConfig.commands) {
      this.warnStrict({ ...base, reason: 'NoCommandsConfig' });
      return () => {};
    }
    if (!stateConfig.commands.includes(command.type)) {
      this.warnStrict({ ...base, reason: 'CommandNotAllowed' });
      return () => {};
    }

    const commandFn = this.commands[command.type as Commands['type']];

    let cleanup: CommandCleanup<States, Events> | null | void = null;

    const stop = () => {
      if (cleanup === null) {
        this.throw({ type: 'StopCalledBeforeReturn', command });
      }
      if (cleanup === undefined) {
        this.throw({ type: 'StopCalledOnNoCleanupCommand', command });
      }
      // cleanup
      const runningIndex = this.runningCommands.findIndex((c) => c.cleanup === cleanup);
      if (runningIndex >= 0) {
        const running = this.runningCommands[runningIndex];
        this.runningCommands.splice(runningIndex, 1);
        running.cleanup({ type: 'StopCalled' });
      }
    };

    // run command
    cleanup = commandFn({ command: command as any, state: this.currentState as any, machine: this, stop });

    if (cleanup) {
      this.runningCommands.push({ command, cleanup });
    }
    return stop;
  };

  /**
   * Go directly to a state
   * Returns true if the state was changed
   */
  readonly shortcut = (state: States): boolean => {
    this.checkDestroyed('shortcut');
    const stateConfig = this.states[this.currentState.type as States['type']];
    const base = { type: 'UnexpectedShortcut', fromState: this.currentState, toState: state } as const;
    if (!stateConfig) {
      this.warnStrict({ ...base, reason: 'NoStateConfig' });
      return false;
    }
    if (!stateConfig.shortcuts || stateConfig.shortcuts.length === 0) {
      this.warnStrict({ ...base, reason: 'NoShortcutsConfig' });
      return false;
    }
    if (!stateConfig.shortcuts.includes(state.type)) {
      this.warnStrict({ ...base, reason: 'ShortcutNotAllowed' });
      return false;
    }
    return this.tryToSetState(state, { type: 'Shortcut', state: state });
  };

  readonly destroy = (): void => {
    this.checkDestroyed('destroy');
    const effectRes = this.tryToCleanupRunningEffect({ type: 'Destroy' });
    if (effectRes.accepted === false) {
      return this.throw({ type: 'EffectDestroyRefused', state: this.currentState });
    }
    // Stop commands
    this.runningCommands.forEach(({ cleanup }) => {
      cleanup({ type: 'Destroy' });
    });
    this.runningCommands.splice(0, this.runningCommands.length);
    if (this.globalEffectCleanup) {
      const result = this.globalEffectCleanup({ type: 'Destroy' });
      if (result === CANCEL_TOKEN || result === false) {
        return this.throw({ type: 'GlobalEffectDestroyRefused' });
      }
    }
    this.destroyed = true;
    this.subscription.unsubscribeAll();
  };

  /**
   * Map a value to some state
   */
  readonly map = <Value>(values: { [K in keyof States]?: Value }): Value | undefined => {
    this.checkDestroyed('map');
    return StateUtils.map(this.currentState, values);
  };

  /**
   * Map a value to each state
   */
  readonly mapAll = <Value>(values: { [K in keyof States]: Value }): Value => {
    this.checkDestroyed('mapAll');
    return StateUtils.mapAll(this.currentState, values);
  };

  readonly mapExec = <Value>(values: { [K in keyof States]?: (state: Extract<States, { type: K }>) => Value }): Value | undefined => {
    this.checkDestroyed('mapAll');
    return StateUtils.mapExec(this.currentState, values);
  };

  readonly mapExecAll = <Value>(values: { [K in keyof States]: (state: Extract<States, { type: K }>) => Value }): Value => {
    this.checkDestroyed('mapExecAll');
    return StateUtils.mapExecAll(this.currentState, values);
  };

  // Private methods

  private checkDestroyed(action: Action) {
    if (this.destroyed) {
      this.warnStrict({ type: 'MachineDestroyed', action });
      return;
    }
  }

  /**
   * Throw if strict, warn otherwise
   */
  private warnStrict(details: StateMachineErrorDetails) {
    if (this.strict) {
      throw new StateMachineError(details);
    }
    if (this.debug) {
      console.warn(`[Stachine] ${StateMachine.errorDetailsToMessage(details, 'warn')}`);
    }
  }

  private throw(details: StateMachineErrorDetails): never {
    throw new StateMachineError(details);
  }

  private info(details: StateMachineInfosDetails) {
    if (this.debug) {
      console.info(`[Stachine] ${StateMachine.infoDetailsToMessage(details)}`);
    }
  }

  private runEffectForCurrentState() {
    const stateConfig = this.states[this.currentState.type as States['type']];
    if (!stateConfig) {
      return;
    }
    if (!stateConfig.effect) {
      return;
    }
    const cleanup = stateConfig.effect(this.currentState as any, this);
    if (cleanup) {
      this.effectCleanup = cleanup;
    }
  }

  /**
   * Returns true if the transition was accepted
   */
  private tryToSetState(state: StateResult<States>, transitionReason: TransitionReason<States, Events>): boolean {
    // just in case...
    if (state === CANCEL_TOKEN || state === null) {
      return false;
    }
    const stateChanged = this.currentState !== state;
    if (stateChanged === false) {
      return false;
    }
    // try to cleanup running effect
    const efectRes = this.tryToCleanupRunningEffect(transitionReason);
    if (efectRes.accepted === false) {
      // Current effect refuse cleanup, stop here
      this.info({
        type: 'StateTransitionRefusedByEffect',
        fromState: this.currentState,
        toState: state,
        transitionReason,
      });
      return false;
    }
    // cleanup commands that do are not allowed in the new state
    const allowedCommands = this.states[state.type as States['type']]?.commands ?? [];
    const commandsToCleanup: Array<RunningCommand<States, Events, Commands>> = [];
    const nextRunningCommands: Array<RunningCommand<States, Events, Commands>> = [];
    this.runningCommands.forEach((running) => {
      if (allowedCommands.includes(running.command.type)) {
        nextRunningCommands.push(running);
      } else {
        commandsToCleanup.push(running);
      }
    });
    this.runningCommands = nextRunningCommands;
    commandsToCleanup.forEach(({ cleanup }) => {
      cleanup(transitionReason);
    });

    // Now we can transition state
    this.currentState = state;
    this.runEffectForCurrentState();
    this.subscription.emit(this.currentState);
    return true;
  }

  private tryToCleanupRunningEffect(reason: EffectCleanupReason<States, Events, Commands>): { accepted: boolean } {
    if (!this.effectCleanup) {
      return { accepted: true };
    }
    const result = this.effectCleanup(reason);
    if (result === CANCEL_TOKEN || result === false) {
      return { accepted: false };
    }
    // Cleanup was accepted
    this.effectCleanup = null;
    return { accepted: true };
  }
}

export class StateMachineError extends Error {
  constructor(public readonly details: Readonly<StateMachineErrorDetails>) {
    super('[Stachine] ' + StateMachine.errorDetailsToMessage(details, 'error'));
    this.name = 'StateMachineError';
    // restore prototype chain
    Object.setPrototypeOf(this, StateMachineError.prototype);
  }
}

export const StateUtils = (() => {
  /**
   * Map a value to some state
   */
  function map<States extends UnionBase, Value>(state: States, values: { [K in keyof States]?: Value }): Value | undefined {
    const val = values[state.type as keyof States];
    return val;
  }

  /**
   * Map a value to each state
   */
  function mapAll<States extends UnionBase, Value>(state: States, values: { [K in keyof States]: Value }): Value {
    const val = values[state.type as keyof States];
    return val;
  }

  function mapExec<States extends UnionBase, Value>(
    state: States,
    values: { [K in keyof States]?: (state: Extract<States, { type: K }>) => Value }
  ): Value | undefined {
    const fn = values[state.type as keyof States];
    if (!fn) {
      return undefined;
    }
    return fn(state as any);
  }

  function mapExecAll<States extends UnionBase, Value>(
    state: States,
    values: { [K in keyof States]: (state: Extract<States, { type: K }>) => Value }
  ): Value {
    const fn = values[state.type as keyof States];
    return fn(state as any);
  }

  return {
    map,
    mapAll,
    mapExec,
    mapExecAll,
  };
})();

function expectNever(val: never): never {
  throw new Error(`Unexpected value: ${val} (expecting never)`);
}

// function mapObject<Obj extends Record<string, any>, VOut>(
//   obj: Obj,
//   map: (key: keyof Obj, val: Obj[keyof Obj]) => VOut
// ): Record<keyof Obj, VOut> {
//   return Object.fromEntries(Object.entries(obj).map(([key, val]) => [key, map(key, val)])) as any;
// }
