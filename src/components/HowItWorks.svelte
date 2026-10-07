<script lang="ts">
  import GfCalculator from './GfCalculator.svelte';
  import { tex } from '../lib/katex';
  import { maskBit, MASK_FORMULAS } from '../lib/qr/matrix';
  import { darkPath, QUIET_ZONE } from '../lib/qr/render';
  import { app } from '../lib/state.svelte';

  const sym = $derived(app.symbol);
  const TILE = 12;

  const maskTiles = Array.from({ length: 8 }, (_, m) => {
    let d = '';
    for (let i = 0; i < TILE; i++)
      for (let j = 0; j < TILE; j++) if (maskBit(m, i, j)) d += `M${j} ${i}h1v1h-1z`;
    return { m, d };
  });

  const qzPath = $derived(sym ? darkPath(sym.modules, sym.size, QUIET_ZONE) : '');
  const qzTotal = $derived(sym ? sym.size + 2 * QUIET_ZONE : 29);

  const SECTIONS = [
    { id: 'how-tool', title: 'What this is' },
    { id: 'how-gf', title: 'Arithmetic on bytes' },
    { id: 'how-rs', title: 'Reed–Solomon codes' },
    { id: 'how-decode', title: 'Decoding' },
    { id: 'how-blocks', title: 'Blocks' },
    { id: 'how-masks', title: 'Masks' },
    { id: 'how-format', title: 'Format & version' },
    { id: 'how-quiet', title: 'The quiet zone' },
    { id: 'how-validation', title: 'Validation' },
    { id: 'how-limits', title: 'Limitations' },
  ];
</script>

