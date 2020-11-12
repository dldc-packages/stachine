import { Subscription } from 'https://raw.githubusercontent.com/etienne-dldc/suub/v3.1.1/deno_dist/mod.ts';

export type UnionBase = { type: string };
export type EffectCleanup = () => void;
export type EmitEvents<Events extends UnionBase> = (event: Events) => void;
export type Effect<Events extends UnionBase> = (emit: EmitEvents<Events>) => EffectCleanup | void;
export type RegisterEffect<Events extends UnionBase> = (effect: Effect<Events>) => void;
export type InitialStateFn<States extends UnionBase, Events extends UnionBase> = (
  effect: RegisterEffect<Events>
) => States;

export type EventHandler<
  States extends UnionBase,
  Events extends UnionBase,
  S extends States['type'],
  E extends Events['type']
> = (
  event: Extract<Events, { type: E }>,
  state: Extract<States, { type: S }>,
  effect: RegisterEffect<Events>
) => States | null;

// The most precise gets the priority
export type MachineDef<States extends UnionBase, Events extends UnionBase> = {
  onState?: {
    [S in States['type']]?:
      | ({
          [E in Events['type']]?: EventHandler<States, Events, S, E>;
        } & { any?: EventHandler<States, Events, S, Events['type']> })
      | EventHandler<States, Events, S, Events['type']>;
  };
  onEvent?: {
    [E in Events['type']]?:
      | ({
          [S in States['type']]?: EventHandler<States, Events, S, E>;
        } & { any?: EventHandler<States, Events, States['type'], E> })
      | EventHandler<States, Events, States['type'], E>;
  };
  onAny?: EventHandler<States, Events, States['type'], Events['type']>;
};
type MachineDefRootKeys = keyof MachineDef<any, any>;

export type StateMachineOptions = {
  debug?: boolean;
};

export class StateMachine<States extends UnionBase, Events extends UnionBase> {
  private readonly machineDefinition: MachineDef<States, Events>;
  private readonly subscription = Subscription<States>() as Subscription<States>;
  private readonly options: Required<StateMachineOptions>;
  private currentState!: States;
  private effectCollector: Array<() => EffectCleanup> | null = null;
  private currentEffects: Array<EffectCleanup> = [];

  constructor(
    initialState: States | InitialStateFn<States, Events>,
    machineDefinition: MachineDef<States, Events>,
    options: StateMachineOptions = {}
  ) {
    this.machineDefinition = StateMachine.checkDef(machineDefinition);
    this.options = {
      debug: false,
      ...options,
    };
    const initialStateFn = typeof initialState === 'function' ? initialState : () => initialState;
    this.runWithEffect(() => initialStateFn(this.effect));
  }

  getState = () => this.currentState;

  subscribe = this.subscription.subscribe;

  emit = (event: Events) => {
    const handler = this.resolveHandler(this.currentState.type, event.type);
    if (!handler) {
      if (this.options.debug) {
        console.info(
          `[StateMachine] Event ${event.type} on state ${this.currentState.type} has been ignored because no transition is defined`
        );
      }
      return;
    }
    const nextState = this.runWithEffect(() =>
      handler(event as any, this.currentState as any, this.effect)
    );
    if (nextState === null) {
      // do nothing
      if (this.options.debug) {
        console.info(
          `[StateMachine] Event ${event.type} on state ${this.currentState.type} has been canceled (transition returned null)`
        );
      }
      return;
    }
    this.subscription.emit(this.currentState);
  };

  private readonly effect: RegisterEffect<Events> = (effect) => {
    if (this.effectCollector === null) {
      throw new Error('Cannot register effect outside of transition');
    }
    let cleanup = false;
    this.effectCollector.push(() => {
      const emit = (event: Events) => {
        if (cleanup) {
          throw new Error(
            'Cannot emit from cleaned up effect, did you forget a cleanup function ?'
          );
        }
        this.emit(event);
      };
      const effectCleanup = effect(emit);
      return () => {
        cleanup = true;
        if (effectCleanup) {
          effectCleanup();
        }
      };
    });
  };

  private runWithEffect(exec: () => States | null): States | null {
    this.effectCollector = [];
    const nextState = exec();
    const nextEffects = this.effectCollector;
    this.effectCollector = null;
    if (nextState === null) {
      return null;
    }
    this.cleanup();
    this.currentState = nextState;
    this.runEffects(nextEffects);
    return nextState;
  }

  private cleanup() {
    this.currentEffects.forEach((cleanup) => {
      cleanup();
    });
    // ensure not called twice
    this.currentEffects = [];
  }

  private runEffects(effects: Array<() => EffectCleanup>) {
    this.currentEffects = effects.map((effect) => effect());
  }

  private resolveHandler<S extends States['type'], E extends Events['type']>(
    state: S,
    event: E
  ): EventHandler<States, Events, S, E> | null {
    const priority: Array<[MachineDefRootKeys, string?, string?]> = [
      ['onEvent', event, state],
      ['onState', state, event],
      ['onEvent', event],
      ['onState', state],
      ['onAny'],
    ];
    for (const params of priority) {
      const handler = this.resolveHandlerByPath(...params);
      if (handler) {
        return handler;
      }
    }
    return null;
  }

  private resolveHandlerByPath(
    rootKey: MachineDefRootKeys,
    ...path: [string?, string?]
  ): EventHandler<States, Events, any, any> | null {
    const p = [...path];
    let current: any = this.machineDefinition[rootKey];
    if (!current) {
      return null;
    }
    if (p.length === 0) {
      if (typeof current === 'function') {
        return current;
      }
      return null;
    }
    if (!current) {
      return null;
    }
    const firstKey = p.shift()!;
    current = current[firstKey];
    if (p.length === 0) {
      if (!current) {
        return null;
      }
      if (typeof current === 'function') {
        return current;
      }
      if (current.any) {
        return current.any;
      }
      return null;
    }
    if (!current) {
      return null;
    }
    const secondKey = p.shift()!;
    current = current[secondKey];
    if (typeof current === 'function') {
      return current;
    }
    return null;
  }

  private static checkDef<States extends UnionBase, Events extends UnionBase>(
    def: MachineDef<States, Events>
  ): MachineDef<States, Events> {
    const { onEvent, onState } = def;
    const seen: { [state: string]: Set<string> } = {};
    if (onState) {
      Object.entries(onState).forEach(([stateName, val]) => {
        if (!seen[stateName]) {
          seen[stateName] = new Set();
        }
        // states.add(stateName);
        if (val && typeof val !== 'function') {
          Object.keys(val as any).forEach((eventName) => {
            seen[stateName].add(eventName);
          });
        }
      });
    }
    if (onEvent) {
      Object.entries(onEvent).forEach(([eventName, val]) => {
        if (val && typeof val !== 'function') {
          Object.keys(val as any).forEach((stateName) => {
            if (seen[stateName] && seen[stateName].has(eventName)) {
              console.warn(
                `Duplicate handler: ${eventName}->${stateName} is already handled by ${stateName}->${eventName} !`
              );
            }
          });
        }
      });
    }
    return def;
  }
}
