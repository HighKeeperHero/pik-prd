import { IsIn, IsString } from 'class-validator';

export class SwearOathDto {
  @IsString()
  @IsIn(['forge', 'lore', 'veil'])
  option!: 'forge' | 'lore' | 'veil';
}
