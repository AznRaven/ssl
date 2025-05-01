import dns from 'dns/promises';

export async function POST(req) {
  try {
    const { domain } = await req.json();
    if (!domain) {
      return new Response(JSON.stringify({ error: 'Domain is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const normalizedDomain = domain.trim().toLowerCase();
    const txtRecordName = `_acme-challenge.${normalizedDomain}`;

    console.log(`Querying TXT record for: ${txtRecordName}`);

    // Perform DNS lookup for TXT records
    let records;
    try {
      records = await dns.resolveTxt(txtRecordName);
    } catch (err) {
      console.warn(`DNS lookup failed: ${err.message}`);
      return new Response(
        JSON.stringify({ status: 'not-found', message: `No TXT record found for ${txtRecordName}. Ensure the record is added and propagated.` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Flatten records (resolveTxt returns an array of arrays)
    const txtRecords = records.flat();
    console.log(`Found TXT records: ${JSON.stringify(txtRecords)}`);

    if (txtRecords.length === 0) {
      return new Response(
        JSON.stringify({ status: 'not-found', message: `No TXT record found for ${txtRecordName}.` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Return the first TXT record (you can modify to check specific values if needed)
    return new Response(
      JSON.stringify({
        status: 'found',
        message: `TXT record found for ${txtRecordName}.`,
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