import { authorizeDashboard, authorizePortal, isResponse } from "../_lib/dashboard/auth.js";
import { json } from "../_lib/assistant/security.js";

export async function GET(request: Request): Promise<Response> {
  if (new URL(request.url).searchParams.get("audience") === "portal") {
    const portal = await authorizePortal(request, false);
    if (isResponse(portal)) return portal;
    const verifiedFactors = portal.user.factors?.filter((factor) => factor.status === "verified") ?? [];
    const totpFactor = verifiedFactors.find((factor) => factor.factor_type === "totp");
    return json({
      authenticated: true,
      audience: "portal",
      profile: portal.profile,
      mfaRequired: verifiedFactors.length > 0 && portal.profile.aal !== "aal2" && !portal.profile.passkeyVerified,
      factorId: totpFactor?.id ?? verifiedFactors[0]?.id,
      totpFactorId: totpFactor?.id,
    });
  }
  const authorized = await authorizeDashboard(request, false);
  if (isResponse(authorized)) return authorized;
  const verifiedFactors = authorized.user.factors?.filter((factor) => factor.status === "verified") ?? [];
  const totpFactor = verifiedFactors.find((factor) => factor.factor_type === "totp");
  return json({
    authenticated: true,
    profile: authorized.profile,
    mfaRequired: verifiedFactors.length > 0 && authorized.profile.aal !== "aal2" && !authorized.profile.passkeyVerified,
    mfaEnrollmentRequired: verifiedFactors.length === 0,
    factorId: totpFactor?.id ?? verifiedFactors[0]?.id,
    totpFactorId: totpFactor?.id,
  });
}
