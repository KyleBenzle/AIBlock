# Chrome Web Store submission — copy/paste sheet

## Store listing tab
**Name:** Slop Blocker
**Summary (max 132 chars):**
Like an ad blocker, but for AI slop. Hides AI Overviews, AI-labeled posts, AI images and more. Runs on your computer, no tracking.

**Category:** Productivity   **Language:** English

**Description:**
I got tired of AI junk showing up everywhere, so I made this. It works like an ad blocker, except it goes after AI-generated stuff instead of ads.

What it hides:
- Google AI Overviews, Bing Copilot answers, and the AI answers on DuckDuckGo and Brave
- Amazon's AI review summaries
- Posts the site itself has labeled as AI on Instagram, Facebook, Threads, Pinterest, TikTok and YouTube
- Images with captions like "Illustration: Midjourney" or "AI-generated"
- Images hosted on AI generator sites, or files that say in their own data that they were made by AI
- Comments and reviews that contain obvious chatbot text, like "As an AI language model..."

How it works:
There's a slider with 5 levels. On the lowest, it only removes things that are clearly labeled as AI. Turn it up and it gets more aggressive. Just know that the higher you go, the more likely it is to catch something a real person made.

You can pick what to block (text, images, video, audio, ads, search answers). Blocked stuff can disappear completely, or you can leave a small box in its place with a Reveal button. If it gets something wrong, click "Not AI" and it won't block that item again. If a site acts weird, there's a button to turn it off for just that site.

Being honest about it: no tool can spot all AI content. This one mostly relies on labels and clear signs, so some slop will still get through.

Privacy:
No account and no tracking. Everything happens in your browser. Nothing gets sent anywhere. There's an optional setting to use your own OpenAI, xAI or local Ollama model for extra checks. It's off unless you turn it on.

**Graphics:** icon = public/icon/128.png · screenshots = store/screenshot-1/2/3 (1280x800) · small promo tile = store/promo-small-440x280.png

## Privacy practices tab
**Single purpose:**
Slop Blocker detects and hides AI-generated content on webpages, as an ad blocker does for ads.

**Permission justifications:**
- *storage:* Saves the user's settings, custom rules, block statistics and caches locally.
- *Host permission (<all_urls>):* The extension must read and hide page content on any website the user visits, because AI-generated content can appear on any site. The background worker also uses this access to read provenance metadata from images the page has already loaded, and, only if the user opts in, to contact the AI provider endpoint the user configured.

**Remote code:** No, I am not using remote code. (All JavaScript is bundled in the package; rules are declarative JSON data only.)

**Data usage (check boxes):**
- Website content: YES. It is processed locally to detect AI content. If the user enables the optional AI-assisted detection, text is sent to the AI provider the user chose.
- Every other category: NO.
- Certify: not sold to third parties ✔; not used for unrelated purposes ✔; not used for creditworthiness/lending ✔

**Privacy policy URL:** (public URL where you host store/PRIVACY.md)

## Upload
Package: .output/slop-blocker-0.2.7-chrome.zip
For each new version: bump the version (`npm version x.y.z --no-git-tag-version`), run `npm run zip`, then upload the new zip on the Package tab.
