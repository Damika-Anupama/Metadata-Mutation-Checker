import { ImageResponse } from "next/og";

export const alt = "Document Metadata Mutation Checker — analyze PDF metadata for tampering signals";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Branded social-share card rendered at build time. Kept dependency-free (no
// external fonts/assets) so it builds reliably anywhere.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #4338ca 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "76px",
              height: "76px",
              borderRadius: "20px",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.25)",
            }}
          >
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
              <path d="M12 3.25 5.75 5.6v5.25c0 4.1 2.62 7.72 6.25 9.05 3.63-1.33 6.25-4.95 6.25-9.05V5.6L12 3.25Z" stroke="#c7d2fe" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m9.25 12.1 1.75 1.75 3.9-4.15" stroke="#c7d2fe" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ fontSize: "30px", fontWeight: 600, color: "#c7d2fe" }}>
            Metadata Mutation Checker
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <span style={{ fontSize: "72px", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
            Spot tampered documents
            <br />
            from their metadata.
          </span>
          <span style={{ fontSize: "30px", color: "#a5b4fc", maxWidth: "900px" }}>
            Upload a PDF and get a risk score, ranked findings, and a side-by-side
            metadata comparison — instantly.
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {["Next.js", "TypeScript", "Tailwind CSS", "FastAPI"].map((tag) => (
            <span
              key={tag}
              style={{
                display: "flex",
                fontSize: "24px",
                fontWeight: 600,
                color: "#e0e7ff",
                padding: "10px 22px",
                borderRadius: "9999px",
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
