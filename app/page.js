'use client';

import { useState } from 'react';

export default function SSLForm() {
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState('');
  const [challengeType, setChallengeType] = useState('http-01');
  const [message, setMessage] = useState('');
  const [dnsRecord, setDnsRecord] = useState(null);
  const [nextStep, setNextStep] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setDnsRecord(null);
    setNextStep(null);
    setDownloadUrl('');

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

  const handleContinue = async () => {
    if (!nextStep) return;

    try {
      const response = await fetch(nextStep.url, {
        method: nextStep.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextStep.body),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(`Error: ${data.error}`);
        return;
      }

      setDnsRecord(null);
      setNextStep(null);
      setDownloadUrl(data.downloadUrl);
      setMessage('Certificate generated successfully!');
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

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
                placeholder="e.g., p.aznraven.com"
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
                placeholder="e.g., versatilias@gmail.com"
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
              <label className="flex items-center">
                <input
                  type="radio"
                  name="challengeType"
                  value="dns-01"
                  checked={challengeType === 'dns-01'}
                  onChange={(e) => setChallengeType(e.target.value)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <span className="ml-2 text-gray-700">
                  DNS-01 (requires TXT record)
                </span>
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
                  After adding the TXT record, wait for DNS propagation (up to 5 minutes), then click below.
                </p>
                <button
                  onClick={handleContinue}
                  className="mt-4 bg-blue-600 text-white font-medium py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
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