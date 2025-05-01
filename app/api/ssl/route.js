import acme from 'acme-client';
import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import crypto from 'crypto';

// Log acme-client version for debugging
console.log('acme-client version:', require('acme-client/package.json').version);

const challengeDir = path.join(process.cwd(), 'public', '.well-known', 'acme-challenge');
const certDir = path.join(process.cwd(), 'public', 'certificates');

// Helper function to convert buffer to base64url
function base64url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Helper function to validate PEM format
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

    // Normalize and validate domain
    const normalizedDomain = domain.trim().toLowerCase();
    console.log('Received domain:', domain, 'Normalized domain:', normalizedDomain);
    const domainRegex = /^([a-z0-9-]{1,63}\.)+[a-z]{2,}$/;
    if (!domainRegex.test(normalizedDomain)) {
      console.error('Invalid domain format:', normalizedDomain);
      throw new Error('Invalid domain format');
    }

    // Validate challengeType
    const validChallengeTypes = ['http-01', 'dns-01'];
    const selectedChallengeType = challengeType && validChallengeTypes.includes(challengeType) ? challengeType : 'http-01';
    console.log('Selected challenge type:', selectedChallengeType);

    // Initialize ACME client with production API
    console.log('Initializing ACME client for:', email, 'with domain:', normalizedDomain);
    const accountKey = await acme.forge.createPrivateKey();
    console.log('Account key generated successfully');
    const client = new acme.Client({
      directoryUrl: process.env.LETSENCRYPT_DIRECTORY_URL || acme.directory.letsencrypt.production,
      accountKey,
    });

    // Create ACME account
    console.log('Creating ACME account');
    await client.createAccount({
      termsOfServiceAgreed: true,
      contact: [`mailto:${email}`],
    });

    // Create certificate order
    console.log('Creating order for domain:', normalizedDomain);
    const order = await client.createOrder({
      identifiers: [{ type: 'dns', value: normalizedDomain }],
    });

    // Get authorizations with retry
    console.log('Fetching authorizations');
    let authorizations;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        authorizations = await client.getAuthorizations(order);
        console.log('Authorizations:', JSON.stringify(authorizations, null, 2));
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

    // Find the selected challenge
    console.log('Available challenges:', JSON.stringify(authz.challenges, null, 2));
    const challenge = authz.challenges.find((c) => c.type === selectedChallengeType);
    if (!challenge) {
      throw new Error(
        `${selectedChallengeType} challenge not available. Available challenges: ${authz.challenges.map((c) => c.type).join(', ')}`
      );
    }

    // Handle the challenge
    let keyAuthorization;
    if (selectedChallengeType === 'dns-01') {
      // Compute keyAuthorization for DNS-01
      console.log('Preparing DNS-01 challenge');
      keyAuthorization = await client.getChallengeKeyAuthorization(challenge);
      console.log('DNS-01 keyAuthorization:', keyAuthorization);

      // Return TXT record details and wait for user confirmation
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
            url: `/api/ssl/continue?orderUrl=${encodeURIComponent(order.url)}&challengeUrl=${encodeURIComponent(challenge.url)}`,
            method: 'POST',
            body: { action: 'continue' },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      // HTTP-01: Generate keyAuthorization
      if (!challenge.keyAuthorization) {
        console.warn('keyAuthorization missing, computing manually');
        try {
          console.log('Using accountKey for keyAuthorization computation');
          const publicKey = crypto.createPublicKey(accountKey);
          const publicKeyJwk = publicKey.export({ format: 'jwk' });

          const jwk = {
            e: publicKeyJwk.e,
            kty: 'RSA',
            n: publicKeyJwk.n,
          };

          const jwkString = JSON.stringify(jwk, Object.keys(jwk).sort());
          const thumbprint = base64url(crypto.createHash('sha256').update(jwkString).digest());
          console.log('Computed JWK:', jwk);
          console.log('Computed thumbprint:', thumbprint);

          keyAuthorization = `${challenge.token}.${thumbprint}`;
          console.log('Manually computed keyAuthorization:', keyAuthorization);
        } catch (err) {
          console.error('Challenge details:', JSON.stringify(challenge, null, 2));
          console.error('Authorization details:', JSON.stringify(authz, null, 2));
          throw new Error(
            `Failed to compute keyAuthorization: ${err.message}. Verify DNS for ${normalizedDomain} and port 80 access.`
          );
        }
      } else {
        keyAuthorization = challenge.keyAuthorization;
        console.log('Using provided keyAuthorization:', keyAuthorization);
      }

      // Write challenge file
      const challengePath = path.join(challengeDir, challenge.token);
      console.log('Writing challenge file to:', challengePath);
      await fs.mkdir(challengeDir, { recursive: true });
      await fs.writeFile(challengePath, keyAuthorization);

      // Log challenge URL for manual verification
      const challengeUrl = `http://${normalizedDomain}/.well-known/acme-challenge/${challenge.token}`;
      console.log('Challenge file written. Verify at:', challengeUrl);

      // Test challenge accessibility
      try {
        const response = await fetch(challengeUrl, { method: 'GET' });
        if (!response.ok) {
          console.warn('Challenge file not accessible:', response.status, response.statusText);
          throw new Error(
            `Challenge file not accessible at ${challengeUrl}. Check DNS, port 80 forwarding, and firewall settings.`
          );
        }
        const content = await response.text();
        if (content !== keyAuthorization) {
          console.warn('Challenge file content mismatch:', content);
          throw new Error('Challenge file content does not match expected keyAuthorization.');
        }
        console.log('Challenge file accessible and content verified');
      } catch (err) {
        console.warn('Failed to access challenge file:', err.message);
        throw new Error(
          `Failed to verify challenge file at ${challengeUrl}: ${err.message}. Ensure port 80 is open and DNS resolves correctly.`
        );
      }

      // Notify Let’s Encrypt to verify
      console.log('Completing challenge');
      await client.completeChallenge(challenge);
      console.log('Waiting for challenge validation');
      const updatedChallenge = await client.waitForValidStatus(challenge);
      console.log('Challenge status:', updatedChallenge.status);
      if (updatedChallenge.status !== 'valid') {
        throw new Error(`Challenge validation failed: ${updatedChallenge.status}`);
      }
    }

    // Finalize order
    console.log('Finalizing order');
    const csrResult = await acme.forge.createCsr({
      commonName: normalizedDomain,
    });
    const privateKeyPem = csrResult[0].toString();
    let csrPem = csrResult[1].toString();

    // Validate CSR PEM format
    console.log('Generated CSR:', csrPem);
    console.log('Generated Private Key:', privateKeyPem);
    csrPem = validatePem(csrPem, 'CERTIFICATE REQUEST');
    console.log('Validated CSR PEM');

    await client.finalizeOrder(order, csrPem);
    const certificate = await client.getCertificate(order);

    // Clean up challenge file (for HTTP-01)
    if (selectedChallengeType === 'http-01') {
      console.log('Cleaning up challenge file');
      await fs.unlink(path.join(challengeDir, challenge.token)).catch(() => {});
    }

    // Extract certificate components
    const chain = certificate;
    const cert = certificate.split('-----END CERTIFICATE-----')[0] + '-----END CERTIFICATE-----';

    // Create ZIP file with certificates
    const zip = new JSZip();
    zip.file('private.key', privateKeyPem);
    zip.file('certificate.crt', cert);
    zip.file('chain.crt', chain);
    const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

    // Save ZIP file
    await fs.mkdir(certDir, { recursive: true });
    const zipPath = path.join(certDir, `${normalizedDomain}-${Date.now()}.zip`);
    await fs.writeFile(zipPath, zipContent);

    // Generate download URL
    const downloadUrl = `/certificates/${path.basename(zipPath)}`;

    console.log('Certificate generated successfully');
    return new Response(
      JSON.stringify({
        privateKey: privateKeyPem,
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
    console.error('Error in certificate generation:', error);
    return new Response(
      JSON.stringify({ error: `Failed to generate certificate: ${error.message}` }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// New endpoint to continue DNS-01 validation
export async function POST_continue(req) {
  try {
    const { action, orderUrl, challengeUrl } = await req.json();
    if (action !== 'continue') {
      throw new Error('Invalid action');
    }

    // Reinitialize client (stateless for Vercel)
    const accountKey = await acme.forge.createPrivateKey();
    const client = new acme.Client({
      directoryUrl: process.env.LETSENCRYPT_DIRECTORY_URL || acme.directory.letsencrypt.production,
      accountKey,
    });

    // Retrieve order and challenge
    const order = { url: orderUrl };
    const challenge = { url: challengeUrl };

    // Notify Let’s Encrypt to verify
    console.log('Completing DNS-01 challenge');
    await client.completeChallenge(challenge);
    console.log('Waiting for challenge validation');
    const updatedChallenge = await client.waitForValidStatus(challenge);
    console.log('Challenge status:', updatedChallenge.status);
    if (updatedChallenge.status !== 'valid') {
      throw new Error(`Challenge validation failed: ${updatedChallenge.status}`);
    }

    // Finalize order
    console.log('Finalizing order');
    const authorizations = await client.getAuthorizations(order);
    const normalizedDomain = authorizations[0].identifier.value;
    const csrResult = await acme.forge.createCsr({
      commonName: normalizedDomain,
    });
    const privateKeyPem = csrResult[0].toString();
    let csrPem = csrResult[1].toString();

    // Validate CSR PEM format
    console.log('Generated CSR:', csrPem);
    console.log('Generated Private Key:', privateKeyPem);
    csrPem = validatePem(csrPem, 'CERTIFICATE REQUEST');
    console.log('Validated CSR PEM');

    await client.finalizeOrder(order, csrPem);
    const certificate = await client.getCertificate(order);

    // Create ZIP file with certificates
    const zip = new JSZip();
    zip.file('private.key', privateKeyPem);
    zip.file('certificate.crt', certificate.split('-----END CERTIFICATE-----')[0] + '-----END CERTIFICATE-----');
    zip.file('chain.crt', certificate);
    const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

    // Save ZIP file
    await fs.mkdir(certDir, { recursive: true });
    const zipPath = path.join(certDir, `${normalizedDomain}-${Date.now()}.zip`);
    await fs.writeFile(zipPath, zipContent);

    // Generate download URL
    const downloadUrl = `/certificates/${path.basename(zipPath)}`;

    console.log('Certificate generated successfully');
    return new Response(
      JSON.stringify({
        privateKey: privateKeyPem,
        certificate: certificate.split('-----END CERTIFICATE-----')[0] + '-----END CERTIFICATE-----',
        chain: certificate,
        downloadUrl,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in continuing DNS-01 validation:', error);
    return new Response(
      JSON.stringify({ error: `Failed to continue DNS-01 validation: ${error.message}` }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}