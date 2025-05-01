import acme from 'acme-client';
import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';

const certDir = path.join(process.cwd(), 'public', 'certificates');

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
    const { action, orderUrl, challengeUrl, domain, email } = await req.json();
    if (action !== 'continue') {
      throw new Error('Invalid action');
    }
    if (!orderUrl || !challengeUrl) {
      throw new Error('orderUrl and challengeUrl are required');
    }

    const accountKey = await acme.forge.createPrivateKey();
    const client = new acme.Client({
      directoryUrl:
        process.env.LETSENCRYPT_DIRECTORY_URL ||
        acme.directory.letsencrypt.production,
      accountKey,
    });

    const order = { url: orderUrl };
    const challenge = { url: challengeUrl };

    console.log('Completing DNS-01 challenge');
    await client.completeChallenge(challenge);
    console.log('Waiting for challenge validation');
    const updatedChallenge = await client.waitForValidStatus(challenge);
    console.log('Challenge status:', updatedChallenge.status);
    if (updatedChallenge.status !== 'valid') {
      throw new Error(`Challenge validation failed: ${updatedChallenge.status}`);
    }

    console.log('Finalizing order');
    const authorizations = await client.getAuthorizations(order);
    const normalizedDomain = authorizations[0].identifier.value;
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

    console.log('Certificate generated successfully');
    return new Response(
      JSON.stringify({
        privateKey: privateKeyPem,
        certificate:
          certificate.split('-----END CERTIFICATE-----')[0] +
          '-----END CERTIFICATE-----',
        chain: certificate,
        downloadUrl,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in continuing DNS-01 validation:', error);
    return new Response(
      JSON.stringify({
        error: `Failed to continue DNS-01 validation: ${error.message}`,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}