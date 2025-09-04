import { authenticate } from '@google-cloud/local-auth';
import fs from 'fs';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/generative-language'];

async function main() {
  const auth = await authenticate({
    keyfilePath: path.join(process.cwd(), 'credentials.json'),
    scopes: SCOPES,
  });

  const token = await auth.getAccessToken();
  const fullTokens = auth.credentials; // contains access_token, expiry_date, etc.

  console.log('Access token:', token);

  // Save tokens to token.json
  fs.writeFileSync('token.json', JSON.stringify(fullTokens, null, 2));
  console.log('Saved tokens to token.json');
}

main().catch(console.error);
