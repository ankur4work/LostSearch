import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/admin-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · LostSearch', robots: { index: false } };

export default async function AdminPage(): Promise<JSX.Element> {
  const email = headers().get('x-admin-email');
  if (!isAdmin(email)) notFound();

  const [stores, activeCount, revSum, recentFailures] = await Promise.all([
    prisma.store.findMany({
      orderBy: { installedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        shopDomain: true,
        plan: true,
        installedAt: true,
        uninstalledAt: true,
        lastSearchSync: true,
        insufficientAov: true,
      },
    }),
    prisma.store.count({ where: { uninstalledAt: null } }),
    prisma.revenueEstimate.aggregate({ _sum: { estimateCents: true } }),
    prisma.ingestionRun.findMany({
      where: { status: 'FAILED' },
      orderBy: { finishedAt: 'desc' },
      take: 10,
      select: { id: true, storeId: true, jobType: true, errorMessage: true, finishedAt: true },
    }),
  ]);

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: '24px auto',
        padding: 24,
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#202223',
      }}
    >
      <h1 style={{ fontSize: 22 }}>Ops console</h1>
      <p style={{ color: '#6D7175', fontSize: 13 }}>
        {activeCount} active stores · total revenue surfaced:{' '}
        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
          (revSum._sum.estimateCents ?? 0) / 100,
        )}
      </p>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16 }}>Recent failed jobs</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #E1E3E5' }}>
              <th style={{ padding: '6px 8px' }}>Store</th>
              <th style={{ padding: '6px 8px' }}>Job</th>
              <th style={{ padding: '6px 8px' }}>Error</th>
              <th style={{ padding: '6px 8px' }}>At</th>
            </tr>
          </thead>
          <tbody>
            {recentFailures.map((f) => (
              <tr key={f.id} style={{ borderBottom: '1px solid #F1F2F3' }}>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{f.storeId}</td>
                <td style={{ padding: '6px 8px' }}>{f.jobType}</td>
                <td style={{ padding: '6px 8px', color: '#B42318' }}>
                  {f.errorMessage?.slice(0, 140) ?? '—'}
                </td>
                <td style={{ padding: '6px 8px' }}>{f.finishedAt?.toISOString() ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 16 }}>Stores</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #E1E3E5' }}>
              <th style={{ padding: '6px 8px' }}>Shop</th>
              <th style={{ padding: '6px 8px' }}>Plan</th>
              <th style={{ padding: '6px 8px' }}>Installed</th>
              <th style={{ padding: '6px 8px' }}>Status</th>
              <th style={{ padding: '6px 8px' }}>Last sync</th>
              <th style={{ padding: '6px 8px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid #F1F2F3' }}>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{s.shopDomain}</td>
                <td style={{ padding: '6px 8px' }}>{s.plan}</td>
                <td style={{ padding: '6px 8px' }}>{s.installedAt.toISOString().slice(0, 10)}</td>
                <td style={{ padding: '6px 8px' }}>
                  {s.uninstalledAt ? 'UNINSTALLED' : s.insufficientAov ? 'NEEDS_DATA' : 'ACTIVE'}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  {s.lastSearchSync?.toISOString().slice(0, 10) ?? '—'}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <form method="post" action={`/api/admin/reingest?storeId=${s.id}`}>
                    <button type="submit" style={{ fontSize: 12 }}>
                      Re-ingest
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 16 }}>Queues</h2>
        <p style={{ color: '#6D7175', fontSize: 13 }}>
          Embedded BullMQ Arena is available at <code>/api/admin/arena</code> — same
          <code>X-Admin-Email</code> header required.
        </p>
      </section>
    </main>
  );
}
