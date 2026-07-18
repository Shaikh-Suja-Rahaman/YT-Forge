# Video Trimmer Feature: Analysis & Implementation Plan

This document outlines the analysis of the original trimmer implementation plan, identifies potential loopholes, and proposes a revised, bulletproof approach to building a seamless, "editor-like" visual trimmer for YT-FORGE.

## 1. Analysis of the Original Plan (Loopholes & Gotchas)

The original plan is a great starting point, but it misses a few critical nuances specific to building within an Electron environment.

### 🛑 Identified Loopholes
1. **The "Slider Scale" Problem for Long Videos:** A simple dual-handle slider for a 3-hour movie is practically unusable. Moving the slider by a single pixel could jump the video by 3-5 minutes, making precise cuts impossible.
2. **Missed Electron Superpowers (CORS):** The plan suggests falling back to text inputs for non-YouTube sites because an iframe won't work. However, because YT-FORGE is an **Electron app**, we are not bound by browser CORS policies! We can use `yt-dlp -g` to fetch the raw stream URL and pipe it directly into a native `<video>` tag for *any* site (Twitter, TikTok, etc.) by proxying the stream through the Electron Main Process.
3. **The `ffmpeg` Path Gotcha:** Bundling `ffmpeg-static-electron` is correct, but `yt-dlp` doesn't magically know where it is, especially when packaged inside an Electron `.asar` archive. If we don't explicitly pass the unpacked path via `--ffmpeg-location`, the trimmer will fail in production.
4. **Age-Restricted Videos & Cookies:** If the user has authenticated YT-FORGE (passing cookies to `yt-dlp`), the YouTube Iframe will still block the video (since the Iframe doesn't share yt-dlp's cookies). Instead of falling back to text inputs, we should fall back to the raw stream method, which *will* work.
5. **Live Streams:** `yt-dlp`'s `--download-sections` does not work reliably (or at all) for live streams. The UI needs to detect live streams and explicitly disable the trimmer to prevent crashes.

---

## 2. My Proposed Approach: The "Bulletproof" Architecture

To create a beautiful, seamless, and unbreakable user experience, I propose a **Layered Hybrid Player** combined with a **Precision UI**.

### A. The Backend (Electron Main Process)
- **FFmpeg Integration:** We will use `ffmpeg-static`. In the `electron-builder.yml`, we must configure `asarUnpack: ["**/node_modules/ffmpeg-static/**/*"]` to ensure the binary is accessible to `yt-dlp`.
- **The Stream Proxy:** We will set up a custom Electron protocol (e.g., `ytforge://stream?url=<yt-dlp-url>`). When the frontend requests this, Electron fetches the stream and pipes it back. This completely bypasses CORS, allowing us to build a visual trimmer for **Twitter, TikTok, Instagram, and Age-Restricted YouTube videos** using a native HTML5 video player.

### B. The Player Engine (React)
1. **Layer 1: YouTube Iframe (Fastest):** Used for standard, non-restricted YouTube videos. Loads instantly.
2. **Layer 2: Native HTML5 Proxy (Bulletproof):** If the URL is non-YouTube OR age-restricted, we run `yt-dlp -g` in the background, get the raw `.m3u8`/`.mp4` stream, and feed it to our native `<video>` player via our `ytforge://` proxy.

### C. The Trimmer UI (Visuals & UX)
To make it "pretty as f***" and highly functional:
- **Editor-Like Interface:** A sleek, glassmorphic container hovering over the video details.
- **The Precision Timeline:** Instead of just a slider, we use a custom timeline track.
- **Fine-Tuning Controls:** Next to the Start and End slider handles, we include `-` and `+` micro-adjustment buttons that step the video frame by exactly 0.5 seconds.
- **Tied Inputs:** Beautifully styled text inputs for `HH:MM:SS` that dynamically update as you drag the slider, and vice versa. 

### D. The Download Execution
When the user clicks "Download":
1. We calculate the exact start and end times in seconds.
2. We append `--download-sections "*[START]-[END]"` to the `yt-dlp` arguments.
3. We append `--ffmpeg-location <unpacked_path>`.
4. We conditionally append `--force-keyframes-at-cuts` based on the user's "Fast vs Precise" toggle choice.

---

## 3. Tradeoffs & Decisions

### Fast Cut vs. Precise Cut
- **Decision:** Default to "Fast Cut". 
- **Reasoning:** `yt-dlp` will attempt a stream copy without re-encoding. It is blazing fast but will snap to the nearest keyframe (meaning the video might start 1-3 seconds earlier than selected). Re-encoding ("Precise Cut") on a long, 4K video could take 10+ minutes and max out the user's CPU. We must clearly label the Precise toggle as "Slower/CPU Intensive".

### Thumbnail Filmstrip vs. Smooth UI
- **Decision:** Do NOT include a generated thumbnail filmstrip in the timeline for version 1.
- **Reasoning:** Generating a filmstrip for an online video requires downloading fragments and processing them with ffmpeg, which introduces a 5-10 second loading delay before the UI is usable. It ruins the "seamless" experience. Instead, we rely entirely on the video player instantly seeking to the frame as the user drags the slider.

### App Size vs. Portability
- **Decision:** Bundle `ffmpeg-static`.
- **Reasoning:** It adds ~50MB to the application size. However, the tradeoff is worth it because asking users to manually install `ffmpeg` and add it to their system PATH is the #1 cause of support tickets for downloader apps. Bundling it guarantees it works instantly.

## 4. Open Questions for You

> [!IMPORTANT]
> 1. **UI Real Estate:** Do you want the trimmer to open as a floating Modal over the current view, or expand inline within the `DetailsView`?
> 2. **Default Behavior:** If a user selects a segment, should we automatically toggle the "Precise Cut" if the segment is very short (e.g., under 30 seconds), assuming the re-encode won't take too long?
> 3. **Non-YouTube Platforms:** Do you agree with implementing the Electron proxy to enable visual trimming for Twitter/TikTok/Instagram as well?
