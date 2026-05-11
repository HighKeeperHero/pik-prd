import { IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterPushDto {
  // Expo push tokens look like "ExponentPushToken[<22-char-id>]".
  // Bounds are generous on purpose — we don't want to reject future
  // token formats. Server-side validation just guards against empty
  // and pathological values.
  @IsString()
  @MinLength(10)
  @MaxLength(256)
  token!: string;
}