<section id="how" class="how" aria-labelledby="how-title">
  <div class="how-head">
    <p class="label">How it works</p>
    <h2 id="how-title">The mathematics of a scratched code</h2>
  </div>

  <div class="how-grid">
    <nav class="toc" aria-label="How it works contents">
      <ol>
        {#each SECTIONS as s, i (s.id)}
          <li>
            <a href="#{s.id}"
              ><span class="mono">{String(i + 1).padStart(2, '0')}</span> {s.title}</a
            >
          </li>
        {/each}
      </ol>
    </nav>

    <div class="body">
      <article id="how-tool" class="chapter">
        <h3><span class="cn mono">01</span> What this is</h3>
        <p>
          A <strong>working QR code encoder and decoder</strong>, written from scratch in TypeScript
          and checked against published worked examples, the specification’s tables and two
          independent QR libraries (numbers under
          <a class="link" href="#how-validation">Validation</a>). The damage you apply is simulated
          on the module grid, and the decoder reads that grid directly.
        </p>
        <p>
          It is not a camera scanner: there is no image processing, perspective correction or
          thresholding. That is why a torn finder pattern does not stop it, although it would stop a
          phone. The exported codes are real and scan with any reader.
        </p>
      </article>

      <article id="how-gf" class="chapter">
        <h3><span class="cn mono">02</span> Arithmetic on bytes: GF(256)</h3>
        <p>
          Error correction needs a number system on bytes in which you can add, subtract, multiply
          and divide without leaving the byte. Ordinary arithmetic overflows; the finite field
          <strong>GF(2<sup>8</sup>)</strong> does not. Each byte is a polynomial of degree below 8
          with bits as coefficients. Adding is <strong>XOR</strong>. Multiplying is polynomial
          multiplication, reduced modulo the field polynomial the QR standard fixes:
        </p>
        <p
          class="eq"
          use:tex={'p(x) = x^8 + x^4 + x^3 + x^2 + 1 \\quad (\\texttt{0x11D})'}
          data-display="true"
        >
          p(x) = x^8 + x^4 + x^3 + x^2 + 1 (0x11D)
        </p>
        <p>
          This polynomial is primitive: the powers of α = 2 run through all 255 non-zero bytes
          before repeating. So every non-zero byte is some α<sup>i</sup>, and multiplication becomes
          addition of exponents, done with two 256-entry tables:
        </p>
        <p
          class="eq"
          use:tex={'\\begin{gathered} a \\cdot b = \\alpha^{(\\log_\\alpha a \\, + \\, \\log_\\alpha b) \\bmod 255} \\\\ a + b = a \\oplus b \\end{gathered}'}
          data-display="true"
        >
          a · b = α^((log a + log b) mod 255), a + b = a XOR b
        </p>
        <div class="figure">
          <GfCalculator />
        </div>
      </article>

      <article id="how-rs" class="chapter">
        <h3><span class="cn mono">03</span> Reed–Solomon codes, and why t = ⌊(n − k)/2⌋</h3>
        <p>
          A block of k data codewords becomes the coefficients of a message polynomial m(x). With n
          − k check symbols, the generator polynomial has the n − k consecutive roots α<sup>0</sup>
          … α<sup>n−k−1</sup>:
        </p>
        <p
          class="eq"
          use:tex={'\\begin{gathered} g(x) = \\prod_{i=0}^{n-k-1} \\left(x - \\alpha^{i}\\right) \\\\ c(x) = m(x)\\,x^{n-k} + \\left[\\, m(x)\\,x^{n-k} \\bmod g(x) \\,\\right] \\end{gathered}'}
          data-display="true"
        >
          g(x) = ∏ (x − α^i), c(x) = m(x)·x^(n−k) + [m(x)·x^(n−k) mod g(x)]
        </p>
        <p>
          Every valid block c(x) is a multiple of g(x), so it vanishes at all the roots. Two
          different valid blocks differ in at least <strong>n − k + 1</strong> positions (Reed–Solomon
          codes meet the Singleton bound). If at most t codewords are wrong, the received block is still
          closer to the true block than to any other exactly when
        </p>
        <p
          class="eq"
          use:tex={'2t < d_{\\min} = n - k + 1 \\;\\Longleftrightarrow\\; t \\le \\left\\lfloor \\tfrac{n-k}{2} \\right\\rfloor'}
          data-display="true"
        >
          2t &lt; d_min = n − k + 1 ⇔ t ≤ ⌊(n − k)/2⌋
        </p>
        <p>
          Counting unknowns gives the same answer: each error has two unknowns, where it is and what
          it should be, and the n − k check symbols give n − k equations. An <strong>erasure</strong
          > — a codeword known to be unreadable, like one under a sticker — has a known position, so it
          costs one equation instead of two:
        </p>
        <p
          class="eq"
          use:tex={'2e + f \\le n - k \\qquad (e \\text{ errors}, \\ f \\text{ erasures})'}
          data-display="true"
        >
          2e + f ≤ n − k (e errors, f erasures)
        </p>
      </article>

      <article id="how-decode" class="chapter">
        <h3>
          <span class="cn mono">04</span> Decoding: syndromes, Berlekamp–Massey, Chien, Forney
        </h3>
        <p>
          The received block is r(x) = c(x) + e(x). Evaluating it at the roots of g(x) cancels the
          valid part and leaves only the errors, at unknown positions: an error of value e<sub
            >l</sub
          >
          in the coefficient of x<sup>i</sup> has the locator X<sub>l</sub> = α<sup>i</sup>.
        </p>
        <p
          class="eq"
          use:tex={'\\begin{gathered} S_j = r(\\alpha^{j}) = e(\\alpha^{j}) = \\sum_{l} e_l\\, X_l^{\\,j} \\\\ j = 0, 1, \\dots, n-k-1 \\end{gathered}'}
          data-display="true"
        >
          S_j = r(α^j) = Σ e_l X_l^j
        </p>
        <p>
          <strong>Berlekamp–Massey</strong> finds the shortest linear recurrence that generates the
          syndromes; its connection polynomial is the error locator, whose roots are the inverse
          locators. A <strong>Chien search</strong> simply tries every position.
          <strong>Forney’s formula</strong> then gives each error value from the evaluator Ω(x):
        </p>
        <p
          class="eq"
          use:tex={"\\begin{gathered} \\Lambda(x) = \\prod_{l} \\left(1 - X_l\\, x\\right) \\\\ \\Omega(x) = S(x)\\,\\Lambda(x) \\bmod x^{\\,n-k} \\\\[4pt] e_l = X_l \\, \\frac{\\Omega(X_l^{-1})}{\\Lambda'(X_l^{-1})} \\end{gathered}"}
          data-display="true"
        >
          Λ(x) = ∏ (1 − X_l x), Ω(x) = S(x)Λ(x) mod x^(n−k), e_l = X_l Ω(X_l⁻¹)/Λ′(X_l⁻¹)
        </p>
        <p>
          (QR codes use the roots α<sup>0</sup>, α<sup>1</sup>, …, which is where the leading X<sub
            >l</sub
          >
          comes from; minus signs vanish because 1 + 1 = 0.) Known erasures enter through an erasure locator
          Γ(x) and erasure-adjusted syndromes before Berlekamp–Massey.
        </p>
        <p>
          The decoder knows it has failed when the locator’s degree exceeds what the block can
          afford, or when Λ(x) does not have as many roots among the block’s positions as its
          degree. Very rarely a heavily damaged block lands within t of a <em>different</em> valid
          block and is silently “corrected” to the wrong data. A real reader cannot tell; this page
          can, because it knows the original, and says <strong>Misread</strong>.
        </p>
      </article>

      <article id="how-blocks" class="chapter">
        <h3><span class="cn mono">05</span> Blocks and interleaving</h3>
        <p>
          A Reed–Solomon code over GF(256) is at most 255 symbols long, and the standard keeps
          blocks far shorter so each stays quick to decode. Larger symbols are split into many
          blocks, 1 to 81 depending on version and level, and their codewords are interleaved so
          that a scratch or a tear, which damages neighbouring modules, costs each block only a
          little.
        </p>
        {#if sym}
          <table class="facts">
            <tbody>
              <tr
                ><th scope="row">This code</th><td
                  >version {sym.version}-{sym.level}, {sym.size} × {sym.size} modules</td
                ></tr
              >
              <tr
                ><th scope="row">Blocks</th><td
                  >{sym.layout.group1.blocks} × {sym.layout.group1.dataCodewords} data{sym.layout
                    .group2.blocks
                    ? ` + ${sym.layout.group2.blocks} × ${sym.layout.group2.dataCodewords} data`
                    : ''}, each with {sym.layout.ecCodewordsPerBlock} EC codewords</td
                ></tr
              >
              <tr
                ><th scope="row">Each block fixes</th><td
                  >t = ⌊{sym.layout.ecCodewordsPerBlock}/2⌋ = {Math.floor(
                    sym.layout.ecCodewordsPerBlock / 2,
                  )} errors, or {sym.layout.ecCodewordsPerBlock} erasures</td
                ></tr
              >
              <tr
                ><th scope="row">Whole symbol</th><td
                  >{sym.layout.totalCodewords} codewords: {sym.layout.dataCodewords} data, {sym
                    .layout.totalCodewords - sym.layout.dataCodewords} EC ({Math.round(
                    (100 * (sym.layout.totalCodewords - sym.layout.dataCodewords)) /
                      sym.layout.totalCodewords,
                  )}%)</td
                ></tr
              >
            </tbody>
          </table>
        {/if}
        <p class="aside">
          The level names promise roughly 7, 15, 25 and 30% recovery. A symbol fails as soon as any
          one block fails, so the real limit is the worst block, not the total. For a few of the
          smallest symbols the standard keeps some check codewords as “misdecode protection” and
          lists a slightly lower correction capacity; this decoder, like most, corrects the full
          ⌊d/2⌋.
        </p>
      </article>

      <article id="how-masks" class="chapter">
        <h3><span class="cn mono">06</span> Masks and penalties</h3>
        <p>
          Raw data can contain large blank areas or accidental finder-like shapes. Each of the eight
          masks inverts a different regular pattern of data modules (i = row, j = column). The
          encoder scores all eight with four rules and keeps the lowest total: runs of five or more
          same-coloured modules (N1 = 3 plus 1 per extra module), 2 × 2 single-colour blocks (N2 = 3
          each), 1:1:3:1:1 finder-like runs beside four light modules (N3 = 40 each), and the dark
          share’s distance from 50% (N4 = 10 per 5%).
        </p>
        <div class="tiles">
          {#each maskTiles as t (t.m)}
            <figure class="tile">
              <svg viewBox="0 0 {TILE} {TILE}" aria-hidden="true"
                ><rect width={TILE} height={TILE} fill="#fff" /><path d={t.d} fill="#111" /></svg
              >
              <figcaption><span class="mono">{t.m}</span> {MASK_FORMULAS[t.m]}</figcaption>
            </figure>
          {/each}
        </div>
        <p class="aside">
          Implementations word rule 3 slightly differently (this one follows the standard’s wording
          as Thonky reproduces it, inside the symbol), so two correct encoders may choose different
          masks. Any mask decodes; the format information says which one was used.
        </p>
      </article>

      <article id="how-format" class="chapter">
        <h3><span class="cn mono">07</span> Format and version information</h3>
        <p>
          The level and mask (5 bits) are protected by a (15, 5) BCH code with generator x<sup
            >10</sup
          >
          + x<sup>8</sup> + x<sup>5</sup> + x<sup>4</sup> + x<sup>2</sup> + x + 1 and XORed with
          101010000010010. The 32 possible strings are at least 7 bits apart, so up to 3 wrong bits
          per copy are corrected by choosing the nearest valid string, and there are two copies.
          Versions 7 to 40 also store the version number in an (18, 6) BCH code (generator x<sup
            >12</sup
          >
          + x<sup>11</sup> + x<sup>10</sup> + x<sup>9</sup> + x<sup>8</sup> + x<sup>5</sup> + x<sup
            >2</sup
          > + 1), again twice. If the format information is lost, nothing else can be read: it is the
          one place where a scratch that touches few modules can end everything.
        </p>
      </article>

      <article id="how-quiet" class="chapter">
        <h3><span class="cn mono">08</span> The quiet zone</h3>
        <div class="quiet">
          <div class="quiet-text">
            <p>
              A QR code needs a light margin at least <strong>four modules wide</strong> on every side.
              A reader finds the code by looking for the 1 : 1 : 3 : 1 : 1 profile of the finder patterns;
              text, a frame or a busy background touching the symbol breaks that profile before any decoding
              starts.
            </p>
            <p>
              The quiet zone carries no data and no error correction, so no amount of Reed–Solomon
              can make up for a missing one. The SVG and PNG exports include it; keep it clear when
              you place a code in a design.
            </p>
          </div>
          {#if sym}
            <figure class="qz-fig">
              <svg
                viewBox="-1 -5 {qzTotal + 2} {qzTotal + 6}"
                role="img"
                aria-label="The code with its four-module quiet zone shaded"
              >
                <rect x="0" y="0" width={qzTotal} height={qzTotal} class="qz-band" />
                <rect
                  x={QUIET_ZONE}
                  y={QUIET_ZONE}
                  width={qzTotal - 2 * QUIET_ZONE}
                  height={qzTotal - 2 * QUIET_ZONE}
                  fill="#fff"
                />
                <path d={qzPath} fill="#111" />
                <rect x="0" y="0" width={qzTotal} height={qzTotal} class="qz-edge" />
                <path d="M0 -1.8H{QUIET_ZONE}M0 -2.6v1.6M{QUIET_ZONE} -2.6v1.6" class="qz-dim" />
                <text x={QUIET_ZONE / 2} y="-3.2" text-anchor="middle" class="dim-label">4</text>
              </svg>
              <figcaption>Shaded: the 4-module quiet zone around the symbol.</figcaption>
            </figure>
          {/if}
        </div>
      </article>

      <article id="how-validation" class="chapter">
        <h3><span class="cn mono">09</span> Validation</h3>
        <p>
          A validated tool for what it claims: it encodes standard QR codes and decodes them from a
          module grid, including Reed–Solomon error and erasure correction. The checks run in the
          unit tests and in a larger <span class="mono">npm run validate</span> suite.
        </p>
        <table class="facts validation">
          <tbody>
            <tr
              ><th scope="row">HELLO WORLD 1-Q (Thonky)</th><td
                >13 data and 13 EC codewords exact; mask 6 chosen with penalty 314 (next best mask
                0, 347); format 010111011011010</td
              ></tr
            >
            <tr
              ><th scope="row">HELLO WORLD 1-M (Thonky)</th><td
                >16 data and 10 EC codewords exact, including the first long-division steps</td
              ></tr
            >
            <tr
              ><th scope="row">5-Q, four blocks (Thonky)</th><td
                >all 4 × 18 EC codewords and the full interleaved 134-codeword message exact</td
              ></tr
            >
            <tr
              ><th scope="row">“’Twas brillig” 1-M (Wikiversity)</th><td
                >data and EC codewords exact</td
              ></tr
            >
            <tr
              ><th scope="row">Specification tables</th><td
                >block structure (160 rows), capacities (640 values), alignment centres (39
                versions), 32 format and 34 version strings: all match</td
              ></tr
            >
            <tr
              ><th scope="row">GF(256)</th><td
                >field axioms checked on all 16.7 million triples; 11 generator polynomials match</td
              ></tr
            >
            <tr
              ><th scope="row">Reed–Solomon</th><td
                >10 000 random patterns with 2e + f ≤ n − k: all corrected; 10 000 with t + 1 to t +
                5 errors: all flagged uncorrectable</td
              ></tr
            >
            <tr
              ><th scope="row">Format BCH</th><td
                >all 32 768 possible 15-bit reads: every word within 3 bits of a code decodes to it,
                the rest are rejected</td
              ></tr
            >
            <tr
              ><th scope="row">Interoperability</th><td
                >2000 random messages from this encoder read by jsQR, 2000 from the <span
                  class="mono">qrcode</span
                > package read by this decoder, all versions 1–40: all identical</td
              ></tr
            >
          </tbody>
        </table>
        <p class="aside">
          One finding along the way: jsQR 1.4.0 lists the alignment pattern centres of version 23 as
          6, 30, 54, 74, 102 instead of 6, 30, 54, 78, 102, so it misreads every version-23 symbol
          (from any encoder) and fails on 23-L, where there is too little error correction to absorb
          the misreads.
        </p>
      </article>

      <article id="how-limits" class="chapter">
        <h3><span class="cn mono">10</span> Limitations</h3>
        <ul class="limits">
          <li>
            The decoder starts from a perfect module grid. Real scanners also have to find, sample
            and threshold the code, so they fail earlier than this page suggests, especially when
            finder patterns are damaged.
          </li>
          <li>
            Damage is idealised: torn paper and stickers read as light modules, scratches flip
            modules cleanly. Real damage can read as dark, grey or noise.
          </li>
          <li>
            The encoder writes numeric, alphanumeric and byte segments; it does not write Kanji, ECI
            headers or structured append (the decoder reads all three).
          </li>
          <li>
            Byte mode is UTF-8 without an ECI header, which is what phone readers expect; the 2015
            standard’s default for byte mode is ISO-8859-1.
          </li>
          <li>
            The “true error count” for a failed block comes from comparing with the original, which
            a real reader never has; the decoder itself only knows that the block failed.
          </li>
        </ul>
      </article>
    </div>
  </div>
</section>

<style>
  .how {
    max-width: 1520px;
    margin: 0 auto;
    padding: 72px 0 40px;
    border-top: 1px solid var(--ink);
  }

  .how-head {
    display: grid;
    gap: 10px;
  }

  h2 {
    font-size: clamp(32px, 4vw, 56px);
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.045em;
    max-width: 14em;
  }

  .how-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    column-gap: var(--gutter);
    margin-top: 40px;
  }

  .toc {
    grid-column: 1 / span 3;
  }

  .toc ol {
    position: sticky;
    top: 80px;
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 14px;
  }

  .toc a {
    display: flex;
    gap: 10px;
    min-height: 32px;
    align-items: center;
    color: var(--ink-2);
    text-decoration: none;
  }

  .toc a:hover {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .toc .mono {
    font-size: 11px;
    color: var(--ink-3);
  }

  .body {
    grid-column: 4 / span 8;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 56px;
    min-width: 0;
  }

  .chapter {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    max-width: 46em;
    font-size: 16px;
    line-height: 1.6;
    color: var(--ink-2);
  }

  .chapter strong {
    color: var(--ink);
  }

  h3 {
    display: flex;
    align-items: baseline;
    gap: 14px;
    font-size: 24px;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.02em;
    color: var(--ink);
  }

  .cn {
    font-size: 13px;
    font-weight: 400;
    color: var(--ink-3);
  }

  .eq {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 6px 0;
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 14px;
  }

  .eq :global(.katex) {
    font-size: 1.15em;
  }

  @media (max-width: 480px) {
    .eq :global(.katex) {
      font-size: 1em;
    }
  }

  .eq:global([data-typeset='true']) {
    font-family: inherit;
  }

  sup,
  sub {
    font-size: 0.75em;
    line-height: 0;
  }

  .figure {
    min-width: 0;
    margin-top: 8px;
    padding: 20px;
    border: 1px solid var(--rule);
    background: var(--paper);
  }

  .facts {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .facts th,
  .facts td {
    padding: 9px 0;
    border-top: 1px solid var(--rule);
    text-align: left;
    vertical-align: top;
  }

  .facts th {
    width: 34%;
    padding-right: 16px;
    font-weight: 500;
    color: var(--ink);
  }

  .aside {
    font-size: 14px;
    color: var(--ink-3);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }

  .tile {
    margin: 0;
  }

  .tile svg {
    width: 100%;
    height: auto;
    border: 1px solid var(--ink);
    shape-rendering: crispEdges;
  }

  .tile figcaption {
    margin-top: 6px;
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.4;
    color: var(--ink-2);
  }

  .tile figcaption .mono {
    color: var(--ink);
    font-weight: 600;
  }

  .quiet {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 260px);
    gap: 28px;
    align-items: start;
  }

  .quiet-text {
    display: grid;
    gap: 14px;
  }

  .qz-fig {
    margin: 0;
  }

  .qz-fig svg {
    width: 100%;
    height: auto;
    shape-rendering: crispEdges;
  }

  .qz-band {
    fill: var(--cobalt-soft);
  }

  .qz-edge {
    fill: none;
    stroke: var(--cobalt);
    stroke-width: 0.15;
  }

  .qz-dim {
    fill: none;
    stroke: var(--cobalt);
    stroke-width: 0.18;
  }

  .dim-label {
    font-family: var(--font-mono);
    font-size: 2.4px;
    fill: var(--cobalt);
  }

  .qz-fig figcaption {
    margin-top: 6px;
    font-size: 12px;
    color: var(--ink-3);
  }

  .limits {
    display: grid;
    gap: 10px;
    margin: 0;
    padding-left: 18px;
  }

  @media (max-width: 1099px) {
    .toc {
      display: none;
    }

    .body {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 640px) {
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .quiet {
      grid-template-columns: 1fr;
    }

    .qz-fig {
      max-width: 240px;
    }

    .facts th {
      width: 40%;
    }
  }
</style>
