"use client";

import { useState } from "react";

type Finding = {
  title: string;
  severity: string;
  confidence: number;
  category: string;
  explanation: string;
};

type Report = {
  document_name: string;
  file_type: string;
  metadata_risk_score: number;
  metadata_risk_level: string;
  summary: string;
  extracted_metadata: Record<string, unknown>;
  findings: Finding[];
  recommended_action: string;
  disclaimer: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const REQUEST_TIMEOUT_MS = 30000;

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAnalyze = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (loading) return;

    if (!file) {
      setError("Please select a PDF file first.");
      return;
    }

    setLoading(true);
    setError("");
    setReport(null);

    const formData = new FormData();
    formData.append("file", file);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        const detail =
          typeof data === "object" && data !== null && "detail" in data
            ? String(data.detail)
            : "Failed to analyze document.";

        throw new Error(detail);
      }

      setReport(data as Report);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError(
          `The API did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds. Check that FastAPI is running at ${API_BASE_URL}.`
        );
      } else if (err instanceof TypeError) {
        setError(
          `Could not reach the API at ${API_BASE_URL}. Start the backend with "uvicorn app.main:app --reload" from the backend folder.`
        );
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const downloadJson = () => {
    if (!report) return;

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.document_name}-metadata-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getRiskClass = (level: string) => {
    if (level === "High") return "bg-red-100 text-red-700 border-red-300";
    if (level === "Medium") return "bg-yellow-100 text-yellow-700 border-yellow-300";
    return "bg-green-100 text-green-700 border-green-300";
  };

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Document Metadata Mutation Checker
          </h1>
          <p className="mt-2 text-gray-600">
            Upload a PDF file to extract metadata and identify possible metadata mutation indicators.
          </p>
        </div>

        <form
          action={`${API_BASE_URL}/analyze`}
          method="post"
          encType="multipart/form-data"
          onSubmit={handleAnalyze}
          className="rounded-xl border bg-white p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-gray-700">
            Upload PDF Document
          </label>

          <input
            type="file"
            name="file"
            accept="application/pdf"
            className="mt-3 block w-full rounded-lg border border-gray-300 p-3"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setError("");
            }}
          />

          {file && (
            <p className="mt-3 text-sm text-gray-600">
              Selected: {file.name}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 rounded-lg bg-black px-5 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Analyzing..." : "Analyze Document"}
          </button>

          {loading && (
            <p className="mt-3 text-sm text-gray-500">
              Calling {API_BASE_URL}/analyze...
            </p>
          )}

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-red-700">
              {error}
            </p>
          )}
        </form>

        {report && (
          <div className="mt-8 space-y-6">
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Analysis Report
                  </h2>
                  <p className="text-gray-600">{report.document_name}</p>
                </div>

                <button
                  onClick={downloadJson}
                  className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-100"
                >
                  Download JSON
                </button>
              </div>

              <div
                className={`mt-5 inline-block rounded-full border px-4 py-2 font-semibold ${getRiskClass(
                  report.metadata_risk_level
                )}`}
              >
                {report.metadata_risk_level} Risk - Score {report.metadata_risk_score}
              </div>

              <p className="mt-4 text-gray-700">{report.summary}</p>
              <p className="mt-2 text-sm text-gray-500">{report.disclaimer}</p>
            </div>

            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold">Extracted Metadata</h3>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {Object.entries(report.extracted_metadata).map(([key, value]) => (
                      <tr key={key} className="border-b">
                        <td className="w-1/3 py-2 font-medium text-gray-700">
                          {key}
                        </td>
                        <td className="py-2 text-gray-600">
                          {String(value ?? "N/A")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold">Findings</h3>

              {report.findings.length === 0 ? (
                <p className="mt-3 text-gray-600">
                  No suspicious metadata indicators were detected.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {report.findings.map((finding, index) => (
                    <div key={index} className="rounded-lg border p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">{finding.title}</h4>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm">
                          {finding.severity}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-gray-600">
                        Confidence: {Math.round(finding.confidence * 100)}%
                      </p>

                      <p className="mt-2 text-gray-700">
                        {finding.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold">Recommended Action</h3>
              <p className="mt-2 text-gray-700">{report.recommended_action}</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
