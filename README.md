# Owed: IEP service tracker (prototype)

Helps NYC parents see which IEP services their child actually received and which ones the school still owes, then drafts letters to the school. It also includes a Focus time mode for the child.

**Live link:** https://claude.ai/artifact/1UcT9JBxCPJt6xPzKHtDVe (private until you share it from its page on claude.ai)

## Open it on this computer

Double-click `index.html`. It runs in any browser, with no server and no account. Everything is saved only in that browser.

Click **Try a sample IEP** to see every step filled in for a made-up student. Use the switch at the top right for English, Español or 中文.

## What it does

1. **Your child's IEP:** upload the IEP as a PDF (read on the device, never uploaded) or paste its text. Owed lists each promised service in plain language.
2. **Weekly check-ins:** one tap per service. When a session is missed, the parent picks why: therapist absent, cancelled, child absent, or don't know. These match the reasons the DOE's own system (SESIS) records. Sessions missed because the child was absent are shown separately, because they usually aren't owed.
3. **What's owed:** total time owed, by service and by week.
4. **Letters to the school**, in English, Spanish or Chinese:
   - asking for make-up sessions (and an RSA if the school has no therapist)
   - asking for the school's own session records (SESIS encounter attendance), which parents can see under FERPA
5. **Focus time (for the child):** short timed work rounds, one small step at a time, movement breaks, and stars. It uses simple focus habits, and the app says clearly that it is not a treatment for ADHD.
6. **Practice words (for speech practice at home):** the parent types the words the speech therapist gave, or taps a sound (S, R, L, TH, SH, CH, K, G, F) to load a ready list. The child sees one big word at a time and taps 🔊 to hear it:
   - **Real recordings** of 120 common practice words, from Wikimedia Commons (see `RECORDING-CREDITS.md`). The app shows "🎙 Real recording" or "🤖 Computer voice" so parents know which they hear.
   - Other words use the most natural computer voice the device has.
   - A grown-up taps **Tried it ✓** or **Try again ↺** after each try, so the child can't just tap through. Parents count tries; judging pronunciation stays with the therapist.
   - **Ask the therapist for help:** a ready note in English (with a translation) asking which words to practice, how often, whether the home language is OK, and for a recording.
   - **Microphone check (for when no grown-up can listen):** the child taps 🎤 and says the word. The browser turns it into text, and Owed compares how it *sounds* with the target word, sound by sound. A score of 85% or more counts ("Great job!"), so in short words every sound must be right: "thin," "fink" or "sink" doesn't count for "think," and "wabbit" doesn't count for "rabbit." Owed uses only the browser's top guess, because its lower guesses often include the target word even when the child said something else. Saying the plural ("rabbits") still counts. **Chinese words are checked by sound, not by characters:** each syllable is split into its start sound, vowel part and tone, so a same-sounding character counts (书/输), typed pinyin ("Nihao") matches 你好, but "老丝" for 老师 (sh said as s) or a wrong tone does not pass. Words written in Chinese characters always use the Chinese voice and listener, even if another language is picked, and a tip asks parents to type characters instead of pinyin. 50–85% gets "So close! Listen and try again," and below 50% gets "Let's listen first." After 3 tries the child moves on with "Nice effort!" Parents turn it on, after agreeing that the voice goes to Google (Chrome) or Apple (Safari). Each try is recorded and kept only on the phone, so parents can listen later with **🎧 Listen to practice**. It works only when Owed is on its own website (see `HOSTING.md`). The claude.ai link blocks microphones.

Also: a **Share** button (top of the page and in the footer) with a ready message in English, Spanish or Chinese that includes the website link and nothing about the child. On phones it opens the phone's own share sheet; elsewhere it shows the message with Copy, WhatsApp and email. Back up and restore a record by copy and paste, and an in-page warning if the browser can't save.

**Website:** https://jaydencao2026.github.io/owed/ (see `HOSTING.md` for how it is set up).

## What's inside

| File | What it does |
|---|---|
| `index.html` | The app: screens, words in 3 languages, PDF reading, Focus time |
| `core.js` | The logic: reads services from IEP text, counts missed sessions, writes both letters |
| `audio-data.js` | 120 word recordings and their credits (generated, about 2.3 MB) |
| `pinyin-data.js` | Pinyin and tone for 15,439 Chinese characters, for the Chinese microphone check (generated, 53 KB). Built from the Unicode Consortium's Unihan database, used under the [Unicode License](https://www.unicode.org/license.txt) |
| `RECORDING-CREDITS.md` | Who recorded each word, and the license |
| `HOSTING.md` | How to put Owed on its own free website (needed for the microphone check) |
| `test.js` | Checks the logic. Run with `node test.js` |

## What it costs to run

- **Now: $0.** No server and no paid AI. PDFs are read in the browser with pdf.js, loaded from a free public CDN only when needed.
- **Hosting:** the live link is free. GitHub Pages, Netlify or Cloudflare Pages are free too.
- **Reminders:** free through email or phone notifications. Text messages cost money for each one sent.

## Not built yet

- Reading scanned PDFs and phone photos (needs AI or OCR), and IEPs written in Spanish or Chinese
- Automatic Friday reminders
- Comparing the school's SESIS records with the parent's record inside the app
- More languages: Traditional Chinese, Bengali, Russian, Haitian Creole and others
- Accounts and syncing between phones
- Payment for the PRO case file
