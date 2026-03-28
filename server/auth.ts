import { GoogleAuth } from "google-auth-library";
import path from "node:path";
import fs from "node:fs";

const SCOPES = [
  "https://www.googleapis.com/auth/generative-language",
  "https://www.googleapis.com/auth/cloud-platform",
];

export async function generateAccessToken(): Promise<string | null> {
  try {
    const credsJson = process.env.GOOGLE_CREDENTIALS_JSON;
    const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    let auth: GoogleAuth;

    if (credsJson) {
      const credentials = JSON.parse(credsJson);
      auth = new GoogleAuth({ credentials, scopes: SCOPES });
    } else if (credsPath && fs.existsSync(path.resolve(credsPath))) {
      auth = new GoogleAuth({
        keyFile: path.resolve(credsPath),
        scopes: SCOPES,
      });
    } else {
      auth = new GoogleAuth({ scopes: SCOPES });
    }

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    return tokenResponse.token ?? null;
  } catch (err) {
    console.error("Error generating access token:", err);
    console.error(
      "Set GOOGLE_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS, or run: gcloud auth application-default login",
    );
    return null;
  }
}
