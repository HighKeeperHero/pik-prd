import { IsString, MinLength, MaxLength, IsOptional, IsIn } from 'class-validator';

export class RedeemIapDto {
  /** iOS: the StoreKit 2 signed JWS transaction. Android: the Play
   *  Billing purchase token. Both arrive in this field from the client
   *  (expo-iap exposes `purchaseToken` on both platforms). */
  @IsString()
  @MinLength(10)
  @MaxLength(8192)
  signedTransaction!: string;

  /** Platform discriminator. Absent/`ios` → Apple JWS verification;
   *  `android` → Google Play Developer API verification. */
  @IsOptional()
  @IsIn(['ios', 'android'])
  platform?: 'ios' | 'android';

  /** Required for Android (the purchase token doesn't carry the SKU).
   *  Ignored for iOS (the SKU is inside the signed transaction). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  productId?: string;
}
