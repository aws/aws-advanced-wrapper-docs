import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import manifest from '@site/src/generated/manifest.json';

export default function Home() {
  const baseUrl = useBaseUrl('/');
  return (
    <Layout
      title="AWS Advanced Wrapper Docs"
      description="Documentation for the AWS Advanced Wrapper family"
    >
      <main className="container margin-vert--xl">
        <div className="row">
          <div className="col col--8 col--offset-2">
            <h1>AWS Advanced Wrapper Documentation</h1>
            <p>
              The <strong>AWS Advanced Wrappers</strong> are drop-in extensions
              for popular database drivers that add fast failover, IAM and AWS
              Secrets Manager authentication, Blue/Green Deployment support, and
              more — while staying thin layers over the underlying driver.
            </p>
            <p>
              Choose your wrapper to read documentation written specifically for
              it — its parameter names, units, error model, and language-specific
              guidance. You can switch wrappers at any time from the top
              navigation bar; you'll stay on the same page where an equivalent
              exists.
            </p>

            <h2>Choose your wrapper</h2>
            <div className="row">
              {manifest.wrappers.map((w) => (
                <div className="col col--6" key={w.id}>
                  <div className="card margin-vert--md">
                    <div className="card__header">
                      <h3>{w.fullLabel}</h3>
                    </div>
                    <div className="card__footer">
                      <Link
                        className="button button--primary button--block"
                        to={`${baseUrl}${w.id}/overview`.replace('//', '/')}
                      >
                        Read the {w.label} docs
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
