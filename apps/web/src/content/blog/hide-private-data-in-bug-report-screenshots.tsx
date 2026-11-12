import { Code, Note } from "@/components/docs/blocks";
import { Figure } from "@/components/blog/BlogShell";

export default function Post() {
  return (
    <>
      <p>
        A bug report without a screenshot is a guessing game. A bug report <em>with</em> a screenshot is a copy of
        whatever was on your customer&apos;s screen: their customers&apos; e-mail addresses, phone numbers, the card on
        file, a health note typed into a form. That image then sits in your tracker, gets pasted into Slack and ends up
        in an AI assistant&apos;s context.
      </p>
      <p>
        Ozvi&apos;s widget takes the screenshot for the person reporting the bug. It also makes sure the private parts
        never become pixels. This article explains how, and what you can turn up or down.
      </p>

      <Figure src="/blog/screenshot-before.webp" width={1400} height={522} alt="A member list in a sample app with names, e-mail addresses, phone numbers, a card number and a health note, all readable"
        caption="What the customer sees. Everything in this sample app is made up." />
      <Figure src="/blog/screenshot-after.webp" width={1400} height={567} alt="The same page in the screenshot Ozvi sends: e-mails, phone numbers and the card number are solid boxes, form fields show dots"
        caption="What reaches the team: the screenshot exactly as Ozvi stores it." />

      <h2 id="copy">Mask the copy, not the image</h2>
      <p>
        The usual approach is to take a screenshot and blur parts of it afterwards. Blur is a filter on pixels that
        already contain the data, and blurred text can often be reconstructed. Painting a box over the image is better,
        but the original image still exists for a moment, and anything the box misses is gone.
      </p>
      <p>
        Ozvi never has an unmasked image. The widget draws the screenshot from a <strong>copy</strong> of the page (the
        DOM is cloned, then rendered to a canvas). Every element of that copy passes through the masking step before it
        is drawn. The page the person is looking at is never touched, so nothing flickers.
      </p>
      <Code title="packages/widget/src/shot.ts (simplified)" code={`
const image = await domToBlob(document.documentElement, {
  // runs on the clone, before anything is drawn
  onCloneNode: (clone) => maskScreenshot(clone, mode),
});`} />
      <p>
        If masking throws for any reason, there is no screenshot at all. Never an unmasked one.
      </p>

      <h2 id="what">What is covered without any setup</h2>
      <ul>
        <li><strong>Form values.</strong> Every input, textarea and select. A filled field shows a few dots, so the team still sees that something was typed.</li>
        <li><strong>E-mail addresses, phone numbers, IBANs, card numbers and tokens</strong> found in text anywhere on the page. Card numbers are Luhn-checked; phone numbers need 9 to 15 digits, so dates and prices stay readable.</li>
        <li><strong>Anything inside <code>data-ozvi-mask</code></strong>, including images, canvas and video.</li>
      </ul>
      <p>
        Covered text is not removed. Its colour turns transparent and its element gets a solid background, so the
        layout stays exactly the same and the team can still see where things were.
      </p>

      <h2 id="names">Names and other things without a shape</h2>
      <p>
        An e-mail address has a recognisable shape; &ldquo;Amelia Grant&rdquo; does not. For names, notes and anything
        else that is private in your app, add one attribute:
      </p>
      <Code title="HTML" code={`<td data-ozvi-mask>{member.name}</td>`} />

      <h2 id="all">Health care, finance: cover everything</h2>
      <p>
        Some apps should not send any text at all. Turn the default around: everything is covered except what you
        explicitly allow, such as the navigation and the page title.
      </p>
      <Code title="JavaScript" code={`
window.OzviConfig = { mask: "all" };

// and in your markup:
<nav data-ozvi-unmask>…</nav>
<h1 data-ozvi-unmask>Members</h1>`} />
      <p>The team still sees the layout and where something broke, without any of the data.</p>

      <h2 id="rest">The rest of the report</h2>
      <p>
        The screenshot is only one part of what the widget sends. The steps before the report, the failed requests and
        console errors are masked in the browser too, before they are kept in memory. Secrets in addresses (tokens,
        passwords, e-mails in a path or a parameter) are replaced, request headers are never recorded, and request or
        response bodies are kept only for failed requests and only if you turn that on, cut short and masked with the
        same patterns. The Ozvi server masks everything a second time. Bug reports are visible to the person who sent
        them and to your team, nobody else.
      </p>
      <Note title="Where to read more">
        The full list of what a report captures, and every option, is in the <a href="/docs/widget#privacy">widget docs</a>.
        The code is public: <a href="https://github.com/xzamiska/ozvi/blob/main/packages/widget/src/shot-mask.ts">shot-mask.ts</a> (MIT).
      </Note>

      <h2 id="video">See it in 20 seconds</h2>
      <p>
        <a href="https://youtube.com/shorts/ZxlYpgRXcwA">Watch the phone numbers disappear</a> in a short, or the{" "}
        <a href="https://youtu.be/jO6tj-UNZFU">full walkthrough</a>.
      </p>
    </>
  );
}
