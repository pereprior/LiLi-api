import { IsUUID } from 'class-validator';

export class ParamUuidDto {
  @IsUUID()
  readonly uuid!: string;
}
