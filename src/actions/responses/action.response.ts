import type {
  ActionContracts,
  ActionName,
} from '#src/actions/types/action-contracts.type.js';

export class ActionResponse<Name extends ActionName> {
  constructor(
    public readonly action: Name,
    public readonly result: ActionContracts[NoInfer<Name>]['result'],
  ) {}
}
