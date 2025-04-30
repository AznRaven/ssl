'use client';

import { useState } from 'react';

export default function SSLPage() {
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const response = await fetch('/api/ssl', { // Changed to /api/ssl
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, email }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to generate certificate');

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-100 flex items-center justify-center min-h-screen">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Generate SSL Certificate</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="domain" className="block text-sm font-medium text-gray-700">
              Domain (e.g., example.com)
            </label>
            <input
              type="text"
              id="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
              placeholder="example.com"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email (for Let’s Encrypt)
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
              placeholder="user@example.com"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 disabled:bg-blue-400"
          >
            {loading ? 'Generating...' : 'Generate Certificate'}
          </button>
        </form>
        {error && <p className="text-red-600 mt-4">{error}</p>}
        {result && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold">Certificate Details</h2>
            <pre className="bg-gray-100 p-4 rounded-md mt-2 overflow-auto text-sm">
              <strong>Private Key:</strong>
              <br />
              {result.privateKey}
              <br />
              <br />
              <strong>Certificate:</strong>
              <br />
              {result.certificate}
              <br />
              <br />
              <strong>Chain:</strong>
              <br />
              {result.chain}
            </pre>
            <a
              href={result.downloadUrl}
              download="certificate.zip"
              className="mt-4 inline-block bg-green-600 text-white p-2 rounded-md hover:bg-green-700"
            >
              Download Certificate
            </a>
          </div>
        )}
      </div>
    </div>
  );
}