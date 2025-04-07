import { createErreurStore, type TErreurStore } from "@dldc/erreur";
import type { TActionBase, TStateBase } from "./types.ts";

export type TStachineErreurData =
  | { kind: "MaxRecursiveDispatchReached"; limit: number }
  | { kind: "UnexpectedDispatchQueue"; queue: TActionBase[] }
  | { kind: "DispatchInTransition"; action: TActionBase; state: TStateBase };

const StachineErreurInternal: TErreurStore<TStachineErreurData> =
  createErreurStore<TStachineErreurData>();

export const StachineErreur = StachineErreurInternal.asReadonly;

export function throwMaxRecursiveDispatchReached(limit: number): never {
  return StachineErreurInternal.setAndThrow(
    `The maxRecursiveDispatch limit (${limit}) has been reached, did you emit() in a callback ? If this is expected you can use the maxRecursiveDispatch option to raise the limit`,
    {
      kind: "MaxRecursiveDispatchReached",
      limit,
    },
  );
}

export function throwUnexpectedDispatchQueue(queue: TActionBase[]): never {
  return StachineErreurInternal.setAndThrow(
    `The dispatch queue is not empty after exiting dispatch loop, this is unexpected`,
    {
      kind: "UnexpectedDispatchQueue",
      queue,
    },
  );
}

export function throwDispatchInTransition(
  action: TActionBase,
  state: TStateBase,
): never {
  return StachineErreurInternal.setAndThrow(
    `Cannot dispatch in a transition (in transition ${state.state} -> ${action.action})`,
    {
      kind: "DispatchInTransition",
      action,
      state,
    },
  );
}
