import Anthropic from '@anthropic-ai/sdk';
import { ENV } from './_core/env';

export type AgentEvent =
  | { type: 'log'; icon: string; message: string }
  | { type: 'business'; business: AgentBusiness }
  | { type: 'done'; count: number }
  | { type: 'error'; message: string };

export type AgentBusiness = {
  businessName: string;
  address: string;
  phone: string;
  website: string;
  pageSpeedScore: number | null;
  contactEmail: string;
  issues: string[];
  businessContext: string;
  leadScore: number;
  googleRating: number | null;
  googleReviewCount: number | null;
};

type EmitFn = (event: AgentEvent) => void;

// Known SA directories that reliably work (URL pattern + name)
const SA_DIRECTORIES = [
  {
    name: 'Yellow Pages SA',
    buildUrl: (q: string) => `https://www.yellowpages.co.za/search/${q.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  },
  {
    name: 'BizDB SA',
    buildUrl: (q: string) => `https://www.bizdb.co.za/search/?q=${encodeURIComponent(q)}`,
  },
  {
    name: 'Cylex SA',
    buildUrl: (q: string) => `https://www.cylex.co.za/${encodeURIComponent(q.replace(/\s+/g, '-'))}.html`,
  },
];

async function enrichBusiness(
  biz: { name: string; website: string; phone: string; address: string; googleRating: number | null; googleReviewCount: number | null },
  emit: EmitFn,
  anthropic: Anthropic,
): Promise<AgentBusiness> {
  let { website, phone, address, googleRating, googleReviewCount } = biz;

  // Google Places lookup to fill gaps
  if (ENV.googlePlacesApiKey && (!website || googleRating == null)) {
    try {
      const query = [biz.name, biz.address].filter(Boolean).join(' ');
      const plRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        signal: AbortSignal.timeout(8_000),
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': ENV.googlePlacesApiKey,
          'X-Goog-FieldMask': 'places.websiteUri,places.nationalPhoneNumber,places.formattedAddress,places.rating,places.userRatingCount',
        },
        body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
        locationBias: { circle: { center: { latitude: -29.0, longitude: 25.0 }, radius: 1_500_000 } },
      }),
      });
      if (plRes.ok) {
        const plData = await plRes.json() as { places?: Array<{ websiteUri?: string; nationalPhoneNumber?: string; formattedAddress?: string; rating?: number; userRatingCount?: number }> };
        const place = plData.places?.[0];
        if (place) {
          if (place.websiteUri && !website) website = place.websiteUri;
          if (place.nationalPhoneNumber && !phone) phone = place.nationalPhoneNumber;
          if (place.formattedAddress && !address) address = place.formattedAddress;
          if (place.rating != null) googleRating = place.rating;
          if (place.userRatingCount != null) googleReviewCount = place.userRatingCount;
          if (website) emit({ type: 'log', icon: '🌐', message: `${biz.name}: found website via Google Places` });
        }
      }
    } catch { /* ignore */ }
  }

  const issues: string[] = [];
  let pageSpeedScore: number | null = null;
  let contactEmail = '';
  let businessContext = '';

  if (!website) {
    issues.push('No website');
  } else {
    // PageSpeed
    try {
      const psRes = await fetch(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(website)}&strategy=mobile`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (psRes.ok) {
        const psData = await psRes.json() as { lighthouseResult?: { categories?: { performance?: { score?: number } } } };
        const rawScore = psData.lighthouseResult?.categories?.performance?.score;
        if (typeof rawScore === 'number') {
          pageSpeedScore = Math.round(rawScore * 100);
          if (pageSpeedScore < 50) issues.push(`Score: ${pageSpeedScore}/100`);
          emit({ type: 'log', icon: pageSpeedScore < 40 ? '🔴' : pageSpeedScore < 70 ? '🟡' : '🟢', message: `${biz.name}: PageSpeed ${pageSpeedScore}/100` });
        }
      }
    } catch { /* ignore */ }

    // SSL
    try {
      const headRes = await fetch(website, { method: 'HEAD', signal: AbortSignal.timeout(5_000), redirect: 'follow' });
      if (!headRes.url.startsWith('https://')) {
        issues.push('No SSL');
        emit({ type: 'log', icon: '🔓', message: `${biz.name}: no SSL` });
      }
    } catch { /* ignore */ }

    // Firecrawl scrape
    let scrapedContent = '';
    if (ENV.firecrawlApiKey) {
      try {
        const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          signal: AbortSignal.timeout(20_000),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ENV.firecrawlApiKey}` },
          body: JSON.stringify({ url: website, formats: ['markdown'] }),
        });
        if (fcRes.ok) {
          const d = await fcRes.json() as { success?: boolean; data?: { markdown?: string } };
          if (d.success !== false) scrapedContent = d.data?.markdown ?? '';
        }
      } catch { /* ignore */ }
    }
    if (!scrapedContent) {
      try {
        const homeRes = await fetch(website, { signal: AbortSignal.timeout(5_000) });
        if (homeRes.ok) scrapedContent = await homeRes.text();
      } catch { /* ignore */ }
    }

    if (scrapedContent) {
      const emails = scrapedContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
      const filtered = emails.filter(e =>
        !e.includes('.png') && !e.includes('.jpg') && !e.includes('w3.org') && !e.includes('schema.org') && !e.includes('example.')
      );
      if (filtered.length > 0) {
        contactEmail = filtered[0];
        emit({ type: 'log', icon: '📧', message: `${biz.name}: found email ${contactEmail}` });
      }
    }

    if (scrapedContent && scrapedContent.length > 100) {
      try {
        const summary = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 150,
          messages: [{ role: 'user', content: `Summarize this business in 1-2 sentences — what they do and who they serve.\n\n${scrapedContent.slice(0, 3000)}` }],
        });
        businessContext = (summary.content[0] as { type: string; text: string }).text.trim();
      } catch { /* ignore */ }
    }
  }

  // Lead score
  let leadScore = 0;
  if (googleReviewCount) {
    if (googleReviewCount >= 200) leadScore += 30;
    else if (googleReviewCount >= 50) leadScore += 20;
    else if (googleReviewCount >= 10) leadScore += 10;
    else leadScore += 5;
  }
  if (googleRating != null) {
    if (googleRating >= 3.5 && googleRating <= 4.5) leadScore += 10;
    else if (googleRating > 4.5) leadScore += 5;
  }
  if (issues.includes('No website')) leadScore += 30;
  else {
    if (pageSpeedScore !== null && pageSpeedScore < 30) leadScore += 25;
    else if (pageSpeedScore !== null && pageSpeedScore < 50) leadScore += 10;
    if (issues.includes('No SSL')) leadScore += 15;
  }
  if (contactEmail) leadScore += 10;
  if (phone) leadScore += 5;
  if (businessContext) leadScore += 10;

  return {
    businessName: biz.name,
    address,
    phone,
    website,
    pageSpeedScore,
    contactEmail,
    issues,
    businessContext,
    leadScore,
    googleRating,
    googleReviewCount,
  };
}

