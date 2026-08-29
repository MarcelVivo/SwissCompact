import { authorizeDashboard, isResponse } from "../_lib/dashboard/auth.js";
import { json } from "../_lib/assistant/security.js";

export async function GET(request: Request): Promise<Response> {
  const authorized = await authorizeDashboard(request, false);
  if (isResponse(authorized)) return authorized;
  const verifiedFactors = authorized.user.factors?.filter((factor) => factor.status === "verified") ?? [];
  const webauthnFactor = verifiedFactors.find((factor) => factor.factor_type === "webauthn");
  const totpFactor = verifiedFactors.find((factor) => factor.factor_type === "totp");
  return json({
    authenticated: true,
    profile: authorized.profile,
    mfaRequired: verifiedFactors.length > 0 && authorized.profile.aal !== "aal2",
    mfaEnrollmentRequired: verifiedFactors.length === 0,
    factorId: totpFactor?.id ?? verifiedFactors[0]?.id,
    totpFactorId: totpFactor?.id,
    webauthnFactorId: webauthnFactor?.id,
  });
}
