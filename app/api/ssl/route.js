import acme from 'acme-client';
import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import { challengeStore } from '../../../middleware.js';

const certDir = path.join(process.cwd(), 'public', 'certificates');
const challengeDir = path.join(process.cwd(), 'public', '.well-known', 'acme-challenge');

// Store challenge details in memory (for simplicity; use a DB for production)
let challengeStore = {};

function validatePem(pem, type) {
  const header = `-----BEGIN ${type}-----`;
  const footer = `-----END ${type}-----`;
  if (!pem.includes(header) || !pem.includes(footer)) {
    throw new Error(`Invalid PEM format for ${type}`);
  }
  return pem;
}

export async function POST(req) {
  try {
    const { domain, email, challengeType } = await req.json();

    if (challengeType !== 'http-01') {
      throw new Error('Only HTTP-01 challenge is supported');
    }

    if (!domain || !email) {
      throw new Error('Domain and email are required');
    }

    const accountKey = await acme.forge.createPrivateKey();
    const client = new acme.Client({
      directoryUrl:
        process.env.LETSENCRYPT_DIRECTORY_URL || acme.directory.letsencrypt.production,
      accountKey,
    });

    console.log('Creating ACME account');
    await client.createAccount({ termsOfServiceAgreed: true, contact: [`mailto:${email}`] });

    console.log('Creating order');
    const order = await client.createOrder({
      identifiers: [{ type: 'dns', value: domain }],
    });

    console.log('Fetching authorizations');
    const authorizations = await client.getAuthorizations(order);
    const authz = authorizations[0];
    const challenge = authz.challenges.find((ch) => ch.type === 'http-01');

    if (!challenge) {
      throw new Error('No HTTP-01 challenge available');
    }

    // Store challenge details
    challengeStore[challenge.token] = challenge.keyAuthorization;

    console.log('Completing HTTP-01 challenge');
    await client.completeChallenge(challenge);
    console.log('Waiting for challenge validation');
    const updatedChallenge = await client.waitForValidStatus(challenge);
    console.log('Challenge status:', updatedChallenge.status);
    if (updatedChallenge.status !== 'valid') {
      throw new Error(`Challenge validation failed: ${updatedChallenge.status}`);
    }

    console.log('Finalizing order');
    const normalizedDomain = authz.identifier.value;
    const csrResult = await acme.forge.createCsr({ commonName: normalizedDomain });
    const privateKeyPem = csrResult[0].toString();
    let csrPem = csrResult[1].toString();
    csrPem = validatePem(csrPem, 'CERTIFICATE REQUEST');

    await client.finalizeOrder(order, csrPem);
    const certificate = await client.getCertificate(order);

    const zip = new JSZip();
    zip.file('private.key', privateKeyPem);
    zip.file(
      'certificate.crt',
      certificate.split('-----END CERTIFICATE-----')[0] + '-----END CERTIFICATE-----'
    );
    zip.file('chain.crt', certificate);
    const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

    await fs.mkdir(certDir, { recursive: true });
    const zipPath = path.join(certDir, `${normalizedDomain}-${Date.now()}.zip`);
    await fs.writeFile(zipPath, zipContent);

    const downloadUrl = `/certificates/${path.basename(zipPath)}`;

    // Clear challenge store
    delete challengeStore[challenge.token];

    console.log('Certificate generated successfully');
    return new Response(
      JSON.stringify({
        privateKey: privateKeyPem,
        certificate:
          certificate.split('-----END CERTIFICATE-----')[0] + '-----END CERTIFICATE-----',
        chain: certificate,
        downloadUrl,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating certificate:', error);
    return new Response(
      JSON.stringify({ error: `Failed to generate certificate: ${error.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}