export async function runOutreachAgent(criteria: string, emit: EmitFn) {
  const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });

  emit({ type: 'log', icon: '🎯', message: `Starting agent for: "${criteria}"` });

  // Deduplicated business map (key = lowercase name)
  const found = new Map<string, { name: string; website: string; phone: string; address: string; googleRating: number | null; googleReviewCount: number | null }>();

  // ── Phase 1: Google Places ───────────────────────────────────────────────────
  emit({ type: 'log', icon: '🔍', message: 'Searching Google Places...' });
  try {
    const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': ENV.googlePlacesApiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount',
      },
      body: JSON.stringify({
        textQuery: criteria,
        maxResultCount: 20,
        locationRestriction: {
          rectangle: {
            low: { latitude: -35.0, longitude: 16.0 },
            high: { latitude: -22.0, longitude: 33.0 },
          },
        },
      }),
    });
    if (placesRes.ok) {
      const data = await placesRes.json() as { places?: Array<{ displayName?: { text?: string }; formattedAddress?: string; websiteUri?: string; nationalPhoneNumber?: string; rating?: number; userRatingCount?: number }> };
      const places = data.places ?? [];
      emit({ type: 'log', icon: '📍', message: `Google Places: ${places.length} businesses found` });
      for (const p of places) {
        const name = p.displayName?.text ?? '';
        if (name) found.set(name.toLowerCase(), {
          name,
          website: p.websiteUri ?? '',
          phone: p.nationalPhoneNumber ?? '',
          address: p.formattedAddress ?? '',
          googleRating: p.rating ?? null,
          googleReviewCount: p.userRatingCount ?? null,
        });
      }
    }
  } catch (e) {
    emit({ type: 'log', icon: '⚠️', message: `Google Places error: ${String(e)}` });
  }

  // ── Phase 2: SA Directory crawls ─────────────────────────────────────────────
  emit({ type: 'log', icon: '📋', message: 'Crawling SA business directories...' });

  for (const dir of SA_DIRECTORIES) {
    const url = dir.buildUrl(criteria);
    emit({ type: 'log', icon: '🌐', message: `Trying ${dir.name}...` });

    try {
      let markdown = '';
      if (ENV.firecrawlApiKey) {
        try {
          const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            signal: AbortSignal.timeout(30_000),
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ENV.firecrawlApiKey}` },
            body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: false }),
          });
          if (fcRes.ok) {
            const d = await fcRes.json() as { success?: boolean; data?: { markdown?: string } };
            if (d.success !== false) markdown = d.data?.markdown ?? '';
          }
        } catch { /* ignore timeout */ }
      }
      if (!markdown) {
        try {
          const raw = await fetch(url, { signal: AbortSignal.timeout(10_000) });
          if (raw.ok) markdown = await raw.text();
        } catch { /* ignore */ }
      }
      if (!markdown) {
        emit({ type: 'log', icon: '❌', message: `${dir.name}: page unreachable, skipping` });
        continue;
      }

      const extraction = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Extract all business listings. Return JSON array: [{ name, website?, phone?, address? }]. JSON only, no explanation.\n\n${markdown.slice(0, 8000)}`,
        }],
      });

      const raw = (extraction.content[0] as { type: string; text: string }).text;
      const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const listings = JSON.parse(stripped) as Array<{ name: string; website?: string; phone?: string; address?: string }>;

      let added = 0;
      for (const l of listings) {
        if (!l.name) continue;
        const key = l.name.toLowerCase();
        if (!found.has(key)) {
          found.set(key, { name: l.name, website: l.website ?? '', phone: l.phone ?? '', address: l.address ?? '', googleRating: null, googleReviewCount: null });
          added++;
        }
      }
      emit({ type: 'log', icon: '📝', message: `${dir.name}: extracted ${listings.length} listings, ${added} new` });
    } catch (e) {
      emit({ type: 'log', icon: '❌', message: `${dir.name}: ${String(e)}` });
    }
  }

  const allBusinesses = Array.from(found.values());
  emit({ type: 'log', icon: '⚡', message: `Enriching ${allBusinesses.length} businesses — websites, PageSpeed, emails, lead scores...` });

  // ── Phase 3: Enrich in parallel, emit each as it completes ──────────────────
  let enrichedCount = 0;
  await Promise.all(allBusinesses.slice(0, 30).map(async (biz) => {
    emit({ type: 'log', icon: '🔎', message: `Enriching: ${biz.name}` });
    try {
      const enriched = await enrichBusiness(biz, emit, anthropic);
      emit({ type: 'business', business: enriched });
      enrichedCount++;
    } catch (e) {
      emit({ type: 'log', icon: '⚠️', message: `${biz.name}: enrichment failed — ${String(e)}` });
    }
  }));

  emit({ type: 'log', icon: '✅', message: `Done! Enriched ${enrichedCount} businesses.` });
  emit({ type: 'done', count: enrichedCount });
}
