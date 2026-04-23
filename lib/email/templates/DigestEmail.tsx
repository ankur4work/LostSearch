import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Link,
  Hr,
  Button,
} from '@react-email/components';
import { formatMoney } from '@/lib/money';

export interface DigestGap {
  queryNorm: string;
  estimateCents: number;
  bandLowCents: number;
  bandHighCents: number;
  type: 'TYPE_1' | 'TYPE_2' | 'TYPE_3' | 'TYPE_4';
}

export interface DigestFix {
  query: string;
  productTitle: string | null;
  estimatedImpactCents: number | null;
}

export interface DigestEmailProps {
  storeName: string;
  currency: string;
  totalImpactCents: number;
  gapsCount: number;
  topGaps: DigestGap[];
  fixesApplied: DigestFix[];
  dashboardUrl: string;
  methodologyUrl: string;
  unsubscribeUrl: string;
  companyAddress: string;
  plan: 'FREE' | 'GROWTH' | 'PRO';
}

const COLORS = {
  bg: '#F4F6F8',
  card: '#FFFFFF',
  text: '#202223',
  muted: '#6D7175',
  accent: '#008060',
  rule: '#E1E3E5',
};

const typeLabel: Record<DigestGap['type'], string> = {
  TYPE_1: 'Product gap',
  TYPE_2: 'Keyword mismatch',
  TYPE_3: 'Results shown, no click',
  TYPE_4: 'Filter gap',
};

export function DigestEmail(props: DigestEmailProps): JSX.Element {
  const topCount = props.plan === 'FREE' ? 3 : 5;
  const gaps = props.topGaps.slice(0, topCount);

  return (
    <Html>
      <Head />
      <Preview>
        {`${props.storeName}: ${props.gapsCount} new search gaps worth about ${formatMoney(
          props.totalImpactCents,
          props.currency,
        )}/month`}
      </Preview>
      <Body style={{ backgroundColor: COLORS.bg, fontFamily: 'Inter, -apple-system, Segoe UI, Helvetica, Arial, sans-serif', margin: 0 }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>
          <Section style={{ backgroundColor: COLORS.card, borderRadius: 8, padding: 24 }}>
            <Heading as="h1" style={{ fontSize: 22, color: COLORS.text, margin: '0 0 8px 0' }}>
              {props.storeName}: search this week
            </Heading>
            <Text style={{ color: COLORS.muted, fontSize: 14, margin: '0 0 16px 0' }}>
              {props.gapsCount} classified gaps · last 7 days
            </Text>

            <Section style={{ borderRadius: 6, backgroundColor: '#F7F9FA', padding: 16 }}>
              <Text style={{ color: COLORS.muted, fontSize: 12, margin: '0 0 4px 0' }}>
                Estimated monthly revenue left on the table
              </Text>
              <Heading as="h2" style={{ fontSize: 32, color: COLORS.text, margin: 0 }}>
                {formatMoney(props.totalImpactCents, props.currency)}
              </Heading>
            </Section>

            <Hr style={{ borderColor: COLORS.rule, margin: '20px 0' }} />

            <Heading as="h3" style={{ fontSize: 16, color: COLORS.text, margin: '0 0 12px 0' }}>
              Top gaps
            </Heading>
            {gaps.length === 0 && (
              <Text style={{ color: COLORS.muted, fontSize: 13 }}>
                No high-confidence gaps this week. We'll keep watching.
              </Text>
            )}
            {gaps.map((g) => (
              <Section key={g.queryNorm} style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 14, color: COLORS.text, margin: 0 }}>
                  <strong>{g.queryNorm}</strong>{' '}
                  <span style={{ color: COLORS.muted, fontSize: 12 }}>· {typeLabel[g.type]}</span>
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.accent, margin: '2px 0 0 0' }}>
                  ~{formatMoney(g.estimateCents, props.currency)}/mo ·{' '}
                  <span style={{ color: COLORS.muted }}>
                    ({formatMoney(g.bandLowCents, props.currency)} – {formatMoney(g.bandHighCents, props.currency)})
                  </span>
                </Text>
              </Section>
            ))}

            {props.fixesApplied.length > 0 && (
              <>
                <Hr style={{ borderColor: COLORS.rule, margin: '20px 0' }} />
                <Heading as="h3" style={{ fontSize: 16, color: COLORS.text, margin: '0 0 12px 0' }}>
                  Fixes you made this week
                </Heading>
                {props.fixesApplied.slice(0, 5).map((f, i) => (
                  <Text key={i} style={{ fontSize: 13, color: COLORS.text, margin: '0 0 4px 0' }}>
                    ✓ "{f.query}" → <em>{f.productTitle ?? 'matched product'}</em>
                    {f.estimatedImpactCents != null && (
                      <span style={{ color: COLORS.muted }}>
                        {' '}
                        · ~{formatMoney(f.estimatedImpactCents, props.currency)}/mo expected
                      </span>
                    )}
                  </Text>
                ))}
              </>
            )}

            <Section style={{ textAlign: 'center', margin: '28px 0 8px 0' }}>
              <Button
                href={props.dashboardUrl}
                style={{
                  backgroundColor: COLORS.accent,
                  color: '#FFFFFF',
                  padding: '12px 22px',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Open dashboard
              </Button>
            </Section>

            <Text style={{ color: COLORS.muted, fontSize: 12, margin: '20px 0 0 0', textAlign: 'center' }}>
              <Link href={props.methodologyUrl} style={{ color: COLORS.muted }}>
                How we compute this
              </Link>
              {' · '}
              <Link href={props.unsubscribeUrl} style={{ color: COLORS.muted }}>
                Unsubscribe
              </Link>
            </Text>
            <Text style={{ color: COLORS.muted, fontSize: 11, margin: '6px 0 0 0', textAlign: 'center' }}>
              {props.companyAddress}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
