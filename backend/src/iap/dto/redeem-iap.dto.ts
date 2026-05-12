import { IsString, MinLength, MaxLength } from 'class-validator';

export class RedeemIapDto {
  /** The full signed JWS transaction string from StoreKit 2's
   *  Transaction object (e.g. `jwsRepresentation` on iOS).
   *  Apple's payloads are typically 1-2 KB; cap generously. */
  @IsString()
  @MinLength(50)
  @MaxLength(8192)
  signedTransaction!: string;
}
