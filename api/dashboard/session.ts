import { authorizeDashboard, isResponse } from "../_lib/dashboard/auth.js";
import { json } from "../_lib/assistant/security.js";

export async function GET(request: Request): Promise<Response> {
  const authorized = await authorizeDashboard(request, false);
  if (isResponse(authorized)) return authorized;
  const verifiedFactors = authorized.user.factors?.filter((factor) => factor.status === "verified") ?? [];
  return json({
    authenticated: true,
    profile: authorized.profile,
    mfaRequired: verifiedFactors.length > 0 && authorized.profile.aal !== "aal2",
    mfaEnrollmentRequired: verifiedFactors.length === 0,
    factorId: verifiedFactors[0]?.id,
  });
}
