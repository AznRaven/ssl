'use client';

import { useState, useEffect } from 'react';

export default function SSLForm() {
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState('');
  const [challengeType, setChallengeType] = useState('http-01');
  const [message, setMessage] = useState('');
  const [dnsRecord, setDnsRecord] = useState(null);
  const [nextStep, setNextStep] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [txtStatus, setTxtStatus] = useState(null);
  const [isCheckingTxt, setIsCheckingTxt] = useState(false);
  const [countdown, setCountdown] = useState(30); // Countdown for auto-check (30 seconds)

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setDnsRecord(null);
    setNextStep(null);
    setDownloadUrl('');
    setTxtStatus(null);
    setIsCheckingTxt(false);
    setCountdown(30);

    try {
      const response = await fetch('/api/ssl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, email, challengeType }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(`Error: ${data.error}`);
        return;
      }

      if (data.status === 'pending' && data.record) {
        setDnsRecord(data.record);
        setNextStep(data.nextStep);
        setMessage(data.message);
      } else {
        setDownloadUrl(data.downloadUrl);
        setMessage('Certificate generated successfully!');
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const checkTxtRecord = async () => {
    setIsCheckingTxt(true);
    try {
      const response = await fetch('/api/ssl/check-txt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, expectedValue: dnsRecord?.value }),
      });
      const data = await response.json();

      if (data.status === 'found') {
        setTxtStatus({
          status: 'found',
          message: data.message,
          records: data.records,
        });
      } else if (data.status === 'mismatch') {
        setTxtStatus({
          status: 'mismatch',
          message: data.message,
          records: data.records,
        });
      } else {
        setTxtStatus({ status: 'not-found', message: data.message });
      }
    } catch (error) {
      setTxtStatus({
        status: 'error',
        message: `Error checking TXT record: ${error.message}`,
      });
    } finally {
      setIsCheckingTxt(false);
      setCountdown(30); // Reset countdown after check
    }
  };

  const handleContinue = async () => {
    if (!nextStep || !nextStep.body) {
      setMessage('Error: Next step configuration is missing');
      console.error('Next step is invalid:', nextStep);
      return;
    }

    const requestBody = {
      action: nextStep.body.action,
      orderUrl: nextStep.body.orderUrl,
      challengeUrl: nextStep.body.challengeUrl,
      domain,
      email,
    };

    console.log('Sending continue request with body:', requestBody);

    try {
      const response = await fetch('/api/ssl/continue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(`Error: ${data.error}`);
        return;
      }

      setDnsRecord(null);
      setNextStep(null);
      setTxtStatus(null);
      setDownloadUrl(data.downloadUrl);
      setMessage('Certificate generated successfully!');
    } catch (error) {
      setMessage(`Error: ${error.message}`);
      console.error('Continue request failed:', error);
    }
  };

  // Auto-check TXT record and manage countdown
  useEffect(() => {
    if (!dnsRecord) return;

    // Auto-check every 30 seconds
    const checkInterval = setInterval(() => {
      checkTxtRecord();
    }, 30000);

    // Countdown timer (updates every second)
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return 30; // Reset to 30 when reaching 0
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(checkInterval);
      clearInterval(countdownInterval);
    };
  }, [dnsRecord]);

  // Auto-continue when TXT record matches
  useEffect(() => {
    if (txtStatus?.status === 'found') {
      handleContinue();
    }
  }, [txtStatus]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-xl w-full">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Generate SSL Certificate</h1>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 font-medium mb-2">
              Domain
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="mt-1 w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., example.com"
                required
              />
            </label>
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 font-medium mb-2">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., example@gmail.com"
                required
              />
            </label>
          </div>
          <div className="mb-6">
            <span className="block text-gray-700 font-medium mb-2">Challenge Type</span>
            <div className="flex flex-col space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="challengeType"
                  value="http-01"
                  checked={challengeType === 'http-01'}
                  onChange={(e) => setChallengeType(e.target.value)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <span className="ml-2 text-gray-700">
                  HTTP-01 (requires DNS pointing to this server)
                </span>
              </label>
              <div className="text-center text-red-400">
                <p>TYPE: CNAME</p>
                <p>TARGET: cname.vercel-dns.com</p>
              </div>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="challengeType"
                  value="dns-01"
                  checked={challengeType === 'dns-01'}
                  onChange={(e) => setChallengeType(e.target.value)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <span className="ml-2 text-gray-700">DNS-01 (requires TXT record)</span>
              </label>
            </div>
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-medium py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
          >
            Generate Certificate
          </button>
        </form>

        {message && (
          <div
            className={`mt-6 p-4 rounded-md ${
              message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}
          >
            <p>{message}</p>
            {dnsRecord && (
              <div className="mt-4">
                <h3 className="text-lg font-medium">DNS Record Details:</h3>
                <p className="mt-2">
                  <strong>Name:</strong> {dnsRecord.name}
                </p>
                <p>
                  <strong>Type:</strong> {dnsRecord.type}
                </p>
                <p>
                  <strong>Value:</strong> {dnsRecord.value}
                </p>
                <p className="mt-2">
                  After adding the TXT record, wait for DNS propagation (up to 5 minutes). We are
                  checking automatically.
                </p>
                {dnsRecord && (
                  <p className="mt-2 font-medium">
                    Please wait while we check for the TXT record match. Next check in {countdown}{' '}
                    seconds...
                  </p>
                )}
                <button
                  onClick={checkTxtRecord}
                  disabled={isCheckingTxt}
                  className={`mt-4 bg-gray-600 text-white font-medium py-2 px-4 rounded-md hover:bg-gray-700 transition-colors ${
                    isCheckingTxt ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isCheckingTxt ? 'Checking...' : 'Check TXT Record Now'}
                </button>
                {txtStatus && (
                  <div className="mt-4">
                    <p
                      className={
                        txtStatus.status === 'found'
                          ? 'text-green-700'
                          : txtStatus.status === 'mismatch'
                          ? 'text-yellow-700'
                          : txtStatus.status === 'not-found'
                          ? 'text-yellow-700'
                          : 'text-red-700'
                      }
                    >
                      <strong>Status:</strong> {txtStatus.message}
                    </p>
                    {txtStatus.records && (
                      <p>
                        <strong>Records:</strong> {txtStatus.records.join(', ')}
                      </p>
                    )}
                  </div>
                )}
                <button
                  onClick={handleContinue}
                  disabled={txtStatus?.status !== 'found'}
                  className={`mt-4 bg-blue-600 text-white font-medium py-2 px-4 rounded-md hover:bg-blue-700 transition-colors ${
                    txtStatus?.status !== 'found' ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  Continue
                </button>
              </div>
            )}
            {downloadUrl && (
              <div className="mt-4">
                <p>
                  Download your certificate:{' '}
                  <a
                    href={downloadUrl}
                    download
                    className="text-blue-600 underline hover:text-blue-800"
                  >
                    {downloadUrl}
                  </a>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}