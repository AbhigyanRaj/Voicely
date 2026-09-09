import fetch from 'node-fetch';
import https from 'https';
import logger from './logger.js';

const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30000 });

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/**
 * Establish who a Google access token actually belongs to.
 *
 * The client used to fetch Google's userinfo itself and POST the resulting
 * claims -- email, name, sub -- to /auth/google, which trusted them. That meant
 * a single unauthenticated request with any email in the body returned a valid
 * session for that account. Identity now comes from Google, server-side, and the
 * client's claims are ignored.
 *
 * Two calls, both required:
 *   1. tokeninfo, to confirm the token was minted for *our* OAuth client. A valid
 *      Google token issued to some other app must not be accepted here.
 *   2. userinfo, to read the verified email/sub with that token.
 *
 * @param {string} accessToken
 * @returns {Promise<{email: string, name: string, googleId: string}>}
 * @throws {Error} with a `.status` of 401 when the token is not acceptable
 */
export const verifyGoogleAccessToken = async (accessToken) => {
  const expectedClientId = process.env.GOOGLE_CLIENT_ID;
  if (!expectedClientId) {
    // Fail closed: without the client id there is no way to tell whose token
    // this is, and accepting it is what the vulnerability was.
    const err = new Error('Google sign-in is not configured on this server');
    err.status = 503;
    throw err;
  }

  const unauthorized = (reason) => {
    logger.warn(`Google token rejected: ${reason}`);
    const err = new Error('Invalid Google credentials');
    err.status = 401;
    return err;
  };

  const infoRes = await fetch(
    `${TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`,
    { agent: httpsAgent }
  );
  if (!infoRes.ok) throw unauthorized(`tokeninfo returned ${infoRes.status}`);
  const info = await infoRes.json();

  // `aud` is the client the token was issued to; `azp` is the authorized party
  // for tokens obtained through a browser flow. Either may carry our id.
  if (info.aud !== expectedClientId && info.azp !== expectedClientId) {
    throw unauthorized('token was issued to a different OAuth client');
  }
  if (info.expires_in !== undefined && Number(info.expires_in) <= 0) {
    throw unauthorized('token has expired');
  }

  const profileRes = await fetch(USERINFO_URL, {
    agent: httpsAgent,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) throw unauthorized(`userinfo returned ${profileRes.status}`);
  const profile = await profileRes.json();

  if (!profile.email) throw unauthorized('token carries no email scope');
  // Google returns this as a boolean or the string "true" depending on endpoint.
  if (profile.email_verified === false || profile.email_verified === 'false') {
    throw unauthorized('email is not verified with Google');
  }
  if (!profile.sub) throw unauthorized('token carries no subject');

  return {
    email: String(profile.email).toLowerCase(),
    name: (profile.name && String(profile.name).trim()) || 'User',
    googleId: String(profile.sub),
  };
};

export default { verifyGoogleAccessToken };
