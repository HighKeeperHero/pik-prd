import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class RegisterOptionsDto {
  @IsString()
  @IsNotEmpty()
  hero_name: string;

  @IsString()
  @IsOptional()
  fate_alignment?: string;

  @IsString()
  @IsOptional()
  origin?: string;

  @IsString()
  @IsOptional()
  enrolled_by?: string;

  @IsString()
  @IsOptional()
  source_id?: string;
}

export class RegisterVerifyDto {
  @IsObject()
  @IsNotEmpty()
  attestation: Record<string, unknown>;

  @IsString()
  @IsOptional()
  friendly_name?: string;
}
