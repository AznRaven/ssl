import acme from 'acme-client';
import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import crypto from 'crypto';

// Log acme-client version
console.log('acme-client version:', require('acme-client/package.json').version);

const challengeDir = path.join(process.cwd(), 'public', '.well-known', 'acme-challenge');
const certDir = path.join(process.cwd(), 'public', 'certificates');

// Helper functions
function base64url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

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

    if (!domain || !email) {
      return new Response(JSON.stringify({ error: 'Domain and email are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const normalizedDomain = domain.trim().toLowerCase();
    console.log('Received domain:', domain, 'Normalized domain:', normalizedDomain);
    const domainRegex = /^([a-z0-9-]{1,63}\.)+[a-z]{2,}$/;
    if (!domainRegex.test(normalizedDomain)) {
      console.error('Invalid domain format:', normalizedDomain);
      throw new Error('Invalid domain format');
    }

    const validChallengeTypes = ['http-01', 'dns-01'];
    const selectedChallengeType = challengeType && validChallengeTypes.includes(challengeType) ? challengeType : 'http-01';
    console.log('Selected challenge type:', selectedChallengeType);

    const accountKey = await acme.forge.createPrivateKey();
    const client = new acme.Client({
      directoryUrl: process.env.LETSENCRYPT_DIRECTORY_URL || acme.directory.letsencrypt.production,
      accountKey,
    });

    await client.createAccount({
      termsOfServiceAgreed: true,
      contact: [`mailto:${email}`],
    });

    const order = await client.createOrder({
      identifiers: [{ type: 'dns', value: normalizedDomain }],
    });

    let authorizations;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        authorizations = await client.getAuthorizations(order);
        break;
      } catch (err) {
        console.warn(`Authorization attempt ${attempt} failed: ${err.message}`);
        if (attempt === 3) throw new Error('Failed to fetch authorizations after retries');
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
    const authz = authorizations[0];
    if (!authz) {
      throw new Error('No authorization found for the domain');
    }

    const challenge = authz.challenges.find((c) => c.type === selectedChallengeType);
    if (!challenge) {
      throw new Error(
        `${selectedChallengeType} challenge not available. Available challenges: ${authz.challenges.map((c) => c.type).join(', ')}`
      );
    }

    if (selectedChallengeType === 'dns-01') {
      const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);
      console.log('DNS-01 keyAuthorization:', keyAuthorization);

      return new Response(
        JSON.stringify({
          status: 'pending',
          message: 'Please add the following TXT record to your DNS provider.',
          record: {
            name: `_acme-challenge.${normalizedDomain}`,
            type: 'TXT',
            value: keyAuthorization,
          },
          nextStep: {
            url: `/api/ssl/continue`,
            method: 'POST',
            body: { action: 'continue', orderUrl: order.url, challengeUrl: challenge.url },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      // HTTP-01 handling (unchanged, for completeness)
      const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);
      const challengePath = path.join(challengeDir, challenge.token);
      await fs.mkdir(challengeDir, { recursive: true });
      await fs.writeFile(challengePath, keyAuthorization);

      await client.completeChallenge(challenge);
      const updatedChallenge = await client.waitForValidStatus(challenge);
      if (updatedChallenge.status !== 'valid') {
        throw new Error(`Challenge validation failed: ${updatedChallenge.status}`);
      }
    }

    const csrResult = await acme.forge.createCsr({ commonName: normalizedDomain });
    const privateKeyPem = csrResult[0].toString();
    let csrPem = csrResult[1].toString();
    csrPem = validatePem(csrPem, 'CERTIFICATE REQUEST');

    await client.finalizeOrder(order, csrPem);
    const certificate = await client.getCertificate(order);

    const zip = new JSZip();
    zip.file('private.key', privateKeyPem);
    zip.file('certificate.crt', certificate.split('-----END CERTIFICATE-----')[0] + '-----END CERTIFICATE-----');
    zip.file('chain.crt', certificate);
    const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

    await fs.mkdir(certDir, { recursive: true });
    const zipPath = path.join(certDir, `${normalizedDomain}-${Date.now()}.zip`);
    await fs.writeFile(zipPath, zipContent);

    const downloadUrl = `/certificates/${path.basename(zipPath)}`;

    return new Response(
      JSON.stringify({
        privateKey: privateKeyPem,
        certificate: certificate.split('-----END CERTIFICATE-----')[0] + '-----END CERTIFICATE-----',
        chain: certificate,
        downloadUrl,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in certificate generation:', error);
    return new Response(
      JSON.stringify({ error: `Failed to generate certificate: ${error.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}