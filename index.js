const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { detectPlatform } = require('./lib/platformDetector');
const { extractYouTubeVideo } = require('./lib/youtubeExtractor');
const { extractInstagramVideo } = require('./lib/instagramExtractor');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/video-resolver', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`[Backend] Attempting to resolve video from: ${url}`);

    try {
        // Detect platform
        const platform = detectPlatform(url);
        console.log(`[Backend] Detected platform: ${platform}`);

        let result;

        if (platform === 'youtube') {
            result = await extractYouTubeVideo(url);
        } else if (platform === 'instagram') {
            result = await extractInstagramVideo(url);
        } else if (platform === 'facebook') {
            result = await extractFacebookVideo(url);
        } else if (platform === 'direct') {
            // Direct video file URL
            result = {
                qualities: [{ label: 'Direct Download', url }],
                title: 'Direct Video File',
                thumbnailUrl: '',
                platform: 'direct',
            };
        } else {
            throw new Error('Unsupported platform or invalid URL. Please use Facebook, Instagram, YouTube, or a direct video link.');
        }

        return res.json(result);

    } catch (error) {
        console.error(`[Backend] Resolver error: ${error.message}`);
        return res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
    }
});

/**
 * Extract video from Facebook/Instagram posts (original implementation)
 */
async function extractFacebookVideo(url) {
    console.log(`[Facebook] Extracting: ${url}`);

    const pageResponse = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'max-age=0',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        },
        maxRedirects: 10,
        validateStatus: (status) => status < 500,
    });

    if (pageResponse.status !== 200) {
        console.error(`[Facebook] Target page returned status ${pageResponse.status}`);
        throw new Error(`Facebook returned ${pageResponse.status}. They might be blocking the request.`);
    }

    const html = pageResponse.data;
    const qualities = [];

    // 1. HD URL
    const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/);
    const playableHd = html.match(/"playable_url_quality_hd":"([^"]+)"/);
    if (hdMatch || playableHd) {
        const videoUrl = (hdMatch ? hdMatch[1] : playableHd[1]).replace(/\\/g, '');
        qualities.push({ label: 'HD (High Quality)', url: videoUrl });
    }

    // 2. SD URL
    const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/);
    const playableSd = html.match(/"playable_url":"([^"]+)"/);
    if (sdMatch || playableSd) {
        const videoUrl = (sdMatch ? sdMatch[1] : playableSd[1]).replace(/\\/g, '');
        qualities.push({ label: 'SD (Standard Quality)', url: videoUrl });
    }

    // 3. Fallbacks
    const ogMatch = html.match(/property="og:video" content="([^"]+)"/);
    const metaVideo = html.match(/name="twitter:player:stream" content="([^"]+)"/);

    if (ogMatch) {
        qualities.push({ label: 'OG (Original)', url: ogMatch[1].replace(/\\/g, '') });
    }
    if (metaVideo) {
        qualities.push({ label: 'Meta Stream', url: metaVideo[1].replace(/\\/g, '') });
    }

    if (qualities.length === 0) {
        const genericMatch = html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/);
        if (genericMatch) {
            qualities.push({ label: 'Direct MP4', url: genericMatch[0] });
        }
    }

    if (qualities.length === 0) {
        throw new Error('Direct video link not found. Facebook might be blocking the request or the link is private.');
    }

    // Deduplicate qualities by URL
    const uniqueQualities = [];
    const seenUrls = new Set();
    for (const q of qualities) {
        if (!seenUrls.has(q.url)) {
            uniqueQualities.push(q);
            seenUrls.add(q.url);
        }
    }

    // Thumbnail extraction
    let thumbnailUrl = '';
    const ogImage = html.match(/property="og:image" content="([^"]+)"/);
    const twitterImage = html.match(/name="twitter:image" content="([^"]+)"/);
    const posterMatch = html.match(/"preferred_thumbnail_url":"([^"]+)"/);

    if (ogImage) {
        thumbnailUrl = ogImage[1];
    } else if (twitterImage) {
        thumbnailUrl = twitterImage[1];
    } else if (posterMatch) {
        thumbnailUrl = posterMatch[1];
    }

    if (thumbnailUrl) {
        thumbnailUrl = thumbnailUrl.replace(/\\/g, '').replace(/&amp;/g, '&');
        console.log(`[Facebook] Found thumbnail: ${thumbnailUrl.slice(0, 100)}...`);
    }

    console.log(`[Facebook] Found ${uniqueQualities.length} quality options`);

    return {
        qualities: uniqueQualities,
        title: 'Resolved Video',
        thumbnailUrl: thumbnailUrl,
        platform: 'facebook',
    };
}

app.listen(PORT, () => {
    console.log(`Video Resolver Backend running on http://localhost:${PORT}`);
    console.log(`Supported platforms: Facebook, Instagram Reels, YouTube`);
});
