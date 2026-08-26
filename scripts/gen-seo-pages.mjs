// Generates static, crawlable SEO/GEO content pages under public/<slug>/index.html
// and regenerates public/sitemap.xml.
//
// These are plain HTML files (no JavaScript needed to read them), so search
// crawlers AND AI answer engines (ChatGPT, Perplexity, Gemini, Google AI
// Overviews) can index and cite the content directly — unlike the React SPA,
// whose content only exists after JS runs. Each page targets a high-intent
// "which muscle causes <X> pain" query and links back into the app.
//
// Run: node scripts/gen-seo-pages.mjs   (also wired into `npm run build`)

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC = resolve(__dirname, '..', 'public')
const ORIGIN = 'https://zeva.health'
const APP_URL = '/?atlas=1&diagnostic=1'
const TODAY = new Date().toISOString().slice(0, 10)

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** @type {Array<{slug:string,region:string,title:string,h1:string,desc:string,intro:string,muscles:{name:string,why:string}[],faqs:{q:string,a:string}[]}>} */
const PAGES = [
  {
    slug: 'shoulder-pain',
    region: 'Shoulder',
    title: 'Which Muscle Is Causing My Shoulder Pain? | Zevahealth AI',
    h1: 'Which muscle is causing my shoulder pain?',
    desc: 'Find the muscle behind your shoulder pain — deltoid, rotator cuff, trapezius and more — then get targeted relief exercises. Free 3D muscle finder from Zevahealth AI.',
    intro:
      'Shoulder pain rarely comes from the joint alone. More often a specific muscle — strained, overworked, or holding tension — is the real source. Below are the muscles that most commonly drive shoulder pain, how each one tends to feel, and how to confirm your exact source on an interactive 3D body model.',
    muscles: [
      { name: 'Anterior deltoid', why: 'Front-of-shoulder pain that flares when you lift your arm forward or press overhead. Common in lifters and after repetitive reaching.' },
      { name: 'Supraspinatus (rotator cuff)', why: 'A deep ache on the outer/top shoulder when raising the arm to the side, often worst between 60–120°. A frequent cause of "can\'t reach overhead" pain.' },
      { name: 'Infraspinatus & teres minor', why: 'Back-of-shoulder pain and weakness when rotating the arm outward; can refer pain down the arm.' },
      { name: 'Upper trapezius', why: 'Pain across the top of the shoulder and into the neck, tied to desk posture, stress, and carrying loads.' },
      { name: 'Levator scapulae', why: 'Pain where the neck meets the shoulder blade, worse after long screen time or sleeping awkwardly.' },
      { name: 'Pectoralis minor', why: 'Front-shoulder tightness that pulls the shoulder forward; linked to rounded posture and can mimic impingement.' },
    ],
    faqs: [
      { q: 'How do I explore which shoulder muscles may contribute to pain?', a: 'Tap the sore spot on Zevahealth AI\'s interactive 3D shoulder model. It shows relative pattern matches from its reference catalogue so you can explore possible contributors. An account is required for personalized tools.' },
      { q: 'Why does my shoulder hurt when I lift my arm?', a: 'Pain on lifting the arm often points to the supraspinatus (rotator cuff) or anterior deltoid. Zevahealth AI helps you distinguish them and suggests targeted relief exercises.' },
      { q: 'When should I see a doctor for shoulder pain?', a: 'See a professional for severe, sudden, or worsening pain, pain after trauma, loss of movement, numbness, or pain that persists beyond a couple of weeks. Zevahealth AI offers general movement guidance, not medical diagnosis.' },
    ],
  },
  {
    slug: 'lower-back-pain',
    region: 'Lower back',
    title: 'Which Muscle Is Causing My Lower Back Pain? | Zevahealth AI',
    h1: 'Which muscle is causing my lower back pain?',
    desc: 'Pinpoint the muscle behind your lower back pain — erector spinae, QL, glutes, psoas — and get targeted relief exercises. Free 3D muscle finder from Zevahealth AI.',
    intro:
      'Most everyday lower back pain is muscular. A specific muscle along the spine, in the hip, or deep in the core is usually doing too much of the work. Here are the muscles that most often cause lower back pain and how to confirm yours on a 3D body model.',
    muscles: [
      { name: 'Erector spinae', why: 'The long muscles either side of the spine. A band of pain along the low back that worsens with bending, lifting, or standing too long.' },
      { name: 'Quadratus lumborum (QL)', why: 'Deep one-sided ache between the lowest rib and the pelvis, worse when standing or leaning to one side. A very common "threw my back out" culprit.' },
      { name: 'Gluteus medius', why: 'Pain across the side of the hip and low back that flares with walking, stairs, or standing on one leg.' },
      { name: 'Psoas / iliopsoas (hip flexor)', why: 'Deep front-hip and low-back tightness worse after long sitting; pulls on the lumbar spine.' },
      { name: 'Piriformis', why: 'Deep buttock pain that can refer down the leg (sciatica-like) when tight.' },
    ],
    faqs: [
      { q: 'How do I know which muscle is causing my lower back pain?', a: 'Tap the sore area on Zevahealth AI\'s 3D body model. It highlights the likely muscles — such as the erector spinae or quadratus lumborum — and helps you confirm the source, then suggests relief exercises.' },
      { q: 'Is lower back pain usually muscular?', a: 'Most acute, everyday lower back pain is muscular and improves with movement and targeted exercise. Zevahealth AI helps you identify the likely muscle so you can train it correctly.' },
      { q: 'When is lower back pain serious?', a: 'Seek care for pain after a fall, pain with fever, numbness or weakness in the legs, loss of bladder/bowel control, or pain that keeps worsening. Zevahealth AI is not a substitute for medical care.' },
    ],
  },
  {
    slug: 'neck-pain',
    region: 'Neck',
    title: 'Which Muscle Is Causing My Neck Pain? | Zevahealth AI',
    h1: 'Which muscle is causing my neck pain?',
    desc: 'Find the muscle behind your neck pain — upper trapezius, levator scapulae, SCM, scalenes — and get targeted relief exercises. Free 3D muscle finder from Zevahealth AI.',
    intro:
      'Neck pain and stiffness are usually driven by a handful of muscles that respond to posture, stress, and screen time. Here are the muscles that most commonly cause neck pain, and how to confirm your exact source on an interactive 3D model.',
    muscles: [
      { name: 'Upper trapezius', why: 'Pain and tightness across the top of the shoulders and base of the neck; classic desk-and-stress tension.' },
      { name: 'Levator scapulae', why: 'Sharp pain at the corner where the neck meets the shoulder blade; hard to turn the head, worse after sleeping badly.' },
      { name: 'Sternocleidomastoid (SCM)', why: 'Front-of-neck muscle that can refer pain into the head and behind the eye; linked to forward-head posture.' },
      { name: 'Scalenes', why: 'Side-of-neck muscles that can refer pain into the shoulder and arm.' },
      { name: 'Suboccipitals', why: 'Small muscles at the base of the skull tied to tension headaches and screen strain.' },
    ],
    faqs: [
      { q: 'How do I find which neck muscle is causing pain?', a: 'Tap the tender spot on Zevahealth AI\'s 3D neck model. It highlights likely muscles like the upper trapezius or levator scapulae and helps you confirm the source, then offers relief exercises.' },
      { q: 'Why is my neck stiff and painful after working at a desk?', a: 'Prolonged forward-head posture overloads the upper trapezius, levator scapulae, and suboccipitals. Zevahealth AI helps you target the right muscle with specific stretches and strengthening.' },
      { q: 'When should I worry about neck pain?', a: 'Seek care for neck pain after trauma, with fever or headache, or with numbness, weakness, or tingling in the arms. Zevahealth AI provides general guidance, not diagnosis.' },
    ],
  },
  {
    slug: 'knee-pain',
    region: 'Knee',
    title: 'Which Muscle Is Causing My Knee Pain? | Zevahealth AI',
    h1: 'Which muscle is causing my knee pain?',
    desc: 'Pinpoint the muscle behind your knee pain — quadriceps/VMO, IT band, hamstrings, calves — and get targeted relief exercises. Free 3D muscle finder from Zevahealth AI.',
    intro:
      'Knee pain often starts in the muscles that move and stabilise the knee — not the joint surface itself. Here are the muscles that most commonly cause knee pain and how to confirm your source on a 3D body model.',
    muscles: [
      { name: 'Quadriceps (esp. VMO)', why: 'Front-of-knee and kneecap pain, worse on stairs or squats; weak inner-quad (VMO) lets the kneecap track poorly.' },
      { name: 'IT band / tensor fasciae latae (TFL)', why: 'Sharp outer-knee pain, common in runners, that flares with repeated bending.' },
      { name: 'Hamstrings', why: 'Back-of-knee tightness and pain; tight hamstrings load the knee and limit extension.' },
      { name: 'Popliteus', why: 'Deep back-of-knee pain, especially when unlocking the knee or going downhill.' },
      { name: 'Gastrocnemius (calf)', why: 'Calf tightness that pulls behind the knee and affects how you push off.' },
    ],
    faqs: [
      { q: 'How do I know which muscle is causing my knee pain?', a: 'Tap the painful area on Zevahealth AI\'s 3D leg model. It highlights likely contributors — such as the quadriceps/VMO or IT band — and helps you confirm the source, then suggests targeted exercises.' },
      { q: 'Why does the front of my knee hurt on stairs?', a: 'Front-of-knee pain on stairs often relates to quadriceps (VMO) weakness and kneecap tracking. Zevahealth AI helps you target the right muscle to offload the knee.' },
      { q: 'When should I see a doctor for knee pain?', a: 'Seek care for knee pain after injury, with swelling, locking, giving way, or inability to bear weight. Zevahealth AI offers general movement guidance, not diagnosis.' },
    ],
  },
  {
    slug: 'hip-pain',
    region: 'Hip',
    title: 'Which Muscle Is Causing My Hip Pain? | Zevahealth AI',
    h1: 'Which muscle is causing my hip pain?',
    desc: 'Find the muscle behind your hip pain — glutes, piriformis, TFL, hip flexors, adductors — and get targeted relief exercises. Free 3D muscle finder from Zevahealth AI.',
    intro:
      'Hip pain is frequently muscular — from the glutes that stabilise the pelvis to the deep rotators and hip flexors. Here are the muscles that most commonly cause hip pain and how to confirm yours on an interactive 3D model.',
    muscles: [
      { name: 'Gluteus medius & minimus', why: 'Pain on the side of the hip, worse standing on one leg, walking, or lying on that side. A leading cause of lateral hip pain.' },
      { name: 'Piriformis', why: 'Deep buttock pain that can refer down the leg; tightens with prolonged sitting.' },
      { name: 'Tensor fasciae latae (TFL)', why: 'Front-outer hip tightness that feeds the IT band and can pinch at the hip.' },
      { name: 'Iliopsoas (hip flexor)', why: 'Deep front-hip pain and a pinch when lifting the knee or after long sitting.' },
      { name: 'Adductors (groin)', why: 'Inner-thigh and groin pain that flares with cutting, squeezing, or side movements.' },
    ],
    faqs: [
      { q: 'How do I find which hip muscle is causing pain?', a: 'Tap the sore spot on Zevahealth AI\'s 3D hip model. It highlights likely muscles like the gluteus medius or piriformis and helps you confirm the source, then offers relief exercises.' },
      { q: 'Why does the side of my hip hurt when I walk or lie on it?', a: 'Lateral hip pain with walking or side-lying often points to the gluteus medius/minimus. Zevahealth AI helps you confirm and target it with specific strengthening.' },
      { q: 'When is hip pain serious?', a: 'Seek care for hip pain after a fall, inability to bear weight, deformity, fever, or night pain that keeps worsening. Zevahealth AI is not a substitute for medical care.' },
    ],
  },
]

