"use client";

import { useState } from "react";

export default function SSLForm() {
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [challengeType, setChallengeType] = useState("http-01");
  const [message, setMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setDownloadUrl("");

    try {
      const response = await fetch("/api/ssl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, email, challengeType }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(`Error: ${data.error}`);
        return;
      }

      setDownloadUrl(data.downloadUrl);
      setMessage("Certificate generated successfully!");
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-xl w-full">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          Generate SSL Certificate
        </h1>
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
          <div className="mb-6 text-black">
            <label className="block text-gray-700 font-medium mb-2">
              Challenge Type
              <select
                value={challengeType}
                onChange={(e) => setChallengeType(e.target.value)}
                className="mt-1 w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="http-01">HTTP-01</option>
              </select>
            </label>
            <div className="text-center">

            <p className="text-sm text-gray-600 mt-2">
              HTTP-01 requires your domain to point to this server.
            </p>
            <p>Type: CNAME</p>
            <p>Target: cname.vercel-dns.com</p>
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
              message.includes("Error")
                ? "bg-red-100 text-red-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            <p>{message}</p>
            {downloadUrl && (
              <p className="mt-2">
                Download your certificate:{" "}
                <a
                  href={downloadUrl}
                  download
                  className="text-blue-600 underline hover:text-blue-800"
                >
                  {downloadUrl}
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
