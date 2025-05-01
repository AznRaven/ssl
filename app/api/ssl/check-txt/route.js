import dns from 'dns/promises';

export async function POST(req) {
  try {
    const { domain, expectedValue } = await req.json();
    if (!domain || !expectedValue) {
      return new Response(
        JSON.stringify({ error: 'Domain and expectedValue are required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const normalizedDomain = domain.trim().toLowerCase();
    const txtRecordName = `_acme-challenge.${normalizedDomain}`;

    console.log(`Querying TXT record for: ${txtRecordName}, expecting: ${expectedValue}`);

    // Use Google's DNS
    await dns.setServers(['8.8.8.8', '8.8.4.4']);
    let records;
    try {
      records = await dns.resolveTxt(txtRecordName);
    } catch (err) {
      console.warn(`DNS lookup failed: ${err.message}`);
      return new Response(
        JSON.stringify({
          status: 'not-found',
          message: `No TXT record found for ${txtRecordName}. Ensure the record is added and propagated.`,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const txtRecords = records.flat();
    console.log(`Found TXT records: ${JSON.stringify(txtRecords)}`);

    if (txtRecords.length === 0) {
      return new Response(
        JSON.stringify({
          status: 'not-found',
          message: `No TXT record found for ${txtRecordName}.`,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if the expected value is present
    const isMatch = txtRecords.includes(expectedValue);
    if (!isMatch) {
      return new Response(
        JSON.stringify({
          status: 'mismatch',
          message: `TXT record found for ${txtRecordName}, but value does not match. Found: ${txtRecords.join(
            ', '
          )}`,
          records: txtRecords,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        status: 'found',
        message: `TXT record found for ${txtRecordName} with matching value.`,
        records: txtRecords,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error checking TXT record:', error);
    return new Response(
      JSON.stringify({ error: `Failed to check TXT record: ${error.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}