function faqJsonLd(page) {
  return {
    '@type': 'FAQPage',
    mainEntity: page.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

function pageHtml(page) {
  const url = `${ORIGIN}/${page.slug}/`
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'MedicalWebPage',
        '@id': `${url}#webpage`,
        url,
        name: page.h1,
        description: page.desc,
        inLanguage: 'en',
        isPartOf: { '@id': `${ORIGIN}/#website` },
        about: { '@type': 'MedicalCondition', name: `${page.region} pain` },
        lastReviewed: TODAY,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: page.h1, item: url },
        ],
      },
      faqJsonLd(page),
    ],
  }

  const muscleItems = page.muscles
    .map(
      (m) => `        <li>
          <strong>${esc(m.name)}</strong> — ${esc(m.why)}
        </li>`,
    )
    .join('\n')

  const faqItems = page.faqs
    .map(
      (f) => `      <div class="faq">
        <h3>${esc(f.q)}</h3>
        <p>${esc(f.a)}</p>
      </div>`,
    )
    .join('\n')

  const related = PAGES.filter((p) => p.slug !== page.slug)
    .map((p) => `<a href="/${p.slug}/">${esc(p.region)} pain</a>`)
    .join('\n        ')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${esc(page.desc)}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" type="image/svg+xml" href="/zevahealth-icon.svg" />
  <title>${esc(page.title)}</title>

  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Zevahealth AI" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(page.title)}" />
  <meta property="og:description" content="${esc(page.desc)}" />
  <meta property="og:image" content="${ORIGIN}/headerLogo.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(page.title)}" />
  <meta name="twitter:description" content="${esc(page.desc)}" />
  <meta name="twitter:image" content="${ORIGIN}/headerLogo.png" />

  <script type="application/ld+json">
