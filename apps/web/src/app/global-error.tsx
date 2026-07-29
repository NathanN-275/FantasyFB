"use client";

export default function GlobalError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="research-shell">
          <section className="workspace-section" aria-labelledby="global-error-heading">
            <p className="section-kicker">Request interrupted</p>
            <h1 id="global-error-heading">FantasyFB could not finish that request.</h1>
            <p>
              No private details are shown here. Try the request again; if the problem continues,
              use the server correlation ID from the response headers when reviewing logs.
            </p>
            <button type="button" onClick={reset}>
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
