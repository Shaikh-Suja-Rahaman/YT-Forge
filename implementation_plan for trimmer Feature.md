# Video Clipper Feature (Visual Trimmer)

This feature allows users to visually select a specific portion of a video (e.g., a specific scene from a 3-hour movie) and download *only* that portion, saving bandwidth, time, and disk space. It achieves this without requiring complicated logins.

## User Review Required

> [!IMPORTANT]
> **Proposed UI Approach:** I strongly recommend using the **YouTube Privacy Iframe API** over a custom HTML5 player. Extracting raw stream URLs with `yt-dlp` takes 2-5 seconds per click and breaks frequently. The Iframe loads instantly, handles YouTube's quality changing smoothly, and doesn't require a Google login for public videos. Please confirm if this approach works for you.
> **Keyframe Precision:** Please review the "Fast vs Precise" toggle solution in the Edge Cases section below to ensure it aligns with your vision for the user experience.

## Proposed Changes

### Core Logic (yt-dlp Integration)
The core mechanism relies on passing specific section arguments to `yt-dlp`. Requires `ffmpeg` to be accessible on the system.

#### [MODIFY] `src/main.js` (Or Background Engine)
- Update the download function to conditionally inject `--download-sections "*[START]-[END]"` based on user input from the UI.
- Implement conditional logic to handle "Fast" vs "Precise" cut modes based on a UI toggle (adding `--force-keyframes-at-cuts` for precision).

### Frontend UI (React Components)

#### [NEW] `src/components/VideoTrimmer.jsx`
- This component will wrap the YouTube Iframe API (`https://www.youtube-nocookie.com/embed/VIDEO_ID?enablejsapi=1`).
- Contains a dual-handle range slider (e.g., using a library like `react-range`) to represent the video timeline.
- Includes integration to parse video duration from `yt-dlp` metadata to set the slider bounds.

#### [MODIFY] `src/components/DetailsView.jsx`
- Add a "Trim Video" button that expands or opens the `VideoTrimmer` component or modal.
- Add a "Precise Cut (Slower)" toggle switch to pass the respective flag to the backend if trimming is active.

## Smart Fixes for Potential Problems

### 1. The Imprecision of "Fast" Cuts (Keyframe Snapping)
- **Problem:** When downloading a section quickly (stream-copy format), `ffmpeg` cuts at the nearest keyframe, meaning the video might start a few seconds earlier than the user visually selected. Re-encoding perfectly frame-matches but is very slow. 
- **Smart Fix:** Provide a toggle visually in the trimmer UI:
  - **Fast Cut (Default):** "Fast Download (May start a few seconds early)". Uses standard `--download-sections`. 
  - **Precise Cut:** "Precise Download (Slower)". Appends `--force-keyframes-at-cuts` to force a frame-accurate re-encode of the edges.

### 2. Slow Loading Player (Direct Stream Method)
- **Problem:** Using `yt-dlp` to fetch raw `.mp4` / `.m3u8` streams to populate a custom `<video>` player causes a 2-5 second delay before the preview even loads, creating a bad user experience. 
- **Smart Fix:** We use Google's official privacy-enhanced embed domain (`youtube-nocookie.com`). It acts entirely anonymously, doesn't require login, and loads instantly because it's deeply integrated with YouTube's CDN. We layer our custom interactive JS slider on top of this iframe.

### 3. Non-YouTube URLs (TikTok, Twitter, etc.)
- **Problem:** The visual iframe trimmer is strictly for YouTube. Posing a generic iframe over a Twitter video won't work perfectly.
- **Smart Fix:** We parse the URL. If it matches a standard YouTube domain, we display the beautiful visual `VideoTrimmer` component. If it's *not* YouTube, we gracefully fallback and present simple "Start Time" and "End Time" text inputs.

### 4. Age-Restricted & Private Videos
- **Problem:** The YouTube iframe specifically blocks unauthenticated viewing of age-restricted videos. 
- **Smart Fix:** The backend will check the `age_limit` property from `yt-dlp`'s metadata. If it's flagged as age-restricted (> 0), we display a clear warning: *"Age restricted video. Visual preview unavailable. Please enter timestamps manually."* and switch to the text-input UI fallback.

### 5. Future-Proofing (YouTube's API Changes)
- **Problem:** YouTube frequently changes its UI and API. If they ever block or change the iframe embed API, the trimmer preview could break entirely.
- **Smart Fix (The Hybrid Fallback Engine):** To guarantee the trimmer never breaks, we implement a resilient, layered fallback system:
  1. **Primary (Fastest):** Attempt to load the `youtube-nocookie.com` Iframe first. 
  2. **Secondary (Bulletproof):** If the Iframe fails to load (e.g., YouTube blocks it), we programmatically fall back to running `yt-dlp -g` in the background. This fetches the direct, unadulterated stream URL, which we instantly pipe into a native HTML5 `<video>` tag. Because your app already auto-updates `yt-dlp`, this secondary method is **infinitely future-proof**. If YouTube changes its site, `yt-dlp` pushes an update, and your trimmer keeps working automatically without any code changes from you!
  3. **Tertiary (Failsafe):** If both visual methods fail (e.g., severe connection limits), it safely falls back to simple text input fields for Start/End times.

### 6. OS & Environment Agnosticism
- **Problem:** The `--download-sections` feature relies entirely on `ffmpeg` to stitch the chunked data. If `ffmpeg` isn't natively installed on the user's Mac, Windows, or Linux machine, the feature will crash.
- **Smart Fix:** We will integrate `ffmpeg-static-electron` (or similar static binary wrapper) via `npm`. During the build process, this automatically bundles the correct, pre-compiled `ffmpeg` executable for the user's exact Operating System and Architecture (Intel Mac, Apple Silicon, Windows x64, Linux, etc.). Your app remains 100% portable and guaranteed to work on any machine right out of the box.

## Verification Plan

### Manual Verification (The Visual Engines)
- **Test Primary Engine (Iframe):** Verify that clicking "Trim" loads the video autonomously using the `youtube-nocookie` domain and syncs correctly with the UI slider.
- **Test Secondary Engine (YT-DLP Direct Stream):** Programmatically force the app to simulate an Iframe failure (e.g., block the iframe domain). Verify that the app instantly falls back to running `yt-dlp -g`, fetches the raw `.m3u8`/`.mp4` stream, and successfully pipes it into the native HTML5 `<video>` fallback player without requiring a login.
- **Test Tertiary Engine (Text Input):** Test pasting a non-YouTube link to ensure the graceful fallback to "Start Time" / "End Time" text inputs triggers successfully.

### Manual Verification (The Trimmer Core)
- Verify the dual-slider accurately sets the in and out points and reflects the time in `MM:SS` format.
- Verify the toggle "Fast" vs "Precise" passes the right cutting arguments (`--download-sections` vs `--force-keyframes-at-cuts`) to `yt-dlp` in the backend. 
- Test clipping a massive 3-hour video down to a precise 30-second fragment and verify the download is rapid, proving only the specific chunk was downloaded, not the whole file.