${JSON.stringify(graph, null, 2)}
  </script>

  <style>
    :root { color-scheme: light; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Inter, system-ui, Arial, sans-serif; color: #0f172a; background: #f6f8fc; line-height: 1.65; }
    a { color: #0e7490; }
    .wrap { max-width: 760px; margin: 0 auto; padding: 24px 20px 64px; }
    header.nav { display: flex; align-items: center; gap: 12px; padding: 18px 20px; border-bottom: 1px solid rgba(15,23,42,0.08); background: #fff; }
    header.nav img { height: 36px; width: 36px; object-fit: contain; }
    header.nav .brand { font-weight: 700; }
    header.nav .tag { font-size: 12px; color: #64748b; }
    nav.crumbs { font-size: 13px; color: #64748b; margin: 20px 0 8px; }
    h1 { font-size: clamp(1.7rem, 4vw, 2.5rem); font-weight: 800; letter-spacing: -0.03em; margin: 6px 0 14px; }
    h2 { font-size: 1.35rem; font-weight: 700; margin: 32px 0 12px; }
    h3 { font-size: 1.05rem; font-weight: 700; margin: 0 0 6px; }
    p { margin: 0 0 14px; color: #334155; }
    ul.muscles { list-style: none; display: grid; gap: 12px; }
    ul.muscles li { background: #fff; border: 1px solid rgba(15,23,42,0.08); border-radius: 14px; padding: 14px 16px; }
    ul.muscles strong { color: #0f172a; }
    .cta { display: inline-block; margin: 8px 0 6px; background: linear-gradient(90deg,#f97316,#f43f5e); color: #fff; font-weight: 700; text-decoration: none; padding: 14px 26px; border-radius: 9999px; }
    .steps { counter-reset: s; list-style: none; display: grid; gap: 8px; margin: 8px 0 8px; }
    .steps li { counter-increment: s; padding-left: 34px; position: relative; color: #334155; }
    .steps li::before { content: counter(s); position: absolute; left: 0; top: 0; width: 24px; height: 24px; border-radius: 9999px; background: #0e7490; color: #fff; font-size: 13px; font-weight: 700; display: grid; place-items: center; }
    .faq { background: #fff; border: 1px solid rgba(15,23,42,0.08); border-radius: 14px; padding: 16px; margin: 0 0 12px; }
    .related { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
    .related a { background: #fff; border: 1px solid rgba(15,23,42,0.1); border-radius: 9999px; padding: 8px 14px; text-decoration: none; font-weight: 600; font-size: 14px; }
    .disc { font-size: 12px; color: #94a3b8; margin-top: 40px; border-top: 1px solid rgba(15,23,42,0.08); padding-top: 16px; }
  </style>
</head>
<body>
  <header class="nav">
    <a href="/" style="display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit;">
      <img src="/logo.png" alt="Zevahealth AI logo" />
      <span>
        <span class="brand">Zevahealth AI</span><br />
        <span class="tag">Move smarter. Feel better.</span>
      </span>
    </a>
  </header>

  <main class="wrap">
    <nav class="crumbs"><a href="/">Home</a> › ${esc(page.region)} pain</nav>
    <h1>${esc(page.h1)}</h1>
    <p>${esc(page.intro)}</p>

    <a class="cta" href="${APP_URL}">Find your muscle on the 3D model →</a>

    <h2>Muscles that commonly cause ${esc(page.region.toLowerCase())} pain</h2>
    <ul class="muscles">
${muscleItems}
    </ul>

    <h2>How to find your exact muscle</h2>
    <ol class="steps">
      <li>Open the free Zevahealth AI 3D body model.</li>
      <li>Tap the spot that feels sore.</li>
      <li>See the likely muscle contributors light up.</li>
      <li>Isolate each one to compare and confirm the real source.</li>
      <li>Get targeted relief exercises and move through them with the AI form coach.</li>
    </ol>
    <p><a class="cta" href="${APP_URL}">Open the free muscle finder →</a></p>

    <h2>Frequently asked questions</h2>
${faqItems}

    <h2>Related muscle pain guides</h2>
    <div class="related">
        ${related}
    </div>

    <p class="disc">Zevahealth AI provides suggestive, general-purpose movement guidance for everyday soreness.
    It is not medical advice and not a substitute for a qualified doctor or physical therapist.
    See a professional for severe, persistent, or worsening pain.</p>
  </main>
</body>
</html>
`
}

// Write pages
for (const page of PAGES) {
  const dir = resolve(PUBLIC, page.slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, 'index.html'), pageHtml(page), 'utf8')
  console.log('wrote', `public/${page.slug}/index.html`)
}

// Regenerate sitemap (home + all content pages)
const urls = [
  { loc: `${ORIGIN}/`, changefreq: 'weekly', priority: '1.0' },
  ...PAGES.map((p) => ({ loc: `${ORIGIN}/${p.slug}/`, changefreq: 'monthly', priority: '0.8' })),
]
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`
writeFileSync(resolve(PUBLIC, 'sitemap.xml'), sitemap, 'utf8')
console.log('wrote public/sitemap.xml with', urls.length, 'urls')
