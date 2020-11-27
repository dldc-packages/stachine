// export type TransitionConstraint<
//   States extends UnionBase,
//   Events extends UnionBase,
//   S extends States['type'],
//   E extends Events['type']
// > = null | { state?: S; states?: ReadonlyArray<S>; event?: E; events?: ReadonlyArray<E> };

// export type TransitionHandler<States extends UnionBase, Events extends UnionBase> = (
//   event: Events,
//   state: States,
//   machine: StateMachine<States, Events>
// ) => StateResult<States>;

// export type EventsObjectHandler<
//   States extends UnionBase,
//   Events extends UnionBase,
//   S extends States['type']
// > = {
//   [E in Events['type']]?: TypedHandler<States, Events, S, E>;
// };

// export type StatesObjectHandler<
//   States extends UnionBase,
//   Events extends UnionBase,
//   E extends Events['type']
// > = {
//   [S in States['type']]?: TypedHandler<States, Events, S, E>;
// };

// export type HandleObjectByStates<States extends UnionBase, Events extends UnionBase> = {
//   [S in States['type']]?:
//     | TypedHandler<States, Events, S, Events['type']>
//     | EventsObjectHandler<States, Events, S>;
// };

// export type HandleObjectByEvent<States extends UnionBase, Events extends UnionBase> = {
//   [E in Events['type']]?:
//     | StatesObjectHandler<States, Events, E>
//     | TypedHandler<States, Events, States['type'], E>;
// };

// export type Shortcuts<States extends UnionBase> = {
//   [S in States['type']]?: ReadonlyArray<States['type']>;
// };

// export function typedTransition<States extends UnionBase, Events extends UnionBase>() {
//   return {
//     compose,
//     switchByStates,
//     switchByEvents,
//     onState,
//     onEvent,
//     on: transition,
//   };

//   function compose(
//     ...handlers: Array<TransitionHandler<States, Events>>
//   ): TransitionHandler<States, Events> {
//     return function composed(event, state, machine) {
//       for (const handler of handlers) {
//         const res = handler(event, state, machine); // handler(event, state);
//         if (res) {
//           return res;
//         }
//       }
//       return null;
//     };
//   }

//   function switchByStates(
//     obj: HandleObjectByStates<States, Events>
//   ): TransitionHandler<States, Events> {
//     return function handler(event, state, machine) {
//       const stateHandler = obj[state.type as States['type']];
//       if (!stateHandler) {
//         return null;
//       }
//       if (typeof stateHandler === 'function') {
//         return stateHandler(event as any, state as any, machine);
//       }
//       const handler = stateHandler[event.type as Events['type']];
//       if (!handler) {
//         return null;
//       }
//       return handler(event as any, state as any, machine);
//     };
//   }

//   function switchByEvents(
//     obj: HandleObjectByEvent<States, Events>
//   ): TransitionHandler<States, Events> {
//     return function handler(event, state, machine) {
//       const eventHandler = obj[event.type as Events['type']];
//       if (!eventHandler) {
//         return null;
//       }
//       if (typeof eventHandler === 'function') {
//         return eventHandler(event as any, state as any, machine);
//       }
//       const handler = eventHandler[state.type as States['type']];
//       if (!handler) {
//         return null;
//       }
//       return handler(event as any, state as any, machine);
//     };
//   }

//   function onState<S extends States['type']>(
//     state: S | ReadonlyArray<S>,
//     handler:
//       | TypedHandler<States, Events, S, Events['type']>
//       | EventsObjectHandler<States, Events, S>
//   ): TransitionHandler<States, Events> {
//     const stateArr = Array.isArray(state) ? state : [state];
//     return function result(event, state, machine) {
//       if (!stateArr.includes(state.type)) {
//         return null;
//       }
//       if (typeof handler === 'function') {
//         return handler(event as any, state as any, machine);
//       }
//       const handlerFn = handler[event.type as Events['type']];
//       if (!handlerFn) {
//         return null;
//       }
//       return handlerFn(event as any, state as any, machine);
//     };
//   }

//   function onEvent<E extends Events['type']>(
//     event: E | ReadonlyArray<E>,
//     handler:
//       | TypedHandler<States, Events, States['type'], E>
//       | StatesObjectHandler<States, Events, E>
//   ): TransitionHandler<States, Events> {
//     const eventArr = Array.isArray(event) ? event : [event];
//     return function result(event, state, machine) {
//       if (!eventArr.includes(event.type)) {
//         return null;
//       }
//       if (typeof handler === 'function') {
//         return handler(event as any, state as any, machine);
//       }
//       const handlerFn = handler[state.type as States['type']];
//       if (!handlerFn) {
//         return null;
//       }
//       return handlerFn(event as any, state as any, machine);
//     };
//   }

//   function transition<S extends States['type'], E extends Events['type']>(
//     constraint: TransitionConstraint<States, Events, S, E>,
//     handler: TypedHandler<States, Events, S, E>
//   ): TransitionHandler<States, Events> {
//     const { state, states, event, events } = constraint || {};
//     const eventArr = Array.isArray(events) ? events : event ? [event] : null;
//     const stateArr = Array.isArray(states) ? states : state ? [state] : null;
//     return function result(event, state, machine) {
//       const isEvent = eventArr === null ? true : eventArr.includes(event.type);
//       const isState = stateArr === null ? true : stateArr.includes(state.type);
//       if (!isEvent || !isState) {
//         return null;
//       }
//       return handler(event as any, state as any, machine);
//     };
//   }
// }
