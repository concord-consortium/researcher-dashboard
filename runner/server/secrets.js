import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

// Read at /run rather than baked into the image: a MicroVM image's environment
// variables are captured in the snapshot every VM shares, so a token placed there
// would be both shared between researchers and unrotatable.
export function makeSecretReader({ client } = {}) {
  const secrets = client ?? new SecretsManagerClient({});
  return async function readSecret(secretName) {
    const res = await secrets.send(new GetSecretValueCommand({ SecretId: secretName }));
    if (!res.SecretString) {
      throw new Error(`secret ${secretName} has no string value`);
    }
    return res.SecretString;
  };
}
