import type { TaskActionContracts } from '#src/actions/modules/tasks/types/task-action-contracts.type.js';
import type { ActionHandler } from '#src/actions/types/action-handler.type.js';
import type { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';

export type ActionContracts = TaskActionContracts;
export type ActionName = keyof ActionContracts;

export type ActionRequest<Name extends ActionName> = {
  actor: ParamUuidDto;
  action: Name;
  payload: ActionContracts[NoInfer<Name>]['payload'];
};

export type ActionHandlers = {
  [Name in ActionName]: ActionHandler<
    ActionContracts[Name]['payload'],
    ActionContracts[Name]['result']
  >;
};

export const ACTION_HANDLERS = Symbol('ACTION_HANDLERS');
