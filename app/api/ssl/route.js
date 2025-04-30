import acme from 'acme-client';
import fs from 'fs/promises';
import path from 'path';

const challengeDir = path.join(process.cwd(), 'public', '.well-known', 'acme-challenge');

export async function POST(req) {
  try {
    const { domain, email } = await req.json();

    if (!domain || !email) {
      return new Response(JSON.stringify({ error: 'Domain and email are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Initialize ACME client
    const client = new acme.Client({
      directoryUrl: acme.directory.letsencrypt.staging, // Use staging for testing
      accountKey: await acme.crypto.createPrivateKey(),
    });

    // Create ACME account
    await client.createAccount({
      termsOfServiceAgreed: true,
      contact: [`mailto:${email}`],
    });

    // Create certificate order
    const order = await client.createOrder({
      identifiers: [{ type: 'dns', value: domain }],
    });

    // Get authorizations (challenges)
    const authorizations = await client.getAuthorizations(order);
    const authz = authorizations[0];
    const challenge = authz.challenges.find((c) => c.type === 'http-01');

    if (!challenge) {
      throw new Error('HTTP-01 challenge not available');
    }

    // Write challenge file to public/.well-known/acme-challenge/
    const challengePath = path.join(challengeDir, challenge.token);
    await fs.mkdir(challengeDir, { recursive: true });
    await fs.writeFile(challengePath, challenge.keyAuthorization);

    // Notify Let’s Encrypt to verify
    await client.completeChallenge(challenge);
    await client.waitForValidStatus(challenge);

    // Finalize order
    const csr = await acme.crypto.createCsr({
      commonName: domain,
    });
    await client.finalizeOrder(order, csr);
    const certificate = await client.getCertificate(order);

    // Clean up challenge file
    await fs.unlink(challengePath).catch(() => {});

    // Extract certificate components
    const privateKey = csr[0].toString();
    const chain = certificate;
    const cert = certificate.split('-----END CERTIFICATE-----')[0] + '-----END CERTIFICATE-----';

    // Placeholder download URL (in production, use a signed URL or file stream)
    const downloadUrl = `/certificates/${Date.now()}.zip`;

    return new Response(
      JSON.stringify({
        privateKey,
        certificate: cert,
        chain,
        downloadUrl,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate certificate: ' + error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}